const FALLBACK_STORAGE_KEYS = {
  payload: "caAcpPayload",
  caseInfo: "caAcpCaseInfo",
  queueState: "caAcpQueueState",
  autoSubmit: "caAcpAutoSubmit",
  dryRun: "caAcpDryRun",
  logs: "caAcpLogs",
  interactionMode: "caAcpInteractionMode",
  signatureData: "caAcpSignatureData",
  lastError: "caAcpLastError",
};

const FALLBACK_MESSAGE_TYPES = {
  startAutofill: "CA_EXTENSION_START_AUTOFILL",
  stopAutofill: "CA_EXTENSION_STOP_AUTOFILL",
  clearError: "CA_EXTENSION_CLEAR_ERROR",
};

const { STORAGE_KEYS, MESSAGE_TYPES } = window.CA_EXTENSION_CONSTANTS || {
  STORAGE_KEYS: FALLBACK_STORAGE_KEYS,
  MESSAGE_TYPES: FALLBACK_MESSAGE_TYPES,
};

const loadStorage = (keys) =>
  new Promise((resolve) => chrome.storage.local.get(keys, (items) => resolve(items)));

const setStorage = (items) =>
  new Promise((resolve) => chrome.storage.local.set(items, () => resolve()));

const payloadStatus = document.getElementById("payload-status");
const caseIdInput = document.getElementById("case-id");
const serviceDataGroupInput = document.getElementById("service-data-group-id");
const startButton = document.getElementById("start-autofill");
const stopButton = document.getElementById("stop-autofill");
const status = document.getElementById("autofill-status");
const clearButton = document.getElementById("clear-data");
const autoSubmitToggle = document.getElementById("auto-submit");
const dryRunToggle = document.getElementById("dry-run");
const interactionModeSelect = document.getElementById("interaction-mode");
const signatureInput = document.getElementById("signature-file");
const uploadSignatureButton = document.getElementById("upload-signature");
const signatureStatus = document.getElementById("signature-status");
const logStatus = document.getElementById("log-status");
const logList = document.getElementById("log-list");
const clearLogsButton = document.getElementById("clear-logs");
const progressStatus = document.getElementById("progress-status");
const errorBanner = document.getElementById("error-banner");

const refreshPayloadStatus = async () => {
  const {
    caAcpPayload,
    caAcpCaseInfo,
    caAcpAutoSubmit,
    caAcpDryRun,
    caAcpLogs,
    caAcpInteractionMode,
    caAcpQueueState,
    caAcpLastError,
  } = await loadStorage([
    STORAGE_KEYS.payload,
    STORAGE_KEYS.caseInfo,
    STORAGE_KEYS.autoSubmit,
    STORAGE_KEYS.dryRun,
    STORAGE_KEYS.logs,
    STORAGE_KEYS.interactionMode,
    STORAGE_KEYS.queueState,
    STORAGE_KEYS.lastError,
  ]);

  if (caAcpPayload && Array.isArray(caAcpPayload.assessments)) {
    payloadStatus.textContent = `Ready: ${caAcpPayload.assessments.length} assessment(s)`;
  } else if (caAcpPayload && caAcpPayload.formType === "emar") {
    payloadStatus.textContent = "Ready: EMAR audit";
  } else if (caAcpPayload && caAcpPayload.formType === "custom") {
    payloadStatus.textContent = "Ready: Custom document";
  } else {
    payloadStatus.textContent = "Waiting for data...";
  }

  if (caAcpCaseInfo) {
    caseIdInput.value = caAcpCaseInfo.caseId || "";
    serviceDataGroupInput.value = caAcpCaseInfo.serviceDataGroupId || "";
  }

  if (autoSubmitToggle) {
    autoSubmitToggle.checked = caAcpAutoSubmit !== false;
  }

  if (dryRunToggle) {
    dryRunToggle.checked = caAcpDryRun === true;
  }

  if (interactionModeSelect) {
    interactionModeSelect.value = caAcpInteractionMode || "auto";
  }

  if (logList && logStatus) {
    const logs = Array.isArray(caAcpLogs) ? caAcpLogs : [];
    logList.textContent = logs.join("\n");
    logStatus.textContent = logs.length > 0 ? `Entries: ${logs.length}` : "No actions yet.";
  }

  if (progressStatus) {
    if (caAcpQueueState && typeof caAcpQueueState.currentIndex === "number") {
      progressStatus.textContent = `Progress: ${caAcpQueueState.currentIndex + 1} of ${caAcpQueueState.total}`;
    } else {
      progressStatus.textContent = "Not started.";
    }
  }

  if (errorBanner) {
    if (caAcpLastError) {
      errorBanner.textContent = caAcpLastError;
      errorBanner.hidden = false;
    } else {
      errorBanner.hidden = true;
    }
  }
};

startButton.addEventListener("click", async () => {
  const caseId = caseIdInput.value.trim();
  const serviceDataGroupId = serviceDataGroupInput.value.trim();
  const autoSubmit = autoSubmitToggle ? autoSubmitToggle.checked : true;
  const dryRun = dryRunToggle ? dryRunToggle.checked : false;
  const interactionMode = interactionModeSelect ? interactionModeSelect.value : "auto";

  if (!caseId || !serviceDataGroupId) {
    status.textContent = "Enter both Case ID and Service Data Group ID.";
    return;
  }

  await setStorage({
    [STORAGE_KEYS.caseInfo]: { caseId, serviceDataGroupId },
    [STORAGE_KEYS.autoSubmit]: autoSubmit,
    [STORAGE_KEYS.dryRun]: dryRun,
    [STORAGE_KEYS.interactionMode]: interactionMode,
  });

  chrome.runtime.sendMessage(
    { type: MESSAGE_TYPES.startAutofill, caseId, serviceDataGroupId },
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

if (stopButton) {
  stopButton.addEventListener("click", async () => {
    chrome.runtime.sendMessage({ type: MESSAGE_TYPES.stopAutofill }, () => {
      status.textContent = "Autofill stopped.";
    });
  });
}

if (autoSubmitToggle) {
  autoSubmitToggle.addEventListener("change", async () => {
    await setStorage({ [STORAGE_KEYS.autoSubmit]: autoSubmitToggle.checked });
  });
}

if (dryRunToggle) {
  dryRunToggle.addEventListener("change", async () => {
    await setStorage({ [STORAGE_KEYS.dryRun]: dryRunToggle.checked });
  });
}

if (interactionModeSelect) {
  interactionModeSelect.addEventListener("change", async () => {
    await setStorage({ [STORAGE_KEYS.interactionMode]: interactionModeSelect.value });
  });
}

if (clearButton) {
  clearButton.addEventListener("click", async () => {
    await setStorage({
      [STORAGE_KEYS.payload]: null,
      [STORAGE_KEYS.caseInfo]: null,
      [STORAGE_KEYS.queueState]: null,
      [STORAGE_KEYS.lastError]: null,
    });
    status.textContent = "Cleared stored data.";
    await refreshPayloadStatus();
  });
}

if (clearLogsButton) {
  clearLogsButton.addEventListener("click", async () => {
    await setStorage({ [STORAGE_KEYS.logs]: [] });
    await refreshPayloadStatus();
  });
}

if (errorBanner) {
  errorBanner.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: MESSAGE_TYPES.clearError }, () => {
      refreshPayloadStatus();
    });
  });
}

const sendSignatureToActiveTab = async (file) => {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

  await setStorage({
    [STORAGE_KEYS.signatureData]: {
      dataUrl,
      fileName: file.name,
      mimeType: file.type,
    },
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("No active tab found.");
  }

  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(
      tab.id,
      {
        type: "CA_EXTENSION_UPLOAD_SIGNATURE",
        payload: {
          dataUrl,
          fileName: file.name,
          mimeType: file.type,
        },
      },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.error || "Failed to upload signature."));
          return;
        }
        resolve(true);
      }
    );
  });
};

if (uploadSignatureButton) {
  uploadSignatureButton.addEventListener("click", async () => {
    if (!signatureInput || !signatureInput.files || signatureInput.files.length === 0) {
      signatureStatus.textContent = "Choose a signature file first.";
      return;
    }
    const file = signatureInput.files[0];
    try {
      await sendSignatureToActiveTab(file);
      signatureStatus.textContent = "Signature uploaded to form.";
    } catch (error) {
      signatureStatus.textContent = error.message || "Signature upload failed.";
    }
  });
}

refreshPayloadStatus();

setInterval(refreshPayloadStatus, 1500);
