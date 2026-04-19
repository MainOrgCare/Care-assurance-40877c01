importScripts("constants.js");

const {
  STORAGE_KEYS,
  FORM_CONFIGS,
  MESSAGE_TYPES,
  SESSION_STORAGE_KEYS = [],
  getRuntimeConfig: getSharedRuntimeConfig,
  applyRuntimeConfig: applySharedRuntimeConfig,
} = self.CA_EXTENSION_CONSTANTS;

const API_PROXY_TYPE = "CA_API_PROXY_REQUEST";

// ============================================================================
// MV3 SERVICE WORKER KEEP-ALIVE
// Prevents premature termination during long-running batch autofill operations
// ============================================================================

let keepAliveTimer = null;
let pendingFormCompletionFallback = null;
const recentAdvanceKeys = new Map();
let runtimeConfigCache = typeof getSharedRuntimeConfig === "function" ? getSharedRuntimeConfig() : null;

const getDefaultWorkspaceOriginHost = () =>
  String(runtimeConfigCache?.careAssurance?.defaultOriginHost || "careassurance.uk").trim() || "careassurance.uk";

const getKeepAliveIntervalMs = () =>
  Number(runtimeConfigCache?.background?.keepAliveIntervalMs || 25000);

const getFormCompletionFallbackDelayMs = () =>
  Number(runtimeConfigCache?.background?.formCompletionFallbackDelayMs || 6000);

const getAdvanceDedupeWindowMs = () =>
  Number(runtimeConfigCache?.background?.advanceDedupeWindowMs || 120000);

const buildAdvanceKey = (batchId, index) => {
  if (!Number.isInteger(index)) return null;
  return `${batchId || "legacy"}:${index}`;
};

const clearStaleAdvanceKeys = () => {
  const now = Date.now();
  for (const [key, timestamp] of recentAdvanceKeys.entries()) {
    if (now - timestamp > getAdvanceDedupeWindowMs()) {
      recentAdvanceKeys.delete(key);
    }
  }
};

const clearAdvanceDedupeState = () => {
  recentAdvanceKeys.clear();
};

function startKeepAlive() {
  if (keepAliveTimer) return;
  keepAliveTimer = setInterval(() => {
    // Self-ping to reset the MV3 inactivity timer
    chrome.runtime.sendMessage({ type: "CA_KEEP_ALIVE_PING" }, () => {
      if (chrome.runtime.lastError) { /* expected when popup is closed */ }
    });
  }, getKeepAliveIntervalMs());
  console.log("[CA Extension] Keep-alive started");
}

function stopKeepAlive() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
    console.log("[CA Extension] Keep-alive stopped");
  }
}

chrome.runtime.onSuspend?.addListener(() => {
  stopKeepAlive();
});

// ============================================================================

// Track tabs with content-app.js ready
const contentScriptReadyTabs = new Map(); // normalized host -> tabId

const normalizeOriginHost = (value) => {
  if (!value) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  try {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      return new URL(raw).host.toLowerCase();
    }
    return raw.replace(/^\/+/, "").replace(/\/+$/, "").toLowerCase();
  } catch {
    return raw.replace(/^\/+/, "").replace(/\/+$/, "").toLowerCase();
  }
};

const getReadyHostCandidates = (targetOrigin) => {
  const normalized = normalizeOriginHost(targetOrigin);
  if (!normalized) return [];
  const candidates = [normalized];
  if (normalized.startsWith("www.")) {
    candidates.push(normalized.slice(4));
  } else {
    candidates.push(`www.${normalized}`);
  }
  return Array.from(new Set(candidates));
};

const pickFirstNonEmptyPayloadValue = (...values) => {
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) return normalized;
  }
  return "";
};

const buildCaseInfoFromPayload = (payload, existingCaseInfo = null) => {
  if (!payload || typeof payload !== "object") return existingCaseInfo || null;

  const existingCaseId = String(existingCaseInfo?.caseId || "").trim();
  const existingServiceDataGroupId = String(existingCaseInfo?.serviceDataGroupId || "").trim();

  const caseId = pickFirstNonEmptyPayloadValue(
    payload.caseId,
    payload.acpId,
    payload.accessCarePlanningId,
    payload.serviceUser?.acpId,
    payload.serviceUser?.accessCarePlanningId,
    payload.caseInfo?.caseId,
    existingCaseId
  );
  const serviceDataGroupId = pickFirstNonEmptyPayloadValue(
    payload.serviceDataGroupId,
    payload.caseInfo?.serviceDataGroupId,
    existingServiceDataGroupId
  );

  if (!caseId) {
    return existingCaseInfo || null;
  }

  return {
    caseId,
    serviceDataGroupId,
  };
};

const shouldBypassContentRelay = (workspaceOrigin, apiOrigin) => {
  const workspaceHost = normalizeOriginHost(workspaceOrigin);
  const apiHost = normalizeOriginHost(apiOrigin);
  return Boolean(workspaceHost && apiHost && workspaceHost !== apiHost);
};

const sessionStorageKeySet = new Set(SESSION_STORAGE_KEYS.filter(Boolean));
const sessionStorageArea = chrome.storage?.session && typeof chrome.storage.session.get === "function"
  ? chrome.storage.session
  : chrome.storage.local;

const getStored = (keys) =>
  new Promise((resolve) => {
    const keyList = Array.isArray(keys) ? keys.filter(Boolean) : [keys].filter(Boolean);
    if (!keyList.length) {
      resolve({});
      return;
    }

    const sessionKeys = keyList.filter((key) => sessionStorageKeySet.has(key));
    const localKeys = keyList.filter((key) => !sessionStorageKeySet.has(key));

    Promise.all([
      sessionKeys.length
        ? new Promise((innerResolve) => sessionStorageArea.get(sessionKeys, (items) => innerResolve(items || {})))
        : Promise.resolve({}),
      localKeys.length
        ? new Promise((innerResolve) => chrome.storage.local.get(localKeys, (items) => innerResolve(items || {})))
        : Promise.resolve({}),
    ]).then(([sessionItems, localItems]) => {
      resolve({ ...localItems, ...sessionItems });
    });
  });

const setStored = (items) =>
  new Promise((resolve) => {
    const entries = Object.entries(items || {}).filter(([key]) => Boolean(key));
    if (!entries.length) {
      resolve();
      return;
    }

    const sessionItems = Object.fromEntries(entries.filter(([key]) => sessionStorageKeySet.has(key)));
    const localItems = Object.fromEntries(entries.filter(([key]) => !sessionStorageKeySet.has(key)));

    Promise.all([
      Object.keys(sessionItems).length
        ? new Promise((innerResolve) => sessionStorageArea.set(sessionItems, () => innerResolve()))
        : Promise.resolve(),
      Object.keys(localItems).length
        ? new Promise((innerResolve) => chrome.storage.local.set(localItems, () => innerResolve()))
        : Promise.resolve(),
    ]).then(() => resolve());
  });

const hydrateRuntimeConfigCache = async () => {
  try {
    const stored = await getStored([STORAGE_KEYS.runtimeConfig]);
    runtimeConfigCache = typeof applySharedRuntimeConfig === "function"
      ? applySharedRuntimeConfig(stored?.[STORAGE_KEYS.runtimeConfig] || null)
      : stored?.[STORAGE_KEYS.runtimeConfig] || runtimeConfigCache;
  } catch {
    runtimeConfigCache = typeof getSharedRuntimeConfig === "function" ? getSharedRuntimeConfig() : runtimeConfigCache;
  }
  return runtimeConfigCache;
};

void hydrateRuntimeConfigCache();

const RUNTIME_METRICS_FLUSH_DELAY_MS = 900;
const WORKER_HEARTBEAT_INTERVAL_MS = 30_000;

const getDefaultRuntimeMetrics = () => ({
  proxyRequests: 0,
  proxySuccesses: 0,
  proxyFailures: 0,
  proxyRetries: 0,
  autofillStarts: 0,
  autofillStops: 0,
  contentReadySignals: 0,
  lastProxyEndpoint: null,
  lastProxyMethod: null,
  lastRequestId: null,
  lastProxyStatus: null,
  lastTargetOrigin: null,
  lastError: null,
  lastErrorAt: null,
  workerStartedAt: null,
  lastHeartbeatAt: null,
  heartbeatCount: 0,
  lastActivityAt: null,
  lastActivityType: null,
  lastUpdatedAt: null,
});

let runtimeMetricsCache = null;
let runtimeMetricsHydrationPromise = null;
let runtimeMetricsFlushTimer = null;

const hydrateRuntimeMetricsCache = async () => {
  if (runtimeMetricsCache) {
    return runtimeMetricsCache;
  }
  if (runtimeMetricsHydrationPromise) {
    return runtimeMetricsHydrationPromise;
  }
  runtimeMetricsHydrationPromise = getStored([STORAGE_KEYS.runtimeMetrics])
    .then((stored) => {
      const metrics = stored?.[STORAGE_KEYS.runtimeMetrics];
      runtimeMetricsCache = {
        ...getDefaultRuntimeMetrics(),
        ...(metrics && typeof metrics === "object" ? metrics : {}),
      };
      return runtimeMetricsCache;
    })
    .finally(() => {
      runtimeMetricsHydrationPromise = null;
    });
  return runtimeMetricsHydrationPromise;
};

const flushRuntimeMetrics = async () => {
  if (!runtimeMetricsCache) {
    return;
  }
  await setStored({
    [STORAGE_KEYS.runtimeMetrics]: {
      ...runtimeMetricsCache,
      lastUpdatedAt: new Date().toISOString(),
    },
  });
};

const scheduleRuntimeMetricsFlush = () => {
  if (runtimeMetricsFlushTimer) {
    return;
  }
  runtimeMetricsFlushTimer = setTimeout(() => {
    runtimeMetricsFlushTimer = null;
    flushRuntimeMetrics().catch((error) => {
      console.warn("[CA Extension] Failed to flush runtime metrics:", error);
    });
  }, RUNTIME_METRICS_FLUSH_DELAY_MS);
};

const updateRuntimeMetrics = async (updater, options = {}) => {
  const current = await hydrateRuntimeMetricsCache();
  const next = typeof updater === "function" ? updater(current) : current;
  runtimeMetricsCache = {
    ...getDefaultRuntimeMetrics(),
    ...(next || current || {}),
    lastUpdatedAt: new Date().toISOString(),
  };
  if (options.flushImmediately) {
    await flushRuntimeMetrics();
    return;
  }
  scheduleRuntimeMetricsFlush();
};

const markRuntimeActivity = (activityType, options = {}) =>
  updateRuntimeMetrics((metrics) => ({
    ...metrics,
    lastActivityAt: new Date().toISOString(),
    lastActivityType: activityType || metrics.lastActivityType || "activity",
  }), options);

const recordHeartbeat = () =>
  updateRuntimeMetrics((metrics) => ({
    ...metrics,
    lastHeartbeatAt: new Date().toISOString(),
    heartbeatCount: (metrics.heartbeatCount || 0) + 1,
  }));

updateRuntimeMetrics((metrics) => ({
  ...metrics,
  workerStartedAt: metrics.workerStartedAt || new Date().toISOString(),
  lastActivityAt: new Date().toISOString(),
  lastActivityType: "startup",
}), { flushImmediately: true }).catch((error) => {
  console.warn("[CA Extension] Failed to initialize runtime metrics:", error);
});

const heartbeatTimer = setInterval(() => {
  recordHeartbeat().catch((error) => {
    console.warn("[CA Extension] Failed to record heartbeat:", error);
  });
}, WORKER_HEARTBEAT_INTERVAL_MS);

if (typeof heartbeatTimer?.unref === "function") {
  heartbeatTimer.unref();
}

const buildFormUrl = (formType, caseId, serviceDataGroupId, payload) => {
  const config = FORM_CONFIGS[formType] || FORM_CONFIGS.acp;
  const baseUrl = payload?.formUrl || config.url;
  const url = new URL(baseUrl);
  url.searchParams.set("caseId", caseId);
  url.searchParams.set("serviceDataGroupId", serviceDataGroupId);
  const formId = payload?.formId || config.formId;
  if (formId) {
    url.searchParams.set("formId", formId);
  }
  return url.toString();
};

const clearLastError = () => setStored({ [STORAGE_KEYS.lastError]: null });

const setLastError = async (error) => {
  const message = typeof error === "string" ? error : error?.message || "Unknown error";
  await setStored({ [STORAGE_KEYS.lastError]: message });
  await updateRuntimeMetrics((metrics) => ({
    ...metrics,
    lastError: message,
    lastErrorAt: new Date().toISOString(),
  }), { flushImmediately: true });
};

/** Update the extension badge to show autofill progress */
const updateBadge = (current, total) => {
  if (total > 0) {
    chrome.action.setBadgeText({ text: `${current}/${total}` });
    chrome.action.setBadgeBackgroundColor({ color: "#335299" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
};

/** Clear badge when autofill completes or stops */
const clearBadge = () => {
  chrome.action.setBadgeText({ text: "" });
};

const startAutofill = async (caseId, serviceDataGroupId) => {
  startKeepAlive(); // Prevent MV3 worker from dying during batch
  clearPendingFormCompletionFallback();
  clearAdvanceDedupeState();

  const { caAcpPayload } = await getStored([STORAGE_KEYS.payload]);
  if (!caAcpPayload) {
    stopKeepAlive();
    throw new Error("No payload stored yet.");
  }
  const formType = caAcpPayload.formType || "acp";

  // Validate payload structure before starting
  if (formType === "acp") {
    if (!Array.isArray(caAcpPayload.assessments)) {
      stopKeepAlive();
      throw new Error("No assessments payload stored yet.");
    }
    if (caAcpPayload.assessments.length === 0) {
      stopKeepAlive();
      throw new Error("Assessment list is empty — nothing to autofill.");
    }
  }
  if (formType === "initialAssessment" && !caAcpPayload.initialAssessmentData && !caAcpPayload.data) {
    stopKeepAlive();
    throw new Error("No initial assessment data stored yet.");
  }

  const total = formType === "acp" ? caAcpPayload.assessments.length : 1;
  await setStored({
    [STORAGE_KEYS.caseInfo]: { caseId, serviceDataGroupId },
    [STORAGE_KEYS.queueState]: {
      currentIndex: 0,
      total,
      formType,
      batchId: `${Date.now()}`,
    },
  });
  await clearLastError();
  await updateRuntimeMetrics((metrics) => ({
    ...metrics,
    autofillStarts: (metrics.autofillStarts || 0) + 1,
  }));
  updateBadge(1, total);
};

const openNextForm = async (options = {}) => {
  const expectedIndex = Number.isInteger(options?.expectedIndex) ? Number(options.expectedIndex) : null;
  const expectedBatchId = options?.expectedBatchId ? String(options.expectedBatchId) : null;
  const source = options?.source || "unknown";

  const { caAcpPayload, caAcpCaseInfo, caAcpQueueState } = await getStored([
    STORAGE_KEYS.payload,
    STORAGE_KEYS.caseInfo,
    STORAGE_KEYS.queueState,
  ]);

  if (!caAcpPayload || !caAcpCaseInfo || !caAcpQueueState) return;

  if (expectedBatchId && caAcpQueueState.batchId && String(caAcpQueueState.batchId) !== expectedBatchId) {
    console.log(
      `[ACP Extension] Ignoring stale ${source} advance for batch ${expectedBatchId}; active batch is ${caAcpQueueState.batchId}`
    );
    return;
  }

  if (Number.isInteger(expectedIndex) && Number(caAcpQueueState.currentIndex) !== expectedIndex) {
    console.log(
      `[ACP Extension] Ignoring stale ${source} advance for index ${expectedIndex}; active index is ${caAcpQueueState.currentIndex}`
    );
    return;
  }

  const activeBatchId = caAcpQueueState.batchId
    ? String(caAcpQueueState.batchId)
    : expectedBatchId || "legacy";
  const advanceKey = buildAdvanceKey(activeBatchId, expectedIndex);

  if (advanceKey) {
    clearStaleAdvanceKeys();
    const lastAdvancedAt = recentAdvanceKeys.get(advanceKey);
    if (lastAdvancedAt && Date.now() - lastAdvancedAt <= getAdvanceDedupeWindowMs()) {
      console.log(`[ACP Extension] Ignoring duplicate ${source} advance for ${advanceKey}`);
      return;
    }
    recentAdvanceKeys.set(advanceKey, Date.now());
  }

  try {
    const formType = caAcpQueueState.formType || caAcpPayload.formType || "acp";
  
    // For non-acp form types (emar, initialAssessment), clear after single form
    if (formType !== "acp") {
      await setStored({
        [STORAGE_KEYS.queueState]: null,
        [STORAGE_KEYS.payload]: null,
        [STORAGE_KEYS.caseInfo]: null,
        [STORAGE_KEYS.signatureData]: null,
        [STORAGE_KEYS.signatureBatchId]: null,
      });
      stopKeepAlive();
      clearBadge();
      return;
    }
    const nextIndex = caAcpQueueState.currentIndex + 1;
    if (nextIndex >= caAcpQueueState.total) {
      await setStored({
        [STORAGE_KEYS.queueState]: null,
        [STORAGE_KEYS.payload]: null,
        [STORAGE_KEYS.caseInfo]: null,
        [STORAGE_KEYS.signatureData]: null,
        [STORAGE_KEYS.signatureBatchId]: null,
      });
      stopKeepAlive();
      clearBadge();
      return;
    }

    await setStored({
      [STORAGE_KEYS.queueState]: {
        ...caAcpQueueState,
        currentIndex: nextIndex,
      },
    });
    updateBadge(nextIndex + 1, caAcpQueueState.total);

    const url = buildFormUrl(formType, caAcpCaseInfo.caseId, caAcpCaseInfo.serviceDataGroupId, caAcpPayload);
    await reuseOrCreateTab(url);
  } catch (error) {
    if (advanceKey) {
      recentAdvanceKeys.delete(advanceKey);
    }
    throw error;
  }
};

const isMobizioFormPageUrl = (url) =>
  Boolean(url && url.includes("new_case_form") && url.includes("formId="));

const isMobizioSuccessPageUrl = (url) =>
  Boolean(
    url &&
      (url.includes("case_form_success") || url.includes("case_data_group") || url.includes("/cases/"))
  );

const clearPendingFormCompletionFallback = () => {
  if (pendingFormCompletionFallback?.timer) {
    clearTimeout(pendingFormCompletionFallback.timer);
  }
  pendingFormCompletionFallback = null;
};

const scheduleFormCompletionFallback = (queueSnapshot, completionContext = {}) => {
  const snapshotIndex = Number.isInteger(queueSnapshot?.currentIndex)
    ? Number(queueSnapshot.currentIndex)
    : null;

  if (!Number.isInteger(snapshotIndex)) return;

  const snapshotBatchId = queueSnapshot?.batchId ? String(queueSnapshot.batchId) : null;
  const fallbackKey = `${snapshotBatchId || "legacy"}:${snapshotIndex}`;

  if (pendingFormCompletionFallback?.key === fallbackKey) return;

  clearPendingFormCompletionFallback();
  const timer = setTimeout(async () => {
    pendingFormCompletionFallback = null;

    try {
      const { caAcpQueueState } = await getStored([STORAGE_KEYS.queueState]);
      if (!caAcpQueueState) return;
      if ((caAcpQueueState.formType || "acp") !== "acp") return;
      if (snapshotBatchId && caAcpQueueState.batchId && String(caAcpQueueState.batchId) !== snapshotBatchId) return;
      if (Number(caAcpQueueState.currentIndex) !== snapshotIndex) return;

      const completionTabId = Number.isInteger(completionContext?.tabId)
        ? Number(completionContext.tabId)
        : null;

      if (Number.isInteger(completionTabId)) {
        const currentTab = await chrome.tabs.get(completionTabId).catch(() => null);
        const currentUrl = currentTab?.url || "";
        if (isMobizioFormPageUrl(currentUrl) || !isMobizioSuccessPageUrl(currentUrl)) {
          // Tab has moved on from the captured success state, so this fallback is stale.
          return;
        }
      }

      console.log(
        `[ACP Extension] Step-complete not observed for ${fallbackKey}; applying success-page fallback advance`
      );

      await openNextForm({
        source: "success-page-fallback",
        expectedIndex: snapshotIndex,
        expectedBatchId: snapshotBatchId,
      });
    } catch (error) {
      console.warn("[ACP Extension] Success-page fallback advance failed:", error?.message || error);
    }
  }, FORM_COMPLETION_FALLBACK_DELAY_MS);
  }, getFormCompletionFallbackDelayMs());

  pendingFormCompletionFallback = {
    key: fallbackKey,
    timer,
  };
};

const stopAutofill = async () => {
  stopKeepAlive();
  clearPendingFormCompletionFallback();
  clearAdvanceDedupeState();
  // Clear ALL PII-containing data when stopping — not just queueState
  // This prevents sensitive care data from persisting in extension storage
  await setStored({
    [STORAGE_KEYS.queueState]: null,
    [STORAGE_KEYS.payload]: null,
    [STORAGE_KEYS.caseInfo]: null,
    [STORAGE_KEYS.signatureData]: null,
    [STORAGE_KEYS.signatureBatchId]: null,
  });
  await updateRuntimeMetrics((metrics) => ({
    ...metrics,
    autofillStops: (metrics.autofillStops || 0) + 1,
  }));
  clearBadge();
};

let activeAutofillTabId = null;

const reuseOrCreateTab = async (url) => {
  // Try to reuse the tracked tab first
  if (activeAutofillTabId) {
    try {
      await chrome.tabs.update(activeAutofillTabId, { url, active: true });
      return;
    } catch (e) {
      // Tab might have been closed
      activeAutofillTabId = null;
    }
  }
  
  // Fall back to finding any matching tab
  const tabs = await chrome.tabs.query({ url: `${FORM_CONFIGS.acp.url}*` });
  if (tabs.length > 0) {
    activeAutofillTabId = tabs[0].id;
    await chrome.tabs.update(tabs[0].id, { url, active: true });
    return;
  }
  
  // Create new tab and track it
  const newTab = await chrome.tabs.create({ url });
  activeAutofillTabId = newTab.id;
};

// Listen for tab updates to detect form submission completion
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tabId !== activeAutofillTabId) return;
  if (changeInfo.status !== 'complete') return;
  
  // Check if we navigated away from the form (submission complete)
  const { caAcpQueueState, caAcpPayload } = await getStored([STORAGE_KEYS.queueState, STORAGE_KEYS.payload]);
  if (!caAcpQueueState || !caAcpPayload) return;
  
  const formType = caAcpQueueState.formType || 'acp';
  if (formType !== 'acp') return;
  
  // If we're on a success/confirmation page (not the form page), advance to next
  const isSuccessPage = isMobizioSuccessPageUrl(tab.url || "");

  if (isSuccessPage && caAcpQueueState.currentIndex + 1 < caAcpQueueState.total) {
    // Use success-page detection only as a fallback when explicit step-complete doesn't arrive.
    scheduleFormCompletionFallback(caAcpQueueState, {
      tabId,
      url: tab.url || "",
    });
  }
});

const buildTargetPatterns = (targetOrigin) => {
  const normalized = String(targetOrigin || "").trim();
  if (!normalized) {
    const fallback = getDefaultWorkspaceOriginHost();
    return buildTargetPatterns(fallback);
  }
  if (normalized.includes("localhost") || normalized.includes("127.0.0.1")) {
    return [`http://${normalized}/*`];
  }
  if (normalized.includes("onrender.com")) {
    return [`https://${normalized}/*`];
  }
  return [`https://${normalized}/*`, `https://www.${normalized}/*`];
};

const findContentScriptTab = async (targetOrigin) => {
  for (const readyHost of getReadyHostCandidates(targetOrigin)) {
    const readyTabId = contentScriptReadyTabs.get(readyHost);
    if (!readyTabId) continue;
    try {
      const tab = await chrome.tabs.get(readyTabId);
      const currentHost = normalizeOriginHost(tab?.url);
      if (tab?.id && currentHost && currentHost.includes(readyHost.replace(/^www\./, ""))) {
        console.log(`[CA Extension] Reusing ready content script tab ${tab.id} for ${readyHost}`);
        return tab.id;
      }
    } catch {
      // Tab was closed or inaccessible — clear stale mapping.
    }
    contentScriptReadyTabs.delete(readyHost);
  }

  const patterns = buildTargetPatterns(targetOrigin);
  console.log(`[CA Extension] Searching tabs with patterns:`, patterns);
  for (const pattern of patterns) {
    try {
      const tabs = await chrome.tabs.query({ url: pattern });
      console.log(`[CA Extension] Pattern ${pattern}: found ${tabs.length} tabs`);
      if (tabs.length > 0) {
        const activeTab = tabs.find((tab) => tab.active) || tabs[0];
        console.log(`[CA Extension] Using tab ${activeTab.id}: ${activeTab.url}`);
        const tabHost = normalizeOriginHost(activeTab?.url);
        if (tabHost && activeTab?.id) {
          contentScriptReadyTabs.set(tabHost, activeTab.id);
        }
        return activeTab.id;
      }
    } catch (error) {
      console.warn(`[CA Extension] Tab query failed for ${pattern}:`, error);
    }
  }
  return null;
};

// ── Direct-fetch fallback ──────────────────────────────────────────────
// When no content-script tab is available, the service worker makes a
// direct fetch using host_permissions + the cookies permission to forward
// the session cookie.  This avoids CORS issues (MV3 service workers are
// exempt from CORS for host_permissions URLs) and lets the extension work
// even without a CareAssurance tab open.
// ───────────────────────────────────────────────────────────────────────

const resolveBaseUrl = (hostname) => {
  const h = String(hostname || "").trim();
  if (!h) return `https://${getDefaultWorkspaceOriginHost()}`;
  if (h.includes("localhost") || h.includes("127.0.0.1")) return `http://${h}`;
  return `https://${h}`;
};

const directFetch = async ({ endpoint, method = "GET", body, targetOrigin, apiOrigin, requestId }) => {
  const baseUrl = resolveBaseUrl(apiOrigin || targetOrigin);
  const fullUrl = `${baseUrl}${endpoint}`;
  console.log(`[CA Extension] Direct fetch fallback: ${method} ${fullUrl}`);

  // Read session cookies via the cookies API so the request is authenticated
  let cookieHeader = "";
  try {
    const cookies = await chrome.cookies.getAll({ url: baseUrl });
    if (cookies.length) {
      cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    }
  } catch (e) {
    console.warn("[CA Extension] Could not read cookies for", baseUrl, e?.message);
  }

  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Cache-Control": "no-cache",
    ...(requestId ? { "X-Request-ID": String(requestId) } : {}),
    ...(cookieHeader ? { Cookie: cookieHeader } : {}),
  };

  const fetchOptions = { method, headers, credentials: "include" };
  if (body && method !== "GET") {
    fetchOptions.body = JSON.stringify(body);
  }

  const res = await fetch(fullUrl, fetchOptions);
  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    return {
      ok: false,
      status: res.status,
      requestId: requestId || res.headers.get("X-Request-ID") || null,
      error: res.status === 401 ? "Not logged in" : errText,
      directFetch: true,
    };
  }

  // Detect HTML response on API endpoints (session expired / SPA catch-all)
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("text/html") && endpoint.startsWith("/api")) {
    console.warn("[CA Extension] Direct fetch got HTML instead of JSON for", endpoint);
    return {
      ok: false,
      status: 401,
      requestId: requestId || res.headers.get("X-Request-ID") || null,
      error: "Not logged in",
      directFetch: true,
    };
  }

  const rawText = await res.text();
  let data = null;
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = { message: rawText };
  }
  return {
    ok: true,
    data,
    status: res.status,
    requestId: requestId || res.headers.get("X-Request-ID") || null,
    directFetch: true,
  };
};

const forwardProxyRequest = async (request, sendResponse) => {
  const { endpoint, method = "GET", body, targetOrigin, apiOrigin, requestId } = request || {};
  const resolvedTargetOrigin = targetOrigin || getDefaultWorkspaceOriginHost();
  const resolvedApiOrigin = apiOrigin || resolvedTargetOrigin;
  console.log(`[CA Extension] API proxy request: ${method} ${endpoint} workspace=${resolvedTargetOrigin} api=${resolvedApiOrigin}`);
  await updateRuntimeMetrics((metrics) => ({
    ...metrics,
    proxyRequests: (metrics.proxyRequests || 0) + 1,
    lastProxyEndpoint: endpoint || null,
    lastProxyMethod: method,
    lastRequestId: requestId || null,
    lastTargetOrigin: resolvedTargetOrigin,
    lastApiOrigin: resolvedApiOrigin,
  }));
  try {
    if (shouldBypassContentRelay(resolvedTargetOrigin, resolvedApiOrigin)) {
      console.log(`[CA Extension] Bypassing content-script relay for split deployment: workspace=${resolvedTargetOrigin} api=${resolvedApiOrigin}`);
      const directResult = await directFetch({ ...request, targetOrigin: resolvedTargetOrigin, apiOrigin: resolvedApiOrigin });
      sendResponse(directResult);
      return;
    }

    const tabId = await findContentScriptTab(resolvedTargetOrigin);
    if (!tabId) {
      // ── Fallback: direct fetch from service worker ──
      console.log(`[CA Extension] No content-script tab for ${resolvedTargetOrigin}, trying direct fetch`);
      try {
        const directResult = await directFetch({ ...request, targetOrigin: resolvedTargetOrigin, apiOrigin: resolvedApiOrigin });
        await updateRuntimeMetrics((metrics) => ({
          ...metrics,
          directFetchAttempts: (metrics.directFetchAttempts || 0) + 1,
          directFetchSuccesses: directResult?.ok ? (metrics.directFetchSuccesses || 0) + 1 : metrics.directFetchSuccesses || 0,
          lastProxyStatus: directResult?.ok ? "ok-direct" : directResult?.status || "direct-error",
          lastError: directResult?.ok ? metrics.lastError : directResult?.error || metrics.lastError,
          lastErrorAt: directResult?.ok ? metrics.lastErrorAt : new Date().toISOString(),
        }));
        sendResponse(directResult);
        return;
      } catch (directError) {
        console.warn("[CA Extension] Direct fetch also failed:", directError?.message);
        await updateRuntimeMetrics((metrics) => ({
          ...metrics,
          directFetchAttempts: (metrics.directFetchAttempts || 0) + 1,
          proxyFailures: (metrics.proxyFailures || 0) + 1,
          lastProxyStatus: "direct-exception",
          lastError: directError?.message || "Direct fetch failed",
          lastErrorAt: new Date().toISOString(),
        }));
        sendResponse({
          ok: false,
          error: `Could not reach ${resolvedTargetOrigin}. Check the server is running and you are logged in.`,
          needsTab: false,
        });
        return;
      }
    }

    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: API_PROXY_TYPE,
        endpoint,
        method,
        body,
        requestId,
      });
      await updateRuntimeMetrics((metrics) => ({
        ...metrics,
        proxySuccesses: response?.ok ? (metrics.proxySuccesses || 0) + 1 : metrics.proxySuccesses || 0,
        proxyFailures: response?.ok ? metrics.proxyFailures || 0 : (metrics.proxyFailures || 0) + 1,
        lastProxyStatus: response?.ok ? "ok" : Number.isFinite(Number(response?.status)) ? Number(response.status) : "error",
        lastError: response?.ok ? metrics.lastError : response?.error || metrics.lastError,
        lastErrorAt: response?.ok ? metrics.lastErrorAt : new Date().toISOString(),
      }));

      // If content-script got HTML instead of JSON (session expired in page context),
      // fall through to direct fetch which uses chrome.cookies
      if (response?.htmlFallback) {
        console.warn("[CA Extension] Content-script relay got HTML — falling back to direct fetch with cookies");
        try {
          const directResult = await directFetch({ ...request, targetOrigin: resolvedTargetOrigin, apiOrigin: resolvedApiOrigin });
          sendResponse(directResult);
          return;
        } catch (directError) {
          console.warn("[CA Extension] Direct fetch fallback also failed:", directError?.message);
          // Return the original HTML-fallback response (treated as 401)
          sendResponse(response);
          return;
        }
      }

      sendResponse(response);
    } catch (forwardError) {
      console.warn("[CA Extension] Error forwarding to content script (will retry after inject):", forwardError?.message);
      await updateRuntimeMetrics((metrics) => ({
        ...metrics,
        proxyRetries: (metrics.proxyRetries || 0) + 1,
      }));

      // Retry up to 2 times with progressive delays after injecting scripts
      let retryResponse = null;
      let lastInjectError = null;
      const retryDelays = [800, 1500];
      for (let attempt = 0; attempt < retryDelays.length; attempt++) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ["constants.js", "content-app.js"],
          });
          await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
          retryResponse = await chrome.tabs.sendMessage(tabId, {
            type: API_PROXY_TYPE,
            endpoint,
            method,
            body,
            requestId,
          });
          // If we got a response, break out of retry loop
          break;
        } catch (injectError) {
          lastInjectError = injectError;
          console.warn(`[CA Extension] Retry ${attempt + 1} failed:`, injectError?.message);
        }
      }

      if (retryResponse) {
        await updateRuntimeMetrics((metrics) => ({
          ...metrics,
          proxySuccesses: retryResponse?.ok ? (metrics.proxySuccesses || 0) + 1 : metrics.proxySuccesses || 0,
          proxyFailures: retryResponse?.ok ? metrics.proxyFailures || 0 : (metrics.proxyFailures || 0) + 1,
          lastProxyStatus: retryResponse?.ok ? "ok" : Number.isFinite(Number(retryResponse?.status)) ? Number(retryResponse.status) : "error",
          lastError: retryResponse?.ok ? metrics.lastError : retryResponse?.error || metrics.lastError,
          lastErrorAt: retryResponse?.ok ? metrics.lastErrorAt : new Date().toISOString(),
        }));
        sendResponse(retryResponse);
      } else {
        // Content-script relay exhausted — try direct fetch as last resort
        console.warn("[CA Extension] Content-script retries exhausted, trying direct fetch fallback");
        try {
          const directResult = await directFetch({ ...request, targetOrigin: resolvedTargetOrigin, apiOrigin: resolvedApiOrigin });
          await updateRuntimeMetrics((metrics) => ({
            ...metrics,
            directFetchAttempts: (metrics.directFetchAttempts || 0) + 1,
            directFetchSuccesses: directResult?.ok ? (metrics.directFetchSuccesses || 0) + 1 : metrics.directFetchSuccesses || 0,
            lastProxyStatus: directResult?.ok ? "ok-direct-fallback" : "direct-fallback-error",
          }));
          sendResponse(directResult);
        } catch (directError) {
          console.error("[CA Extension] All relay + direct fetch attempts failed:", lastInjectError?.message, directError?.message);
          await updateRuntimeMetrics((metrics) => ({
            ...metrics,
            proxyFailures: (metrics.proxyFailures || 0) + 1,
            lastProxyStatus: "all-failed",
            lastError: directError?.message || lastInjectError?.message || "All request methods failed",
            lastErrorAt: new Date().toISOString(),
          }));
          sendResponse({
            ok: false,
            error: "Could not reach Care Assurance. Please check the server is running and refresh the page.",
          });
        }
      }
    }
  } catch (error) {
    console.error("[CA Extension] API proxy error, trying direct fetch:", error);
    // Last-ditch: try direct fetch if the entire proxy chain threw
    try {
      const directResult = await directFetch({ ...request, targetOrigin: resolvedTargetOrigin, apiOrigin: resolvedApiOrigin });
      await updateRuntimeMetrics((metrics) => ({
        ...metrics,
        directFetchAttempts: (metrics.directFetchAttempts || 0) + 1,
        lastProxyStatus: directResult?.ok ? "ok-direct-recovery" : "direct-recovery-error",
      }));
      sendResponse(directResult);
    } catch (directError) {
      await updateRuntimeMetrics((metrics) => ({
        ...metrics,
        proxyFailures: (metrics.proxyFailures || 0) + 1,
        lastProxyStatus: "exception",
        lastError: error?.message || "Proxy request failed",
        lastErrorAt: new Date().toISOString(),
      }));
      sendResponse({ ok: false, error: error?.message || "Proxy request failed" });
    }
  }
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  try {
  // Keep-alive ping — just acknowledge
  if (message?.type === "CA_KEEP_ALIVE_PING") {
    sendResponse({ ok: true });
    return false;
  }

  markRuntimeActivity(message?.type || "message").catch(() => {});
  // Wrap sendResponse so a disconnected port (MV3 service-worker lifecycle) is silently caught
  const safeSendResponse = (data) => {
    try {
      sendResponse(data);
    } catch (e) {
      // Port closed — content script / popup is no longer listening
      console.warn("[CA Extension] sendResponse failed (port disconnected):", e?.message);
    }
  };

  if (message?.type === MESSAGE_TYPES.storePayload) {
    Promise.resolve()
      .then(async () => {
        const payload = message?.payload;
        const storedValues = await getStored([STORAGE_KEYS.caseInfo]);
        const nextCaseInfo = buildCaseInfoFromPayload(payload, storedValues?.[STORAGE_KEYS.caseInfo] || null);

        const nextItems = {
          [STORAGE_KEYS.payload]: payload,
          [STORAGE_KEYS.dataTimestamp]: Date.now(),
        };

        if (nextCaseInfo) {
          nextItems[STORAGE_KEYS.caseInfo] = nextCaseInfo;
        }

        await setStored(nextItems);
      })
      .then(clearLastError)
      .then(() => safeSendResponse({ ok: true }))
      .catch((error) => {
        setLastError(error).then(() => safeSendResponse({ ok: false, error: error.message }));
      });
    return true;
  }

  if (message?.type === MESSAGE_TYPES.storageGet) {
    getStored(message?.payload?.keys || [])
      .then((items) => safeSendResponse({ ok: true, items }))
      .catch((error) => safeSendResponse({ ok: false, error: error?.message || "Storage read failed" }));
    return true;
  }

  if (message?.type === MESSAGE_TYPES.storageSet) {
    setStored(message?.payload?.items || {})
      .then(() => safeSendResponse({ ok: true }))
      .catch((error) => safeSendResponse({ ok: false, error: error?.message || "Storage write failed" }));
    return true;
  }

  if (message?.type === MESSAGE_TYPES.startAutofill) {
    startAutofill(message.caseId, message.serviceDataGroupId)
      .then(async () => {
        const { caAcpPayload } = await getStored([STORAGE_KEYS.payload]);
        const formType = caAcpPayload?.formType || "acp";
        const url = buildFormUrl(formType, message.caseId, message.serviceDataGroupId, caAcpPayload);
        await reuseOrCreateTab(url);
        safeSendResponse({ ok: true });
      })
      .catch(async (error) => {
        await setLastError(error);
        safeSendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message?.type === MESSAGE_TYPES.stepComplete) {
    clearPendingFormCompletionFallback();

    const expectedIndex = Number.isInteger(message?.currentIndex) ? Number(message.currentIndex) : null;
    const expectedBatchId = message?.batchId ? String(message.batchId) : null;

    openNextForm({
      source: "step-complete",
      expectedIndex,
      expectedBatchId,
    })
      .then(() => safeSendResponse({ ok: true }))
      .catch((error) => {
        setLastError(error).then(() => safeSendResponse({ ok: false, error: error.message }));
      });
    return true;
  }

  if (message?.type === MESSAGE_TYPES.log) {
    const entry = message.entry;
    getStored([STORAGE_KEYS.logs]).then(({ caAcpLogs }) => {
      const logs = Array.isArray(caAcpLogs) ? caAcpLogs : [];
      logs.push(entry);
      const capped = logs.slice(-200);
      setStored({ [STORAGE_KEYS.logs]: capped }).then(() => safeSendResponse({ ok: true }));
    });
    return true;
  }

  if (message?.type === MESSAGE_TYPES.stopAutofill) {
    stopAutofill().then(() => safeSendResponse({ ok: true }));
    return true;
  }

  if (message?.type === MESSAGE_TYPES.clearError) {
    clearLastError().then(() => safeSendResponse({ ok: true }));
    return true;
  }

  if (message?.type === MESSAGE_TYPES.analyzeRisks || message?.type === "CA_EXTENSION_ANALYZE_RISKS") {
    const { documentContent, targetOrigin } = message;
    if (!documentContent || typeof documentContent !== "string" || !documentContent.trim()) {
      sendResponse({ ok: false, error: "Missing document content" });
      return false;
    }
    forwardProxyRequest(
      {
        endpoint: "/api/ai/analyze-risks",
        method: "POST",
        body: {
          documentContent,
          allowSensitive: false,
        },
        targetOrigin: targetOrigin || getDefaultWorkspaceOriginHost(),
      },
      (response) => {
        if (!response?.ok) {
          const proxyError = new Error(response?.error || "Analysis failed");
          setLastError(proxyError).then(() => safeSendResponse(response));
          return;
        }
        safeSendResponse({ ...response, result: response.data || response.result });
      }
    );
    return true; // Keep message channel open for async response
  }
  
  // Handle content script ready notification
  if (message?.type === "CA_CONTENT_SCRIPT_READY") {
    const host = normalizeOriginHost(message.origin || _sender.tab?.url);
    const tabId = _sender.tab?.id;
    if (host && tabId) {
      contentScriptReadyTabs.set(host, tabId);
      updateRuntimeMetrics((metrics) => ({
        ...metrics,
        contentReadySignals: (metrics.contentReadySignals || 0) + 1,
        lastTargetOrigin: host,
      })).catch((error) => {
        console.warn("[CA Extension] Failed to update runtime metrics:", error);
      });
      console.log(`[CA Extension] Content script ready on: ${host} (tab ${tabId})`);
    }
    return false;
  }
  
  // Handle API proxy requests from popup
  if (message?.type === API_PROXY_TYPE) {
    forwardProxyRequest(message, safeSendResponse);
    return true; // Keep message channel open
  }

  return false;
  } catch (err) {
    console.error("[CA Extension] Unhandled error in onMessage:", err);
    try { sendResponse({ ok: false, error: err?.message || "Internal extension error" }); } catch (_) { /* port closed */ }
    return false;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  markRuntimeActivity("tab-removed").catch(() => {});
  for (const [host, mappedTabId] of contentScriptReadyTabs.entries()) {
    if (mappedTabId === tabId) {
      contentScriptReadyTabs.delete(host);
    }
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" && areaName !== "session") {
    return;
  }
  if (Object.prototype.hasOwnProperty.call(changes, STORAGE_KEYS.runtimeConfig)) {
    runtimeConfigCache = typeof applySharedRuntimeConfig === "function"
      ? applySharedRuntimeConfig(changes[STORAGE_KEYS.runtimeConfig]?.newValue || null)
      : changes[STORAGE_KEYS.runtimeConfig]?.newValue || runtimeConfigCache;
  }
  if (!Object.prototype.hasOwnProperty.call(changes, STORAGE_KEYS.runtimeMetrics)) {
    return;
  }
  const change = changes[STORAGE_KEYS.runtimeMetrics];
  const nextValue = change?.newValue;
  if (!nextValue || typeof nextValue !== "object") {
    runtimeMetricsCache = null;
    if (runtimeMetricsFlushTimer) {
      clearTimeout(runtimeMetricsFlushTimer);
      runtimeMetricsFlushTimer = null;
    }
    return;
  }
  runtimeMetricsCache = {
    ...getDefaultRuntimeMetrics(),
    ...nextValue,
  };
});
