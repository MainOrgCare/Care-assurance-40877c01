import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

type TabRecord = {
  id: number;
  url: string;
  active: boolean;
};

const STORAGE_KEYS = {
  payload: "caAcpPayload",
  caseInfo: "caAcpCaseInfo",
  queueState: "caAcpQueueState",
  signatureData: "caAcpSignatureData",
  signatureBatchId: "caAcpSignatureBatchId",
  lastError: "caAcpLastError",
  logs: "caAcpLogs",
  runtimeMetrics: "caAcpRuntimeMetrics",
};

const MESSAGE_TYPES = {
  startAutofill: "CA_EXTENSION_START_AUTOFILL",
  stepComplete: "CA_EXTENSION_STEP_COMPLETE",
};

const SESSION_STORAGE_KEYS = [
  STORAGE_KEYS.payload,
  "caAcpDataTimestamp",
  STORAGE_KEYS.caseInfo,
  STORAGE_KEYS.queueState,
  STORAGE_KEYS.signatureData,
  STORAGE_KEYS.signatureBatchId,
  "caAcpUploadedDocuments",
  "caAcpVerificationFields",
];

const FORM_CONFIGS = {
  acp: {
    url: "https://clece.mobizio.com/new_case_form",
    formId: "1048191",
  },
  initialAssessment: {
    url: "https://clece.mobizio.com/new_case_form",
    formId: "1040788",
  },
  emar: {
    url: "https://clece.mobizio.com/new_case_form",
    formId: "1044009",
  },
};

const deepClone = <T>(value: T): T => {
  if (value === undefined || value === null) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
};

const readStore = (store: Map<string, unknown>, keys?: string[] | string | Record<string, unknown>) => {
  if (Array.isArray(keys)) {
    return Object.fromEntries(keys.map((key) => [key, deepClone(store.get(key))]));
  }

  if (typeof keys === "string") {
    return { [keys]: deepClone(store.get(keys)) };
  }

  if (!keys) {
    return Object.fromEntries([...store.entries()].map(([key, value]) => [key, deepClone(value)]));
  }

  if (typeof keys === "object") {
    const entries = Object.entries(keys);
    const out: Record<string, unknown> = {};
    for (const [key, fallback] of entries) {
      out[key] = store.has(key) ? deepClone(store.get(key)) : fallback;
    }
    return out;
  }

  return {};
};

const urlMatchesPattern = (url: string, pattern: string) => {
  if (!pattern) return true;
  if (pattern.endsWith("*")) {
    return url.startsWith(pattern.slice(0, -1));
  }
  return url === pattern;
};

function createBackgroundHarness() {
  const localStore = new Map<string, unknown>();
  const sessionStore = new Map<string, unknown>();

  const storageOnChangedListeners: Array<(changes: Record<string, { oldValue: unknown; newValue: unknown }>, areaName: string) => void> = [];
  const runtimeOnMessageListeners: Array<(message: any, sender: any, sendResponse: (response?: any) => void) => boolean | void> = [];
  const tabsOnUpdatedListeners: Array<(tabId: number, changeInfo: any, tab: TabRecord) => Promise<void> | void> = [];
  const tabsOnRemovedListeners: Array<(tabId: number) => Promise<void> | void> = [];

  const tabs = new Map<number, TabRecord>();
  let nextTabId = 1;

  const pendingTimeouts = new Map<number, () => unknown>();
  let nextTimeoutId = 1;

  const setStore = (store: Map<string, unknown>, areaName: "local" | "session", items: Record<string, unknown>) => {
    const changes: Record<string, { oldValue: unknown; newValue: unknown }> = {};
    for (const [key, rawValue] of Object.entries(items || {})) {
      const oldValue = store.has(key) ? deepClone(store.get(key)) : undefined;
      const value = deepClone(rawValue);
      store.set(key, value);
      changes[key] = { oldValue, newValue: value };
    }

    if (Object.keys(changes).length > 0) {
      for (const listener of storageOnChangedListeners) {
        listener(changes, areaName);
      }
    }
  };

  const chrome = {
    runtime: {
      id: "test-extension-id",
      onSuspend: {
        addListener: () => {},
      },
      onMessage: {
        addListener: (listener: (message: any, sender: any, sendResponse: (response?: any) => void) => boolean | void) => {
          runtimeOnMessageListeners.push(listener);
        },
      },
      sendMessage: (_message: unknown, callback?: (response?: unknown) => void) => {
        callback?.({ ok: true });
      },
      lastError: undefined,
    },
    storage: {
      local: {
        get: (keys: string[] | string | Record<string, unknown>, cb: (items: Record<string, unknown>) => void) => {
          cb(readStore(localStore, keys));
        },
        set: (items: Record<string, unknown>, cb?: () => void) => {
          setStore(localStore, "local", items || {});
          cb?.();
        },
      },
      session: {
        get: (keys: string[] | string | Record<string, unknown>, cb: (items: Record<string, unknown>) => void) => {
          cb(readStore(sessionStore, keys));
        },
        set: (items: Record<string, unknown>, cb?: () => void) => {
          setStore(sessionStore, "session", items || {});
          cb?.();
        },
      },
      onChanged: {
        addListener: (listener: (changes: Record<string, { oldValue: unknown; newValue: unknown }>, areaName: string) => void) => {
          storageOnChangedListeners.push(listener);
        },
      },
    },
    action: {
      setBadgeText: () => {},
      setBadgeBackgroundColor: () => {},
    },
    tabs: {
      onUpdated: {
        addListener: (listener: (tabId: number, changeInfo: any, tab: TabRecord) => Promise<void> | void) => {
          tabsOnUpdatedListeners.push(listener);
        },
      },
      onRemoved: {
        addListener: (listener: (tabId: number) => Promise<void> | void) => {
          tabsOnRemovedListeners.push(listener);
        },
      },
      query: async ({ url }: { url?: string | string[] }) => {
        const patterns = Array.isArray(url) ? url : url ? [url] : [];
        const allTabs = [...tabs.values()];
        if (!patterns.length) return deepClone(allTabs);

        return deepClone(
          allTabs.filter((tab) => patterns.some((pattern) => urlMatchesPattern(tab.url, pattern)))
        );
      },
      update: async (tabId: number, updateProps: { url?: string; active?: boolean }) => {
        const existing = tabs.get(tabId);
        if (!existing) throw new Error(`Tab ${tabId} not found`);

        const updated: TabRecord = {
          ...existing,
          ...(typeof updateProps.url === "string" ? { url: updateProps.url } : {}),
          ...(typeof updateProps.active === "boolean" ? { active: updateProps.active } : {}),
        };
        tabs.set(tabId, updated);
        return deepClone(updated);
      },
      create: async ({ url }: { url: string }) => {
        const tab: TabRecord = {
          id: nextTabId,
          url,
          active: true,
        };
        nextTabId += 1;
        tabs.set(tab.id, tab);
        return deepClone(tab);
      },
      get: async (tabId: number) => {
        const tab = tabs.get(tabId);
        if (!tab) throw new Error(`Tab ${tabId} not found`);
        return deepClone(tab);
      },
      sendMessage: async () => ({ ok: false }),
      remove: async (tabId: number) => {
        tabs.delete(tabId);
        for (const listener of tabsOnRemovedListeners) {
          await listener(tabId);
        }
      },
    },
    scripting: {
      executeScript: async () => {},
    },
    cookies: {
      getAll: async () => [],
    },
  };

  const sandbox: Record<string, unknown> = {
    console,
    URL,
    Date,
    Math,
    JSON,
    Promise,
    Map,
    Set,
    chrome,
    importScripts: () => {},
    setTimeout: (fn: () => unknown) => {
      const id = nextTimeoutId;
      nextTimeoutId += 1;
      pendingTimeouts.set(id, fn);
      return id;
    },
    clearTimeout: (id: number) => {
      pendingTimeouts.delete(id);
    },
    setInterval: () => ({
      unref: () => {},
    }),
    clearInterval: () => {},
    CA_EXTENSION_CONSTANTS: {
      STORAGE_KEYS,
      FORM_CONFIGS,
      MESSAGE_TYPES: {
        ...MESSAGE_TYPES,
        storePayload: "CA_EXTENSION_STORE_PAYLOAD",
        log: "CA_EXTENSION_LOG",
        uploadSignature: "CA_EXTENSION_UPLOAD_SIGNATURE",
        stopAutofill: "CA_EXTENSION_STOP_AUTOFILL",
        clearError: "CA_EXTENSION_CLEAR_ERROR",
        analyzeRisks: "CA_EXTENSION_ANALYZE_RISKS",
        storageGet: "CA_EXTENSION_STORAGE_GET",
        storageSet: "CA_EXTENSION_STORAGE_SET",
      },
      SESSION_STORAGE_KEYS,
    },
  };

  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  const backgroundPath = path.resolve(process.cwd(), "extension", "edge-acp-autofill", "background.js");
  const code = fs.readFileSync(backgroundPath, "utf8");
  vm.runInNewContext(code, sandbox, { filename: backgroundPath });

  const dispatchRuntimeMessage = async (message: any, sender: any = { tab: { id: 999, url: "https://careassurance.uk" } }) => {
    const listener = runtimeOnMessageListeners[0];
    assert.ok(listener, "Expected runtime message listener to be registered");

    return await new Promise<any>((resolve, reject) => {
      let settled = false;
      const sendResponse = (response?: any) => {
        if (settled) return;
        settled = true;
        resolve(response);
      };

      try {
        const returned = listener(message, sender, sendResponse);
        if (returned === false && !settled) {
          settled = true;
          resolve(undefined);
          return;
        }

        setTimeout(() => {
          if (!settled) {
            settled = true;
            resolve(undefined);
          }
        }, 25);
      } catch (error) {
        reject(error);
      }
    });
  };

  const getQueueState = () =>
    deepClone(
      (sessionStore.get(STORAGE_KEYS.queueState) ??
        localStore.get(STORAGE_KEYS.queueState) ??
        null) as Record<string, unknown> | null
    );

  const setPayload = (payload: Record<string, unknown>) => {
    setStore(sessionStore, "session", {
      [STORAGE_KEYS.payload]: payload,
    });
  };

  const getSingleTrackedTabId = () => {
    const entries = [...tabs.values()];
    assert.equal(entries.length, 1, "Expected one tracked autofill tab");
    return entries[0].id;
  };

  const setTabUrl = async (tabId: number, url: string) => {
    await chrome.tabs.update(tabId, { url, active: true });
  };

  const emitTabUpdated = async (tabId: number, url: string) => {
    const tab = tabs.get(tabId);
    assert.ok(tab, `Tab ${tabId} must exist`);
    tab.url = url;
    tabs.set(tabId, tab);

    const snapshot = deepClone(tab);
    for (const listener of tabsOnUpdatedListeners) {
      await listener(tabId, { status: "complete" }, snapshot);
    }
  };

  const runScheduledTimeouts = async () => {
    let cycles = 0;
    while (pendingTimeouts.size > 0 && cycles < 10) {
      const callbacks = [...pendingTimeouts.values()];
      pendingTimeouts.clear();
      for (const callback of callbacks) {
        await callback();
      }
      cycles += 1;
    }
  };

  return {
    setPayload,
    dispatchRuntimeMessage,
    getQueueState,
    getSingleTrackedTabId,
    emitTabUpdated,
    setTabUrl,
    runScheduledTimeouts,
  };
}

test("ACP queue does not double-advance when stepComplete and success-page signals both arrive", async () => {
  const harness = createBackgroundHarness();
  harness.setPayload({
    formType: "acp",
    assessments: [{ id: 1 }, { id: 2 }, { id: 3 }],
  });

  const start = await harness.dispatchRuntimeMessage({
    type: MESSAGE_TYPES.startAutofill,
    caseId: "144173",
    serviceDataGroupId: "1017650",
  });
  assert.equal(start?.ok, true);

  const queueState = harness.getQueueState();
  assert.ok(queueState, "Queue state should exist after start");
  assert.equal(queueState?.currentIndex, 0);

  const tabId = harness.getSingleTrackedTabId();

  const stepComplete = await harness.dispatchRuntimeMessage({
    type: MESSAGE_TYPES.stepComplete,
    currentIndex: 0,
    batchId: queueState?.batchId,
  });
  assert.equal(stepComplete?.ok, true);
  assert.equal(harness.getQueueState()?.currentIndex, 1);

  await harness.emitTabUpdated(tabId, "https://clece.mobizio.com/case_form_success?caseId=144173");
  await harness.setTabUrl(tabId, "https://clece.mobizio.com/new_case_form?caseId=144173&serviceDataGroupId=1017650&formId=1048191");
  await harness.runScheduledTimeouts();

  assert.equal(
    harness.getQueueState()?.currentIndex,
    1,
    "Fallback should not advance when the tab has already moved back to a form page"
  );
});

test("ACP success-page fallback advances queue when stepComplete is missing", async () => {
  const harness = createBackgroundHarness();
  harness.setPayload({
    formType: "acp",
    assessments: [{ id: 1 }, { id: 2 }, { id: 3 }],
  });

  const start = await harness.dispatchRuntimeMessage({
    type: MESSAGE_TYPES.startAutofill,
    caseId: "144173",
    serviceDataGroupId: "1017650",
  });
  assert.equal(start?.ok, true);

  const tabId = harness.getSingleTrackedTabId();
  await harness.emitTabUpdated(tabId, "https://clece.mobizio.com/case_form_success?caseId=144173");
  await harness.runScheduledTimeouts();

  assert.equal(
    harness.getQueueState()?.currentIndex,
    1,
    "Fallback should advance to the next assessment when explicit stepComplete is missing"
  );
});

test("ACP ignores duplicate stepComplete events for the same batch/index", async () => {
  const harness = createBackgroundHarness();
  harness.setPayload({
    formType: "acp",
    assessments: [{ id: 1 }, { id: 2 }, { id: 3 }],
  });

  const start = await harness.dispatchRuntimeMessage({
    type: MESSAGE_TYPES.startAutofill,
    caseId: "144173",
    serviceDataGroupId: "1017650",
  });
  assert.equal(start?.ok, true);

  const initialQueue = harness.getQueueState();
  assert.ok(initialQueue?.batchId, "Expected a batchId to be set");

  const first = await harness.dispatchRuntimeMessage({
    type: MESSAGE_TYPES.stepComplete,
    currentIndex: 0,
    batchId: initialQueue?.batchId,
  });
  assert.equal(first?.ok, true);
  assert.equal(harness.getQueueState()?.currentIndex, 1);

  const duplicate = await harness.dispatchRuntimeMessage({
    type: MESSAGE_TYPES.stepComplete,
    currentIndex: 0,
    batchId: initialQueue?.batchId,
  });
  assert.equal(duplicate?.ok, true);
  assert.equal(
    harness.getQueueState()?.currentIndex,
    1,
    "Second stepComplete for the same index must be ignored"
  );
});
