/**
 * api.js — API proxy and network communication layer
 * CareAssurance Extension v0.6.40
 */

import {
  getCareAssuranceUrl,
  buildCareAssuranceTabPatterns,
  createRequestId,
  normalizeCareAssuranceBaseUrl,
  resolveCareAssuranceApiOrigin,
  setRuntimeConfigStorage,
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
  const workspaceOrigin = getCareAssuranceUrl();
  const apiOrigin = resolveCareAssuranceApiOrigin(workspaceOrigin);

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
          targetOrigin: workspaceOrigin,
          apiOrigin,
        },
        (innerResponse) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutHandle);
          if (chrome.runtime.lastError) {
            console.warn("[CA Extension] Proxy bridge error", { endpoint, method, requestId, error: chrome.runtime.lastError.message });
            resolve({ ok: false, error: chrome.runtime.lastError.message || "Runtime error" });
            return;
          }
          if (!innerResponse) {
            console.warn("[CA Extension] Proxy bridge returned no response", { endpoint, method, requestId });
            resolve({ ok: false, error: "No response from background" });
            return;
          }
          resolve(innerResponse);
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

export async function fetchExtensionRuntimeConfig(options = {}) {
  const response = await apiProxy("/api/extension/runtime-config", "GET", null, {
    timeoutMs: typeof options.timeoutMs === "number" ? options.timeoutMs : 30000,
    maxRetries: Number.isInteger(options.maxRetries) ? options.maxRetries : 1,
  });

  if (!response?.ok) {
    return response;
  }

  const payload = response.data || response;
  const runtimeConfig = await setRuntimeConfigStorage(payload?.config || payload || null);
  return {
    ...response,
    data: {
      ...payload,
      config: runtimeConfig,
    },
  };
}

function readDownloadFilename(response, fallback = "careassurance-edge-acp-autofill.zip") {
  const contentDisposition = String(response.headers.get("content-disposition") || "").trim();
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]).trim() || fallback;
    } catch {
      // ignore malformed encoding
    }
  }

  const fileNameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  if (fileNameMatch?.[1]) {
    return fileNameMatch[1].trim() || fallback;
  }

  const version = String(response.headers.get("X-Extension-Version") || "").trim();
  return version
    ? fallback.replace(/(\.zip|\.crx)$/i, `-v${version}$1`)
    : fallback;
}

async function readDownloadErrorMessage(response, fallback) {
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  try {
    if (contentType.includes("application/json")) {
      const payload = await response.json();
      const message = String(payload?.message || payload?.error || "").trim();
      if (message) return message;
    }
  } catch {
    // ignore JSON parse failures
  }

  try {
    const text = String(await response.text() || "").trim();
    if (text) return text;
  } catch {
    // ignore text parse failures
  }

  return fallback;
}

export async function downloadExtensionPackage(options = {}) {
  const workspaceOrigin = getCareAssuranceUrl();
  const apiOrigin = resolveCareAssuranceApiOrigin(workspaceOrigin);
  const apiBaseUrl = normalizeCareAssuranceBaseUrl(apiOrigin);
  const forceFresh = options?.fresh === true;
  const updateVersion = options?.updateVersion === true;
  const format = String(options?.format || "zip").toLowerCase() === "crx" ? "crx" : "zip";
  const endpointBase = format === "crx"
    ? "/api/admin/extension/package.crx"
    : "/api/admin/extension/package";
  const query = new URLSearchParams();
  if (forceFresh) query.set("fresh", "1");
  if (updateVersion && format === "zip") query.set("update", "1");
  const endpoint = query.size ? `${endpointBase}?${query.toString()}` : endpointBase;
  const fallbackFilename = format === "crx"
    ? "careassurance-edge-acp-autofill.crx"
    : "careassurance-edge-acp-autofill.zip";
  const errorFallback = format === "crx"
    ? "Could not download the extension CRX package."
    : "Could not download the extension package.";
  const response = await fetch(`${apiBaseUrl}${endpoint}`, {
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      await readDownloadErrorMessage(response, errorFallback)
    );
  }

  const blob = await response.blob();
  const filename = readDownloadFilename(response, fallbackFilename);
  const downloadUrl = URL.createObjectURL(blob);

  try {
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = filename;
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  }

  return {
    filename,
    format,
    version: String(response.headers.get("X-Extension-Version") || "").trim() || null,
    previousVersion: String(response.headers.get("X-Extension-Previous-Version") || "").trim() || null,
    versionUpdated: String(response.headers.get("X-Extension-Version-Updated") || "").trim() === "1",
  };
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
