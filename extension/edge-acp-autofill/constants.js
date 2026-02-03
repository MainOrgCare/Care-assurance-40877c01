const STORAGE_KEYS = {
  payload: "caAcpPayload",
  caseInfo: "caAcpCaseInfo",
  queueState: "caAcpQueueState",
  logs: "caAcpLogs",
  autoSubmit: "caAcpAutoSubmit",
  dryRun: "caAcpDryRun",
  interactionMode: "caAcpInteractionMode",
  signatureData: "caAcpSignatureData",
  lastError: "caAcpLastError",
};

const FORM_CONFIGS = {
  acp: {
    url: "https://clece.mobizio.com/new_case_form",
    formId: "1048191",
  },
  emar: {
    url: "https://clece.mobizio.com/new_case_form",
    formId: "1044009",
  },
};

const MESSAGE_TYPES = {
  storePayload: "CA_EXTENSION_STORE_PAYLOAD",
  startAutofill: "CA_EXTENSION_START_AUTOFILL",
  stepComplete: "CA_EXTENSION_STEP_COMPLETE",
  log: "CA_EXTENSION_LOG",
  uploadSignature: "CA_EXTENSION_UPLOAD_SIGNATURE",
  stopAutofill: "CA_EXTENSION_STOP_AUTOFILL",
  clearError: "CA_EXTENSION_CLEAR_ERROR",
};

// Expose for non-module scripts.
if (typeof window !== "undefined") {
  window.CA_EXTENSION_CONSTANTS = { STORAGE_KEYS, FORM_CONFIGS, MESSAGE_TYPES };
}

if (typeof self !== "undefined") {
  self.CA_EXTENSION_CONSTANTS = { STORAGE_KEYS, FORM_CONFIGS, MESSAGE_TYPES };
}
