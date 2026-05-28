/**
 * state.js — Extension state management, storage helpers, and constants
 * CareAssurance Extension v0.6.40
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
  overlayPinned: "caAcpOverlayPinned",
  serverUrl: "caAcpServerUrl",
  lastTab: "caAcpLastTab",
  lastAutofillUser: "caAcpLastAutofillUser",
  displayNameOverride: "caAcpDisplayNameOverride",
  appTheme: "caAcpAppTheme",
  runtimeConfig: "caAcpRuntimeConfig",
  emarSkippedRows: "caAcpEmarSkippedRows",
};

export const MESSAGE_TYPES = _g.MESSAGE_TYPES || {
  storePayload: "CA_EXTENSION_STORE_PAYLOAD",
  startAutofill: "CA_EXTENSION_START_AUTOFILL",
  stepComplete: "CA_EXTENSION_STEP_COMPLETE",
  stepRetry: "CA_EXTENSION_STEP_RETRY",
  emarSkipped: "CA_EXTENSION_EMAR_SKIPPED",
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

export const RUNTIME_CONFIG_DEFAULTS = _g.RUNTIME_CONFIG_DEFAULTS || {
  version: 1,
  careAssurance: {
    defaultOriginHost: "careassurance.uk",
    knownHosts: [
      "careassurance.uk",
      "www.careassurance.uk",
      "care-assurance.onrender.com",
      "care-assurance-api.onrender.com",
      "care-assurance-web.onrender.com",
      "localhost:5000",
      "localhost:3000",
    ],
    workspaceToApiHosts: {
      "careassurance.uk": "care-assurance-api.onrender.com",
      "www.careassurance.uk": "care-assurance-api.onrender.com",
      "care-assurance-web.onrender.com": "care-assurance-api.onrender.com",
    },
  },
  popup: {
    defaultServiceDataGroupId: "1017650",
    autoCollect: {
      documentServiceId: "1000801",
      documentListPath: "/case_document_list",
      initialAssessmentServiceDataGroupId: "1014998",
      initialAssessmentPath: "/case_data_group",
      carePlanDashboardPath: "/eoutcomeservice/branch/case_care_plans_dashboard",
      recencyFirstSections: ["initialAssessment", "carePlan", "additionalDocuments"],
      latestSelectionSections: ["initialAssessment", "carePlan", "additionalDocuments"],
    },
  },
  background: {
    keepAliveIntervalMs: 25000,
    formCompletionFallbackDelayMs: 6000,
    advanceDedupeWindowMs: 120000,
  },
  meta: {
    updatedAt: null,
    updatedBy: null,
  },
};

const fallbackNormalizeRuntimeConfig = (value) => value || RUNTIME_CONFIG_DEFAULTS;
const sharedNormalizeRuntimeConfig = typeof _g.normalizeRuntimeConfig === "function"
  ? _g.normalizeRuntimeConfig
  : fallbackNormalizeRuntimeConfig;
const sharedApplyRuntimeConfig = typeof _g.applyRuntimeConfig === "function"
  ? _g.applyRuntimeConfig
  : fallbackNormalizeRuntimeConfig;
const sharedGetRuntimeConfig = typeof _g.getRuntimeConfig === "function"
  ? _g.getRuntimeConfig
  : (() => RUNTIME_CONFIG_DEFAULTS);

export const DEBUG = Boolean(_g.DEBUG);

export function debugLog(...args) {
  if (!DEBUG) return;
  console.log(...args);
}

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

export function getRuntimeConfig() {
  return sharedGetRuntimeConfig();
}

export function applyRuntimeConfig(config) {
  return sharedApplyRuntimeConfig(config);
}

export async function setRuntimeConfigStorage(config) {
  const normalized = sharedNormalizeRuntimeConfig(config);
  const applied = applyRuntimeConfig(normalized);
  await setStorage({ [STORAGE_KEYS.runtimeConfig]: applied });
  return applied;
}

export function getCareAssuranceUrls() {
  const configured = getRuntimeConfig()?.careAssurance?.knownHosts;
  return Array.isArray(configured) && configured.length > 0 ? configured : CARE_ASSURANCE_URLS;
}

export function getDefaultServiceDataGroupId() {
  return String(getRuntimeConfig()?.popup?.defaultServiceDataGroupId || DEFAULT_SERVICE_DATA_GROUP_ID).trim() || DEFAULT_SERVICE_DATA_GROUP_ID;
}

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

  // Fallback: if session keys were missed, pull them from local in one request.
  const missingSessionKeys = sessionKeys.filter((key) => results[key] === undefined);
  if (missingSessionKeys.length > 0) {
    try {
      const fallback = await chrome.storage.local.get(missingSessionKeys);
      for (const key of missingSessionKeys) {
        if (fallback[key] !== undefined) {
          results[key] = fallback[key];
        }
      }
    } catch { /* ignore */ }
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
      debugLog("[CA Extension] Stale data auto-cleaned (>2h)");
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
  uploadBuckets: {
    socialWork: [],
    initialAssessment: [],
    carePlan: [],
    movingHandling: [],
    additionalDocuments: [],
  },
  selectedFilesList: [],
  currentAnalysisResults: null,
  latestPayloadSnapshot: null,
  extensionStatus: null,
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
  { pattern: /^\/admin\/extension-manager/i, label: "Extension Manager", detail: "Admin workspace for extension packages, runtime config, and rollout status" },
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
  const configuredHostMap = getRuntimeConfig()?.careAssurance?.workspaceToApiHosts;
  const hostMap = configuredHostMap && typeof configuredHostMap === "object"
    ? configuredHostMap
    : WORKSPACE_TO_API_HOSTS;
  if (!host) return "care-assurance-api.onrender.com";
  if (host === "localhost:3000") return "localhost:5000";
  if (host === "127.0.0.1:3000") return "127.0.0.1:5000";
  if (host.endsWith("-web.onrender.com")) {
    return host.replace(/-web\.onrender\.com$/i, "-api.onrender.com");
  }
  return hostMap[host] || host;
}

export function buildCareAssuranceTabPatterns(origin) {
  const raw = String(origin || "").trim();
  const defaultOrigin = String(getRuntimeConfig()?.careAssurance?.defaultOriginHost || CARE_ASSURANCE_URLS[0] || "careassurance.uk").trim();
  if (!raw) {
    return buildCareAssuranceTabPatterns(defaultOrigin);
  }
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
  return getCareAssuranceUrls().some(u => {
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

function pickFirstNonEmptyString(...values) {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) return normalized;
  }
  return "";
}

function getPayloadCaseIdHint(payload) {
  if (!payload || typeof payload !== "object") return "";
  return pickFirstNonEmptyString(
    payload.caseId,
    payload.acpId,
    payload.accessCarePlanningId,
    payload.serviceUser?.acpId,
    payload.serviceUser?.accessCarePlanningId,
    payload.caseInfo?.caseId
  );
}

export function compareExtensionVersions(left, right) {
  const toParts = (value) =>
    String(value || "")
      .split(".")
      .map((part) => Number.parseInt(part, 10))
      .map((part) => (Number.isFinite(part) ? part : 0));

  const leftParts = toParts(left);
  const rightParts = toParts(right);
  const maxLength = Math.max(leftParts.length, rightParts.length, 3);

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }

  return 0;
}

export function buildWorkflowSafetyState(options = {}) {
  const extensionStatus = options.extensionStatus && typeof options.extensionStatus === "object"
    ? options.extensionStatus
    : null;
  const pageContext = options.pageContext && typeof options.pageContext === "object"
    ? options.pageContext
    : null;
  const selectedAutofillUser = options.selectedAutofillUser && typeof options.selectedAutofillUser === "object"
    ? options.selectedAutofillUser
    : null;
  const payload = options.payload && typeof options.payload === "object"
    ? options.payload
    : null;
  const caseId = String(options.caseId || "").trim();
  const serviceDataGroupId = String(options.serviceDataGroupId || "").trim();
  const requireCaseId = Boolean(options.requireCaseId);
  const requireServiceDataGroup = Boolean(options.requireServiceDataGroup);
  const selectedCaseId = String(selectedAutofillUser?.acpId || selectedAutofillUser?.id || "").trim();
  const payloadCaseId = getPayloadCaseIdHint(payload);
  const base = {
    severity: "ready",
    code: "ready",
    title: "Ready",
    detail: "Workflow context is aligned.",
    action: "",
    actionLabel: "",
    shouldBlockStart: false,
    shouldBlockUploadSync: false,
    selectedCaseId,
    payloadCaseId,
  };

  if (pageContext?.requiresPageRefresh) {
    return {
      ...base,
      severity: "blocking",
      code: "page-refresh-required",
      title: "Reload required",
      detail: String(
        pageContext?.detail ||
          "Refresh the attached workflow page so the current extension can reattach before continuing."
      ).trim(),
      action: "reload-page",
      actionLabel: "Reload Page",
      shouldBlockStart: true,
      shouldBlockUploadSync: false,
    };
  }

  if (selectedCaseId && caseId && selectedCaseId !== caseId) {
    return {
      ...base,
      severity: "blocking",
      code: "selected-case-mismatch",
      title: "Target needs realignment",
      detail: `Selected service user is mapped to Case ID ${selectedCaseId}, but the Autofill target is ${caseId}. Align them before continuing.`,
      action: "open-autofill",
      actionLabel: "Realign Target",
      shouldBlockStart: true,
      shouldBlockUploadSync: true,
    };
  }

  if (payloadCaseId && caseId && payloadCaseId !== caseId) {
    return {
      ...base,
      severity: "blocking",
      code: "payload-case-mismatch",
      title: "Payload and target differ",
      detail: `The staged payload is for Case ID ${payloadCaseId}, but the current target is ${caseId}. Review the target before starting Autofill.`,
      action: "open-autofill",
      actionLabel: "Review Target",
      shouldBlockStart: true,
      shouldBlockUploadSync: false,
    };
  }

  if (requireCaseId && !caseId) {
    return {
      ...base,
      severity: "blocking",
      code: "case-id-missing",
      title: "Choose the destination case",
      detail: "Select an Autofill service user or type the Case ID before continuing.",
      action: "open-autofill",
      actionLabel: "Select Target",
      shouldBlockStart: true,
      shouldBlockUploadSync: true,
    };
  }

  if (requireServiceDataGroup && !serviceDataGroupId) {
    return {
      ...base,
      severity: "blocking",
      code: "service-group-missing",
      title: "Service group still missing",
      detail: "Detect or enter the Service Data Group ID before starting Autofill.",
      action: "detect-ids",
      actionLabel: "Detect IDs",
      shouldBlockStart: true,
      shouldBlockUploadSync: false,
    };
  }

  const statusError = String(extensionStatus?.statusError || "").trim();
  let installedVersion = "";
  try {
    installedVersion = String(chrome.runtime?.getManifest?.()?.version || "").trim();
  } catch {
    installedVersion = "";
  }
  const serverVersion = String(extensionStatus?.version || "").trim();
  const versionComparison = installedVersion && serverVersion
    ? compareExtensionVersions(installedVersion, serverVersion)
    : 0;

  if (statusError) {
    return {
      ...base,
      severity: "warning",
      code: "extension-status-error",
      title: "Extension status needs refresh",
      detail: statusError,
      action: "open-status",
      actionLabel: "Review Status",
    };
  }

  if (installedVersion && serverVersion && versionComparison < 0) {
    return {
      ...base,
      severity: "warning",
      code: "update-available",
      title: "Update recommended before a new run",
      detail: `Installed extension v${installedVersion} is behind server v${serverVersion}. Review Extension Status before starting a new Autofill or rollout task.`,
      action: "open-status",
      actionLabel: "Review Status",
    };
  }

  if (installedVersion && serverVersion && versionComparison > 0) {
    return {
      ...base,
      severity: "warning",
      code: "environment-mismatch",
      title: "Version mismatch detected",
      detail: `Installed extension v${installedVersion} is newer than server v${serverVersion}. Confirm you are connected to the correct CareAssurance environment before continuing.`,
      action: "open-status",
      actionLabel: "Review Status",
    };
  }

  return base;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getPayloadAgeSeconds(payloadStoredAt) {
  if (!payloadStoredAt) return null;
  const parsed = new Date(payloadStoredAt);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 1000));
}

export function getInteractionModeDisplay(mode, dryRun) {
  if (dryRun) return "Dry run";
  if (mode === "manual") return "Manual";
  if (mode === "slow") return "Guided";
  return "Auto";
}

export function buildCommandCenterState(snapshot = {}) {
  const metrics = snapshot.metrics && typeof snapshot.metrics === "object" ? snapshot.metrics : {};
  const queueState = snapshot.queueState && typeof snapshot.queueState === "object" ? snapshot.queueState : null;
  const payload = snapshot.payload && typeof snapshot.payload === "object" ? snapshot.payload : null;
  const verificationFields = Array.isArray(snapshot.verificationFields) ? snapshot.verificationFields : [];
  const lastError = snapshot.lastError ? String(snapshot.lastError) : "";
  const interactionMode = snapshot.interactionMode || "auto";
  const dryRun = Boolean(snapshot.dryRun);
  const payloadStoredAt = snapshot.payloadStoredAt || null;

  const proxyRequests = toFiniteNumber(metrics.proxyRequests);
  const proxySuccesses = toFiniteNumber(metrics.proxySuccesses);
  const proxyRetries = toFiniteNumber(metrics.proxyRetries);
  const reliability = proxyRequests > 0
    ? clamp(Math.round((proxySuccesses / proxyRequests) * 100), 0, 100)
    : (lastError ? 0 : 100);

  const hasQueue = queueState && typeof queueState.total === "number";
  const queueCurrent = hasQueue ? toFiniteNumber(queueState.currentIndex) + 1 : 0;
  const queueTotal = hasQueue ? Math.max(0, toFiniteNumber(queueState.total)) : 0;

  let healthClass = "is-idle";
  let healthTitle = "Idle";
  let healthDetail = "Load a payload or start a queue to activate command telemetry.";
  if (lastError) {
    healthClass = "is-critical";
    healthTitle = "Incident";
    healthDetail = lastError;
  } else if (hasQueue) {
    healthClass = "is-live";
    healthTitle = `Running ${Math.max(1, queueCurrent)}/${Math.max(1, queueTotal)}`;
    healthDetail = `Workflow ${queueState.formType || payload?.formType || "autofill"} is active.`;
  } else if (payload) {
    healthClass = "is-ready";
    healthTitle = "Ready";
    healthDetail = `${getPayloadWorkflowLabel(payload)} payload is staged and awaiting run.`;
  }

  const timeline = [];
  if (payloadStoredAt) {
    const payloadAgeSeconds = getPayloadAgeSeconds(payloadStoredAt);
    timeline.push({
      tone: payloadAgeSeconds != null && payloadAgeSeconds > 3600 ? "warn" : "normal",
      text: `Payload snapshot: ${formatPayloadTimestamp(payloadStoredAt)}`,
    });
  }
  if (metrics.lastActivityAt || metrics.lastActivityType) {
    timeline.push({
      tone: "normal",
      text: `Last activity: ${metrics.lastActivityType || "unknown"} at ${formatRuntimeTime(metrics.lastActivityAt)}`,
    });
  }
  if (hasQueue) {
    const normalizedTotal = Math.max(1, queueTotal);
    const normalizedCurrent = clamp(queueCurrent, 1, normalizedTotal);
    timeline.push({
      tone: "normal",
      text: `Queue progress is ${normalizedCurrent}/${normalizedTotal} (${Math.round((normalizedCurrent / normalizedTotal) * 100)}%)`,
    });
  }
  if (verificationFields.length > 0) {
    timeline.push({
      tone: "warn",
      text: `${verificationFields.length} field${verificationFields.length === 1 ? "" : "s"} flagged for review`,
    });
  }
  if (lastError) {
    timeline.push({ tone: "error", text: `Incident: ${lastError}` });
  }
  if (!timeline.length) {
    timeline.push({ tone: "muted", text: "Waiting for runtime activity" });
  }

  const recommendations = [];
  if (!payload) recommendations.push("Load care data from Workspace or Intake to stage payload.");
  if (payload && !hasQueue) recommendations.push("Run a dry run first to verify fields before submitting live.");
  if (verificationFields.length > 0) recommendations.push("Use Next Review Field to resolve flagged values before final submission.");
  if (proxyRequests > 0 && reliability < 90) recommendations.push("Proxy reliability dipped below 90%; inspect diagnostics and network conditions.");
  if (proxyRetries > 0) recommendations.push(`Runtime has retried ${proxyRetries} request${proxyRetries === 1 ? "" : "s"}; confirm host connectivity.`);
  if (lastError) recommendations.push("Clear the incident after resolving the issue, then retry from the current queue item.");
  if (!recommendations.length) recommendations.push("System is healthy. Continue monitoring queue and verification status.");

  const flags = [];
  if (payload?.formType) flags.push({ tone: "normal", label: `Payload ${String(payload.formType).toUpperCase()}` });
  if (hasQueue) flags.push({ tone: "normal", label: `Queue ${Math.max(1, queueCurrent)}/${Math.max(1, queueTotal)}` });
  if (verificationFields.length > 0) flags.push({ tone: "warn", label: `Review ${verificationFields.length}` });
  if (dryRun) flags.push({ tone: "normal", label: "Dry run" });
  if (interactionMode === "manual") flags.push({ tone: "warn", label: "Manual assist" });
  else if (interactionMode === "slow") flags.push({ tone: "normal", label: "Guided typing" });
  if (proxyRetries > 0) flags.push({ tone: proxyRetries > 2 ? "warn" : "normal", label: `Retries ${proxyRetries}` });
  if (payloadStoredAt) {
    const age = getPayloadAgeSeconds(payloadStoredAt);
    if (age != null) {
      const ageMinutes = Math.max(1, Math.floor(age / 60));
      flags.push({ tone: age > 3600 ? "warn" : "muted", label: `Payload age ${ageMinutes}m` });
    }
  }

  return {
    healthClass,
    healthTitle,
    healthDetail,
    reliability,
    reliabilityLabel: `${reliability}%`,
    queueLabel: hasQueue ? `${Math.max(1, queueCurrent)}/${Math.max(1, queueTotal)}` : payload ? "Queued" : "-",
    modeLabel: getInteractionModeDisplay(interactionMode, dryRun),
    timeline,
    recommendations,
    flags,
  };
}

export function buildRuntimeDiagnosticsState(snapshot = {}) {
  const metrics = snapshot.metrics && typeof snapshot.metrics === "object" ? snapshot.metrics : null;
  const lastError = snapshot.lastError ? String(snapshot.lastError) : "";
  const queueState = snapshot.queueState && typeof snapshot.queueState === "object" ? snapshot.queueState : null;
  const payload = snapshot.payload && typeof snapshot.payload === "object" ? snapshot.payload : null;
  const payloadStoredAt = snapshot.payloadStoredAt || null;

  if (!metrics && !lastError) return null;

  const runtimeMetrics = metrics || {};
  const proxyRequests = toFiniteNumber(runtimeMetrics.proxyRequests);
  const proxySuccesses = toFiniteNumber(runtimeMetrics.proxySuccesses);
  const proxyFailures = toFiniteNumber(runtimeMetrics.proxyFailures);
  const proxyRetries = toFiniteNumber(runtimeMetrics.proxyRetries);
  const reliability = proxyRequests > 0
    ? clamp(Math.round((proxySuccesses / proxyRequests) * 100), 0, 100)
    : (lastError ? 0 : 100);
  const retryRate = proxyRequests > 0 ? Math.round((proxyRetries / proxyRequests) * 100) : 0;

  let heartbeatLagSeconds = null;
  if (runtimeMetrics.lastHeartbeatAt) {
    const parsedHeartbeat = new Date(runtimeMetrics.lastHeartbeatAt);
    if (!Number.isNaN(parsedHeartbeat.getTime())) {
      heartbeatLagSeconds = Math.max(0, Math.floor((Date.now() - parsedHeartbeat.getTime()) / 1000));
    }
  }

  const hasQueue = queueState && typeof queueState.total === "number";
  const queueText = hasQueue
    ? `${toFiniteNumber(queueState.currentIndex) + 1}/${Math.max(1, toFiniteNumber(queueState.total))}`
    : payload
    ? "Queued"
    : "Idle";

  let severity = "idle";
  let summary = "Runtime telemetry is waiting for the next request.";
  if (lastError) {
    severity = "critical";
    summary = "Active runtime incident detected. Review and clear when resolved.";
  } else if (proxyRequests === 0 && !hasQueue && !payload) {
    severity = "idle";
  } else if (reliability < 80 || (heartbeatLagSeconds != null && heartbeatLagSeconds > 120)) {
    severity = "critical";
    summary = "Telemetry indicates unstable runtime behavior.";
  } else if (reliability < 95 || proxyRetries > 0 || (heartbeatLagSeconds != null && heartbeatLagSeconds > 45)) {
    severity = "degraded";
    summary = "Runtime is active with minor degradation signals.";
  } else {
    severity = "healthy";
    summary = "Runtime health is stable.";
  }

  const cards = [
    {
      label: "Reliability",
      value: `${reliability}%`,
      tone: reliability >= 95 ? "good" : reliability >= 80 ? "warn" : "error",
    },
    {
      label: "Retry Rate",
      value: `${retryRate}%`,
      tone: retryRate === 0 ? "good" : retryRate < 10 ? "warn" : "error",
    },
    {
      label: "Heartbeat Lag",
      value: heartbeatLagSeconds == null ? "-" : `${heartbeatLagSeconds}s`,
      tone: heartbeatLagSeconds == null ? "muted" : heartbeatLagSeconds <= 45 ? "good" : heartbeatLagSeconds <= 120 ? "warn" : "error",
    },
    {
      label: "Queue",
      value: queueText,
      tone: hasQueue ? "normal" : payload ? "warn" : "muted",
    },
  ];

  const rows = [
    {
      key: "Proxy",
      value: `${proxySuccesses}/${proxyRequests} ok${proxyFailures ? ` (${proxyFailures} failed)` : ""}`,
      muted: proxyRequests === 0,
    },
    {
      key: "Retries / Starts / Stops",
      value: `${proxyRetries} / ${toFiniteNumber(runtimeMetrics.autofillStarts)} / ${toFiniteNumber(runtimeMetrics.autofillStops)}`,
      muted: false,
    },
    {
      key: "Heartbeat",
      value: `${toFiniteNumber(runtimeMetrics.heartbeatCount)} at ${formatRuntimeTime(runtimeMetrics.lastHeartbeatAt)}`,
      muted: false,
    },
    {
      key: "Activity",
      value: `${runtimeMetrics.lastActivityType || "-"} at ${formatRuntimeTime(runtimeMetrics.lastActivityAt)}`,
      muted: !runtimeMetrics.lastActivityType,
    },
    {
      key: "Uptime",
      value: formatRuntimeDuration(runtimeMetrics.workerStartedAt),
      muted: false,
    },
    {
      key: "Request ID",
      value: runtimeMetrics.lastRequestId || "-",
      muted: !runtimeMetrics.lastRequestId,
    },
    {
      key: "Target",
      value: runtimeMetrics.lastTargetOrigin || "-",
      muted: !runtimeMetrics.lastTargetOrigin,
    },
    {
      key: "Payload Stored",
      value: payloadStoredAt ? formatPayloadTimestamp(payloadStoredAt) : "-",
      muted: !payloadStoredAt,
    },
    {
      key: "Updated",
      value: formatRuntimeTime(runtimeMetrics.lastUpdatedAt),
      muted: !runtimeMetrics.lastUpdatedAt,
    },
    {
      key: "Error",
      value: lastError || runtimeMetrics.lastError || "None",
      error: Boolean(lastError || runtimeMetrics.lastError),
      muted: !(lastError || runtimeMetrics.lastError),
    },
  ];

  const alerts = [];
  if (lastError) alerts.push({ tone: "error", text: lastError });
  if (proxyRequests > 0 && reliability < 90) {
    alerts.push({ tone: "warn", text: `Proxy reliability is ${reliability}% across ${proxyRequests} requests.` });
  }
  if (heartbeatLagSeconds != null && heartbeatLagSeconds > 120) {
    alerts.push({ tone: "warn", text: `Heartbeat is stale (${heartbeatLagSeconds}s). Check worker responsiveness.` });
  }
  if (!alerts.length && severity === "healthy") {
    alerts.push({ tone: "normal", text: "No runtime alerts detected." });
  }

  return {
    severity,
    summary,
    cards,
    rows,
    alerts,
  };
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
