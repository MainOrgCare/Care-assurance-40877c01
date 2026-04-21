(() => {
if (window.__CA_ACP_INITIALIZED) return;
window.__CA_ACP_INITIALIZED = true;

const FALLBACK_STORAGE_KEYS = {
  payload: "caAcpPayload",
  caseInfo: "caAcpCaseInfo",
  queueState: "caAcpQueueState",
  autoSubmit: "caAcpAutoSubmit",
  dryRun: "caAcpDryRun",
  interactionMode: "caAcpInteractionMode",
  signatureData: "caAcpSignatureData",
  signatureBatchId: "caAcpSignatureBatchId",
  overlayPinned: "caAcpOverlayPinned",
};
const FALLBACK_FORM_CONFIGS = {
  acp: { formId: "1048191" },
  emar: { formId: "1044009" },
};
const FALLBACK_MESSAGE_TYPES = {
  log: "CA_EXTENSION_LOG",
  stepComplete: "CA_EXTENSION_STEP_COMPLETE",
  uploadSignature: "CA_EXTENSION_UPLOAD_SIGNATURE",
};

const FALLBACK_STORAGE_HELPERS = {
  get: (keys) =>
    new Promise((resolve) => chrome.storage.local.get(keys, (items) => resolve(items || {}))),
  set: (items) =>
    new Promise((resolve) => chrome.storage.local.set(items, () => resolve())),
};

const { STORAGE_KEYS, FORM_CONFIGS, MESSAGE_TYPES, STORAGE_HELPERS } = window.CA_EXTENSION_CONSTANTS || {
  STORAGE_KEYS: FALLBACK_STORAGE_KEYS,
  FORM_CONFIGS: FALLBACK_FORM_CONFIGS,
  MESSAGE_TYPES: FALLBACK_MESSAGE_TYPES,
  STORAGE_HELPERS: FALLBACK_STORAGE_HELPERS,
};

const FORM_FIELD_NAMES = {
  serviceUser: "form_component_4_3",
  assessor: "form_component_5_4",
  assessmentDate: "form_component_6_5",
  reason: "form_component_25_8",
  trainingNeeds: "form_component_35_26",
};

const TRAINING_NEEDS_FALSE_PATTERNS = [
  /\bno(?:\s+additional)?\s+training\s+(?:need(?:s|ed)?|required)\b/i,
  /\bstandard\s+practi[cs]e\b/i,
  /\bstandard\s+procedure\b/i,
  /\bnormal\s+induction\b/i,
  /\broutine\s+training\b/i,
];

const TRAINING_NEEDS_TRUE_PATTERNS = [
  /\bnot\s+standard\s+practi[cs]e\b/i,
  /\badditional\s+training\b/i,
  /\bextra\s+training\b/i,
  /\bfurther\s+training\b/i,
  /\brefresher\s+training\b/i,
  /\bspecial(?:ist)?\s+training\b/i,
  /\btargeted\s+training\b/i,
  /\bbespoke\s+training\b/i,
  /\btraining\s+(?:need|needs|needed|required|requirement|gap|gaps)\b/i,
  /\bcompetenc(?:y|ies)\s+(?:gap|gaps|issue|issues)\b/i,
];

const SIGNATURE_FIELD_SELECTORS = [
  '[name="form_component_18_19"]',
  'input[type="file"][name*="signature" i]',
  'input[type="file"][id*="signature" i]',
];

const AUTO_SUBMIT_SETTLE_DELAY_MS = 6000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForSelector = async (selector, timeoutMs = 15000, intervalMs = 200) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const element = document.querySelector(selector);
    if (element) return element;
    await wait(intervalMs);
  }
  return null;
};

const logAction = (message) => {
  const timestamp = new Date().toLocaleTimeString();
  try {
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES?.log || "CA_EXTENSION_LOG",
      entry: `[${timestamp}] ${message}`,
    });
  } catch {
    // Extension context may be invalid after an extension reload.
  }
  if (typeof refreshOverlaySoon === "function") {
    refreshOverlaySoon();
  }
};

let DRY_RUN = false;
let INTERACTION_MODE = "auto";
let overlayInitialized = false;
let overlayElements = null;
let overlayCollapsed = false;
let overlayPinned = false;
const OVERLAY_STYLE_ID = "ca-autofill-overlay-styles";

const getInteractionModeLabel = (interactionMode, dryRun) => {
  if (dryRun) return "Dry run";
  if (interactionMode === "manual") return "Manual assist";
  if (interactionMode === "slow") return "Guided";
  return "Auto";
};

const getAssessmentSummary = (payload, queueState) => {
  const index = queueState && typeof queueState.currentIndex === "number" ? queueState.currentIndex : -1;
  const assessment = Array.isArray(payload?.assessments) && index >= 0 ? payload.assessments[index] : null;
  const label = assessment?.category || assessment?.title || assessment?.riskType || (index >= 0 ? `Assessment ${index + 1}` : "Awaiting assessment");
  const riskCount = Array.isArray(assessment?.risks) ? assessment.risks.length : 0;

  return {
    label,
    detail: riskCount > 0 ? `${riskCount} risk${riskCount === 1 ? "" : "s"} queued` : "Preparing workflow",
  };
};

const injectOverlayStyles = () => {
  if (document.getElementById(OVERLAY_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = OVERLAY_STYLE_ID;
  style.textContent = `
    #ca-autofill-overlay {
      position: fixed;
      top: 18px;
      right: 18px;
      z-index: 2147483647;
      font-family: "Plus Jakarta Sans", "Segoe UI", system-ui, -apple-system, sans-serif;
      color: #10233f;
      pointer-events: none;
    }

    .ca-overlay-panel {
      width: min(360px, calc(100vw - 24px));
      min-width: 280px;
      min-height: 220px;
      max-height: calc(100vh - 24px);
      position: relative;
      border-radius: 20px;
      border: 1px solid rgba(148, 163, 184, 0.28);
      background:
        radial-gradient(circle at top right, rgba(37, 99, 235, 0.16), transparent 42%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(241, 245, 249, 0.96));
      box-shadow: 0 24px 50px rgba(15, 23, 42, 0.18);
      backdrop-filter: blur(16px);
      resize: none;
      overflow: hidden;
      pointer-events: auto;
    }

    .ca-overlay-panel.is-collapsed {
      width: auto !important;
      height: auto !important;
      min-width: 168px;
      min-height: 0;
      resize: none;
      cursor: pointer;
    }

    .ca-overlay-header {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 16px 16px 14px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.16);
      cursor: default;
    }

    .ca-overlay-panel.is-collapsed .ca-overlay-header {
      padding: 12px 14px;
      border-bottom: 0;
      align-items: center;
    }

    .ca-overlay-brandmark {
      width: 40px;
      height: 40px;
      border-radius: 14px;
      background: linear-gradient(135deg, #163d77, #2f6fed);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22);
      flex-shrink: 0;
    }

    .ca-overlay-panel.is-collapsed .ca-overlay-brandmark {
      width: 32px;
      height: 32px;
      border-radius: 12px;
      font-size: 10px;
    }

    .ca-overlay-heading {
      min-width: 0;
      flex: 1;
    }

    .ca-overlay-kicker {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #50627b;
      margin-bottom: 3px;
    }

    .ca-overlay-title {
      font-size: 14px;
      font-weight: 700;
      line-height: 1.2;
      color: #10233f;
    }

    .ca-overlay-subtitle {
      margin-top: 4px;
      font-size: 12px;
      line-height: 1.45;
      color: #5b6c84;
    }

    .ca-overlay-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: auto;
    }

    .ca-overlay-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid rgba(47, 111, 237, 0.18);
      background: rgba(255, 255, 255, 0.8);
      color: #214e9f;
      font-size: 11px;
      font-weight: 700;
      line-height: 1;
      white-space: nowrap;
    }

    .ca-overlay-chip.is-warning {
      border-color: rgba(185, 89, 12, 0.25);
      color: #9a3412;
    }

    .ca-overlay-chip.is-idle {
      border-color: rgba(100, 116, 139, 0.22);
      color: #475569;
    }

    .ca-overlay-minimize {
      width: 30px;
      height: 30px;
      border: 1px solid rgba(148, 163, 184, 0.26);
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.9);
      color: #475569;
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
      padding: 0;
      box-shadow: 0 8px 16px rgba(15, 23, 42, 0.06);
    }

    .ca-overlay-lock {
      min-width: 48px;
      height: 30px;
      border: 1px solid rgba(148, 163, 184, 0.26);
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.9);
      color: #475569;
      cursor: pointer;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      line-height: 1;
      padding: 0 8px;
      box-shadow: 0 8px 16px rgba(15, 23, 42, 0.06);
    }

    .ca-overlay-lock.is-active {
      border-color: rgba(37, 99, 235, 0.4);
      background: rgba(219, 234, 254, 0.95);
      color: #1d4ed8;
    }

    .ca-overlay-body {
      padding: 0 16px 16px;
    }

    .ca-overlay-resize-handle {
      position: absolute;
      right: 8px;
      bottom: 8px;
      width: 14px;
      height: 14px;
      border-radius: 4px;
      border: 1px solid rgba(148, 163, 184, 0.4);
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(203, 213, 225, 0.9));
      cursor: nwse-resize;
      pointer-events: auto;
      touch-action: none;
      user-select: none;
      box-shadow: 0 6px 12px rgba(15, 23, 42, 0.15);
    }

    .ca-overlay-resize-handle.is-resizing {
      border-color: rgba(37, 99, 235, 0.45);
      background: linear-gradient(135deg, rgba(219, 234, 254, 0.95), rgba(147, 197, 253, 0.95));
    }

    .ca-overlay-panel.is-collapsed .ca-overlay-resize-handle {
      display: none;
    }

    .ca-overlay-panel.is-collapsed .ca-overlay-body,
    .ca-overlay-panel.is-collapsed .ca-overlay-kicker,
    .ca-overlay-panel.is-collapsed .ca-overlay-subtitle,
    .ca-overlay-panel.is-collapsed .ca-overlay-chip {
      display: none;
    }

    .ca-overlay-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 14px;
    }

    .ca-overlay-stat {
      padding: 10px 12px;
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.82);
      border: 1px solid rgba(148, 163, 184, 0.18);
      min-width: 0;
    }

    .ca-overlay-stat-label {
      display: block;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #64748b;
      margin-bottom: 5px;
    }

    .ca-overlay-stat-value {
      display: block;
      font-size: 12px;
      line-height: 1.4;
      color: #10233f;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .ca-overlay-progress {
      padding: 12px 14px;
      border-radius: 16px;
      background: rgba(15, 23, 42, 0.035);
      border: 1px solid rgba(148, 163, 184, 0.18);
      margin-bottom: 14px;
    }

    .ca-overlay-progress-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 8px;
      font-size: 12px;
      font-weight: 600;
      color: #10233f;
    }

    .ca-overlay-progress-note {
      font-size: 11px;
      color: #64748b;
    }

    .ca-overlay-progress-track {
      height: 8px;
      border-radius: 999px;
      background: rgba(148, 163, 184, 0.2);
      overflow: hidden;
    }

    .ca-overlay-progress-fill {
      height: 100%;
      width: 0%;
      border-radius: inherit;
      background: linear-gradient(90deg, #163d77, #2f6fed 55%, #4b83f2);
      transition: width 180ms ease;
    }

    .ca-overlay-logs-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: #64748b;
      margin-bottom: 8px;
    }

    .ca-overlay-logs-box {
      max-height: 108px;
      overflow: auto;
      padding: 10px 12px;
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.82);
      border: 1px solid rgba(148, 163, 184, 0.18);
      font-family: "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      font-size: 11px;
      line-height: 1.55;
      color: #475569;
      white-space: pre-line;
    }

    .ca-overlay-footer {
      margin-top: 12px;
      font-size: 11px;
      line-height: 1.5;
      color: #5b6c84;
    }

    @media (max-width: 640px) {
      #ca-autofill-overlay {
        top: auto;
        right: 12px;
        left: 12px;
        bottom: 12px;
      }

      .ca-overlay-panel {
        width: 100%;
      }

      .ca-overlay-grid {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.appendChild(style);
};

const initOverlay = () => {
  if (overlayInitialized) return;
  if (!document.body) {
    // DOM not ready — defer until body exists
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => initOverlay(), { once: true });
    }
    return;
  }
  overlayInitialized = true;
  injectOverlayStyles();

  const container = document.createElement("div");
  container.id = "ca-autofill-overlay";

  const panel = document.createElement("div");
  panel.className = "ca-overlay-panel";

  const header = document.createElement("div");
  header.className = "ca-overlay-header";

  const brandmark = document.createElement("div");
  brandmark.className = "ca-overlay-brandmark";
  brandmark.textContent = "CA";

  const heading = document.createElement("div");
  heading.className = "ca-overlay-heading";

  const kicker = document.createElement("div");
  kicker.className = "ca-overlay-kicker";
  kicker.textContent = "Care Assurance";

  const title = document.createElement("div");
  title.className = "ca-overlay-title";
  title.textContent = "Risk Assessment Autofill";

  const subtitle = document.createElement("div");
  subtitle.className = "ca-overlay-subtitle";
  subtitle.textContent = "Connecting to the current Mobizio assessment.";

  heading.appendChild(kicker);
  heading.appendChild(title);
  heading.appendChild(subtitle);

  const actions = document.createElement("div");
  actions.className = "ca-overlay-actions";

  const statusChip = document.createElement("div");
  statusChip.className = "ca-overlay-chip is-idle";
  statusChip.textContent = "Waiting";

  const minimizeButton = document.createElement("button");
  minimizeButton.type = "button";
  minimizeButton.className = "ca-overlay-minimize";
  minimizeButton.textContent = "-";
  minimizeButton.title = "Minimize";

  const lockButton = document.createElement("button");
  lockButton.type = "button";
  lockButton.className = "ca-overlay-lock";
  lockButton.textContent = "Pin";
  lockButton.title = "Pin overlay";

  actions.appendChild(statusChip);
  actions.appendChild(lockButton);
  actions.appendChild(minimizeButton);

  header.appendChild(brandmark);
  header.appendChild(heading);
  header.appendChild(actions);

  const body = document.createElement("div");
  body.className = "ca-overlay-body";

  const summaryGrid = document.createElement("div");
  summaryGrid.className = "ca-overlay-grid";

  const serviceUserStat = document.createElement("div");
  serviceUserStat.className = "ca-overlay-stat";
  const serviceUserLabel = document.createElement("span");
  serviceUserLabel.className = "ca-overlay-stat-label";
  serviceUserLabel.textContent = "Service user";
  const serviceUserValue = document.createElement("span");
  serviceUserValue.className = "ca-overlay-stat-value";
  serviceUserValue.textContent = "Awaiting payload";
  serviceUserStat.appendChild(serviceUserLabel);
  serviceUserStat.appendChild(serviceUserValue);

  const modeStat = document.createElement("div");
  modeStat.className = "ca-overlay-stat";
  const modeLabel = document.createElement("span");
  modeLabel.className = "ca-overlay-stat-label";
  modeLabel.textContent = "Mode";
  const modeValue = document.createElement("span");
  modeValue.className = "ca-overlay-stat-value";
  modeValue.textContent = "Auto";
  modeStat.appendChild(modeLabel);
  modeStat.appendChild(modeValue);

  const stepStat = document.createElement("div");
  stepStat.className = "ca-overlay-stat";
  const stepLabel = document.createElement("span");
  stepLabel.className = "ca-overlay-stat-label";
  stepLabel.textContent = "Current step";
  const stepValue = document.createElement("span");
  stepValue.className = "ca-overlay-stat-value";
  stepValue.textContent = "Waiting";
  stepStat.appendChild(stepLabel);
  stepStat.appendChild(stepValue);

  summaryGrid.appendChild(serviceUserStat);
  summaryGrid.appendChild(modeStat);
  summaryGrid.appendChild(stepStat);

  const progressCard = document.createElement("div");
  progressCard.className = "ca-overlay-progress";
  const progressMeta = document.createElement("div");
  progressMeta.className = "ca-overlay-progress-meta";
  const progress = document.createElement("div");
  progress.textContent = "Waiting for an active assessment batch";
  const progressNote = document.createElement("div");
  progressNote.className = "ca-overlay-progress-note";
  progressNote.textContent = "Preparing workflow";
  progressMeta.appendChild(progress);
  progressMeta.appendChild(progressNote);
  const progressTrack = document.createElement("div");
  progressTrack.className = "ca-overlay-progress-track";
  const progressFill = document.createElement("div");
  progressFill.className = "ca-overlay-progress-fill";
  progressTrack.appendChild(progressFill);
  progressCard.appendChild(progressMeta);
  progressCard.appendChild(progressTrack);

  const logsLabel = document.createElement("div");
  logsLabel.className = "ca-overlay-logs-label";
  logsLabel.textContent = "Recent activity";

  const logsBox = document.createElement("div");
  logsBox.className = "ca-overlay-logs-box";
  logsBox.textContent = "No actions yet.";

  const footerNote = document.createElement("div");
  footerNote.className = "ca-overlay-footer";
  footerNote.textContent = "The overlay stays synced with the Care Assurance extension batch state.";

  body.appendChild(summaryGrid);
  body.appendChild(progressCard);
  body.appendChild(logsLabel);
  body.appendChild(logsBox);
  body.appendChild(footerNote);

  const resizeHandle = document.createElement("div");
  resizeHandle.className = "ca-overlay-resize-handle";
  resizeHandle.title = "Resize panel";

  panel.appendChild(header);
  panel.appendChild(body);
  container.appendChild(panel);
  document.body.appendChild(container);

  overlayElements = {
    panel,
    header,
    body,
    title,
    subtitle,
    statusChip,
    progress,
    progressNote,
    progressFill,
    serviceUserValue,
    modeValue,
    stepValue,
    logsBox,
    footerNote,
    lockButton,
    minimizeButton,
    collapsedTitle: "CA ready",
  };

  const OVERLAY_MARGIN = 8;
  const OVERLAY_MIN_WIDTH = 280;
  const OVERLAY_MIN_HEIGHT = 220;

  const clampOverlayPosition = (left, top) => {
    const rect = panel.getBoundingClientRect();
    const maxLeft = Math.max(OVERLAY_MARGIN, window.innerWidth - rect.width - OVERLAY_MARGIN);
    const maxTop = Math.max(OVERLAY_MARGIN, window.innerHeight - rect.height - OVERLAY_MARGIN);
    return {
      left: Math.min(Math.max(OVERLAY_MARGIN, left), maxLeft),
      top: Math.min(Math.max(OVERLAY_MARGIN, top), maxTop),
    };
  };

  const setOverlayPosition = (left, top) => {
    const next = clampOverlayPosition(left, top);
    container.style.left = `${next.left}px`;
    container.style.top = `${next.top}px`;
    container.style.right = "auto";
    container.style.bottom = "auto";
  };

  const getOverlaySizeBounds = () => {
    const rect = container.getBoundingClientRect();
    return {
      maxWidth: Math.max(OVERLAY_MIN_WIDTH, window.innerWidth - rect.left - OVERLAY_MARGIN),
      maxHeight: Math.max(OVERLAY_MIN_HEIGHT, window.innerHeight - rect.top - OVERLAY_MARGIN),
    };
  };

  const setPanelSize = (width, height) => {
    const { maxWidth, maxHeight } = getOverlaySizeBounds();
    const nextWidth = Math.min(Math.max(OVERLAY_MIN_WIDTH, width), maxWidth);
    const nextHeight = Math.min(Math.max(OVERLAY_MIN_HEIGHT, height), maxHeight);

    panel.style.width = `${Math.round(nextWidth)}px`;
    panel.style.height = `${Math.round(nextHeight)}px`;
  };

  const keepOverlayInViewport = () => {
    if (!overlayCollapsed) {
      const panelRect = panel.getBoundingClientRect();
      const { maxWidth, maxHeight } = getOverlaySizeBounds();
      if (panelRect.width > maxWidth + 0.5 || panelRect.height > maxHeight + 0.5) {
        setPanelSize(panelRect.width, panelRect.height);
      }
    }

    const containerRect = container.getBoundingClientRect();
    const next = clampOverlayPosition(containerRect.left, containerRect.top);
    if (Math.abs(next.left - containerRect.left) > 0.5 || Math.abs(next.top - containerRect.top) > 0.5) {
      setOverlayPosition(next.left, next.top);
    }
  };

  let dragState = null;
  let resizeState = null;
  let activePointerId = null;
  let activePointerCaptureElement = null;

  const capturePointer = (element, event) => {
    if (!(element instanceof Element)) return;
    if (!Number.isFinite(event.pointerId)) return;
    if (typeof element.setPointerCapture !== "function") return;

    try {
      element.setPointerCapture(event.pointerId);
      activePointerId = event.pointerId;
      activePointerCaptureElement = element;
    } catch {
      activePointerId = null;
      activePointerCaptureElement = null;
    }
  };

  const releaseCapturedPointer = () => {
    if (
      activePointerCaptureElement &&
      Number.isFinite(activePointerId) &&
      typeof activePointerCaptureElement.releasePointerCapture === "function"
    ) {
      try {
        if (typeof activePointerCaptureElement.hasPointerCapture !== "function" || activePointerCaptureElement.hasPointerCapture(activePointerId)) {
          activePointerCaptureElement.releasePointerCapture(activePointerId);
        }
      } catch {
        // Ignore release errors from stale pointer captures.
      }
    }

    activePointerId = null;
    activePointerCaptureElement = null;
  };

  const isTrackedPointerEvent = (event) => !Number.isFinite(activePointerId) || !Number.isFinite(event.pointerId) || event.pointerId === activePointerId;

  const stopPointerInteraction = () => {
    dragState = null;
    resizeState = null;
    releaseCapturedPointer();
    header.classList.remove("is-dragging");
    resizeHandle.classList.remove("is-resizing");
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", handleDragMove);
    window.removeEventListener("pointermove", handleResizeMove);
    window.removeEventListener("pointerup", stopPointerInteraction);
    window.removeEventListener("pointercancel", stopPointerInteraction);
  };

  const isPrimaryPointer = (event) => {
    if (!event.isPrimary) return false;
    if (event.pointerType === "mouse" && event.button !== 0) return false;
    return true;
  };

  function handleDragMove(event) {
    if (!dragState || !isTrackedPointerEvent(event)) return;
    event.preventDefault();
    const nextLeft = dragState.originLeft + (event.clientX - dragState.startX);
    const nextTop = dragState.originTop + (event.clientY - dragState.startY);
    setOverlayPosition(nextLeft, nextTop);
  }

  function handleResizeMove(event) {
    if (!resizeState || overlayCollapsed || !isTrackedPointerEvent(event)) return;
    event.preventDefault();
    const nextWidth = resizeState.originWidth + (event.clientX - resizeState.startX);
    const nextHeight = resizeState.originHeight + (event.clientY - resizeState.startY);
    setPanelSize(nextWidth, nextHeight);
    keepOverlayInViewport();
  }

  // Drag and resize interactions are intentionally disabled.

  window.addEventListener("resize", keepOverlayInViewport);

  if (typeof ResizeObserver === "function") {
    const overlayResizeObserver = new ResizeObserver(() => keepOverlayInViewport());
    overlayResizeObserver.observe(panel);
  }

  keepOverlayInViewport();

  const setOverlayPinned = async (pinned, { persist = true } = {}) => {
    overlayPinned = Boolean(pinned);
    if (!overlayElements) return;

    if (overlayElements.lockButton) {
      overlayElements.lockButton.textContent = overlayPinned ? "Pinned" : "Pin";
      overlayElements.lockButton.title = overlayPinned ? "Unpin overlay" : "Pin overlay";
      overlayElements.lockButton.classList.toggle("is-active", overlayPinned);
    }

    if (overlayPinned && overlayCollapsed) {
      setOverlayCollapsed(false);
    }

    if (persist) {
      await saveStorage({ [STORAGE_KEYS.overlayPinned]: overlayPinned });
    }
  };

  loadStorage([STORAGE_KEYS.overlayPinned])
    .then((stored) => {
      setOverlayPinned(Boolean(stored?.[STORAGE_KEYS.overlayPinned]), { persist: false });
    })
    .catch(() => {});

  minimizeButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (overlayPinned) {
      return;
    }
    setOverlayCollapsed(!overlayCollapsed);
  });

  lockButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setOverlayPinned(!overlayPinned).catch(() => {});
  });
};

let overlayRefreshTimer = null;
let overlayIntervalId = null;
let overlayVisibilityListenerBound = false;
const OVERLAY_REFRESH_INTERVAL_MS = 9000;
const refreshOverlaySoon = () => {
  if (!overlayInitialized) return;
  if (overlayCollapsed) return;
  if (overlayRefreshTimer) return;
  overlayRefreshTimer = setTimeout(() => {
    overlayRefreshTimer = null;
    refreshOverlay();
  }, 150);
};

const refreshOverlay = async () => {
  if (!overlayInitialized || !overlayElements) return;
  const {
    caAcpQueueState,
    caAcpLogs,
    caAcpPayload,
    caAcpDryRun,
    caAcpInteractionMode,
    caAcpLastError,
  } = await loadStorage([
    STORAGE_KEYS.queueState,
    STORAGE_KEYS.logs,
    STORAGE_KEYS.payload,
    STORAGE_KEYS.dryRun,
    STORAGE_KEYS.interactionMode,
    STORAGE_KEYS.lastError,
  ]);

  const hasActiveQueue = caAcpQueueState && typeof caAcpQueueState.currentIndex === "number";
  const current = hasActiveQueue ? caAcpQueueState.currentIndex + 1 : 0;
  const total = hasActiveQueue ? Number(caAcpQueueState.total || 0) : 0;
  const progressPercent = total > 0 ? Math.max(0, Math.min(100, Math.round((current / total) * 100))) : 0;
  const serviceUserLabel =
    caAcpPayload?.serviceUserDisplayName ||
    caAcpPayload?.serviceUserInitials ||
    caAcpPayload?.serviceUserName ||
    "Awaiting payload";
  const assessmentSummary = getAssessmentSummary(caAcpPayload, caAcpQueueState);
  const modeLabel = getInteractionModeLabel(caAcpInteractionMode, Boolean(caAcpDryRun));

  overlayElements.serviceUserValue.textContent = serviceUserLabel;
  overlayElements.modeValue.textContent = modeLabel;
  overlayElements.stepValue.textContent = hasActiveQueue && total > 0 ? `${current} of ${total}` : "Waiting";
  overlayElements.subtitle.textContent = assessmentSummary.label;
  overlayElements.progress.textContent = hasActiveQueue && total > 0
    ? `Assessment ${current} of ${total}`
    : "Waiting for an active assessment batch";
  overlayElements.progressNote.textContent = caAcpLastError ? String(caAcpLastError) : assessmentSummary.detail;
  overlayElements.progressFill.style.width = `${progressPercent}%`;

  if (caAcpLastError) {
    overlayElements.statusChip.textContent = "Attention";
    overlayElements.statusChip.classList.add("is-warning");
    overlayElements.statusChip.classList.remove("is-idle");
    overlayElements.footerNote.textContent = "Care Assurance needs attention before the next assessment can continue.";
  } else if (hasActiveQueue) {
    overlayElements.statusChip.textContent = "Live sync";
    overlayElements.statusChip.classList.remove("is-warning", "is-idle");
    overlayElements.footerNote.textContent = `${modeLabel} mode is active on the current Mobizio risk assessment form.`;
  } else if (caAcpPayload) {
    overlayElements.statusChip.textContent = "Ready";
    overlayElements.statusChip.classList.remove("is-warning");
    overlayElements.statusChip.classList.add("is-idle");
    overlayElements.footerNote.textContent = "Payload detected. Open the matching assessment to continue autofill.";
  } else {
    overlayElements.statusChip.textContent = "Waiting";
    overlayElements.statusChip.classList.remove("is-warning");
    overlayElements.statusChip.classList.add("is-idle");
    overlayElements.footerNote.textContent = "Send a Care Assurance risk assessment to start the workflow on this page.";
  }

  const logs = Array.isArray(caAcpLogs) ? caAcpLogs : [];
  overlayElements.logsBox.textContent = logs.length === 0 ? "No actions yet." : logs.slice(-6).join("\n");
  overlayElements.collapsedTitle = hasActiveQueue && total > 0 ? `CA ${current}/${total}` : caAcpPayload ? "CA ready" : "CA idle";
  if (overlayCollapsed) {
    overlayElements.title.textContent = overlayElements.collapsedTitle;
  }
};

const setOverlayCollapsed = (collapsed) => {
  if (collapsed && overlayPinned) {
    return;
  }
  overlayCollapsed = collapsed;
  if (!overlayElements) return;
  if (collapsed) {
    overlayElements.panel.classList.add("is-collapsed");
    overlayElements.title.textContent = overlayElements.collapsedTitle || "CA ready";
    overlayElements.minimizeButton.textContent = "+";
    overlayElements.minimizeButton.title = "Expand";
    overlayElements.header.onclick = (e) => {
      if (e.target === overlayElements.minimizeButton) return;
      setOverlayCollapsed(false);
    };
  } else {
    overlayElements.panel.classList.remove("is-collapsed");
    overlayElements.title.textContent = "Risk Assessment Autofill";
    overlayElements.minimizeButton.textContent = "\u2013";
    overlayElements.minimizeButton.title = "Minimize";
    overlayElements.header.onclick = null;
    refreshOverlay();
  }
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "CA_EXTENSION_REQUEST_STATUS") {
    sendResponse({ detected: true, refreshRequired: false, workflow: "acp" });
    return false;
  }
  if (message?.type !== (MESSAGE_TYPES?.toggleOverlay || "CA_EXTENSION_TOGGLE_OVERLAY")) return false;
  initOverlay();

  if (typeof message?.payload?.pin === "boolean") {
    overlayPinned = Boolean(message.payload.pin);
    if (overlayElements?.lockButton) {
      overlayElements.lockButton.textContent = overlayPinned ? "Pinned" : "Pin";
      overlayElements.lockButton.title = overlayPinned ? "Unpin overlay" : "Pin overlay";
      overlayElements.lockButton.classList.toggle("is-active", overlayPinned);
    }
    if (overlayPinned && overlayCollapsed) {
      setOverlayCollapsed(false);
    }
    saveStorage({ [STORAGE_KEYS.overlayPinned]: overlayPinned }).catch(() => {});
  }

  if (message?.payload?.open) {
    setOverlayCollapsed(false);
  } else if (message?.payload?.minimize) {
    if (!overlayPinned) {
      setOverlayCollapsed(true);
    }
  } else {
    if (!overlayPinned) {
      setOverlayCollapsed(!overlayCollapsed);
    }
  }
  sendResponse?.({ ok: true });
  return true;
});

const getLabelTextForInput = (input) => {
  if (!input) return "";
  const labels = [];
  const ariaLabel = input.getAttribute("aria-label");
  if (ariaLabel) labels.push(ariaLabel);

  const ariaLabelledBy = input.getAttribute("aria-labelledby");
  if (ariaLabelledBy) {
    ariaLabelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id))
      .filter(Boolean)
      .forEach((el) => labels.push(el.textContent || ""));
  }

  const inputId = input.getAttribute("id");
  if (inputId) {
    const safeId = window.CSS && typeof window.CSS.escape === "function" ? window.CSS.escape(inputId) : inputId;
    const byFor = document.querySelector(`label[for="${safeId}"]`);
    if (byFor) labels.push(byFor.textContent || "");
  }

  const wrappedLabel = input.closest("label");
  if (wrappedLabel) labels.push(wrappedLabel.textContent || "");

  const container = input.closest("div");
  if (container) {
    const nearbyLabel = container.querySelector("label");
    if (nearbyLabel) labels.push(nearbyLabel.textContent || "");
  }

  const prev = input.previousElementSibling;
  if (prev && prev.tagName === "LABEL") labels.push(prev.textContent || "");

  return labels.join(" ").replace(/\s+/g, " ").trim();
};

const findSignatureField = () => {
  for (const selector of SIGNATURE_FIELD_SELECTORS) {
    const field = document.querySelector(selector);
    if (field && field.type === "file") return field;
  }

  const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
  if (fileInputs.length === 1) return fileInputs[0];

  const signatureRegex = /signature/i;
  const named = fileInputs.find((input) => signatureRegex.test(input.name || ""));
  if (named) return named;

  for (const input of fileInputs) {
    const labelText = getLabelTextForInput(input);
    if (labelText && signatureRegex.test(labelText)) return input;
  }

  return null;
};

const waitForSignatureField = async (timeoutMs = 15000, intervalMs = 250) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const field = findSignatureField();
    if (field) return field;
    await wait(intervalMs);
  }
  return null;
};

const highlightField = (field) => {
  if (!field) return;
  field.style.outline = "2px solid #1ea97a";
  field.style.outlineOffset = "2px";
};
const setNativeFieldValue = (field, value) => {
  if (!field) return;
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field) || {}, "value");
  if (descriptor?.set) {
    descriptor.set.call(field, value);
    return;
  }
  field.value = value;
};
const dispatchInputEvent = (field, data = null) => {
  if (typeof InputEvent === "function") {
    field.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      data,
      inputType: data == null ? "insertReplacementText" : "insertText",
    }));
    return;
  }
  field.dispatchEvent(new Event("input", { bubbles: true }));
};
const dispatchCommitEvents = (field) => {
  field.dispatchEvent(new Event("change", { bubbles: true }));
  field.dispatchEvent(new Event("blur", { bubbles: true }));
};
const buildProcessedKey = (queueState) => {
  const batchId = queueState?.batchId || "legacy";
  const currentIndex = typeof queueState?.currentIndex === "number" ? queueState.currentIndex : "single";
  return `caAutofillProcessed_${batchId}_${currentIndex}`;
};

const typeLikeHuman = async (field, value) => {
  if (!field) return false;
  field.focus();
  setNativeFieldValue(field, "");
  dispatchInputEvent(field, null);
  for (const char of String(value)) {
    setNativeFieldValue(field, `${field.value}${char}`);
    dispatchInputEvent(field, char);
    await wait(25 + Math.random() * 30);
  }
  dispatchCommitEvents(field);
  return true;
};

const setValue = async (fieldName, value) => {
  const field = document.querySelector(`[name="${fieldName}"]`);
  if (!value) return false;
  if (!field) return false;
  return setFieldValue(field, value, fieldName);
};

const setFieldValue = async (field, value, fieldLabel = "field") => {
  if (!field || !value) return false;
  if (DRY_RUN) {
    highlightField(field);
    logAction(`Dry run: would set ${fieldLabel}.`);
    return true;
  }
  if (INTERACTION_MODE === "manual") {
    highlightField(field);
    logAction(`Manual assist: please fill ${fieldLabel}.`);
    return true;
  }
  if (INTERACTION_MODE === "slow") {
    await typeLikeHuman(field, value);
    return true;
  }
  setNativeFieldValue(field, String(value));
  dispatchInputEvent(field, null);
  dispatchCommitEvents(field);
  return true;
};

const setMultiSelect = async (fieldName, values) => {
  const field = document.querySelector(`[name="${fieldName}"]`);
  if (!values || values.length === 0) return false;
  if (!field || field.tagName !== "SELECT") return false;
  return setFieldMultiSelect(field, values, fieldName);
};

const setFieldMultiSelect = async (field, values, fieldLabel = "field") => {
  if (!field || field.tagName !== "SELECT" || !values || values.length === 0) return false;
  if (DRY_RUN) {
    highlightField(field);
    logAction(`Dry run: would select ${values.length} options for ${fieldLabel}.`);
    return true;
  }
  if (INTERACTION_MODE === "manual") {
    highlightField(field);
    logAction(`Manual assist: please select options for ${fieldLabel}.`);
    return true;
  }
  const normalizedValues = values.map((value) => value.trim().toLowerCase());
  if (!field.multiple) {
    const option = Array.from(field.options).find((candidate) => {
      const optionValue = (candidate.value || "").trim().toLowerCase();
      const optionLabel = (candidate.textContent || "").trim().toLowerCase();
      return normalizedValues.includes(optionValue) || normalizedValues.includes(optionLabel);
    });
    if (!option) return false;
    field.value = option.value;
    field.dispatchEvent(new Event("change", { bubbles: true }));
    field.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }
  let matched = 0;
  Array.from(field.options).forEach((option) => {
    const optionValue = (option.value || "").trim().toLowerCase();
    const optionLabel = (option.textContent || "").trim().toLowerCase();
    const shouldSelect = normalizedValues.includes(optionValue) || normalizedValues.includes(optionLabel);
    option.selected = shouldSelect;
    if (shouldSelect) matched += 1;
  });
  field.dispatchEvent(new Event("change", { bubbles: true }));
  field.dispatchEvent(new Event("input", { bubbles: true }));
  return matched > 0;
};

const normalizeText = (value) => String(value || "").toLowerCase().replace(/\s+/g, " ").trim();

const TOP_LEVEL_FIELD_PATTERNS = {
  serviceUser: [/\bservice user\b/i, /\bclient name\b/i, /\bperson supported\b/i],
  assessor: [/\bassessor\b/i, /\bcompleted by\b/i, /\bassessed by\b/i, /\bstaff member\b/i],
  assessmentDate: [/\bassessment date\b/i, /\bdate of assessment\b/i],
  reason: [/\breason(?: for assessment)?\b/i, /\bpurpose of assessment\b/i],
  trainingNeeds: [/\btraining needs?\b/i, /\badditional training\b/i],
};

const RISK_FIELD_PATTERNS = {
  identified: [/\bidentified\b/i, /\brisk identified\b/i, /\brisk description\b/i, /\bwhat(?:'s| is)? the risk\b/i, /\bhazard\b/i],
  harmed: [/\bwho.*harm(?:ed)?\b/i, /\bwho.*affected\b/i, /\bperson.*harm\b/i, /\bwho may be harmed\b/i, /\bat risk\b/i],
  define: [/\bhow.*risk\b/i, /\bwhy.*risk\b/i, /\bdetails of risk\b/i, /\bdefine.*risk\b/i, /\bnature of risk\b/i],
  rating: [/\binitial.*rating\b/i, /\brisk rating\b/i, /\blevel of risk\b/i, /^rating$/i, /\bscore\b/i],
  control: [/\bcontrol measures?\b/i, /\bcontrols? in place\b/i, /\bmitigation\b/i, /\bactions? to reduce\b/i, /\breduce risk\b/i],
  residual: [/\bafter controls\b/i, /\bresidual\b/i, /\bremaining.*rating\b/i, /\brating after\b/i, /\bpost[- ]control\b/i],
  signed: [/\bsigned\b/i, /\bassessor\b/i, /\bcompleted by\b/i, /\bstaff member\b/i],
};

const getStaticCellText = (field) => {
  const cell = field?.closest("td, th");
  if (!cell) return "";
  const clone = cell.cloneNode(true);
  clone.querySelectorAll("input, textarea, select, button").forEach((element) => element.remove());
  return clone.textContent || "";
};

const getHeaderTextForField = (table, row, field) => {
  if (!table || !row || !field) return "";
  const cell = field.closest("td, th");
  if (!cell) return "";
  const cells = Array.from(row.children).filter((child) => child.matches("td, th"));
  const cellIndex = cells.findIndex((child) => child === cell || child.contains(field));
  if (cellIndex < 0) return "";

  const headerRows = Array.from(table.querySelectorAll("thead tr"));
  for (let index = headerRows.length - 1; index >= 0; index -= 1) {
    const headers = Array.from(headerRows[index].children).filter((child) => child.matches("th, td"));
    if (headers[cellIndex]) {
      return headers[cellIndex].textContent || "";
    }
  }

  return "";
};

const getFieldContextText = (field, table) => {
  const row = field?.closest("tr");
  return normalizeText([
    getLabelTextForInput(field),
    field?.getAttribute("placeholder") || "",
    field?.name || "",
    field?.id || "",
    getStaticCellText(field),
    getHeaderTextForField(table, row, field),
  ].join(" "));
};

const findBestFieldMatch = (fields, patterns, table) => {
  const scored = fields
    .map((field) => {
      const text = getFieldContextText(field, table);
      const score = patterns.reduce((total, pattern) => total + (pattern.test(text) ? 1 : 0), 0);
      return { field, score };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);

  return scored[0]?.field || null;
};

const getInteractiveRiskFields = (row) =>
  Array.from(row.querySelectorAll('textarea, select, input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"])'))
    .filter((field) => !field.disabled);

const scoreRiskTable = (table) => {
  if (!table) return 0;

  let score = table.id === "Table_9_9_Table" ? 50 : 0;
  const headerText = normalizeText(table.querySelector("thead")?.textContent || table.caption?.textContent || "");
  if (headerText.includes("risk")) score += 8;
  if (headerText.includes("control")) score += 3;
  if (headerText.includes("rating")) score += 3;
  if (headerText.includes("harm")) score += 2;

  const rowScores = Array.from(table.querySelectorAll("tbody tr"))
    .slice(0, 4)
    .map((row) => {
      const fields = getInteractiveRiskFields(row);
      const textareas = fields.filter((field) => field.tagName === "TEXTAREA").length;
      const selects = fields.filter((field) => field.tagName === "SELECT").length;
      const inputs = fields.filter((field) => field.tagName === "INPUT").length;

      let rowScore = 0;
      if (fields.length >= 5) rowScore += 5;
      if (textareas >= 2) rowScore += 4;
      if (selects >= 2) rowScore += 3;
      if (inputs >= 1) rowScore += 1;
      return rowScore;
    });

  return score + Math.max(0, ...rowScores);
};

const findRiskTable = () => {
  const tables = Array.from(document.querySelectorAll("table"));
  const ranked = tables
    .map((table) => ({ table, score: scoreRiskTable(table) }))
    .sort((left, right) => right.score - left.score);

  return ranked[0] && ranked[0].score >= 8 ? ranked[0].table : null;
};

const waitForRiskTable = async (timeoutMs = 15000, intervalMs = 200) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const table = findRiskTable();
    if (table) return table;
    await wait(intervalMs);
  }
  return null;
};

const getRiskRows = (table = findRiskTable()) =>
  table
    ? Array.from(table.querySelectorAll("tbody tr")).filter((row) => getInteractiveRiskFields(row).length >= 3)
    : [];

const findRiskAddButton = (table) => {
  if (!table) return null;
  const tableId = table.id || "";
  const baseId = tableId.replace(/_Table$/, "");
  if (baseId) {
    const directMatch = document.querySelector(`a#${baseId}, button#${baseId}, input[type="button"]#${baseId}`);
    if (directMatch) return directMatch;
  }

  const roots = [table.parentElement, table.parentElement?.parentElement, table.closest("form"), document].filter(Boolean);
  const seen = new Set();
  for (const root of roots) {
    if (!root || seen.has(root)) continue;
    seen.add(root);
    const buttons = Array.from(root.querySelectorAll('a, button, input[type="button"], input[type="submit"]'));
    const match = buttons.find((button) => {
      if (table.contains(button)) return false;
      const text = normalizeText(button.textContent || button.value || "");
      return /\badd\b/.test(text) && (root !== document || text.includes("risk"));
    });
    if (match) return match;
  }

  return null;
};

const addRiskRows = async (count, table = findRiskTable()) => {
  if (count <= 0) return;
  const addButton = findRiskAddButton(table);
  if (!addButton) return;

  for (let i = 0; i < count; i += 1) {
    if (DRY_RUN) {
      highlightField(addButton);
      logAction("Dry run: would add risk row.");
      return;
    }
    if (INTERACTION_MODE === "manual") {
      highlightField(addButton);
      logAction("Manual assist: please add a risk row.");
      return;
    }
    addButton.click();
    await wait(250);
  }
};

const parseWhoHarmed = (value) => {
  if (!value) return [];
  const lower = value.toLowerCase();
  const results = new Set();
  const tokens = lower.split(/[,/;]+/).map((token) => token.trim());
  tokens.forEach((token) => {
    if (token.includes("service user")) results.add("Service User");
    if (token.includes("care worker") || token.includes("carer")) results.add("Care Worker");
    if (token.includes("family") || token.includes("friend")) results.add("Family / Friend ");
    if (token.includes("health")) results.add("Health Care Professionals");
  });
  if (lower.includes("service user")) results.add("Service User");
  if (lower.includes("care worker") || lower.includes("carer")) results.add("Care Worker");
  if (lower.includes("family") || lower.includes("friend")) results.add("Family / Friend ");
  if (lower.includes("health")) results.add("Health Care Professionals");
  return Array.from(results);
};

const findRiskFormField = (riskTable, { name, labelPatterns = [], tagNames = ["input", "textarea", "select"] } = {}) => {
  if (name) {
    const direct = document.querySelector(`[name="${name}"]`);
    if (direct && (!riskTable || !riskTable.contains(direct))) return direct;
  }

  if (!labelPatterns.length) return null;

  const candidates = Array.from(document.querySelectorAll(tagNames.join(",")))
    .filter((field) => !riskTable || !riskTable.contains(field));
  return findBestFieldMatch(candidates, labelPatterns, null);
};

const mapRiskRowFields = (row, table) => {
  const fields = getInteractiveRiskFields(row);
  const textareas = fields.filter((field) => field.tagName === "TEXTAREA");
  const selects = fields.filter((field) => field.tagName === "SELECT");
  const textInputs = fields.filter((field) => field.tagName === "INPUT");

  const harmedField =
    findBestFieldMatch(selects, RISK_FIELD_PATTERNS.harmed, table) ||
    selects.find((field) => field.multiple || Number(field.size || 0) > 1) ||
    null;

  const remainingSelects = selects.filter((field) => field !== harmedField);
  const residualField = findBestFieldMatch(remainingSelects, RISK_FIELD_PATTERNS.residual, table);
  const ratingField =
    findBestFieldMatch(remainingSelects.filter((field) => field !== residualField), RISK_FIELD_PATTERNS.rating, table) ||
    remainingSelects.find((field) => field !== residualField) ||
    null;
  const fallbackResidualField = remainingSelects.find((field) => field !== ratingField) || residualField || null;

  const identifiedField = findBestFieldMatch(textareas, RISK_FIELD_PATTERNS.identified, table) || textareas[0] || null;
  const defineField =
    findBestFieldMatch(textareas.filter((field) => field !== identifiedField), RISK_FIELD_PATTERNS.define, table) ||
    textareas.find((field) => field !== identifiedField) ||
    null;
  const controlField =
    findBestFieldMatch(textareas.filter((field) => field !== identifiedField && field !== defineField), RISK_FIELD_PATTERNS.control, table) ||
    textareas.find((field) => field !== identifiedField && field !== defineField) ||
    null;
  const signedField = findBestFieldMatch(textInputs, RISK_FIELD_PATTERNS.signed, table) || textInputs[0] || null;

  return {
    identifiedField,
    harmedField,
    defineField,
    ratingField,
    controlField,
    residualField: residualField || fallbackResidualField,
    signedField,
  };
};

const setSelectFieldByLabel = (field, label, fieldLabel = "field") => {
  if (!label || !field || field.tagName !== "SELECT") return false;
  if (DRY_RUN) {
    highlightField(field);
    logAction(`Dry run: would select ${label} for ${fieldLabel}.`);
    return true;
  }
  if (INTERACTION_MODE === "manual") {
    highlightField(field);
    logAction(`Manual assist: please select ${label} for ${fieldLabel}.`);
    return true;
  }
  const target = label.trim().toLowerCase();
  const option = Array.from(field.options).find((candidate) =>
    (candidate.textContent || "").trim().toLowerCase() === target
  );
  if (!option) return false;
  field.value = option.value;
  field.dispatchEvent(new Event("change", { bubbles: true }));
  field.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
};

const setSelectByLabel = (fieldName, label) => {
  const field = document.querySelector(`[name="${fieldName}"]`);
  return setSelectFieldByLabel(field, label, fieldName);
};

const normalizeRiskRowText = (value) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");

const FIRST_PERSON_RISK_PATTERNS = [
  /\bi\s+(?:am|have|need|can|will|experience|use|require|feel|struggle|find|may|get|was|had|could|must)\b/i,
  /\bmy\s+(?:carer|care\s*team|medication|condition|health|mobility|home|plan|risk|need|routine|ability|independence|safety)\b/i,
  /\bi(?:'m|'ve|'ll|'d)\s/i,
  /\bme\s+(?:to|when|with|by|for|at|from|if)\b/i,
];
const THIRD_PERSON_RISK_PATTERNS = [
  /^\s*the\s+(?:service\s+user|client|resident|patient)\b/i,
  /^\s*(?:he|she|they)\s+(?:is|are|was|were|has|have|needs?|requires?)\b/i,
  /^\s*(?:client|service\s+user|resident)\s+(?:needs?|requires?|has|is|was|struggles?)\b/i,
];

const isPersonCentredRiskRow = (risk) => {
  const narrativeFields = [risk?.riskDefinition, risk?.howItsARisk, risk?.controlMeasures]
    .map((v) => normalizeRiskRowText(v))
    .filter((v) => v.length >= 12);
  if (narrativeFields.length === 0) return true;
  const hasFirstPerson = FIRST_PERSON_RISK_PATTERNS.some((p) =>
    narrativeFields.some((text) => p.test(text))
  );
  if (hasFirstPerson) return true;
  // Without first-person markers, check if the definition field is clearly third-person
  const definitionText = normalizeRiskRowText(risk?.riskDefinition);
  return !THIRD_PERSON_RISK_PATTERNS.some((p) => p.test(definitionText));
};

const buildRiskRowSignature = (risk) =>
  [
    normalizeRiskRowText(risk?.riskDefinition).toLowerCase(),
    normalizeRiskRowText(risk?.howItsARisk).toLowerCase(),
    normalizeRiskRowText(risk?.whoWillBeHarmed).toLowerCase(),
    normalizeRiskRowText(risk?.controlMeasures).toLowerCase(),
    normalizeRiskRowText(risk?.initialRating).toLowerCase(),
    normalizeRiskRowText(risk?.ratingAfterControls).toLowerCase(),
  ].join("||");

const normalizeAssessmentRisks = (assessment) => {
  if (!Array.isArray(assessment?.risks)) return [];
  const seen = new Set();
  const normalizedRows = assessment.risks
    .map((risk) => ({
      ...risk,
      riskDefinition: normalizeRiskRowText(risk?.riskDefinition),
      howItsARisk: normalizeRiskRowText(risk?.howItsARisk),
      whoWillBeHarmed: normalizeRiskRowText(risk?.whoWillBeHarmed),
      controlMeasures: normalizeRiskRowText(risk?.controlMeasures),
      initialRating: normalizeRiskRowText(risk?.initialRating),
      ratingAfterControls: normalizeRiskRowText(risk?.ratingAfterControls),
    }))
    .filter((risk) => risk.riskDefinition || risk.howItsARisk || risk.controlMeasures)
    .filter((risk) => {
      const signature = buildRiskRowSignature(risk);
      if (!signature || seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
  // Soft filter: prefer person-centred rows, fall back to all rows if none qualify
  const personCentred = normalizedRows.filter(isPersonCentredRiskRow);
  return personCentred.length > 0 ? personCentred : normalizedRows;
};

const buildSignedLabel = (assessment) => {
  if (!assessment) return "";
  const name = (assessment.signedBy || "").trim();
  const title = (assessment.jobTitle || "").trim();
  if (name && title) return `${name} (${title})`;
  return name || title;
};

const normalizeTrainingNeedsDecision = (value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  if (["yes", "true", "required", "needed"].includes(normalized)) {
    return true;
  }

  if (["no", "false", "none", "n/a", "na"].includes(normalized)) {
    return false;
  }

  if (TRAINING_NEEDS_FALSE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }

  if (TRAINING_NEEDS_TRUE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  return null;
};

const getTrainingNeedsSelectLabel = (assessment) => {
  if (!assessment || typeof assessment !== "object") {
    return "No";
  }

  const explicitCandidates = [
    assessment.trainingNeeds,
    assessment.trainingNeed,
    assessment.trainingRequirement,
    assessment.trainingRequirements,
    assessment.requiresTraining,
    assessment.additionalTrainingRequired,
    assessment.isStandardPractice,
  ];

  for (const candidate of explicitCandidates) {
    const normalized = normalizeTrainingNeedsDecision(candidate);
    if (normalized !== null) {
      return normalized ? "Yes" : "No";
    }
  }

  const evidenceTexts = [
    assessment.additionalNotes,
    ...(Array.isArray(assessment.supportingEvidence) ? assessment.supportingEvidence : []),
    ...(Array.isArray(assessment.risks)
      ? assessment.risks.flatMap((risk) => [risk?.riskDefinition, risk?.howItsARisk, risk?.controlMeasures])
      : []),
  ]
    .filter((value) => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);

  for (const text of evidenceTexts) {
    if (TRAINING_NEEDS_FALSE_PATTERNS.some((pattern) => pattern.test(text))) {
      return "No";
    }
    if (TRAINING_NEEDS_TRUE_PATTERNS.some((pattern) => pattern.test(text))) {
      return "Yes";
    }
  }

  return "No";
};

const clickSubmit = () => {
  const buttons = Array.from(document.querySelectorAll("button, input[type=submit]"));
  const submitButton = buttons.find((button) => {
    if (button.tagName === "INPUT") {
      return button.value && button.value.toLowerCase().includes("submit");
    }
    const text = button.textContent || "";
    return text.toLowerCase().includes("submit");
  });
  if (submitButton) {
    if (DRY_RUN) {
      highlightField(submitButton);
      logAction("Dry run: would submit form.");
      return true;
    }
    if (INTERACTION_MODE === "manual") {
      highlightField(submitButton);
      logAction("Manual assist: please submit the form when ready.");
      return true;
    }
    submitButton.click();
    return true;
  }
  return false;
};

const attachManualSubmitListener = (onComplete) => {
  const submitButton = document.getElementById("btnSave") ||
    Array.from(document.querySelectorAll("button, input[type=submit]")).find((button) => {
      if (button.tagName === "INPUT") {
        return button.value && button.value.toLowerCase().includes("submit");
      }
      const text = button.textContent || "";
      return text.toLowerCase().includes("submit");
    });

  if (!submitButton) return false;
  if (DRY_RUN) {
    highlightField(submitButton);
    logAction("Dry run: waiting for manual submit.");
    return true;
  }
  if (INTERACTION_MODE === "manual") {
    highlightField(submitButton);
    logAction("Manual assist: waiting for submit click.");
  }
  submitButton.addEventListener("click", () => onComplete(), { once: true });
  return true;
};

const fillRiskAssessment = async (assessment, serviceUserLabel) => {
  const riskTable = findRiskTable();
  if (!riskTable) {
    logAction("Risk form layout could not be detected automatically.");
    return false;
  }
  const normalizedRisks = normalizeAssessmentRisks(assessment);
  if (!normalizedRisks.length) {
    logAction("Assessment has no usable risk rows. Autofill stopped.");
    return false;
  }

  const serviceUserField = findRiskFormField(riskTable, {
    name: FORM_FIELD_NAMES.serviceUser,
    labelPatterns: TOP_LEVEL_FIELD_PATTERNS.serviceUser,
    tagNames: ["input", "textarea"],
  });
  const assessorField = findRiskFormField(riskTable, {
    name: FORM_FIELD_NAMES.assessor,
    labelPatterns: TOP_LEVEL_FIELD_PATTERNS.assessor,
    tagNames: ["input", "textarea"],
  });
  const assessmentDateField = findRiskFormField(riskTable, {
    name: FORM_FIELD_NAMES.assessmentDate,
    labelPatterns: TOP_LEVEL_FIELD_PATTERNS.assessmentDate,
    tagNames: ["input"],
  });
  const reasonField = findRiskFormField(riskTable, {
    name: FORM_FIELD_NAMES.reason,
    labelPatterns: TOP_LEVEL_FIELD_PATTERNS.reason,
    tagNames: ["input", "textarea"],
  });
  const trainingNeedsField = findRiskFormField(riskTable, {
    name: FORM_FIELD_NAMES.trainingNeeds,
    labelPatterns: TOP_LEVEL_FIELD_PATTERNS.trainingNeeds,
    tagNames: ["select"],
  });

  await setFieldValue(serviceUserField, serviceUserLabel, "service user");
  await setFieldValue(assessorField, buildSignedLabel(assessment), "assessor");
  await setFieldValue(assessmentDateField, assessment.assessmentDate || "", "assessment date");
  await setFieldValue(reasonField, assessment.category || "", "reason");
  setSelectByLabel("form_component_40_2", "Yes");
  setSelectByLabel("form_component_19_20", "No");
  setSelectFieldByLabel(trainingNeedsField, getTrainingNeedsSelectLabel(assessment));

  await wait(500);

  const rowsNeeded = normalizedRisks.length;
  const existingRows = getRiskRows(riskTable).length;
  if (rowsNeeded > existingRows) {
    await addRiskRows(rowsNeeded - existingRows, riskTable);
    await wait(500);
  }

  const resolvedRiskTable = findRiskTable() || riskTable;
  const rows = getRiskRows(resolvedRiskTable);
  if (!rows.length) {
    logAction("Risk rows could not be detected automatically.");
    return false;
  }

  for (let index = 0; index < normalizedRisks.length; index += 1) {
    const risk = normalizedRisks[index];
    const row = rows[index];
    if (!row) return false;

    const {
      identifiedField,
      harmedField,
      defineField,
      ratingField,
      controlField,
      residualField,
      signedField,
    } = mapRiskRowFields(row, resolvedRiskTable);

    if (identifiedField) await setFieldValue(identifiedField, risk.riskDefinition, "identified risk");
    if (defineField) await setFieldValue(defineField, risk.howItsARisk, "risk detail");
    if (controlField) await setFieldValue(controlField, risk.controlMeasures, "control measures");
    if (ratingField) await setSelectFieldByLabel(ratingField, risk.initialRating);
    if (residualField) await setSelectFieldByLabel(residualField, risk.ratingAfterControls);
    if (signedField) {
      await setFieldValue(signedField, buildSignedLabel(assessment), "signed by");
    }
    if (harmedField) {
      const harmedValues = parseWhoHarmed(risk.whoWillBeHarmed);
      await setFieldMultiSelect(harmedField, harmedValues, "who will be harmed");
    }
  }

  return true;
};

const loadStorage = (keys) => STORAGE_HELPERS.get(keys);
const saveStorage = (items) => STORAGE_HELPERS.set(items);

const notifyStepComplete = (queueState = null) =>
  chrome.runtime.sendMessage({
    type: MESSAGE_TYPES?.stepComplete || "CA_EXTENSION_STEP_COMPLETE",
    currentIndex: Number.isInteger(queueState?.currentIndex) ? Number(queueState.currentIndex) : undefined,
    batchId: queueState?.batchId ? String(queueState.batchId) : undefined,
  });

const isRiskFormPage = () => Boolean(findRiskTable());

const uploadSignature = async () => {
  const signatureField = await waitForSignatureField();
  if (!signatureField || signatureField.type !== "file") {
    logAction("Signature field not found. Please upload manually.");
    return false;
  }

  if (DRY_RUN) {
    highlightField(signatureField);
    logAction("Dry run: would upload signature.");
    return true;
  }

  const { caAcpSignatureData, caAcpSignatureBatchId, caAcpQueueState } = await loadStorage([
    STORAGE_KEYS.signatureData,
    STORAGE_KEYS.signatureBatchId,
    STORAGE_KEYS.queueState,
  ]);
  if (!caAcpSignatureData || !caAcpSignatureData.dataUrl) {
    logAction("Signature missing: upload it in the extension popup.");
    return false;
  }
  if (caAcpSignatureBatchId && caAcpQueueState?.batchId && caAcpSignatureBatchId !== caAcpQueueState.batchId) {
    logAction("Signature not set for this batch: upload it in the extension popup.");
    return false;
  }

  try {
    const response = await fetch(caAcpSignatureData.dataUrl);
    const blob = await response.blob();
    const file = new File([blob], caAcpSignatureData.fileName || "signature.jpg", {
      type: caAcpSignatureData.mimeType || blob.type || "image/jpeg",
    });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    signatureField.files = dataTransfer.files;
    signatureField.dispatchEvent(new Event("change", { bubbles: true }));
    await wait(300);
    if (signatureField.files && signatureField.files.length > 0) {
      logAction(`Signature selected: ${signatureField.files[0].name}`);
      return true;
    }
    logAction("Signature upload attempted but file input is empty.");
    return false;
  } catch (error) {
    console.warn("Signature upload failed", error);
    logAction("Signature upload failed.");
    return false;
  }
};

const uploadSignatureFromDataUrl = async (dataUrl, fileName, mimeType) => {
  const signatureField = await waitForSignatureField();
  if (!signatureField || signatureField.type !== "file") {
    logAction("Signature field not found. Please upload manually.");
    return false;
  }

  try {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const file = new File([blob], fileName || "signature.jpg", {
      type: mimeType || blob.type || "image/jpeg",
    });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    signatureField.files = dataTransfer.files;
    signatureField.dispatchEvent(new Event("change", { bubbles: true }));
    await wait(300);
    if (signatureField.files && signatureField.files.length > 0) {
      logAction(`Manual signature selected: ${signatureField.files[0].name}`);
      return true;
    }
    logAction("Manual signature upload attempted but file input is empty.");
    return false;
  } catch (error) {
    console.warn("Manual signature upload failed", error);
    logAction("Manual signature upload failed.");
    return false;
  }
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== (MESSAGE_TYPES?.uploadSignature || "CA_EXTENSION_UPLOAD_SIGNATURE")) return false;
  const payload = message.payload || {};
  uploadSignatureFromDataUrl(payload.dataUrl, payload.fileName, payload.mimeType)
    .then((ok) => sendResponse({ ok }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

const isAutofillTargetPage = () => {
  if (!window.location.pathname.includes("new_case_form")) return false;
  const params = new URLSearchParams(window.location.search);
  const formId = params.get("formId");
  const acpFormId = FORM_CONFIGS?.acp?.formId || "1048191";
  return formId === acpFormId;
};

const run = async () => {
  if (!isAutofillTargetPage()) return;
  initOverlay();
  refreshOverlay();
  if (!overlayIntervalId) {
    overlayIntervalId = setInterval(() => {
      if (document.hidden || overlayCollapsed) return;
      refreshOverlay();
    }, OVERLAY_REFRESH_INTERVAL_MS);
  }

  if (!overlayVisibilityListenerBound) {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        refreshOverlaySoon();
      }
    });
    overlayVisibilityListenerBound = true;
  }

  const { caAcpPayload, caAcpQueueState, caAcpAutoSubmit, caAcpDryRun, caAcpInteractionMode } = await loadStorage([
    STORAGE_KEYS.payload,
    STORAGE_KEYS.queueState,
    STORAGE_KEYS.autoSubmit,
    STORAGE_KEYS.dryRun,
    STORAGE_KEYS.interactionMode,
  ]);

  if (!caAcpPayload || caAcpPayload.formType === "emar") return;
  if (!Array.isArray(caAcpPayload.assessments)) return;
  if (!caAcpQueueState || typeof caAcpQueueState.currentIndex !== "number") return;

  const processedKey = buildProcessedKey(caAcpQueueState);
  if (sessionStorage.getItem(processedKey)) return;

  const formReady = await waitForRiskTable();
  if (!formReady || !isRiskFormPage()) {
    logAction("Risk form table not found. Autofill skipped.");
    return;
  }

  const assessment = caAcpPayload.assessments[caAcpQueueState.currentIndex];
  if (!assessment) return;
  if (!Array.isArray(assessment.risks)) {
    logAction("Assessment has no risks array. Skipping autofill.");
    return;
  }

  sessionStorage.setItem(processedKey, "1");

  try {
    DRY_RUN = Boolean(caAcpDryRun);
    INTERACTION_MODE = caAcpInteractionMode || "auto";
    if (DRY_RUN) {
      logAction("Dry run enabled. No fields will be changed.");
    }

    await wait(1000);

    const serviceUserLabel =
      caAcpPayload.serviceUserDisplayName || caAcpPayload.serviceUserInitials || "Service User";

    const didFillAssessment = await fillRiskAssessment(assessment, serviceUserLabel);
    if (!didFillAssessment) {
      logAction("Risk assessment fields could not be mapped on this page. Autofill stopped.");
      sessionStorage.removeItem(processedKey);
      return;
    }

    await uploadSignature();
    await wait(1000);

    const advanceOrFinish = () => {
      if (caAcpQueueState.currentIndex + 1 < caAcpQueueState.total) {
        logAction(`Assessment ${caAcpQueueState.currentIndex + 1}/${caAcpQueueState.total} complete. Advancing to next.`);
        notifyStepComplete(caAcpQueueState);
      } else {
        logAction(`All ${caAcpQueueState.total} assessment(s) complete.`);
        saveStorage({
          [STORAGE_KEYS.queueState]: null,
          [STORAGE_KEYS.payload]: null,
          [STORAGE_KEYS.caseInfo]: null,
          [STORAGE_KEYS.signatureData]: null,
          [STORAGE_KEYS.signatureBatchId]: null,
        });
      }
    };

    const shouldAutoSubmit = caAcpAutoSubmit !== false;
    if (shouldAutoSubmit) {
      const submitted = clickSubmit();
      if (!submitted) {
        logAction("Submit button not found. Please submit manually.");
        attachManualSubmitListener(advanceOrFinish);
        return;
      }
      logAction(`Submitted. Waiting ${Math.round(AUTO_SUBMIT_SETTLE_DELAY_MS / 1000)}s before loading the next assessment...`);
      // After auto-submit, wait for the page to process then advance.
      await wait(AUTO_SUBMIT_SETTLE_DELAY_MS);
      advanceOrFinish();
      return;
    }

    attachManualSubmitListener(advanceOrFinish);
  } catch (error) {
    sessionStorage.removeItem(processedKey);
    logAction(`ACP autofill failed: ${error?.message || "Unknown error"}`);
  }
};

run();
})();
