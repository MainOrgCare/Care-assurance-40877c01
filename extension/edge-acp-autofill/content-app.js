const EXTENSION_MESSAGE_TYPE = "CA_SEND_TO_ACP_EXTENSION";
const EMAR_MESSAGE_TYPE = "CA_SEND_TO_EMAR_EXTENSION";
const EXTENSION_ACK_TYPE = "CA_EXTENSION_ACK";
const STORE_PAYLOAD_TYPE = "CA_EXTENSION_STORE_PAYLOAD";
const API_PROXY_TYPE = "CA_API_PROXY_REQUEST";

console.log("[CA Extension Content] content-app.js loaded on:", window.location.origin);
console.log("[CA Extension Content] Document ready state:", document.readyState);

const sendAck = (requestId, ok, error) => {
  console.log("[CA Extension Content] Sending ACK:", { requestId, ok, error });
  window.postMessage(
    {
      type: EXTENSION_ACK_TYPE,
      requestId,
      ok,
      error,
    },
    window.location.origin
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// API PROXY - Allow popup to make authenticated API requests via content script
// ═══════════════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[CA Extension Content] Received message:", message?.type);
  
  if (message.type !== API_PROXY_TYPE) return false;
  
  const { endpoint, method = 'GET', body } = message;
  console.log(`[CA Extension Content] API proxy request: ${method} ${endpoint}`);
  
  // Make the fetch request (will include session cookie since we're on same origin)
  const fetchOptions = {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' }
  };
  
  if (body && method !== 'GET') {
    fetchOptions.body = JSON.stringify(body);
  }
  
  const fullUrl = `${window.location.origin}${endpoint}`;
  console.log(`[CA Extension Content] Fetching: ${fullUrl}`);
  
  fetch(fullUrl, fetchOptions)
    .then(async (res) => {
      console.log(`[CA Extension Content] Fetch response: ${res.status} ${res.statusText}`);
      if (!res.ok) {
        const errorText = await res.text().catch(() => 'Unknown error');
        console.error(`[CA Extension Content] Request failed:`, errorText);
        sendResponse({ 
          ok: false, 
          status: res.status, 
          error: res.status === 401 ? 'Not logged in' : errorText 
        });
        return;
      }
      const data = await res.json();
      console.log(`[CA Extension Content] Request successful, data keys:`, Object.keys(data));
      sendResponse({ ok: true, data, status: res.status });
    })
    .catch((error) => {
      console.error('[CA Extension Content] Fetch error:', error);
      sendResponse({ ok: false, error: error.message });
    });
  
  return true; // Keep message channel open for async response
});

// Notify popup that we're ready to proxy requests
chrome.runtime.sendMessage({ 
  type: 'CA_CONTENT_SCRIPT_READY', 
  origin: window.location.origin 
}).then(() => {
  console.log("[CA Extension Content] Ready notification sent successfully");
}).catch((err) => {
  console.log("[CA Extension Content] Ready notification (no receiver):", err?.message);
});

// ═══════════════════════════════════════════════════════════════════════════
// WEBPAGE MESSAGE HANDLING
// ═══════════════════════════════════════════════════════════════════════════

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (!event.data) return;
  const isAcpMessage = event.data.type === EXTENSION_MESSAGE_TYPE;
  const isEmarMessage = event.data.type === EMAR_MESSAGE_TYPE;
  const isStorePayloadMessage = event.data.type === STORE_PAYLOAD_TYPE;
  if (!isAcpMessage && !isEmarMessage && !isStorePayloadMessage) return;

  console.log("[CA Extension] Received message:", event.data.type);

  const { requestId, payload } = event.data;
  if (!payload || typeof payload !== "object") {
    sendAck(requestId, false, "Invalid payload.");
    return;
  }
  const normalizedPayload = { ...payload };
  if (isEmarMessage && !normalizedPayload.formType) {
    normalizedPayload.formType = "emar";
  }
  if (isAcpMessage && !normalizedPayload.formType) {
    normalizedPayload.formType = "acp";
  }
  // Handle initialAssessment from Store Payload message (from Plan Enhancer)
  if (isStorePayloadMessage && normalizedPayload.formType === "initialAssessment") {
    // This is valid, proceed
  } else if (normalizedPayload.formType === "acp" && !Array.isArray(normalizedPayload.assessments)) {
    sendAck(requestId, false, "Invalid ACP payload.");
    return;
  } else if (normalizedPayload.formType === "emar" && typeof normalizedPayload !== "object") {
    sendAck(requestId, false, "Invalid EMAR payload.");
    return;
  } else if (isEmarMessage && normalizedPayload.formType !== "emar") {
    sendAck(requestId, false, "EMAR payload missing formType.");
    return;
  } else if (normalizedPayload.formType && !["acp", "emar", "custom", "initialAssessment"].includes(normalizedPayload.formType)) {
    sendAck(requestId, false, `Unsupported formType: ${normalizedPayload.formType}`);
    return;
  }

  chrome.runtime.sendMessage(
    { type: STORE_PAYLOAD_TYPE, payload: normalizedPayload },
    (response) => {
      if (chrome.runtime.lastError) {
        sendAck(requestId, false, chrome.runtime.lastError.message);
        return;
      }
      if (!response?.ok) {
        sendAck(requestId, false, response?.error || "Failed to store payload.");
        return;
      }
      sendAck(requestId, true);
    }
  );
});
