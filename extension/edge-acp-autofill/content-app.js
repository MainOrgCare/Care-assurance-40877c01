const EXTENSION_MESSAGE_TYPE = "CA_SEND_TO_ACP_EXTENSION";
const EMAR_MESSAGE_TYPE = "CA_SEND_TO_EMAR_EXTENSION";
const EXTENSION_ACK_TYPE = "CA_EXTENSION_ACK";
const STORE_PAYLOAD_TYPE = "CA_EXTENSION_STORE_PAYLOAD";
const API_PROXY_TYPE = "CA_API_PROXY_REQUEST";
const EXTENSION_STATUS_TYPE = "CA_EXTENSION_STATUS";
const EXTENSION_STATUS_REQUEST_TYPE = "CA_EXTENSION_REQUEST_STATUS";
const REQUEST_ID_HEADER = "X-Request-ID";

const CA_DEBUG = window.CA_EXTENSION_CONSTANTS?.DEBUG || false;

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

const getExtensionStatusPayload = (overrides = {}) => {
  try {
    const manifest = chrome.runtime?.getManifest?.() || {};
    return {
      detected: true,
      refreshRequired: false,
      version: typeof manifest.version === "string" ? manifest.version : null,
      name: typeof manifest.name === "string" ? manifest.name : null,
      origin: window.location.origin,
      lastSeenAt: new Date().toISOString(),
      ...overrides,
    };
  } catch (error) {
    return {
      detected: false,
      refreshRequired: true,
      version: null,
      name: null,
      origin: window.location.origin,
      error: error instanceof Error ? error.message : "Extension context unavailable",
      lastSeenAt: new Date().toISOString(),
      ...overrides,
    };
  }
};

const postExtensionStatus = (overrides = {}) => {
  window.postMessage(
    {
      type: EXTENSION_STATUS_TYPE,
      payload: getExtensionStatusPayload(overrides),
    },
    window.location.origin
  );
};

const parseSseStream = async (response) => {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response stream available");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let result = null;
  let lastProgress = null;

  const parseEvent = (rawEvent) => {
    if (!rawEvent || !rawEvent.trim() || rawEvent.startsWith(":")) return null;
    const lines = rawEvent.split("\n");
    let eventType = "";
    const dataLines = [];
    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventType = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      }
    }
    if (!eventType || !dataLines.length) return null;
    return { eventType, dataStr: dataLines.join("\n") };
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r/g, "");
    const messages = buffer.split("\n\n");
    buffer = messages.pop() || "";

    for (const message of messages) {
      const parsed = parseEvent(message);
      if (!parsed) continue;
      let payload;
      try {
        payload = JSON.parse(parsed.dataStr);
      } catch {
        continue;
      }
      if (parsed.eventType === "progress") {
        lastProgress = payload;
      } else if (parsed.eventType === "result") {
        result = payload;
      } else if (parsed.eventType === "error") {
        throw new Error(payload?.message || "Server-side processing failed");
      }
    }
  }

  if (buffer.trim()) {
    const parsed = parseEvent(buffer);
    if (parsed) {
      let payload;
      try {
        payload = JSON.parse(parsed.dataStr);
      } catch {
        payload = null;
      }
      if (!payload) {
        // ignore invalid trailing payloads
      } else if (parsed.eventType === "result") {
        result = payload;
      } else if (parsed.eventType === "error") {
        throw new Error(payload?.message || "Server-side processing failed");
      }
    }
  }

  if (!result) {
    throw new Error("No result received from stream");
  }

  return { result, lastProgress };
};

// ═══════════════════════════════════════════════════════════════════════════
// API PROXY - Allow popup to make authenticated API requests via content script
// ═══════════════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[CA Extension Content] Received message:", message?.type);
  
  if (message.type !== API_PROXY_TYPE) return false;
  
  const { endpoint, method = 'GET', body, requestId } = message;
  console.log(`[CA Extension Content] API proxy request: ${method} ${endpoint}`);
  
  // Make the fetch request (will include session cookie since we're on same origin)
  const fetchOptions = {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Cache-Control': 'no-cache',
      ...(requestId ? { [REQUEST_ID_HEADER]: String(requestId) } : {}),
    }
  };
  
  if (body && method !== 'GET') {
    fetchOptions.body = JSON.stringify(body);
  }
  
  const fullUrl = `${window.location.origin}${endpoint}`;
  console.log(`[CA Extension Content] Fetching: ${fullUrl}`);
  
  fetch(fullUrl, fetchOptions)
    .then(async (res) => {
      console.log(`[CA Extension Content] Fetch response: ${res.status} ${res.statusText} content-type: ${res.headers.get("content-type")}`);
      if (!res.ok) {
        const errorText = await res.text().catch(() => 'Unknown error');
        console.error(`[CA Extension Content] Request failed:`, errorText);
        sendResponse({ 
          ok: false, 
          status: res.status, 
          requestId: requestId || res.headers.get(REQUEST_ID_HEADER) || null,
          error: res.status === 401 ? 'Not logged in' : errorText 
        });
        return;
      }

      // Detect HTML responses on API paths — means session expired or SPA catch-all served
      const contentType = (res.headers.get("content-type") || "").toLowerCase();
      if (contentType.includes("text/html") && endpoint.startsWith("/api")) {
        console.warn(`[CA Extension Content] Got HTML instead of JSON for ${endpoint} — session likely expired`);
        sendResponse({
          ok: false,
          status: 401,
          requestId: requestId || res.headers.get(REQUEST_ID_HEADER) || null,
          error: "Not logged in",
          htmlFallback: true,
        });
        return;
      }

      if (contentType.includes("text/event-stream")) {
        const streamed = await parseSseStream(res);
        sendResponse({
          ok: true,
          data: streamed.result,
          status: res.status,
          requestId: requestId || res.headers.get(REQUEST_ID_HEADER) || null,
          streamed: true,
          lastProgress: streamed.lastProgress,
        });
        return;
      }

      const rawText = await res.text();
      let data = null;
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        data = { message: rawText };
      }
      if (data && typeof data === "object") {
        console.log(`[CA Extension Content] Request successful, data keys:`, Object.keys(data));
      }
      sendResponse({
        ok: true,
        data,
        status: res.status,
        requestId: requestId || res.headers.get(REQUEST_ID_HEADER) || null,
      });
    })
    .catch((error) => {
      console.error('[CA Extension Content] Fetch error:', error);
      sendResponse({ ok: false, requestId: requestId || null, error: error.message });
    });
  
  return true; // Keep message channel open for async response
});

// Notify background that we're ready to proxy requests (retry if service worker isn't up yet)
const notifyReady = (attempt = 0) => {
  try { if (!chrome.runtime?.id) return; } catch { return; }
  chrome.runtime.sendMessage({ 
    type: 'CA_CONTENT_SCRIPT_READY', 
    origin: window.location.origin 
  }).then(() => {
    console.log("[CA Extension Content] Ready notification sent successfully");
  }).catch((err) => {
    const msg = err?.message || "";
    if (msg.includes("context invalidated") || msg.includes("Extension context")) return;
    if (attempt < 3) {
      const delay = 500 * (attempt + 1);
      console.log(`[CA Extension Content] Ready notification retry ${attempt + 1} in ${delay}ms:`, msg);
      setTimeout(() => notifyReady(attempt + 1), delay);
    } else {
      console.warn("[CA Extension Content] Ready notification failed after retries:", msg);
    }
  });
};
notifyReady();
postExtensionStatus();
window.addEventListener("focus", () => postExtensionStatus());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    postExtensionStatus();
  }
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
  if (event.data.type === EXTENSION_STATUS_REQUEST_TYPE) {
    postExtensionStatus();
    return;
  }
  if (!isAcpMessage && !isEmarMessage && !isStorePayloadMessage) return;

  console.log("[CA Extension] Received message:", event.data.type);

  const { requestId, payload } = event.data;
  if (!payload || typeof payload !== "object") {
    sendAck(requestId, false, "Invalid payload.");
    return;
  }
  
  // DEBUG: Show raw payload received from webpage
  if (CA_DEBUG) console.log("[CA Extension DEBUG] Raw payload received:", JSON.stringify(payload, null, 2));
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

  // DEBUG: Show normalized payload being sent to storage
  if (CA_DEBUG) console.log("[CA Extension DEBUG] Normalized payload for storage:", JSON.stringify(normalizedPayload, null, 2));
  
  // Check if extension context is still valid before attempting to send
  const isContextInvalidated = () => {
    try {
      return !chrome.runtime?.id;
    } catch { return true; }
  };

  if (isContextInvalidated()) {
    console.warn("[CA Extension Content] Extension context invalidated — page refresh required.");
    postExtensionStatus({
      detected: false,
      refreshRequired: true,
      error: "Extension was updated. Refresh this page so the new content script can attach.",
    });
    sendAck(requestId, false, "Extension was updated. Please refresh this page (F5) and try again.");
    return;
  }

  // Retry wrapper — MV3 service workers may be asleep when first message arrives
  const sendWithRetry = (attempt = 0) => {
    // Stop retrying if extension was reloaded/updated mid-retry
    if (isContextInvalidated()) {
      postExtensionStatus({
        detected: false,
        refreshRequired: true,
        error: "Extension was updated. Refresh this page so the new content script can attach.",
      });
      sendAck(requestId, false, "Extension was updated. Please refresh this page (F5) and try again.");
      return;
    }
    try {
      chrome.runtime.sendMessage(
        { type: STORE_PAYLOAD_TYPE, payload: normalizedPayload },
        (response) => {
          if (chrome.runtime.lastError) {
            const errMsg = chrome.runtime.lastError.message || "";
            console.warn(`[CA Extension Content] sendMessage attempt ${attempt + 1} failed:`, errMsg);
            // "Extension context invalidated" is unrecoverable — don't retry
            if (errMsg.includes("context invalidated") || errMsg.includes("Extension context")) {
              postExtensionStatus({
                detected: false,
                refreshRequired: true,
                error: "Extension was updated. Refresh this page so the new content script can attach.",
              });
              sendAck(requestId, false, "Extension was updated. Please refresh this page (F5) and try again.");
              return;
            }
            if (attempt < 2) {
              setTimeout(() => sendWithRetry(attempt + 1), attempt === 0 ? 500 : 1200);
              return;
            }
            sendAck(requestId, false, "Extension background service unavailable — please try again.");
            return;
          }
          if (!response?.ok) {
            sendAck(requestId, false, response?.error || "Failed to store payload.");
            return;
          }
          sendAck(requestId, true);
        }
      );
    } catch (e) {
      const msg = e?.message || "";
      console.warn(`[CA Extension Content] sendMessage attempt ${attempt + 1} threw:`, msg);
      if (msg.includes("context invalidated") || msg.includes("Extension context")) {
        postExtensionStatus({
          detected: false,
          refreshRequired: true,
          error: "Extension was updated. Refresh this page so the new content script can attach.",
        });
        sendAck(requestId, false, "Extension was updated. Please refresh this page (F5) and try again.");
        return;
      }
      if (attempt < 2) {
        setTimeout(() => sendWithRetry(attempt + 1), attempt === 0 ? 500 : 1200);
        return;
      }
      sendAck(requestId, false, "Extension background service unavailable — please try again.");
    }
  };
  sendWithRetry();
});
