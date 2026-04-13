(() => {
const FALLBACK_STORAGE_KEYS = {
  payload: "caAcpPayload",
  caseInfo: "caAcpCaseInfo",
  queueState: "caAcpQueueState",
  autoSubmit: "caAcpAutoSubmit",
  dryRun: "caAcpDryRun",
  interactionMode: "caAcpInteractionMode",
  signatureData: "caAcpSignatureData",
  signatureBatchId: "caAcpSignatureBatchId",
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
  chrome.runtime.sendMessage({
    type: MESSAGE_TYPES?.log || "CA_EXTENSION_LOG",
    entry: `[${timestamp}] ${message}`,
  });
  if (typeof refreshOverlaySoon === "function") {
    refreshOverlaySoon();
  }
};

let DRY_RUN = false;
let INTERACTION_MODE = "auto";
let overlayInitialized = false;
let overlayElements = null;
let overlayCollapsed = false;
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
      border-radius: 20px;
      border: 1px solid rgba(148, 163, 184, 0.28);
      background:
        radial-gradient(circle at top right, rgba(37, 99, 235, 0.16), transparent 42%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(241, 245, 249, 0.96));
      box-shadow: 0 24px 50px rgba(15, 23, 42, 0.18);
      backdrop-filter: blur(16px);
      overflow: hidden;
      pointer-events: auto;
    }

    .ca-overlay-panel.is-collapsed {
      width: auto;
      min-width: 168px;
      cursor: pointer;
    }

    .ca-overlay-header {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 16px 16px 14px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.16);
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

    .ca-overlay-body {
      padding: 0 16px 16px;
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

  actions.appendChild(statusChip);
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
    minimizeButton,
    collapsedTitle: "CA ready",
  };

  minimizeButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setOverlayCollapsed(!overlayCollapsed);
  });
};

let overlayRefreshTimer = null;
let overlayIntervalId = null;
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
  if (message?.type !== (MESSAGE_TYPES?.toggleOverlay || "CA_EXTENSION_TOGGLE_OVERLAY")) return false;
  initOverlay();
  if (message?.payload?.open) {
    setOverlayCollapsed(false);
  } else if (message?.payload?.minimize) {
    setOverlayCollapsed(true);
  } else {
    setOverlayCollapsed(!overlayCollapsed);
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

const typeLikeHuman = async (field, value) => {
  if (!field) return false;
  field.focus();
  field.value = "";
  field.dispatchEvent(new Event("input", { bubbles: true }));
  for (const char of String(value)) {
    field.value += char;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    await wait(25 + Math.random() * 30);
  }
  field.dispatchEvent(new Event("change", { bubbles: true }));
  field.dispatchEvent(new Event("blur", { bubbles: true }));
  return true;
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
  if (INTERACTION_MODE === "slow") {
    await typeLikeHuman(field, value);
    return true;
  }
  field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
  field.dispatchEvent(new Event("blur", { bubbles: true }));
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

const getRiskRows = () =>
  Array.from(document.querySelectorAll("#Table_9_9_Table tbody tr"));

const addRiskRows = async (count) => {
  if (count <= 0) return;
  const addButton = document.querySelector("a#Table_9_9");
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
  await setValue(FORM_FIELD_NAMES.serviceUser, serviceUserLabel);
  await setValue(FORM_FIELD_NAMES.assessor, buildSignedLabel(assessment));
  await setValue(FORM_FIELD_NAMES.assessmentDate, assessment.assessmentDate || "");
  await setValue(FORM_FIELD_NAMES.reason, assessment.category || "");
  setSelectByLabel("form_component_40_2", "Yes");
  setSelectByLabel("form_component_19_20", "No");
  setSelectByLabel(FORM_FIELD_NAMES.trainingNeeds, getTrainingNeedsSelectLabel(assessment));

  await wait(500);

  const rowsNeeded = assessment.risks.length;
  const existingRows = getRiskRows().length;
  if (rowsNeeded > existingRows) {
    await addRiskRows(rowsNeeded - existingRows);
    await wait(500);
  }

  const rows = getRiskRows();
  for (let index = 0; index < assessment.risks.length; index += 1) {
    const risk = assessment.risks[index];
    const row = rows[index];
    if (!row) return;

    const identifiedField = row.querySelector('textarea[name^="form_component_10"]');
    const harmedField = row.querySelector('select[name^="form_component_11"]');
    const defineField = row.querySelector('textarea[name^="form_component_12"]');
    const ratingField = row.querySelector('select[name^="form_component_13"]');
    const controlField = row.querySelector('textarea[name^="form_component_14"]');
    const residualField = row.querySelector('select[name^="form_component_15"]');
    const signedField = row.querySelector('input[name^="form_component_16"]');

    if (identifiedField) await setValue(identifiedField.name, risk.riskDefinition);
    if (defineField) await setValue(defineField.name, risk.howItsARisk);
    if (controlField) await setValue(controlField.name, risk.controlMeasures);
    if (ratingField) await setValue(ratingField.name, risk.initialRating);
    if (residualField) await setValue(residualField.name, risk.ratingAfterControls);
    if (signedField) {
      await setValue(signedField.name, buildSignedLabel(assessment));
    }
    if (harmedField) {
      const harmedValues = parseWhoHarmed(risk.whoWillBeHarmed);
      await setMultiSelect(harmedField.name, harmedValues);
    }
  }
};

const loadStorage = (keys) => STORAGE_HELPERS.get(keys);
const saveStorage = (items) => STORAGE_HELPERS.set(items);

const notifyStepComplete = () =>
  chrome.runtime.sendMessage({ type: MESSAGE_TYPES?.stepComplete || "CA_EXTENSION_STEP_COMPLETE" });

const isRiskFormPage = () => Boolean(document.querySelector("#Table_9_9_Table"));

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
    overlayIntervalId = setInterval(refreshOverlay, 1500);
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

  const processedKey = `caAutofillProcessed_${caAcpQueueState.currentIndex}`;
  if (sessionStorage.getItem(processedKey)) return;
  sessionStorage.setItem(processedKey, "1");
  const formReady = await waitForSelector("#Table_9_9_Table");
  if (!formReady || !isRiskFormPage()) {
    logAction("Risk form table not found. Autofill skipped.");
    return;
  }

  const assessment = caAcpPayload.assessments[caAcpQueueState.currentIndex];
  if (!assessment) return;

  DRY_RUN = Boolean(caAcpDryRun);
  INTERACTION_MODE = caAcpInteractionMode || "auto";
  if (DRY_RUN) {
    logAction("Dry run enabled. No fields will be changed.");
  }

  await wait(1000);

  const serviceUserLabel =
    caAcpPayload.serviceUserDisplayName || caAcpPayload.serviceUserInitials || "Service User";
  if (!Array.isArray(assessment.risks)) {
    logAction("Assessment has no risks array. Skipping autofill.");
    return;
  }

  await fillRiskAssessment(assessment, serviceUserLabel);

  await uploadSignature();
  await wait(1000);

  const advanceOrFinish = () => {
    if (caAcpQueueState.currentIndex + 1 < caAcpQueueState.total) {
      logAction(`Assessment ${caAcpQueueState.currentIndex + 1}/${caAcpQueueState.total} complete. Advancing to next.`);
      notifyStepComplete();
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
    logAction("Submitted. Waiting for page response...");
    // After auto-submit, wait for the page to process then advance
    // Mobizio may navigate or show a success message on the same page
    await wait(2000);
    advanceOrFinish();
    return;
  }

  attachManualSubmitListener(advanceOrFinish);
};

run();
})();
