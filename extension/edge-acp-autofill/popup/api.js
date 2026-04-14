/**
 * api.js — API proxy and network communication layer
 * CareAssurance Extension v0.5.1
 */

import {
  getCareAssuranceUrl,
  CARE_ASSURANCE_URLS,
  buildCareAssuranceTabPatterns,
  createRequestId,
  state,
} from "./state.js";

// ═══════════════════════════════════════════════════════════════════════════
// API PROXY — Route requests through background.js → content-app.js → fetch
// ═══════════════════════════════════════════════════════════════════════════

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableProxyFailure = (response) => {
  if (!response || response.ok) return false;
  if (response.needsTab) return false;
  const status = Number(response.status);
  if (Number.isFinite(status) && RETRYABLE_STATUS_CODES.has(status)) return true;
  const errorText = String(response.error || "").toLowerCase();
  return (
    errorText.includes("timed out") ||
    errorText.includes("timeout") ||
    errorText.includes("network") ||
    errorText.includes("failed to fetch") ||
    errorText.includes("no response from background")
  );
};

/**
 * Send API requests through the extension's relay chain:
 * popup → background.js (CA_API_PROXY_REQUEST) → content-app.js → fetch
 *
 * Tab discovery and content-script injection retries are handled by
 * background.js's forwardProxyRequest — we just dispatch the message.
 *
 * @param {string} endpoint - API path (e.g. "/api/extension/status")
 * @param {string} [method='GET'] - HTTP method
 * @param {object} [body] - Request body (auto-serialised to JSON)
 * @param {object} [options] - Extra options { timeoutMs, maxRetries }
 * @returns {Promise<object>}
 */
export async function apiProxy(endpoint, method = "GET", body = null, options = {}) {
  const timeoutMs = typeof options.timeoutMs === "number" ? options.timeoutMs : 45000;
  const maxRetries = Number.isInteger(options.maxRetries) ? Math.max(0, options.maxRetries) : 2;
  const retryDelayMs = typeof options.retryDelayMs === "number" ? Math.max(100, options.retryDelayMs) : 700;
  const requestId = createRequestId();
  const targetOrigin = getCareAssuranceUrl();

  let lastResponse = { ok: false, error: "Unknown proxy error" };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const backoff = retryDelayMs * (2 ** (attempt - 1));
      const jitter = Math.floor(Math.random() * 250);
      await wait(Math.min(5000, backoff + jitter));
    }

    const response = await new Promise((resolve) => {
      let settled = false;
      const timeoutHandle = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve({ ok: false, error: `Request timed out after ${Math.round(timeoutMs / 1000)}s` });
      }, timeoutMs);

      chrome.runtime.sendMessage(
        {
          type: "CA_API_PROXY_REQUEST",
          endpoint,
          method,
          body,
          requestId,
          targetOrigin,
        },
        (innerResponse) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutHandle);
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message || "Runtime error" });
            return;
          }
          resolve(innerResponse || { ok: false, error: "No response from background" });
        }
      );
    });

    lastResponse = response;
    if (!isRetryableProxyFailure(response) || attempt >= maxRetries) {
      return response;
    }
  }

  return lastResponse;
}

/**
 * Find a connected workspace tab for the given origin
 */
export async function findConnectedWorkspaceTab(targetOrigin) {
  const patterns = buildCareAssuranceTabPatterns(targetOrigin);
  for (const pattern of patterns) {
    const tabs = await chrome.tabs.query({ url: pattern });
    if (tabs.length > 0) {
      return tabs.find((tab) => tab.active) || tabs[0];
    }
  }
  return null;
}

/**
 * Send a message to the page companion content script
 */
export async function sendMessageToPageCompanion(message) {
  const context = state.pageCompanionContext;
  if (!context?.tabId) {
    throw new Error("No live workflow page is attached yet.");
  }

  return await new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(context.tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message || "Could not reach the workflow page."));
        return;
      }
      resolve(response || null);
    });
  });
}
