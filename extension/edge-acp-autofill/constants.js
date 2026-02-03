(() => {
  const globalScope = typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : window;
  if (globalScope?.CA_EXTENSION_CONSTANTS) return;

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
    custom: {
      url: "https://clece.mobizio.com/new_case_form",
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

  globalScope.CA_EXTENSION_CONSTANTS = { STORAGE_KEYS, FORM_CONFIGS, MESSAGE_TYPES };
})();
