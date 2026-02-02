const STORAGE_KEYS = {
  payload: "caAcpPayload",
  caseInfo: "caAcpCaseInfo",
};

const loadStorage = (keys) =>
  new Promise((resolve) => chrome.storage.local.get(keys, (items) => resolve(items)));

const setStorage = (items) =>
  new Promise((resolve) => chrome.storage.local.set(items, () => resolve()));

const payloadStatus = document.getElementById("payload-status");
const caseIdInput = document.getElementById("case-id");
const serviceDataGroupInput = document.getElementById("service-data-group-id");
const startButton = document.getElementById("start-autofill");
const status = document.getElementById("autofill-status");

const refreshPayloadStatus = async () => {
  const { caAcpPayload, caAcpCaseInfo } = await loadStorage([
    STORAGE_KEYS.payload,
    STORAGE_KEYS.caseInfo,
  ]);

  if (caAcpPayload && Array.isArray(caAcpPayload.assessments)) {
    payloadStatus.textContent = `Ready: ${caAcpPayload.assessments.length} assessment(s)`;
  } else {
    payloadStatus.textContent = "Waiting for data...";
  }

  if (caAcpCaseInfo) {
    caseIdInput.value = caAcpCaseInfo.caseId || "";
    serviceDataGroupInput.value = caAcpCaseInfo.serviceDataGroupId || "";
  }
};

startButton.addEventListener("click", async () => {
  const caseId = caseIdInput.value.trim();
  const serviceDataGroupId = serviceDataGroupInput.value.trim();

  if (!caseId || !serviceDataGroupId) {
    status.textContent = "Enter both Case ID and Service Data Group ID.";
    return;
  }

  await setStorage({
    [STORAGE_KEYS.caseInfo]: { caseId, serviceDataGroupId },
  });

  chrome.runtime.sendMessage(
    { type: "CA_EXTENSION_START_AUTOFILL", caseId, serviceDataGroupId },
    (response) => {
      if (chrome.runtime.lastError) {
        status.textContent = chrome.runtime.lastError.message;
        return;
      }
      status.textContent = response?.ok
        ? "Autofill started."
        : response?.error || "Failed to start.";
    }
  );
});

refreshPayloadStatus();
