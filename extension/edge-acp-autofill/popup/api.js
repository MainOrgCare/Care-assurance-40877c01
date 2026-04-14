/**
 * api.js — API proxy and network communication layer
 * CareAssurance Extension v0.5.0
 */

import {
  getCareAssuranceUrl,
  CARE_ASSURANCE_URLS,
  buildCareAssuranceTabPatterns,
  createRequestId,
  state,
} from "./state.js";

// ═══════════════════════════════════════════════════════════════════════════
// API PROXY — Route requests through content-app.js via background.js
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Send API requests through the extension's relay chain:
 * popup → background.js → content-app.js → fetch (with session cookies)
 *
 * @param {string} path - API path
 * @param {string} [method='GET'] - HTTP method
 * @param {object} [body] - Request body (auto-serialised to JSON)
 * @param {object} [options] - Extra options { timeoutMs }
 * @returns {Promise<object>}
 */
export async function apiProxy(path, method = "GET", body = null, options = {}) {
  const MAX_RETRIES = 2;
  const RETRY_DELAY = 800;
  const TIMEOUT = options.timeoutMs || 30000;
  const targetOrigin = getCareAssuranceUrl();
  const requestId = createRequestId();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const tab = await findActiveContentTab(targetOrigin);
      if (!tab) {
        return { ok: false, error: "No Care Assurance tab found. Please open Care Assurance in a browser tab.", needsTab: true };
      }

      const result = await Promise.race([
        new Promise((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "CA_EXTENSION_SEND_TO_APP",
              tabId: tab.id,
              payload: {
                type: "CA_EXTENSION_API_PROXY",
                path,
                method,
                body,
                targetOrigin,
                requestId,
              },
            },
            (response) => {
              if (chrome.runtime.lastError) {
                resolve({ ok: false, error: chrome.runtime.lastError.message || "Runtime error" });
                return;
              }
              resolve(response || { ok: false, error: "No response from background" });
            }
          );
        }),
        new Promise((resolve) =>
          setTimeout(() => resolve({ ok: false, error: `Request timed out after ${TIMEOUT}ms` }), TIMEOUT)
        ),
      ]);

      if (result.ok || attempt >= MAX_RETRIES || result.needsTab) {
        return result;
      }

      // Retry with exponential backoff + jitter
      const delay = RETRY_DELAY * Math.pow(2, attempt) + Math.random() * 200;
      await new Promise((r) => setTimeout(r, delay));
    } catch (error) {
      if (attempt >= MAX_RETRIES) {
        return { ok: false, error: error.message || "Unknown proxy error" };
      }
      const delay = RETRY_DELAY * Math.pow(2, attempt) + Math.random() * 200;
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  return { ok: false, error: "Request failed after retries" };
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB DISCOVERY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Find a CareAssurance tab to relay API requests through
 */
async function findActiveContentTab(targetOrigin) {
  const patterns = buildCareAssuranceTabPatterns(targetOrigin);
  for (const pattern of patterns) {
    const tabs = await chrome.tabs.query({ url: pattern });
    if (tabs.length > 0) {
      return tabs.find((t) => t.active) || tabs[0];
    }
  }

  // Fallback: try all known URLs
  for (const url of CARE_ASSURANCE_URLS) {
    if (url === targetOrigin) continue;
    const patterns = buildCareAssuranceTabPatterns(url);
    for (const pattern of patterns) {
      const tabs = await chrome.tabs.query({ url: pattern });
      if (tabs.length > 0) return tabs[0];
    }
  }

  return null;
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
