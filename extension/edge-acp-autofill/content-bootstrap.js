/**
 * content-bootstrap.js
 *
 * Shared bootstrap shim loaded at the top of every Mobizio content-script
 * bundle (before content-acp.js / content-emar.js / content-initial-assessment.js
 * etc.). Provides a single, consistent place for:
 *
 *   - Fallback STORAGE_KEYS, FORM_CONFIGS, MESSAGE_TYPES used when
 *     window.CA_EXTENSION_CONSTANTS is somehow missing (e.g. constants.js
 *     failed to inject before us).
 *   - Fallback STORAGE_HELPERS that wrap chrome.storage.local in promises.
 *   - A `CA_CONTENT_BOOTSTRAP.resolve()` helper that returns the merged
 *     constants object, preferring the real CA_EXTENSION_CONSTANTS.
 *
 * Per-script bundles can still maintain their own fallback objects if they
 * need extra keys, but they should prefer reading from here to reduce drift.
 */
(() => {
  const scope = typeof globalThis !== "undefined" ? globalThis : window;
  if (scope.CA_CONTENT_BOOTSTRAP) return;

  const FALLBACK_STORAGE_KEYS = {
    payload: "caAcpPayload",
    dataTimestamp: "caAcpDataTimestamp",
    caseInfo: "caAcpCaseInfo",
    queueState: "caAcpQueueState",
    logs: "caAcpLogs",
    autoSubmit: "caAcpAutoSubmit",
    dryRun: "caAcpDryRun",
    interactionMode: "caAcpInteractionMode",
    signatureData: "caAcpSignatureData",
    signatureBatchId: "caAcpSignatureBatchId",
    overlayPinned: "caAcpOverlayPinned",
    verificationFields: "caAcpVerificationFields",
    emarSkippedRows: "caAcpEmarSkippedRows",
  };

  const FALLBACK_FORM_CONFIGS = {
    acp: { formId: "1048191" },
    emar: { formId: "1044009" },
    initialAssessment: { formId: "1040788" },
  };

  const FALLBACK_MESSAGE_TYPES = {
    log: "CA_EXTENSION_LOG",
    stepComplete: "CA_EXTENSION_STEP_COMPLETE",
    stepRetry: "CA_EXTENSION_STEP_RETRY",
    emarSkipped: "CA_EXTENSION_EMAR_SKIPPED",
    uploadSignature: "CA_EXTENSION_UPLOAD_SIGNATURE",
    toggleOverlay: "CA_EXTENSION_TOGGLE_OVERLAY",
  };

  const FALLBACK_STORAGE_HELPERS = {
    get: (keys) =>
      new Promise((resolve) => chrome.storage.local.get(keys, (items) => resolve(items || {}))),
    set: (items) =>
      new Promise((resolve) => chrome.storage.local.set(items, () => resolve())),
  };

  const resolve = () => {
    const real = scope.CA_EXTENSION_CONSTANTS || null;
    if (real) {
      return {
        STORAGE_KEYS: real.STORAGE_KEYS || FALLBACK_STORAGE_KEYS,
        FORM_CONFIGS: real.FORM_CONFIGS || FALLBACK_FORM_CONFIGS,
        MESSAGE_TYPES: real.MESSAGE_TYPES || FALLBACK_MESSAGE_TYPES,
        STORAGE_HELPERS: real.STORAGE_HELPERS || FALLBACK_STORAGE_HELPERS,
        DEBUG: Boolean(real.DEBUG),
        source: "constants.js",
      };
    }
    console.warn("[CA Extension] CA_EXTENSION_CONSTANTS missing; content script using fallback constants.");
    return {
      STORAGE_KEYS: FALLBACK_STORAGE_KEYS,
      FORM_CONFIGS: FALLBACK_FORM_CONFIGS,
      MESSAGE_TYPES: FALLBACK_MESSAGE_TYPES,
      STORAGE_HELPERS: FALLBACK_STORAGE_HELPERS,
      DEBUG: false,
      source: "bootstrap-fallback",
    };
  };

  scope.CA_CONTENT_BOOTSTRAP = {
    FALLBACK_STORAGE_KEYS,
    FALLBACK_FORM_CONFIGS,
    FALLBACK_MESSAGE_TYPES,
    FALLBACK_STORAGE_HELPERS,
    resolve,
  };
})();
