const STORAGE_KEYS = {
  payload: "caAcpPayload",
  caseInfo: "caAcpCaseInfo",
  queueState: "caAcpQueueState",
  logs: "caAcpLogs",
};

const DEFAULT_FORM_URL = "https://clece.mobizio.com/new_case_form";
const ACP_FORM_ID = "1048191";

const getStored = (keys) =>
  new Promise((resolve) => chrome.storage.local.get(keys, (items) => resolve(items)));

const setStored = (items) =>
  new Promise((resolve) => chrome.storage.local.set(items, () => resolve()));

const buildFormUrl = (caseId, serviceDataGroupId) => {
  const url = new URL(DEFAULT_FORM_URL);
  url.searchParams.set("caseId", caseId);
  url.searchParams.set("serviceDataGroupId", serviceDataGroupId);
  url.searchParams.set("formId", ACP_FORM_ID);
  return url.toString();
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

  const url = buildFormUrl(caseId, serviceDataGroupId);
  await chrome.tabs.create({ url });
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
    await setStored({ [STORAGE_KEYS.queueState]: null });
    return;
  }

  await setStored({
    [STORAGE_KEYS.queueState]: {
      ...caAcpQueueState,
      currentIndex: nextIndex,
    },
  });

  const url = buildFormUrl(caAcpCaseInfo.caseId, caAcpCaseInfo.serviceDataGroupId);
  await chrome.tabs.create({ url });
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "CA_EXTENSION_STORE_PAYLOAD") {
    setStored({ [STORAGE_KEYS.payload]: message.payload }).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message?.type === "CA_EXTENSION_START_AUTOFILL") {
    startAutofill(message.caseId, message.serviceDataGroupId)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "CA_EXTENSION_STEP_COMPLETE") {
    openNextForm().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === "CA_EXTENSION_LOG") {
    const entry = message.entry;
    getStored([STORAGE_KEYS.logs]).then(({ caAcpLogs }) => {
      const logs = Array.isArray(caAcpLogs) ? caAcpLogs : [];
      logs.push(entry);
      const capped = logs.slice(-200);
      setStored({ [STORAGE_KEYS.logs]: capped }).then(() => sendResponse({ ok: true }));
    });
    return true;
  }

  return false;
});
