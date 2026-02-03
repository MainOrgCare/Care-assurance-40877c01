importScripts("constants.js");

const { STORAGE_KEYS, FORM_CONFIGS, MESSAGE_TYPES } = self.CA_EXTENSION_CONSTANTS;

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

  await setStored({
    [STORAGE_KEYS.caseInfo]: { caseId, serviceDataGroupId },
    [STORAGE_KEYS.queueState]: {
      currentIndex: 0,
      total: formType === "acp" ? caAcpPayload.assessments.length : 1,
      formType,
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
  if (formType !== "acp") {
    await setStored({
      [STORAGE_KEYS.queueState]: null,
      [STORAGE_KEYS.payload]: null,
      [STORAGE_KEYS.caseInfo]: null,
    });
    return;
  }
  const nextIndex = caAcpQueueState.currentIndex + 1;
  if (nextIndex >= caAcpQueueState.total) {
    await setStored({
      [STORAGE_KEYS.queueState]: null,
      [STORAGE_KEYS.payload]: null,
      [STORAGE_KEYS.caseInfo]: null,
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
  const isFormPage = tab.url && tab.url.includes('new_case_form') && tab.url.includes('formId=');
  const isSuccessPage = tab.url && (tab.url.includes('case_form_success') || tab.url.includes('/cases/'));
  
  if (isSuccessPage && caAcpQueueState.currentIndex + 1 < caAcpQueueState.total) {
    console.log('[ACP Extension] Detected form submission success, advancing to next assessment');
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

  return false;
});
