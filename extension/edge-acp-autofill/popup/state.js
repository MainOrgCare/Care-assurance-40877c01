/**
 * state.js — Extension state management, storage helpers, and constants
 * CareAssurance Extension v0.6.0
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS (from globalThis set by constants.js, with fallbacks)
// ═══════════════════════════════════════════════════════════════════════════

const _g = globalThis.CA_EXTENSION_CONSTANTS || {};

export const STORAGE_KEYS = _g.STORAGE_KEYS || {
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
  lastError: "caAcpLastError",
  uploadedDocuments: "caAcpUploadedDocuments",
  verificationFields: "caAcpVerificationFields",
  runtimeMetrics: "caAcpRuntimeMetrics",
  serverUrl: "caAcpServerUrl",
  lastTab: "caAcpLastTab",
  lastAutofillUser: "caAcpLastAutofillUser",
};

export const MESSAGE_TYPES = _g.MESSAGE_TYPES || {
  storePayload: "CA_EXTENSION_STORE_PAYLOAD",
  startAutofill: "CA_EXTENSION_START_AUTOFILL",
  stepComplete: "CA_EXTENSION_STEP_COMPLETE",
  log: "CA_EXTENSION_LOG",
  uploadSignature: "CA_EXTENSION_UPLOAD_SIGNATURE",
  stopAutofill: "CA_EXTENSION_STOP_AUTOFILL",
  clearError: "CA_EXTENSION_CLEAR_ERROR",
  toggleOverlay: "CA_EXTENSION_TOGGLE_OVERLAY",
  analyzeRisks: "CA_EXTENSION_ANALYZE_RISKS",
  sendToApp: "CA_EXTENSION_SEND_TO_APP",
  scrollToNextVerification: "CA_EXTENSION_SCROLL_TO_NEXT",
  getVerificationStatus: "CA_EXTENSION_GET_VERIFICATION_STATUS",
};

export const FORM_CONFIGS = _g.FORM_CONFIGS || {
  acp: { url: "https://clece.mobizio.com/new_case_form", formId: "1048191" },
  initialAssessment: { url: "https://clece.mobizio.com/new_case_form", formId: "1040788" },
  emar: { url: "https://clece.mobizio.com/new_case_form", formId: "1044009" },
  custom: { url: "https://clece.mobizio.com/new_case_form" },
};

export const DATA_TIMESTAMP_KEY = STORAGE_KEYS.dataTimestamp || "caAcpDataTimestamp";

export const DEFAULT_SERVICE_DATA_GROUP_ID = "1017650";

// ═══════════════════════════════════════════════════════════════════════════
// SERVER URLS
// ═══════════════════════════════════════════════════════════════════════════

export const CARE_ASSURANCE_URLS = [
  "careassurance.uk",
  "www.careassurance.uk",
  "care-assurance.onrender.com",
  "care-assurance-api.onrender.com",
  "care-assurance-web.onrender.com",
  "localhost:5000",
  "localhost:3000",
];

// Mutable current URL — exported as getter/setter
let _currentUrl = CARE_ASSURANCE_URLS[0];
export function getCareAssuranceUrl() { return _currentUrl; }
export function setCareAssuranceUrl(url) { _currentUrl = url; }

const WORKSPACE_TO_API_HOSTS = {
  "careassurance.uk": "care-assurance-api.onrender.com",
  "www.careassurance.uk": "care-assurance-api.onrender.com",
  "care-assurance-web.onrender.com": "care-assurance-api.onrender.com",
};

// ═══════════════════════════════════════════════════════════════════════════
// STORAGE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const FALLBACK_STORAGE_KEYS = Object.values(STORAGE_KEYS);

const sessionStorageKeySet = new Set([
  STORAGE_KEYS.payload,
  STORAGE_KEYS.dataTimestamp,
  STORAGE_KEYS.caseInfo,
  STORAGE_KEYS.queueState,
  STORAGE_KEYS.signatureData,
  STORAGE_KEYS.signatureBatchId,
  STORAGE_KEYS.uploadedDocuments,
  STORAGE_KEYS.verificationFields,
].filter(Boolean));

function splitStorageKeys(keys) {
  const sessionKeys = [];
  const localKeys = [];
  for (const key of keys) {
    if (sessionStorageKeySet.has(key)) sessionKeys.push(key);
    else localKeys.push(key);
  }
  return { sessionKeys, localKeys };
}

export async function loadStorage(keys) {
  const allKeys = keys || FALLBACK_STORAGE_KEYS;
  const { sessionKeys, localKeys } = splitStorageKeys(allKeys);
  const results = {};

  try {
    if (sessionKeys.length > 0 && chrome.storage.session) {
      const sessionData = await chrome.storage.session.get(sessionKeys);
      Object.assign(results, sessionData);
    }
  } catch { /* session storage unavailable */ }

  try {
    if (localKeys.length > 0) {
      const localData = await chrome.storage.local.get(localKeys);
      Object.assign(results, localData);
    }
  } catch { /* local storage unavailable */ }

  // Fallback: if session keys were missed, try local
  for (const key of sessionKeys) {
    if (results[key] === undefined) {
      try {
        const fallback = await chrome.storage.local.get([key]);
        if (fallback[key] !== undefined) results[key] = fallback[key];
      } catch { /* ignore */ }
    }
  }

  return results;
}

export async function setStorage(items) {
  const sessionItems = {};
  const localItems = {};

  for (const [key, value] of Object.entries(items)) {
    if (sessionStorageKeySet.has(key)) sessionItems[key] = value;
    else localItems[key] = value;
  }

  const tasks = [];
  if (Object.keys(sessionItems).length > 0 && chrome.storage.session) {
    tasks.push(chrome.storage.session.set(sessionItems).catch(() =>
      chrome.storage.local.set(sessionItems)
    ));
  }
  if (Object.keys(localItems).length > 0) {
    tasks.push(chrome.storage.local.set(localItems));
  }
  await Promise.all(tasks);
}

export async function setStorageWithTimestamp(items) {
  items[DATA_TIMESTAMP_KEY] = new Date().toISOString();
  return setStorage(items);
}

export async function autoCleanupStaleData() {
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  try {
    const data = await loadStorage([DATA_TIMESTAMP_KEY]);
    const ts = data[DATA_TIMESTAMP_KEY];
    if (ts && (Date.now() - new Date(ts).getTime()) > TWO_HOURS) {
      await setStorage({
        [STORAGE_KEYS.payload]: null,
        [DATA_TIMESTAMP_KEY]: null,
        [STORAGE_KEYS.queueState]: null,
        [STORAGE_KEYS.verificationFields]: null,
        [STORAGE_KEYS.runtimeMetrics]: null,
      });
      console.log("[CA Extension] Stale data auto-cleaned (>2h)");
    }
  } catch (e) {
    console.warn("[CA Extension] Auto-cleanup failed:", e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MUTABLE STATE
// ═══════════════════════════════════════════════════════════════════════════

export const state = {
  isConnected: false,
  serviceUsers: [],
  acpServiceUsers: [],
  selectedUser: null,
  selectedAutofillUser: null,
  selectedFilesList: [],
  currentAnalysisResults: null,
  latestPayloadSnapshot: null,
  connectedWorkspaceUser: null,
  connectedWorkspaceContext: null,
  isAdmin: false,
  pageCompanionContext: null,
  currentVerificationIndex: -1,
  connectionEstablishedAt: null,
  connectionUptimeTimer: null,
  serviceUserShowCount: 10,
};

// ═══════════════════════════════════════════════════════════════════════════
// DESCRIPTORS
// ═══════════════════════════════════════════════════════════════════════════

export const WORKSPACE_ROUTE_DESCRIPTORS = [
  { pattern: /^\/dashboard/i, label: "Dashboard", detail: "Overview of service user records and recent activity" },
  { pattern: /^\/service-users\/care-planning/i, label: "Care Planning", detail: "Build and manage care plans for service users" },
  { pattern: /^\/service-users\/risk-assessment/i, label: "Risk Assessment", detail: "Assess and document mobility, nutrition, and environmental risks" },
  { pattern: /^\/service-users\/plan-enhancer/i, label: "Plan Enhancer", detail: "AI-assisted enhancement of care and risk plans" },
  { pattern: /^\/shadow-admin-portal/i, label: "Admin Portal", detail: "System-wide management panel for administrators" },
  { pattern: /^\/service-users/i, label: "Service Users", detail: "Directory of all registered service users" },
  { pattern: /^\/$/, label: "Home", detail: "CareAssurance home page" },
];

export const FORM_WORKFLOW_DESCRIPTORS = [
  { key: "acp", urlPattern: /new_case_form.*formId=1048191/i, label: "ACP — Additional Risk Assessments", detail: "Assessment form for risk and care planning entries" },
  { key: "initialAssessment", urlPattern: /new_case_form.*formId=1040788/i, label: "Initial Assessment", detail: "Initial service user assessment form" },
  { key: "emar", urlPattern: /new_case_form.*formId=1044009/i, label: "eMAR — Medication Audit", detail: "Electronic Medication Administration Record form" },
];

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export function escapeHtml(str) {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(String(str ?? "")));
  return div.innerHTML;
}

export function escapeAttr(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatRuntimeTime(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatRuntimeDuration(startTime) {
  if (!startTime) return "-";
  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) return "-";
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000));
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;
    return `${hours}h ${remMinutes}m`;
  }
  return `${minutes}m ${seconds}s`;
}

export function formatPayloadTimestamp(ts) {
  if (!ts) return "Unknown";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "Unknown";
  const now = Date.now();
  const diff = Math.floor((now - d.getTime()) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

export function normalizeCareAssuranceBaseUrl(url) {
  const raw = String(url || "").trim().replace(/\/+$/, "");
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try { const u = new URL(raw); return `${u.protocol}//${u.host}`; } catch { /* fall through */ }
  }
  // Bare hostname — add scheme
  if (raw.includes("localhost") || raw.includes("127.0.0.1")) {
    return `http://${raw}`;
  }
  return `https://${raw}`;
}

export function normalizeCareAssuranceOriginHost(url) {
  const raw = String(url || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try { return new URL(raw).host.toLowerCase(); } catch { /* fall through */ }
  }
  return raw.replace(/^\/+/, "").toLowerCase();
}

export function resolveCareAssuranceApiOrigin(origin) {
  const host = normalizeCareAssuranceOriginHost(origin);
  if (!host) return "care-assurance-api.onrender.com";
  if (host === "localhost:3000") return "localhost:5000";
  if (host === "127.0.0.1:3000") return "127.0.0.1:5000";
  if (host.endsWith("-web.onrender.com")) {
    return host.replace(/-web\.onrender\.com$/i, "-api.onrender.com");
  }
  return WORKSPACE_TO_API_HOSTS[host] || host;
}

export function buildCareAssuranceTabPatterns(origin) {
  const raw = String(origin || "").trim();
  if (!raw) return ["https://careassurance.uk/*", "https://www.careassurance.uk/*"];
  // If it already has a scheme, use it directly
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try { const u = new URL(raw); return [`${u.protocol}//${u.host}/*`]; } catch { /* fall through */ }
  }
  // Bare hostname — match what background.js buildTargetPatterns does
  if (raw.includes("localhost") || raw.includes("127.0.0.1")) {
    return [`http://${raw}/*`];
  }
  if (raw.includes("onrender.com")) {
    return [`https://${raw}/*`];
  }
  return [`https://${raw}/*`, `https://www.${raw}/*`];
}

export function isLikelyCareAssuranceUrl(url) {
  if (!url) return false;
  return CARE_ASSURANCE_URLS.some(u => {
    try {
      const target = new URL(url);
      const baseHost = u.replace(/^(https?:\/\/)?/, "").replace(/\/.*$/, "").toLowerCase();
      return target.host.toLowerCase() === baseHost || target.host.toLowerCase() === `www.${baseHost}`;
    } catch {
      return false;
    }
  });
}

export function describeWorkspaceRoute(pathname) {
  for (const route of WORKSPACE_ROUTE_DESCRIPTORS) {
    if (route.pattern.test(pathname)) return route;
  }
  return { label: "Unknown Page", detail: "Unrecognized CareAssurance workspace path" };
}

export function getPayloadWorkflowLabel(payload) {
  if (!payload) return "No payload";
  const desc = FORM_WORKFLOW_DESCRIPTORS.find(d => d.key === payload.formType);
  return desc ? desc.label : payload.formType || "Unknown";
}

export function createRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function writeToClipboard(value) {
  const text = typeof value === "string" ? value : String(value || "");
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const helper = document.createElement("textarea");
  helper.value = text;
  helper.setAttribute("readonly", "readonly");
  helper.style.position = "fixed";
  helper.style.top = "-1000px";
  helper.style.opacity = "0";
  document.body.appendChild(helper);
  helper.select();
  document.execCommand("copy");
  document.body.removeChild(helper);
}
