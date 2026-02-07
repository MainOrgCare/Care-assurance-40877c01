importScripts("constants.js");

const { STORAGE_KEYS, FORM_CONFIGS, MESSAGE_TYPES } = self.CA_EXTENSION_CONSTANTS;

const API_PROXY_TYPE = "CA_API_PROXY_REQUEST";

// Track tabs with content-app.js ready
let contentScriptReadyTabs = new Map(); // origin -> tabId

const getStored = (keys) =>
  new Promise((resolve) => chrome.storage.local.get(keys, (items) => resolve(items)));

const setStored = (items) =>
  new Promise((resolve) => chrome.storage.local.set(items, () => resolve()));

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

  await setStored({
    [STORAGE_KEYS.caseInfo]: { caseId, serviceDataGroupId },
    [STORAGE_KEYS.queueState]: {
      currentIndex: 0,
      total: formType === "acp" ? caAcpPayload.assessments.length : 1,
      formType,
      batchId: `${Date.now()}`,
    },
  });
  await clearLastError();
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
    return;
  }

  await setStored({
    [STORAGE_KEYS.queueState]: {
      ...caAcpQueueState,
      currentIndex: nextIndex,
    },
  });

  const url = buildFormUrl(formType, caAcpCaseInfo.caseId, caAcpCaseInfo.serviceDataGroupId, caAcpPayload);
  await reuseOrCreateTab(url);
};

const stopAutofill = async () => {
  await setStored({
    [STORAGE_KEYS.queueState]: null,
  });
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === MESSAGE_TYPES.storePayload) {
    setStored({ [STORAGE_KEYS.payload]: message.payload })
      .then(clearLastError)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        setLastError(error).then(() => sendResponse({ ok: false, error: error.message }));
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
        sendResponse({ ok: true });
      })
      .catch(async (error) => {
        await setLastError(error);
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message?.type === MESSAGE_TYPES.stepComplete) {
    openNextForm()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        setLastError(error).then(() => sendResponse({ ok: false, error: error.message }));
      });
    return true;
  }

  if (message?.type === MESSAGE_TYPES.log) {
    const entry = message.entry;
    getStored([STORAGE_KEYS.logs]).then(({ caAcpLogs }) => {
      const logs = Array.isArray(caAcpLogs) ? caAcpLogs : [];
      logs.push(entry);
      const capped = logs.slice(-200);
      setStored({ [STORAGE_KEYS.logs]: capped }).then(() => sendResponse({ ok: true }));
    });
    return true;
  }

  if (message?.type === MESSAGE_TYPES.stopAutofill) {
    stopAutofill().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === MESSAGE_TYPES.clearError) {
    clearLastError().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === MESSAGE_TYPES.analyzeRisks || message?.type === "CA_EXTENSION_ANALYZE_RISKS") {
    const { documentContent, authToken } = message;
    
    if (!documentContent || !authToken) {
      sendResponse({ ok: false, error: "Missing document content or auth token" });
      return false;
    }

    // Call Care Assurance API with SSE support
    const careAssuranceUrl = "https://careassurance.uk";
    
    fetch(`${careAssuranceUrl}/api/ai/analyze-risks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cookie": `session=${authToken}`
      },
      credentials: "include",
      body: JSON.stringify({
        documentContent: documentContent,
        allowSensitive: false
      })
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        // Parse SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let lastResult = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data:")) {
              const dataStr = line.substring(5).trim();
              if (!dataStr || dataStr.startsWith(":")) continue;

              try {
                const data = JSON.parse(dataStr);
                
                // Store the result if it contains service user data
                if (data.serviceUser) {
                  lastResult = data;
                }
              } catch (parseError) {
                console.warn("Failed to parse SSE data:", dataStr);
              }
            }
          }
        }

        if (lastResult) {
          sendResponse({ ok: true, result: lastResult });
        } else {
          throw new Error("No result received from API");
        }
      })
      .catch((error) => {
        console.error("Risk analysis error:", error);
        setLastError(error).then(() => {
          sendResponse({ ok: false, error: error.message || "Analysis failed" });
        });
      });

    return true; // Keep message channel open for async response
  }
  
  // Handle content script ready notification
  if (message?.type === "CA_CONTENT_SCRIPT_READY") {
    const origin = message.origin;
    contentScriptReadyTabs.set(origin, _sender.tab?.id);
    console.log(`[CA Extension] Content script ready on: ${origin}`);
    return false;
  }
  
  // Handle API proxy requests from popup
  if (message?.type === API_PROXY_TYPE) {
    const { endpoint, method, body, targetOrigin } = message;
    
    // Find a tab with content script ready for the target origin
    const findContentScriptTab = async () => {
      // First check cached tabs
      for (const [origin, tabId] of contentScriptReadyTabs.entries()) {
        if (origin.includes(targetOrigin) || targetOrigin.includes(origin.replace(/^https?:\/\//, ''))) {
          try {
            const tab = await chrome.tabs.get(tabId);
            if (tab) return tabId;
          } catch (e) {
            contentScriptReadyTabs.delete(origin);
          }
        }
      }
      
      // Query for matching tabs
      const patterns = [
        `https://${targetOrigin}/*`,
        `https://www.${targetOrigin}/*`,
        `http://localhost:*/*`,
        `http://127.0.0.1:*/*`
      ];
      
      for (const pattern of patterns) {
        try {
          const tabs = await chrome.tabs.query({ url: pattern });
          if (tabs.length > 0) {
            return tabs[0].id;
          }
        } catch (e) {
          // Invalid pattern, skip
        }
      }
      
      return null;
    };
    
    findContentScriptTab()
      .then(async (tabId) => {
        if (!tabId) {
          sendResponse({ 
            ok: false, 
            error: `No Care Assurance tab found. Please open ${targetOrigin} and log in first.`,
            needsTab: true 
          });
          return;
        }
        
        // Forward request to content script
        try {
          const response = await chrome.tabs.sendMessage(tabId, {
            type: API_PROXY_TYPE,
            endpoint,
            method,
            body
          });
          sendResponse(response);
        } catch (error) {
          console.error('[CA Extension] Error forwarding to content script:', error);
          sendResponse({ ok: false, error: error.message || 'Failed to communicate with tab' });
        }
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error.message });
      });
    
    return true; // Keep message channel open
  }

  return false;
});
