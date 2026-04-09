importScripts("constants.js");

const { STORAGE_KEYS, FORM_CONFIGS, MESSAGE_TYPES } = self.CA_EXTENSION_CONSTANTS;

const API_PROXY_TYPE = "CA_API_PROXY_REQUEST";

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

const getStored = (keys) =>
  new Promise((resolve) => chrome.storage.local.get(keys, (items) => resolve(items)));

const setStored = (items) =>
  new Promise((resolve) => chrome.storage.local.set(items, () => resolve()));

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
  const { caAcpPayload } = await getStored([STORAGE_KEYS.payload]);
  if (!caAcpPayload) {
    throw new Error("No payload stored yet.");
  }
  const formType = caAcpPayload.formType || "acp";
  if (formType === "acp" && !Array.isArray(caAcpPayload.assessments)) {
    throw new Error("No assessments payload stored yet.");
  }
  if (formType === "initialAssessment" && !caAcpPayload.initialAssessmentData && !caAcpPayload.data) {
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

const openNextForm = async () => {
  const { caAcpPayload, caAcpCaseInfo, caAcpQueueState } = await getStored([
    STORAGE_KEYS.payload,
    STORAGE_KEYS.caseInfo,
    STORAGE_KEYS.queueState,
  ]);

  if (!caAcpPayload || !caAcpCaseInfo || !caAcpQueueState) return;
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
};

const stopAutofill = async () => {
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
  const isFormPage =
    tab.url && tab.url.includes("new_case_form") && tab.url.includes("formId=");
  const isSuccessPage =
    tab.url &&
    (tab.url.includes("case_form_success") || tab.url.includes("case_data_group") || tab.url.includes("/cases/"));

  if (isSuccessPage && caAcpQueueState.currentIndex + 1 < caAcpQueueState.total) {
    console.log("[ACP Extension] Detected form completion, advancing to next assessment");
    await openNextForm();
  }
});

const buildTargetPatterns = (targetOrigin) => {
  const normalized = String(targetOrigin || "").trim();
  if (!normalized) return ["https://careassurance.uk/*", "https://www.careassurance.uk/*"];
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

const forwardProxyRequest = async (request, sendResponse) => {
  const { endpoint, method = "GET", body, targetOrigin, requestId } = request || {};
  const resolvedTargetOrigin = targetOrigin || "careassurance.uk";
  console.log(`[CA Extension] API proxy request: ${method} ${endpoint} for ${resolvedTargetOrigin}`);
  await updateRuntimeMetrics((metrics) => ({
    ...metrics,
    proxyRequests: (metrics.proxyRequests || 0) + 1,
    lastProxyEndpoint: endpoint || null,
    lastProxyMethod: method,
    lastRequestId: requestId || null,
    lastTargetOrigin: resolvedTargetOrigin,
  }));
  try {
    const tabId = await findContentScriptTab(resolvedTargetOrigin);
    if (!tabId) {
      await updateRuntimeMetrics((metrics) => ({
        ...metrics,
        proxyFailures: (metrics.proxyFailures || 0) + 1,
        lastProxyStatus: "needs-tab",
        lastError: `No tab for ${resolvedTargetOrigin}`,
        lastErrorAt: new Date().toISOString(),
      }));
      sendResponse({
        ok: false,
        error: `No Care Assurance tab found. Please open https://${resolvedTargetOrigin} and log in first.`,
        needsTab: true,
      });
      return;
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
        console.error("[CA Extension] All retry attempts failed:", lastInjectError?.message);
        await updateRuntimeMetrics((metrics) => ({
          ...metrics,
          proxyFailures: (metrics.proxyFailures || 0) + 1,
          lastProxyStatus: "inject-failed",
          lastError: lastInjectError?.message || "Script injection failed",
          lastErrorAt: new Date().toISOString(),
        }));
        sendResponse({
          ok: false,
          error: "Could not communicate with Care Assurance tab. Please refresh the page and try again.",
        });
      }
    }
  } catch (error) {
    console.error("[CA Extension] API proxy error:", error);
    await updateRuntimeMetrics((metrics) => ({
      ...metrics,
      proxyFailures: (metrics.proxyFailures || 0) + 1,
      lastProxyStatus: "exception",
      lastError: error?.message || "Proxy request failed",
      lastErrorAt: new Date().toISOString(),
    }));
    sendResponse({ ok: false, error: error?.message || "Proxy request failed" });
  }
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
    setStored({ [STORAGE_KEYS.payload]: message.payload })
      .then(clearLastError)
      .then(() => safeSendResponse({ ok: true }))
      .catch((error) => {
        setLastError(error).then(() => safeSendResponse({ ok: false, error: error.message }));
      });
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
    openNextForm()
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
        targetOrigin: targetOrigin || "careassurance.uk",
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
  if (areaName !== "local") {
    return;
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
