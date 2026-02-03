const EXTENSION_MESSAGE_TYPE = "CA_SEND_TO_ACP_EXTENSION";
const EXTENSION_ACK_TYPE = "CA_EXTENSION_ACK";

// Use MESSAGE_TYPES from constants.js (already loaded) or fallback
const APP_MESSAGE_TYPES = window.CA_EXTENSION_CONSTANTS?.MESSAGE_TYPES || {};

const sendAck = (requestId, ok, error) => {
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

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (!event.data || event.data.type !== EXTENSION_MESSAGE_TYPE) return;

  const { requestId, payload } = event.data;
  if (!payload || !Array.isArray(payload.assessments)) {
    sendAck(requestId, false, "Invalid payload.");
    return;
  }

  chrome.runtime.sendMessage(
    { type: APP_MESSAGE_TYPES?.storePayload || "CA_EXTENSION_STORE_PAYLOAD", payload },
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
