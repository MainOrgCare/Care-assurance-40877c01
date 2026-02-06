const EXTENSION_MESSAGE_TYPE = "CA_SEND_TO_ACP_EXTENSION";
const EMAR_MESSAGE_TYPE = "CA_SEND_TO_EMAR_EXTENSION";
const EXTENSION_ACK_TYPE = "CA_EXTENSION_ACK";
const STORE_PAYLOAD_TYPE = "CA_EXTENSION_STORE_PAYLOAD";

console.log("[CA Extension] content-app.js loaded");

const sendAck = (requestId, ok, error) => {
  console.log("[CA Extension] Sending ACK:", { requestId, ok, error });
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
  if (!event.data) return;
  const isAcpMessage = event.data.type === EXTENSION_MESSAGE_TYPE;
  const isEmarMessage = event.data.type === EMAR_MESSAGE_TYPE;
  if (!isAcpMessage && !isEmarMessage) return;

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
  if (normalizedPayload.formType === "acp" && !Array.isArray(normalizedPayload.assessments)) {
    sendAck(requestId, false, "Invalid ACP payload.");
    return;
  }
  if (normalizedPayload.formType === "emar" && typeof normalizedPayload !== "object") {
    sendAck(requestId, false, "Invalid EMAR payload.");
    return;
  }
  if (isEmarMessage && normalizedPayload.formType !== "emar") {
    sendAck(requestId, false, "EMAR payload missing formType.");
    return;
  }
  if (normalizedPayload.formType && !["acp", "emar", "custom"].includes(normalizedPayload.formType)) {
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
