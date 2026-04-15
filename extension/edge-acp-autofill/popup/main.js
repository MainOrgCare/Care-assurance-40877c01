/**
 * main.js — Entry point: event binding, connection flow, and initialization
 * CareAssurance Extension v0.6.19
 */

import {
  STORAGE_KEYS,
  DATA_TIMESTAMP_KEY,
  MESSAGE_TYPES,
  FORM_WORKFLOW_DESCRIPTORS,
  CARE_ASSURANCE_URLS,
  state,
  getCareAssuranceUrl,
  setCareAssuranceUrl,
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
  buildCommandCenterState,
  buildRuntimeDiagnosticsState,
} from "./state.js";

import {
  apiProxy,
  findConnectedWorkspaceTab,
  sendMessageToPageCompanion,
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
  updateConnectionUI,
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
  renderPageCompanion,
  displayRecentItems,
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

let popupRefreshTimer = null;
let popupRefreshInFlight = false;
let popupRefreshQueued = false;
let popupRefreshPayloadRequested = false;
let popupRefreshWorkspaceRequested = false;
let popupRefreshForceWorkspace = false;
let lastWorkspaceRefreshAt = 0;
let lastLogFingerprint = "";

const buildLogFingerprint = (logs) => {
  if (!Array.isArray(logs) || logs.length === 0) return "0";
  const lastEntry = logs[logs.length - 1] || "";
  return `${logs.length}:${String(lastEntry)}`;
};

const MAX_UPLOAD_SYNC_BYTES = 35 * 1024 * 1024;
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

const MOBIZIO_DOCUMENT_SERVICE_ID = "1000801";
const MOBIZIO_DOCUMENT_LIST_PATH = "/case_document_list";
const MOBIZIO_INITIAL_ASSESSMENT_SERVICE_DATA_GROUP_ID = "1014998";
const MOBIZIO_INITIAL_ASSESSMENT_PATH = "/case_data_group";
const MOBIZIO_CARE_PLAN_DASHBOARD_PATH = "/eoutcomeservice/branch/case_care_plans_dashboard";

const SECTION_AUTO_COLLECT_RULES = {
  socialWork: {
    sectionLabel: "Social Work",
    keywords: ["social work", "c2", "c3", "referral", "email"],
    single: false,
  },
  initialAssessment: {
    sectionLabel: "Initial Assessment",
    keywords: ["initial assessment", "initial visit", "service setup", "needs assessment", "assessment"],
    single: false,
  },
  carePlan: {
    sectionLabel: "Support Plan",
    keywords: ["support plan", "care plan", "workplan", "work plan"],
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
    heading: "=== SUPPORT PLAN ===",
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
  const stagedCount = flattenUploadBuckets().length;
  if (stagedCount === 0) {
    updateUploadSyncStatus("Add files to stage them, then click Send to transfer.");
    return;
  }

  if (!state.isConnected) {
    updateUploadSyncStatus(
      `Staged ${stagedCount} file${stagedCount === 1 ? "" : "s"}. Connect your workspace, then click Send.`,
      "warning"
    );
    return;
  }

  updateUploadSyncStatus(`Staged ${stagedCount} file${stagedCount === 1 ? "" : "s"}. Click Send to transfer.`);
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
  updateUploadPendingStatus();
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

const parseMobizioUploadedAt = (rawValue) => {
  const value = String(rawValue || "").trim();
  if (!value) return 0;

  const directlyParsed = Date.parse(value);
  if (!Number.isNaN(directlyParsed)) {
    return directlyParsed;
  }

  const match = value.match(/^(\d{1,2})\/([A-Za-z]{3})\/(\d{2,4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return 0;

  const monthLookup = {
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

  const day = Number(match[1]);
  const month = monthLookup[String(match[2]).toLowerCase()];
  let year = Number(match[3]);
  let hours = Number(match[4]);
  const minutes = Number(match[5]);
  const meridiem = String(match[6]).toUpperCase();

  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year) || !Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return 0;
  }

  if (year < 100) {
    year += year >= 70 ? 1900 : 2000;
  }

  if (meridiem === "PM" && hours < 12) {
    hours += 12;
  } else if (meridiem === "AM" && hours === 12) {
    hours = 0;
  }

  const parsed = new Date(year, month, day, hours, minutes, 0, 0).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const scoreDocumentForSection = (sectionKey, documentEntry) => {
  const rule = getAutoCollectRule(sectionKey);
  const keywords = Array.isArray(rule.keywords) ? rule.keywords : [];
  if (keywords.length === 0) return 0;

  const sourceText = [
    documentEntry?.name,
    documentEntry?.fileName,
    documentEntry?.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let score = 0;
  for (const keyword of keywords) {
    if (sourceText.includes(String(keyword).toLowerCase())) {
      score += 1;
    }
  }

  return score;
};

const rankDocumentsForSection = (sectionKey, documents) =>
  [...documents]
    .map((entry) => ({
      ...entry,
      sectionScore: scoreDocumentForSection(sectionKey, entry),
      uploadedTimestamp: parseMobizioUploadedAt(entry.uploadedDate),
    }))
    .sort((a, b) => {
      if (b.sectionScore !== a.sectionScore) {
        return b.sectionScore - a.sectionScore;
      }
      if (b.uploadedTimestamp !== a.uploadedTimestamp) {
        return b.uploadedTimestamp - a.uploadedTimestamp;
      }
      const left = String(a.fileName || a.name || "");
      const right = String(b.fileName || b.name || "");
      return left.localeCompare(right);
    });

const buildMobizioDocumentListUrl = (caseId) =>
  `https://clece.mobizio.com${MOBIZIO_DOCUMENT_LIST_PATH}?caseId=${encodeURIComponent(caseId)}&serviceId=${encodeURIComponent(MOBIZIO_DOCUMENT_SERVICE_ID)}`;

const buildMobizioInitialAssessmentUrl = (caseId) =>
  `https://clece.mobizio.com${MOBIZIO_INITIAL_ASSESSMENT_PATH}?caseId=${encodeURIComponent(caseId)}&serviceDataGroupId=${encodeURIComponent(MOBIZIO_INITIAL_ASSESSMENT_SERVICE_DATA_GROUP_ID)}`;

const buildMobizioCarePlanDashboardUrl = (caseId) =>
  `https://clece.mobizio.com${MOBIZIO_CARE_PLAN_DASHBOARD_PATH}?caseId=${encodeURIComponent(caseId)}`;

const getMobizioAutoCollectSource = (sectionKey, caseId) => {
  if (sectionKey === "initialAssessment") {
    return {
      kind: "initialAssessment",
      label: "Initial Assessment",
      url: buildMobizioInitialAssessmentUrl(caseId),
    };
  }

  if (sectionKey === "carePlan") {
    return {
      kind: "carePlan",
      label: "Care Plans",
      url: buildMobizioCarePlanDashboardUrl(caseId),
    };
  }

  return {
    kind: "documents",
    label: "Documents",
    url: buildMobizioDocumentListUrl(caseId),
  };
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

const executeScriptInTab = async (tabId, func, args = []) => {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args,
  });
  return results?.[0]?.result;
};

const getMobizioDocumentsPageUrlInPage = (caseId, defaultServiceId) => {
  const toAbsoluteUrl = (candidate) => {
    const raw = String(candidate || "").trim();
    if (!raw || raw === "#" || raw.toLowerCase().startsWith("javascript:")) return "";
    try {
      return new URL(raw, window.location.origin).toString();
    } catch {
      return "";
    }
  };

  const navCandidates = [
    document.querySelector("#documentsCaseMenu a[href]"),
    document.querySelector('a[href*="/case_document_list"]'),
    document.querySelector('a[href*="case_document_list?caseId="]'),
  ];

  for (const candidate of navCandidates) {
    const href = candidate?.getAttribute?.("href") || "";
    const absolute = toAbsoluteUrl(href);
    if (absolute) return absolute;
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
    const candidateUrls = Array.isArray(entry.candidateUrls)
      ? entry.candidateUrls.map((url) => String(url || "").trim()).filter(Boolean)
      : [];

    if (!downloadId && candidateUrls.length === 0) {
      continue;
    }

    const dedupeKey = `${downloadId}:${fileName.toLowerCase()}:${uploadedDate.toLowerCase()}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    normalized.push({
      id: `${downloadId || "row"}-${index}`,
      rowId: String(entry.rowId || index + 1),
      downloadId,
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

const showAutoCollectPickerDialog = ({ sectionKey, documents, single }) =>
  new Promise((resolve) => {
    document.querySelector(".auto-collect-overlay")?.remove();

    const rule = getAutoCollectRule(sectionKey);
    const selectedIndexes = new Set();

    if (single && documents.length > 0) {
      const suggestedIndex = documents.findIndex((entry) => entry.sectionScore > 0);
      selectedIndexes.add(suggestedIndex >= 0 ? suggestedIndex : 0);
    }

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
          <div class="auto-collect-subtitle">Choose from the Mobizio case documents list for Case ID ${escapeHtml(getCaseIdForAutoCollect())}.</div>
          <div class="auto-collect-toolbar">
            <div class="auto-collect-helper" data-auto-collect-helper></div>
            ${single ? "" : `<div class="toolbar-actions"><button type="button" class="btn btn-secondary btn-sm" data-action="select-all">Select all</button><button type="button" class="btn btn-ghost btn-sm" data-action="clear-selection">Clear</button></div>`}
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

    const renderRows = () => {
      if (!body) return;

      if (!documents.length) {
        body.innerHTML = '<tr><td colspan="5" class="auto-collect-empty">No documents were found for this service user.</td></tr>';
        return;
      }

      body.innerHTML = documents
        .map((entry, index) => {
          const checked = selectedIndexes.has(index);
          const recommended = entry.sectionScore > 0;
          return `
            <tr class="auto-collect-row${checked ? " is-selected" : ""}${recommended ? " is-recommended" : ""}" data-row-index="${index}">
              <td><input type="${single ? "radio" : "checkbox"}" name="auto-collect-selection" data-row-index="${index}" ${checked ? "checked" : ""} /></td>
              <td>
                <div class="auto-collect-name">${escapeHtml(entry.name || "Untitled")}${recommended ? '<span class="auto-collect-badge">Suggested</span>' : ""}</div>
                ${entry.uploadedBy ? `<div class="auto-collect-meta">By ${escapeHtml(entry.uploadedBy)}</div>` : ""}
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
      if (helper) {
        helper.textContent =
          count === 0
            ? "Select at least one document."
            : single
            ? "1 document selected."
            : `${count} document${count === 1 ? "" : "s"} selected.`;
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
      documents.forEach((_entry, index) => selectedIndexes.add(index));
      body?.querySelectorAll("input[data-row-index]").forEach((input) => {
        input.checked = true;
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

    document.body.appendChild(overlay);
    window.addEventListener("keydown", handleKeydown);

    renderRows();
    updateSelectionState();
  });

const scrapeMobizioDocumentsInPage = async () => {
  const toText = (value) => String(value || "").replace(/\s+/g, " ").trim();

  const waitInPage = (ms) =>
    new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });

  const toAbsoluteUrl = (candidate) => {
    const raw = String(candidate || "").trim();
    if (!raw || raw === "#" || raw.toLowerCase().startsWith("javascript:")) return "";
    try {
      return new URL(raw, window.location.origin).toString();
    } catch {
      return "";
    }
  };

  const extractUrlsFromText = (rawValue) => {
    const text = String(rawValue || "");
    if (!text) return [];
    const matches = text.match(/https?:\/\/[^\s"'<>]+|\/[a-zA-Z0-9][a-zA-Z0-9_\-/.?=&%]*/g) || [];
    return matches
      .map((match) => toAbsoluteUrl(match))
      .filter(Boolean);
  };

  const collectUrlsFromElement = (element, accumulator) => {
    if (!element) return;

    ["href", "data-url", "data-href", "data-download-url", "data-document-url", "src"].forEach((attributeName) => {
      const value = element.getAttribute?.(attributeName);
      if (!value) return;
      const absolute = toAbsoluteUrl(value);
      if (absolute) accumulator.add(absolute);
    });

    for (const attribute of Array.from(element.attributes || [])) {
      const attrValue = String(attribute?.value || "");
      if (!attrValue) continue;
      extractUrlsFromText(attrValue).forEach((url) => accumulator.add(url));
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
    for (const selector of TABLE_SELECTORS) {
      const table = document.querySelector(selector);
      if (table) return table;
    }

    const tables = Array.from(document.querySelectorAll("table"));
    return (
      tables.find((table) => table.querySelector(".document-name, .document-filename")) ||
      tables.find((table) => hasDocumentColumns(table)) ||
      null
    );
  };

  const waitForDocumentsTable = async (timeoutMs = 18000) => {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const table = findDocumentsTable();
      if (table) {
        const rowCount = table.querySelectorAll("tbody tr").length;
        if (rowCount > 0 || document.readyState === "complete") {
          return table;
        }
      }

      await waitInPage(250);
    }

    return findDocumentsTable();
  };

  const table = await waitForDocumentsTable();
  if (!table) {
    return {
      ok: false,
      error: `Could not find the Mobizio documents table (searched #documentsTable + fallback selectors) on ${window.location.pathname || "/"}.`,
    };
  }

  const isPlaceholderRow = (row) => {
    const text = toText(row?.textContent || "").toLowerCase();
    if (!text) return true;

    return (
      text.includes("no data available") ||
      text.includes("no matching records") ||
      text.includes("no documents found") ||
      text === "-"
    );
  };

  const rawRows = Array.from(table.querySelectorAll("tbody tr"));
  if (rawRows.length === 0) {
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

    const downloadId = Array.from(downloadIds)[0] || "";

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
        extractUrlsFromText(handlerText).forEach((url) => candidateUrls.add(url));
      });

    if (downloadId) {
      [
        `/download-document_${downloadId}`,
        `/download-document/${downloadId}`,
        `/download-document?documentId=${downloadId}`,
        `/case_document_download/${downloadId}`,
        `/case_document_download?documentId=${downloadId}`,
        `/document/download/${downloadId}`,
        `/documents/download/${downloadId}`,
      ].forEach((url) => candidateUrls.add(url));
    }

    return {
      rowId,
      downloadId,
      name,
      fileName: fileName || name,
      description,
      uploadedDate,
      uploadedBy,
      candidateUrls: Array.from(candidateUrls).slice(0, 48),
    };
  });

  return { ok: true, documents };
};

const downloadMobizioDocumentInPage = async (documentEntry) => {
  const toText = (value) => String(value || "").trim();

  const toAbsoluteUrl = (candidate) => {
    const raw = String(candidate || "").trim();
    if (!raw || raw === "#" || raw.toLowerCase().startsWith("javascript:")) return "";
    try {
      return new URL(raw, window.location.origin).toString();
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

  const extractUrlsFromText = (rawValue) => {
    const text = String(rawValue || "");
    if (!text) return [];
    const matches = text.match(/https?:\/\/[^\s"'<>]+|\/[a-zA-Z0-9][a-zA-Z0-9_\-/.?=&%]*/g) || [];
    return matches
      .map((match) => toAbsoluteUrl(match))
      .filter(Boolean);
  };

  const collectUrlsFromElement = (element, accumulator) => {
    if (!element) return;

    ["href", "data-url", "data-href", "data-download-url", "data-document-url", "src"].forEach((attributeName) => {
      const value = element.getAttribute?.(attributeName);
      if (!value) return;
      const absolute = toAbsoluteUrl(value);
      if (absolute) accumulator.add(absolute);
    });

    for (const attribute of Array.from(element.attributes || [])) {
      const attrValue = String(attribute?.value || "");
      if (!attrValue) continue;
      extractUrlsFromText(attrValue).forEach((url) => accumulator.add(url));
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

  const enqueueUrlsFromText = (rawValue, enqueueUrl, { allowAny = false } = {}) => {
    extractUrlsFromText(rawValue).forEach((url) => enqueueUrl(url, { allowAny }));
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

  const enqueueUrl = (candidate, { allowAny = false } = {}) => {
    const absoluteUrl = toAbsoluteUrl(candidate);
    if (!absoluteUrl) return;
    if (!allowAny && !isLikelyDocumentUrl(absoluteUrl)) return;
    if (queued.has(absoluteUrl)) return;
    if (candidateQueue.length >= 96) return;

    queued.add(absoluteUrl);
    candidateQueue.push(absoluteUrl);
  };

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
    collectUrlsFromElement(element, discoveredCandidates);
    enqueueUrlsFromText(element.getAttribute?.("onclick"), enqueueUrl, { allowAny: true });

    const row = element.closest?.("tr");
    if (row) {
      collectUrlsFromElement(row, discoveredCandidates);
      row
        .querySelectorAll("a, [href], [src], [data-url], [data-href], [data-download-url], [data-document-url], [onclick]")
        .forEach((child) => collectUrlsFromElement(child, discoveredCandidates));
      enqueueUrlsFromText(row.getAttribute("onclick"), enqueueUrl, { allowAny: true });
      row.querySelectorAll("[onclick]").forEach((child) => {
        enqueueUrlsFromText(child.getAttribute("onclick"), enqueueUrl, { allowAny: true });
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

        const parsed = new DOMParser().parseFromString(html, "text/html");
        parsed
          .querySelectorAll("a[href], iframe[src], frame[src], embed[src], object[data], source[src]")
          .forEach((element) => {
            const value = element.getAttribute("href") || element.getAttribute("src") || element.getAttribute("data");
            enqueueUrl(value, { allowAny: true });
          });

        parsed.querySelectorAll("[onclick]").forEach((element) => {
          enqueueUrlsFromText(element.getAttribute("onclick"), enqueueUrl, { allowAny: true });
        });

        const refreshContent = parsed.querySelector('meta[http-equiv="refresh" i]')?.getAttribute("content") || "";
        const refreshMatch = refreshContent.match(/url\s*=\s*([^;]+)/i);
        if (refreshMatch?.[1]) {
          enqueueUrl(refreshMatch[1].replace(/^['"]|['"]$/g, ""), { allowAny: true });
        }

        enqueueUrlsFromText(html, enqueueUrl, { allowAny: false });
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
  const section = UPLOAD_SECTION_CONFIG.find((entry) => entry.key === sectionKey);
  if (!section) {
    showError("Unknown upload section selected for auto-collect.");
    return false;
  }

  const rule = getAutoCollectRule(sectionKey);
  const caseId = getCaseIdForAutoCollect();

  if (!caseId) {
    showError("Select a service user in Autofill settings (or enter a Case ID) before running auto-collect.");
    switchTab("autofill");
    dom.autofillUserSearch?.focus();
    return false;
  }

  let collectionTabId = null;
  if (triggerButton) {
    setButtonLoading(triggerButton, true);
  }

  try {
    const collectionSource = getMobizioAutoCollectSource(sectionKey, caseId);
    updateUploadSyncStatus(`Opening Mobizio ${collectionSource.label} for Case ID ${caseId}...`);

    const collectionTab = await chrome.tabs.create({
      url: collectionSource.url,
      active: false,
    });
    collectionTabId = collectionTab?.id;

    if (!Number.isFinite(collectionTabId)) {
      throw new Error("Could not open the Mobizio source page for auto-collect.");
    }

    await waitForTabComplete(collectionTabId);

    let scraped = await executeScriptInTab(collectionTabId, scrapeMobizioDocumentsInPage);

    if (!scraped?.ok && collectionSource.kind !== "documents") {
      const fallbackDocumentsUrl = await executeScriptInTab(
        collectionTabId,
        getMobizioDocumentsPageUrlInPage,
        [caseId, MOBIZIO_DOCUMENT_SERVICE_ID]
      );

      if (fallbackDocumentsUrl) {
        updateUploadSyncStatus("Switching to Mobizio Documents for downloadable records...");
        await chrome.tabs.update(collectionTabId, { url: fallbackDocumentsUrl });
        await waitForTabComplete(collectionTabId);
        scraped = await executeScriptInTab(collectionTabId, scrapeMobizioDocumentsInPage);
      }
    }

    if (!scraped?.ok) {
      throw new Error(scraped?.error || "Could not read documents from the Mobizio list page.");
    }

    const normalizedDocuments = normalizeScrapedDocuments(scraped.documents);
    if (normalizedDocuments.length === 0) {
      throw new Error("No downloadable documents were found for this service user.");
    }

    const rankedDocuments = rankDocumentsForSection(sectionKey, normalizedDocuments);
    const selectedDocuments = await showAutoCollectPickerDialog({
      sectionKey,
      documents: rankedDocuments,
      single: section.single || rule.single,
    });

    if (!selectedDocuments || selectedDocuments.length === 0) {
      updateUploadPendingStatus();
      showInfo(`${rule.sectionLabel} auto-collect was cancelled.`);
      return false;
    }

    const downloadedFiles = [];
    const failedDownloads = [];

    for (let index = 0; index < selectedDocuments.length; index += 1) {
      const selectedDocument = selectedDocuments[index];
      const label = selectedDocument.fileName || selectedDocument.name || `Document ${index + 1}`;
      updateUploadSyncStatus(`Downloading ${index + 1} of ${selectedDocuments.length}: ${label}`);

      const result = await executeScriptInTab(collectionTabId, downloadMobizioDocumentInPage, [selectedDocument]);
      if (!result?.ok || !result?.file?.base64Data) {
        failedDownloads.push(label);
        continue;
      }

      try {
        downloadedFiles.push(fileFromDownloadedPayload(result.file));
      } catch {
        failedDownloads.push(label);
      }
    }

    if (downloadedFiles.length === 0) {
      throw new Error("The selected documents could not be downloaded from Mobizio.");
    }

    applyUploadFiles(sectionKey, downloadedFiles);

    if (failedDownloads.length > 0) {
      showInfo(`Downloaded ${downloadedFiles.length} file${downloadedFiles.length === 1 ? "" : "s"}; ${failedDownloads.length} failed.`);
    } else {
      showSuccess(`Auto-collected ${downloadedFiles.length} ${rule.sectionLabel} document${downloadedFiles.length === 1 ? "" : "s"}.`);
    }

    const stagedCount = flattenUploadBuckets().length;
    updateUploadSyncStatus(
      `Staged ${stagedCount} file${stagedCount === 1 ? "" : "s"} after auto-collect.`,
      "success"
    );
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not auto-collect Mobizio documents.";
    updateUploadSyncStatus(message, "error");
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

  const validFiles = Array.from(files || []).filter((file) => isSupportedUploadFile(file));
  if (validFiles.length === 0) {
    showError("Use PDF, DOC, DOCX, TXT, or CSV files only.");
    return;
  }

  if (section.single) {
    if (validFiles.length > 1) {
      showInfo(`${getSectionDisplayName(sectionKey)} accepts one file. The first file was kept.`);
    }
    state.uploadBuckets[section.key] = [validFiles[0]];
  } else {
    state.uploadBuckets[section.key] = [...(state.uploadBuckets[section.key] || []), ...validFiles];
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
      if (!inputId) return;
      document.getElementById(inputId)?.click();
    });

    dropzone.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (!inputId) return;
      document.getElementById(inputId)?.click();
    });

    dropzone.addEventListener("dragenter", (event) => {
      event.preventDefault();
      dropzone.classList.add("is-dragover");
    });

    dropzone.addEventListener("dragover", (event) => {
      event.preventDefault();
      dropzone.classList.add("is-dragover");
    });

    dropzone.addEventListener("dragleave", () => {
      dropzone.classList.remove("is-dragover");
    });

    dropzone.addEventListener("drop", async (event) => {
      event.preventDefault();
      dropzone.classList.remove("is-dragover");

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
      }
    });
  });
};

const bindUploadActionButtons = () => {
  document.querySelectorAll("[data-upload-browse]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();

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
      await autoCollectDocumentsForSection(sectionKey, button);
    });
  });
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
    return context;
  } catch (error) {
    console.warn("[CA Extension Popup] Failed to refresh workspace context:", error);
    renderWorkspaceContext(null, state.connectedWorkspaceUser);
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

async function executeMainViewAction(button) {
  if (!button) return;

  const action = String(button.dataset.action || "");
  const route = String(button.dataset.route || "");

  try {
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
    const verificationFields = overrides.verificationFields || [];
    const queueState = overrides.queueState || null;
    const lastError = overrides.lastError || null;

    for (const descriptor of FORM_WORKFLOW_DESCRIPTORS) {
      if (!descriptor.urlPattern.test(tab.url)) continue;

      const current = queueState && typeof queueState.currentIndex === "number" ? queueState.currentIndex + 1 : null;
      const total = queueState && typeof queueState.total === "number" ? queueState.total : null;
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
  if (!document.hidden) {
    await refreshPageCompanion({
      payload,
      verificationFields,
      queueState,
      lastError,
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
 * Fetch ancillary data (service users, recent items) after connection is
 * already confirmed.  Safe to call multiple times — never resets connection
 * state on failure, just logs a warning.
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
  } catch (e) {
    console.warn("[CA Extension] Failed to fetch service users:", e);
  }

  try {
    const recentRes = await apiProxy("/api/extension/recent");
    if (recentRes.ok) displayRecentItems(recentRes.data);
  } catch (e) {
    console.warn("[CA Extension] Failed to fetch recent items:", e);
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

  for (const targetOrigin of [getCareAssuranceUrl(), ...CARE_ASSURANCE_URLS.filter((u) => u !== getCareAssuranceUrl())]) {
    setCareAssuranceUrl(targetOrigin);
    if (dom.connectStatus) dom.connectStatus.innerHTML = `<span>Trying ${escapeHtml(targetOrigin)}...</span>`;

    try {
      const statusRes = await apiProxy("/api/extension/status");

      if (statusRes.ok) {
        const payload = statusRes.data || statusRes;
        const user = payload.user || null;
        console.log("[CA Extension] connectToCareAssurance user:", JSON.stringify(user), "payload keys:", Object.keys(payload));
        await setStorage({ [STORAGE_KEYS.serverUrl]: targetOrigin });
        updateConnectionUI(true, user);
        await refreshWorkspaceContext(user);
        connected = true;

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
    // Don't reset connection state if already connected from a prior quick check
    if (!state.isConnected) {
      updateConnectionUI(false);
    } else {
      console.log("[CA Extension] connectToCareAssurance failed but already connected — keeping state");
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
      showSuccess(`Detected: Case ID ${caseId}, Service Data Group ${serviceDataGroupId}`);
      return { detected: true, caseId, serviceDataGroupId };
    } else if (caseId || serviceDataGroupId) {
      if (caseId && dom.caseId) dom.caseId.value = caseId;
      if (serviceDataGroupId && dom.serviceDataGroupId) dom.serviceDataGroupId.value = serviceDataGroupId;
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
// LOAD RECENT ITEM
// ═══════════════════════════════════════════════════════════════════════════

async function loadRecentItem(id, type) {
  try {
    const endpoint = type === "carePlan" ? `/api/extension/care-plan/${id}` : `/api/extension/risk-assessment/${id}`;
    const res = await apiProxy(endpoint);
    if (!res.ok) throw new Error(res.error || "Failed to load");

    await setStorageWithTimestamp({ [STORAGE_KEYS.payload]: res.data });
    showSuccess("Data loaded!");
    switchTab("autofill");
    schedulePopupRefresh({ payload: true, immediate: true });
  } catch (error) {
    showError(error.message);
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

  // Workspace context
  dom.refreshWorkspaceContext?.addEventListener("click", () => {
    schedulePopupRefresh({ workspace: true, forceWorkspace: true, immediate: true });
  });
  dom.openConnectedWorkspace?.addEventListener("click", () => focusConnectedWorkspace().catch(() => showError("Could not focus the connected CareAssurance page.")));
  dom.openDashboardWorkspace?.addEventListener("click", () => openCareAssuranceRoute("/dashboard").catch(() => showError("Could not open the CareAssurance dashboard.")));
  dom.openCarePlanningWorkspace?.addEventListener("click", () => openCareAssuranceRoute("/service-users/care-planning").catch(() => showError("Could not open Care Planning.")));
  dom.openRiskWorkspace?.addEventListener("click", () => openCareAssuranceRoute("/service-users/risk-assessment").catch(() => showError("Could not open Risk Assessment.")));
  dom.openPlanEnhancerWorkspace?.addEventListener("click", () => openCareAssuranceRoute("/service-users/plan-enhancer").catch(() => showError("Could not open Plan Enhancer.")));
  dom.openAdminWorkspace?.addEventListener("click", () => openCareAssuranceRoute("/shadow-admin-portal").catch(() => showError("Could not open the Admin Portal.")));

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
      const res = await apiProxy(`/api/extension/risk-assessment/${state.selectedUser.riskAssessmentId}`);
      if (!res.ok) throw new Error(res.error || "Failed to load risk assessment");
      await setStorageWithTimestamp({ [STORAGE_KEYS.payload]: res.data });
      showSuccess("Risk assessment loaded! Go to Autofill tab.");
      switchTab("autofill");
      schedulePopupRefresh({ payload: true, immediate: true });
    } catch (error) { showError(error.message); } finally { setButtonLoading(dom.loadRiskBtn, false); }
  });

  // Recent items
  dom.recentList?.addEventListener("click", (e) => {
    const item = e.target.closest(".recent-item[data-id]");
    if (item) loadRecentItem(item.dataset.id, item.dataset.type);
  });

  // Upload tab
  bindUploadBucketInputs();
  bindUploadDropzones();
  bindUploadActionButtons();

  dom.syncUploadBtn?.addEventListener("click", async () => {
    const ok = await syncUploadsToCareAssurance({ force: true });
    if (ok) showSuccess("Uploads sent to CareAssurance Upload");
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
    state.uploadBuckets = createEmptyUploadBuckets();
    state.selectedFilesList = [];
    state.currentAnalysisResults = null;
    lastUploadSyncSignature = "";
    if (uploadSyncTimer) {
      clearTimeout(uploadSyncTimer);
      uploadSyncTimer = null;
    }
    uploadSyncQueued = false;
    uploadSyncForceQueued = false;
    uploadSyncInFlight = false;
    renderUploadBuckets();
    if (dom.analyzeDocuments) dom.analyzeDocuments.disabled = true;
    if (dom.uploadNotes) dom.uploadNotes.value = "";
    if (dom.analysisStatus) dom.analysisStatus.textContent = "";
    updateUploadSyncStatus("Add files to stage them, then click Send to transfer.");
    await setStorage({ [STORAGE_KEYS.uploadedDocuments]: null });
  });

  dom.analyzeDocuments?.addEventListener("click", async () => {
    const selectedEntries = flattenUploadBuckets();
    if (selectedEntries.length === 0) return;

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
      state.currentAnalysisResults = result;
      displayAnalysisResults(result);
      switchTab("autofill");
    } catch (error) {
      showError(error.message);
    } finally {
      if (dom.analysisProgress) dom.analysisProgress.hidden = true;
      setButtonLoading(dom.analyzeDocuments, false);
      if (state.selectedFilesList.length === 0 && dom.analyzeDocuments) {
        dom.analyzeDocuments.disabled = true;
      }
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

    await setStorage({ [STORAGE_KEYS.verificationFields]: null });
    setButtonLoading(dom.startAutofill, true);

    await setStorage({
      [STORAGE_KEYS.caseInfo]: { caseId, serviceDataGroupId },
      [STORAGE_KEYS.autoSubmit]: dom.autoSubmit?.checked,
      [STORAGE_KEYS.dryRun]: dom.dryRun?.checked,
      [STORAGE_KEYS.interactionMode]: dom.interactionMode?.value,
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
    try { await refreshPageCompanion(); showSuccess("Page companion refreshed"); }
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

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); dom.startAutofill?.click(); return; }
    if (e.key === "Escape") {
      const dialog = document.querySelector(".dialog-overlay");
      if (dialog) { dialog.remove(); return; }
      if (dom.autofillUserDropdown && !dom.autofillUserDropdown.hidden) { dom.autofillUserDropdown.hidden = true; return; }
      const helpPanel = document.querySelector(".info-panel.visible");
      if (helpPanel) { helpPanel.classList.remove("visible"); return; }
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
    let panel = document.getElementById("help-info-panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "help-info-panel";
      panel.className = "info-panel";
      panel.innerHTML = `
        <strong>Keyboard Shortcuts</strong>
        <div style="margin-top:6px;">
          <span class="kbd">Ctrl</span>+<span class="kbd">Enter</span> Start Autofill<br>
          <span class="kbd">Esc</span> Close dialogs / dropdowns<br>
          <span class="kbd">\u2190</span> <span class="kbd">\u2192</span> Switch tabs
        </div>
        <div style="margin-top:8px;font-size:11px;opacity:0.7;">CareAssurance Extension v0.6.19</div>
      `;
      document.querySelector(".popup-content")?.prepend(panel);
    }
    panel.classList.toggle("visible");
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// STORAGE CHANGE LISTENER
// ═══════════════════════════════════════════════════════════════════════════

function bindStorageListener() {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    try {
      if (areaName !== "local" && areaName !== "session") return;

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
  await initMainMenuDragging();
  bindStorageListener();
  ensureUploadBuckets();
  renderUploadBuckets();

  // GDPR: Auto-clean stale data
  await autoCleanupStaleData();

  await refreshPayloadStatus();
  await refreshSignatureStatus();
  refreshExtensionVersionDisplay();

  const pinnedState = await loadStorage([STORAGE_KEYS.overlayPinned]);
  renderOverlayPinButton(Boolean(pinnedState?.[STORAGE_KEYS.overlayPinned]));

  // Load saved server URL
  const stored = await loadStorage([STORAGE_KEYS.serverUrl]);
  if (stored[STORAGE_KEYS.serverUrl]) {
    setCareAssuranceUrl(stored[STORAGE_KEYS.serverUrl]);
  }
  await refreshWorkspaceContext();

  // Restore last active tab and autofill user
  const { [STORAGE_KEYS.lastTab]: savedTab, [STORAGE_KEYS.lastAutofillUser]: savedUser } = await new Promise((r) =>
    chrome.storage.local.get([STORAGE_KEYS.lastTab, STORAGE_KEYS.lastAutofillUser], r)
  );
  if (savedTab) switchTab(savedTab, { persist: false });
  if (savedUser?.acpId) selectAutofillUser(savedUser);

  // Auto-detect case IDs from active tab URL
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
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
    }
  } catch { /* ignore */ }

  // Quick connection check
  if (dom.connectStatus) dom.connectStatus.innerHTML = '<span style="font-size: 11px;">Checking connection...</span>';

  try {
    const res = await apiProxy("/api/extension/status");
    console.log("[CA Extension] Quick check response:", JSON.stringify(res)?.substring(0, 400));
    // The proxy wraps server JSON as { ok, data: <serverJson> }
    // The server returns { connected, user: { id, username, role }, ... }
    const payload = res.data || res;
    const user = payload.user || null;
    if (res.ok && user) {
      console.log("[CA Extension] Quick check user:", JSON.stringify(user));
      updateConnectionUI(true, user);
      await refreshWorkspaceContext(user);
      fetchConnectedData(user); // Fetch service users + recent items (no reconnect)
      if (state.selectedFilesList.length > 0) {
        updateUploadPendingStatus();
      }
    } else if (res.ok && !user) {
      // Got a 200 OK but no user object — likely HTML response or malformed data
      console.warn("[CA Extension] Quick check OK but no user — running full connection flow");
      connectToCareAssurance();
    } else if (res.error === "Not logged in") {
      updateConnectionUI(false);
      if (dom.connectStatus) dom.connectStatus.innerHTML = '<span style="font-size: 11px;">Please log in to Care Assurance first, then click Connect</span>';
    } else if (res.needsTab) {
      updateConnectionUI(false);
      if (dom.connectStatus) dom.connectStatus.innerHTML = '<span style="font-size: 11px;">Open Care Assurance in a tab, then click Connect</span>';
    } else {
      updateConnectionUI(false);
      if (dom.connectStatus) dom.connectStatus.innerHTML = '<span style="font-size: 11px;">Click "Connect" to find server</span>';
    }
  } catch {
    updateConnectionUI(false);
    if (dom.connectStatus) dom.connectStatus.innerHTML = '<span style="font-size: 11px;">Click "Connect" to find server</span>';
  }

  // Auto-switch to autofill if payload exists
  const payloadState = await loadStorage([STORAGE_KEYS.payload]);
  if (payloadState[STORAGE_KEYS.payload]) switchTab("autofill");

  // Periodic refresh (throttled)
  setInterval(() => {
    schedulePopupRefresh({ payload: true, workspace: true });
  }, POPUP_PERIODIC_REFRESH_MS);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      schedulePopupRefresh({ payload: true, workspace: true, forceWorkspace: true, immediate: true });
    }
  });

  // GDPR periodic cleanup
  setInterval(autoCleanupStaleData, 30 * 60 * 1000);
})();
