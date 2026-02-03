importScripts("constants.js");

const { STORAGE_KEYS, FORM_CONFIG, MESSAGE_TYPES } = self.CA_EXTENSION_CONSTANTS;

const getStored = (keys) =>
  new Promise((resolve) => chrome.storage.local.get(keys, (items) => resolve(items)));

const setStored = (items) =>
  new Promise((resolve) => chrome.storage.local.set(items, () => resolve()));

const buildFormUrl = (caseId, serviceDataGroupId) => {
  const url = new URL(FORM_CONFIG.url);
  url.searchParams.set("caseId", caseId);
  url.searchParams.set("serviceDataGroupId", serviceDataGroupId);
  url.searchParams.set("formId", FORM_CONFIG.formId);
  return url.toString();
};

const clearLastError = () => setStored({ [STORAGE_KEYS.lastError]: null });

const setLastError = async (error) => {
  const message = typeof error === "string" ? error : error?.message || "Unknown error";
  await setStored({ [STORAGE_KEYS.lastError]: message });
};

const startAutofill = async (caseId, serviceDataGroupId) => {
  const { caAcpPayload } = await getStored([STORAGE_KEYS.payload]);
  if (!caAcpPayload || !Array.isArray(caAcpPayload.assessments)) {
    throw new Error("No assessments payload stored yet.");
  }

  await setStored({
    [STORAGE_KEYS.caseInfo]: { caseId, serviceDataGroupId },
    [STORAGE_KEYS.queueState]: { currentIndex: 0, total: caAcpPayload.assessments.length },
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

  const url = buildFormUrl(caAcpCaseInfo.caseId, caAcpCaseInfo.serviceDataGroupId);
  await reuseOrCreateTab(url);
};

const stopAutofill = async () => {
  await setStored({
    [STORAGE_KEYS.queueState]: null,
  });
};

const reuseOrCreateTab = async (url) => {
  const tabs = await chrome.tabs.query({ url: `${FORM_CONFIG.url}*` });
  if (tabs.length > 0) {
    await chrome.tabs.update(tabs[0].id, { url, active: true });
    return;
  }
  await chrome.tabs.create({ url });
};

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
        const url = buildFormUrl(message.caseId, message.serviceDataGroupId);
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
