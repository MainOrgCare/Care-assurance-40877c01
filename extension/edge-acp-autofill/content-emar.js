(() => {
if (window.__CA_EMAR_INITIALIZED) return;
window.__CA_EMAR_INITIALIZED = true;

const FALLBACK_STORAGE_KEYS = {
  payload: "caAcpPayload",
  caseInfo: "caAcpCaseInfo",
  queueState: "caAcpQueueState",
  autoSubmit: "caAcpAutoSubmit",
  dryRun: "caAcpDryRun",
  interactionMode: "caAcpInteractionMode",
  overlayPinned: "caAcpOverlayPinned",
};
const FALLBACK_FORM_CONFIGS = {
  emar: { formId: "1044009" },
};
const FALLBACK_MESSAGE_TYPES = {
  log: "CA_EXTENSION_LOG",
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

const loadStorage = (keys) => STORAGE_HELPERS.get(keys);
const saveStorage = (items) => STORAGE_HELPERS.set(items);

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
let overlayCollapsed = false;
let overlayPinned = false;
let overlayElements = null;
let overlayRefreshTimer = null;
let overlayIntervalId = null;
let overlayVisibilityListenerBound = false;
const OVERLAY_REFRESH_INTERVAL_MS = 9000;

const OVERLAY_STYLE_ID = "ca-emar-overlay-styles";

const getInteractionModeLabel = () => {
  if (DRY_RUN) return "Dry run";
  if (INTERACTION_MODE === "manual") return "Manual assist";
  if (INTERACTION_MODE === "slow") return "Guided";
  return "Auto";
};

const injectOverlayStyles = () => {
  if (document.getElementById(OVERLAY_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = OVERLAY_STYLE_ID;
  style.textContent = `
    #ca-emar-overlay {
      position: fixed;
      top: 18px;
      right: 18px;
      z-index: 2147483647;
      font-family: "Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif;
      pointer-events: none;
      color: #10233f;
    }
    .ca-emar-panel {
      width: min(360px, calc(100vw - 24px));
      min-width: 280px;
      min-height: 220px;
      max-height: calc(100vh - 24px);
      position: relative;
      border-radius: 20px;
      border: 1px solid rgba(148, 163, 184, 0.26);
      background: radial-gradient(circle at top right, rgba(20, 184, 166, 0.14), transparent 40%), linear-gradient(180deg, rgba(255,255,255,0.98), rgba(240,249,255,0.96));
      box-shadow: 0 24px 50px rgba(15, 23, 42, 0.16);
      backdrop-filter: blur(14px);
      resize: none;
      overflow: hidden;
      pointer-events: auto;
    }
    .ca-emar-panel.is-collapsed {
      width: auto !important;
      height: auto !important;
      min-width: 172px;
      min-height: 0;
      resize: none;
      cursor: pointer;
    }
    .ca-emar-header {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      padding: 16px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.16);
      cursor: grab;
      user-select: none;
      touch-action: none;
    }
    .ca-emar-header.is-dragging {
      cursor: grabbing;
    }
    .ca-emar-panel.is-collapsed .ca-emar-header {
      align-items: center;
      border-bottom: 0;
      padding: 12px 14px;
    }
    .ca-emar-mark {
      width: 40px;
      height: 40px;
      border-radius: 14px;
      background: linear-gradient(135deg, #0f766e, #155e75);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      flex-shrink: 0;
    }
    .ca-emar-panel.is-collapsed .ca-emar-mark {
      width: 32px;
      height: 32px;
      border-radius: 12px;
      font-size: 10px;
    }
    .ca-emar-heading { min-width: 0; flex: 1; }
    .ca-emar-kicker { font-size: 10px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #5b6c84; margin-bottom: 3px; }
    .ca-emar-title { font-size: 14px; font-weight: 700; color: #10233f; line-height: 1.2; }
    .ca-emar-subtitle { margin-top: 4px; font-size: 12px; line-height: 1.45; color: #5b6c84; }
    .ca-emar-actions { display: flex; gap: 8px; margin-left: auto; align-items: center; }
    .ca-emar-chip { display: inline-flex; align-items: center; padding: 6px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; border: 1px solid rgba(20,184,166,0.18); background: rgba(255,255,255,0.82); color: #0f766e; }
    .ca-emar-chip.is-warning { border-color: rgba(185,89,12,0.25); color: #9a3412; }
    .ca-emar-chip.is-idle { border-color: rgba(148,163,184,0.22); color: #475569; }
    .ca-emar-toggle { width: 30px; height: 30px; border-radius: 10px; border: 1px solid rgba(148,163,184,0.26); background: rgba(255,255,255,0.9); color: #475569; cursor: pointer; font-size: 16px; line-height: 1; padding: 0; }
    .ca-emar-lock { min-width: 48px; height: 30px; border-radius: 10px; border: 1px solid rgba(148,163,184,0.26); background: rgba(255,255,255,0.9); color: #475569; cursor: pointer; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; line-height: 1; padding: 0 8px; }
    .ca-emar-lock.is-active { border-color: rgba(2,132,199,0.42); background: rgba(224,242,254,0.95); color: #0369a1; }
    .ca-emar-body { padding: 0 16px 16px; }
    .ca-emar-resize-handle {
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
      box-shadow: 0 6px 12px rgba(15, 23, 42, 0.15);
    }
    .ca-emar-resize-handle.is-resizing {
      border-color: rgba(2, 132, 199, 0.5);
      background: linear-gradient(135deg, rgba(224, 242, 254, 0.95), rgba(125, 211, 252, 0.95));
    }
    .ca-emar-panel.is-collapsed .ca-emar-resize-handle { display: none; }
    .ca-emar-panel.is-collapsed .ca-emar-body, .ca-emar-panel.is-collapsed .ca-emar-kicker, .ca-emar-panel.is-collapsed .ca-emar-subtitle, .ca-emar-panel.is-collapsed .ca-emar-chip { display: none; }
    .ca-emar-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
    .ca-emar-stat { padding: 10px 12px; border-radius: 14px; background: rgba(255,255,255,0.82); border: 1px solid rgba(148,163,184,0.16); }
    .ca-emar-stat-label { display: block; font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #64748b; margin-bottom: 5px; }
    .ca-emar-stat-value { display: block; font-size: 12px; line-height: 1.45; font-weight: 600; color: #10233f; word-break: break-word; }
    .ca-emar-progress { padding: 12px 14px; border-radius: 16px; background: rgba(15,23,42,0.035); border: 1px solid rgba(148,163,184,0.16); margin-bottom: 14px; }
    .ca-emar-progress-meta { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 8px; font-size: 12px; font-weight: 600; color: #10233f; }
    .ca-emar-progress-note { font-size: 11px; color: #64748b; }
    .ca-emar-track { height: 8px; border-radius: 999px; background: rgba(148,163,184,0.22); overflow: hidden; }
    .ca-emar-fill { height: 100%; width: 0%; border-radius: inherit; background: linear-gradient(90deg, #0f766e, #0284c7); transition: width 180ms ease; }
    .ca-emar-logs-label { font-size: 10px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #64748b; margin-bottom: 8px; }
    .ca-emar-logs { max-height: 108px; overflow: auto; padding: 10px 12px; border-radius: 14px; background: rgba(255,255,255,0.82); border: 1px solid rgba(148,163,184,0.16); font-family: "SFMono-Regular", Menlo, monospace; font-size: 11px; line-height: 1.55; color: #475569; white-space: pre-line; }
    .ca-emar-footer { margin-top: 12px; font-size: 11px; line-height: 1.5; color: #5b6c84; }
    @media (max-width: 640px) {
      #ca-emar-overlay { top: auto; right: 12px; left: 12px; bottom: 12px; }
      .ca-emar-panel { width: 100%; }
      .ca-emar-grid { grid-template-columns: 1fr; }
    }
  `;
  document.head.appendChild(style);
};

const initOverlay = () => {
  if (overlayInitialized) return;
  if (!document.body) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => initOverlay(), { once: true });
    }
    return;
  }
  overlayInitialized = true;
  injectOverlayStyles();

  const container = document.createElement("div");
  container.id = "ca-emar-overlay";
  const panel = document.createElement("div");
  panel.className = "ca-emar-panel";

  const header = document.createElement("div");
  header.className = "ca-emar-header";
  const mark = document.createElement("div");
  mark.className = "ca-emar-mark";
  mark.textContent = "CA";

  const heading = document.createElement("div");
  heading.className = "ca-emar-heading";
  const kicker = document.createElement("div");
  kicker.className = "ca-emar-kicker";
  kicker.textContent = "Care Assurance";
  const title = document.createElement("div");
  title.className = "ca-emar-title";
  title.textContent = "EMAR Audit Runtime";
  const subtitle = document.createElement("div");
  subtitle.className = "ca-emar-subtitle";
  subtitle.textContent = "Attach an EMAR audit payload to activate this page companion.";
  heading.appendChild(kicker);
  heading.appendChild(title);
  heading.appendChild(subtitle);

  const actions = document.createElement("div");
  actions.className = "ca-emar-actions";
  const chip = document.createElement("div");
  chip.className = "ca-emar-chip is-idle";
  chip.textContent = "Waiting";
  const lock = document.createElement("button");
  lock.type = "button";
  lock.className = "ca-emar-lock";
  lock.textContent = "Pin";
  lock.title = "Pin overlay";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "ca-emar-toggle";
  toggle.textContent = "-";
  toggle.title = "Minimize";
  actions.appendChild(chip);
  actions.appendChild(lock);
  actions.appendChild(toggle);

  header.appendChild(mark);
  header.appendChild(heading);
  header.appendChild(actions);

  const body = document.createElement("div");
  body.className = "ca-emar-body";
  const grid = document.createElement("div");
  grid.className = "ca-emar-grid";
  const buildStat = (label, value) => {
    const stat = document.createElement("div");
    stat.className = "ca-emar-stat";
    const statLabel = document.createElement("span");
    statLabel.className = "ca-emar-stat-label";
    statLabel.textContent = label;
    const statValue = document.createElement("span");
    statValue.className = "ca-emar-stat-value";
    statValue.textContent = value;
    stat.appendChild(statLabel);
    stat.appendChild(statValue);
    return { stat, statValue };
  };
  const serviceUser = buildStat("Service user", "Awaiting payload");
  const mode = buildStat("Mode", "Auto");
  const period = buildStat("Audit period", "Not set");
  grid.appendChild(serviceUser.stat);
  grid.appendChild(mode.stat);
  grid.appendChild(period.stat);

  const progressCard = document.createElement("div");
  progressCard.className = "ca-emar-progress";
  const progressMeta = document.createElement("div");
  progressMeta.className = "ca-emar-progress-meta";
  const progress = document.createElement("div");
  progress.textContent = "Waiting for EMAR audit data";
  const progressNote = document.createElement("div");
  progressNote.className = "ca-emar-progress-note";
  progressNote.textContent = "No audit payload attached yet";
  progressMeta.appendChild(progress);
  progressMeta.appendChild(progressNote);
  const track = document.createElement("div");
  track.className = "ca-emar-track";
  const fill = document.createElement("div");
  fill.className = "ca-emar-fill";
  track.appendChild(fill);
  progressCard.appendChild(progressMeta);
  progressCard.appendChild(track);

  const logsLabel = document.createElement("div");
  logsLabel.className = "ca-emar-logs-label";
  logsLabel.textContent = "Recent activity";
  const logs = document.createElement("div");
  logs.className = "ca-emar-logs";
  logs.textContent = "No actions yet.";
  const footer = document.createElement("div");
  footer.className = "ca-emar-footer";
  footer.textContent = "The EMAR workflow now stays visible as part of the same CareAssurance runtime.";

  body.appendChild(grid);
  body.appendChild(progressCard);
  body.appendChild(logsLabel);
  body.appendChild(logs);
  body.appendChild(footer);

  const resizeHandle = document.createElement("div");
  resizeHandle.className = "ca-emar-resize-handle";
  resizeHandle.title = "Resize panel";

  panel.appendChild(header);
  panel.appendChild(body);
  panel.appendChild(resizeHandle);
  container.appendChild(panel);
  document.body.appendChild(container);

  overlayElements = {
    panel,
    header,
    title,
    subtitle,
    chip,
    lock,
    toggle,
    progress,
    progressNote,
    fill,
    logs,
    footer,
    serviceUserValue: serviceUser.statValue,
    modeValue: mode.statValue,
    periodValue: period.statValue,
    resizeHandle,
    collapsedTitle: "EMAR ready",
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

  const stopPointerInteraction = () => {
    dragState = null;
    resizeState = null;
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
    if (!dragState) return;
    event.preventDefault();
    const nextLeft = dragState.originLeft + (event.clientX - dragState.startX);
    const nextTop = dragState.originTop + (event.clientY - dragState.startY);
    setOverlayPosition(nextLeft, nextTop);
  }

  function handleResizeMove(event) {
    if (!resizeState || overlayCollapsed) return;
    event.preventDefault();
    const nextWidth = resizeState.originWidth + (event.clientX - resizeState.startX);
    const nextHeight = resizeState.originHeight + (event.clientY - resizeState.startY);
    setPanelSize(nextWidth, nextHeight);
    keepOverlayInViewport();
  }

  header.addEventListener("pointerdown", (event) => {
    if (!isPrimaryPointer(event)) return;
    const target = event.target;
    if (target instanceof Element && target.closest("button")) return;

    stopPointerInteraction();

    const rect = container.getBoundingClientRect();
    dragState = {
      startX: event.clientX,
      startY: event.clientY,
      originLeft: rect.left,
      originTop: rect.top,
    };

    document.body.style.userSelect = "none";
    header.classList.add("is-dragging");
    event.preventDefault();
    window.addEventListener("pointermove", handleDragMove);
    window.addEventListener("pointerup", stopPointerInteraction);
    window.addEventListener("pointercancel", stopPointerInteraction);
  });

  resizeHandle.addEventListener("pointerdown", (event) => {
    if (!isPrimaryPointer(event) || overlayCollapsed) return;

    stopPointerInteraction();
    const panelRect = panel.getBoundingClientRect();
    resizeState = {
      startX: event.clientX,
      startY: event.clientY,
      originWidth: panelRect.width,
      originHeight: panelRect.height,
    };

    document.body.style.userSelect = "none";
    resizeHandle.classList.add("is-resizing");
    event.preventDefault();
    event.stopPropagation();
    window.addEventListener("pointermove", handleResizeMove);
    window.addEventListener("pointerup", stopPointerInteraction);
    window.addEventListener("pointercancel", stopPointerInteraction);
  });

  window.addEventListener("resize", keepOverlayInViewport);

  if (typeof ResizeObserver === "function") {
    const overlayResizeObserver = new ResizeObserver(() => keepOverlayInViewport());
    overlayResizeObserver.observe(panel);
  }

  keepOverlayInViewport();

  const setOverlayPinned = async (pinned, { persist = true } = {}) => {
    overlayPinned = Boolean(pinned);
    if (!overlayElements) return;

    overlayElements.lock.textContent = overlayPinned ? "Pinned" : "Pin";
    overlayElements.lock.title = overlayPinned ? "Unpin overlay" : "Pin overlay";
    overlayElements.lock.classList.toggle("is-active", overlayPinned);

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

  toggle.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (overlayPinned) {
      return;
    }
    setOverlayCollapsed(!overlayCollapsed);
  });

  lock.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setOverlayPinned(!overlayPinned).catch(() => {});
  });
};

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
    caAcpPayload,
    caAcpQueueState,
    caAcpLogs,
    caAcpLastError,
    caAcpDryRun,
    caAcpInteractionMode,
  } = await loadStorage([
    STORAGE_KEYS.payload,
    STORAGE_KEYS.queueState,
    STORAGE_KEYS.logs,
    STORAGE_KEYS.lastError,
    STORAGE_KEYS.dryRun,
    STORAGE_KEYS.interactionMode,
  ]);

  const current = caAcpQueueState && typeof caAcpQueueState.currentIndex === "number" ? caAcpQueueState.currentIndex + 1 : 0;
  const total = caAcpQueueState && typeof caAcpQueueState.total === "number" ? caAcpQueueState.total : 0;
  const percent = total > 0 ? Math.max(0, Math.min(100, Math.round((current / total) * 100))) : (caAcpPayload?.formType === "emar" ? 100 : 0);
  const periodText = caAcpPayload?.auditPeriodStart && caAcpPayload?.auditPeriodEnd
    ? `${caAcpPayload.auditPeriodStart} → ${caAcpPayload.auditPeriodEnd}`
    : caAcpPayload?.auditDate || "Not set";

  DRY_RUN = Boolean(caAcpDryRun);
  INTERACTION_MODE = caAcpInteractionMode || INTERACTION_MODE || "auto";

  overlayElements.serviceUserValue.textContent = caAcpPayload?.serviceUserName || "Awaiting payload";
  overlayElements.modeValue.textContent = getInteractionModeLabel();
  overlayElements.periodValue.textContent = periodText;
  overlayElements.subtitle.textContent = caAcpPayload?.purposeOfAudit || "Medication audit workflow";
  overlayElements.progress.textContent = total > 0
    ? `Workflow ${current} of ${total}`
    : caAcpPayload?.formType === "emar"
    ? "EMAR audit payload attached"
    : "Waiting for EMAR audit data";
  overlayElements.progressNote.textContent = caAcpLastError
    ? String(caAcpLastError)
    : caAcpPayload?.themesAndTrends || caAcpPayload?.furtherActions || "Attach an EMAR payload to review audit findings here.";
  overlayElements.fill.style.width = `${percent}%`;

  if (caAcpLastError) {
    overlayElements.chip.textContent = "Attention";
    overlayElements.chip.classList.add("is-warning");
    overlayElements.chip.classList.remove("is-idle");
    overlayElements.footer.textContent = "Resolve the EMAR workflow issue in CareAssurance before continuing on this page.";
  } else if (caAcpPayload?.formType === "emar") {
    overlayElements.chip.textContent = "Live sync";
    overlayElements.chip.classList.remove("is-warning", "is-idle");
    overlayElements.footer.textContent = `${getInteractionModeLabel()} mode is active for the current EMAR audit page.`;
  } else {
    overlayElements.chip.textContent = "Waiting";
    overlayElements.chip.classList.remove("is-warning");
    overlayElements.chip.classList.add("is-idle");
    overlayElements.footer.textContent = "Open an EMAR audit from CareAssurance to attach this runtime surface.";
  }

  const logs = Array.isArray(caAcpLogs) ? caAcpLogs : [];
  overlayElements.logs.textContent = logs.length ? logs.slice(-6).join("\n") : "No actions yet.";
  overlayElements.collapsedTitle = caAcpPayload?.formType === "emar" ? "EMAR live" : "EMAR ready";
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
    overlayElements.title.textContent = overlayElements.collapsedTitle || "EMAR live";
    overlayElements.toggle.textContent = "+";
    overlayElements.toggle.title = "Expand";
    overlayElements.header.onclick = (event) => {
      if (event.target === overlayElements.toggle) return;
      setOverlayCollapsed(false);
    };
  } else {
    overlayElements.panel.classList.remove("is-collapsed");
    overlayElements.title.textContent = "EMAR Audit Runtime";
    overlayElements.toggle.textContent = "-";
    overlayElements.toggle.title = "Minimize";
    overlayElements.header.onclick = null;
    refreshOverlay();
  }
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== (MESSAGE_TYPES?.toggleOverlay || "CA_EXTENSION_TOGGLE_OVERLAY")) return false;
  initOverlay();

  if (typeof message?.payload?.pin === "boolean") {
    overlayPinned = Boolean(message.payload.pin);
    if (overlayElements?.lock) {
      overlayElements.lock.textContent = overlayPinned ? "Pinned" : "Pin";
      overlayElements.lock.title = overlayPinned ? "Unpin overlay" : "Pin overlay";
      overlayElements.lock.classList.toggle("is-active", overlayPinned);
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

const highlightField = (field) => {
  if (!field) return;
  field.style.outline = "2px solid #1ea97a";
  field.style.outlineOffset = "2px";
};

const setValue = async (fieldName, value) => {
  if (!value) return false;
  const field = document.querySelector(`[name="${fieldName}"]`);
  if (!field) return false;
  if (DRY_RUN) {
    highlightField(field);
    logAction(`Dry run: would set ${fieldName}.`);
    return true;
  }
  if (INTERACTION_MODE === "manual") {
    highlightField(field);
    logAction(`Manual assist: please fill ${fieldName}.`);
    return true;
  }
  const setNativeFieldValue = (target, nextValue) => {
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target) || {}, "value");
    if (descriptor?.set) {
      descriptor.set.call(target, nextValue);
      return;
    }
    target.value = nextValue;
  };
  const dispatchInputEvent = (target, data = null) => {
    if (typeof InputEvent === "function") {
      target.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        data,
        inputType: data == null ? "insertReplacementText" : "insertText",
      }));
      return;
    }
    target.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const dispatchCommitEvents = (target) => {
    target.dispatchEvent(new Event("change", { bubbles: true }));
    target.dispatchEvent(new Event("blur", { bubbles: true }));
  };
  const typeLikeHuman = async (target, nextValue) => {
    target.focus();
    setNativeFieldValue(target, "");
    dispatchInputEvent(target, null);
    for (const char of String(nextValue)) {
      setNativeFieldValue(target, `${target.value}${char}`);
      dispatchInputEvent(target, char);
      await wait(25 + Math.random() * 30);
    }
    dispatchCommitEvents(target);
  };
  if (INTERACTION_MODE === "slow") {
    await typeLikeHuman(field, value);
    return true;
  }
  setNativeFieldValue(field, String(value));
  dispatchInputEvent(field, null);
  dispatchCommitEvents(field);
  return true;
};

const setSelectByLabel = (fieldName, label) => {
  if (!label) return false;
  const field = document.querySelector(`[name="${fieldName}"]`);
  if (!field || field.tagName !== "SELECT") return false;
  const target = label.trim().toLowerCase();
  const option = Array.from(field.options).find((opt) =>
    (opt.textContent || "").trim().toLowerCase() === target
  );
  if (!option) return false;
  field.value = option.value;
  field.dispatchEvent(new Event("change", { bubbles: true }));
  field.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
};

const setMultiSelect = async (fieldName, values) => {
  if (!values || values.length === 0) return false;
  const field = document.querySelector(`[name="${fieldName}"]`);
  if (!field || field.tagName !== "SELECT") return false;
  if (DRY_RUN) {
    highlightField(field);
    logAction(`Dry run: would select ${values.length} options for ${fieldName}.`);
    return true;
  }
  if (INTERACTION_MODE === "manual") {
    highlightField(field);
    logAction(`Manual assist: please select options for ${fieldName}.`);
    return true;
  }
  let matched = 0;
  const normalizedValues = values.map((value) => value.trim().toLowerCase());
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

const setRadioByValue = async (fieldName, value) => {
  if (!value) return false;
  const radios = Array.from(document.querySelectorAll(`input[type="radio"][name="${fieldName}"]`));
  if (radios.length === 0) return false;
  const target = String(value).trim().toLowerCase();
  const radio = radios.find((input) => String(input.value).trim().toLowerCase() === target);
  if (!radio) return false;
  if (DRY_RUN) {
    highlightField(radio);
    logAction(`Dry run: would select ${fieldName}=${value}.`);
    return true;
  }
  if (INTERACTION_MODE === "manual") {
    highlightField(radio);
    logAction(`Manual assist: please select ${fieldName}=${value}.`);
    return true;
  }
  radio.click();
  return true;
};

const addTableRows = async (tableId, count) => {
  if (count <= 0) return;
  const addButton = document.querySelector(`a#${tableId}`);
  if (!addButton) return;
  for (let i = 0; i < count; i += 1) {
    if (DRY_RUN) {
      highlightField(addButton);
      logAction(`Dry run: would add row for ${tableId}.`);
      return;
    }
    if (INTERACTION_MODE === "manual") {
      highlightField(addButton);
      logAction(`Manual assist: please add a row for ${tableId}.`);
      return;
    }
    addButton.click();
    await wait(250);
  }
};

const fillNonConformanceRows = async (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return;
  const table = await waitForSelector("#Table_26_10_Table");
  if (!table) return;
  const existingRows = Array.from(table.querySelectorAll("tbody tr"));
  if (rows.length > existingRows.length) {
    await addTableRows("Table_26_10", rows.length - existingRows.length);
  }
  const updatedRows = Array.from(table.querySelectorAll("tbody tr"));
  for (let i = 0; i < rows.length; i += 1) {
    const row = updatedRows[i];
    if (!row) continue;
    const data = rows[i];
    const careWorkerField = row.querySelector('input[name^="form_component_27"]');
    const datesField = row.querySelector('input[name^="form_component_40"]');
    const detailsField = row.querySelector('input[name^="form_component_29"]');
    const occasionsField = row.querySelector('input[name^="form_component_31"]');
    const actionsField = row.querySelector('select[name^="form_component_41"]');

    if (careWorkerField) await setValue(careWorkerField.name, data.careWorkerName);
    if (datesField) await setValue(datesField.name, data.dates);
    if (detailsField) await setValue(detailsField.name, data.details);
    if (occasionsField) await setValue(occasionsField.name, data.occasions);
    if (actionsField) {
      const actions = Array.isArray(data.actions)
        ? data.actions
        : String(data.actions || "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean);
      await setMultiSelect(actionsField.name, actions);
    }
  }
};

const fillStaffIdentifiedRows = async (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return;
  const table = await waitForSelector("#Table_48_21_Table");
  if (!table) return;
  const existingRows = Array.from(table.querySelectorAll("tbody tr"));
  if (rows.length > existingRows.length) {
    await addTableRows("Table_48_21", rows.length - existingRows.length);
  }
  const updatedRows = Array.from(table.querySelectorAll("tbody tr"));
  for (let i = 0; i < rows.length; i += 1) {
    const row = updatedRows[i];
    if (!row) continue;
    const data = rows[i];
    const nameField = row.querySelector('input[name^="form_component_49"]');
    const commentsField = row.querySelector('textarea[name^="form_component_50"]');
    if (nameField) await setValue(nameField.name, data.name);
    if (commentsField) await setValue(commentsField.name, data.comments);
  }
};

const isEmarFormPage = () => {
  if (!window.location.pathname.includes("new_case_form")) return false;
  const params = new URLSearchParams(window.location.search);
  const formId = params.get("formId");
  const emarFormId = FORM_CONFIGS?.emar?.formId || "1044009";
  return formId === emarFormId;
};

const run = async () => {
  if (!isEmarFormPage()) return;

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

  if (!caAcpPayload || caAcpPayload.formType !== "emar") return;
  if (!caAcpQueueState || typeof caAcpQueueState.currentIndex !== "number") return;

  const batchId = caAcpQueueState?.batchId || "legacy";
  const processedKey = `caEmarAutofillProcessed_${batchId}_${caAcpQueueState.currentIndex}`;
  if (sessionStorage.getItem(processedKey)) return;

  DRY_RUN = Boolean(caAcpDryRun);
  INTERACTION_MODE = caAcpInteractionMode || "auto";
  if (DRY_RUN) {
    logAction("Dry run enabled. No fields will be changed.");
  }

  const payload = caAcpPayload;
  const formReady = await waitForSelector("#section_1_1");
  if (!formReady) {
    logAction("EMAR form section not ready yet. Autofill skipped.");
    return;
  }

  sessionStorage.setItem(processedKey, "1");

  try {
  await wait(500);

  await setValue("form_component_2_2", payload.serviceUserName);
  await setValue("form_component_3_3", payload.auditor);
  await setValue("form_component_33_4", payload.auditPeriodStart);
  await setValue("form_component_34_5", payload.auditPeriodEnd);
  await setSelectByLabel("form_component_35_6", payload.purposeOfAudit);
  await setMultiSelect("form_component_37_7", payload.medicationSupportLevel ? [payload.medicationSupportLevel] : []);
  await setRadioByValue("form_component_36_8", payload.prnProtocolCompleted);

  await setRadioByValue("form_component_23_9", payload.actionsInLine);

  if (String(payload.actionsInLine).toLowerCase().startsWith("no")) {
    await wait(600);
    await fillNonConformanceRows(payload.nonConformance || []);
  }

  await setSelectByLabel("form_component_44_16", payload.timeCritical);
  if (String(payload.timeCritical).toLowerCase().startsWith("yes")) {
    await setValue("form_component_47_17", payload.timeCriticalMedications);
    await setSelectByLabel("form_component_46_18", payload.timeCriticalAdministered);
    if (String(payload.timeCriticalAdministered).toLowerCase().startsWith("no")) {
      await setValue("form_component_45_19", payload.timeCriticalActions);
    }
  }

  await setValue("form_component_43_20", payload.themesAndTrends);
  await fillStaffIdentifiedRows(payload.staffIdentified || []);
  await setValue("form_component_42_24", payload.furtherActions);
  await setValue("form_component_5_25", payload.auditDate);

  const submitButton = document.getElementById("btnSubmitDynamicForm");
  const clearQueue = () => {
    saveStorage({
      [STORAGE_KEYS.queueState]: null,
      [STORAGE_KEYS.payload]: null,
      [STORAGE_KEYS.caseInfo]: null,
    });
  };

  const shouldAutoSubmit = caAcpAutoSubmit !== false;
  if (shouldAutoSubmit) {
    if (submitButton) {
      if (DRY_RUN) {
        highlightField(submitButton);
        logAction("Dry run: would submit form.");
      } else if (INTERACTION_MODE === "manual") {
        highlightField(submitButton);
        logAction("Manual assist: please submit the form when ready.");
        submitButton.addEventListener("click", () => clearQueue(), { once: true });
        return;
      } else {
        submitButton.click();
      }
      clearQueue();
      return;
    }
    logAction("Submit button not found. Please submit manually.");
    sessionStorage.removeItem(processedKey);
    return;
  }

  if (submitButton) {
    submitButton.addEventListener("click", () => clearQueue(), { once: true });
    logAction("Manual mode: waiting for submit click.");
  } else {
    logAction("Submit button not found. Please submit manually.");
    sessionStorage.removeItem(processedKey);
  }
  } catch (error) {
    sessionStorage.removeItem(processedKey);
    logAction(`EMAR autofill failed: ${error?.message || "Unknown error"}`);
  }
};

run().catch((error) => {
  logAction(`EMAR runtime failed: ${error?.message || "Unknown error"}`);
});
})();
