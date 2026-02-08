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

const { STORAGE_KEYS, FORM_CONFIGS, MESSAGE_TYPES } = window.CA_EXTENSION_CONSTANTS || {
  STORAGE_KEYS: FALLBACK_STORAGE_KEYS,
  FORM_CONFIGS: FALLBACK_FORM_CONFIGS,
  MESSAGE_TYPES: FALLBACK_MESSAGE_TYPES,
};

const FORM_FIELD_NAMES = {
  serviceUser: "form_component_4_3",
  assessor: "form_component_5_4",
  assessmentDate: "form_component_6_5",
  reason: "form_component_25_8",
};

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

const initOverlay = () => {
  if (overlayInitialized) return;
  overlayInitialized = true;

  const container = document.createElement("div");
  container.id = "ca-autofill-overlay";
  container.style.position = "fixed";
  container.style.right = "16px";
  container.style.top = "16px";
  container.style.zIndex = "2147483647";
  container.style.fontFamily = "system-ui, -apple-system, Segoe UI, sans-serif";
  container.style.color = "#0f172a";
  container.style.pointerEvents = "none";

  const panel = document.createElement("div");
  panel.style.background = "rgba(255, 255, 255, 0.97)";
  panel.style.border = "1px solid hsl(214, 25%, 89%)";
  panel.style.borderRadius = "8px";
  panel.style.boxShadow = "0 6px 16px rgba(15, 23, 42, 0.1)";
  panel.style.padding = "10px 12px";
  panel.style.minWidth = "220px";
  panel.style.maxWidth = "300px";
  panel.style.backdropFilter = "blur(8px)";

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.gap = "8px";
  header.style.marginBottom = "8px";

  const icon = document.createElement("div");
  icon.textContent = "CA";
  icon.style.width = "24px";
  icon.style.height = "24px";
  icon.style.borderRadius = "6px";
  icon.style.background = "hsl(215, 55%, 30%)";
  icon.style.color = "#ffffff";
  icon.style.display = "flex";
  icon.style.alignItems = "center";
  icon.style.justifyContent = "center";
  icon.style.fontSize = "10px";
  icon.style.fontWeight = "600";
  icon.style.letterSpacing = "0.3px";

  const title = document.createElement("div");
  title.textContent = "Risk Assessment";
  title.style.fontWeight = "600";
  title.style.fontSize = "13px";
  title.style.color = "#0f172a";

  const minimizeButton = document.createElement("button");
  minimizeButton.type = "button";
  minimizeButton.textContent = "–";
  minimizeButton.style.marginLeft = "auto";
  minimizeButton.style.width = "22px";
  minimizeButton.style.height = "22px";
  minimizeButton.style.borderRadius = "4px";
  minimizeButton.style.border = "1px solid hsl(214, 25%, 89%)";
  minimizeButton.style.background = "hsl(210, 15%, 97%)";
  minimizeButton.style.color = "#475569";
  minimizeButton.style.cursor = "pointer";
  minimizeButton.style.fontSize = "14px";
  minimizeButton.style.lineHeight = "16px";
  minimizeButton.style.padding = "0";
  minimizeButton.style.pointerEvents = "auto";

  const progress = document.createElement("div");
  progress.textContent = "Waiting...";
  progress.style.fontSize = "12px";
  progress.style.color = "#64748b";

  const logsLabel = document.createElement("div");
  logsLabel.textContent = "Logs";
  logsLabel.style.fontSize = "11px";
  logsLabel.style.marginTop = "8px";
  logsLabel.style.color = "#64748b";
  logsLabel.style.textTransform = "uppercase";
  logsLabel.style.letterSpacing = "0.06em";

  const logsBox = document.createElement("div");
  logsBox.style.marginTop = "6px";
  logsBox.style.padding = "6px 8px";
  logsBox.style.borderRadius = "6px";
  logsBox.style.background = "hsl(210, 15%, 95%)";
  logsBox.style.border = "1px solid hsl(214, 25%, 89%)";
  logsBox.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, monospace";
  logsBox.style.fontSize = "10px";
  logsBox.style.color = "#64748b";
  logsBox.style.whiteSpace = "pre-line";
  logsBox.style.maxHeight = "80px";
  logsBox.style.overflow = "hidden";
  logsBox.textContent = "No actions yet.";

  header.appendChild(icon);
  header.appendChild(title);
  header.appendChild(minimizeButton);
  panel.appendChild(header);
  panel.appendChild(progress);
  panel.appendChild(logsLabel);
  panel.appendChild(logsBox);
  container.appendChild(panel);

  document.body.appendChild(container);
  overlayElements = { progress, logsBox, logsLabel, panel, minimizeButton, title };

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
  if (overlayCollapsed) return;
  const { caAcpQueueState, caAcpLogs } = await loadStorage([STORAGE_KEYS.queueState, STORAGE_KEYS.logs]);
  if (caAcpQueueState && typeof caAcpQueueState.currentIndex === "number") {
    const current = caAcpQueueState.currentIndex + 1;
    const total = caAcpQueueState.total || "?";
    overlayElements.progress.textContent = `Assessment ${current} of ${total}`;
  } else {
    overlayElements.progress.textContent = "Waiting...";
  }

  const logs = Array.isArray(caAcpLogs) ? caAcpLogs : [];
  if (logs.length === 0) {
    overlayElements.logsBox.textContent = "No actions yet.";
  } else {
    overlayElements.logsBox.textContent = logs.slice(-6).join("\n");
  }
};

const setOverlayCollapsed = (collapsed) => {
  overlayCollapsed = collapsed;
  if (!overlayElements) return;
  if (collapsed) {
    overlayElements.panel.style.minWidth = "auto";
    overlayElements.panel.style.maxWidth = "auto";
    overlayElements.panel.style.cursor = "pointer";
    overlayElements.logsBox.style.display = "none";
    overlayElements.logsLabel.style.display = "none";
    overlayElements.progress.style.display = "none";
    overlayElements.title.textContent = "CA";
    overlayElements.minimizeButton.textContent = "+";
    overlayElements.minimizeButton.title = "Expand";
    // Click panel to expand
    overlayElements.panel.onclick = (e) => {
      if (e.target === overlayElements.minimizeButton) return;
      setOverlayCollapsed(false);
    };
  } else {
    overlayElements.panel.style.minWidth = "220px";
    overlayElements.panel.style.maxWidth = "300px";
    overlayElements.panel.style.cursor = "default";
    overlayElements.logsBox.style.display = "block";
    overlayElements.logsLabel.style.display = "block";
    overlayElements.progress.style.display = "block";
    overlayElements.title.textContent = "Risk Assessment";
    overlayElements.minimizeButton.textContent = "\u2013";
    overlayElements.minimizeButton.title = "Minimize";
    overlayElements.panel.onclick = null;
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

const loadStorage = (keys) =>
  new Promise((resolve) => chrome.storage.local.get(keys, (items) => resolve(items)));

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

  const shouldAutoSubmit = caAcpAutoSubmit !== false;
  if (shouldAutoSubmit) {
    const submitted = clickSubmit();
    if (!submitted) {
      logAction("Submit button not found. Please submit manually.");
      return;
    }
    logAction("Submitted. Waiting for confirmation page to advance.");
    return;
  }

  attachManualSubmitListener(() => {
    if (caAcpQueueState.currentIndex + 1 < caAcpQueueState.total) {
      notifyStepComplete();
    } else {
      chrome.storage.local.set({
        [STORAGE_KEYS.queueState]: null,
        [STORAGE_KEYS.payload]: null,
        [STORAGE_KEYS.caseInfo]: null,
        [STORAGE_KEYS.signatureData]: null,
        [STORAGE_KEYS.signatureBatchId]: null,
      });
    }
  });
};

run();
