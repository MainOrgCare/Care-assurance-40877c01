/**
 * main.js — Entry point: event binding, connection flow, and initialization
 * CareAssurance Extension v0.6.40
 */

import {
  STORAGE_KEYS,
  DATA_TIMESTAMP_KEY,
  MESSAGE_TYPES,
  FORM_WORKFLOW_DESCRIPTORS,
  debugLog,
  state,
  getCareAssuranceUrl,
  setCareAssuranceUrl,
  getCareAssuranceUrls,
  getRuntimeConfig,
  applyRuntimeConfig,
  loadStorage,
  setStorage,
  setStorageWithTimestamp,
  autoCleanupStaleData,
  escapeHtml,
  normalizeCareAssuranceBaseUrl,
  describeWorkspaceRoute,
  isLikelyCareAssuranceUrl,
  getPayloadWorkflowLabel,
  createRequestId,
  writeToClipboard,
  buildWorkflowSafetyState,
  buildCommandCenterState,
  buildRuntimeDiagnosticsState,
  buildAutofillPreviewSummary,
} from "./state.js";

import {
  apiProxy,
  downloadExtensionPackage,
  fetchExtensionRuntimeConfig,
  findConnectedWorkspaceTab,
  sendMessageToPageCompanion,
  reportExtensionError,
} from "./api.js";

import {
  dom,
  cacheDomElements,
  switchTab,
  showError,
  showSuccess,
  showInfo,
  setButtonLoading,
  setFieldInvalid,
  clearFieldInvalid,
  showConfirmDialog,
  showHelpGuideDialog,
  showAutofillPreviewDialog,
  updateConnectionUI,
  renderExtensionHealth,
  renderWorkspaceContext,
  displayServiceUsers,
  selectUser,
  renderAutofillUserDropdown,
  selectAutofillUser,
  renderPayloadInspector,
  renderPayloadReview,
  renderCommandCenter,
  renderRuntimeDiagnostics,
  renderLogs,
  updateLiveProgress,
  renderEmarSkippedBanner,
  buildEmarSkippedRowsCsv,
  renderPageCompanion,
  renderAutofillSessionSummary,
  renderCaseContextStrip,
  displayAnalysisResults,
  updateSelectionCount,
  updateTabBadges,
  updateUploadSteps,
  refreshExtensionVersionDisplay,
  checkPayloadSize,
  showSkeleton,
  hideSkeleton,
} from "./ui.js";

const POPUP_REFRESH_DEBOUNCE_MS = 180;
const POPUP_PERIODIC_REFRESH_MS = 12000;
const POPUP_WORKSPACE_REFRESH_COOLDOWN_MS = 9000;
const POPUP_GDPR_CLEANUP_MS = 30 * 60 * 1000;
const POPUP_IDLE_TASK_DEFAULT_TIMEOUT_MS = 2000;
const POPUP_IDLE_TASK_DEFAULT_FALLBACK_MS = 250;
const PAGE_COMPANION_EXTENSION_STATUS_REQUEST_TYPE = "CA_EXTENSION_REQUEST_STATUS";
const PAGE_COMPANION_RECEIVER_MISSING_PATTERNS = [
  /receiving end does not exist/i,
  /could not establish connection/i,
  /message port closed/i,
  /no extension status response from the page/i,
];
const POPUP_SUPPORTED_APP_THEMES = new Set(["light", "sunrise", "dark", "midnight", "ocean", "aurora"]);
const POPUP_DARK_APP_THEMES = new Set(["dark", "midnight", "ocean", "aurora"]);
const POPUP_INITIAL_STORAGE_KEYS = [
  STORAGE_KEYS.overlayPinned,
  STORAGE_KEYS.serverUrl,
  STORAGE_KEYS.lastTab,
  STORAGE_KEYS.lastAutofillUser,
  STORAGE_KEYS.displayNameOverride,
  STORAGE_KEYS.payload,
  STORAGE_KEYS.appTheme,
  STORAGE_KEYS.runtimeConfig,
  STORAGE_KEYS.emarSkippedRows,
];

const getPopupAutoCollectConfig = () => getRuntimeConfig()?.popup?.autoCollect || {};

const getMobizioDocumentServiceId = () =>
  String(getPopupAutoCollectConfig().documentServiceId || "1000801").trim() || "1000801";

const getMobizioDocumentListPath = () =>
  String(getPopupAutoCollectConfig().documentListPath || "/case_document_list").trim() || "/case_document_list";

const getMobizioInitialAssessmentServiceDataGroupId = () =>
  String(getPopupAutoCollectConfig().initialAssessmentServiceDataGroupId || "1014998").trim() || "1014998";

const getMobizioInitialAssessmentPath = () =>
  String(getPopupAutoCollectConfig().initialAssessmentPath || "/case_data_group").trim() || "/case_data_group";

const getMobizioCarePlanDashboardPath = () =>
  String(getPopupAutoCollectConfig().carePlanDashboardPath || "/eoutcomeservice/branch/case_care_plans_dashboard").trim() || "/eoutcomeservice/branch/case_care_plans_dashboard";

const buildExtensionPackageDownloadSuccessMessage = ({
  filename,
  format = "zip",
  rebuilt = false,
  refreshed = false,
  versionUpdated = false,
  previousVersion = null,
  version = null,
}) => {
  const actionPrefix = rebuilt ? "Rebuilt and started downloading" : "Downloading";
  const installHint = format === "crx"
    ? "Open Edge Extensions and install the CRX if direct installs are allowed in your environment."
    : "Extract the ZIP, then use Load unpacked in Edge Extensions.";
  const refreshHint = refreshed ? " Extension status refreshed." : "";
  const versionHint = versionUpdated && previousVersion && version
    ? `Bumped manifest version from v${previousVersion} to v${version} and started downloading`
    : actionPrefix;
  return `${versionHint} ${filename}. ${installHint}${refreshHint}`;
};

const normalizePopupAppTheme = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return POPUP_SUPPORTED_APP_THEMES.has(normalized) ? normalized : "light";
};

const applyPopupAppTheme = (themeValue) => {
  const theme = normalizePopupAppTheme(themeValue);
  const isDark = POPUP_DARK_APP_THEMES.has(theme);

  document.documentElement.setAttribute("data-app-theme", theme);
  document.body?.setAttribute("data-app-theme", theme);
  document.documentElement.classList.toggle("is-app-theme-dark", isDark);
  document.body?.classList.toggle("is-app-theme-dark", isDark);

  document.documentElement.style.colorScheme = isDark ? "dark" : "light";
  if (document.body) {
    document.body.style.colorScheme = isDark ? "dark" : "light";
  }
};

const runPopupIdleTask = (
  task,
  {
    timeout = POPUP_IDLE_TASK_DEFAULT_TIMEOUT_MS,
    fallbackDelay = POPUP_IDLE_TASK_DEFAULT_FALLBACK_MS,
  } = {}
) => {
  if (typeof task !== "function") return;

  const win = window;
  if (typeof win.requestIdleCallback === "function") {
    win.requestIdleCallback(
      () => {
        try {
          const result = task();
          if (result && typeof result.then === "function") {
            result.catch((error) => {
              console.warn("[CA Extension] idle task failed:", error);
            });
          }
        } catch (error) {
          console.warn("[CA Extension] idle task crashed:", error);
        }
      },
      { timeout }
    );
    return;
  }

  window.setTimeout(() => {
    try {
      const result = task();
      if (result && typeof result.then === "function") {
        result.catch((error) => {
          console.warn("[CA Extension] deferred task failed:", error);
        });
      }
    } catch (error) {
      console.warn("[CA Extension] deferred task crashed:", error);
    }
  }, fallbackDelay);
};

let popupRefreshTimer = null;
let popupRefreshInFlight = false;
let popupRefreshQueued = false;
let popupRefreshPayloadRequested = false;
let popupRefreshWorkspaceRequested = false;
let popupRefreshForceWorkspace = false;
let lastWorkspaceRefreshAt = 0;
let lastLogFingerprint = "";
let lastPayloadAutofillSyncKey = "";
let lastPayloadAutofillAttemptKey = "";
let pendingPayloadAutofillContext = null;
let lastVerificationNavigationKey = "";
let extensionHealthActionInFlight = false;

const setExtensionStatusSnapshot = (snapshot) => {
  state.extensionStatus = snapshot || null;
  renderExtensionHealth(state.extensionStatus);
};

async function refreshExtensionHealthStatus() {
  if (!state.isConnected) {
    setExtensionStatusSnapshot(null);
    return null;
  }

  const statusRes = await apiProxy("/api/extension/status", "GET", null, {
    timeoutMs: 20000,
    maxRetries: 1,
  });

  if (!statusRes?.ok) {
    const statusError = statusRes?.error || "Failed to load extension status.";
    const snapshot = state.extensionStatus
      ? { ...state.extensionStatus, statusError }
      : { statusError };
    setExtensionStatusSnapshot(snapshot);
    throw new Error(statusError);
  }

  const payload = statusRes.data || statusRes;
  setExtensionStatusSnapshot(payload);
  return payload;
}

const buildLogFingerprint = (logs) => {
  if (!Array.isArray(logs) || logs.length === 0) return "0";
  const lastEntry = logs[logs.length - 1] || "";
  return `${logs.length}:${String(lastEntry)}`;
};

const normalizeVerificationFieldLabel = (field, index) => {
  const preferred = [field?.field, field?.name, field?.id, field?.label];
  for (const value of preferred) {
    const normalized = String(value || "").trim();
    if (normalized) return normalized;
  }
  return `field-${index}`;
};

const buildVerificationNavigationKey = (pageContext, verificationFields) => {
  const tabKey = String(pageContext?.tabId || pageContext?.routeLabel || "no-page");
  const fieldKey = Array.isArray(verificationFields) && verificationFields.length > 0
    ? verificationFields
        .map((field, index) => `${normalizeVerificationFieldLabel(field, index)}:${String(field?.reason || "")}`)
        .join("|")
    : "none";
  return `${tabKey}|${fieldKey}`;
};

const syncVerificationNavigationState = (pageContext, verificationFields) => {
  const nextKey = buildVerificationNavigationKey(pageContext, verificationFields);
  if (nextKey === lastVerificationNavigationKey) return;
  lastVerificationNavigationKey = nextKey;
  state.currentVerificationIndex = -1;
};

const pickFirstNonEmptyString = (...values) => {
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) return normalized;
  }
  return "";
};

const normalizePersonMatchValue = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeInitialsMatchValue = (value) =>
  String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();

const buildAcpUserFingerprint = () => {
  if (!Array.isArray(state.acpServiceUsers) || state.acpServiceUsers.length === 0) {
    return "none";
  }
  return state.acpServiceUsers
    .map((user) => `${String(user?.acpId || user?.id || "").trim()}:${normalizePersonMatchValue(user?.name)}`)
    .join("|");
};

const extractPayloadAutofillContext = (payload, payloadStoredAt) => {
  if (!payload || typeof payload !== "object") return null;

  const storedMarker = String(payloadStoredAt ?? "").trim();
  if (!storedMarker) return null;

  const serviceUserName = pickFirstNonEmptyString(
    payload.serviceUserDisplayName,
    payload.serviceUserName,
    payload.serviceUser?.name,
    payload.serviceUser?.fullName,
    payload.metadata?.serviceUserName
  );
  const serviceUserInitials = pickFirstNonEmptyString(
    payload.serviceUserInitials,
    payload.initials,
    payload.serviceUser?.initials
  );
  const caseIdHint = pickFirstNonEmptyString(
    payload.caseId,
    payload.acpId,
    payload.accessCarePlanningId,
    payload.serviceUser?.acpId,
    payload.serviceUser?.accessCarePlanningId,
    payload.caseInfo?.caseId
  );

  const normalizedName = normalizePersonMatchValue(serviceUserName);
  const normalizedInitials = normalizeInitialsMatchValue(serviceUserInitials);

  if (!caseIdHint && !normalizedName && !normalizedInitials) return null;

  return {
    syncKey: [storedMarker, caseIdHint, normalizedName, normalizedInitials].join("|"),
    caseIdHint,
    normalizedName,
    normalizedInitials,
  };
};

const findAutofillUserFromPayloadContext = (context) => {
  if (!context || !Array.isArray(state.acpServiceUsers) || state.acpServiceUsers.length === 0) {
    return null;
  }

  const indexedUsers = state.acpServiceUsers
    .map((user) => ({
      user,
      acpId: String(user?.acpId || user?.id || "").trim(),
      normalizedName: normalizePersonMatchValue(user?.name),
      normalizedInitials: normalizeInitialsMatchValue(user?.initials),
    }))
    .filter((entry) => entry.acpId);

  if (indexedUsers.length === 0) return null;

  if (context.caseIdHint) {
    const byId = indexedUsers.find((entry) => entry.acpId === context.caseIdHint);
    if (byId) return byId.user;
  }

  if (context.normalizedName) {
    const exactNameMatches = indexedUsers.filter(
      (entry) => entry.normalizedName && entry.normalizedName === context.normalizedName
    );
    if (exactNameMatches.length === 1) return exactNameMatches[0].user;
    if (exactNameMatches.length > 1 && context.normalizedInitials) {
      const byInitials = exactNameMatches.find(
        (entry) => entry.normalizedInitials === context.normalizedInitials
      );
      if (byInitials) return byInitials.user;
    }
  }

  if (context.normalizedInitials) {
    const initialsMatches = indexedUsers.filter(
      (entry) => entry.normalizedInitials && entry.normalizedInitials === context.normalizedInitials
    );
    if (initialsMatches.length === 1) return initialsMatches[0].user;
  }

  return null;
};

const maybeSyncAutofillUserFromPayload = async (payload, payloadStoredAt, storedCaseInfo = null) => {
  const context = pendingPayloadAutofillContext || extractPayloadAutofillContext(payload, payloadStoredAt);
  if (!context) {
    pendingPayloadAutofillContext = null;
    return;
  }

  if (context.syncKey === lastPayloadAutofillSyncKey) {
    pendingPayloadAutofillContext = null;
    return;
  }

  pendingPayloadAutofillContext = context;

  const attemptKey = `${context.syncKey}|${buildAcpUserFingerprint()}`;
  if (attemptKey === lastPayloadAutofillAttemptKey) return;
  lastPayloadAutofillAttemptKey = attemptKey;

  const matchedUser = findAutofillUserFromPayloadContext(context);
  if (!matchedUser) return;

  const normalizedMatch = {
    acpId: String(matchedUser?.acpId || matchedUser?.id || "").trim(),
    name: String(matchedUser?.name || "Unknown"),
    initials: String(matchedUser?.initials || "??"),
  };
  if (!normalizedMatch.acpId) return;

  if (String(state.selectedAutofillUser?.acpId || "").trim() !== normalizedMatch.acpId) {
    selectAutofillUser(normalizedMatch);
  } else if (dom.caseId && String(dom.caseId.value || "").trim() !== normalizedMatch.acpId) {
    dom.caseId.value = normalizedMatch.acpId;
  }

  const previousCaseInfo =
    storedCaseInfo && typeof storedCaseInfo === "object" ? storedCaseInfo : null;
  const existingCaseId = String(previousCaseInfo?.caseId || "").trim();
  const serviceDataGroupId = String(
    dom.serviceDataGroupId?.value ?? previousCaseInfo?.serviceDataGroupId ?? ""
  ).trim();

  if (existingCaseId !== normalizedMatch.acpId) {
    await setStorage({
      [STORAGE_KEYS.caseInfo]: {
        caseId: normalizedMatch.acpId,
        serviceDataGroupId,
      },
    });
  }

  lastPayloadAutofillSyncKey = context.syncKey;
  pendingPayloadAutofillContext = null;
};

const MAX_UPLOAD_SYNC_BYTES = 35 * 1024 * 1024;
const MAX_UPLOAD_TOTAL_FILES = 80;
const UPLOAD_SYNC_DEBOUNCE_MS = 450;
const MAX_UPLOAD_SYNC_ATTEMPTS = 6;
const URL_UPLOAD_EXTENSION_BY_MIME = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/csv": "csv",
};
const SUPPORTED_UPLOAD_EXTENSIONS = ["pdf", "doc", "docx", "txt", "csv"];

const SECTION_AUTO_COLLECT_RULES = {
  socialWork: {
    sectionLabel: "Social Work",
    keywords: ["social work", "social worker", "support plan", "support plans", "referral", "email"],
    single: false,
  },
  initialAssessment: {
    sectionLabel: "Initial Assessment",
    keywords: [
      "initial assessment",
      "initial visit",
      "service setup",
      "needs assessment",
      "care needs assessment",
      "assessment intake",
      "initial review",
    ],
    single: false,
  },
  carePlan: {
    sectionLabel: "Care Plan",
    keywords: ["care plan", "careplan", "care planning", "support plan", "workplan", "work plan"],
    single: true,
  },
  movingHandling: {
    sectionLabel: "Moving & Handling",
    keywords: ["moving", "handling", "manual handling", "hoist", "transfer"],
    single: true,
  },
  additionalDocuments: {
    sectionLabel: "Additional Documents",
    keywords: [],
    single: false,
  },
};

const UPLOAD_SECTION_CONFIG = [
  {
    key: "socialWork",
    heading: "=== SOCIAL WORK DOCUMENTS ===",
    inputId: "upload-social-work-input",
    listId: "upload-social-work-files",
    single: false,
  },
  {
    key: "initialAssessment",
    heading: "=== INITIAL ASSESSMENT ===",
    inputId: "upload-initial-assessment-input",
    listId: "upload-initial-assessment-files",
    single: false,
  },
  {
    key: "carePlan",
    heading: "=== CARE PLAN ===",
    inputId: "upload-care-plan-input",
    listId: "upload-care-plan-files",
    single: true,
  },
  {
    key: "movingHandling",
    heading: "=== MOVING AND HANDLING PLAN ===",
    inputId: "upload-moving-handling-input",
    listId: "upload-moving-handling-files",
    single: true,
  },
  {
    key: "additionalDocuments",
    heading: "=== ADDITIONAL DOCUMENTS ===",
    inputId: "upload-additional-documents-input",
    listId: "upload-additional-documents-files",
    single: false,
  },
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let uploadSyncTimer = null;
let uploadSyncInFlight = false;
let uploadSyncQueued = false;
let uploadSyncForceQueued = false;
let lastUploadSyncSignature = "";
let autoCollectInfoSnapshot = null;
let autoCollectInFlight = false;
let analyzeInFlight = false;
let droppedLinkDownloadInFlight = false;

let popupMenuDragWindowId = null;
let popupMenuDragState = null;
let popupMenuDragHandles = [];
let popupMenuMoveQueued = null;
let popupMenuMoveInFlight = false;
let popupMenuDragRequiresDetach = false;
let popupMenuDetachInFlight = false;

const createEmptyUploadBuckets = () => ({
  socialWork: [],
  initialAssessment: [],
  carePlan: [],
  movingHandling: [],
  additionalDocuments: [],
});

const formatUploadBytes = (bytes) => {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  const kb = value / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

const ensureUploadBuckets = () => {
  if (!state.uploadBuckets || typeof state.uploadBuckets !== "object") {
    state.uploadBuckets = createEmptyUploadBuckets();
  }
  for (const section of Object.keys(createEmptyUploadBuckets())) {
    if (!Array.isArray(state.uploadBuckets[section])) {
      state.uploadBuckets[section] = [];
    }
  }
};

const flattenUploadBuckets = () => {
  ensureUploadBuckets();
  return UPLOAD_SECTION_CONFIG.flatMap((section) =>
    (state.uploadBuckets[section.key] || []).map((file) => ({ section: section.key, file }))
  );
};

const buildUploadFileFingerprint = (file) => {
  const safeName = String(file?.name || "").trim().toLowerCase();
  const safeSize = Number(file?.size || 0);
  const safeModified = Number(file?.lastModified || 0);
  return `${safeName}:${safeSize}:${safeModified}`;
};

const getUploadStageStats = () => {
  const stagedEntries = flattenUploadBuckets();
  const sectionSet = new Set(stagedEntries.map((entry) => String(entry?.section || "").trim()).filter(Boolean));
  const totalBytes = stagedEntries.reduce((sum, entry) => sum + Number(entry?.file?.size || 0), 0);

  return {
    fileCount: stagedEntries.length,
    sectionCount: sectionSet.size,
    totalBytes,
  };
};

const isUploadWorkflowBusy = () =>
  uploadSyncInFlight || autoCollectInFlight || analyzeInFlight || droppedLinkDownloadInFlight;

const getUploadWorkflowBusyMessage = () => {
  if (uploadSyncInFlight) {
    return "Sending staged files to CareAssurance Upload...";
  }
  if (autoCollectInFlight) {
    return "Auto-collect is running. Please wait...";
  }
  if (analyzeInFlight) {
    return "AI analysis is running. Please wait...";
  }
  if (droppedLinkDownloadInFlight) {
    return "Downloading dropped links...";
  }
  return "";
};

const updateUploadSyncSummary = () => {
  if (!dom.uploadSyncSummary) return;

  const stats = getUploadStageStats();
  const caseId = getCaseIdForAutoCollect();

  if (stats.fileCount <= 0) {
    dom.uploadSyncSummary.dataset.state = "idle";
    dom.uploadSyncSummary.textContent = state.isConnected
      ? "No files staged yet. Add files or run Auto-Collect to begin."
      : "No files staged yet. Connect workspace, then add files or run Auto-Collect.";
    return;
  }

  const summaryParts = [
    `${stats.fileCount} staged file${stats.fileCount === 1 ? "" : "s"}`,
    `${formatUploadBytes(stats.totalBytes)}`,
    `${stats.sectionCount} section${stats.sectionCount === 1 ? "" : "s"}`,
  ];

  if (caseId) {
    summaryParts.push(`Case ID ${caseId}`);
  } else {
    summaryParts.push("No Case ID selected yet");
  }

  dom.uploadSyncSummary.dataset.state = state.isConnected ? "ready" : "attention";
  dom.uploadSyncSummary.textContent = summaryParts.join(" • ");
};

const setUploadHandoffButton = (button, config = {}) => {
  if (!button) return;

  const {
    label = "Open Autofill",
    action = "open-autofill",
    disabled = false,
  } = config;

  button.textContent = label;
  button.dataset.action = action;
  button.disabled = Boolean(disabled);
};

const renderUploadHandoffSummary = () => {
  if (!dom.uploadHandoffState || !dom.uploadHandoffMeta) return;

  const stats = getUploadStageStats();
  const caseId = getCaseIdForAutoCollect();
  const serviceDataGroupId = String(dom.serviceDataGroupId?.value || "").trim();
  const targetName = String(
    state.selectedAutofillUser?.name || state.selectedUser?.name || ""
  ).trim();
  const analysisCount = Number(state.currentAnalysisResults?.recommendedAssessments?.length || 0);
  const analysisReady = analysisCount > 0 && dom.selectionSection && !dom.selectionSection.hidden;
  const busyMessage = getUploadWorkflowBusyMessage();
  const workflowSafety = buildWorkflowSafetyState({
    extensionStatus: state.extensionStatus,
    selectedAutofillUser: state.selectedAutofillUser,
    caseId,
    serviceDataGroupId,
    requireCaseId: stats.fileCount > 0 || analysisReady,
    requireServiceDataGroup: false,
  });
  const stageLabel =
    stats.fileCount > 0
      ? `${stats.fileCount} file${stats.fileCount === 1 ? "" : "s"} • ${formatUploadBytes(stats.totalBytes)}`
      : "0 files";

  let stateClass = "is-idle";
  let title = "No upload target selected";
  let detail = "Choose an Autofill service user or enter a Case ID before staging a handoff.";
  let readiness = "Waiting for setup";
  let primaryAction = { label: "Open Autofill", action: "open-autofill", disabled: false };
  let recommendationTone = "info";
  let recommendationText = "Open Autofill and choose the target case before staging or sending files.";
  let secondaryAction = state.isConnected
    ? { label: "Refresh Context", action: "refresh-context", disabled: false }
    : { label: "Open Dashboard", action: "open-dashboard", disabled: false };

  if (!state.isConnected) {
    stateClass = "is-warning";
    title = "Connect CareAssurance first";
    detail = stats.fileCount > 0
      ? "Staged files are waiting, but the workspace session is disconnected. Sync before sending them to CareAssurance Upload."
      : "Sync your CareAssurance session so the Upload mirror knows where to send staged documents.";
    readiness = "Session disconnected";
    primaryAction = { label: "Sync Session", action: "connect", disabled: false };
    secondaryAction = { label: "Open Dashboard", action: "open-dashboard", disabled: false };
    recommendationTone = "warning";
    recommendationText = "Sync the CareAssurance session first so staged files can be mirrored into the Upload workflow.";
  } else if (busyMessage) {
    stateClass = "is-live";
    title = "Upload workflow in progress";
    detail = busyMessage;
    readiness = "Working";
    primaryAction = {
      label: state.connectedWorkspaceContext?.tabId ? "Focus Workspace" : "Refresh Context",
      action: state.connectedWorkspaceContext?.tabId ? "focus-workspace" : "refresh-context",
      disabled: false,
    };
    secondaryAction = { label: "Open Autofill", action: "open-autofill", disabled: false };
    recommendationTone = "info";
    recommendationText = "Let the active upload or auto-download task finish, then focus the workspace if you need to confirm the result live.";
  } else if (workflowSafety.severity !== "ready") {
    stateClass = "is-warning";
    title = workflowSafety.title;
    detail = workflowSafety.detail;
    readiness = workflowSafety.action === "open-status" ? "Status review recommended" : "Needs attention";
    primaryAction = {
      label: workflowSafety.actionLabel || "Review",
      action: workflowSafety.action || "open-autofill",
      disabled: false,
    };
    secondaryAction = {
      label: state.connectedWorkspaceContext?.tabId ? "Focus Workspace" : "Open Autofill",
      action: state.connectedWorkspaceContext?.tabId ? "focus-workspace" : "open-autofill",
      disabled: false,
    };
    recommendationTone = "warning";
    recommendationText = workflowSafety.action === "open-status"
      ? "Review Extension Status next so the published build, browser extension, and current page stay aligned."
      : workflowSafety.action === "detect-ids"
        ? "Detect the live IDs next so Upload and Autofill point to the correct record."
        : "Resolve the target or page warning next before sending or analyzing more files.";
  } else if (!caseId) {
    stateClass = "is-warning";
    title = "Choose the destination case";
    detail = "Select an Autofill service user or type the Case ID before you send staged documents into the CareAssurance Upload mirror.";
    readiness = "Target missing";
    primaryAction = { label: "Select Target", action: "open-autofill", disabled: false };
    secondaryAction = {
      label: state.connectedWorkspaceContext?.tabId ? "Focus Workspace" : "Refresh Context",
      action: state.connectedWorkspaceContext?.tabId ? "focus-workspace" : "refresh-context",
      disabled: false,
    };
    recommendationTone = "warning";
    recommendationText = "Open Autofill next and lock the destination case before staging or sending more documents.";
  } else if (analysisReady) {
    stateClass = "is-ready";
    title = "Analysis ready for review";
    detail = `${analysisCount} recommended assessment${analysisCount === 1 ? " is" : "s are"} ready for Autofill review before you start ACP.`;
    readiness = `${analysisCount} recommendations ready`;
    primaryAction = { label: "Review Autofill", action: "open-autofill", disabled: false };
    secondaryAction = {
      label: state.connectedWorkspaceContext?.tabId ? "Focus Workspace" : "Refresh Context",
      action: state.connectedWorkspaceContext?.tabId ? "focus-workspace" : "refresh-context",
      disabled: false,
    };
    recommendationTone = "success";
    recommendationText = "Open Autofill next and review the recommended assessments before starting ACP.";
  } else if (stats.fileCount > 0) {
    stateClass = "is-ready";
    title = "Ready to send or analyze";
    detail = `The staged documents are aligned to Case ID ${caseId}. Send them to CareAssurance Upload or analyze them for Autofill recommendations.`;
    readiness = "Ready now";
    primaryAction = { label: "Analyze Staged Files", action: "analyze", disabled: false };
    secondaryAction = { label: "Open Autofill", action: "open-autofill", disabled: false };
    recommendationTone = "success";
    recommendationText = "Analyze the staged files next. If the target still looks correct afterwards, send them into CareAssurance Upload.";
  } else {
    stateClass = "is-ready";
    title = "Target locked in";
    detail = `New uploads will be prepared for ${targetName || `Case ID ${caseId}`}. Add files in the sections below to continue.`;
    readiness = "Waiting for files";
    primaryAction = {
      label: state.connectedWorkspaceContext?.tabId ? "Focus Workspace" : "Open Autofill",
      action: state.connectedWorkspaceContext?.tabId ? "focus-workspace" : "open-autofill",
      disabled: false,
    };
    secondaryAction = { label: "Open Autofill", action: "open-autofill", disabled: false };
    recommendationTone = "info";
    recommendationText = "Add files or run Auto-Collect in the relevant Intake section; new documents will be staged for this target.";
  }

  dom.uploadHandoffState.className = `upload-handoff-state ${stateClass}`;
  dom.uploadHandoffState.innerHTML = `
    <span class="upload-handoff-eyebrow">Upload status</span>
    <strong class="upload-handoff-title">${escapeHtml(title)}</strong>
    <span class="upload-handoff-detail">${escapeHtml(detail)}</span>
  `;

  const metaItems = [
    { label: "Target", value: targetName || "Not selected" },
    { label: "Case ID", value: caseId || "Missing" },
    { label: "Staged", value: stageLabel },
    { label: "Ready", value: readiness },
  ];

  dom.uploadHandoffMeta.innerHTML = metaItems
    .map(
      (item) => `
        <div class="upload-handoff-meta-item">
          <span class="upload-handoff-meta-label">${escapeHtml(item.label)}</span>
          <strong class="upload-handoff-meta-value">${escapeHtml(item.value)}</strong>
        </div>
      `
    )
    .join("");

  renderWorkflowRecommendation(dom.uploadHandoffRecommendation, {
    text: recommendationText,
    tone: recommendationTone,
  });

  setUploadHandoffButton(dom.uploadHandoffPrimary, primaryAction);
  setUploadHandoffButton(dom.uploadHandoffSecondary, secondaryAction);
};

const updateUploadActionInterlocks = () => {
  const stats = getUploadStageStats();
  const busy = isUploadWorkflowBusy();
  const busyMessage = getUploadWorkflowBusyMessage();

  document.querySelectorAll("[data-upload-browse], [data-upload-autocollect]").forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) return;
    button.disabled = busy;
  });

  document.querySelectorAll("[data-upload-dropzone]").forEach((dropzone) => {
    if (!(dropzone instanceof HTMLElement)) return;
    if (busy) {
      dropzone.classList.add("is-disabled");
      dropzone.setAttribute("aria-disabled", "true");
      dropzone.setAttribute("tabindex", "-1");
    } else {
      dropzone.classList.remove("is-disabled");
      dropzone.removeAttribute("aria-disabled");
      dropzone.setAttribute("tabindex", "0");
    }
  });

  if (dom.syncUploadBtn) {
    dom.syncUploadBtn.disabled = busy || stats.fileCount === 0 || !state.isConnected;
  }

  if (dom.resetUploadBtn) {
    dom.resetUploadBtn.disabled = busy || stats.fileCount === 0;
  }

  if (dom.clearUploads) {
    dom.clearUploads.disabled = busy || stats.fileCount === 0;
  }

  if (dom.analyzeDocuments) {
    dom.analyzeDocuments.disabled = busy || stats.fileCount === 0;
  }

  if (busyMessage && !autoCollectInFlight) {
    updateUploadSyncStatus(busyMessage, uploadSyncInFlight ? "info" : "warning");
  }

  updateUploadSyncSummary();
};

const getUploadSyncSignature = () => {
  const fileSignature = flattenUploadBuckets()
    .map(({ section, file }) => `${section}:${file.name}:${file.size}:${file.lastModified}`)
    .join("|");
  const notes = (dom.uploadNotes?.value || "").trim();
  return `${fileSignature}::${notes}`;
};

const updateUploadSyncStatus = (message, level = "info") => {
  if (!dom.uploadSyncStatus) return;
  dom.uploadSyncStatus.textContent = message || "";
  if (level && level !== "info") {
    dom.uploadSyncStatus.dataset.level = level;
  } else {
    delete dom.uploadSyncStatus.dataset.level;
  }
};

const AUTO_COLLECT_STATE_LABELS = {
  idle: "Idle",
  running: "Running",
  success: "Success",
  partial: "Partial",
  cancelled: "Cancelled",
  error: "Error",
};

const createAutoCollectInfoSnapshot = (overrides = {}) => ({
  status: "idle",
  sectionKey: "",
  sectionLabel: "",
  caseId: "",
  sourceKind: "",
  sourceLabel: "",
  sourceUrl: "",
  fallbackUsed: false,
  discoveredCount: 0,
  suggestedCount: 0,
  highConfidenceCount: 0,
  selectedCount: 0,
  dedupedSelectionCount: 0,
  downloadedCount: 0,
  failedCount: 0,
  scrapeAttempts: 0,
  probeStatus: "idle",
  probeMessage: "",
  startedAtMs: 0,
  durationMs: 0,
  finishedAt: "",
  note: "",
  error: "",
  failedDetails: [],
  failureCounts: {},
  selectedDocuments: [],
  failedDocuments: [],
  ...overrides,
});

const formatAutoCollectDuration = (durationMs) => {
  const milliseconds = Number(durationMs || 0);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "0s";
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
};

const describeAttemptedDownloadPath = (candidate) => {
  const value = String(candidate || "").trim();
  if (!value) return "";
  try {
    const parsed = new URL(value);
    return `${parsed.pathname || "/"}${parsed.search || ""}`;
  } catch {
    return value;
  }
};

const getAutoCollectDocumentLabel = (documentEntry, fallbackIndex = 1) => {
  const label = String(documentEntry?.fileName || documentEntry?.name || "").trim();
  return label || `Document ${fallbackIndex}`;
};

const AUTO_COLLECT_FAILURE_LABELS = {
  auth: "auth",
  timeout: "timeout",
  network: "network",
  resolution: "link resolution",
  format: "file format",
  unknown: "unknown",
};

const categorizeAutoCollectDownloadFailure = (result, fallbackMessage = "") => {
  const attemptedCount = Array.isArray(result?.attempted) ? result.attempted.filter(Boolean).length : 0;
  const message = String(result?.error || fallbackMessage || "").trim().toLowerCase();

  if (!message && attemptedCount > 0) return "resolution";
  if (
    message.includes("sign in") ||
    message.includes("unauthor") ||
    message.includes("forbidden") ||
    message.includes("redirected this tab outside") ||
    message.includes("login")
  ) {
    return "auth";
  }
  if (message.includes("timed out") || message.includes("timeout")) {
    return "timeout";
  }
  if (
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("connection") ||
    message.includes("failed to fetch") ||
    message.includes("message port closed")
  ) {
    return "network";
  }
  if (
    message.includes("could not find") ||
    message.includes("no downloadable") ||
    message.includes("no file") ||
    message.includes("resolved") ||
    attemptedCount > 0
  ) {
    return "resolution";
  }
  if (message.includes("payload") || message.includes("converted to a file") || message.includes("unsupported")) {
    return "format";
  }
  return "unknown";
};

const incrementAutoCollectFailureCounts = (failureCounts, category) => {
  const next = { ...(failureCounts || {}) };
  const key = String(category || "unknown").trim() || "unknown";
  next[key] = Number(next[key] || 0) + 1;
  return next;
};

const summarizeAutoCollectFailureCounts = (failureCounts) => {
  const entries = Object.entries(failureCounts || {}).filter(([, count]) => Number(count) > 0);
  if (entries.length === 0) return "";
  return entries
    .sort((left, right) => Number(right[1]) - Number(left[1]))
    .map(([category, count]) => `${count} ${AUTO_COLLECT_FAILURE_LABELS[category] || category}`)
    .join(", ");
};

const buildAutoCollectRecoveryHint = (snapshot) => {
  const failureCounts = snapshot?.failureCounts || {};
  if (Number(failureCounts.auth || 0) > 0) {
    return "Mobizio may need re-authentication. Open the source page, confirm you are signed in, then retry failed downloads.";
  }
  if (Number(failureCounts.network || 0) > 0 || Number(failureCounts.timeout || 0) > 0) {
    return "Mobizio responded slowly or the download chain timed out. Retry failed downloads from the same source page before restarting the whole section.";
  }
  if (Number(failureCounts.resolution || 0) > 0) {
    return "Some records exposed incomplete or indirect download links. Open the source page and retry failed downloads so the popup can capture the live download path again.";
  }
  if (Number(failureCounts.format || 0) > 0) {
    return "One or more downloads returned an unreadable payload. Retry once, then inspect the source page manually if the same files fail again.";
  }
  return "Retry failed downloads first. If the same files fail again, reopen the source page and review those records manually.";
};

const buildAutoCollectDownloadFailure = (documentEntry, result, fallbackMessage) => {
  const label = getAutoCollectDocumentLabel(documentEntry);
  const category = categorizeAutoCollectDownloadFailure(result, fallbackMessage);
  const attemptedPaths = Array.isArray(result?.attempted)
    ? result.attempted
        .map((candidate) => describeAttemptedDownloadPath(candidate))
        .filter(Boolean)
        .slice(0, 3)
    : [];

  if (attemptedPaths.length > 0) {
    return {
      label,
      detail: `${label}: ${AUTO_COLLECT_FAILURE_LABELS[category] || category} • ${attemptedPaths.join(" | ")}`,
      category,
      document: {
        ...documentEntry,
        failureCategory: category,
      },
    };
  }

  if (result?.error) {
    return {
      label,
      detail: `${label}: ${AUTO_COLLECT_FAILURE_LABELS[category] || category} • ${String(result.error)}`,
      category,
      document: {
        ...documentEntry,
        failureCategory: category,
      },
    };
  }

  return {
    label,
    detail: `${label}: ${AUTO_COLLECT_FAILURE_LABELS[category] || category} • ${fallbackMessage}`,
    category,
    document: {
      ...documentEntry,
      failureCategory: category,
    },
  };
};

const runAutoCollectDownloadProbe = async ({ documentEntry, executeInCollectionTab }) => {
  if (!documentEntry || typeof executeInCollectionTab !== "function") {
    return {
      status: "idle",
      message: "",
      result: null,
    };
  }

  const probeResult = await executeInCollectionTab(downloadMobizioDocumentInPage, [documentEntry], { world: "MAIN" });
  if (probeResult?.ok && probeResult?.file?.base64Data) {
    return {
      status: "ready",
      message: `Preflight download check succeeded for ${getAutoCollectDocumentLabel(documentEntry)}.`,
      result: probeResult,
    };
  }

  const failure = buildAutoCollectDownloadFailure(
    documentEntry,
    probeResult,
    "preflight download check did not resolve a downloadable file."
  );
  const failureCounts = incrementAutoCollectFailureCounts({}, failure.category);

  return {
    status: "warning",
    message: `${failure.detail}. ${buildAutoCollectRecoveryHint({ failureCounts })}`,
    result: probeResult,
  };
};

const createMobizioCollectionTabExecutor = (collectionTabId) => async (func, args = [], options = {}) => {
  try {
    return await executeScriptInTab(collectionTabId, func, args, options);
  } catch (error) {
    let latestTab = null;
    try {
      latestTab = await chrome.tabs.get(collectionTabId);
    } catch {
      // Ignore lookup failure; the tab may have been closed.
    }

    const latestHost = getTabHostName(latestTab);
    if (latestHost && !isMobizioHostName(latestHost)) {
      throw new Error(
        "Mobizio redirected this tab outside clece.mobizio.com. Sign in to Mobizio in the browser, then retry auto-collect."
      );
    }

    const details = error instanceof Error ? error.message : String(error || "Unknown script execution error.");
    throw new Error(`Could not run auto-collect script on the Mobizio page. ${details}`);
  }
};

const runAutoCollectDownloadLoop = async ({
  documents,
  executeInCollectionTab,
  progressVerb = "Downloading",
  baseDownloadedCount = 0,
  prefetchedFirstResult = null,
}) => {
  const safeDocuments = Array.isArray(documents) ? documents.filter(Boolean) : [];
  const downloadedFiles = [];
  const failedDocuments = [];
  const failedDetails = [];
  let failureCounts = {};

  for (let index = 0; index < safeDocuments.length; index += 1) {
    const selectedDocument = safeDocuments[index];
    const label = getAutoCollectDocumentLabel(selectedDocument, index + 1);
    const progressMessage = `${progressVerb} ${index + 1} of ${safeDocuments.length}: ${label}`;

    updateUploadSyncStatus(progressMessage);
    updateAutoCollectInfoSnapshot({
      note: progressMessage,
    });

    const result =
      index === 0 && prefetchedFirstResult
        ? prefetchedFirstResult
        : await executeInCollectionTab(downloadMobizioDocumentInPage, [selectedDocument], { world: "MAIN" });
    if (!result?.ok || !result?.file?.base64Data) {
      const failure = buildAutoCollectDownloadFailure(
        selectedDocument,
        result,
        "no downloadable file URL resolved."
      );
      failureCounts = incrementAutoCollectFailureCounts(failureCounts, failure.category);
      failedDocuments.push(failure.document);
      failedDetails.push(failure.detail);
      updateAutoCollectInfoSnapshot({
        downloadedCount: baseDownloadedCount + downloadedFiles.length,
        failedCount: failedDocuments.length,
        failedDetails: [...failedDetails],
        failedDocuments: [...failedDocuments],
        failureCounts: { ...failureCounts },
      });
      continue;
    }

    try {
      downloadedFiles.push(fileFromDownloadedPayload(result.file));
    } catch {
      const failure = buildAutoCollectDownloadFailure(
        selectedDocument,
        null,
        "downloaded payload could not be converted to a file."
      );
      failureCounts = incrementAutoCollectFailureCounts(failureCounts, failure.category);
      failedDocuments.push(failure.document);
      failedDetails.push(failure.detail);
    }

    updateAutoCollectInfoSnapshot({
      downloadedCount: baseDownloadedCount + downloadedFiles.length,
      failedCount: failedDocuments.length,
      failedDetails: [...failedDetails],
      failedDocuments: [...failedDocuments],
      failureCounts: { ...failureCounts },
    });
  }

  return {
    downloadedFiles,
    failedDocuments,
    failedDetails,
    failureCounts,
  };
};

const setAutoCollectActionButton = (button, config = {}) => {
  if (!button) return;

  const {
    label = "",
    action = "",
    disabled = false,
    hidden = true,
  } = config;

  if (hidden || !label || !action) {
    button.hidden = true;
    button.disabled = true;
    button.dataset.action = "";
    button.textContent = "";
    return;
  }

  button.hidden = false;
  button.disabled = Boolean(disabled);
  button.dataset.action = action;
  button.textContent = label;
};

const renderWorkflowRecommendation = (element, { text = "", tone = "info" } = {}) => {
  if (!element) return;
  element.className = `workflow-recommendation is-${tone}`;
  element.innerHTML = `
    <span class="workflow-recommendation-label">Recommended next step</span>
    <span class="workflow-recommendation-text">${escapeHtml(text || "Review the current status before continuing.")}</span>
  `;
};

const renderUploadBucketStatuses = () => {
  ensureUploadBuckets();

  document.querySelectorAll("[data-upload-status]").forEach((element) => {
    const sectionKey = String(element.getAttribute("data-upload-status") || "").trim();
    if (!sectionKey) return;

    const sectionFiles = Array.isArray(state.uploadBuckets?.[sectionKey]) ? state.uploadBuckets[sectionKey] : [];
    const snapshot = autoCollectInfoSnapshot || createAutoCollectInfoSnapshot();
    const snapshotSectionKey = String(snapshot?.sectionKey || "").trim();
    const snapshotStatus = String(snapshot?.status || "idle").trim();

    let label = "";
    let stateLabel = "idle";

    if (snapshotSectionKey === sectionKey && snapshotStatus === "running") {
      label = "Running";
      stateLabel = "running";
    } else if (snapshotSectionKey === sectionKey && snapshotStatus === "success") {
      const count = Number(snapshot?.downloadedCount || sectionFiles.length || 0);
      label = count > 0 ? `Added ${count}` : "Added";
      stateLabel = "success";
    } else if (snapshotSectionKey === sectionKey && snapshotStatus === "partial") {
      const count = Number(snapshot?.downloadedCount || sectionFiles.length || 0);
      label = count > 0 ? `Partial ${count}` : "Partial";
      stateLabel = "partial";
    } else if (snapshotSectionKey === sectionKey && (snapshotStatus === "error" || snapshotStatus === "cancelled")) {
      label = snapshotStatus === "cancelled" ? "Cancelled" : "Failed";
      stateLabel = snapshotStatus;
    } else if (sectionFiles.length > 0) {
      label = sectionFiles.length === 1 ? "Staged 1" : `Staged ${sectionFiles.length}`;
      stateLabel = "staged";
    }

    if (!label) {
      element.hidden = true;
      element.textContent = "";
      element.dataset.state = "idle";
      return;
    }

    element.hidden = false;
    element.textContent = label;
    element.dataset.state = stateLabel;
  });
};

const getAutoCollectInfoActions = (snapshot) => {
  const status = String(snapshot?.status || "idle");
  const sourceUrl = String(snapshot?.sourceUrl || "").trim();
  const hasSourceUrl = Boolean(sourceUrl);
  const stagedCount = flattenUploadBuckets().length;
  const downloadedCount = Number(snapshot?.downloadedCount || 0);
  const failedDocuments = Array.isArray(snapshot?.failedDocuments) ? snapshot.failedDocuments.filter(Boolean) : [];
  const retryFailedConfig = failedDocuments.length > 0 && hasSourceUrl
    ? { label: "Retry Failed Downloads", action: "retry-failed" }
    : null;
  const hasAnalysisReady =
    Number(state.currentAnalysisResults?.recommendedAssessments?.length || 0) > 0 &&
    Boolean(dom.selectionSection) &&
    !dom.selectionSection.hidden;

  if (status === "idle") {
    return {
      primary: { hidden: true },
      secondary: { hidden: true },
    };
  }

  if (status === "running") {
    return {
      primary: hasSourceUrl
        ? { label: "Open Source", action: "open-source" }
        : { hidden: true },
      secondary: {
        label: "Open Autofill",
        action: "open-autofill",
      },
    };
  }

  if (status === "error" || status === "cancelled") {
    return {
      primary:
        retryFailedConfig ||
        (snapshot?.sectionKey ? { label: "Retry Auto-Download", action: "retry" } : { hidden: true }),
      secondary: hasSourceUrl
        ? { label: "Open Source", action: "open-source" }
        : { hidden: true },
    };
  }

  if ((status === "success" || status === "partial") && downloadedCount > 0) {
    const primary =
      retryFailedConfig ||
      (hasAnalysisReady
        ? { label: "Review Autofill", action: "open-autofill" }
        : stagedCount > 0
        ? { label: "Analyze Staged Files", action: "analyze" }
        : { hidden: true });

    const secondary = retryFailedConfig
      ? state.isConnected && stagedCount > 0
        ? { label: "Send to Upload", action: "send-upload" }
        : hasAnalysisReady
        ? { label: "Review Autofill", action: "open-autofill" }
        : stagedCount > 0
        ? { label: "Analyze Staged Files", action: "analyze" }
        : hasSourceUrl
        ? { label: "Open Source", action: "open-source" }
        : { label: "Open Autofill", action: "open-autofill" }
      : state.isConnected && stagedCount > 0
      ? { label: "Send to Upload", action: "send-upload" }
      : hasSourceUrl
      ? { label: "Open Source", action: "open-source" }
      : { label: "Open Autofill", action: "open-autofill" };

    return { primary, secondary };
  }

  return {
    primary:
      retryFailedConfig ||
      (snapshot?.sectionKey ? { label: "Retry Auto-Download", action: "retry" } : { hidden: true }),
    secondary: hasSourceUrl
      ? { label: "Open Source", action: "open-source" }
      : { hidden: true },
  };
};

const buildAutoCollectRecommendation = (snapshot, actions) => {
  const status = String(snapshot?.status || "idle");
  const downloadedCount = Number(snapshot?.downloadedCount || 0);

  if (status === "idle") {
    return {
      tone: "info",
      text: "Use Auto-Collect on the most relevant Intake section to pull documents straight into staging.",
    };
  }

  if (status === "running") {
    return {
      tone: "info",
      text: actions?.primary?.action === "open-source"
        ? "Keep the Mobizio source page available while downloads finish, or open the source if you need to confirm the visible document list."
        : "Wait for the current auto-download run to finish before starting another section.",
    };
  }

  if (status === "error" || status === "cancelled") {
    return {
      tone: "warning",
      text: actions?.primary?.action === "retry-failed"
        ? "Retry only the failed downloads first so you do not rerun the whole section unnecessarily."
        : "Retry this section from the same Mobizio source page once the document list is visible again.",
    };
  }

  if ((status === "success" || status === "partial") && downloadedCount > 0) {
    if (actions?.primary?.action === "retry-failed") {
      return {
        tone: "warning",
        text: "Retry the failed downloads first, then continue with the staged files that already came through successfully.",
      };
    }
    if (actions?.primary?.action === "analyze") {
      return {
        tone: "success",
        text: "Analyze the newly staged files next so the extension can generate Autofill recommendations.",
      };
    }
    if (actions?.primary?.action === "open-autofill") {
      return {
        tone: "success",
        text: "Open Autofill next and review the staged recommendations before starting ACP.",
      };
    }
    if (actions?.secondary?.action === "send-upload") {
      return {
        tone: "success",
        text: "Send the staged files into CareAssurance Upload once the case target still looks correct.",
      };
    }
  }

  return {
    tone: "info",
    text: actions?.primary?.action === "retry"
      ? "Retry the same section next if the latest source page is now stable and showing the expected documents."
      : "Review the current auto-download result before moving to the next Intake step.",
  };
};

const buildAutoCollectInfoTitle = (snapshot) => {
  const status = String(snapshot?.status || "idle");
  const sectionLabel = String(snapshot?.sectionLabel || "Intake").trim() || "Intake";
  if (status === "running") return `Running ${sectionLabel} auto-download`;
  if (status === "success") return `Completed ${sectionLabel} auto-download`;
  if (status === "partial") return `Partial ${sectionLabel} auto-download`;
  if (status === "cancelled") return `Cancelled ${sectionLabel} auto-download`;
  if (status === "error") return `Failed ${sectionLabel} auto-download`;
  return "No auto-collect run yet";
};

const buildAutoCollectInfoDetail = (snapshot) => {
  const status = String(snapshot?.status || "idle");
  if (status === "idle") {
    return "Run Auto-Collect in any Intake section to capture source, selection, and download diagnostics.";
  }

  const metrics = [];
  const caseId = String(snapshot?.caseId || "").trim();
  const sourceLabel = String(snapshot?.sourceLabel || "").trim();
  if (caseId) metrics.push(`Case ${caseId}`);
  if (sourceLabel) {
    metrics.push(
      snapshot?.fallbackUsed
        ? `Source ${sourceLabel} (fallback to Documents)`
        : `Source ${sourceLabel}`
    );
  }

  if (Number.isFinite(snapshot?.discoveredCount) && snapshot.discoveredCount > 0) {
    metrics.push(`Found ${snapshot.discoveredCount}`);
  }
  if (Number.isFinite(snapshot?.suggestedCount) && snapshot.suggestedCount > 0) {
    metrics.push(`Suggested ${snapshot.suggestedCount}`);
  }
  if (Number.isFinite(snapshot?.highConfidenceCount) && snapshot.highConfidenceCount > 0) {
    metrics.push(`High confidence ${snapshot.highConfidenceCount}`);
  }
  if (Number.isFinite(snapshot?.selectedCount) && snapshot.selectedCount > 0) {
    metrics.push(`Selected ${snapshot.selectedCount}`);
  }
  if (Number.isFinite(snapshot?.dedupedSelectionCount) && snapshot.dedupedSelectionCount > 0) {
    metrics.push(`Deduped ${snapshot.dedupedSelectionCount}`);
  }
  if (Number.isFinite(snapshot?.downloadedCount) && snapshot.downloadedCount > 0) {
    metrics.push(`Downloaded ${snapshot.downloadedCount}`);
  }
  if (Number.isFinite(snapshot?.failedCount) && snapshot.failedCount > 0) {
    metrics.push(`Failed ${snapshot.failedCount}`);
  }
  if (Number.isFinite(snapshot?.scrapeAttempts) && snapshot.scrapeAttempts > 1) {
    metrics.push(`Scrape attempts ${snapshot.scrapeAttempts}`);
  }
  if (String(snapshot?.probeStatus || "") === "warning" && snapshot?.probeMessage) {
    metrics.push(`Preflight ${snapshot.probeMessage}`);
  }
  if (Number.isFinite(snapshot?.durationMs) && snapshot.durationMs > 0) {
    metrics.push(`Duration ${formatAutoCollectDuration(snapshot.durationMs)}`);
  }

  const failureSummary = summarizeAutoCollectFailureCounts(snapshot?.failureCounts);
  if (failureSummary && status !== "running") {
    metrics.push(`Failure mix ${failureSummary}`);
  }

  const failurePreview = Array.isArray(snapshot?.failedDetails)
    ? snapshot.failedDetails.filter(Boolean).slice(0, 2)
    : [];
  if (failurePreview.length > 0 && status !== "running") {
    const extraCount = Math.max(0, snapshot.failedDetails.length - failurePreview.length);
    metrics.push(
      extraCount > 0
        ? `${failurePreview.join(" | ")} (+${extraCount} more)`
        : failurePreview.join(" | ")
    );
  }

  const note = String(snapshot?.note || "").trim();
  const error = String(snapshot?.error || "").trim();
  if (note) metrics.push(note);
  if (error) metrics.push(error);
  if ((status === "partial" || status === "error") && failureSummary) {
    metrics.push(buildAutoCollectRecoveryHint(snapshot));
  }

  return metrics.join(" • ") || "Auto-collect run completed.";
};

const renderAutoCollectInfoPanel = () => {
  if (!dom.autoCollectInfo || !dom.autoCollectInfoState || !dom.autoCollectInfoTitle || !dom.autoCollectInfoDetail) {
    return;
  }

  const snapshot = autoCollectInfoSnapshot || createAutoCollectInfoSnapshot();
  const status = String(snapshot.status || "idle");
  const statusLabel = AUTO_COLLECT_STATE_LABELS[status] || AUTO_COLLECT_STATE_LABELS.idle;

  dom.autoCollectInfo.dataset.state = status;
  dom.autoCollectInfo.classList.toggle("auto-collect-info-empty", status === "idle");
  dom.autoCollectInfoState.textContent = statusLabel;
  dom.autoCollectInfoTitle.textContent = buildAutoCollectInfoTitle(snapshot);
  dom.autoCollectInfoDetail.textContent = buildAutoCollectInfoDetail(snapshot);

  const actions = getAutoCollectInfoActions(snapshot);
  const recommendation = buildAutoCollectRecommendation(snapshot, actions);
  renderWorkflowRecommendation(dom.autoCollectInfoRecommendation, recommendation);
  setAutoCollectActionButton(dom.autoCollectPrimaryAction, actions.primary);
  setAutoCollectActionButton(dom.autoCollectSecondaryAction, actions.secondary);
  renderUploadBucketStatuses();

  if (dom.copyAutoCollectInfo) {
    dom.copyAutoCollectInfo.disabled = status === "idle";
  }
};

const updateAutoCollectInfoSnapshot = (patch = {}) => {
  const base = autoCollectInfoSnapshot || createAutoCollectInfoSnapshot();
  const next = {
    ...base,
    ...patch,
  };

  if (Number.isFinite(next.startedAtMs) && next.startedAtMs > 0 && String(next.status || "") === "running") {
    next.durationMs = Math.max(0, Date.now() - next.startedAtMs);
  }

  autoCollectInfoSnapshot = next;
  renderAutoCollectInfoPanel();
  return next;
};

const finalizeAutoCollectInfoSnapshot = (patch = {}) => {
  const base = autoCollectInfoSnapshot || createAutoCollectInfoSnapshot();
  const startedAtMs = Number(base.startedAtMs || 0);
  const durationMs = startedAtMs > 0 ? Math.max(0, Date.now() - startedAtMs) : Number(base.durationMs || 0);
  return updateAutoCollectInfoSnapshot({
    ...patch,
    durationMs,
    finishedAt: new Date().toISOString(),
  });
};

const buildAutoCollectReportText = () => {
  const snapshot = autoCollectInfoSnapshot || createAutoCollectInfoSnapshot();
  const status = String(snapshot.status || "idle");
  if (status === "idle") return "";

  const lines = [
    "CareAssurance Auto-Collect Report",
    `Generated: ${new Date().toISOString()}`,
    `Status: ${AUTO_COLLECT_STATE_LABELS[status] || status}`,
    `Section: ${snapshot.sectionLabel || "Intake"}`,
    `Case ID: ${snapshot.caseId || "-"}`,
    `Source: ${snapshot.sourceLabel || "-"}`,
    `Source URL: ${snapshot.sourceUrl || "-"}`,
    `Fallback Used: ${snapshot.fallbackUsed ? "Yes" : "No"}`,
    `Found: ${snapshot.discoveredCount || 0}`,
    `Suggested: ${snapshot.suggestedCount || 0}`,
    `High Confidence Suggested: ${snapshot.highConfidenceCount || 0}`,
    `Selected: ${snapshot.selectedCount || 0}`,
    `Deduped Selection Count: ${snapshot.dedupedSelectionCount || 0}`,
    `Downloaded: ${snapshot.downloadedCount || 0}`,
    `Failed: ${snapshot.failedCount || 0}`,
    `Scrape Attempts: ${snapshot.scrapeAttempts || 0}`,
    `Preflight: ${snapshot.probeStatus || "idle"}`,
    `Duration: ${formatAutoCollectDuration(snapshot.durationMs || 0)}`,
  ];

  const failureSummary = summarizeAutoCollectFailureCounts(snapshot.failureCounts);
  if (failureSummary) {
    lines.push(`Failure Categories: ${failureSummary}`);
  }
  if (snapshot.probeMessage) {
    lines.push(`Preflight Message: ${snapshot.probeMessage}`);
  }

  if (snapshot.note) lines.push(`Note: ${snapshot.note}`);
  if (snapshot.error) lines.push(`Error: ${snapshot.error}`);
  if ((status === "partial" || status === "error") && failureSummary) {
    lines.push(`Recovery Hint: ${buildAutoCollectRecoveryHint(snapshot)}`);
  }

  const failedDetails = Array.isArray(snapshot.failedDetails) ? snapshot.failedDetails.filter(Boolean) : [];
  if (failedDetails.length > 0) {
    lines.push("Failed Documents:");
    failedDetails.forEach((entry) => lines.push(`- ${entry}`));
  }

  return lines.join("\n");
};

const retryFailedAutoCollectDownloads = async () => {
  if (autoCollectInFlight) {
    showInfo("Auto-collect is already running. Please wait for it to complete.");
    return false;
  }

  if (isUploadWorkflowBusy()) {
    showInfo("Please wait for the current upload operation to finish.");
    return false;
  }

  const snapshot = autoCollectInfoSnapshot || createAutoCollectInfoSnapshot();
  const sectionKey = String(snapshot.sectionKey || "").trim();
  const sourceUrl = String(snapshot.sourceUrl || "").trim();
  const selectedDocuments = Array.isArray(snapshot.selectedDocuments) ? snapshot.selectedDocuments.filter(Boolean) : [];
  const failedDocuments = Array.isArray(snapshot.failedDocuments) ? snapshot.failedDocuments.filter(Boolean) : [];
  const existingDownloadedCount = Number(snapshot.downloadedCount || 0);

  if (!sectionKey) {
    showInfo("No previous auto-download section is available to retry.");
    return false;
  }

  if (!sourceUrl) {
    showInfo("No Mobizio source page is attached to retry failed downloads.");
    return false;
  }

  if (failedDocuments.length === 0) {
    showInfo("There are no failed downloads to retry.");
    return false;
  }

  autoCollectInFlight = true;
  updateUploadActionInterlocks();

  const startedAtMs = Date.now();
  let retryTabId = null;

  updateAutoCollectInfoSnapshot({
    status: "running",
    startedAtMs,
    error: "",
    note: `Retrying ${failedDocuments.length} failed document${failedDocuments.length === 1 ? "" : "s"}...`,
    probeStatus: "idle",
    probeMessage: "",
    selectedDocuments: [...selectedDocuments],
    failedDocuments: [...failedDocuments],
    failedCount: 0,
    failureCounts: {},
  });

  try {
    const retryTab = await chrome.tabs.create({
      url: sourceUrl,
      active: false,
    });
    retryTabId = retryTab?.id;

    if (!Number.isFinite(retryTabId)) {
      throw new Error("Could not reopen the Mobizio source page to retry failed downloads.");
    }

    const retryTabState = await waitForTabComplete(retryTabId);
    const retryHost = getTabHostName(retryTabState);
    if (retryHost && !isMobizioHostName(retryHost)) {
      throw new Error(
        "Mobizio redirected this tab outside clece.mobizio.com. Sign in to Mobizio in the browser, then retry auto-collect."
      );
    }

    const executeInCollectionTab = createMobizioCollectionTabExecutor(retryTabId);
    const retryPass = await runAutoCollectDownloadLoop({
      documents: failedDocuments,
      executeInCollectionTab,
      progressVerb: "Retrying failed download",
      baseDownloadedCount: existingDownloadedCount,
    });

    if (retryPass.downloadedFiles.length > 0) {
      applyUploadFiles(sectionKey, retryPass.downloadedFiles);
    }

    const totalDownloadedCount = existingDownloadedCount + retryPass.downloadedFiles.length;
    const stagedCount = flattenUploadBuckets().length;

    if (retryPass.failedDocuments.length > 0) {
      const recoveredCount = retryPass.downloadedFiles.length;
      updateUploadSyncStatus(
        `Staged ${stagedCount} file${stagedCount === 1 ? "" : "s"}. ${retryPass.failedDocuments.length} document${
          retryPass.failedDocuments.length === 1 ? " remains" : "s remain"
        } in the failed queue.`,
        "warning"
      );
      finalizeAutoCollectInfoSnapshot({
        status: "partial",
        downloadedCount: totalDownloadedCount,
        failedCount: retryPass.failedDocuments.length,
        failedDetails: retryPass.failedDetails,
        failedDocuments: retryPass.failedDocuments,
        failureCounts: retryPass.failureCounts,
        selectedDocuments: [...selectedDocuments],
        note:
          recoveredCount > 0
            ? `Recovered ${recoveredCount} failed document${recoveredCount === 1 ? "" : "s"}; ${retryPass.failedDocuments.length} still need manual review.`
            : `Retried ${failedDocuments.length} failed document${failedDocuments.length === 1 ? "" : "s"}; none were recovered yet.`,
        error: "",
      });
      showInfo(
        recoveredCount > 0
          ? `Recovered ${recoveredCount} document${recoveredCount === 1 ? "" : "s"}; ${retryPass.failedDocuments.length} still failed.`
          : `Retried ${failedDocuments.length} document${failedDocuments.length === 1 ? "" : "s"}, but they still failed to download.`
      );
      return recoveredCount > 0;
    }

    updateUploadSyncStatus(
      `Staged ${stagedCount} file${stagedCount === 1 ? "" : "s"}. Retry recovered all previously failed documents.`,
      "success"
    );
    finalizeAutoCollectInfoSnapshot({
      status: "success",
      downloadedCount: totalDownloadedCount,
      failedCount: 0,
      failedDetails: [],
      failedDocuments: [],
      failureCounts: {},
      selectedDocuments: [...selectedDocuments],
      note: `Recovered all ${failedDocuments.length} previously failed document${failedDocuments.length === 1 ? "" : "s"}.`,
      error: "",
    });
    showSuccess(
      `Recovered ${retryPass.downloadedFiles.length} failed document${retryPass.downloadedFiles.length === 1 ? "" : "s"}.`
    );
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not retry failed Mobizio downloads.";
    updateUploadSyncStatus(message, "error");
    finalizeAutoCollectInfoSnapshot({
      status: existingDownloadedCount > 0 ? "partial" : "error",
      downloadedCount: existingDownloadedCount,
      failedCount: failedDocuments.length,
      failedDetails: Array.isArray(snapshot.failedDetails) ? snapshot.failedDetails : [],
      failedDocuments: [...failedDocuments],
      selectedDocuments: [...selectedDocuments],
      error: message,
      note: "Retry attempt stopped before failed files could be recovered.",
    });
    showError(message);
    return false;
  } finally {
    if (Number.isFinite(retryTabId)) {
      try {
        await chrome.tabs.remove(retryTabId);
      } catch {
        // Ignore tab close failures.
      }
    }
    autoCollectInFlight = false;
    updateUploadActionInterlocks();
  }
};

const renderOverlayPinButton = (pinned) => {
  if (!dom.overlayPinBtn) return;
  const isPinned = Boolean(pinned);
  dom.overlayPinBtn.textContent = isPinned ? "Pinned" : "Pin";
  dom.overlayPinBtn.title = isPinned ? "Overlay pinned on workflow page" : "Pin in-page overlay";
  dom.overlayPinBtn.setAttribute("aria-pressed", isPinned ? "true" : "false");
  dom.overlayPinBtn.classList.toggle("is-active", isPinned);
};

const applyOverlayPinnedPreference = async (pinned, { broadcast = true } = {}) => {
  const normalized = Boolean(pinned);
  await setStorage({ [STORAGE_KEYS.overlayPinned]: normalized });
  renderOverlayPinButton(normalized);

  if (!broadcast) return;

  try {
    await sendMessageToPageCompanion({
      type: MESSAGE_TYPES.toggleOverlay || "CA_EXTENSION_TOGGLE_OVERLAY",
      payload: normalized ? { open: true, pin: true } : { pin: false },
    });
  } catch {
    // Persisting the preference is enough when no live workflow page is attached.
  }
};

const updateUploadPendingStatus = () => {
  renderUploadHandoffSummary();
  updateUploadSyncSummary();

  if (isUploadWorkflowBusy()) {
    updateUploadActionInterlocks();
    return;
  }

  const stagedCount = flattenUploadBuckets().length;
  if (stagedCount === 0) {
    updateUploadSyncStatus("Add files to stage them, then click Send to transfer.");
    updateUploadActionInterlocks();
    return;
  }

  if (!state.isConnected) {
    updateUploadSyncStatus(
      `Staged ${stagedCount} file${stagedCount === 1 ? "" : "s"}. Connect your workspace, then click Send.`,
      "warning"
    );
    updateUploadActionInterlocks();
    return;
  }

  updateUploadSyncStatus(`Staged ${stagedCount} file${stagedCount === 1 ? "" : "s"}. Click Send to transfer.`);
  updateUploadActionInterlocks();
};

const getCurrentWindow = () =>
  new Promise((resolve) => {
    if (!chrome.windows?.getCurrent) {
      resolve(null);
      return;
    }

    chrome.windows.getCurrent({}, (windowInfo) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }

      resolve(windowInfo || null);
    });
  });

const getCurrentTab = () =>
  new Promise((resolve) => {
    if (!chrome.tabs?.getCurrent) {
      resolve(null);
      return;
    }

    chrome.tabs.getCurrent((tab) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }

      resolve(tab || null);
    });
  });

const findDetachedPopupTab = (excludeWindowId = null) =>
  new Promise((resolve) => {
    if (!chrome.tabs?.query) {
      resolve(null);
      return;
    }

    chrome.tabs.query({ url: chrome.runtime.getURL("popup.html") }, (tabs) => {
      if (chrome.runtime.lastError || !Array.isArray(tabs)) {
        resolve(null);
        return;
      }

      const candidate = tabs.find((tab) => {
        if (!Number.isFinite(tab?.windowId)) return false;
        if (excludeWindowId != null && tab.windowId === excludeWindowId) return false;
        return true;
      });

      resolve(candidate || null);
    });
  });

const focusWindow = (windowId) =>
  new Promise((resolve) => {
    if (!chrome.windows?.update || !Number.isFinite(windowId)) {
      resolve(false);
      return;
    }

    chrome.windows.update(windowId, { focused: true }, () => {
      if (chrome.runtime.lastError) {
        resolve(false);
        return;
      }

      resolve(true);
    });
  });

const openDetachedPopupWindow = (currentWindow, event = null) =>
  new Promise((resolve) => {
    if (!chrome.windows?.create) {
      resolve(false);
      return;
    }

    const width = Math.max(430, Math.round(window.outerWidth || 430));
    const height = Math.max(680, Math.round(window.outerHeight || 680));
    const createData = {
      url: chrome.runtime.getURL("popup.html"),
      type: "popup",
      focused: true,
      width,
      height,
    };

    if (event && Number.isFinite(event.screenX) && Number.isFinite(event.screenY)) {
      createData.left = Math.round(event.screenX - width / 2);
      createData.top = Math.round(event.screenY - 28);
    } else if (Number.isFinite(currentWindow?.left) && Number.isFinite(currentWindow?.top)) {
      createData.left = Math.round(currentWindow.left + 24);
      createData.top = Math.round(currentWindow.top + 24);
    }

    chrome.windows.create(createData, (createdWindow) => {
      if (chrome.runtime.lastError || !createdWindow?.id) {
        resolve(false);
        return;
      }

      resolve(true);
    });
  });

const launchDetachedPopupWindow = async (event) => {
  if (popupMenuDetachInFlight) return;

  popupMenuDetachInFlight = true;
  try {
    const currentWindow = await getCurrentWindow();
    const opened = await openDetachedPopupWindow(currentWindow, event);
    if (!opened) {
      showInfo("Could not detach the extension popup window. Please try again.");
      return;
    }

    window.close();
  } finally {
    popupMenuDetachInFlight = false;
  }
};

const openAutoCollectSource = async () => {
  const sourceUrl = String(autoCollectInfoSnapshot?.sourceUrl || "").trim();
  if (!sourceUrl) {
    showInfo("No Mobizio source page is attached to this auto-download run.");
    return;
  }

  await chrome.tabs.create({ url: sourceUrl, active: true });
};

const executeAutoCollectInfoAction = async (action) => {
  const normalizedAction = String(action || "").trim();
  if (!normalizedAction) return;

  if (normalizedAction === "open-source") {
    await openAutoCollectSource();
    return;
  }

  if (normalizedAction === "retry") {
    const sectionKey = String(autoCollectInfoSnapshot?.sectionKey || "").trim();
    if (!sectionKey) {
      showInfo("No previous auto-download section is available to retry.");
      return;
    }

    if (isUploadWorkflowBusy()) {
      showInfo("Please wait for the current upload operation to finish.");
      return;
    }

    const triggerButton = document.querySelector(`[data-upload-autocollect="${sectionKey}"]`);
    await autoCollectDocumentsForSection(
      sectionKey,
      triggerButton instanceof HTMLButtonElement ? triggerButton : null
    );
    return;
  }

  if (normalizedAction === "retry-failed") {
    await retryFailedAutoCollectDownloads();
    return;
  }

  if (normalizedAction === "analyze") {
    dom.analyzeDocuments?.click();
    return;
  }

  if (normalizedAction === "send-upload") {
    dom.syncUploadBtn?.click();
    return;
  }

  if (normalizedAction === "open-autofill") {
    switchTab("autofill");
    setTimeout(() => {
      if (getCaseIdForAutoCollect()) dom.caseId?.focus();
      else dom.autofillUserSearch?.focus();
    }, 0);
  }
};

const updateWindowPosition = (windowId, left, top) =>
  new Promise((resolve, reject) => {
    chrome.windows.update(
      windowId,
      { left: Math.round(left), top: Math.round(top) },
      () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || "Failed to move extension window."));
          return;
        }

        resolve();
      }
    );
  });

const queuePopupMenuWindowMove = (left, top) => {
  popupMenuMoveQueued = { left, top };
  if (popupMenuMoveInFlight || popupMenuDragWindowId == null) return;

  popupMenuMoveInFlight = true;
  const flush = async () => {
    while (popupMenuMoveQueued && popupMenuDragWindowId != null) {
      const next = popupMenuMoveQueued;
      popupMenuMoveQueued = null;

      try {
        await updateWindowPosition(popupMenuDragWindowId, next.left, next.top);
      } catch {
        popupMenuDragWindowId = null;
        popupMenuMoveQueued = null;
        break;
      }
    }

    popupMenuMoveInFlight = false;
  };

  void flush();
};

const isWindowDragBlockedTarget = (target) =>
  target instanceof Element &&
  Boolean(target.closest("button, input, select, textarea, a, summary, [role='tab'], [data-no-window-drag]"));

const stopPopupMainMenuDrag = () => {
  const activeState = popupMenuDragState;
  popupMenuDragState = null;

  document.body.style.userSelect = "";
  popupMenuDragHandles.forEach((handle) => handle.classList.remove("is-window-dragging"));

  if (
    activeState?.captureElement &&
    Number.isFinite(activeState.pointerId) &&
    typeof activeState.captureElement.releasePointerCapture === "function"
  ) {
    try {
      if (
        typeof activeState.captureElement.hasPointerCapture !== "function" ||
        activeState.captureElement.hasPointerCapture(activeState.pointerId)
      ) {
        activeState.captureElement.releasePointerCapture(activeState.pointerId);
      }
    } catch {
      // Ignore stale pointer capture release errors.
    }
  }

  window.removeEventListener("pointermove", handlePopupMainMenuDragMove);
  window.removeEventListener("pointerup", stopPopupMainMenuDrag);
  window.removeEventListener("pointercancel", stopPopupMainMenuDrag);
};

function handlePopupMainMenuDragMove(event) {
  if (!popupMenuDragState || popupMenuDragWindowId == null) return;
  if (
    Number.isFinite(popupMenuDragState.pointerId) &&
    Number.isFinite(event.pointerId) &&
    event.pointerId !== popupMenuDragState.pointerId
  ) {
    return;
  }

  event.preventDefault();

  const deltaX = event.screenX - popupMenuDragState.startScreenX;
  const deltaY = event.screenY - popupMenuDragState.startScreenY;
  const nextLeft = popupMenuDragState.originLeft + deltaX;
  const nextTop = popupMenuDragState.originTop + deltaY;
  queuePopupMenuWindowMove(nextLeft, nextTop);
}

const beginPopupMainMenuDrag = (event) => {
  if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
  if (isWindowDragBlockedTarget(event.target)) return;

  if (popupMenuDragRequiresDetach || popupMenuDragWindowId == null) {
    event.preventDefault();
    void launchDetachedPopupWindow(event);
    return;
  }

  stopPopupMainMenuDrag();

  const captureElement = event.currentTarget instanceof Element ? event.currentTarget : null;
  if (
    captureElement &&
    Number.isFinite(event.pointerId) &&
    typeof captureElement.setPointerCapture === "function"
  ) {
    try {
      captureElement.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can fail silently in some popup contexts.
    }
  }

  popupMenuDragState = {
    pointerId: Number.isFinite(event.pointerId) ? event.pointerId : null,
    captureElement,
    startScreenX: event.screenX,
    startScreenY: event.screenY,
    originLeft: Number.isFinite(window.screenX) ? window.screenX : 0,
    originTop: Number.isFinite(window.screenY) ? window.screenY : 0,
  };

  const currentState = popupMenuDragState;
  getCurrentWindow().then((currentWindow) => {
    if (!popupMenuDragState || popupMenuDragState !== currentState) return;

    const fallbackLeft = Number.isFinite(window.screenX) ? window.screenX : 0;
    const fallbackTop = Number.isFinite(window.screenY) ? window.screenY : 0;
    popupMenuDragState.originLeft = Number.isFinite(currentWindow?.left) ? currentWindow.left : fallbackLeft;
    popupMenuDragState.originTop = Number.isFinite(currentWindow?.top) ? currentWindow.top : fallbackTop;
  });

  document.body.style.userSelect = "none";
  popupMenuDragHandles.forEach((handle) => handle.classList.add("is-window-dragging"));

  event.preventDefault();
  window.addEventListener("pointermove", handlePopupMainMenuDragMove);
  window.addEventListener("pointerup", stopPopupMainMenuDrag);
  window.addEventListener("pointercancel", stopPopupMainMenuDrag);
};

const initMainMenuDragging = async () => {
  if (!chrome.windows?.getCurrent || !chrome.windows?.update) return;

  const manifestPermissions = chrome.runtime?.getManifest?.()?.permissions || [];
  if (!manifestPermissions.includes("windows")) return;

  const currentWindow = await getCurrentWindow();
  if (!currentWindow?.id) return;

  const currentTab = await getCurrentTab();
  popupMenuDragRequiresDetach = !currentTab;

  if (popupMenuDragRequiresDetach) {
    const detachedTab = await findDetachedPopupTab(currentWindow.id);
    if (detachedTab?.windowId) {
      const focused = await focusWindow(detachedTab.windowId);
      if (focused) {
        window.close();
        return;
      }
    }
  }

  popupMenuDragWindowId = popupMenuDragRequiresDetach ? null : currentWindow.id;
  popupMenuDragHandles = [
    document.querySelector(".popup-header"),
    document.querySelector(".tab-navigation"),
  ].filter((node) => node instanceof Element);

  popupMenuDragHandles.forEach((handle) => {
    handle.classList.add("is-window-drag-handle");
    handle.addEventListener("pointerdown", beginPopupMainMenuDrag);
  });
};

const renderUploadBuckets = () => {
  ensureUploadBuckets();
  let totalFileCount = 0;

  for (const section of UPLOAD_SECTION_CONFIG) {
    const files = state.uploadBuckets[section.key] || [];
    totalFileCount += files.length;

    const container = document.getElementById(section.listId);
    const card = document.querySelector(`[data-upload-section="${section.key}"]`);
    if (card) {
      card.classList.toggle("has-files", files.length > 0);
    }

    if (!container) continue;

    if (files.length === 0) {
      container.innerHTML = '<div class="upload-bucket-files-empty">No files selected.</div>';
      continue;
    }

    container.innerHTML = files
      .map(
        (file, index) => `
          <div class="upload-bucket-file">
            <div class="upload-bucket-file-info">
              <span class="upload-bucket-file-name">${escapeHtml(file.name)}</span>
              <span class="upload-bucket-file-meta">${escapeHtml(formatUploadBytes(file.size))}</span>
            </div>
            <button
              type="button"
              class="upload-bucket-file-remove"
              data-upload-remove-section="${section.key}"
              data-upload-remove-index="${index}"
              aria-label="Remove ${escapeHtml(file.name)}"
              title="Remove"
            >
              ×
            </button>
          </div>
        `
      )
      .join("");

    container.querySelectorAll(".upload-bucket-file-remove").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        const sectionKey = button.getAttribute("data-upload-remove-section");
        const index = Number(button.getAttribute("data-upload-remove-index"));
        if (!sectionKey || Number.isNaN(index)) return;

        ensureUploadBuckets();
        const sectionFiles = state.uploadBuckets[sectionKey] || [];
        if (index < 0 || index >= sectionFiles.length) return;
        sectionFiles.splice(index, 1);
        renderUploadBuckets();
      });
    });
  }

  state.selectedFilesList = flattenUploadBuckets().map(({ file }) => file);
  if (dom.analyzeDocuments) dom.analyzeDocuments.disabled = totalFileCount === 0;
  updateTabBadges(state.latestPayloadSnapshot?.payload, totalFileCount);
  updateUploadSteps(totalFileCount > 0 ? 1 : 0);
  renderUploadBucketStatuses();
  updateUploadPendingStatus();
  updateUploadActionInterlocks();
};

const isSupportedUploadFile = (file) => {
  const name = String(file?.name || "").toLowerCase();
  if (/\.(pdf|doc|docx|txt|csv)$/.test(name)) return true;

  const mimeType = String(file?.type || "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  return Boolean(URL_UPLOAD_EXTENSION_BY_MIME[mimeType]);
};

const getSectionDisplayName = (sectionKey) => {
  const section = UPLOAD_SECTION_CONFIG.find((item) => item.key === sectionKey);
  const heading = String(section?.heading || sectionKey);
  return heading.replace(/^===\s*/u, "").replace(/\s*===$/u, "").trim();
};

const getAutoCollectRule = (sectionKey) => {
  const rule = SECTION_AUTO_COLLECT_RULES[sectionKey];
  if (rule) return rule;
  return {
    sectionLabel: getSectionDisplayName(sectionKey),
    keywords: [],
    single: false,
  };
};

const getCaseIdForAutoCollect = () => {
  const selectedCaseId = String(state.selectedAutofillUser?.acpId || "").trim();
  if (selectedCaseId) return selectedCaseId;

  const typedCaseId = String(dom.caseId?.value || "").trim();
  if (typedCaseId) return typedCaseId;

  return "";
};

const MOBIZIO_MONTH_LOOKUP = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

const MOBIZIO_DATE_HINT_PATTERNS = [
  /\b\d{1,2}\/[A-Za-z]{3}\/\d{2,4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)?\b/gi,
  /\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}(?:[,\s]+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)?\b/gi,
  /\b\d{4}[\/-]\d{1,2}[\/-]\d{1,2}(?:[T\s]+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)?\b/gi,
];

const normalizeMobizioYear = (year) => {
  const numeric = Number(year);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric >= 100) return numeric;
  return numeric >= 70 ? numeric + 1900 : numeric + 2000;
};

const toMobizioTimestamp = ({ day, month, year, hours = 0, minutes = 0, seconds = 0, meridiem = "" }) => {
  const numericDay = Number(day);
  const numericMonth = Number(month);
  const normalizedYear = normalizeMobizioYear(year);
  let numericHours = Number(hours);
  const numericMinutes = Number(minutes);
  const numericSeconds = Number(seconds);

  if (
    !Number.isFinite(numericDay) ||
    !Number.isFinite(numericMonth) ||
    !Number.isFinite(normalizedYear) ||
    !Number.isFinite(numericHours) ||
    !Number.isFinite(numericMinutes) ||
    !Number.isFinite(numericSeconds)
  ) {
    return 0;
  }

  const normalizedMeridiem = String(meridiem || "").trim().toUpperCase();
  if (normalizedMeridiem === "PM" && numericHours < 12) {
    numericHours += 12;
  } else if (normalizedMeridiem === "AM" && numericHours === 12) {
    numericHours = 0;
  }

  if (
    numericDay < 1 ||
    numericDay > 31 ||
    numericMonth < 0 ||
    numericMonth > 11 ||
    numericHours < 0 ||
    numericHours > 23 ||
    numericMinutes < 0 ||
    numericMinutes > 59 ||
    numericSeconds < 0 ||
    numericSeconds > 59
  ) {
    return 0;
  }

  const timestamp = new Date(
    normalizedYear,
    numericMonth,
    numericDay,
    numericHours,
    numericMinutes,
    numericSeconds,
    0
  ).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const parseMobizioUploadedAt = (rawValue) => {
  const value = String(rawValue || "").trim();
  if (!value) return 0;

  const dayMonthNameMatch = value.match(
    /^(\d{1,2})\/([A-Za-z]{3})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i
  );
  if (dayMonthNameMatch) {
    const month = MOBIZIO_MONTH_LOOKUP[String(dayMonthNameMatch[2]).toLowerCase()];
    if (Number.isFinite(month)) {
      const parsed = toMobizioTimestamp({
        day: dayMonthNameMatch[1],
        month,
        year: dayMonthNameMatch[3],
        hours: dayMonthNameMatch[4] || 0,
        minutes: dayMonthNameMatch[5] || 0,
        seconds: dayMonthNameMatch[6] || 0,
        meridiem: dayMonthNameMatch[7] || "",
      });
      if (parsed > 0) return parsed;
    }
  }

  const dayMonthNumericMatch = value.match(
    /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i
  );
  if (dayMonthNumericMatch) {
    const parsed = toMobizioTimestamp({
      day: dayMonthNumericMatch[1],
      month: Number(dayMonthNumericMatch[2]) - 1,
      year: dayMonthNumericMatch[3],
      hours: dayMonthNumericMatch[4] || 0,
      minutes: dayMonthNumericMatch[5] || 0,
      seconds: dayMonthNumericMatch[6] || 0,
      meridiem: dayMonthNumericMatch[7] || "",
    });
    if (parsed > 0) return parsed;
  }

  const yearMonthNumericMatch = value.match(
    /^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i
  );
  if (yearMonthNumericMatch) {
    const parsed = toMobizioTimestamp({
      day: yearMonthNumericMatch[3],
      month: Number(yearMonthNumericMatch[2]) - 1,
      year: yearMonthNumericMatch[1],
      hours: yearMonthNumericMatch[4] || 0,
      minutes: yearMonthNumericMatch[5] || 0,
      seconds: yearMonthNumericMatch[6] || 0,
      meridiem: yearMonthNumericMatch[7] || "",
    });
    if (parsed > 0) return parsed;
  }

  const directlyParsed = Date.parse(value);
  if (!Number.isNaN(directlyParsed)) {
    return directlyParsed;
  }

  return 0;
};

const inferMobizioDocumentTimestamp = (documentEntry) => {
  const fromUploadedDate = parseMobizioUploadedAt(documentEntry?.uploadedDate);
  if (fromUploadedDate > 0) return fromUploadedDate;

  const textFields = [documentEntry?.fileName, documentEntry?.name, documentEntry?.description]
    .map((value) => String(value || ""))
    .filter(Boolean);

  let bestTimestamp = 0;
  for (const fieldText of textFields) {
    for (const pattern of MOBIZIO_DATE_HINT_PATTERNS) {
      const matches = fieldText.match(pattern) || [];
      for (const match of matches) {
        const parsed = parseMobizioUploadedAt(match);
        if (parsed > bestTimestamp) {
          bestTimestamp = parsed;
        }
      }
    }
  }

  return bestTimestamp;
};

const isAutoCollectRecencyFirstSection = (sectionKey) => {
  const configuredSections = getPopupAutoCollectConfig().recencyFirstSections;
  return Array.isArray(configuredSections) && configuredSections.includes(sectionKey);
};

const shouldDefaultLatestAutoCollectSelection = (sectionKey) =>
  Array.isArray(getPopupAutoCollectConfig().latestSelectionSections) &&
  getPopupAutoCollectConfig().latestSelectionSections.includes(sectionKey);

const scoreDocumentForSectionDetailed = (sectionKey, documentEntry, uploadedTimestamp = 0) => {
  const rule = getAutoCollectRule(sectionKey);
  const keywords = Array.isArray(rule.keywords) ? rule.keywords : [];
  if (keywords.length === 0) {
    return {
      score: 0,
      keywordMatches: [],
      confidenceLevel: 0,
      confidenceLabel: "Not Suggested",
      scoringNotes: [],
    };
  }

  const weightedFields = [
    { key: "name", text: String(documentEntry?.name || "").toLowerCase(), weight: 4 },
    { key: "fileName", text: String(documentEntry?.fileName || "").toLowerCase(), weight: 3 },
    { key: "description", text: String(documentEntry?.description || "").toLowerCase(), weight: 2 },
    { key: "uploadedBy", text: String(documentEntry?.uploadedBy || "").toLowerCase(), weight: 1 },
  ];

  let score = 0;
  const keywordMatches = [];
  const scoringNotes = [];

  for (const rawKeyword of keywords) {
    const keyword = String(rawKeyword || "").trim().toLowerCase();
    if (!keyword) continue;

    let bestFieldWeight = 0;
    for (const field of weightedFields) {
      if (field.text && field.text.includes(keyword)) {
        bestFieldWeight = Math.max(bestFieldWeight, field.weight);
      }
    }

    if (bestFieldWeight > 0) {
      score += bestFieldWeight;
      keywordMatches.push(keyword);
      scoringNotes.push(`${keyword} (+${bestFieldWeight})`);
    }
  }

  if (Number.isFinite(uploadedTimestamp) && uploadedTimestamp > 0) {
    const ageMs = Date.now() - uploadedTimestamp;
    const ageDays = Math.max(0, ageMs / (24 * 60 * 60 * 1000));
    let recencyBonus = 0;
    if (ageDays <= 14) {
      recencyBonus = 4;
      scoringNotes.push("uploaded in last 14 days (+4)");
    } else if (ageDays <= 45) {
      recencyBonus = 3;
      scoringNotes.push("recent upload (+3)");
    } else if (ageDays <= 120) {
      recencyBonus = 1;
      scoringNotes.push("fairly recent upload (+1)");
    }

    if (recencyBonus > 0 && isAutoCollectRecencyFirstSection(sectionKey)) {
      recencyBonus += 1;
      scoringNotes.push("section recency priority (+1)");
    }

    score += recencyBonus;
  }

  if (String(documentEntry?.downloadId || "").trim()) {
    score += 1;
    scoringNotes.push("direct document ID (+1)");
  }

  const candidateUrlCount = Array.isArray(documentEntry?.candidateUrls)
    ? documentEntry.candidateUrls.filter(Boolean).length
    : 0;
  if (candidateUrlCount >= 2) {
    score += 1;
    scoringNotes.push("multiple URL hints (+1)");
  }

  const confidenceLevel = score >= 8 ? 3 : score >= 5 ? 2 : score > 0 ? 1 : 0;
  const confidenceLabel =
    confidenceLevel === 3
      ? "High Confidence"
      : confidenceLevel === 2
      ? "Medium Confidence"
      : confidenceLevel === 1
      ? "Low Confidence"
      : "Not Suggested";

  return {
    score,
    keywordMatches: keywordMatches.slice(0, 6),
    confidenceLevel,
    confidenceLabel,
    scoringNotes: scoringNotes.slice(0, 6),
  };
};

const scoreDocumentForSection = (sectionKey, documentEntry, uploadedTimestamp = 0) => {
  const details = scoreDocumentForSectionDetailed(sectionKey, documentEntry, uploadedTimestamp);
  return details.score;
};

const rankDocumentsForSection = (sectionKey, documents) =>
  [...documents]
    .map((entry) => {
      const uploadedTimestamp = inferMobizioDocumentTimestamp(entry);
      const scoring = scoreDocumentForSectionDetailed(sectionKey, entry, uploadedTimestamp);
      return {
        ...entry,
        sectionScore: scoring.score,
        sectionKeywordMatches: scoring.keywordMatches,
        sectionConfidenceLevel: scoring.confidenceLevel,
        sectionConfidenceLabel: scoring.confidenceLabel,
        sectionScoreNotes: scoring.scoringNotes,
        uploadedTimestamp,
      };
    })
    .sort((a, b) => {
      if (isAutoCollectRecencyFirstSection(sectionKey)) {
        const aSuggested = Number(a.sectionScore || 0) > 0 ? 1 : 0;
        const bSuggested = Number(b.sectionScore || 0) > 0 ? 1 : 0;
        if (bSuggested !== aSuggested) {
          return bSuggested - aSuggested;
        }
        if (b.uploadedTimestamp !== a.uploadedTimestamp) {
          return b.uploadedTimestamp - a.uploadedTimestamp;
        }
        if (b.sectionConfidenceLevel !== a.sectionConfidenceLevel) {
          return b.sectionConfidenceLevel - a.sectionConfidenceLevel;
        }
        if (b.sectionScore !== a.sectionScore) {
          return b.sectionScore - a.sectionScore;
        }
      } else {
        if (b.sectionConfidenceLevel !== a.sectionConfidenceLevel) {
          return b.sectionConfidenceLevel - a.sectionConfidenceLevel;
        }
        if (b.sectionScore !== a.sectionScore) {
          return b.sectionScore - a.sectionScore;
        }
        if (b.uploadedTimestamp !== a.uploadedTimestamp) {
          return b.uploadedTimestamp - a.uploadedTimestamp;
        }
      }

      const left = String(a.fileName || a.name || "");
      const right = String(b.fileName || b.name || "");
      return left.localeCompare(right);
    });

const buildMobizioDocumentListUrl = (caseId) =>
  `https://clece.mobizio.com${getMobizioDocumentListPath()}?caseId=${encodeURIComponent(caseId)}&serviceId=${encodeURIComponent(getMobizioDocumentServiceId())}`;

const buildMobizioInitialAssessmentUrl = (caseId) =>
  `https://clece.mobizio.com${getMobizioInitialAssessmentPath()}?caseId=${encodeURIComponent(caseId)}&serviceDataGroupId=${encodeURIComponent(
    getMobizioInitialAssessmentServiceDataGroupId()
  )}`;

const buildMobizioCarePlanDashboardUrl = (caseId) =>
  `https://clece.mobizio.com${getMobizioCarePlanDashboardPath()}?caseId=${encodeURIComponent(caseId)}`;

const createMobizioDocumentsSource = (caseId, label = "Documents") => ({
  kind: "documents",
  label,
  url: buildMobizioDocumentListUrl(caseId),
  allowDocumentsFallback: false,
});

const createMobizioInitialAssessmentSource = (caseId) => ({
  kind: "initialAssessment",
  label: "Initial Assessment",
  url: buildMobizioInitialAssessmentUrl(caseId),
  allowDocumentsFallback: true,
});

const createMobizioCarePlanSource = (caseId) => ({
  kind: "carePlan",
  label: "Care Plan",
  url: buildMobizioCarePlanDashboardUrl(caseId),
  allowDocumentsFallback: true,
});

const AUTO_COLLECT_SOURCE_BUILDERS = {
  socialWork: (caseId) => createMobizioDocumentsSource(caseId, "Social Work Documents"),
  initialAssessment: (caseId) => createMobizioInitialAssessmentSource(caseId),
  carePlan: (caseId) => createMobizioCarePlanSource(caseId),
  movingHandling: (caseId) => createMobizioDocumentsSource(caseId, "Moving & Handling Documents"),
  additionalDocuments: (caseId) => createMobizioDocumentsSource(caseId, "Additional Documents"),
};

const getMobizioAutoCollectSource = (sectionKey, caseId) => {
  const buildSource = AUTO_COLLECT_SOURCE_BUILDERS[sectionKey];
  if (typeof buildSource === "function") {
    return buildSource(caseId);
  }

  return createMobizioDocumentsSource(caseId);
};

const waitForTabComplete = async (tabId, timeoutMs = 25000) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    let tab;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch {
      throw new Error("The Mobizio document tab was closed before loading completed.");
    }

    if (tab?.status === "complete") {
      return tab;
    }

    await wait(250);
  }

  throw new Error("Timed out waiting for Mobizio documents to load.");
};

const getTabHostName = (tab) => {
  const rawUrl = String(tab?.url || "").trim();
  if (!rawUrl) return "";
  try {
    return String(new URL(rawUrl).hostname || "").toLowerCase();
  } catch {
    return "";
  }
};

const isMobizioHostName = (hostName) => {
  const host = String(hostName || "").toLowerCase();
  return host === "clece.mobizio.com" || host.endsWith(".mobizio.com");
};

const executeScriptInTab = async (tabId, func, args = [], options = {}) => {
  const requestedWorld = String(options?.world || "").trim().toUpperCase();
  const world = requestedWorld === "MAIN" || requestedWorld === "ISOLATED" ? requestedWorld : undefined;
  const timeoutMs = Number.isFinite(options?.timeoutMs) && options.timeoutMs > 0
    ? Math.min(120000, options.timeoutMs)
    : 30000;

  const execution = chrome.scripting.executeScript({
    target: { tabId },
    ...(world ? { world } : {}),
    func,
    args,
  });

  let timeoutHandle = null;
  const timeout = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`Script execution timed out after ${Math.round(timeoutMs / 1000)}s in tab ${tabId}`));
    }, timeoutMs);
  });

  try {
    const results = await Promise.race([execution, timeout]);
    return results?.[0]?.result;
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
};

const getMobizioDocumentsPageUrlInPage = (caseId, defaultServiceId) => {
  const toAbsoluteUrl = (candidate) => {
    const raw = String(candidate || "").trim();
    if (!raw || raw === "#" || raw.toLowerCase().startsWith("javascript:")) return "";
    try {
      return new URL(raw, window.location.href).toString();
    } catch {
      return "";
    }
  };

  const extractUrlsFromText = (rawValue) => {
    const text = String(rawValue || "");
    if (!text) return [];
    const matches =
      text.match(/https?:\/\/[^\s"'<>]+|\/[a-zA-Z0-9][a-zA-Z0-9_\-/.?=&%]*|\?[a-zA-Z0-9][a-zA-Z0-9_\-/.?=&%]*/g) || [];
    return matches
      .map((match) => toAbsoluteUrl(match))
      .filter(Boolean);
  };

  const navCandidates = Array.from(
    document.querySelectorAll(
      "#documentsCaseMenu a[href], a[href*='/case_document_list'], a[href*='case_document_list?caseId='], [data-href*='/case_document_list'], [data-url*='/case_document_list'], [onclick*='case_document_list']"
    )
  );

  for (const candidate of navCandidates) {
    const rawCandidates = [
      candidate?.getAttribute?.("href"),
      candidate?.getAttribute?.("data-href"),
      candidate?.getAttribute?.("data-url"),
      candidate?.getAttribute?.("onclick"),
    ].filter(Boolean);

    for (const rawValue of rawCandidates) {
      const directAbsolute = toAbsoluteUrl(rawValue);
      if (directAbsolute && directAbsolute.includes("/case_document_list")) {
        return directAbsolute;
      }

      const extractedUrls = extractUrlsFromText(rawValue);
      for (const extractedUrl of extractedUrls) {
        if (extractedUrl.includes("/case_document_list")) {
          return extractedUrl;
        }
      }
    }
  }

  const caseIdFromQuery = (() => {
    try {
      return String(new URL(window.location.href).searchParams.get("caseId") || "").trim();
    } catch {
      return "";
    }
  })();

  const serviceIdFromQuery = (() => {
    try {
      return String(new URL(window.location.href).searchParams.get("serviceId") || "").trim();
    } catch {
      return "";
    }
  })();

  const serviceIdFromWindow =
    typeof window.serviceId !== "undefined" && window.serviceId !== null
      ? String(window.serviceId).trim()
      : "";

  const serviceMenuId = String(document.querySelector("[id^='serviceMenu_ID_'].active")?.getAttribute("id") || "");
  const serviceIdFromMenu = serviceMenuId.match(/serviceMenu_ID_(\d+)/i)?.[1] || "";

  const resolvedCaseId = String(caseId || "").trim() || caseIdFromQuery;
  const resolvedServiceId =
    serviceIdFromQuery ||
    serviceIdFromWindow ||
    serviceIdFromMenu ||
    String(defaultServiceId || "").trim() ||
    "1000801";

  if (!resolvedCaseId) return "";

  return `https://clece.mobizio.com/case_document_list?caseId=${encodeURIComponent(resolvedCaseId)}&serviceId=${encodeURIComponent(resolvedServiceId)}`;
};

const normalizeScrapedDocuments = (documents) => {
  const normalized = [];
  const seen = new Set();

  for (let index = 0; index < (Array.isArray(documents) ? documents.length : 0); index += 1) {
    const entry = documents[index] || {};
    const name = String(entry.name || "").trim();
    const fileName = String(entry.fileName || "").trim() || name || `document-${index + 1}.pdf`;
    const description = String(entry.description || "").trim();
    const uploadedDate = String(entry.uploadedDate || "").trim();
    const uploadedBy = String(entry.uploadedBy || "").trim();
    const downloadId = String(entry.downloadId || "").trim();
    const downloadStrategy = String(entry.downloadStrategy || "").trim();
    const exportButtonId = String(entry.exportButtonId || "").trim();
    const orientationButtonId = String(entry.orientationButtonId || "").trim();
    const orientationValue = String(entry.orientationValue || entry.orientation || "").trim();
    const candidateUrls = Array.isArray(entry.candidateUrls)
      ? entry.candidateUrls.map((url) => String(url || "").trim()).filter(Boolean)
      : [];

    if (!downloadId && candidateUrls.length === 0 && !downloadStrategy) {
      continue;
    }

    const dedupeKey = `${downloadStrategy}:${downloadId}:${fileName.toLowerCase()}:${uploadedDate.toLowerCase()}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    normalized.push({
      id: `${downloadId || "row"}-${index}`,
      rowId: String(entry.rowId || index + 1),
      downloadId,
      downloadStrategy,
      exportButtonId,
      orientationButtonId,
      orientationValue,
      name,
      fileName,
      description,
      uploadedDate,
      uploadedBy,
      candidateUrls,
    });
  }

  return normalized;
};

const dedupeAutoCollectSelection = (documents) => {
  const list = Array.isArray(documents) ? documents : [];
  const unique = [];
  const removedLabels = [];
  const seen = new Set();

  for (const entry of list) {
    const downloadId = String(entry?.downloadId || "").trim();
    const primaryCandidate = Array.isArray(entry?.candidateUrls)
      ? String(entry.candidateUrls[0] || "").trim().toLowerCase()
      : "";
    const fileName = String(entry?.fileName || entry?.name || "").trim().toLowerCase();
    const uploadedDate = String(entry?.uploadedDate || "").trim().toLowerCase();
    const key = downloadId
      ? `id:${downloadId}`
      : `meta:${fileName}|${uploadedDate}|${primaryCandidate}`;

    if (seen.has(key)) {
      removedLabels.push(String(entry?.fileName || entry?.name || "Document").trim() || "Document");
      continue;
    }

    seen.add(key);
    unique.push(entry);
  }

  return {
    documents: unique,
    removedCount: removedLabels.length,
    removedLabels,
  };
};

const findBestAutoCollectDefaultIndex = (documents) => {
  if (!Array.isArray(documents) || documents.length === 0) return -1;

  const indexed = documents.map((entry, index) => ({ entry, index }));
  const suggested = indexed.filter(({ entry }) => Number(entry?.sectionScore || 0) > 0);
  const sourcePool = suggested.length > 0 ? suggested : indexed;
  const datedPool = sourcePool.filter(({ entry }) => Number(entry?.uploadedTimestamp || 0) > 0);
  const candidatePool = datedPool.length > 0 ? datedPool : sourcePool;

  candidatePool.sort((a, b) => {
    const aTime = Number(a.entry?.uploadedTimestamp || 0);
    const bTime = Number(b.entry?.uploadedTimestamp || 0);
    if (bTime !== aTime) return bTime - aTime;

    const aConfidence = Number(a.entry?.sectionConfidenceLevel || 0);
    const bConfidence = Number(b.entry?.sectionConfidenceLevel || 0);
    if (bConfidence !== aConfidence) return bConfidence - aConfidence;

    const aScore = Number(a.entry?.sectionScore || 0);
    const bScore = Number(b.entry?.sectionScore || 0);
    if (bScore !== aScore) return bScore - aScore;

    return a.index - b.index;
  });

  return candidatePool[0]?.index ?? -1;
};

const getAutoCollectSelectionChallenger = (documents, bestIndex) => {
  if (!Array.isArray(documents) || documents.length === 0) return null;

  return documents
    .map((entry, index) => ({ entry, index }))
    .filter(({ index }) => index !== bestIndex)
    .sort((left, right) => {
      const leftConfidence = Number(left.entry?.sectionConfidenceLevel || 0);
      const rightConfidence = Number(right.entry?.sectionConfidenceLevel || 0);
      if (rightConfidence !== leftConfidence) {
        return rightConfidence - leftConfidence;
      }

      const leftScore = Number(left.entry?.sectionScore || 0);
      const rightScore = Number(right.entry?.sectionScore || 0);
      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }

      const leftTimestamp = Number(left.entry?.uploadedTimestamp || 0);
      const rightTimestamp = Number(right.entry?.uploadedTimestamp || 0);
      if (rightTimestamp !== leftTimestamp) {
        return rightTimestamp - leftTimestamp;
      }

      return left.index - right.index;
    })[0]?.entry || null;
};

const hasClearAutoCollectLead = (sectionKey, bestEntry, challenger) => {
  if (!bestEntry) return false;
  if (!challenger) return true;

  const bestConfidence = Number(bestEntry?.sectionConfidenceLevel || 0);
  const challengerConfidence = Number(challenger?.sectionConfidenceLevel || 0);
  if (bestConfidence !== challengerConfidence) {
    return bestConfidence > challengerConfidence;
  }

  const bestScore = Number(bestEntry?.sectionScore || 0);
  const challengerScore = Number(challenger?.sectionScore || 0);
  if (bestScore !== challengerScore) {
    return bestScore > challengerScore;
  }

  if (isAutoCollectRecencyFirstSection(sectionKey)) {
    const bestTimestamp = Number(bestEntry?.uploadedTimestamp || 0);
    const challengerTimestamp = Number(challenger?.uploadedTimestamp || 0);
    if (bestTimestamp !== challengerTimestamp) {
      return bestTimestamp > challengerTimestamp;
    }
  }

  return false;
};

const resolveAutomaticAutoCollectSelection = ({ sectionKey, documents, single }) => {
  if (!Array.isArray(documents) || documents.length === 0) {
    return { documents: [], reason: "" };
  }

  const rule = getAutoCollectRule(sectionKey);
  const bestIndex = findBestAutoCollectDefaultIndex(documents);
  if (bestIndex < 0) {
    return { documents: [], reason: "" };
  }

  const bestEntry = documents[bestIndex];
  const suggestedDocuments = documents.filter((entry) => Number(entry?.sectionScore || 0) > 0);
  const bestScore = Number(bestEntry?.sectionScore || 0);
  const bestConfidence = Number(bestEntry?.sectionConfidenceLevel || 0);

  if (documents.length === 1) {
    return {
      documents: [bestEntry],
      reason: `Only one ${rule.sectionLabel} document was found.`,
    };
  }

  if (suggestedDocuments.length === 1 && bestScore > 0) {
    return {
      documents: [bestEntry],
      reason: `One suggested ${rule.sectionLabel} document matched this section.`,
    };
  }

  if ((single || shouldDefaultLatestAutoCollectSelection(sectionKey)) && bestConfidence >= 3) {
    const challenger = getAutoCollectSelectionChallenger(documents, bestIndex);
    if (hasClearAutoCollectLead(sectionKey, bestEntry, challenger)) {
      return {
        documents: [bestEntry],
        reason: single
          ? `Auto-selected the highest-confidence ${rule.sectionLabel} match.`
          : `Auto-selected the strongest latest ${rule.sectionLabel} document.`,
      };
    }
  }

  return { documents: [], reason: "" };
};

const showAutoCollectPickerDialog = ({
  sectionKey,
  documents,
  single,
  sourceLabel = "Documents",
  caseId = "",
}) =>
  new Promise((resolve) => {
    document.querySelector(".auto-collect-overlay")?.remove();

    const rule = getAutoCollectRule(sectionKey);
    const selectedIndexes = new Set();
    const defaultSelectionIndex = findBestAutoCollectDefaultIndex(documents);
    const resolvedCaseId = String(caseId || getCaseIdForAutoCollect()).trim();
    const recommendedCount = documents.filter((entry) => Number(entry?.sectionScore || 0) > 0).length;
    const highConfidenceSuggestedCount = documents.filter((entry) => Number(entry?.sectionConfidenceLevel || 0) >= 3).length;
    const latestPreselected = !single && shouldDefaultLatestAutoCollectSelection(sectionKey) && defaultSelectionIndex >= 0;
    let filterQuery = "";

    if (single && documents.length > 0) {
      selectedIndexes.add(defaultSelectionIndex >= 0 ? defaultSelectionIndex : 0);
    } else if (!single && shouldDefaultLatestAutoCollectSelection(sectionKey) && defaultSelectionIndex >= 0) {
      selectedIndexes.add(defaultSelectionIndex);
    }

    const matchesFilter = (entry, query) => {
      const normalized = String(query || "")
        .trim()
        .toLowerCase();
      if (!normalized) return true;

      const haystack = [
        entry?.name,
        entry?.fileName,
        entry?.description,
        entry?.uploadedBy,
        entry?.uploadedDate,
        entry?.downloadId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalized);
    };

    const getVisibleIndexes = () =>
      documents
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => matchesFilter(entry, filterQuery))
        .map(({ index }) => index);

    const overlay = document.createElement("div");
    overlay.className = "dialog-overlay auto-collect-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = `
      <div class="dialog auto-collect-dialog">
        <div class="dialog-header">
          <span class="dialog-icon dialog-icon-warning" aria-hidden="true">DOC</span>
          <span class="dialog-title">Select ${escapeHtml(rule.sectionLabel)} document${single ? "" : "s"}</span>
        </div>
        <div class="dialog-body">
          <div class="auto-collect-subtitle">Source: Mobizio ${escapeHtml(sourceLabel)} for Case ID ${escapeHtml(
      resolvedCaseId || "Unknown"
    )}. ${recommendedCount > 0 ? `${recommendedCount} suggested based on section keywords.` : ""}${
      highConfidenceSuggestedCount > 0 ? ` ${highConfidenceSuggestedCount} marked high confidence.` : ""
    }${latestPreselected ? " Latest suggested document pre-selected." : ""}</div>
          <div class="auto-collect-toolbar">
            <div class="auto-collect-helper" data-auto-collect-helper></div>
            ${single ? "" : `<div class="toolbar-actions"><button type="button" class="btn btn-secondary btn-sm" data-action="select-suggested">Select suggested</button><button type="button" class="btn btn-secondary btn-sm" data-action="select-all">Select all</button><button type="button" class="btn btn-ghost btn-sm" data-action="clear-selection">Clear</button></div>`}
          </div>
          <div class="auto-collect-filter-row">
            <input
              type="search"
              class="form-input auto-collect-filter-input"
              data-auto-collect-filter
              placeholder="Filter by name, filename, description, uploader, or date"
              autocomplete="off"
            />
            <div class="auto-collect-count" data-auto-collect-count></div>
          </div>
          <div class="auto-collect-table-wrap">
            <table class="auto-collect-table">
              <thead>
                <tr>
                  <th>Select</th>
                  <th>Name</th>
                  <th>Filename</th>
                  <th>Description</th>
                  <th>Uploaded Date</th>
                </tr>
              </thead>
              <tbody data-auto-collect-body></tbody>
            </table>
          </div>
        </div>
        <div class="dialog-actions">
          <button type="button" class="btn btn-secondary" data-action="cancel">Cancel</button>
          <button type="button" class="btn btn-primary" data-action="confirm">Add Selected</button>
        </div>
      </div>
    `;

    const body = overlay.querySelector("[data-auto-collect-body]");
    const helper = overlay.querySelector("[data-auto-collect-helper]");
    const confirmButton = overlay.querySelector("[data-action='confirm']");
    const filterInput = overlay.querySelector("[data-auto-collect-filter]");
    const countLabel = overlay.querySelector("[data-auto-collect-count]");

    const renderRows = () => {
      if (!body) return;

      if (!documents.length) {
        body.innerHTML = '<tr><td colspan="5" class="auto-collect-empty">No documents were found for this service user.</td></tr>';
        return;
      }

      const visibleIndexes = getVisibleIndexes();
      if (visibleIndexes.length === 0) {
        body.innerHTML = '<tr><td colspan="5" class="auto-collect-empty">No documents match the current filter.</td></tr>';
        return;
      }

      body.innerHTML = visibleIndexes
        .map((index) => {
          const entry = documents[index];
          const checked = selectedIndexes.has(index);
          const recommended = entry.sectionScore > 0;
          const diagnostics = [];
          const keywordMatches = Array.isArray(entry.sectionKeywordMatches)
            ? entry.sectionKeywordMatches.filter(Boolean).slice(0, 3)
            : [];
          if (entry.downloadId) diagnostics.push(`ID ${entry.downloadId}`);
          if (Array.isArray(entry.candidateUrls) && entry.candidateUrls.length > 0) {
            diagnostics.push(`${entry.candidateUrls.length} URL hint${entry.candidateUrls.length === 1 ? "" : "s"}`);
          }
          if (entry.sectionConfidenceLevel > 0) {
            diagnostics.push(`${entry.sectionConfidenceLabel || "Suggested"}`);
          }
          if (keywordMatches.length > 0) {
            diagnostics.push(`Matches: ${keywordMatches.join(", ")}`);
          }

          return `
            <tr class="auto-collect-row${checked ? " is-selected" : ""}${recommended ? " is-recommended" : ""}" data-row-index="${index}">
              <td><input type="${single ? "radio" : "checkbox"}" name="auto-collect-selection" data-row-index="${index}" ${checked ? "checked" : ""} /></td>
              <td>
                <div class="auto-collect-name">${escapeHtml(entry.name || "Untitled")}${recommended ? '<span class="auto-collect-badge">Suggested</span>' : ""}</div>
                ${entry.uploadedBy ? `<div class="auto-collect-meta">By ${escapeHtml(entry.uploadedBy)}</div>` : ""}
                ${diagnostics.length > 0 ? `<div class="auto-collect-meta">${escapeHtml(diagnostics.join(" • "))}</div>` : ""}
              </td>
              <td>${escapeHtml(entry.fileName || "-")}</td>
              <td>${escapeHtml(entry.description || "-")}</td>
              <td>${escapeHtml(entry.uploadedDate || "-")}</td>
            </tr>
          `;
        })
        .join("");
    };

    const updateSelectionState = () => {
      const count = selectedIndexes.size;
      const visibleIndexes = getVisibleIndexes();
      const visibleSelectedCount = visibleIndexes.filter((index) => selectedIndexes.has(index)).length;
      const visibleRecommendedCount = visibleIndexes.filter((index) => Number(documents[index]?.sectionScore || 0) > 0).length;
      const visibleHighConfidenceCount = visibleIndexes.filter(
        (index) => Number(documents[index]?.sectionConfidenceLevel || 0) >= 3
      ).length;

      if (countLabel) {
        const visibilityText = filterQuery ? `${visibleIndexes.length} shown of ${documents.length}` : `${documents.length} document${documents.length === 1 ? "" : "s"}`;
        countLabel.textContent =
          visibleRecommendedCount > 0
            ? `${visibilityText} • ${visibleRecommendedCount} suggested${
                visibleHighConfidenceCount > 0 ? ` (${visibleHighConfidenceCount} high confidence)` : ""
              }`
            : visibilityText;
      }

      if (helper) {
        helper.textContent =
          visibleIndexes.length === 0
            ? "Update the filter to show documents."
            : count === 0
            ? visibleRecommendedCount > 0
              ? `Select at least one document (${visibleRecommendedCount} suggested).`
              : "Select at least one document."
            : single
            ? `1 document selected${filterQuery ? ` (${visibleSelectedCount} visible)` : ""}.`
            : `${count} document${count === 1 ? "" : "s"} selected${filterQuery ? ` (${visibleSelectedCount} visible)` : ""}.`;
      }

      if (confirmButton) {
        confirmButton.disabled = count === 0;
        confirmButton.textContent = count > 0 ? `Add Selected${single ? "" : ` (${count})`}` : "Add Selected";
      }

      body?.querySelectorAll(".auto-collect-row").forEach((row) => {
        const index = Number(row.getAttribute("data-row-index"));
        row.classList.toggle("is-selected", selectedIndexes.has(index));
      });
    };

    const selectIndex = (index, checked) => {
      if (!Number.isInteger(index) || index < 0 || index >= documents.length) return;

      if (single) {
        selectedIndexes.clear();
        if (checked) {
          selectedIndexes.add(index);
        }
      } else if (checked) {
        selectedIndexes.add(index);
      } else {
        selectedIndexes.delete(index);
      }

      body?.querySelectorAll("input[data-row-index]").forEach((input) => {
        const rowIndex = Number(input.getAttribute("data-row-index"));
        input.checked = selectedIndexes.has(rowIndex);
      });

      updateSelectionState();
    };

    const closeDialog = (selection = null) => {
      window.removeEventListener("keydown", handleKeydown);
      overlay.remove();
      resolve(selection);
    };

    const handleKeydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog(null);
      }
    };

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        closeDialog(null);
      }
    });

    overlay.querySelector("[data-action='cancel']")?.addEventListener("click", () => {
      closeDialog(null);
    });

    overlay.querySelector("[data-action='confirm']")?.addEventListener("click", () => {
      const selected = [...selectedIndexes]
        .sort((a, b) => a - b)
        .map((index) => documents[index])
        .filter(Boolean);
      closeDialog(selected);
    });

    body?.addEventListener("change", (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      const index = Number(input.getAttribute("data-row-index"));
      selectIndex(index, Boolean(input.checked));
    });

    body?.addEventListener("click", (event) => {
      const row = event.target instanceof Element ? event.target.closest(".auto-collect-row") : null;
      if (!row) return;
      if (event.target instanceof HTMLInputElement) return;
      const index = Number(row.getAttribute("data-row-index"));
      const currentlySelected = selectedIndexes.has(index);
      selectIndex(index, single ? true : !currentlySelected);
    });

    overlay.querySelector("[data-action='select-all']")?.addEventListener("click", () => {
      if (single) return;
      selectedIndexes.clear();
      getVisibleIndexes().forEach((index) => selectedIndexes.add(index));
      body?.querySelectorAll("input[data-row-index]").forEach((input) => {
        input.checked = true;
      });
      updateSelectionState();
    });

    overlay.querySelector("[data-action='select-suggested']")?.addEventListener("click", () => {
      if (single) return;
      selectedIndexes.clear();
      getVisibleIndexes()
        .filter((index) => Number(documents[index]?.sectionScore || 0) > 0)
        .forEach((index) => selectedIndexes.add(index));
      body?.querySelectorAll("input[data-row-index]").forEach((input) => {
        const rowIndex = Number(input.getAttribute("data-row-index"));
        input.checked = selectedIndexes.has(rowIndex);
      });
      updateSelectionState();
    });

    overlay.querySelector("[data-action='clear-selection']")?.addEventListener("click", () => {
      selectedIndexes.clear();
      body?.querySelectorAll("input[data-row-index]").forEach((input) => {
        input.checked = false;
      });
      updateSelectionState();
    });

    filterInput?.addEventListener("input", (event) => {
      const target = event.target;
      filterQuery = target instanceof HTMLInputElement ? target.value : "";
      renderRows();
      updateSelectionState();
    });

    document.body.appendChild(overlay);
    window.addEventListener("keydown", handleKeydown);

    renderRows();
    updateSelectionState();
  });

const scrapeMobizioDocumentsInPage = async () => {
  const toText = (value) => String(value || "").replace(/\s+/g, " ").trim();

  const isPlaceholderText = (value) => {
    const text = toText(value).toLowerCase();
    if (!text) return true;

    return (
      text.includes("no data available") ||
      text.includes("no matching records") ||
      text.includes("no documents found") ||
      text.includes("loading") ||
      text.includes("processing") ||
      text === "-"
    );
  };

  const waitInPage = (ms) =>
    new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });

  const currentPath = String(window.location.pathname || "").toLowerCase();

  const buildCarePlanDashboardDocument = () => {
    if (!currentPath.includes("case_care_plans_dashboard")) {
      return null;
    }

    const exportButton = document.getElementById("download-workplans-as-pdf") || document.querySelector("#download-workplans-as-pdf");
    if (!exportButton) {
      return null;
    }

    const portraitOption =
      document.getElementById("orientation-portrait") ||
      document.querySelector("#orientation-portrait, .select-pdf-orientation[data-orientation='0']");
    const workplanCount = document.querySelectorAll(".workplan-container").length;
    let caseId = "";

    try {
      caseId = String(new URL(window.location.href).searchParams.get("caseId") || "").trim();
    } catch {
      caseId = "";
    }

    return {
      rowId: "care-plan-dashboard-export",
      downloadId: "",
      downloadStrategy: "carePlanDashboardPdf",
      exportButtonId: exportButton.id || "download-workplans-as-pdf",
      orientationButtonId: portraitOption?.id || "orientation-portrait",
      orientationValue: String(portraitOption?.getAttribute?.("data-orientation") || "0").trim() || "0",
      name: "Care Plan PDF Export",
      fileName: caseId ? `care-plan-${caseId}.pdf` : "care-plan.pdf",
      description:
        workplanCount > 0
          ? `${workplanCount} care plan${workplanCount === 1 ? "" : "s"} ready for portrait PDF export.`
          : "Care plan portrait PDF export.",
      uploadedDate: "",
      uploadedBy: "",
      candidateUrls: [],
    };
  };

  const carePlanDashboardDocument = buildCarePlanDashboardDocument();
  if (carePlanDashboardDocument) {
    return { ok: true, documents: [carePlanDashboardDocument] };
  }

  const toAbsoluteUrl = (candidate, baseUrl = window.location.href) => {
    const raw = String(candidate || "").trim();
    if (!raw || raw === "#" || raw.toLowerCase().startsWith("javascript:")) return "";
    try {
      return new URL(raw, baseUrl).toString();
    } catch {
      return "";
    }
  };

  const extractUrlsFromText = (rawValue, baseUrl = window.location.href) => {
    const text = String(rawValue || "");
    if (!text) return [];
    const matches = text.match(/https?:\/\/[^\s"'<>]+|\/[a-zA-Z0-9][a-zA-Z0-9_\-/.?=&%]*|\?[a-zA-Z0-9][a-zA-Z0-9_\-/.?=&%]*/g) || [];
    return matches
      .map((match) => toAbsoluteUrl(match, baseUrl))
      .filter(Boolean);
  };

  const collectUrlsFromElement = (element, accumulator) => {
    if (!element) return;
    const baseUrl = String(element?.ownerDocument?.baseURI || window.location.href || "");

    ["href", "data-url", "data-href", "data-download-url", "data-document-url", "src"].forEach((attributeName) => {
      const value = element.getAttribute?.(attributeName);
      if (!value) return;
      const absolute = toAbsoluteUrl(value, baseUrl);
      if (absolute) accumulator.add(absolute);
    });

    for (const attribute of Array.from(element.attributes || [])) {
      const attrValue = String(attribute?.value || "");
      if (!attrValue) continue;
      extractUrlsFromText(attrValue, baseUrl).forEach((url) => accumulator.add(url));
    }
  };

  const extractNumericIds = (rawValue) => {
    const matches = String(rawValue || "").match(/\b\d{3,}\b/g) || [];
    return matches.map((value) => String(value));
  };

  const collectDownloadIds = (rawValue, accumulator) => {
    if (!rawValue) return;
    const value = String(rawValue);

    const directMatches = value.match(/download-document[_-]?(\d+)/gi) || [];
    for (const directMatch of directMatches) {
      const parsed = String(directMatch).match(/(\d+)/);
      if (parsed?.[1]) accumulator.add(parsed[1]);
    }

    extractNumericIds(value).forEach((id) => accumulator.add(id));
  };

  const addTemplateUrlsForDownloadId = (downloadId, accumulator) => {
    const id = String(downloadId || "").trim();
    if (!id || !accumulator) return;

    [
      `/download-document_${id}`,
      `/download-document/${id}`,
      `/download-document?documentId=${id}`,
      `/case_document_download/${id}`,
      `/case_document_download?documentId=${id}`,
      `/document/download/${id}`,
      `/documents/download/${id}`,
      `/documents/${id}/download`,
    ]
      .map((candidate) => toAbsoluteUrl(candidate))
      .filter(Boolean)
      .forEach((url) => accumulator.add(url));
  };

  const isLikelyDocumentCandidate = (rawValue) => {
    const value = String(rawValue || "").toLowerCase();
    if (!value) return false;
    if (/\.(pdf|doc|docx|txt|csv)(\?|$)/i.test(value)) return true;
    return (
      value.includes("download") ||
      value.includes("document") ||
      value.includes("attachment") ||
      value.includes("case_document")
    );
  };

  const getSearchDocuments = () => {
    const documents = [];
    const visited = new Set();
    const queue = [document];

    while (queue.length > 0 && documents.length < 12) {
      const current = queue.shift();
      if (!current || visited.has(current)) continue;
      visited.add(current);
      documents.push(current);

      const frames = Array.from(current.querySelectorAll("iframe, frame"));
      for (const frame of frames) {
        try {
          const frameDoc = frame.contentDocument;
          if (frameDoc && !visited.has(frameDoc)) {
            queue.push(frameDoc);
          }
        } catch {
          // Ignore cross-origin frame access failures.
        }
      }
    }

    return documents;
  };

  const TABLE_SELECTORS = [
    "#documentsTable",
    "table#documentsTable",
    "table[id*='documents'][id*='table']",
    "table[id*='document'][id*='table']",
    "table.documents-table",
    "table.document-table",
  ];

  const hasDocumentColumns = (table) => {
    const headerText = Array.from(table.querySelectorAll("thead th"))
      .map((cell) => toText(cell.textContent).toLowerCase())
      .join(" ");

    if (!headerText) return false;

    const markers = ["name", "filename", "description", "uploaded", "date", "document"];
    const markerHits = markers.filter((marker) => headerText.includes(marker)).length;
    return markerHits >= 2;
  };

  const findDocumentsTable = () => {
    const searchDocuments = getSearchDocuments();
    for (const rootDoc of searchDocuments) {
      for (const selector of TABLE_SELECTORS) {
        const table = rootDoc.querySelector(selector);
        if (table) return table;
      }

      const tables = Array.from(rootDoc.querySelectorAll("table"));
      const matchingTable =
        tables.find((table) => table.querySelector(".document-name, .document-filename")) ||
        tables.find((table) => table.querySelector("[id^='download-document_'], .download-document, [data-document-id]")) ||
        tables.find((table) => hasDocumentColumns(table)) ||
        null;

      if (matchingTable) {
        return matchingTable;
      }
    }

    return null;
  };

  const tableHasRealRows = (table) => {
    if (!table) return false;

    const rows = Array.from(table.querySelectorAll("tbody tr"));
    if (rows.length === 0) return false;

    return rows.some((row) => {
      const text = toText(row?.textContent || "");
      if (isPlaceholderText(text)) return false;

      const cellCount = row.querySelectorAll("td").length;
      const hasDocumentMarkers = Boolean(
        row.querySelector(".document-name, .document-filename, [id^='download-document_'], .download-document, [data-document-id]")
      );

      return hasDocumentMarkers || cellCount >= 2;
    });
  };

  const tableHasFinalEmptyState = (table) => {
    if (!table) return false;
    const rows = Array.from(table.querySelectorAll("tbody tr"));
    if (rows.length === 0) return false;

    return rows.some((row) => {
      const text = toText(row?.textContent || "").toLowerCase();
      return (
        text.includes("no data available") ||
        text.includes("no matching records") ||
        text.includes("no documents found")
      );
    });
  };

  const buildLooseDocumentEntries = () => {
    const looseDocuments = [];
    const seen = new Set();
    const searchDocuments = getSearchDocuments();

    searchDocuments.forEach((rootDoc, rootIndex) => {
      const candidates = Array.from(
        rootDoc.querySelectorAll(
          "a[href], a[onclick], button[onclick], [data-download-url], [data-document-url], [data-href*='download'], [data-url*='download'], [id*='download-document'], [data-document-id], [onclick*='download-document'], [onclick*='case_document_download']"
        )
      );

      candidates.forEach((element, elementIndex) => {
        const downloadIds = new Set();
        const candidateUrls = new Set();

        collectUrlsFromElement(element, candidateUrls);
        collectDownloadIds(element.getAttribute?.("id"), downloadIds);
        collectDownloadIds(element.getAttribute?.("data-document-id"), downloadIds);
        collectDownloadIds(element.getAttribute?.("data-id"), downloadIds);
        collectDownloadIds(element.getAttribute?.("data-document"), downloadIds);
        collectDownloadIds(element.getAttribute?.("onclick"), downloadIds);

        const row = element.closest?.("tr");
        if (row) {
          collectUrlsFromElement(row, candidateUrls);
          collectDownloadIds(row.getAttribute("id"), downloadIds);
          collectDownloadIds(row.getAttribute("onclick"), downloadIds);
          row.querySelectorAll("a, [href], [src], [data-url], [data-href], [data-download-url], [data-document-url], [onclick]").forEach((child) => {
            collectUrlsFromElement(child, candidateUrls);
            collectDownloadIds(child.getAttribute?.("id"), downloadIds);
            collectDownloadIds(child.getAttribute?.("data-document-id"), downloadIds);
            collectDownloadIds(child.getAttribute?.("onclick"), downloadIds);
          });
        }

        Array.from(downloadIds).forEach((id) => addTemplateUrlsForDownloadId(id, candidateUrls));

        const urls = Array.from(candidateUrls).filter(Boolean);
        const label = toText(
          element.textContent ||
            element.getAttribute?.("title") ||
            element.getAttribute?.("aria-label") ||
            ""
        );
        const description = toText(element.getAttribute?.("title") || "");
        const hasDownloadSignal =
          downloadIds.size > 0 ||
          urls.some((url) => isLikelyDocumentCandidate(url)) ||
          isLikelyDocumentCandidate(label) ||
          /\.(pdf|doc|docx|txt|csv)$/i.test(label);

        if (!hasDownloadSignal) return;

        const primaryUrl = urls[0] || "";
        const downloadId = Array.from(downloadIds)[0] || "";
        if (!downloadId && !primaryUrl) return;

        const dedupeKey = `${downloadId}|${primaryUrl}|${label.toLowerCase()}`;
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);

        const inferredFromUrl = (() => {
          if (!primaryUrl) return "";
          try {
            const parsed = new URL(primaryUrl);
            return decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "");
          } catch {
            return "";
          }
        })();

        const inferredName = label || inferredFromUrl || `Document ${looseDocuments.length + 1}`;

        looseDocuments.push({
          rowId: `loose-${rootIndex + 1}-${elementIndex + 1}`,
          downloadId,
          name: inferredName,
          fileName: inferredFromUrl || inferredName,
          description,
          uploadedDate: "",
          uploadedBy: "",
          candidateUrls: urls.slice(0, 48),
        });
      });
    });

    return looseDocuments;
  };

  const waitForDocumentsTable = async (timeoutMs = 18000) => {
    const startedAt = Date.now();
    let lastSeenTable = null;

    while (Date.now() - startedAt < timeoutMs) {
      const table = findDocumentsTable();
      if (table) {
        lastSeenTable = table;
        if (tableHasRealRows(table) || tableHasFinalEmptyState(table)) {
          return table;
        }
      }

      await waitInPage(250);
    }

    return lastSeenTable || findDocumentsTable();
  };

  const tableWaitTimeout = currentPath.includes("case_document_list")
    ? 18000
    : currentPath.includes("case_data_group")
    ? 16000
    : currentPath.includes("case_care_plans_dashboard")
    ? 9000
    : 7000;
  const table = await waitForDocumentsTable(tableWaitTimeout);
  if (!table) {
    const looseDocuments = buildLooseDocumentEntries();
    if (looseDocuments.length > 0) {
      return { ok: true, documents: looseDocuments };
    }

    return {
      ok: false,
      error: `Could not find the Mobizio documents table (searched #documentsTable + fallback selectors) on ${window.location.pathname || "/"}.`,
    };
  }

  const isPlaceholderRow = (row) => {
    const text = toText(row?.textContent || "").toLowerCase();
    return isPlaceholderText(text);
  };

  const rawRows = Array.from(table.querySelectorAll("tbody tr"));
  if (rawRows.length === 0) {
    const looseDocuments = buildLooseDocumentEntries();
    if (looseDocuments.length > 0) {
      return { ok: true, documents: looseDocuments };
    }
    return { ok: true, documents: [] };
  }

  const classifiedRows = rawRows.filter((row) => {
    if (isPlaceholderRow(row)) return false;

    const hasDocumentMarkers = Boolean(
      row.querySelector(
        ".open-document, .document-name, .document-filename, .document-description, .document-uploaded-date-time, [id^='download-document_'], .download-document"
      )
    );

    const idText = String(row.getAttribute("id") || "");
    if (hasDocumentMarkers) return true;
    if (/document/i.test(idText)) return true;

    const cellCount = row.querySelectorAll("td").length;
    return cellCount >= 3;
  });

  const rows = classifiedRows.length > 0 ? classifiedRows : rawRows.filter((row) => !isPlaceholderRow(row));

  const documents = rows.map((row, index) => {
    const cells = Array.from(row.querySelectorAll("td"));

    const name = toText(
      row.querySelector(".document-name .open-document")?.textContent ||
        row.querySelector(".document-name")?.textContent ||
        cells[1]?.textContent ||
        cells[0]?.textContent
    );

    const fileName = toText(
      row.querySelector(".document-filename .open-document")?.textContent ||
        row.querySelector(".document-filename")?.textContent ||
        cells[2]?.textContent ||
        cells[1]?.textContent ||
        cells[0]?.textContent
    );

    const description = toText(row.querySelector(".document-description")?.textContent || cells[3]?.textContent);
    const uploadedDate = toText(
      row.querySelector(".document-uploaded-date-time")?.textContent || cells[4]?.textContent || cells[3]?.textContent
    );
    const uploadedBy = toText(row.querySelector(".uploaded-by-name")?.textContent || cells[5]?.textContent);
    const rowId = toText(row.getAttribute("id")) || String(index + 1);

    const downloadElement = row.querySelector('[id^="download-document_"], .download-document, [data-document-id], [onclick*="download"]');
    const openDocumentTrigger = row.querySelector(".document-filename .open-document, .document-name .open-document, .open-document");
    const downloadIds = new Set();
    collectDownloadIds(downloadElement?.id, downloadIds);
    collectDownloadIds(row.getAttribute("id"), downloadIds);

    ["data-document-id", "data-id", "data-document", "data-doc-id"].forEach((attributeName) => {
      collectDownloadIds(downloadElement?.getAttribute?.(attributeName), downloadIds);
      collectDownloadIds(row.getAttribute(attributeName), downloadIds);
    });

    collectDownloadIds(downloadElement?.getAttribute?.("onclick"), downloadIds);
    collectDownloadIds(row.getAttribute("onclick"), downloadIds);

    row.querySelectorAll("[id*='download-document'], [data-document-id], [onclick*='download-document']").forEach((element) => {
      collectDownloadIds(element.getAttribute("id"), downloadIds);
      collectDownloadIds(element.getAttribute("data-document-id"), downloadIds);
      collectDownloadIds(element.getAttribute("onclick"), downloadIds);
    });

    const downloadIdList = Array.from(downloadIds);
    const downloadId = downloadIdList[0] || "";

    const candidateUrls = new Set();
    collectUrlsFromElement(row, candidateUrls);
    collectUrlsFromElement(downloadElement, candidateUrls);

    row
      .querySelectorAll("a, [href], [src], [data-url], [data-href], [data-download-url], [data-document-url], [onclick]")
      .forEach((element) => collectUrlsFromElement(element, candidateUrls));

    [
      row.getAttribute("onclick"),
      downloadElement?.getAttribute?.("onclick"),
      ...Array.from(row.querySelectorAll("[onclick]")).map((element) => element.getAttribute("onclick")),
    ]
      .filter(Boolean)
      .forEach((handlerText) => {
        const rowBaseUrl = String(row?.ownerDocument?.baseURI || window.location.href || "");
        extractUrlsFromText(handlerText, rowBaseUrl).forEach((url) => candidateUrls.add(url));
      });

    downloadIdList.forEach((id) => addTemplateUrlsForDownloadId(id, candidateUrls));
    const downloadStrategy = !downloadId && candidateUrls.size === 0 && openDocumentTrigger ? "rowClickDownload" : "";

    return {
      rowId,
      downloadId,
      downloadStrategy,
      name,
      fileName: fileName || name,
      description,
      uploadedDate,
      uploadedBy,
      candidateUrls: Array.from(candidateUrls).filter(Boolean).slice(0, 48),
    };
  });

  const normalizedDocuments = documents.filter(
    (entry) =>
      String(entry?.downloadId || "").trim() ||
      String(entry?.downloadStrategy || "").trim() ||
      (Array.isArray(entry?.candidateUrls) && entry.candidateUrls.length > 0)
  );

  if (normalizedDocuments.length === 0) {
    const looseDocuments = buildLooseDocumentEntries();
    if (looseDocuments.length > 0) {
      return { ok: true, documents: looseDocuments };
    }
  }

  return { ok: true, documents: normalizedDocuments };
};

const downloadMobizioDocumentInPage = async (documentEntry) => {
  const toText = (value) => String(value || "").trim();
  const waitInPage = (ms) =>
    new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });

  const toAbsoluteUrl = (candidate, baseUrl = window.location.href) => {
    const raw = String(candidate || "").trim();
    if (!raw || raw === "#" || raw.toLowerCase().startsWith("javascript:")) return "";
    try {
      return new URL(raw, baseUrl).toString();
    } catch {
      return "";
    }
  };

  const isLikelyDocumentUrl = (rawUrl) => {
    const value = String(rawUrl || "").toLowerCase();
    if (!value) return false;
    if (/\.(pdf|doc|docx|txt|csv)(\?|$)/i.test(value)) return true;
    return (
      value.includes("download") ||
      value.includes("document") ||
      value.includes("attachment") ||
      value.includes("file")
    );
  };

  const extractUrlsFromText = (rawValue, baseUrl = window.location.href) => {
    const text = String(rawValue || "");
    if (!text) return [];
    const matches = text.match(/https?:\/\/[^\s"'<>]+|\/[a-zA-Z0-9][a-zA-Z0-9_\-/.?=&%]*|\?[a-zA-Z0-9][a-zA-Z0-9_\-/.?=&%]*/g) || [];
    return matches
      .map((match) => toAbsoluteUrl(match, baseUrl))
      .filter(Boolean);
  };

  const collectUrlsFromElement = (element, accumulator) => {
    if (!element) return;
    const baseUrl = String(element?.ownerDocument?.baseURI || window.location.href || "");

    ["href", "data-url", "data-href", "data-download-url", "data-document-url", "src"].forEach((attributeName) => {
      const value = element.getAttribute?.(attributeName);
      if (!value) return;
      const absolute = toAbsoluteUrl(value, baseUrl);
      if (absolute) accumulator.add(absolute);
    });

    for (const attribute of Array.from(element.attributes || [])) {
      const attrValue = String(attribute?.value || "");
      if (!attrValue) continue;
      extractUrlsFromText(attrValue, baseUrl).forEach((url) => accumulator.add(url));
    }
  };

  const extractNumericIds = (rawValue) => {
    const matches = String(rawValue || "").match(/\b\d{3,}\b/g) || [];
    return matches.map((value) => String(value));
  };

  const collectDownloadIds = (rawValue, accumulator) => {
    if (!rawValue) return;
    const value = String(rawValue || "");

    const directMatches = value.match(/download-document[_-]?(\d+)/gi) || [];
    for (const directMatch of directMatches) {
      const parsed = String(directMatch).match(/(\d+)/);
      if (parsed?.[1]) accumulator.add(parsed[1]);
    }

    extractNumericIds(value).forEach((id) => accumulator.add(id));
  };

  const enqueueUrlsFromText = (rawValue, enqueueUrl, { allowAny = false, baseUrl = window.location.href } = {}) => {
    extractUrlsFromText(rawValue, baseUrl).forEach((url) => enqueueUrl(url, { allowAny, baseUrl }));
  };

  const addTemplateUrlsForDownloadId = (downloadId, enqueueUrl, caseId = "") => {
    if (!downloadId) return;

    [
      `/download-document/${downloadId}`,
      `/download-document_${downloadId}`,
      `/download-document?documentId=${downloadId}`,
      `/download-document?id=${downloadId}`,
      `/case_document_download/${downloadId}`,
      `/case_document_download?documentId=${downloadId}`,
      `/case_document_download?document_id=${downloadId}`,
      `/case_document_list/download/${downloadId}`,
      `/case_document_list/download-document_${downloadId}`,
      `/document/download/${downloadId}`,
      `/document/download?documentId=${downloadId}`,
      `/document/download?id=${downloadId}`,
      `/documents/download/${downloadId}`,
      `/documents/download?documentId=${downloadId}`,
      `/documents/${downloadId}/download`,
      `/download/${downloadId}`,
    ].forEach((url) => enqueueUrl(url, { allowAny: true }));

    if (caseId) {
      [
        `/download-document?caseId=${encodeURIComponent(caseId)}&documentId=${encodeURIComponent(downloadId)}`,
        `/case_document_download?caseId=${encodeURIComponent(caseId)}&documentId=${encodeURIComponent(downloadId)}`,
      ].forEach((url) => enqueueUrl(url, { allowAny: true }));
    }
  };

  const getFileNameFromDisposition = (headerValue) => {
    const value = String(headerValue || "");
    if (!value) return "";

    const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
      try {
        return decodeURIComponent(utf8Match[1]);
      } catch {
        return utf8Match[1];
      }
    }

    const quotedMatch = value.match(/filename="([^"]+)"/i);
    if (quotedMatch?.[1]) return quotedMatch[1];

    const plainMatch = value.match(/filename=([^;]+)/i);
    return plainMatch?.[1] ? plainMatch[1].trim() : "";
  };

  const sanitizeFileName = (name, mimeType) => {
    const cleaned = toText(name).replace(/[\\/:*?"<>|]+/g, "_");
    const type = String(mimeType || "").toLowerCase();
    let extension = "";
    if (type.includes("pdf")) extension = "pdf";
    else if (type.includes("msword")) extension = "doc";
    else if (type.includes("wordprocessingml")) extension = "docx";
    else if (type.includes("csv")) extension = "csv";
    else if (type.includes("text/plain")) extension = "txt";

    if (!cleaned) {
      return extension ? `mobizio-document.${extension}` : "mobizio-document";
    }

    if (/\.(pdf|doc|docx|txt|csv)$/i.test(cleaned)) {
      return cleaned;
    }

    return extension ? `${cleaned}.${extension}` : cleaned;
  };

  const arrayBufferToBase64 = (arrayBuffer) => {
    const bytes = new Uint8Array(arrayBuffer);
    const chunkSize = 0x8000;
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const chunk = bytes.subarray(offset, offset + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  };

  const candidateQueue = [];
  const queued = new Set();

  const enqueueUrl = (candidate, { allowAny = false, baseUrl = window.location.href } = {}) => {
    const absoluteUrl = toAbsoluteUrl(candidate, baseUrl);
    if (!absoluteUrl) return;
    if (!allowAny && !isLikelyDocumentUrl(absoluteUrl)) return;
    if (queued.has(absoluteUrl)) return;
    if (candidateQueue.length >= 160) return;

    queued.add(absoluteUrl);
    candidateQueue.push(absoluteUrl);
  };

  const runRowClickDownload = async () => {
    if (String(documentEntry?.downloadStrategy || "").trim() !== "rowClickDownload") {
      return null;
    }

    const isDownloadLikeResponse = (contentType, contentDisposition, urlHint = "") => {
      const type = String(contentType || "").toLowerCase();
      const disposition = String(contentDisposition || "").toLowerCase();
      const url = String(urlHint || "").toLowerCase();

      return (
        disposition.includes("attachment") ||
        /(pdf|msword|wordprocessingml|text\/plain|csv|application\/octet-stream)/i.test(type) ||
        /\.(pdf|doc|docx|txt|csv)(\?|$)/i.test(url) ||
        url.includes("/_content") ||
        url.includes("/download")
      );
    };

    const buildDownloadedPayload = async (captured) => {
      const fallbackName =
        toText(documentEntry?.fileName) || toText(documentEntry?.name) || "mobizio-document";
      const fileName = sanitizeFileName(
        getFileNameFromDisposition(captured.contentDisposition) || fallbackName,
        captured.contentType || captured.blob.type || "application/octet-stream"
      );

      return {
        ok: true,
        file: {
          name: fileName,
          mimeType: captured.contentType || captured.blob.type || "application/octet-stream",
          size: captured.blob.size,
          base64Data: arrayBufferToBase64(await captured.blob.arrayBuffer()),
          sourceFileName: toText(documentEntry?.fileName),
          sourceName: toText(documentEntry?.name),
          sourceDescription: toText(documentEntry?.description),
          downloadedFrom: captured.url || window.location.href,
        },
      };
    };

    const locateTargetRow = () => {
      const table =
        document.querySelector("#documentsTable") ||
        document.querySelector("table#documentsTable") ||
        document.querySelector("table[id*='documents'][id*='table']") ||
        document.querySelector("table[id*='document'][id*='table']");
      const rows = Array.from(table?.querySelectorAll("tbody tr") || []).filter((row) => row.querySelectorAll("td").length > 0);
      if (rows.length === 0) return null;

      const requestedRowId = toText(documentEntry?.rowId);
      if (requestedRowId) {
        const exactRow = document.getElementById(requestedRowId);
        if (exactRow instanceof HTMLTableRowElement) {
          return exactRow;
        }

        const numericIndex = Number(requestedRowId);
        if (Number.isInteger(numericIndex) && numericIndex > 0 && rows[numericIndex - 1]) {
          return rows[numericIndex - 1];
        }
      }

      const requestedName = toText(documentEntry?.name).toLowerCase();
      const requestedFileName = toText(documentEntry?.fileName).toLowerCase();
      const requestedUploadedDate = toText(documentEntry?.uploadedDate).toLowerCase();
      let bestRow = null;
      let bestScore = 0;

      rows.forEach((row) => {
        const rowName = toText(row.querySelector(".document-name")?.textContent).toLowerCase();
        const rowFileName = toText(row.querySelector(".document-filename")?.textContent).toLowerCase();
        const rowUploadedDate = toText(row.querySelector(".document-uploaded-date-time")?.textContent).toLowerCase();
        let score = 0;

        if (requestedFileName && rowFileName === requestedFileName) score += 8;
        else if (requestedFileName && rowFileName && (rowFileName.includes(requestedFileName) || requestedFileName.includes(rowFileName))) score += 4;

        if (requestedName && rowName === requestedName) score += 6;
        else if (requestedName && rowName && (rowName.includes(requestedName) || requestedName.includes(rowName))) score += 3;

        if (requestedUploadedDate && rowUploadedDate === requestedUploadedDate) score += 2;

        if (score > bestScore) {
          bestScore = score;
          bestRow = row;
        }
      });

      return bestScore > 0 ? bestRow : null;
    };

    const targetRow = locateTargetRow();
    const triggerElement = targetRow?.querySelector(
      ".document-filename .open-document, .document-name .open-document, .open-document, [onclick*='download'], [data-document-id]"
    );

    if (!targetRow || !triggerElement) {
      return {
        ok: false,
        error: "Could not find the selected document row on the Mobizio documents page.",
      };
    }

    const recordedFiles = [];
    const restoreHooks = [];

    const clickElement = (element) => {
      if (!element) return false;
      const mouseOptions = { bubbles: true, cancelable: true, view: window };
      element.dispatchEvent(new MouseEvent("mousedown", mouseOptions));
      element.dispatchEvent(new MouseEvent("mouseup", mouseOptions));
      element.dispatchEvent(new MouseEvent("click", mouseOptions));
      if (typeof element.click === "function") {
        element.click();
      }
      return true;
    };

    const recordCandidateUrl = (candidate, baseUrl = window.location.href) => {
      if (!candidate) return;
      enqueueUrl(candidate, { allowAny: true, baseUrl });
    };

    const scanDynamicDownloadHints = () => {
      document
        .querySelectorAll(
          "iframe[src], frame[src], embed[src], object[data], a[download], a[href*='download'], a[href*='.pdf'], [data-download-url], [data-document-url], [onclick*='download'], [onclick*='.pdf']"
        )
        .forEach((element) => {
          const baseUrl = String(element?.ownerDocument?.baseURI || window.location.href || "");
          const discoveredUrls = new Set();
          collectUrlsFromElement(element, discoveredUrls);
          discoveredUrls.forEach((url) => recordCandidateUrl(url, baseUrl));
        });
    };

    const captureResponse = async (response, urlHint = "") => {
      if (!response) return;

      const contentType = response.headers?.get?.("content-type") || "";
      const contentDisposition = response.headers?.get?.("content-disposition") || "";
      const responseUrl = String(response.url || urlHint || "").trim();

      if (isDownloadLikeResponse(contentType, contentDisposition, responseUrl)) {
        const blob = await response.blob();
        if (blob && blob.size > 0) {
          recordedFiles.push({
            blob,
            contentType,
            contentDisposition,
            url: responseUrl,
          });
        }
        return;
      }

      if (/text\/html/i.test(contentType) && !/attachment/i.test(contentDisposition)) {
        const html = await response.text();
        if (!html) return;

        const responseBaseUrl = responseUrl || window.location.href;
        const parsed = new DOMParser().parseFromString(html, "text/html");
        parsed
          .querySelectorAll("a[href], iframe[src], frame[src], embed[src], object[data], source[src], form[action], [onclick]")
          .forEach((element) => {
            const candidate =
              element.getAttribute("href") ||
              element.getAttribute("src") ||
              element.getAttribute("data") ||
              element.getAttribute("action") ||
              "";
            if (candidate) {
              recordCandidateUrl(candidate, responseBaseUrl);
            }
            extractUrlsFromText(element.getAttribute("onclick"), responseBaseUrl).forEach((url) => recordCandidateUrl(url, responseBaseUrl));
          });
      }
    };

    const createWindowOpenStub = (absoluteUrl) => ({
      closed: false,
      close() {},
      focus() {},
      location: { href: absoluteUrl || "" },
    });

    const patch = (target, key, replacement) => {
      if (!target || !key) return;
      const original = target[key];
      if (typeof original !== "function") return;
      target[key] = replacement(original);
      restoreHooks.push(() => {
        target[key] = original;
      });
    };

    patch(window, "fetch", (originalFetch) => async (...args) => {
      const requestUrl = (() => {
        const candidate = args[0];
        if (typeof candidate === "string") return candidate;
        if (candidate && typeof candidate.url === "string") return candidate.url;
        return "";
      })();

      const response = await originalFetch.apply(window, args);
      try {
        await captureResponse(response.clone(), requestUrl);
      } catch {
        // Ignore capture failures and allow the original request to complete.
      }
      return response;
    });

    if (typeof XMLHttpRequest !== "undefined") {
      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;

      XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {
        this.__caExportUrl = toAbsoluteUrl(url, window.location.href);
        return originalOpen.call(this, method, url, ...rest);
      };

      XMLHttpRequest.prototype.send = function patchedSend(...args) {
        this.addEventListener(
          "loadend",
          async () => {
            try {
              const responseUrl = String(this.responseURL || this.__caExportUrl || "").trim();
              const contentType = this.getResponseHeader("content-type") || "";
              const contentDisposition = this.getResponseHeader("content-disposition") || "";

              if (isDownloadLikeResponse(contentType, contentDisposition, responseUrl)) {
                let blob = null;
                if (this.response instanceof Blob) {
                  blob = this.response;
                } else if (this.response instanceof ArrayBuffer) {
                  blob = new Blob([this.response], { type: contentType || "application/octet-stream" });
                }

                if (blob && blob.size > 0) {
                  recordedFiles.push({
                    blob,
                    contentType,
                    contentDisposition,
                    url: responseUrl,
                  });
                } else if (responseUrl) {
                  // Response body unavailable (XHR responseType was not blob/arraybuffer);
                  // record the URL so the direct-fetch fallback loop can retrieve it.
                  recordCandidateUrl(responseUrl);
                }
              } else if (responseUrl) {
                recordCandidateUrl(responseUrl);
              }
            } catch {
              // Ignore XHR capture failures.
            }
          },
          { once: true }
        );

        return originalSend.apply(this, args);
      };

      restoreHooks.push(() => {
        XMLHttpRequest.prototype.open = originalOpen;
        XMLHttpRequest.prototype.send = originalSend;
      });
    }

    patch(window, "open", () => (url, ...rest) => {
      const absoluteUrl = toAbsoluteUrl(url, window.location.href);
      if (absoluteUrl) {
        recordCandidateUrl(absoluteUrl);
      }
      return createWindowOpenStub(absoluteUrl);
    });

    if (typeof HTMLAnchorElement !== "undefined") {
      patch(HTMLAnchorElement.prototype, "click", (originalClick) => function patchedAnchorClick(...args) {
        const href = this.getAttribute("href") || this.href || "";
        const baseUrl = String(this.ownerDocument?.baseURI || window.location.href || "");
        if (href) {
          recordCandidateUrl(href, baseUrl);
        }

        if (this.hasAttribute("download") || isLikelyDocumentUrl(href)) {
          return undefined;
        }

        return originalClick.apply(this, args);
      });
    }

    if (typeof HTMLFormElement !== "undefined") {
      patch(HTMLFormElement.prototype, "submit", (originalSubmit) => function patchedFormSubmit(...args) {
        const baseUrl = String(this.ownerDocument?.baseURI || window.location.href || "");
        const action = this.getAttribute("action") || this.action || window.location.href;
        const method = String(this.method || "get").trim().toLowerCase();

        if (method === "get") {
          try {
            const url = new URL(action, baseUrl);
            const formData = new FormData(this);
            for (const [key, value] of formData.entries()) {
              if (typeof value === "string") {
                url.searchParams.append(key, value);
              }
            }
            recordCandidateUrl(url.toString(), baseUrl);
            return undefined;
          } catch {
            recordCandidateUrl(action, baseUrl);
          }
        } else {
          recordCandidateUrl(action, baseUrl);
        }

        return originalSubmit.apply(this, args);
      });
    }

    try {
      clickElement(triggerElement);

      const captureDeadline = Date.now() + 10000;
      while (Date.now() < captureDeadline) {
        scanDynamicDownloadHints();
        if (recordedFiles.length > 0 || candidateQueue.length > 0) {
          break;
        }
        await waitInPage(250);
      }

      if (recordedFiles.length > 0) {
        return await buildDownloadedPayload(recordedFiles[0]);
      }

      if (candidateQueue.length > 0) {
        return null;
      }

      return {
        ok: false,
        error: "Could not trigger the selected Mobizio document download from the documents table.",
      };
    } finally {
      while (restoreHooks.length > 0) {
        const restore = restoreHooks.pop();
        try {
          restore?.();
        } catch {
          // Ignore hook restoration failures.
        }
      }
    }
  };

  const runCarePlanDashboardExport = async () => {
    if (String(documentEntry?.downloadStrategy || "").trim() !== "carePlanDashboardPdf") {
      return null;
    }

    const currentPath = String(window.location.pathname || "").toLowerCase();
    if (!currentPath.includes("case_care_plans_dashboard")) {
      return {
        ok: false,
        error: "Care plan PDF export must run from the Mobizio Care Plans dashboard.",
      };
    }

    const isPdfLikeResponse = (contentType, contentDisposition, urlHint = "") => {
      const type = String(contentType || "").toLowerCase();
      const disposition = String(contentDisposition || "").toLowerCase();
      const url = String(urlHint || "").toLowerCase();

      return type.includes("pdf") || disposition.includes("attachment") || /\.pdf(\?|$)/i.test(url);
    };

    const recordedFiles = [];
    const restoreHooks = [];

    const recordCandidateUrl = (candidate, baseUrl = window.location.href) => {
      if (!candidate) return;
      enqueueUrl(candidate, { allowAny: true, baseUrl });
    };

    const scanDynamicDownloadHints = () => {
      document
        .querySelectorAll(
          "iframe[src], frame[src], embed[src], object[data], a[download], a[href*='download'], a[href*='.pdf'], [data-download-url], [data-document-url], [onclick*='download'], [onclick*='.pdf']"
        )
        .forEach((element) => {
          const baseUrl = String(element?.ownerDocument?.baseURI || window.location.href || "");
          const discoveredUrls = new Set();
          collectUrlsFromElement(element, discoveredUrls);
          discoveredUrls.forEach((url) => recordCandidateUrl(url, baseUrl));
          [
            element.getAttribute?.("href"),
            element.getAttribute?.("src"),
            element.getAttribute?.("data"),
            element.getAttribute?.("action"),
            element.getAttribute?.("data-download-url"),
            element.getAttribute?.("data-document-url"),
          ]
            .filter(Boolean)
            .forEach((value) => recordCandidateUrl(value, baseUrl));

          extractUrlsFromText(element.getAttribute?.("onclick"), baseUrl).forEach((url) => recordCandidateUrl(url, baseUrl));

          if (element instanceof HTMLFormElement) {
            const action = element.getAttribute("action") || element.action || window.location.href;
            const method = String(element.method || "get").trim().toLowerCase();
            if (method === "get") {
              try {
                const url = new URL(action, baseUrl);
                const formData = new FormData(element);
                for (const [key, value] of formData.entries()) {
                  if (typeof value === "string") {
                    url.searchParams.append(key, value);
                  }
                }
                recordCandidateUrl(url.toString(), baseUrl);
              } catch {
                recordCandidateUrl(action, baseUrl);
              }
            } else {
              recordCandidateUrl(action, baseUrl);
            }
          }
        });
    };

    const captureResponse = async (response, urlHint = "") => {
      if (!response) return;

      const contentType = response.headers?.get?.("content-type") || "";
      const contentDisposition = response.headers?.get?.("content-disposition") || "";
      const responseUrl = String(response.url || urlHint || "").trim();

      if (isPdfLikeResponse(contentType, contentDisposition, responseUrl)) {
        const blob = await response.blob();
        if (blob && blob.size > 0) {
          recordedFiles.push({
            blob,
            contentType,
            contentDisposition,
            url: responseUrl,
          });
        }
        return;
      }

      if (/text\/html/i.test(contentType) && !/attachment/i.test(contentDisposition)) {
        const html = await response.text();
        if (!html) return;

        const responseBaseUrl = responseUrl || window.location.href;
        const parsed = new DOMParser().parseFromString(html, "text/html");
        parsed
          .querySelectorAll("a[href], iframe[src], frame[src], embed[src], object[data], source[src], form[action], [onclick]")
          .forEach((element) => {
            const candidate =
              element.getAttribute("href") ||
              element.getAttribute("src") ||
              element.getAttribute("data") ||
              element.getAttribute("action") ||
              "";
            if (candidate) {
              recordCandidateUrl(candidate, responseBaseUrl);
            }
            extractUrlsFromText(element.getAttribute("onclick"), responseBaseUrl).forEach((url) => recordCandidateUrl(url, responseBaseUrl));
          });
      }
    };

    const createWindowOpenStub = (absoluteUrl) => ({
      closed: false,
      close() {},
      focus() {},
      location: { href: absoluteUrl || "" },
    });

    const patch = (target, key, replacement) => {
      if (!target || !key) return;
      const original = target[key];
      if (typeof original !== "function") return;
      target[key] = replacement(original);
      restoreHooks.push(() => {
        target[key] = original;
      });
    };

    patch(window, "fetch", (originalFetch) => async (...args) => {
      const requestUrl = (() => {
        const candidate = args[0];
        if (typeof candidate === "string") return candidate;
        if (candidate && typeof candidate.url === "string") return candidate.url;
        return "";
      })();

      const response = await originalFetch.apply(window, args);
      try {
        await captureResponse(response.clone(), requestUrl);
      } catch {
        // Ignore capture failures and allow the original request to complete.
      }
      return response;
    });

    if (typeof XMLHttpRequest !== "undefined") {
      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;

      XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {
        this.__caExportUrl = toAbsoluteUrl(url, window.location.href);
        return originalOpen.call(this, method, url, ...rest);
      };

      XMLHttpRequest.prototype.send = function patchedSend(...args) {
        this.addEventListener(
          "loadend",
          async () => {
            try {
              const responseUrl = String(this.responseURL || this.__caExportUrl || "").trim();
              const contentType = this.getResponseHeader("content-type") || "";
              const contentDisposition = this.getResponseHeader("content-disposition") || "";

              if (isPdfLikeResponse(contentType, contentDisposition, responseUrl)) {
                let blob = null;
                if (this.response instanceof Blob) {
                  blob = this.response;
                } else if (this.response instanceof ArrayBuffer) {
                  blob = new Blob([this.response], { type: contentType || "application/pdf" });
                }

                if (blob && blob.size > 0) {
                  recordedFiles.push({
                    blob,
                    contentType,
                    contentDisposition,
                    url: responseUrl,
                  });
                } else if (responseUrl) {
                  // Response body unavailable (XHR responseType was not blob/arraybuffer);
                  // record the URL so the direct-fetch fallback loop can retrieve it.
                  recordCandidateUrl(responseUrl);
                }
              } else if (responseUrl) {
                recordCandidateUrl(responseUrl);
              }
            } catch {
              // Ignore XHR capture failures.
            }
          },
          { once: true }
        );

        return originalSend.apply(this, args);
      };

      restoreHooks.push(() => {
        XMLHttpRequest.prototype.open = originalOpen;
        XMLHttpRequest.prototype.send = originalSend;
      });
    }

    patch(window, "open", () => (url, ...rest) => {
      const absoluteUrl = toAbsoluteUrl(url, window.location.href);
      if (absoluteUrl) {
        recordCandidateUrl(absoluteUrl);
      }
      return createWindowOpenStub(absoluteUrl);
    });

    if (typeof HTMLAnchorElement !== "undefined") {
      patch(HTMLAnchorElement.prototype, "click", (originalClick) => function patchedAnchorClick(...args) {
        const href = this.getAttribute("href") || this.href || "";
        const baseUrl = String(this.ownerDocument?.baseURI || window.location.href || "");
        if (href) {
          recordCandidateUrl(href, baseUrl);
        }

        if (this.hasAttribute("download") || isLikelyDocumentUrl(href)) {
          return undefined;
        }

        return originalClick.apply(this, args);
      });
    }

    if (typeof HTMLFormElement !== "undefined") {
      patch(HTMLFormElement.prototype, "submit", (originalSubmit) => function patchedFormSubmit(...args) {
        const baseUrl = String(this.ownerDocument?.baseURI || window.location.href || "");
        const action = this.getAttribute("action") || this.action || window.location.href;
        const method = String(this.method || "get").trim().toLowerCase();

        if (method === "get") {
          try {
            const url = new URL(action, baseUrl);
            const formData = new FormData(this);
            for (const [key, value] of formData.entries()) {
              if (typeof value === "string") {
                url.searchParams.append(key, value);
              }
            }
            recordCandidateUrl(url.toString(), baseUrl);
            return undefined;
          } catch {
            recordCandidateUrl(action, baseUrl);
          }
        } else {
          recordCandidateUrl(action, baseUrl);
        }

        return originalSubmit.apply(this, args);
      });
    }

    const clickElement = (element) => {
      if (!element) return false;
      const mouseOptions = { bubbles: true, cancelable: true, view: window };
      element.dispatchEvent(new MouseEvent("mousedown", mouseOptions));
      element.dispatchEvent(new MouseEvent("mouseup", mouseOptions));
      element.dispatchEvent(new MouseEvent("click", mouseOptions));
      if (typeof element.click === "function") {
        element.click();
      }
      return true;
    };

    const findPortraitOption = () => {
      const explicitId = String(documentEntry?.orientationButtonId || "").trim();
      if (explicitId) {
        const byId = document.getElementById(explicitId);
        if (byId) return byId;
      }

      const explicitValue = String(documentEntry?.orientationValue || "").trim();
      if (explicitValue) {
        const byValue = document.querySelector(`.select-pdf-orientation[data-orientation='${explicitValue}']`);
        if (byValue) return byValue;
      }

      return document.querySelector("#orientation-portrait, .select-pdf-orientation[data-orientation='0']");
    };

    try {
      const exportButtonId = String(documentEntry?.exportButtonId || "").trim();
      const exportButton =
        (exportButtonId && document.getElementById(exportButtonId)) ||
        document.querySelector("#download-workplans-as-pdf");

      if (!exportButton) {
        return {
          ok: false,
          error: "Could not find the care plan PDF download button on the Mobizio page.",
        };
      }

      clickElement(exportButton);

      let portraitOption = null;
      const portraitDeadline = Date.now() + 6000;
      while (Date.now() < portraitDeadline) {
        scanDynamicDownloadHints();
        if (recordedFiles.length > 0 || candidateQueue.length > 0) {
          break;
        }

        portraitOption = findPortraitOption();
        if (portraitOption) {
          break;
        }

        await waitInPage(200);
      }

      if (portraitOption) {
        clickElement(portraitOption);
      }

      const captureDeadline = Date.now() + 10000;
      while (Date.now() < captureDeadline) {
        scanDynamicDownloadHints();
        if (recordedFiles.length > 0 || candidateQueue.length > 0) {
          break;
        }
        await waitInPage(250);
      }

      if (recordedFiles.length > 0) {
        const captured = recordedFiles[0];
        const fileName = sanitizeFileName(
          getFileNameFromDisposition(captured.contentDisposition) ||
            toText(documentEntry?.fileName) ||
            toText(documentEntry?.name) ||
            "care-plan.pdf",
          captured.contentType || captured.blob.type || "application/pdf"
        );

        return {
          ok: true,
          file: {
            name: fileName,
            mimeType: captured.contentType || captured.blob.type || "application/pdf",
            size: captured.blob.size,
            base64Data: arrayBufferToBase64(await captured.blob.arrayBuffer()),
            sourceFileName: toText(documentEntry?.fileName),
            sourceName: toText(documentEntry?.name),
            sourceDescription: toText(documentEntry?.description),
            downloadedFrom: captured.url || window.location.href,
          },
        };
      }

      if (candidateQueue.length > 0) {
        return null;
      }

      return {
        ok: false,
        error: "Could not resolve the care plan PDF export after choosing Portrait.",
      };
    } finally {
      while (restoreHooks.length > 0) {
        const restore = restoreHooks.pop();
        try {
          restore?.();
        } catch {
          // Ignore hook restoration failures.
        }
      }
    }
  };

  const rowClickResult = await runRowClickDownload();
  if (rowClickResult?.ok) {
    return rowClickResult;
  }
  if (rowClickResult?.error && candidateQueue.length === 0) {
    return rowClickResult;
  }

  const carePlanDashboardResult = await runCarePlanDashboardExport();
  if (carePlanDashboardResult?.ok) {
    return carePlanDashboardResult;
  }
  if (carePlanDashboardResult?.error && candidateQueue.length === 0) {
    return carePlanDashboardResult;
  }

  const initialCandidateUrls = Array.isArray(documentEntry?.candidateUrls) ? documentEntry.candidateUrls : [];
  initialCandidateUrls.forEach((url) => enqueueUrl(url, { allowAny: true }));

  const downloadIds = new Set();
  const downloadId = toText(documentEntry?.downloadId);
  if (downloadId) {
    downloadIds.add(downloadId);
  }

  [
    documentEntry?.id,
    documentEntry?.rowId,
    documentEntry?.name,
    documentEntry?.fileName,
    ...(Array.isArray(documentEntry?.candidateUrls) ? documentEntry.candidateUrls : []),
  ].forEach((value) => collectDownloadIds(value, downloadIds));

  const currentCaseId = (() => {
    try {
      return toText(new URL(window.location.href).searchParams.get("caseId"));
    } catch {
      return "";
    }
  })();

  const locatedElements = [];
  if (downloadId) {
    const strictElement = document.getElementById(`download-document_${downloadId}`);
    if (strictElement) locatedElements.push(strictElement);
  }

  if (documentEntry?.rowId) {
    const rowById = document.getElementById(String(documentEntry.rowId));
    if (rowById) locatedElements.push(rowById);
  }

  const requestedFileHint = toText(documentEntry?.fileName || documentEntry?.name).toLowerCase();
  if (requestedFileHint && requestedFileHint.length >= 4) {
    document
      .querySelectorAll("a, button, [onclick], [data-url], [data-href], [data-download-url], [data-document-url]")
      .forEach((element) => {
        const label = toText(
          element.textContent ||
            element.getAttribute?.("title") ||
            element.getAttribute?.("aria-label") ||
            ""
        ).toLowerCase();

        if (!label) return;
        if (label.includes(requestedFileHint) || requestedFileHint.includes(label)) {
          locatedElements.push(element);
        }
      });
  }

  downloadIds.forEach((id) => {
    document
      .querySelectorAll(
        `[id="download-document_${id}"], [id*="download-document_${id}"], [data-document-id="${id}"], a[href*="${id}"][href*="download"], [onclick*="${id}"]`
      )
      .forEach((element) => {
        locatedElements.push(element);
      });
  });

  const discoveredCandidates = new Set();
  locatedElements.forEach((element) => {
    const elementBaseUrl = String(element?.ownerDocument?.baseURI || window.location.href || "");
    collectUrlsFromElement(element, discoveredCandidates);
    enqueueUrlsFromText(element.getAttribute?.("onclick"), enqueueUrl, {
      allowAny: true,
      baseUrl: elementBaseUrl,
    });

    const row = element.closest?.("tr");
    if (row) {
      const rowBaseUrl = String(row?.ownerDocument?.baseURI || window.location.href || "");
      collectUrlsFromElement(row, discoveredCandidates);
      row
        .querySelectorAll("a, [href], [src], [data-url], [data-href], [data-download-url], [data-document-url], [onclick]")
        .forEach((child) => collectUrlsFromElement(child, discoveredCandidates));
      enqueueUrlsFromText(row.getAttribute("onclick"), enqueueUrl, { allowAny: true, baseUrl: rowBaseUrl });
      row.querySelectorAll("[onclick]").forEach((child) => {
        const childBaseUrl = String(child?.ownerDocument?.baseURI || rowBaseUrl || window.location.href || "");
        enqueueUrlsFromText(child.getAttribute("onclick"), enqueueUrl, {
          allowAny: true,
          baseUrl: childBaseUrl,
        });
      });
      collectDownloadIds(row.getAttribute("id"), downloadIds);
      collectDownloadIds(row.getAttribute("onclick"), downloadIds);
    }
  });

  Array.from(discoveredCandidates).forEach((url) => enqueueUrl(url, { allowAny: true }));
  downloadIds.forEach((id) => addTemplateUrlsForDownloadId(id, enqueueUrl, currentCaseId));

  const attempted = [];
  while (candidateQueue.length > 0) {
    const absoluteUrl = candidateQueue.shift();
    if (!absoluteUrl || attempted.includes(absoluteUrl)) continue;
    attempted.push(absoluteUrl);

    try {
      const response = await fetch(absoluteUrl, {
        method: "GET",
        credentials: "include",
        redirect: "follow",
      });

      if (!response.ok) continue;

      const contentType = response.headers.get("content-type") || "";
      const contentDisposition = response.headers.get("content-disposition") || "";
      if (/text\/html/i.test(contentType) && !/attachment/i.test(contentDisposition)) {
        const html = await response.text();
        if (!html) continue;

        const responseBaseUrl = String(response.url || absoluteUrl || window.location.href || "");

        const parsed = new DOMParser().parseFromString(html, "text/html");
        parsed
          .querySelectorAll("a[href], iframe[src], frame[src], embed[src], object[data], source[src]")
          .forEach((element) => {
            const value = element.getAttribute("href") || element.getAttribute("src") || element.getAttribute("data");
            enqueueUrl(value, { allowAny: true, baseUrl: responseBaseUrl });
          });

        parsed.querySelectorAll("[onclick]").forEach((element) => {
          enqueueUrlsFromText(element.getAttribute("onclick"), enqueueUrl, {
            allowAny: true,
            baseUrl: responseBaseUrl,
          });
        });

        const refreshContent = parsed.querySelector('meta[http-equiv="refresh" i]')?.getAttribute("content") || "";
        const refreshMatch = refreshContent.match(/url\s*=\s*([^;]+)/i);
        if (refreshMatch?.[1]) {
          enqueueUrl(refreshMatch[1].replace(/^['"]|['"]$/g, ""), {
            allowAny: true,
            baseUrl: responseBaseUrl,
          });
        }

        enqueueUrlsFromText(html, enqueueUrl, { allowAny: false, baseUrl: responseBaseUrl });
        const htmlIdHints =
          String(html).match(/download-document[_-]?\d+|documentId["'=:\s]+\d{3,}|data-document-id["'=:\s]+\d{3,}/gi) || [];
        htmlIdHints.forEach((hint) => collectDownloadIds(hint, downloadIds));
        downloadIds.forEach((id) => addTemplateUrlsForDownloadId(id, enqueueUrl, currentCaseId));
        continue;
      }

      const blob = await response.blob();
      if (!blob || blob.size === 0) continue;

      const fromDisposition = getFileNameFromDisposition(contentDisposition);
      const fromUrl = (() => {
        try {
          const parsed = new URL(absoluteUrl);
          const last = parsed.pathname.split("/").filter(Boolean).pop() || "";
          return decodeURIComponent(last);
        } catch {
          return "";
        }
      })();

      const fallbackName =
        toText(documentEntry?.fileName) ||
        toText(documentEntry?.name) ||
        `mobizio-document-${downloadId || Date.now()}`;

      const fileName = sanitizeFileName(fromDisposition || fromUrl || fallbackName, contentType || blob.type);
      const base64Data = arrayBufferToBase64(await blob.arrayBuffer());

      return {
        ok: true,
        file: {
          name: fileName,
          mimeType: contentType || blob.type || "application/octet-stream",
          size: blob.size,
          base64Data,
          sourceFileName: toText(documentEntry?.fileName),
          sourceName: toText(documentEntry?.name),
          sourceDescription: toText(documentEntry?.description),
          downloadedFrom: absoluteUrl,
        },
      };
    } catch {
      // Try the next candidate URL.
    }
  }

  return {
    ok: false,
    error: "Could not download the selected document from Mobizio.",
    attempted: attempted.slice(0, 8),
  };
};

const fileFromDownloadedPayload = (filePayload) => {
  const base64Data = String(filePayload?.base64Data || "");
  if (!base64Data) {
    throw new Error("Downloaded file payload was empty.");
  }

  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const metadata = inferDownloadedFileMetadata({
    fileName: normalizeDownloadedFileName(
      String(filePayload?.name || "mobizio-document"),
      String(filePayload?.mimeType || "application/octet-stream")
    ),
    mimeType: String(filePayload?.mimeType || "application/octet-stream"),
    bytes,
    hints: [
      String(filePayload?.sourceFileName || ""),
      String(filePayload?.sourceName || ""),
      String(filePayload?.sourceDescription || ""),
      String(filePayload?.downloadedFrom || ""),
    ],
  });

  return new File([bytes], metadata.fileName, {
    type: metadata.mimeType,
    lastModified: Date.now(),
  });
};

const autoCollectDocumentsForSection = async (sectionKey, triggerButton = null) => {
  if (autoCollectInFlight) {
    showInfo("Auto-collect is already running. Please wait for it to complete.");
    return false;
  }

  autoCollectInFlight = true;
  updateUploadActionInterlocks();

  const section = UPLOAD_SECTION_CONFIG.find((entry) => entry.key === sectionKey);
  if (!section) {
    showError("Unknown upload section selected for auto-collect.");
    autoCollectInFlight = false;
    updateUploadActionInterlocks();
    return false;
  }

  const rule = getAutoCollectRule(sectionKey);
  const caseId = getCaseIdForAutoCollect();
  const startedAtMs = Date.now();

  updateAutoCollectInfoSnapshot(
    createAutoCollectInfoSnapshot({
      status: "running",
      sectionKey,
      sectionLabel: rule.sectionLabel,
      caseId,
      startedAtMs,
      note: "Preparing auto-download session...",
    })
  );

  if (!caseId) {
    showError("Select a service user in Autofill settings (or enter a Case ID) before running auto-collect.");
    finalizeAutoCollectInfoSnapshot({
      status: "error",
      error: "Case ID is required before auto-collect can start.",
      note: "Select a service user in Autofill settings or enter a Case ID manually.",
    });
    switchTab("autofill");
    dom.autofillUserSearch?.focus();
    autoCollectInFlight = false;
    updateUploadActionInterlocks();
    return false;
  }

  let collectionTabId = null;
  let collectionSource = null;
  let didFallbackToDocuments = false;
  if (triggerButton) {
    setButtonLoading(triggerButton, true);
  }

  try {
    collectionSource = getMobizioAutoCollectSource(sectionKey, caseId);
    updateAutoCollectInfoSnapshot({
      sourceKind: collectionSource.kind,
      sourceLabel: collectionSource.label,
      sourceUrl: collectionSource.url,
      note: `Opening Mobizio ${collectionSource.label} source...`,
    });

    updateUploadSyncStatus(`Opening Mobizio ${collectionSource.label} for Case ID ${caseId}...`);

    const collectionTab = await chrome.tabs.create({
      url: collectionSource.url,
      active: false,
    });
    collectionTabId = collectionTab?.id;

    if (!Number.isFinite(collectionTabId)) {
      throw new Error("Could not open the Mobizio source page for auto-collect.");
    }

    let currentTabState = await waitForTabComplete(collectionTabId);
    let currentTabHost = getTabHostName(currentTabState);

    if (currentTabHost && !isMobizioHostName(currentTabHost)) {
      await chrome.tabs.update(collectionTabId, { url: buildMobizioDocumentListUrl(caseId) });
      currentTabState = await waitForTabComplete(collectionTabId);
      currentTabHost = getTabHostName(currentTabState);
      if (currentTabHost && !isMobizioHostName(currentTabHost)) {
        throw new Error(
          "Mobizio redirected this tab outside clece.mobizio.com. Sign in to Mobizio in the browser, then retry auto-collect."
        );
      }
    }

    const executeInCollectionTab = createMobizioCollectionTabExecutor(collectionTabId);

    const scrapeDocumentsWithRetry = async () => {
      let bestAttempt = null;
      let attempts = 0;
      const retryDelaysMs = [0, 700, 1500, 2400];

      for (let index = 0; index < retryDelaysMs.length; index += 1) {
        const delayMs = retryDelaysMs[index];
        if (delayMs > 0) {
          await wait(delayMs);
        }

        const attempt = await executeInCollectionTab(scrapeMobizioDocumentsInPage, [], { world: "MAIN" });
        attempts += 1;
        const discoveredCount = Array.isArray(attempt?.documents) ? attempt.documents.length : 0;

        if (!bestAttempt || (attempt?.ok && !bestAttempt?.ok)) {
          bestAttempt = attempt;
        }

        if (attempt?.ok && discoveredCount > 0) {
          return { scrape: attempt, attempts };
        }

        if (index < retryDelaysMs.length - 1) {
          const attemptError = String(attempt?.error || "").trim();
          const waitingForRender =
            (!attempt?.ok && /documents table|could not read documents/i.test(attemptError)) ||
            (attempt?.ok && discoveredCount === 0);
          if (waitingForRender) {
            updateAutoCollectInfoSnapshot({
              note: `Mobizio documents are still rendering. Retrying capture (${attempts + 1}/${retryDelaysMs.length})...`,
            });
          }
        }
      }

      return {
        scrape: bestAttempt || { ok: false, error: "Could not read documents from the Mobizio page." },
        attempts,
      };
    };

    let scrapeAttempts = 0;
    const initialScrapeRun = await scrapeDocumentsWithRetry();
    let scraped = initialScrapeRun.scrape;
    scrapeAttempts += initialScrapeRun.attempts;
    updateAutoCollectInfoSnapshot({ scrapeAttempts });

    const fallbackToDocuments = async () => {
      if (
        didFallbackToDocuments ||
        collectionSource.kind === "documents" ||
        collectionSource.allowDocumentsFallback === false
      ) {
        return false;
      }

      const discoveredUrl = await executeInCollectionTab(
        getMobizioDocumentsPageUrlInPage,
        [caseId, getMobizioDocumentServiceId()],
        { world: "MAIN" }
      );

      const fallbackDocumentsUrl = String(discoveredUrl || "").trim() || buildMobizioDocumentListUrl(caseId);
      updateUploadSyncStatus("Switching to Mobizio Documents for downloadable records...");
      updateAutoCollectInfoSnapshot({
        fallbackUsed: true,
        sourceUrl: fallbackDocumentsUrl,
        note: "Switched to case Documents source for downloadable records.",
      });
      await chrome.tabs.update(collectionTabId, { url: fallbackDocumentsUrl });
      const fallbackTabState = await waitForTabComplete(collectionTabId);
      const fallbackHost = getTabHostName(fallbackTabState);
      if (fallbackHost && !isMobizioHostName(fallbackHost)) {
        throw new Error(
          "Mobizio redirected this tab outside clece.mobizio.com. Sign in to Mobizio in the browser, then retry auto-collect."
        );
      }

      const fallbackScrapeRun = await scrapeDocumentsWithRetry();
      scraped = fallbackScrapeRun.scrape;
      scrapeAttempts += fallbackScrapeRun.attempts;
      updateAutoCollectInfoSnapshot({ scrapeAttempts });
      didFallbackToDocuments = true;
      return true;
    };

    if (!scraped?.ok) {
      await fallbackToDocuments();
    }

    if (!scraped?.ok) {
      throw new Error(
        scraped?.error ||
          (collectionSource.allowDocumentsFallback === false
            ? `Could not read records from the Mobizio ${collectionSource.label} page.`
            : "Could not read documents from the Mobizio list page.")
      );
    }

    let normalizedDocuments = normalizeScrapedDocuments(scraped.documents);
    if (normalizedDocuments.length === 0) {
      const refreshedScrapeRun = await scrapeDocumentsWithRetry();
      scrapeAttempts += refreshedScrapeRun.attempts;
      updateAutoCollectInfoSnapshot({ scrapeAttempts });
      if (refreshedScrapeRun.scrape?.ok) {
        scraped = refreshedScrapeRun.scrape;
        normalizedDocuments = normalizeScrapedDocuments(refreshedScrapeRun.scrape.documents);
      }
    }

    if (normalizedDocuments.length === 0) {
      const switched = await fallbackToDocuments();
      if (switched) {
        if (!scraped?.ok) {
          throw new Error(scraped?.error || "Could not read documents from the Mobizio list page.");
        }
        normalizedDocuments = normalizeScrapedDocuments(scraped.documents);
        if (normalizedDocuments.length === 0) {
          const refreshedScrapeRun = await scrapeDocumentsWithRetry();
          scrapeAttempts += refreshedScrapeRun.attempts;
          updateAutoCollectInfoSnapshot({ scrapeAttempts });
          if (refreshedScrapeRun.scrape?.ok) {
            scraped = refreshedScrapeRun.scrape;
            normalizedDocuments = normalizeScrapedDocuments(refreshedScrapeRun.scrape.documents);
          }
        }
      }
    }

    if (normalizedDocuments.length === 0) {
      throw new Error(
        collectionSource.allowDocumentsFallback === false
          ? `No downloadable records were found on the Mobizio ${collectionSource.label} page.`
          : "No downloadable documents were found for this service user."
      );
    }

    const rankedDocuments = rankDocumentsForSection(sectionKey, normalizedDocuments);
    const suggestedCount = rankedDocuments.filter((entry) => Number(entry?.sectionScore || 0) > 0).length;
    const highConfidenceCount = rankedDocuments.filter((entry) => Number(entry?.sectionConfidenceLevel || 0) >= 3).length;
    const automaticSelection = resolveAutomaticAutoCollectSelection({
      sectionKey,
      documents: rankedDocuments,
      single: section.single || rule.single,
    });
    updateAutoCollectInfoSnapshot({
      discoveredCount: rankedDocuments.length,
      suggestedCount,
      highConfidenceCount,
      scrapeAttempts,
      note:
        automaticSelection.documents.length > 0
          ? `${automaticSelection.reason} Downloading automatically.`
          : rankedDocuments.length > 0
          ? "Review the picker and confirm which documents to download."
          : "No downloadable documents were discovered.",
    });

    const selectedDocuments =
      automaticSelection.documents.length > 0
        ? automaticSelection.documents
        : await showAutoCollectPickerDialog({
            sectionKey,
            documents: rankedDocuments,
            single: section.single || rule.single,
            sourceLabel: collectionSource.label,
            caseId,
          });

    if (!selectedDocuments || selectedDocuments.length === 0) {
      finalizeAutoCollectInfoSnapshot({
        status: "cancelled",
        note: `${rule.sectionLabel} auto-download was cancelled before download started.`,
        selectedCount: 0,
        dedupedSelectionCount: 0,
        scrapeAttempts,
      });
      updateUploadPendingStatus();
      showInfo(`${rule.sectionLabel} auto-collect was cancelled.`);
      return false;
    }

    const dedupedSelection = dedupeAutoCollectSelection(selectedDocuments);
    const selectedForDownload = dedupedSelection.documents;
    const dedupedSelectionCount = dedupedSelection.removedCount;
    if (selectedForDownload.length === 0) {
      finalizeAutoCollectInfoSnapshot({
        status: "cancelled",
        note: `${rule.sectionLabel} auto-download selection contained duplicate entries only.`,
        selectedCount: 0,
        dedupedSelectionCount,
        scrapeAttempts,
      });
      updateUploadPendingStatus();
      showInfo(`${rule.sectionLabel} auto-collect was cancelled.`);
      return false;
    }

    if (dedupedSelectionCount > 0) {
      const removedPreview = dedupedSelection.removedLabels.slice(0, 2).join(", ");
      showInfo(
        `Removed ${dedupedSelectionCount} duplicate document${dedupedSelectionCount === 1 ? "" : "s"} before download${
          removedPreview ? ` (${removedPreview}${dedupedSelectionCount > 2 ? ` +${dedupedSelectionCount - 2} more` : ""})` : ""
        }.`
      );
    }

    updateAutoCollectInfoSnapshot({
      selectedCount: selectedForDownload.length,
      dedupedSelectionCount,
      selectedDocuments: [...selectedForDownload],
      failedDocuments: [],
      failedDetails: [],
      failureCounts: {},
      probeStatus: "idle",
      probeMessage: "",
      note: `Downloading ${selectedForDownload.length} selected document${selectedForDownload.length === 1 ? "" : "s"}...`,
    });

    const probe = await runAutoCollectDownloadProbe({
      documentEntry: selectedForDownload[0],
      executeInCollectionTab,
    });
    updateAutoCollectInfoSnapshot({
      probeStatus: probe.status,
      probeMessage: probe.message,
      note:
        probe.status === "warning"
          ? `Preflight warning recorded. Continuing with full download loop for ${selectedForDownload.length} document${selectedForDownload.length === 1 ? "" : "s"}.`
          : `Preflight download check passed. Downloading ${selectedForDownload.length} selected document${selectedForDownload.length === 1 ? "" : "s"}...`,
    });

    const downloadPass = await runAutoCollectDownloadLoop({
      documents: selectedForDownload,
      executeInCollectionTab,
      progressVerb: "Downloading",
      prefetchedFirstResult: probe.result,
    });
    const downloadedFiles = downloadPass.downloadedFiles;
    const failedDownloads = downloadPass.failedDocuments.map((entry, index) =>
      getAutoCollectDocumentLabel(entry, index + 1)
    );
    const failedDetails = downloadPass.failedDetails;

    if (downloadedFiles.length === 0) {
      throw new Error("The selected documents could not be downloaded from Mobizio.");
    }

    applyUploadFiles(sectionKey, downloadedFiles);

    const stagedCount = flattenUploadBuckets().length;
    if (failedDownloads.length > 0) {
      const failurePreview = failedDownloads.slice(0, 2).join(", ");
      const hiddenFailures = Math.max(0, failedDownloads.length - 2);
      showInfo(
        `Downloaded ${downloadedFiles.length} file${downloadedFiles.length === 1 ? "" : "s"}; ${failedDownloads.length} failed${
          failurePreview ? ` (${failurePreview}${hiddenFailures > 0 ? ` +${hiddenFailures} more` : ""})` : ""
        }.`
      );
      updateUploadSyncStatus(
        `Staged ${stagedCount} file${stagedCount === 1 ? "" : "s"} after auto-collect. ${failedDownloads.length} document${
          failedDownloads.length === 1 ? "" : "s"
        } failed to download.`,
        "warning"
      );
      finalizeAutoCollectInfoSnapshot({
        status: "partial",
        downloadedCount: downloadedFiles.length,
        failedCount: failedDownloads.length,
        failedDetails,
        failedDocuments: downloadPass.failedDocuments,
        failureCounts: downloadPass.failureCounts,
        selectedDocuments: [...selectedForDownload],
        scrapeAttempts,
        probeStatus: probe.status,
        probeMessage: probe.message,
        selectedCount: selectedForDownload.length,
        dedupedSelectionCount,
        discoveredCount: rankedDocuments.length,
        suggestedCount,
        highConfidenceCount,
        fallbackUsed: didFallbackToDocuments,
        note: `Downloaded ${downloadedFiles.length} of ${selectedForDownload.length} selected document${
          selectedForDownload.length === 1 ? "" : "s"
        }.`,
        error: "",
      });
    } else {
      showSuccess(`Auto-collected ${downloadedFiles.length} ${rule.sectionLabel} document${downloadedFiles.length === 1 ? "" : "s"}.`);
      updateUploadSyncStatus(
        `Staged ${stagedCount} file${stagedCount === 1 ? "" : "s"} after auto-collect.`,
        "success"
      );
      finalizeAutoCollectInfoSnapshot({
        status: "success",
        downloadedCount: downloadedFiles.length,
        failedCount: 0,
        failedDetails: [],
        failedDocuments: [],
        failureCounts: {},
        selectedDocuments: [...selectedForDownload],
        scrapeAttempts,
        probeStatus: probe.status,
        probeMessage: probe.message,
        selectedCount: selectedForDownload.length,
        dedupedSelectionCount,
        discoveredCount: rankedDocuments.length,
        suggestedCount,
        highConfidenceCount,
        fallbackUsed: didFallbackToDocuments,
        note: `Downloaded all ${downloadedFiles.length} selected document${downloadedFiles.length === 1 ? "" : "s"}.`,
        error: "",
      });
    }

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not auto-collect Mobizio documents.";
    updateUploadSyncStatus(message, "error");
    finalizeAutoCollectInfoSnapshot({
      status: "error",
      sourceKind: collectionSource?.kind || "",
      sourceLabel: collectionSource?.label || "",
      sourceUrl: collectionSource?.url || "",
      fallbackUsed: didFallbackToDocuments,
      scrapeAttempts: Number(autoCollectInfoSnapshot?.scrapeAttempts || 0),
      error: message,
      note: "Auto-download stopped before files could be fully staged.",
    });
    showError(message);
    return false;
  } finally {
    if (Number.isFinite(collectionTabId)) {
      try {
        await chrome.tabs.remove(collectionTabId);
      } catch {
        // Ignore tab close failures.
      }
    }

    if (triggerButton) {
      setButtonLoading(triggerButton, false);
    }

    autoCollectInFlight = false;
    updateUploadPendingStatus();
  }
};

const inferExtensionFromMimeType = (mimeType) => {
  const normalized = String(mimeType || "").split(";")[0].trim().toLowerCase();
  return URL_UPLOAD_EXTENSION_BY_MIME[normalized] || "";
};

const getContentDispositionFileName = (headerValue) => {
  const value = String(headerValue || "");
  if (!value) return "";

  const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {
      return utf8Match[1].trim();
    }
  }

  const quotedMatch = value.match(/filename="([^"]+)"/i);
  if (quotedMatch?.[1]) return quotedMatch[1].trim();

  const plainMatch = value.match(/filename=([^;]+)/i);
  if (plainMatch?.[1]) return plainMatch[1].trim();

  return "";
};

const getUrlFileName = (rawUrl) => {
  try {
    const parsed = new URL(rawUrl);
    const pathname = parsed.pathname || "";
    const tail = pathname.split("/").filter(Boolean).pop() || "";
    if (!tail) return "";
    return decodeURIComponent(tail);
  } catch {
    return "";
  }
};

const normalizeDownloadedFileName = (baseName, mimeType) => {
  const cleaned = String(baseName || "").trim().replace(/[\\/:*?"<>|]+/g, "_");
  const extension = inferExtensionFromMimeType(mimeType);

  if (!cleaned) {
    return extension ? `downloaded-file.${extension}` : "downloaded-file";
  }

  if (/\.(pdf|doc|docx|txt|csv)$/i.test(cleaned)) {
    return cleaned;
  }

  return extension ? `${cleaned}.${extension}` : cleaned;
};

const getSupportedExtensionFromName = (fileName) => {
  const match = String(fileName || "")
    .toLowerCase()
    .match(/\.([a-z0-9]{1,8})$/i);
  if (!match?.[1]) return "";
  const extension = match[1];
  return SUPPORTED_UPLOAD_EXTENSIONS.includes(extension) ? extension : "";
};

const getMimeTypeForExtension = (extension) => {
  switch (String(extension || "").toLowerCase()) {
    case "pdf":
      return "application/pdf";
    case "doc":
      return "application/msword";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "csv":
      return "text/csv";
    case "txt":
      return "text/plain";
    default:
      return "";
  }
};

const inferTextExtensionFromBytes = (bytes) => {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) return "";

  const sample = bytes.subarray(0, Math.min(bytes.length, 4096));
  let printableCount = 0;
  for (const value of sample) {
    if (value === 0) return "";
    if (value === 9 || value === 10 || value === 13 || (value >= 32 && value <= 126)) {
      printableCount += 1;
    }
  }

  const printableRatio = printableCount / sample.length;
  if (printableRatio < 0.92) return "";

  const decoded = new TextDecoder("utf-8", { fatal: false }).decode(sample);
  const hasLineBreak = /\r|\n/.test(decoded);
  const hasComma = decoded.includes(",");
  const hasSemicolon = decoded.includes(";");

  if (hasLineBreak && (hasComma || hasSemicolon)) {
    return "csv";
  }

  return "txt";
};

const inferDownloadedFileMetadata = ({ fileName, mimeType, bytes, hints = [] }) => {
  const normalizedMimeType = String(mimeType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  const extensionFromName = getSupportedExtensionFromName(fileName);
  const extensionFromMime = inferExtensionFromMimeType(normalizedMimeType);

  let extensionFromMagic = "";
  if (bytes instanceof Uint8Array && bytes.length >= 5) {
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) {
      extensionFromMagic = "pdf";
    } else if (
      bytes.length >= 8 &&
      bytes[0] === 0xd0 &&
      bytes[1] === 0xcf &&
      bytes[2] === 0x11 &&
      bytes[3] === 0xe0 &&
      bytes[4] === 0xa1 &&
      bytes[5] === 0xb1 &&
      bytes[6] === 0x1a &&
      bytes[7] === 0xe1
    ) {
      extensionFromMagic = "doc";
    } else if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
      extensionFromMagic = "docx";
    } else {
      extensionFromMagic = inferTextExtensionFromBytes(bytes);
    }
  }

  const extensionFromHints = (Array.isArray(hints) ? hints : [])
    .map((hint) => getSupportedExtensionFromName(hint))
    .find(Boolean);

  const resolvedExtension = extensionFromName || extensionFromMime || extensionFromMagic || extensionFromHints || "";

  const originalName = String(fileName || "").trim();
  const sanitizedBaseName = originalName ? originalName.replace(/[\\/:*?"<>|]+/g, "_") : "mobizio-document";
  const resolvedName = extensionFromName
    ? sanitizedBaseName
    : resolvedExtension
    ? `${sanitizedBaseName.replace(/\.[a-z0-9]{1,8}$/i, "")}.${resolvedExtension}`
    : sanitizedBaseName;

  const resolvedMimeType =
    normalizedMimeType && normalizedMimeType !== "application/octet-stream"
      ? normalizedMimeType
      : getMimeTypeForExtension(resolvedExtension) || "application/octet-stream";

  return {
    fileName: resolvedName,
    mimeType: resolvedMimeType,
  };
};

const extractDroppedUrls = (dataTransfer) => {
  if (!dataTransfer) return [];

  const values = [
    dataTransfer.getData("text/uri-list"),
    dataTransfer.getData("text/plain"),
    dataTransfer.getData("URL"),
  ]
    .filter(Boolean)
    .join("\n");

  if (!values) return [];

  const uriListValues = values
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  const inlineMatches = values.match(/https?:\/\/[^\s<>"']+/gi) || [];
  const candidates = [...uriListValues, ...inlineMatches];
  const unique = [];

  candidates.forEach((candidate) => {
    try {
      const parsed = new URL(candidate);
      if (!/^https?:$/i.test(parsed.protocol)) return;
      const normalized = parsed.toString();
      if (!unique.includes(normalized)) {
        unique.push(normalized);
      }
    } catch {
      // Ignore non-URL dropped text.
    }
  });

  return unique;
};

const downloadDroppedUrlFile = async (url) => {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("The dropped link is not a valid URL.");
  }

  if (!/^https?:$/i.test(parsed.protocol)) {
    throw new Error("Only http/https links can be downloaded.");
  }

  const response = await fetch(parsed.toString(), { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}).`);
  }

  const blob = await response.blob();
  const mimeType = response.headers.get("content-type") || blob.type || "application/octet-stream";
  const suggestedName =
    getContentDispositionFileName(response.headers.get("content-disposition")) ||
    getUrlFileName(parsed.toString()) ||
    "downloaded-file";
  const fileName = normalizeDownloadedFileName(suggestedName, mimeType);

  if (!/\.(pdf|doc|docx|txt|csv)$/i.test(fileName)) {
    throw new Error("Only PDF, DOC, DOCX, TXT, or CSV links are supported.");
  }

  return new File([blob], fileName, {
    type: mimeType,
    lastModified: Date.now(),
  });
};

const applyUploadFiles = (sectionKey, files) => {
  ensureUploadBuckets();
  const section = UPLOAD_SECTION_CONFIG.find((item) => item.key === sectionKey);
  if (!section) return;

  if (isUploadWorkflowBusy()) {
    showInfo("Please wait for the current upload operation to finish before adding files.");
    return;
  }

  const validFiles = Array.from(files || []).filter((file) => isSupportedUploadFile(file));
  if (validFiles.length === 0) {
    showError("Use PDF, DOC, DOCX, TXT, or CSV files only.");
    return;
  }

  const uniqueIncoming = [];
  const incomingSeen = new Set();
  let duplicateIncomingCount = 0;

  validFiles.forEach((file) => {
    const fingerprint = buildUploadFileFingerprint(file);
    if (incomingSeen.has(fingerprint)) {
      duplicateIncomingCount += 1;
      return;
    }
    incomingSeen.add(fingerprint);
    uniqueIncoming.push(file);
  });

  if (duplicateIncomingCount > 0) {
    showInfo(
      `Skipped ${duplicateIncomingCount} duplicate file${duplicateIncomingCount === 1 ? "" : "s"} in this selection.`
    );
  }

  if (uniqueIncoming.length === 0) {
    showInfo("No new files were added.");
    return;
  }

  if (section.single) {
    if (uniqueIncoming.length > 1) {
      showInfo(`${getSectionDisplayName(sectionKey)} accepts one file. The first file was kept.`);
    }
    state.uploadBuckets[section.key] = [uniqueIncoming[0]];
  } else {
    const existingFiles = state.uploadBuckets[section.key] || [];
    const existingFingerprints = new Set(existingFiles.map((file) => buildUploadFileFingerprint(file)));
    const dedupedToAppend = [];
    let duplicatesAgainstExisting = 0;

    uniqueIncoming.forEach((file) => {
      const fingerprint = buildUploadFileFingerprint(file);
      if (existingFingerprints.has(fingerprint)) {
        duplicatesAgainstExisting += 1;
        return;
      }
      existingFingerprints.add(fingerprint);
      dedupedToAppend.push(file);
    });

    if (duplicatesAgainstExisting > 0) {
      showInfo(
        `Skipped ${duplicatesAgainstExisting} file${duplicatesAgainstExisting === 1 ? "" : "s"} already staged in ${getSectionDisplayName(
          sectionKey
        )}.`
      );
    }

    if (dedupedToAppend.length === 0) {
      showInfo("No new files were added.");
      return;
    }

    const currentTotal = flattenUploadBuckets().length;
    const remainingCapacity = Math.max(0, MAX_UPLOAD_TOTAL_FILES - currentTotal);
    if (remainingCapacity <= 0) {
      showError(`Upload staging limit reached (${MAX_UPLOAD_TOTAL_FILES} files). Remove files before adding more.`);
      return;
    }

    const filesToAppend = dedupedToAppend.slice(0, remainingCapacity);
    const skippedByCapacity = Math.max(0, dedupedToAppend.length - filesToAppend.length);
    if (skippedByCapacity > 0) {
      showInfo(
        `Added ${filesToAppend.length} file${filesToAppend.length === 1 ? "" : "s"}; skipped ${skippedByCapacity} due to the ${MAX_UPLOAD_TOTAL_FILES}-file staging cap.`
      );
    }

    state.uploadBuckets[section.key] = [...existingFiles, ...filesToAppend];
  }

  renderUploadBuckets();
};

const readFileAsBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });

const sendUploadPayloadToTab = async (tabId, payload) => {
  for (let attempt = 0; attempt < MAX_UPLOAD_SYNC_ATTEMPTS; attempt += 1) {
    const response = await new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tabId,
        {
          type: MESSAGE_TYPES.sendToApp || "CA_EXTENSION_SEND_TO_APP",
          payload,
        },
        (result) => {
          const runtimeMessage = chrome.runtime.lastError?.message;
          if (runtimeMessage) {
            resolve({ ok: false, error: runtimeMessage });
            return;
          }
          resolve(result || { ok: false, error: "No response from CareAssurance page." });
        }
      );
    });

    if (response?.ok) {
      return response;
    }

    const errorText = String(response?.error || "");
    const retryable =
      /receiving end does not exist|could not establish connection|frame was removed|message port closed/i.test(
        errorText
      );
    if (!retryable || attempt === MAX_UPLOAD_SYNC_ATTEMPTS - 1) {
      return response;
    }
    await wait(350 + attempt * 200);
  }

  return { ok: false, error: "Could not reach the CareAssurance page context." };
};

const buildUploadMirrorPayload = async () => {
  const selected = flattenUploadBuckets();
  const totalBytes = selected.reduce((sum, entry) => sum + Number(entry.file?.size || 0), 0);
  if (totalBytes > MAX_UPLOAD_SYNC_BYTES) {
    throw new Error("Selected files are too large to sync at once. Keep total size below 35 MB.");
  }

  const serviceUserCaseId = String(
    state.selectedAutofillUser?.acpId || dom.caseId?.value || ""
  ).trim();
  const serviceDataGroupId = String(dom.serviceDataGroupId?.value || "").trim();

  const serviceUserName = String(
    state.selectedAutofillUser?.name || state.selectedUser?.name || ""
  )
    .trim();

  const uploads = [];
  for (const entry of selected) {
    const file = entry.file;
    const base64Data = await readFileAsBase64(file);
    uploads.push({
      section: entry.section,
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      lastModified: file.lastModified,
      base64Data,
    });
  }

  return {
    requestId: createRequestId(),
    source: "extension-popup",
    uploadedAt: new Date().toISOString(),
    serviceUserName,
    serviceUserCaseId,
    serviceDataGroupId,
    additionalNotes: (dom.uploadNotes?.value || "").trim(),
    uploads,
  };
};

const ensureUploadRouteReady = async (context) => {
  const uploadPath = "/service-users/upload";
  if (context?.path?.startsWith(uploadPath)) {
    return context;
  }

  const baseUrl = context?.baseUrl || normalizeCareAssuranceBaseUrl(getCareAssuranceUrl());
  const targetUrl = `${baseUrl}${uploadPath}`;
  await chrome.tabs.update(context.tabId, { url: targetUrl, active: true });
  await wait(700);
  const refreshed = await refreshWorkspaceContext(state.connectedWorkspaceUser);
  return refreshed || { ...context, path: uploadPath };
};

const syncUploadsToCareAssurance = async ({ force = false } = {}) => {
  if (uploadSyncInFlight) {
    uploadSyncQueued = true;
    uploadSyncForceQueued = uploadSyncForceQueued || force;
    return false;
  }

  const selected = flattenUploadBuckets();
  if (selected.length === 0) {
    updateUploadSyncStatus("Add files to stage them, then click Send to transfer.");
    return false;
  }

  if (!state.isConnected) {
    updateUploadSyncStatus("Connect your workspace, then click Send to transfer staged files.", "warning");
    return false;
  }

  const workflowSafety = buildWorkflowSafetyState({
    extensionStatus: state.extensionStatus,
    selectedAutofillUser: state.selectedAutofillUser,
    caseId: getCaseIdForAutoCollect(),
    serviceDataGroupId: String(dom.serviceDataGroupId?.value || "").trim(),
    requireCaseId: true,
    requireServiceDataGroup: false,
  });
  if (workflowSafety.shouldBlockUploadSync) {
    updateUploadSyncStatus(workflowSafety.detail, "warning");
    showInfo(workflowSafety.detail);
    await runPopupSafetyAction(workflowSafety.action);
    return false;
  }

  const signature = getUploadSyncSignature();
  if (!force && signature && signature === lastUploadSyncSignature) {
    return true;
  }

  uploadSyncInFlight = true;
  try {
    updateUploadSyncStatus(`Syncing ${selected.length} file${selected.length === 1 ? "" : "s"} to CareAssurance Upload...`);

    const context = state.connectedWorkspaceContext || (await refreshWorkspaceContext(state.connectedWorkspaceUser));
    if (!context?.tabId) {
      throw new Error("Open a CareAssurance tab and sync the workspace first.");
    }

    const uploadContext = await ensureUploadRouteReady(context);
    if (!uploadContext?.tabId) {
      throw new Error("Could not attach to a CareAssurance tab for upload sync.");
    }

    const payload = await buildUploadMirrorPayload();
    const response = await sendUploadPayloadToTab(uploadContext.tabId, payload);
    if (!response?.ok) {
      throw new Error(response?.error || "Could not send uploads into CareAssurance Upload.");
    }

    lastUploadSyncSignature = signature;
    const syncedAt = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    updateUploadSyncStatus(
      `Synced ${payload.uploads.length} file${payload.uploads.length === 1 ? "" : "s"} at ${syncedAt}.`,
      "success"
    );
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload sync failed.";
    updateUploadSyncStatus(message, "error");
    return false;
  } finally {
    uploadSyncInFlight = false;
    if (uploadSyncQueued) {
      const nextForce = uploadSyncForceQueued;
      uploadSyncQueued = false;
      uploadSyncForceQueued = false;
      scheduleUploadMirrorSync({ immediate: true, force: nextForce });
    }
  }
};

const scheduleUploadMirrorSync = ({ immediate = false, force = false } = {}) => {
  if (!state.isConnected) {
    return;
  }

  if (uploadSyncTimer) {
    clearTimeout(uploadSyncTimer);
  }

  uploadSyncTimer = setTimeout(() => {
    uploadSyncTimer = null;
    syncUploadsToCareAssurance({ force }).catch(() => {});
  }, immediate ? 0 : UPLOAD_SYNC_DEBOUNCE_MS);
};

const bindUploadBucketInputs = () => {
  for (const section of UPLOAD_SECTION_CONFIG) {
    const input = document.getElementById(section.inputId);
    if (!input) continue;
    input.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;

      if (isUploadWorkflowBusy()) {
        showInfo("Please wait for the current upload operation to finish.");
        target.value = "";
        return;
      }

      applyUploadFiles(section.key, target.files || []);
      target.value = "";
    });
  }
};

const bindUploadDropzones = () => {
  const dropzones = document.querySelectorAll("[data-upload-dropzone]");
  dropzones.forEach((dropzone) => {
    const section = dropzone.getAttribute("data-upload-dropzone");
    const inputId = dropzone.getAttribute("data-input-id");
    if (!section) return;

    dropzone.addEventListener("click", () => {
      if (isUploadWorkflowBusy()) {
        showInfo("Please wait for the current upload operation to finish.");
        return;
      }
      if (!inputId) return;
      document.getElementById(inputId)?.click();
    });

    dropzone.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (isUploadWorkflowBusy()) {
        showInfo("Please wait for the current upload operation to finish.");
        return;
      }
      if (!inputId) return;
      document.getElementById(inputId)?.click();
    });

    dropzone.addEventListener("dragenter", (event) => {
      if (isUploadWorkflowBusy()) return;
      event.preventDefault();
      dropzone.classList.add("is-dragover");
    });

    dropzone.addEventListener("dragover", (event) => {
      if (isUploadWorkflowBusy()) return;
      event.preventDefault();
      dropzone.classList.add("is-dragover");
    });

    dropzone.addEventListener("dragleave", () => {
      dropzone.classList.remove("is-dragover");
    });

    dropzone.addEventListener("drop", async (event) => {
      event.preventDefault();
      dropzone.classList.remove("is-dragover");

      if (isUploadWorkflowBusy()) {
        showInfo("Please wait for the current upload operation to finish before dropping files.");
        return;
      }

      const droppedFiles = Array.from(event.dataTransfer?.files || []);
      if (droppedFiles.length > 0) {
        applyUploadFiles(section, droppedFiles);
        return;
      }

      const droppedUrls = extractDroppedUrls(event.dataTransfer);
      if (droppedUrls.length === 0) {
        return;
      }

      const sectionConfig = UPLOAD_SECTION_CONFIG.find((item) => item.key === section);
      if (sectionConfig?.single && droppedUrls.length > 1) {
        showInfo(`${getSectionDisplayName(section)} accepts one file. Only the first link will be downloaded.`);
      }

      const urlsToDownload = sectionConfig?.single ? droppedUrls.slice(0, 1) : droppedUrls;
      droppedLinkDownloadInFlight = true;
      updateUploadActionInterlocks();
      dropzone.classList.add("is-downloading");
      updateUploadSyncStatus(`Downloading link into ${getSectionDisplayName(section)}...`);

      try {
        const downloadedFiles = [];
        for (const droppedUrl of urlsToDownload) {
          const file = await downloadDroppedUrlFile(droppedUrl);
          downloadedFiles.push(file);
        }

        if (downloadedFiles.length === 0) {
          showError("No downloadable files were found in the dropped links.");
          return;
        }

        applyUploadFiles(section, downloadedFiles);
        showSuccess(`Downloaded ${downloadedFiles.length} file${downloadedFiles.length === 1 ? "" : "s"} into ${getSectionDisplayName(section)}.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not download the dropped link.";
        showError(message);
      } finally {
        dropzone.classList.remove("is-downloading");
        droppedLinkDownloadInFlight = false;
        updateUploadPendingStatus();
      }
    });
  });
};

const bindUploadActionButtons = () => {
  document.querySelectorAll("[data-upload-browse]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();

      if (isUploadWorkflowBusy()) {
        showInfo("Please wait for the current upload operation to finish.");
        return;
      }

      const sectionKey = button.getAttribute("data-upload-browse");
      const explicitInputId = button.getAttribute("data-input-id");
      const sectionConfig = UPLOAD_SECTION_CONFIG.find((entry) => entry.key === sectionKey);
      const inputId = explicitInputId || sectionConfig?.inputId;

      if (!inputId) return;
      document.getElementById(inputId)?.click();
    });
  });

  document.querySelectorAll("[data-upload-autocollect]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      const sectionKey = button.getAttribute("data-upload-autocollect");
      if (!sectionKey) return;

      if (isUploadWorkflowBusy()) {
        showInfo("Please wait for the current upload operation to finish.");
        return;
      }

      await autoCollectDocumentsForSection(sectionKey, button);
    });
  });
};

const resetUploadWorkspace = async ({ showToast = false } = {}) => {
  if (isUploadWorkflowBusy()) {
    const busyMessage = getUploadWorkflowBusyMessage() || "An upload operation is still running.";
    showInfo(`${busyMessage} Finish or wait, then reset.`);
    return false;
  }

  state.uploadBuckets = createEmptyUploadBuckets();
  state.selectedFilesList = [];
  state.currentAnalysisResults = null;
  lastUploadSyncSignature = "";

  updateAutoCollectInfoSnapshot(createAutoCollectInfoSnapshot());

  if (uploadSyncTimer) {
    clearTimeout(uploadSyncTimer);
    uploadSyncTimer = null;
  }
  uploadSyncQueued = false;
  uploadSyncForceQueued = false;
  uploadSyncInFlight = false;

  for (const section of UPLOAD_SECTION_CONFIG) {
    const input = document.getElementById(section.inputId);
    if (input instanceof HTMLInputElement) {
      input.value = "";
    }
  }

  renderUploadBuckets();

  if (dom.analyzeDocuments) dom.analyzeDocuments.disabled = true;
  if (dom.uploadNotes) dom.uploadNotes.value = "";
  if (dom.analysisStatus) dom.analysisStatus.textContent = "";
  if (dom.additionalNotes) dom.additionalNotes.value = "";
  if (dom.assessmentList) dom.assessmentList.innerHTML = "";
  if (dom.analysisOverview) { dom.analysisOverview.hidden = true; dom.analysisOverview.innerHTML = ""; }
  if (dom.selectionSection) dom.selectionSection.hidden = true;
  if (dom.uploadedDocsList) dom.uploadedDocsList.innerHTML = "";
  if (dom.uploadedDocsSummary) dom.uploadedDocsSummary.hidden = true;

  updateUploadSteps(0);
  updateUploadSyncStatus("Add files to stage them, then click Send to transfer.");
  await setStorage({ [STORAGE_KEYS.uploadedDocuments]: null });
  updateUploadActionInterlocks();

  if (showToast) {
    showSuccess("Upload staging reset.");
  }

  return true;
};

async function flushScheduledPopupRefresh() {
  if (popupRefreshInFlight) {
    popupRefreshQueued = true;
    return;
  }

  const shouldRefreshPayload = popupRefreshPayloadRequested;
  const shouldRefreshWorkspace = popupRefreshWorkspaceRequested;
  const forceWorkspace = popupRefreshForceWorkspace;

  popupRefreshPayloadRequested = false;
  popupRefreshWorkspaceRequested = false;
  popupRefreshForceWorkspace = false;

  if (!shouldRefreshPayload && !shouldRefreshWorkspace) return;

  popupRefreshInFlight = true;
  try {
    if (shouldRefreshPayload) {
      await refreshPayloadStatus();
    }

    if (shouldRefreshWorkspace && !document.hidden) {
      const now = Date.now();
      const canRefreshWorkspace =
        forceWorkspace ||
        now - lastWorkspaceRefreshAt >= POPUP_WORKSPACE_REFRESH_COOLDOWN_MS;

      if (canRefreshWorkspace) {
        await refreshWorkspaceContext(state.connectedWorkspaceUser);
        lastWorkspaceRefreshAt = Date.now();
      }
    }
  } catch (error) {
    console.warn("[CA Extension Popup] Scheduled refresh failed:", error);
  } finally {
    popupRefreshInFlight = false;
    if (popupRefreshQueued || popupRefreshPayloadRequested || popupRefreshWorkspaceRequested) {
      popupRefreshQueued = false;
      schedulePopupRefresh({
        payload: popupRefreshPayloadRequested,
        workspace: popupRefreshWorkspaceRequested,
        forceWorkspace: popupRefreshForceWorkspace,
        immediate: true,
      });
    }
  }
}

function schedulePopupRefresh({ payload = false, workspace = false, forceWorkspace = false, immediate = false } = {}) {
  if (payload) popupRefreshPayloadRequested = true;
  if (workspace) popupRefreshWorkspaceRequested = true;
  if (forceWorkspace) popupRefreshForceWorkspace = true;

  if (!popupRefreshPayloadRequested && !popupRefreshWorkspaceRequested) return;

  if (popupRefreshInFlight) {
    popupRefreshQueued = true;
    return;
  }

  if (popupRefreshTimer) {
    clearTimeout(popupRefreshTimer);
  }

  popupRefreshTimer = setTimeout(() => {
    popupRefreshTimer = null;
    flushScheduledPopupRefresh();
  }, immediate ? 0 : POPUP_REFRESH_DEBOUNCE_MS);
}

// ═══════════════════════════════════════════════════════════════════════════
// WORKSPACE CONTEXT
// ═══════════════════════════════════════════════════════════════════════════

async function refreshWorkspaceContext(user = state.connectedWorkspaceUser) {
  if (user) state.connectedWorkspaceUser = user;

  try {
    const tab = await findConnectedWorkspaceTab(getCareAssuranceUrl());
    if (!tab?.id || !tab.url) {
      renderWorkspaceContext(null, state.connectedWorkspaceUser);
      renderUploadHandoffSummary();
      return null;
    }

    const url = new URL(tab.url);
    const route = describeWorkspaceRoute(url.pathname);
    const context = {
      tabId: tab.id,
      baseUrl: `${url.protocol}//${url.host}`,
      host: url.host,
      title: tab.title || route.label,
      path: `${url.pathname}${url.search}` || "/",
      routeLabel: route.label,
      routeDetail: route.detail,
    };
    renderWorkspaceContext(context, state.connectedWorkspaceUser);
    renderUploadHandoffSummary();
    return context;
  } catch (error) {
    console.warn("[CA Extension Popup] Failed to refresh workspace context:", error);
    renderWorkspaceContext(null, state.connectedWorkspaceUser);
    renderUploadHandoffSummary();
    return null;
  }
}

async function openCareAssuranceRoute(pathname) {
  const context = state.connectedWorkspaceContext || (await refreshWorkspaceContext(state.connectedWorkspaceUser));
  const baseUrl = context?.baseUrl || normalizeCareAssuranceBaseUrl(getCareAssuranceUrl());
  const targetUrl =
    pathname.startsWith("http://") || pathname.startsWith("https://")
      ? pathname
      : `${baseUrl}${pathname}`;

  if (context?.tabId) {
    await chrome.tabs.update(context.tabId, { url: targetUrl, active: true });
  } else {
    await chrome.tabs.create({ url: targetUrl });
  }

  setTimeout(() => {
    refreshWorkspaceContext(state.connectedWorkspaceUser).catch(() => {});
  }, 250);
}

async function focusConnectedWorkspace() {
  const context = state.connectedWorkspaceContext || (await refreshWorkspaceContext(state.connectedWorkspaceUser));
  if (context?.tabId) {
    await chrome.tabs.update(context.tabId, { active: true });
    return;
  }
  await openCareAssuranceRoute("/dashboard");
}

function focusAutofillTargetInputs({ preferServiceGroup = false } = {}) {
  switchTab("autofill");
  window.setTimeout(() => {
    const caseId = String(dom.caseId?.value || "").trim();
    const serviceDataGroupId = String(dom.serviceDataGroupId?.value || "").trim();

    if (!caseId) {
      dom.autofillUserSearch?.focus();
      return;
    }

    if (preferServiceGroup || !serviceDataGroupId) {
      dom.serviceDataGroupId?.focus();
      return;
    }

    dom.caseId?.focus();
  }, 0);
}

async function runPopupSafetyAction(action) {
  const normalizedAction = String(action || "").trim();
  if (!normalizedAction) return false;

  if (normalizedAction === "open-status") {
    switchTab("connect");
    dom.extensionHealthPrimary?.focus();
    showInfo("Review Extension Status before continuing.");
    return true;
  }

  if (normalizedAction === "detect-ids") {
    switchTab("autofill");
    await autoDetectIds();
    return true;
  }

  if (normalizedAction === "reload-page") {
    const context = state.pageCompanionContext || (await refreshPageCompanion());
    if (context?.requiresPageRefresh && context?.tabId) {
      await chrome.tabs.reload(context.tabId);
      showSuccess("Refreshing the attached CareAssurance page.");
      window.setTimeout(() => {
        refreshPageCompanion().catch(() => {});
      }, 1200);
      return true;
    }
    focusAutofillTargetInputs({ preferServiceGroup: true });
    return true;
  }

  if (normalizedAction === "open-autofill") {
    focusAutofillTargetInputs({ preferServiceGroup: true });
    return true;
  }

  return false;
}

async function executeMainViewAction(button) {
  if (!button) return;

  const action = String(button.dataset.action || "");
  const route = String(button.dataset.route || "");

  try {
    if (await runPopupSafetyAction(action)) {
      return;
    }

    if (action === "connect") {
      await connectToCareAssurance();
      return;
    }

    if (action === "focus-current") {
      await focusConnectedWorkspace();
      return;
    }

    if (action === "refresh-context") {
      schedulePopupRefresh({ workspace: true, forceWorkspace: true, immediate: true });
      showInfo("Workspace Pulse refreshed");
      return;
    }

    if (action === "open-route") {
      await openCareAssuranceRoute(route || "/dashboard");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not run launchpad action.";
    showError(message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE COMPANION
// ═══════════════════════════════════════════════════════════════════════════

async function refreshPageCompanion(overrides = {}) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url) {
      renderPageCompanion(null);
      return null;
    }

    const url = new URL(tab.url);
    const payload = overrides.payload ?? state.latestPayloadSnapshot?.payload ?? null;
    const verificationFields = Array.isArray(overrides.verificationFields)
      ? overrides.verificationFields
      : Array.isArray(state.latestVerificationFields)
      ? state.latestVerificationFields
      : [];
    const queueState = overrides.queueState || null;
    const lastError = overrides.lastError || null;

    for (const descriptor of FORM_WORKFLOW_DESCRIPTORS) {
      if (!descriptor.urlPattern.test(tab.url)) continue;

      const current = queueState && typeof queueState.currentIndex === "number" ? queueState.currentIndex + 1 : null;
      const total = queueState && typeof queueState.total === "number" ? queueState.total : null;
      const extensionStatus = await requestCareAssurancePageExtensionStatus(tab.id);
      const statusPayload = extensionStatus.ok ? extensionStatus.data : null;
      const refreshRequired = Boolean(statusPayload?.refreshRequired) || isMissingPageCompanionReceiver(extensionStatus.error);

      if (refreshRequired) {
        const context = {
          tabId: tab.id,
          routeLabel: descriptor.label,
          payloadLabel: "Extension reattach needed",
          reviewLabel: "Refresh required",
          stateClass: "is-warning",
          eyebrow: "Live Mobizio workflow",
          title: "Refresh this page to restore the extension",
          detail: String(
            statusPayload?.error ||
              "This Mobizio workflow page is still using an older extension bridge. Refresh the page so the current extension can attach again."
          ).trim(),
          canOverlay: false,
          canVerify: false,
          requiresPageRefresh: true,
        };
        renderPageCompanion(context);
        return context;
      }

      const reviewLabel =
        descriptor.key === "initialAssessment"
          ? verificationFields.length > 0
            ? `${verificationFields.length} flagged field${verificationFields.length === 1 ? "" : "s"}`
            : "No flagged fields"
          : current && total
          ? `${current} of ${total} active`
          : payload?.formType === descriptor.key
          ? "Payload ready"
          : "Awaiting payload";

      const context = {
        tabId: tab.id,
        routeLabel: descriptor.label,
        payloadLabel: getPayloadWorkflowLabel(payload),
        reviewLabel,
        stateClass: lastError ? "is-warning" : payload ? "is-live" : "is-empty",
        eyebrow: "Live Mobizio workflow",
        title: descriptor.label,
        detail: lastError ? String(lastError) : descriptor.detail,
        canOverlay: ["acp", "emar", "initialAssessment"].includes(descriptor.key),
        canVerify: descriptor.key === "initialAssessment" && verificationFields.length > 0,
        overlayButtonLabel: descriptor.key === "initialAssessment" ? "Open Review Panel" : "Open In-Page Status",
      };
      renderPageCompanion(context);
      return context;
    }

    if (isLikelyCareAssuranceUrl(tab.url)) {
      const route = describeWorkspaceRoute(url.pathname);
      const extensionStatus = await requestCareAssurancePageExtensionStatus(tab.id);
      const statusPayload = extensionStatus.ok ? extensionStatus.data : null;
      const refreshRequired = Boolean(statusPayload?.refreshRequired) || isMissingPageCompanionReceiver(extensionStatus.error);

      if (refreshRequired) {
        const context = {
          tabId: tab.id,
          routeLabel: route.label,
          payloadLabel: "Extension reattach needed",
          reviewLabel: "Refresh required",
          stateClass: "is-warning",
          eyebrow: "CareAssurance workspace",
          title: "Refresh this page to restore the extension",
          detail: String(
            statusPayload?.error ||
              "This CareAssurance tab is still using an older extension bridge. Refresh the page so the current extension can attach again."
          ).trim(),
          canOverlay: false,
          canVerify: false,
          requiresPageRefresh: true,
        };
        renderPageCompanion(context);
        return context;
      }

      const context = {
        tabId: tab.id,
        routeLabel: route.label,
        payloadLabel: getPayloadWorkflowLabel(payload),
        reviewLabel: payload ? "Workspace connected" : "No payload",
        stateClass: "is-live",
        eyebrow: "CareAssurance workspace",
        title: route.label,
        detail: route.detail,
        canOverlay: false,
        canVerify: false,
      };
      renderPageCompanion(context);
      return context;
    }
  } catch (error) {
    console.warn("[CA Extension Popup] Failed to describe current page companion:", error);
  }

  renderPageCompanion({
    tabId: null,
    routeLabel: "Unsupported page",
    payloadLabel: getPayloadWorkflowLabel(null),
    reviewLabel: "Open Mobizio or CareAssurance",
    stateClass: "is-empty",
    eyebrow: "Current browser page",
    title: "Unsupported page",
    detail: "This tab is outside the CareAssurance and Mobizio workflow surfaces used by the extension.",
    canOverlay: false,
    canVerify: false,
  });
  return null;
}

async function focusPageCompanion() {
  const context = state.pageCompanionContext || (await refreshPageCompanion());
  if (!context?.tabId) {
    showError("No live workflow page is attached yet.");
    return;
  }
  await chrome.tabs.update(context.tabId, { active: true });
}

function isMissingPageCompanionReceiver(error) {
  const message = String(error || "").trim();
  return PAGE_COMPANION_RECEIVER_MISSING_PATTERNS.some((pattern) => pattern.test(message));
}

async function requestCareAssurancePageExtensionStatus(tabId) {
  if (!tabId) {
    return { ok: false, error: "No active CareAssurance tab is attached." };
  }

  return await new Promise((resolve) => {
    let settled = false;
    const timeoutHandle = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, error: "Page status probe timed out (3s). The page bridge may be stale; reload the tab." });
    }, 3000);

    chrome.tabs.sendMessage(
      tabId,
      { type: PAGE_COMPANION_EXTENSION_STATUS_REQUEST_TYPE },
      (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        const runtimeError = chrome.runtime.lastError?.message || "";
        if (runtimeError) {
          resolve({ ok: false, error: runtimeError });
          return;
        }
        if (!response || typeof response !== "object") {
          resolve({ ok: false, error: "No extension status response from the page." });
          return;
        }
        resolve({ ok: true, data: response });
      }
    );
  });
}

async function navigateToVerificationField(direction) {
  try {
    const context = state.pageCompanionContext || (await refreshPageCompanion());
    if (!context?.tabId) {
      showError("No verification-enabled page is attached yet.");
      return;
    }

    state.currentVerificationIndex += direction;
    if (state.currentVerificationIndex < 0) state.currentVerificationIndex = 0;

    chrome.tabs.sendMessage(
      context.tabId,
      { type: "CA_EXTENSION_SCROLL_TO_NEXT", payload: { index: state.currentVerificationIndex } },
      (response) => {
        if (chrome.runtime.lastError) {
          showError(chrome.runtime.lastError.message || "Could not reach the current page.");
          return;
        }
        if (response?.found) {
          state.currentVerificationIndex = response.index;
          showSuccess(`Field ${response.index + 1} of ${response.total}`);
        } else if (response?.total === 0) {
          showSuccess("No verification fields on this page");
        }
      }
    );
  } catch (e) {
    console.error("Navigation error:", e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REFRESH PAYLOAD STATUS
// ═══════════════════════════════════════════════════════════════════════════

async function refreshPayloadStatus() {
  const data = await loadStorage([
    STORAGE_KEYS.payload, DATA_TIMESTAMP_KEY, STORAGE_KEYS.caseInfo, STORAGE_KEYS.autoSubmit,
    STORAGE_KEYS.dryRun, STORAGE_KEYS.interactionMode, STORAGE_KEYS.logs,
    STORAGE_KEYS.verificationFields, STORAGE_KEYS.runtimeMetrics,
    STORAGE_KEYS.queueState, STORAGE_KEYS.lastError,
  ]);

  const payload = data[STORAGE_KEYS.payload];
  const payloadStoredAt = data[DATA_TIMESTAMP_KEY];
  const verificationFields = data[STORAGE_KEYS.verificationFields] || [];
  const queueState = data[STORAGE_KEYS.queueState] || null;
  const lastError = data[STORAGE_KEYS.lastError] || null;

  state.latestVerificationFields = Array.isArray(verificationFields) ? verificationFields : [];

  if (dom.payloadStatus) {
    let statusHTML = "";
    if (payload?.formType === "initialAssessment") {
      dom.payloadStatus.className = "status-box success";
      statusHTML = "<span>\u2713 Care Plan ready for Initial Assessment</span>";
    } else if (payload?.formType === "acp" && payload?.assessments?.length) {
      dom.payloadStatus.className = "status-box success";
      statusHTML = `<span>\u2713 ${payload.assessments.length} assessment(s) ready</span>`;
    } else if (payload?.formType === "emar") {
      dom.payloadStatus.className = "status-box success";
      statusHTML = "<span>\u2713 EMAR audit payload ready</span>";
    } else if (payload?.formType) {
      dom.payloadStatus.className = "status-box success";
      statusHTML = `<span>\u2713 ${escapeHtml(payload.formType)} payload ready</span>`;
    } else {
      dom.payloadStatus.className = "status-box";
      statusHTML = "<span>No data loaded</span>";
    }

    if (verificationFields.length > 0) {
      const missingCount = verificationFields.filter((f) => f.reason === "missing").length;
      const ambiguousCount = verificationFields.filter((f) => f.reason === "ambiguous").length;
      statusHTML += `
        <div class="verification-panel">
          <div class="verification-header"><strong>${verificationFields.length} field(s) need verification</strong></div>
          <div class="verification-detail">
            ${missingCount > 0 ? `${missingCount} missing` : ""}
            ${missingCount > 0 && ambiguousCount > 0 ? " \u2022 " : ""}
            ${ambiguousCount > 0 ? `${ambiguousCount} ambiguous` : ""}
          </div>
          <div class="verification-nav">
            <button id="nav-prev-field" class="btn btn-sm btn-secondary">\u2190 Prev</button>
            <button id="nav-next-field" class="btn btn-sm btn-primary">Next \u2192</button>
          </div>
        </div>
      `;
    }

    dom.payloadStatus.innerHTML = statusHTML;

    document.getElementById("nav-prev-field")?.addEventListener("click", () => navigateToVerificationField(-1));
    document.getElementById("nav-next-field")?.addEventListener("click", () => navigateToVerificationField(1));
  }

  renderPayloadInspector(payload, payloadStoredAt);
  renderPayloadReview(payload, payloadStoredAt);
  updateTabBadges(payload, state.selectedFilesList.length);
  checkPayloadSize(payload);

  if (data[STORAGE_KEYS.caseInfo]) {
    if (dom.caseId) dom.caseId.value = data[STORAGE_KEYS.caseInfo].caseId || "";
    if (dom.serviceDataGroupId) dom.serviceDataGroupId.value = data[STORAGE_KEYS.caseInfo].serviceDataGroupId || "";
  }

  renderCaseContextStrip(data[STORAGE_KEYS.caseInfo] || null);

  try {
    await maybeSyncAutofillUserFromPayload(payload, payloadStoredAt, data[STORAGE_KEYS.caseInfo] || null);
  } catch (syncError) {
    console.warn("[CA Extension] payload autofill user sync failed:", syncError);
  }

  if (dom.autoSubmit) dom.autoSubmit.checked = data[STORAGE_KEYS.autoSubmit] !== false;
  if (dom.dryRun) dom.dryRun.checked = data[STORAGE_KEYS.dryRun] === true;
  if (dom.interactionMode) dom.interactionMode.value = data[STORAGE_KEYS.interactionMode] || "auto";

  const logs = Array.isArray(data[STORAGE_KEYS.logs]) ? data[STORAGE_KEYS.logs] : [];
  const logsFingerprint = buildLogFingerprint(logs);
  if (dom.logList && logsFingerprint !== lastLogFingerprint) {
    renderLogs(logs);
    lastLogFingerprint = logsFingerprint;
  }

  const commandCenterState = buildCommandCenterState({
    payload,
    payloadStoredAt,
    queueState,
    verificationFields,
    metrics: data[STORAGE_KEYS.runtimeMetrics],
    lastError,
    interactionMode: data[STORAGE_KEYS.interactionMode],
    dryRun: data[STORAGE_KEYS.dryRun],
  });
  const runtimeDiagnosticsState = buildRuntimeDiagnosticsState({
    metrics: data[STORAGE_KEYS.runtimeMetrics],
    lastError,
    queueState,
    payload,
    payloadStoredAt,
  });

  renderCommandCenter(commandCenterState);
  renderRuntimeDiagnostics(runtimeDiagnosticsState);
  renderUploadHandoffSummary();
  syncVerificationNavigationState(state.pageCompanionContext, verificationFields);
  renderAutofillSessionSummary({
    payload,
    queueState,
    verificationFields,
    lastError,
    pageContext: state.pageCompanionContext,
  });
  if (!document.hidden) {
    const refreshedPageContext = await refreshPageCompanion({
      payload,
      verificationFields,
      queueState,
      lastError,
    });
    syncVerificationNavigationState(refreshedPageContext, verificationFields);
    renderAutofillSessionSummary({
      payload,
      queueState,
      verificationFields,
      lastError,
      pageContext: refreshedPageContext,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SIGNATURE STATUS
// ═══════════════════════════════════════════════════════════════════════════

async function refreshSignatureStatus() {
  const data = await loadStorage([STORAGE_KEYS.signatureData]);
  const signatureData = data.caAcpSignatureData;

  if (dom.signatureStatus) {
    if (signatureData?.dataUrl) {
      if (dom.signaturePreview) {
        dom.signaturePreview.hidden = false;
        dom.signaturePreview.innerHTML = `<img src="${signatureData.dataUrl}" alt="Signature preview" />`;
      }

      dom.signatureStatus.className = "status-box success";
      const uploadDate = signatureData.uploadedAt ? new Date(signatureData.uploadedAt).toLocaleString() : "";
      dom.signatureStatus.innerHTML = `
        <span>\u2713 ${escapeHtml(signatureData.fileName || "Signature uploaded")}</span>
        ${uploadDate ? `<small style="display: block; opacity: 0.7; font-size: 10px;">${uploadDate}</small>` : ""}
        <button id="clear-signature-btn" class="btn btn-ghost btn-sm" style="margin-top: 4px;">Clear Signature</button>
      `;

      document.getElementById("clear-signature-btn")?.addEventListener("click", async () => {
        await setStorage({ [STORAGE_KEYS.signatureData]: null, [STORAGE_KEYS.signatureBatchId]: null });
        await refreshSignatureStatus();
        showSuccess("Signature cleared");
      });
    } else {
      if (dom.signaturePreview) { dom.signaturePreview.hidden = true; dom.signaturePreview.innerHTML = ""; }
      dom.signatureStatus.className = "status-box";
      dom.signatureStatus.innerHTML = "<span>No signature uploaded</span>";
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONNECTION FLOW
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch ancillary data (service users) after connection is already
 * confirmed. Safe to call multiple times — never resets connection state on
 * failure, just logs a warning.
 */
async function fetchConnectedData(user) {
  try {
    const [usersRes, acpRes] = await Promise.all([
      apiProxy("/api/extension/service-users").catch(() => null),
      apiProxy("/api/extension/acp-service-users").catch(() => null),
    ]);

    const analyzedUsers = (usersRes?.ok ? usersRes.data?.users : []) || [];
    state.acpServiceUsers = (acpRes?.ok ? acpRes.data?.users : []) || [];

    const analyzedIds = new Set(analyzedUsers.map((u) => (u.name || "").toLowerCase().trim()));
    const acpOnlyUsers = state.acpServiceUsers
      .filter((u) => !analyzedIds.has((u.name || "").toLowerCase().trim()))
      .map((u) => ({ id: u.acpId || u.id, name: u.name, initials: u.initials, lastUpdated: u.updatedAt, isAcpOnly: true }));

    state.serviceUsers = [...analyzedUsers, ...acpOnlyUsers];
    displayServiceUsers();
    renderAutofillUserDropdown();

    const payloadData = await loadStorage([STORAGE_KEYS.payload, DATA_TIMESTAMP_KEY, STORAGE_KEYS.caseInfo]);
    await maybeSyncAutofillUserFromPayload(
      payloadData[STORAGE_KEYS.payload],
      payloadData[DATA_TIMESTAMP_KEY],
      payloadData[STORAGE_KEYS.caseInfo] || null
    );
  } catch (e) {
    console.warn("[CA Extension] Failed to fetch service users:", e);
  }
}

async function connectToCareAssurance() {
  setButtonLoading(dom.connectBtn, true);
  if (dom.connectStatus) dom.connectStatus.innerHTML = "<span>Connecting...</span>";

  if (dom.connectionBadge) {
    dom.connectionBadge.className = "connection-badge connecting";
    const text = dom.connectionBadge.querySelector(".connection-text");
    if (text) text.textContent = "Connecting\u2026";
  }

  const stored = await loadStorage([STORAGE_KEYS.serverUrl]);
  if (stored[STORAGE_KEYS.serverUrl]) {
    setCareAssuranceUrl(stored[STORAGE_KEYS.serverUrl]);
  }

  let lastError = null;
  let connected = false;

  const knownHosts = getCareAssuranceUrls();

  for (const targetOrigin of [getCareAssuranceUrl(), ...knownHosts.filter((u) => u !== getCareAssuranceUrl())]) {
    setCareAssuranceUrl(targetOrigin);
    if (dom.connectStatus) dom.connectStatus.innerHTML = `<span>Trying ${escapeHtml(targetOrigin)}...</span>`;

    try {
      const statusRes = await apiProxy("/api/extension/status");

      if (statusRes.ok) {
        const payload = statusRes.data || statusRes;
        const user = payload.user || null;
        debugLog("[CA Extension] connectToCareAssurance user:", JSON.stringify(user), "payload keys:", Object.keys(payload));
        await setStorage({ [STORAGE_KEYS.serverUrl]: targetOrigin });
        setExtensionStatusSnapshot(payload);
        updateConnectionUI(true, user);
        await refreshWorkspaceContext(user);
        connected = true;

        await fetchExtensionRuntimeConfig().catch((error) => {
          console.warn("[CA Extension] Failed to refresh runtime config:", error);
        });

        await fetchConnectedData(user);
        if (state.selectedFilesList.length > 0) {
          updateUploadPendingStatus();
        }

        break;
      } else if (statusRes.status === 401 || statusRes.error === "Not logged in") {
        await setStorage({ [STORAGE_KEYS.serverUrl]: targetOrigin });
        lastError = "Found server but not logged in. Please log in to Care Assurance in your browser first.";
        break;
      } else if (statusRes.needsTab) {
        lastError = statusRes.error;
      } else {
        lastError = `Server returned error: ${statusRes.error || "Unknown error"}`;
      }
    } catch (error) {
      lastError = `${targetOrigin}: ${error.message}`;
      console.warn(`Connection to ${targetOrigin} failed:`, error);
    }
  }

  if (!connected) {
    if (!state.isConnected) {
      setExtensionStatusSnapshot(null);
    } else if (lastError) {
      setExtensionStatusSnapshot({
        ...(state.extensionStatus || {}),
        statusError: lastError,
      });
    }
    // Don't reset connection state if already connected from a prior quick check
    if (!state.isConnected) {
      updateConnectionUI(false);
    } else {
      debugLog("[CA Extension] connectToCareAssurance failed but already connected — keeping state");
    }

    if (dom.connectionBadge) {
      dom.connectionBadge.className = "connection-badge error";
      const text = dom.connectionBadge.querySelector(".connection-text");
      if (text) text.textContent = "Error";
    }

    const needsTab = lastError?.includes("No Care Assurance tab") || lastError?.includes("No tab");
    const needsLogin = lastError?.includes("not logged in");
    const errorMsg = needsLogin || needsTab
      ? lastError
      : "Connection failed. Please open Care Assurance in a browser tab and log in first.";
    showError(errorMsg);

    if (dom.connectStatus) {
      dom.connectStatus.className = "status-box";
      dom.connectStatus.innerHTML = `
        <div style="font-size: 11px; line-height: 1.5;">
          <p style="margin-bottom: 6px; color: var(--color-error);">${escapeHtml(errorMsg)}</p>
          ${needsTab ? '<button id="open-ca-tab-btn" class="btn btn-primary btn-sm btn-block" style="margin-bottom: 8px;">Open CareAssurance in a New Tab</button>' : ""}
          <p style="margin-bottom: 4px; font-weight: 600;">Steps to connect:</p>
          <ol style="padding-left: 16px; margin: 0; font-size: 10px; color: var(--color-muted-foreground);">
            <li>Open careassurance.uk in a browser tab</li>
            <li>Log in to your account</li>
            <li>Click Connect again</li>
          </ol>
        </div>
      `;
      document.getElementById("open-ca-tab-btn")?.addEventListener("click", () => {
        chrome.tabs.create({ url: "https://careassurance.uk/dashboard" });
      });
    }
  }

  setButtonLoading(dom.connectBtn, false);
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-DETECT IDS
// ═══════════════════════════════════════════════════════════════════════════

async function autoDetectIds() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) {
      showError("Cannot access current tab URL");
      return { detected: false };
    }

    const url = new URL(tab.url);
    const caseId = url.searchParams.get("caseId");
    const serviceDataGroupId = url.searchParams.get("serviceDataGroupId");

    if (caseId && serviceDataGroupId) {
      if (dom.caseId) dom.caseId.value = caseId;
      if (dom.serviceDataGroupId) dom.serviceDataGroupId.value = serviceDataGroupId;
      await setStorage({ [STORAGE_KEYS.caseInfo]: { caseId, serviceDataGroupId } });
      renderCaseContextStrip({ caseId, serviceDataGroupId });
      showSuccess(`Detected: Case ID ${caseId}, Service Data Group ${serviceDataGroupId}`);
      return { detected: true, caseId, serviceDataGroupId };
    } else if (caseId || serviceDataGroupId) {
      if (caseId && dom.caseId) dom.caseId.value = caseId;
      if (serviceDataGroupId && dom.serviceDataGroupId) dom.serviceDataGroupId.value = serviceDataGroupId;
      renderCaseContextStrip({ caseId, serviceDataGroupId });
      showSuccess(`Partial detection: ${caseId ? "Case ID" : "Service Data Group"} found`);
      return { detected: true, partial: true, caseId, serviceDataGroupId };
    } else {
      showError("No case ID or service data group found in URL. Make sure you're on an Additional Risk Assessments page.");
      return { detected: false };
    }
  } catch (error) {
    console.error("Auto-detect error:", error);
    showError("Failed to detect IDs from page URL");
    return { detected: false };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BIND ALL DOM EVENTS
// ═══════════════════════════════════════════════════════════════════════════

function bindEvents() {
  // Tab navigation
  dom.tabConnect?.addEventListener("click", () => switchTab("connect"));
  dom.tabUpload?.addEventListener("click", () => switchTab("upload"));
  dom.tabAutofill?.addEventListener("click", () => switchTab("autofill"));

  // Connection
  dom.connectBtn?.addEventListener("click", connectToCareAssurance);
  const setExtensionHealthButtonsBusy = (activeButton, busy) => {
    const buttons = [dom.extensionHealthPrimary, dom.extensionHealthSecondary, dom.extensionHealthTertiary].filter(Boolean);
    buttons.forEach((actionButton) => {
      if (actionButton === activeButton) {
        setButtonLoading(actionButton, busy);
        return;
      }
      actionButton.disabled = busy;
    });
  };
  const handleExtensionHealthAction = async (button) => {
    const action = String(button?.dataset?.action || "").trim();
    if (!action || extensionHealthActionInFlight) return;
    extensionHealthActionInFlight = true;
    setExtensionHealthButtonsBusy(button, true);
    try {
      if (action === "connect") {
        await connectToCareAssurance();
        return;
      }
      if (action === "refresh") {
        await refreshExtensionHealthStatus();
        showSuccess("Extension status refreshed.");
        return;
      }
      if (action === "download-package") {
        const result = await downloadExtensionPackage();
        try {
          await refreshExtensionHealthStatus();
          showSuccess(buildExtensionPackageDownloadSuccessMessage({
            filename: result.filename,
            format: result.format,
            refreshed: true,
          }));
        } catch {
          showSuccess(buildExtensionPackageDownloadSuccessMessage({
            filename: result.filename,
            format: result.format,
          }));
        }
        return;
      }
      if (action === "bump-download-package") {
        const result = await downloadExtensionPackage({ updateVersion: true });
        try {
          await refreshExtensionHealthStatus();
          showSuccess(buildExtensionPackageDownloadSuccessMessage({
            filename: result.filename,
            format: result.format,
            refreshed: true,
            versionUpdated: result.versionUpdated,
            previousVersion: result.previousVersion,
            version: result.version,
          }));
        } catch {
          showSuccess(buildExtensionPackageDownloadSuccessMessage({
            filename: result.filename,
            format: result.format,
            versionUpdated: result.versionUpdated,
            previousVersion: result.previousVersion,
            version: result.version,
          }));
        }
        return;
      }
      if (action === "download-package-crx") {
        const result = await downloadExtensionPackage({ format: "crx" });
        try {
          await refreshExtensionHealthStatus();
          showSuccess(buildExtensionPackageDownloadSuccessMessage({
            filename: result.filename,
            format: result.format,
            refreshed: true,
          }));
        } catch {
          showSuccess(buildExtensionPackageDownloadSuccessMessage({
            filename: result.filename,
            format: result.format,
          }));
        }
        return;
      }
      if (action === "rebuild-download-package-crx") {
        const result = await downloadExtensionPackage({ fresh: true, format: "crx" });
        try {
          await refreshExtensionHealthStatus();
          showSuccess(buildExtensionPackageDownloadSuccessMessage({
            filename: result.filename,
            format: result.format,
            rebuilt: true,
            refreshed: true,
          }));
        } catch {
          showSuccess(buildExtensionPackageDownloadSuccessMessage({
            filename: result.filename,
            format: result.format,
            rebuilt: true,
          }));
        }
        return;
      }
      if (action === "rebuild-download-package") {
        const result = await downloadExtensionPackage({ fresh: true });
        try {
          await refreshExtensionHealthStatus();
          showSuccess(buildExtensionPackageDownloadSuccessMessage({
            filename: result.filename,
            format: result.format,
            rebuilt: true,
            refreshed: true,
          }));
        } catch {
          showSuccess(buildExtensionPackageDownloadSuccessMessage({
            filename: result.filename,
            format: result.format,
            rebuilt: true,
          }));
        }
        return;
      }
      if (action === "open-manager") {
        await openCareAssuranceRoute("/admin/extension-manager");
      }
    } catch (error) {
      showError(error?.message || "Could not complete the extension status action.");
    } finally {
      extensionHealthActionInFlight = false;
      setExtensionHealthButtonsBusy(button, false);
    }
  };
  dom.extensionHealthPrimary?.addEventListener("click", () => {
    handleExtensionHealthAction(dom.extensionHealthPrimary);
  });
  dom.extensionHealthSecondary?.addEventListener("click", () => {
    handleExtensionHealthAction(dom.extensionHealthSecondary);
  });
  dom.extensionHealthTertiary?.addEventListener("click", () => {
    handleExtensionHealthAction(dom.extensionHealthTertiary);
  });

  // Workspace context
  dom.refreshWorkspaceContext?.addEventListener("click", () => {
    schedulePopupRefresh({ workspace: true, forceWorkspace: true, immediate: true });
  });
  dom.openConnectedWorkspace?.addEventListener("click", () => focusConnectedWorkspace().catch(() => showError("Could not focus the connected CareAssurance page.")));
  dom.openDashboardWorkspace?.addEventListener("click", () => openCareAssuranceRoute("/dashboard").catch(() => showError("Could not open the CareAssurance dashboard.")));
  dom.openCarePlanningWorkspace?.addEventListener("click", () => openCareAssuranceRoute("/service-users/care-planning").catch(() => showError("Could not open Care Planning.")));
  dom.openRiskWorkspace?.addEventListener("click", () => openCareAssuranceRoute("/service-users/risk-assessment").catch(() => showError("Could not open Risk Assessment.")));
  dom.openPlanEnhancerWorkspace?.addEventListener("click", () => openCareAssuranceRoute("/service-users/plan-enhancer").catch(() => showError("Could not open Plan Enhancer.")));
  dom.openAdminWorkspace?.addEventListener("click", () => openCareAssuranceRoute("/admin/extension-manager").catch(() => showError("Could not open Extension Manager.")));
  dom.caseContextGrid?.addEventListener("click", async (event) => {
    const button = event.target.closest(".case-context-copy[data-copy-value]");
    if (!button) return;
    try {
      await writeToClipboard(button.dataset.copyValue || "");
      showSuccess("Context copied to clipboard");
    } catch {
      showError("Could not copy context value.");
    }
  });

  // Main launchpad
  dom.mainViewPrimaryAction?.addEventListener("click", () => {
    executeMainViewAction(dom.mainViewPrimaryAction);
  });
  dom.mainViewSecondaryAction?.addEventListener("click", () => {
    executeMainViewAction(dom.mainViewSecondaryAction);
  });

  [
    dom.mainOpenCarePlanning,
    dom.mainOpenRisk,
    dom.mainOpenPlanEnhancer,
    dom.mainOpenMessages,
    dom.mainOpenExtensionManager,
  ].forEach((routeButton) => {
    routeButton?.addEventListener("click", async () => {
      const route = routeButton.dataset.route || "/dashboard";
      const label = routeButton.textContent?.trim() || "workflow";
      try {
        await openCareAssuranceRoute(route);
      } catch {
        showError(`Could not open ${label}.`);
      }
    });
  });

  // Service user list delegation
  dom.serviceUserList?.addEventListener("click", (e) => {
    const item = e.target.closest(".service-user-item[data-id]");
    if (item) { selectUser(item.dataset.id); return; }
    const showMore = e.target.closest("[data-action='show-more-users']");
    if (showMore) { e.preventDefault(); state.serviceUserShowCount = (state.serviceUserShowCount || 10) + 10; displayServiceUsers(); }
  });
  dom.serviceUserList?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      const item = e.target.closest(".service-user-item[data-id]");
      if (item) { e.preventDefault(); selectUser(item.dataset.id); }
    }
  });
  dom.serviceUserSort?.addEventListener("change", () => { state.serviceUserShowCount = 10; displayServiceUsers(); });
  dom.serviceUserSearch?.addEventListener("input", displayServiceUsers);
  dom.caseId?.addEventListener("input", () => { renderCaseContextStrip(); renderUploadHandoffSummary(); });
  dom.serviceDataGroupId?.addEventListener("input", () => renderCaseContextStrip());
  dom.displayNameOverride?.addEventListener("input", () => {
    const value = dom.displayNameOverride.value.trim();
    setStorage({ [STORAGE_KEYS.displayNameOverride]: value || null });
  });

  // Load care plan / risk assessment
  dom.loadCarePlanBtn?.addEventListener("click", async () => {
    if (!state.selectedUser) return;
    setButtonLoading(dom.loadCarePlanBtn, true);
    try {
      const res = await apiProxy(`/api/extension/care-plan/${state.selectedUser.id}`);
      if (!res.ok) throw new Error(res.error || "Failed to load care plan");
      await setStorageWithTimestamp({ [STORAGE_KEYS.payload]: res.data });
      showSuccess("Care plan loaded! Go to Autofill tab.");
      switchTab("autofill");
      schedulePopupRefresh({ payload: true, immediate: true });
    } catch (error) { showError(error.message); } finally { setButtonLoading(dom.loadCarePlanBtn, false); }
  });

  dom.loadRiskBtn?.addEventListener("click", async () => {
    if (!state.selectedUser) return;
    setButtonLoading(dom.loadRiskBtn, true);
    try {
      await openCareAssuranceRoute("/service-users/risk-assessment");
      showInfo("Open the service user's latest risk assessment there, then use Send to extension for ACP autofill.");
    } catch (error) { showError(error.message); } finally { setButtonLoading(dom.loadRiskBtn, false); }
  });

  // Upload tab
  bindUploadBucketInputs();
  bindUploadDropzones();
  bindUploadActionButtons();

  dom.uploadHandoffPrimary?.addEventListener("click", async () => {
    const action = String(dom.uploadHandoffPrimary?.dataset.action || "");
    if (!action) return;
    if (await runPopupSafetyAction(action)) {
      return;
    }
    if (action === "connect") {
      await connectToCareAssurance();
      return;
    }
    if (action === "open-dashboard") {
      await openCareAssuranceRoute("/dashboard");
      return;
    }
    if (action === "refresh-context") {
      schedulePopupRefresh({ workspace: true, forceWorkspace: true, immediate: true });
      showInfo("Workspace context refreshed");
      return;
    }
    if (action === "focus-workspace") {
      await focusConnectedWorkspace();
      return;
    }
    if (action === "analyze") {
      dom.analyzeDocuments?.click();
      return;
    }
    if (action === "open-autofill") {
      focusAutofillTargetInputs();
    }
  });

  dom.uploadHandoffSecondary?.addEventListener("click", async () => {
    const action = String(dom.uploadHandoffSecondary?.dataset.action || "");
    if (!action) return;
    if (await runPopupSafetyAction(action)) {
      return;
    }
    if (action === "open-dashboard") {
      await openCareAssuranceRoute("/dashboard");
      return;
    }
    if (action === "refresh-context") {
      schedulePopupRefresh({ workspace: true, forceWorkspace: true, immediate: true });
      showInfo("Workspace context refreshed");
      return;
    }
    if (action === "focus-workspace") {
      await focusConnectedWorkspace();
      return;
    }
    focusAutofillTargetInputs();
  });

  dom.syncUploadBtn?.addEventListener("click", async () => {
    if (isUploadWorkflowBusy() && !uploadSyncInFlight) {
      showInfo("Please wait for the current upload operation to finish.");
      return;
    }

    setButtonLoading(dom.syncUploadBtn, true);
    const ok = await syncUploadsToCareAssurance({ force: true });
    if (ok) showSuccess("Uploads sent to CareAssurance Upload");
    setButtonLoading(dom.syncUploadBtn, false);
    updateUploadActionInterlocks();
  });

  dom.resetUploadBtn?.addEventListener("click", async () => {
    await resetUploadWorkspace({ showToast: true });
  });

  dom.copyAutoCollectInfo?.addEventListener("click", async () => {
    const report = buildAutoCollectReportText();
    if (!report) {
      showInfo("Run Auto-Collect first, then copy the diagnostics report.");
      return;
    }

    try {
      await writeToClipboard(report);
      showSuccess("Auto-download report copied");
    } catch {
      showError("Could not copy auto-download report. Try again.");
    }
  });

  dom.autoCollectPrimaryAction?.addEventListener("click", async () => {
    const action = String(dom.autoCollectPrimaryAction?.dataset.action || "");
    try {
      await executeAutoCollectInfoAction(action);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not run the auto-download action.";
      showError(message);
    }
  });

  dom.autoCollectSecondaryAction?.addEventListener("click", async () => {
    const action = String(dom.autoCollectSecondaryAction?.dataset.action || "");
    try {
      await executeAutoCollectInfoAction(action);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not run the auto-download action.";
      showError(message);
    }
  });

  dom.uploadNotes?.addEventListener("input", () => {
    updateUploadPendingStatus();
  });

  dom.overlayPinBtn?.addEventListener("click", async () => {
    const isPinned = dom.overlayPinBtn.getAttribute("aria-pressed") === "true";
    const nextPinned = !isPinned;

    try {
      await applyOverlayPinnedPreference(nextPinned, { broadcast: true });
      showInfo(nextPinned ? "Overlay pin enabled" : "Overlay pin disabled");
    } catch {
      showError("Could not update overlay pin right now.");
    }
  });

  dom.clearUploads?.addEventListener("click", async () => {
    await resetUploadWorkspace({ showToast: true });
  });

  dom.analyzeDocuments?.addEventListener("click", async () => {
    const selectedEntries = flattenUploadBuckets();
    if (selectedEntries.length === 0) return;

    if (isUploadWorkflowBusy()) {
      showInfo("Please wait for the current upload operation to finish.");
      return;
    }

    analyzeInFlight = true;
    updateUploadActionInterlocks();
    setButtonLoading(dom.analyzeDocuments, true);
    updateUploadSteps(2);
    if (dom.analysisProgress) dom.analysisProgress.hidden = false;
    if (dom.analysisStatus) dom.analysisStatus.textContent = "Analyzing...";

    try {
      let content = "";
      const failedFiles = [];

      for (let i = 0; i < selectedEntries.length; i++) {
        const { section, file } = selectedEntries[i];
        if (dom.analysisStatus) {
          dom.analysisStatus.textContent = `Parsing file ${i + 1} of ${selectedEntries.length}...`;
        }
        try {
          const base64Data = await readFileAsBase64(file);
          const parseRes = await apiProxy(
            "/api/extension/parse-document",
            "POST",
            { filename: file.name, base64Data },
            { timeoutMs: 120000 }
          );

          const parsedText = parseRes?.data?.text || parseRes?.text;
          if (parseRes?.ok && parsedText) {
            const sectionConfig = UPLOAD_SECTION_CONFIG.find((item) => item.key === section);
            const heading =
              section === "additionalDocuments"
                ? `${sectionConfig?.heading || "=== ADDITIONAL DOCUMENT"}: ${file.name} ===`
                : sectionConfig?.heading || `=== ${section} ===`;
            content += `\n\n${heading}\n${parsedText}`;
          } else {
            failedFiles.push(file.name);
          }
        } catch (err) {
          console.warn(`[CA Extension] Failed to parse ${file.name}:`, err);
          failedFiles.push(file.name);
        }
      }

      if (failedFiles.length > 0) showError(`Could not parse: ${failedFiles.join(", ")}`);
      if (dom.uploadNotes?.value) {
        content += `\n\n=== ADDITIONAL CONTEXT (USER ENTERED) ===\n${dom.uploadNotes.value}`;
      }
      if (!content.trim()) throw new Error("No readable content found. Please check your files are valid PDF, DOCX, or text files.");

      if (dom.analysisStatus) dom.analysisStatus.textContent = "Analyzing document content...";

      const response = await apiProxy("/api/ai/analyze-risks", "POST", { documentContent: content, allowSensitive: false }, { timeoutMs: 180000 });
      if (!response?.ok) throw new Error(response?.error || "Analysis failed");

      const result = response.data || response.result;
      if (!result) throw new Error("No analysis result returned");
      const analysisReceipt = {
        fileCount: selectedEntries.length,
        parsedCount: selectedEntries.length - failedFiles.length,
        failedFiles,
        hasNotes: Boolean(dom.uploadNotes?.value?.trim()),
        sections: Array.from(new Set(selectedEntries.map(({ section }) => {
          const config = UPLOAD_SECTION_CONFIG.find((item) => item.key === section);
          return config?.label || config?.title || section;
        }).filter(Boolean))),
      };
      result._uiReceipt = analysisReceipt;
      state.currentAnalysisResults = result;
      displayAnalysisResults(result);
      switchTab("autofill");
    } catch (error) {
      showError(error.message);
    } finally {
      if (dom.analysisProgress) dom.analysisProgress.hidden = true;
      analyzeInFlight = false;
      setButtonLoading(dom.analyzeDocuments, false);
      if (state.selectedFilesList.length === 0 && dom.analyzeDocuments) {
        dom.analyzeDocuments.disabled = true;
      }
      updateUploadPendingStatus();
    }
  });

  // Selection controls
  dom.selectAllBtn?.addEventListener("click", () => { document.querySelectorAll(".assessment-checkbox").forEach((cb) => (cb.checked = true)); updateSelectionCount(); });
  dom.clearSelectionBtn?.addEventListener("click", () => { document.querySelectorAll(".assessment-checkbox").forEach((cb) => (cb.checked = false)); updateSelectionCount(); });

  dom.proceedWithSelection?.addEventListener("click", async () => {
    if (!state.currentAnalysisResults) return;
    const selected = Array.from(document.querySelectorAll(".assessment-checkbox:checked"))
      .map((cb) => state.currentAnalysisResults.recommendedAssessments[parseInt(cb.dataset.index)])
      .filter(Boolean);

    const payload = {
      formType: "acp",
      assessments: selected.map((a) => ({
        assessmentType: a.name,
        riskLevel: "To be determined",
        findings: a.evidence || a.reason || "",
        recommendations: a.reason || "",
        additionalNotes: dom.additionalNotes?.value || "",
      })),
    };

    await setStorageWithTimestamp({ [STORAGE_KEYS.payload]: payload });
    schedulePopupRefresh({ payload: true, immediate: true });
    if (dom.selectionSection) dom.selectionSection.hidden = true;
  });

  // Autofill controls
  dom.autoDetectIds?.addEventListener("click", autoDetectIds);

  dom.startAutofill?.addEventListener("click", async () => {
    const caseId = dom.caseId?.value.trim();
    const serviceDataGroupId = dom.serviceDataGroupId?.value.trim();

    if (!caseId) {
      showError("Case ID is required. Select a service user or enter manually.");
      if (dom.progressStatus) dom.progressStatus.textContent = "Missing Case ID";
      setFieldInvalid(dom.caseId, "Case ID is required");
      dom.caseId?.focus();
      return;
    }
    if (!serviceDataGroupId) {
      showError("Service Data Group ID is required.");
      if (dom.progressStatus) dom.progressStatus.textContent = "Missing Service Data Group ID";
      setFieldInvalid(dom.serviceDataGroupId, "Service Data Group ID is required");
      dom.serviceDataGroupId?.focus();
      return;
    }

    const payloadCheck = await loadStorage([STORAGE_KEYS.payload]);
    const payload = payloadCheck[STORAGE_KEYS.payload];
    if (!payload) {
      showError("No payload loaded. Upload care data first.");
      if (dom.progressStatus) dom.progressStatus.textContent = "No payload";
      return;
    }
    if (payload.formType === "acp" && Array.isArray(payload.assessments) && payload.assessments.length === 0) {
      showError("Assessment list is empty \u2014 nothing to autofill.");
      if (dom.progressStatus) dom.progressStatus.textContent = "Empty assessments";
      return;
    }

    const workflowSafety = buildWorkflowSafetyState({
      extensionStatus: state.extensionStatus,
      pageContext: state.pageCompanionContext,
      selectedAutofillUser: state.selectedAutofillUser,
      payload,
      caseId,
      serviceDataGroupId,
      requireCaseId: true,
      requireServiceDataGroup: true,
    });
    if (workflowSafety.shouldBlockStart) {
      showError(workflowSafety.detail);
      if (dom.progressStatus) dom.progressStatus.textContent = workflowSafety.title;
      await runPopupSafetyAction(workflowSafety.action);
      return;
    }

    // Preview-before-fill — give the operator a last chance to inspect and abort.
    // Skipped for dry-run (already a no-op) and when the user opted out for this popup session.
    if (!state.skipAutofillPreviewThisSession && !dom.dryRun?.checked) {
      try {
        const summary = buildAutofillPreviewSummary(payload);
        const result = await showAutofillPreviewDialog(summary);
        if (!result?.confirmed) {
          if (dom.progressStatus) dom.progressStatus.textContent = "Autofill cancelled";
          return;
        }
        if (result.skipNextTime) {
          state.skipAutofillPreviewThisSession = true;
        }
      } catch (err) {
        // If the preview itself crashes, log it but don't block the run — better to fall through.
        console.warn("[CA Extension] autofill preview dialog failed:", err);
      }
    }

    await setStorage({ [STORAGE_KEYS.verificationFields]: null });
    setButtonLoading(dom.startAutofill, true);

    // Apply display name override to the stored payload if set
    const displayNameOverride = String(dom.displayNameOverride?.value || "").trim();
    if (displayNameOverride && payload) {
      payload.serviceUserDisplayName = displayNameOverride;
      await setStorage({ [STORAGE_KEYS.payload]: payload });
    }

    await setStorage({
      [STORAGE_KEYS.caseInfo]: { caseId, serviceDataGroupId },
      [STORAGE_KEYS.autoSubmit]: dom.autoSubmit?.checked,
      [STORAGE_KEYS.dryRun]: dom.dryRun?.checked,
      [STORAGE_KEYS.interactionMode]: dom.interactionMode?.value,
      [STORAGE_KEYS.displayNameOverride]: displayNameOverride || null,
    });

    chrome.runtime.sendMessage(
      { type: MESSAGE_TYPES.startAutofill, caseId, serviceDataGroupId },
      (response) => {
        setButtonLoading(dom.startAutofill, false);
        if (dom.progressStatus) {
          dom.progressStatus.textContent = response?.ok ? "Autofill started!" : response?.error || "Failed";
        }
        if (!response?.ok && response?.error) showError(response.error);
      }
    );
  });

  dom.stopAutofill?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: MESSAGE_TYPES.stopAutofill }, () => {
      if (dom.progressStatus) dom.progressStatus.textContent = "Stopped";
    });
  });

  dom.clearData?.addEventListener("click", () => {
    showConfirmDialog(
      "Clear All Data",
      "This will permanently remove the following. This action cannot be undone.",
      async () => {
        await setStorage({
          [STORAGE_KEYS.payload]: null,
          [DATA_TIMESTAMP_KEY]: null,
          [STORAGE_KEYS.caseInfo]: null,
          [STORAGE_KEYS.queueState]: null,
          [STORAGE_KEYS.signatureData]: null,
          [STORAGE_KEYS.signatureBatchId]: null,
          [STORAGE_KEYS.uploadedDocuments]: null,
          [STORAGE_KEYS.verificationFields]: null,
        });
        schedulePopupRefresh({ payload: true, immediate: true });
        if (dom.progressStatus) dom.progressStatus.textContent = "Cleared";
        showSuccess("All data cleared");
      },
      {
        details: [
          "Loaded payload / assessment data",
          "Case info (Case ID, Service Data Group)",
          "Queue state",
          "Signature image",
          "Uploaded documents",
          "Verification fields",
        ],
      }
    );
  });

  dom.opsRefresh?.addEventListener("click", async () => {
    schedulePopupRefresh({ payload: true, workspace: true, forceWorkspace: true, immediate: true });
    showSuccess("Command center synced");
  });

  dom.opsCopySnapshot?.addEventListener("click", async () => {
    try {
      const data = await loadStorage([
        STORAGE_KEYS.runtimeMetrics,
        STORAGE_KEYS.lastError,
        STORAGE_KEYS.caseInfo,
        STORAGE_KEYS.queueState,
        STORAGE_KEYS.payload,
        STORAGE_KEYS.verificationFields,
        STORAGE_KEYS.interactionMode,
        STORAGE_KEYS.dryRun,
        DATA_TIMESTAMP_KEY,
      ]);

      const snapshot = {
        capturedAt: new Date().toISOString(),
        requestId: createRequestId(),
        targetOrigin: getCareAssuranceUrl(),
        payloadType: data?.[STORAGE_KEYS.payload]?.formType || null,
        payloadStoredAt: data?.[DATA_TIMESTAMP_KEY] || null,
        queueState: data?.[STORAGE_KEYS.queueState] || null,
        caseInfo: data?.[STORAGE_KEYS.caseInfo] || null,
        verificationCount: Array.isArray(data?.[STORAGE_KEYS.verificationFields]) ? data[STORAGE_KEYS.verificationFields].length : 0,
        interactionMode: data?.[STORAGE_KEYS.interactionMode] || "auto",
        dryRun: Boolean(data?.[STORAGE_KEYS.dryRun]),
        lastError: data?.[STORAGE_KEYS.lastError] || null,
        runtimeMetrics: data?.[STORAGE_KEYS.runtimeMetrics] || null,
      };

      await writeToClipboard(JSON.stringify(snapshot, null, 2));
      showSuccess("Ops snapshot copied");
    } catch {
      showError("Could not copy ops snapshot. Try again.");
    }
  });

  dom.opsCopyIncident?.addEventListener("click", async () => {
    try {
      const data = await loadStorage([
        STORAGE_KEYS.runtimeMetrics,
        STORAGE_KEYS.lastError,
        STORAGE_KEYS.caseInfo,
        STORAGE_KEYS.queueState,
        STORAGE_KEYS.payload,
        STORAGE_KEYS.logs,
        DATA_TIMESTAMP_KEY,
      ]);

      const incident = data?.[STORAGE_KEYS.lastError] || null;
      if (!incident) {
        showInfo("No active incident to copy.");
        return;
      }

      const runtimeDiagnostics = buildRuntimeDiagnosticsState({
        metrics: data?.[STORAGE_KEYS.runtimeMetrics] || null,
        lastError: incident,
        queueState: data?.[STORAGE_KEYS.queueState] || null,
        payload: data?.[STORAGE_KEYS.payload] || null,
        payloadStoredAt: data?.[DATA_TIMESTAMP_KEY] || null,
      });

      const packet = {
        capturedAt: new Date().toISOString(),
        requestId: createRequestId(),
        targetOrigin: getCareAssuranceUrl(),
        incident,
        payloadType: data?.[STORAGE_KEYS.payload]?.formType || null,
        payloadStoredAt: data?.[DATA_TIMESTAMP_KEY] || null,
        caseInfo: data?.[STORAGE_KEYS.caseInfo] || null,
        queueState: data?.[STORAGE_KEYS.queueState] || null,
        runtimeDiagnostics,
        recentLogTail: Array.isArray(data?.[STORAGE_KEYS.logs]) ? data[STORAGE_KEYS.logs].slice(-25) : [],
      };

      await writeToClipboard(JSON.stringify(packet, null, 2));
      showSuccess("Incident packet copied");
    } catch {
      showError("Could not copy incident packet. Try again.");
    }
  });

  dom.opsClearIncident?.addEventListener("click", async () => {
    await setStorage({ [STORAGE_KEYS.lastError]: null });
    schedulePopupRefresh({ payload: true, workspace: true, immediate: true });
    showInfo("Incident state cleared");
  });

  // Payload & diagnostics actions
  dom.copyPayload?.addEventListener("click", async () => {
    if (!state.latestPayloadSnapshot?.payload) { showError("No payload available to copy."); return; }
    try { await writeToClipboard(JSON.stringify(state.latestPayloadSnapshot.payload, null, 2)); showSuccess("Payload copied to clipboard"); }
    catch { showError("Could not copy payload. Try again."); }
  });

  dom.copyDiagnostics?.addEventListener("click", async () => {
    try {
      const data = await loadStorage([STORAGE_KEYS.runtimeMetrics, STORAGE_KEYS.lastError, STORAGE_KEYS.caseInfo, STORAGE_KEYS.queueState, STORAGE_KEYS.logs, STORAGE_KEYS.payload, DATA_TIMESTAMP_KEY]);
      const logs = Array.isArray(data[STORAGE_KEYS.logs]) ? data[STORAGE_KEYS.logs].slice(-20) : [];
      const diagnostics = {
        capturedAt: new Date().toISOString(),
        requestId: createRequestId(),
        targetOrigin: getCareAssuranceUrl(),
        connected: state.isConnected,
        payloadType: data?.[STORAGE_KEYS.payload]?.formType || null,
        payloadStoredAt: data[DATA_TIMESTAMP_KEY] || null,
        caseInfo: data[STORAGE_KEYS.caseInfo] || null,
        queueState: data[STORAGE_KEYS.queueState] || null,
        lastError: data[STORAGE_KEYS.lastError] || null,
        runtimeMetrics: data[STORAGE_KEYS.runtimeMetrics] || null,
        recentLogTail: logs,
      };
      await writeToClipboard(JSON.stringify(diagnostics, null, 2));
      if (dom.logStatus) dom.logStatus.textContent = `Diagnostics copied (${logs.length} logs)`;
      showSuccess("Diagnostics copied to clipboard");
    } catch { showError("Could not copy diagnostics. Try again."); }
  });

  dom.clearLogs?.addEventListener("click", async () => {
    await setStorage({ [STORAGE_KEYS.logs]: [], [STORAGE_KEYS.runtimeMetrics]: null });
    lastLogFingerprint = "0";
    if (dom.logList) dom.logList.textContent = "";
    if (dom.logStatus) dom.logStatus.textContent = "No actions.";
    renderCommandCenter({});
    renderRuntimeDiagnostics(null);
  });

  // Page companion
  dom.refreshPageCompanion?.addEventListener("click", async () => {
    try {
      const context = state.pageCompanionContext || (await refreshPageCompanion());
      if (context?.requiresPageRefresh && context?.tabId) {
        await chrome.tabs.reload(context.tabId);
        showSuccess("Refreshing the attached CareAssurance page.");
        window.setTimeout(() => {
          refreshPageCompanion().catch(() => {});
        }, 1200);
        return;
      }
      await refreshPageCompanion();
      showSuccess("Page companion refreshed");
    }
    catch { showError("Could not refresh the current page companion."); }
  });

  dom.focusPageCompanion?.addEventListener("click", () => {
    focusPageCompanion().catch((e) => showError(e.message || "Could not focus the workflow page."));
  });

  dom.openPageOverlay?.addEventListener("click", async () => {
    try {
      await sendMessageToPageCompanion({ type: MESSAGE_TYPES.toggleOverlay || "CA_EXTENSION_TOGGLE_OVERLAY", payload: { open: true } });
      showSuccess("In-page status opened");
    } catch (e) { showError(e.message || "Could not open the in-page status surface."); }
  });

  dom.jumpPageVerification?.addEventListener("click", () => {
    navigateToVerificationField(1).catch((e) => showError(e.message || "Could not move to the next review field."));
  });

  dom.autofillSessionPrimary?.addEventListener("click", () => {
    const action = dom.autofillSessionPrimary?.dataset.action || "refresh";
    if (action === "start") { dom.startAutofill?.click(); return; }
    if (action === "stop") { dom.stopAutofill?.click(); return; }
    if (action === "overlay") { dom.openPageOverlay?.click(); return; }
    if (action === "verify") { dom.jumpPageVerification?.click(); return; }
    if (["open-status", "detect-ids", "reload-page", "open-autofill"].includes(action)) {
      runPopupSafetyAction(action).catch((error) => showError(error?.message || "Could not continue from the session card."));
      return;
    }
    if (action === "diagnostics") {
      if (dom.commandCenterSection) dom.commandCenterSection.open = true;
      return;
    }
    dom.refreshPageCompanion?.click();
  });

  dom.autofillSessionFocus?.addEventListener("click", () => {
    dom.focusPageCompanion?.click();
  });

  dom.autofillSessionDiagnostics?.addEventListener("click", () => {
    if (dom.commandCenterSection) dom.commandCenterSection.open = true;
  });

  // Signature
  dom.signatureFile?.addEventListener("change", async () => {
    const file = dom.signatureFile.files?.[0];
    if (dom.signatureFilename) dom.signatureFilename.textContent = file ? file.name : "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { showError("Please select an image file (PNG, JPG, etc.)"); dom.signatureFile.value = ""; if (dom.signatureFilename) dom.signatureFilename.textContent = ""; return; }
    if (file.size > 5 * 1024 * 1024) { showError("Signature file is too large. Maximum size is 5MB"); dom.signatureFile.value = ""; if (dom.signatureFilename) dom.signatureFilename.textContent = ""; return; }

    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const stored = await loadStorage([STORAGE_KEYS.queueState]);
      const batchId = stored?.caAcpQueueState?.batchId || null;

      await setStorage({
        [STORAGE_KEYS.signatureData]: { dataUrl, fileName: file.name, mimeType: file.type, uploadedAt: new Date().toISOString() },
        [STORAGE_KEYS.signatureBatchId]: batchId,
      });

      await refreshSignatureStatus();
      showSuccess("Signature uploaded successfully!");
      dom.signatureFile.value = "";
      if (dom.signatureFilename) dom.signatureFilename.textContent = "";
    } catch (error) {
      console.error("Signature upload error:", error);
      showError("Failed to upload signature. Please try again.");
      dom.signatureFile.value = "";
      if (dom.signatureFilename) dom.signatureFilename.textContent = "";
    }
  });

  dom.uploadSignatureBtn?.addEventListener("click", () => dom.signatureFile?.click());

  // Autofill user picker
  dom.autofillUserDropdown?.addEventListener("click", (e) => {
    const option = e.target.closest(".autofill-user-option[data-acp-id]");
    if (!option) return;
    selectAutofillUser({
      acpId: option.dataset.acpId,
      name: option.dataset.name,
      initials: option.querySelector(".user-avatar")?.textContent || "??",
    });
    renderUploadHandoffSummary();
  });

  dom.autofillUserSearch?.addEventListener("input", () => {
    const term = dom.autofillUserSearch.value.trim();
    if (term.length === 0 && !state.selectedAutofillUser) { if (dom.autofillUserDropdown) dom.autofillUserDropdown.hidden = true; return; }
    renderAutofillUserDropdown(term);
  });

  dom.autofillUserSearch?.addEventListener("focus", () => { if (state.acpServiceUsers.length > 0) renderAutofillUserDropdown(); });

  dom.autofillUserSearch?.addEventListener("keydown", (e) => {
    if (!dom.autofillUserDropdown || dom.autofillUserDropdown.hidden) return;
    const options = [...dom.autofillUserDropdown.querySelectorAll(".autofill-user-option[data-acp-id]")];
    if (!options.length) return;
    const activeClass = "autofill-user-option-active";
    let current = dom.autofillUserDropdown.querySelector(`.${activeClass}`);
    let idx = current ? options.indexOf(current) : -1;
    if (e.key === "ArrowDown") { e.preventDefault(); if (current) current.classList.remove(activeClass); idx = idx < options.length - 1 ? idx + 1 : 0; options[idx].classList.add(activeClass); options[idx].scrollIntoView({ block: "nearest" }); }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (current) current.classList.remove(activeClass); idx = idx > 0 ? idx - 1 : options.length - 1; options[idx].classList.add(activeClass); options[idx].scrollIntoView({ block: "nearest" }); }
    else if (e.key === "Enter") { e.preventDefault(); if (current && current.dataset.acpId) current.click(); }
    else if (e.key === "Escape") { e.preventDefault(); dom.autofillUserDropdown.hidden = true; }
  });

  document.addEventListener("click", (event) => {
    if (dom.autofillUserDropdown && !dom.autofillUserDropdown.hidden) {
      const picker = dom.autofillUserSearch?.closest(".autofill-user-picker");
      if (picker && !picker.contains(event.target)) dom.autofillUserDropdown.hidden = true;
    }
  });

  // Field validation
  dom.caseId?.addEventListener("blur", () => { if (dom.caseId.value.trim()) clearFieldInvalid(dom.caseId); else setFieldInvalid(dom.caseId, "Case ID is required"); });
  dom.caseId?.addEventListener("input", () => clearFieldInvalid(dom.caseId));
  dom.serviceDataGroupId?.addEventListener("blur", () => { if (dom.serviceDataGroupId.value.trim()) clearFieldInvalid(dom.serviceDataGroupId); else setFieldInvalid(dom.serviceDataGroupId, "Service Data Group ID is required"); });
  dom.serviceDataGroupId?.addEventListener("input", () => clearFieldInvalid(dom.serviceDataGroupId));

  // Error dismiss
  dom.errorDismiss?.addEventListener("click", () => {
    if (dom.errorBanner) { dom.errorBanner.hidden = true; clearTimeout(dom.errorBanner._dismissTimer); }
  });

  // EMAR skipped rows banner — toggle / copy / clear
  dom.emarSkippedToggle?.addEventListener("click", () => {
    if (!dom.emarSkippedList || !dom.emarSkippedToggle) return;
    const expanded = dom.emarSkippedToggle.getAttribute("aria-expanded") === "true";
    const next = !expanded;
    dom.emarSkippedToggle.setAttribute("aria-expanded", next ? "true" : "false");
    dom.emarSkippedToggle.textContent = next ? "Details ▴" : "Details ▾";
    dom.emarSkippedList.hidden = !next;
  });

  dom.emarSkippedCopy?.addEventListener("click", async () => {
    try {
      const { [STORAGE_KEYS.emarSkippedRows]: rows } = await loadStorage([STORAGE_KEYS.emarSkippedRows]);
      const csv = buildEmarSkippedRowsCsv(rows);
      await writeToClipboard(csv);
      showSuccess("Skipped EMAR rows copied as CSV");
    } catch (err) {
      console.warn("[CA Extension] emar skipped copy failed:", err);
      showError("Could not copy skipped rows to clipboard");
    }
  });

  dom.emarSkippedClear?.addEventListener("click", async () => {
    try {
      await setStorage({ [STORAGE_KEYS.emarSkippedRows]: [] });
      renderEmarSkippedBanner([]);
    } catch (err) {
      console.warn("[CA Extension] emar skipped clear failed:", err);
      showError("Could not clear skipped rows");
    }
  });

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); dom.startAutofill?.click(); return; }
    if (e.key === "Escape") {
      const dialog = document.querySelector(".dialog-overlay");
      if (dialog) { dialog.remove(); return; }
      if (dom.autofillUserDropdown && !dom.autofillUserDropdown.hidden) { dom.autofillUserDropdown.hidden = true; return; }
    }
    if (e.target.getAttribute("role") === "tab") {
      const tabOrder = ["connect", "upload", "autofill"];
      const currentTab = e.target.dataset.tab;
      const idx = tabOrder.indexOf(currentTab);
      if (e.key === "ArrowRight" && idx < tabOrder.length - 1) { e.preventDefault(); switchTab(tabOrder[idx + 1]); document.getElementById(`tab-${tabOrder[idx + 1]}`)?.focus(); }
      if (e.key === "ArrowLeft" && idx > 0) { e.preventDefault(); switchTab(tabOrder[idx - 1]); document.getElementById(`tab-${tabOrder[idx - 1]}`)?.focus(); }
    }
  });

  // Help panel
  document.getElementById("help-btn")?.addEventListener("click", () => {
    let version = "";
    try {
      version = chrome.runtime?.getManifest?.()?.version || "";
    } catch {
      version = "";
    }

    showHelpGuideDialog({
      version,
      isConnected: state.isConnected,
      isAdmin: state.isAdmin,
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// STORAGE CHANGE LISTENER
// ═══════════════════════════════════════════════════════════════════════════

function bindStorageListener() {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    try {
      if (areaName !== "local" && areaName !== "session") return;

      if (changes[STORAGE_KEYS.runtimeConfig]) {
        try {
          applyRuntimeConfig(changes[STORAGE_KEYS.runtimeConfig].newValue || null);
          schedulePopupRefresh({ payload: true, workspace: true });
        } catch (e) { console.warn("[CA Extension] runtime config handler error:", e); }
      }

      if (changes[STORAGE_KEYS.queueState]) {
        try {
          const newState = changes[STORAGE_KEYS.queueState].newValue;
          updateLiveProgress(newState);
          if (!newState) {
            if (dom.progressStatus) dom.progressStatus.textContent = "\u2713 Autofill complete!";
            showSuccess("Autofill batch complete! All forms have been filled.");
            schedulePopupRefresh({ payload: true, workspace: true, immediate: true });
            if (dom.connectionBadge) {
              dom.connectionBadge.classList.add("connected");
              const text = dom.connectionBadge.querySelector(".connection-text");
              if (text) { const orig = text.textContent; text.textContent = "\u2713 Complete"; setTimeout(() => { text.textContent = orig; }, 4000); }
            }
          } else if (typeof newState.currentIndex === "number" && typeof newState.total === "number") {
            if (dom.progressStatus) dom.progressStatus.textContent = `Filling ${newState.currentIndex + 1} of ${newState.total}...`;
          }
          schedulePopupRefresh({ payload: true });
        } catch (e) { console.warn("[CA Extension] queueState handler error:", e); }
      }

      if (changes[STORAGE_KEYS.payload]) {
        try { schedulePopupRefresh({ payload: true }); } catch (e) { console.warn("[CA Extension] payload handler error:", e); }
      }

      if (changes[STORAGE_KEYS.verificationFields] || changes[STORAGE_KEYS.runtimeMetrics]) {
        try { schedulePopupRefresh({ payload: true }); } catch (e) { console.warn("[CA Extension] verification handler error:", e); }
      }

      if (changes[STORAGE_KEYS.logs]) {
        try {
          const logs = changes[STORAGE_KEYS.logs].newValue;
          const logFingerprint = buildLogFingerprint(logs);
          if (logFingerprint !== lastLogFingerprint) {
            renderLogs(Array.isArray(logs) ? logs : []);
            lastLogFingerprint = logFingerprint;
          }
        }
        catch (e) { console.warn("[CA Extension] logs handler error:", e); }
      }

      if (changes[STORAGE_KEYS.lastError]) {
        try {
          const err = changes[STORAGE_KEYS.lastError].newValue;
          if (err) showError(typeof err === "string" ? err : err.message || "Unknown error");
          schedulePopupRefresh({ payload: true, workspace: true });
        }
        catch (e) { console.warn("[CA Extension] error handler error:", e); }
      }

      if (changes[STORAGE_KEYS.overlayPinned]) {
        try {
          renderOverlayPinButton(Boolean(changes[STORAGE_KEYS.overlayPinned].newValue));
        } catch (e) { console.warn("[CA Extension] overlay pin handler error:", e); }
      }

      if (changes[STORAGE_KEYS.emarSkippedRows]) {
        try {
          const rows = changes[STORAGE_KEYS.emarSkippedRows].newValue;
          renderEmarSkippedBanner(Array.isArray(rows) ? rows : []);
        } catch (e) { console.warn("[CA Extension] emar skipped handler error:", e); }
      }

      if (changes[STORAGE_KEYS.appTheme]) {
        try {
          applyPopupAppTheme(changes[STORAGE_KEYS.appTheme].newValue);
        } catch (e) { console.warn("[CA Extension] theme sync handler error:", e); }
      }
    } catch (outerErr) {
      console.error("[CA Extension] storage.onChanged crash:", outerErr);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

(async function init() {
  cacheDomElements();
  bindEvents();
  bindStorageListener();
  ensureUploadBuckets();
  renderUploadBuckets();
  updateAutoCollectInfoSnapshot(createAutoCollectInfoSnapshot());
  refreshExtensionVersionDisplay();
  renderExtensionHealth(null);

  // Surface uncaught popup errors to the server audit trail (best-effort).
  // Throttled per-message to avoid flooding the system_logs table.
  const __reportedPopupErrors = new Map();
  const reportPopupError = (severity, code, message, context) => {
    try {
      const key = `${code}::${message}`;
      const now = Date.now();
      const last = __reportedPopupErrors.get(key) || 0;
      if (now - last < 15000) return;
      __reportedPopupErrors.set(key, now);
      reportExtensionError({
        severity,
        code,
        message,
        surface: "popup",
        context,
        url: location?.href || null,
      });
    } catch {
      /* noop */
    }
  };
  window.addEventListener("error", (event) => {
    reportPopupError("error", "popup_window_error", event?.message || "window error", {
      filename: event?.filename,
      lineno: event?.lineno,
      colno: event?.colno,
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event?.reason;
    const msg = reason instanceof Error ? reason.message : String(reason ?? "unhandled rejection");
    reportPopupError("error", "popup_unhandled_rejection", msg);
  });

  // Keep first popup render fast by deferring non-critical startup work.
  runPopupIdleTask(() => initMainMenuDragging(), { timeout: 1200, fallbackDelay: 120 });
  runPopupIdleTask(() => autoCleanupStaleData(), { timeout: 2600, fallbackDelay: 600 });

  const initialState = await loadStorage(POPUP_INITIAL_STORAGE_KEYS);

  applyRuntimeConfig(initialState?.[STORAGE_KEYS.runtimeConfig] || null);

  applyPopupAppTheme(initialState?.[STORAGE_KEYS.appTheme]);

  renderOverlayPinButton(Boolean(initialState?.[STORAGE_KEYS.overlayPinned]));

  const storedServerUrl = String(initialState?.[STORAGE_KEYS.serverUrl] || "").trim();
  if (storedServerUrl) {
    setCareAssuranceUrl(storedServerUrl);
  }

  const savedTab = initialState?.[STORAGE_KEYS.lastTab];
  if (savedTab) {
    switchTab(savedTab, { persist: false });
  }

  const savedAutofillUser = initialState?.[STORAGE_KEYS.lastAutofillUser];
  if (savedAutofillUser?.acpId) {
    selectAutofillUser(savedAutofillUser);
    renderUploadHandoffSummary();
  }

  // Restore display name override
  const savedDisplayNameOverride = initialState?.[STORAGE_KEYS.displayNameOverride];
  if (savedDisplayNameOverride && dom.displayNameOverride) {
    dom.displayNameOverride.value = savedDisplayNameOverride;
  }

  if (initialState?.[STORAGE_KEYS.payload]) {
    switchTab("autofill", { persist: false });
  }

  // Restore EMAR skipped-rows banner from previous session (banner stays hidden if list is empty).
  try {
    renderEmarSkippedBanner(initialState?.[STORAGE_KEYS.emarSkippedRows] || []);
  } catch (e) {
    console.warn("[CA Extension] initial emar skipped render failed:", e);
  }

  // Render state-dependent sections without blocking connection checks.
  void refreshPayloadStatus();
  void refreshSignatureStatus();
  void refreshWorkspaceContext();

  // Auto-detect case IDs from active tab URL
  runPopupIdleTask(async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url) return;

      const url = new URL(tab.url);
      if (isLikelyCareAssuranceUrl(tab.url)) {
        setCareAssuranceUrl(url.host);
        await setStorage({ [STORAGE_KEYS.serverUrl]: url.host });
      }

      if (url.pathname.includes("new_case_form") || url.pathname.includes("edit_case_form")) {
        const caseId = url.searchParams.get("caseId");
        const serviceDataGroupId = url.searchParams.get("serviceDataGroupId");
        if (caseId && serviceDataGroupId) {
          const hasExisting = dom.caseId?.value || dom.serviceDataGroupId?.value;
          if (!hasExisting) {
            if (dom.caseId) dom.caseId.value = caseId;
            if (dom.serviceDataGroupId) dom.serviceDataGroupId.value = serviceDataGroupId;
            await setStorage({ [STORAGE_KEYS.caseInfo]: { caseId, serviceDataGroupId } });
          }
        }
      }
    } catch {
      // ignore active-tab read errors
    }
  }, { timeout: 1800, fallbackDelay: 140 });

  // Quick connection check
  if (dom.connectStatus) dom.connectStatus.innerHTML = '<span style="font-size: 11px;">Checking connection...</span>';

  try {
    const res = await apiProxy("/api/extension/status");
    debugLog("[CA Extension] Quick check response:", JSON.stringify(res)?.substring(0, 400));
    // The proxy wraps server JSON as { ok, data: <serverJson> }
    // The server returns { connected, user: { id, username, role }, ... }
    const payload = res.data || res;
    const user = payload.user || null;
    if (res.ok && user) {
      debugLog("[CA Extension] Quick check user:", JSON.stringify(user));
      setExtensionStatusSnapshot(payload);
      updateConnectionUI(true, user);
      void refreshWorkspaceContext(user);
      void fetchExtensionRuntimeConfig().catch(() => null);
      fetchConnectedData(user); // Fetch service users without forcing reconnect
      if (state.selectedFilesList.length > 0) {
        updateUploadPendingStatus();
      }
    } else if (res.ok && !user) {
      setExtensionStatusSnapshot(null);
      // Got a 200 OK but no user object — likely HTML response or malformed data
      console.warn("[CA Extension] Quick check OK but no user — running full connection flow");
      connectToCareAssurance();
    } else if (res.error === "Not logged in") {
      setExtensionStatusSnapshot(null);
      updateConnectionUI(false);
      if (dom.connectStatus) dom.connectStatus.innerHTML = '<span style="font-size: 11px;">Please log in to Care Assurance first, then click Connect</span>';
    } else if (res.needsTab) {
      setExtensionStatusSnapshot(null);
      updateConnectionUI(false);
      if (dom.connectStatus) dom.connectStatus.innerHTML = '<span style="font-size: 11px;">Open Care Assurance in a tab, then click Connect</span>';
    } else {
      setExtensionStatusSnapshot(null);
      updateConnectionUI(false);
      if (dom.connectStatus) dom.connectStatus.innerHTML = '<span style="font-size: 11px;">Click "Connect" to find server</span>';
    }
  } catch {
    setExtensionStatusSnapshot(null);
    updateConnectionUI(false);
    if (dom.connectStatus) dom.connectStatus.innerHTML = '<span style="font-size: 11px;">Click "Connect" to find server</span>';
  }

  // Periodic refresh (throttled)
  setInterval(() => {
    if (document.hidden) return;
    schedulePopupRefresh({ payload: true, workspace: true });
  }, POPUP_PERIODIC_REFRESH_MS);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      schedulePopupRefresh({ payload: true, workspace: true, forceWorkspace: true, immediate: true });
    }
  });

  // GDPR periodic cleanup
  setInterval(autoCleanupStaleData, POPUP_GDPR_CLEANUP_MS);
})();
