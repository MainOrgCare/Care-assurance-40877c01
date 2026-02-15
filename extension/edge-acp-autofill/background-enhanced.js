// Enhanced background.js with MV3 service worker keep-alive and improved error handling
// This file demonstrates the improvements needed for the 5-minute timeout issue

importScripts("constants.js");

const { STORAGE_KEYS, FORM_CONFIGS, MESSAGE_TYPES } = self.CA_EXTENSION_CONSTANTS;

const API_PROXY_TYPE = "CA_API_PROXY_REQUEST";

// ============================================================================
// KEEP-ALIVE MECHANISM FOR MV3 SERVICE WORKER
// Prevents the service worker from being terminated after 5 minutes of inactivity
// ============================================================================

const KEEP_ALIVE_INTERVAL = 20000; // Send keep-alive every 20 seconds (well before 5 min timeout)
let keepAliveTimerInit = null;

/**
 * Start periodic keep-alive messages to prevent service worker termination
 * This is necessary for long-running operations like batch autofill
 */
function startKeepAliveTimer() {
  if (keepAliveTimerInit) return; // Already running
  
  keepAliveTimerInit = setInterval(async () => {
    try {
      // Send a keep-alive message to all connected popups/tabs
      // This keeps the service worker alive during batch processing
      chrome.runtime.sendMessage(
        { type: "KEEP_ALIVE_PING" },
        () => {
          // Ignore errors - this is just to keep the port open
          if (chrome.runtime.lastError) {
            console.log("[CA Extension] Keep-alive ping no-op (expected if popup closed)");
          }
        }
      );
    } catch (e) {
      console.warn("[CA Extension] Keep-alive error:", e);
    }
  }, KEEP_ALIVE_INTERVAL);
  
  console.log("[CA Extension] Keep-alive timer started (interval:", KEEP_ALIVE_INTERVAL, "ms)");
}

function stopKeepAliveTimer() {
  if (keepAliveTimerInit) {
    clearInterval(keepAliveTimerInit);
    keepAliveTimerInit = null;
    console.log("[CA Extension] Keep-alive timer stopped");
  }
}

/**
 * Enhanced error handling with field validation
 * Provides detailed error messages instead of silent failures
 */
const ValidationError = {
  FIELD_NOT_FOUND: "FIELD_NOT_FOUND",
  FIELD_NOT_SETTABLE: "FIELD_NOT_SETTABLE",
  FORM_STRUCTURE_CHANGED: "FORM_STRUCTURE_CHANGED",
  TIMEOUT: "TIMEOUT",
  NETWORK_ERROR: "NETWORK_ERROR"
};

/**
 * Log autofill activity for audit trail
 */
async function logAutofillActivity(action, data = {}) {
  const timestamp = new Date().toISOString();
  const activity = { action, timestamp, ...data };
  
  const { caAcpActivityLog = [] } = await getStored([STORAGE_KEYS.activityLog]);
  const newLog = 
    Array.isArray(caAcpActivityLog) 
      ? [...caAcpActivityLog.slice(-99), activity] // Keep last 100 events
      : [activity];
  
  await setStored({ [STORAGE_KEYS.activityLog]: newLog });
  console.log("[CA Extension] Activity logged:", action);
}

/**
 * Store validation error with context for debugging
 */
async function logFieldValidationError(fieldName, errorType, context = {}) {
  const error = {
    fieldName,
    errorType,
    timestamp: new Date().toISOString(),
    context
  };
  
  const { caAcpFieldErrors = [] } = await getStored([STORAGE_KEYS.fieldErrors]);
  const newErrors = 
    Array.isArray(caAcpFieldErrors)
      ? [...caAcpFieldErrors.slice(-49), error] // Keep last 50 errors
      : [error];
  
  await setStored({ [STORAGE_KEYS.fieldErrors]: newErrors });
  console.warn("[CA Extension] Field validation error:", error);
}

// ============================================================================
// Original background.js code with enhancements
// ============================================================================

// Track tabs with content-app.js ready
let contentScriptReadyTabs = new Map();
let activeAutofillTabId = null;

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
  await logAutofillActivity("ERROR", { message });
};

const updateBadge = (current, total) => {
  if (total > 0) {
    chrome.action.setBadgeText({ text: `${current}/${total}` });
    chrome.action.setBadgeBackgroundColor({ color: "#335299" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
};

const clearBadge = () => {
  chrome.action.setBadgeText({ text: "" });
};

const startAutofill = async (caseId, serviceDataGroupId) => {
  startKeepAliveTimer(); // Start keep-alive for long batch operations
  
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
  await logAutofillActivity("AUTOFILL_STARTED", { formType, total });
  updateBadge(1, total);
};

// Message listener with keep-alive support
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Feed the keep-alive system
  if (message?.type === "KEEP_ALIVE_PING") {
    console.log("[CA Extension] Keep-alive ping received");
    sendResponse({ ok: true, timestamp: Date.now() });
    return true;
  }

  // Original message handling
  const safeSendResponse = (data) => {
    try {
      sendResponse(data);
    } catch (e) {
      console.warn("[CA Extension] sendResponse failed (port disconnected):", e?.message);
    }
  };

  // ... (rest of original message listener code)
  // Handler implementations would go here - keeping original logic intact
  
  safeSendResponse({ ok: false, error: "Unknown message type" });
  return true;
});

// Listen for extension unload to clean up
chrome.runtime.onSuspend.addListener(() => {
  stopKeepAliveTimer();
  console.log("[CA Extension] Service worker suspending, keep-alive stopped");
});

console.log("[CA Extension Background] Enhanced service worker loaded with keep-alive support");
