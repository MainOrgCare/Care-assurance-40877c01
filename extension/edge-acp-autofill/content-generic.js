(() => {
if (window.__CA_GENERIC_INITIALIZED) return;
window.__CA_GENERIC_INITIALIZED = true;

const FALLBACK_STORAGE_KEYS = {
  payload: "caAcpPayload",
  caseInfo: "caAcpCaseInfo",
  queueState: "caAcpQueueState",
  autoSubmit: "caAcpAutoSubmit",
  dryRun: "caAcpDryRun",
  interactionMode: "caAcpInteractionMode",
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

const { STORAGE_KEYS, MESSAGE_TYPES, STORAGE_HELPERS } = window.CA_EXTENSION_CONSTANTS || {
  STORAGE_KEYS: FALLBACK_STORAGE_KEYS,
  MESSAGE_TYPES: FALLBACK_MESSAGE_TYPES,
  STORAGE_HELPERS: FALLBACK_STORAGE_HELPERS,
};

const loadStorage = (keys) => STORAGE_HELPERS.get(keys);
const saveStorage = (items) => STORAGE_HELPERS.set(items);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const logAction = (message) => {
  const timestamp = new Date().toLocaleTimeString();
  chrome.runtime.sendMessage({
    type: MESSAGE_TYPES?.log || "CA_EXTENSION_LOG",
    entry: `[${timestamp}] ${message}`,
  });
};

let DRY_RUN = false;
let INTERACTION_MODE = "auto";

const highlightField = (field) => {
  if (!field) return;
  field.style.outline = "2px solid #1ea97a";
  field.style.outlineOffset = "2px";
};

const findField = ({ selector, name, label, type } = {}) => {
  if (selector) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  if (name) {
    const el = document.querySelector(`[name="${name}"]`);
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
  const buildProcessedKey = (queueState) => {
    const batchId = queueState?.batchId || "legacy";
    const currentIndex = typeof queueState?.currentIndex === "number" ? queueState.currentIndex : "single";
    return `caCustomAutofillProcessed_${batchId}_${currentIndex}`;
  };
    if (el) return el;
  }
    dispatchInputEvent(field, null);
    const labels = Array.from(document.querySelectorAll("label"));
    const match = labels.find(
      (node) => (node.textContent || "").trim().toLowerCase() === label.trim().toLowerCase()
    );
    if (match) {
      const forId = match.getAttribute("for");
    setNativeFieldValue(field, "");
    dispatchInputEvent(field, null);
        if (byFor) return byFor;
      setNativeFieldValue(field, `${field.value}${char}`);
      dispatchInputEvent(field, char);
      if (nested) return nested;
    }
  }
  if (type === "radio" && name) {
    return document.querySelector(`input[type="radio"][name="${name}"]`);
  }
  return null;
};

const dispatchEvents = (field) => {
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
  field.dispatchEvent(new Event("blur", { bubbles: true }));
};

const typeLikeHuman = async (field, value) => {
  field.focus();
  field.value = "";
  field.dispatchEvent(new Event("input", { bubbles: true }));
  for (const char of String(value)) {
    field.value += char;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    await wait(25 + Math.random() * 30);
  }
  dispatchEvents(field);
};

const setTextValue = async (field, value) => {
  if (!field) return false;
  if (DRY_RUN) {
    highlightField(field);
    logAction("Dry run: would set text value.");
    return true;
  }
  if (INTERACTION_MODE === "manual") {
    highlightField(field);
    logAction("Manual assist: please fill highlighted field.");
    return true;
  }
  if (INTERACTION_MODE === "slow") {
    await typeLikeHuman(field, value);
    return true;
  }
  setNativeFieldValue(field, String(value));
  dispatchEvents(field);
  return true;
};

const setSelectValue = async (field, value) => {
  if (!field || field.tagName !== "SELECT") return false;
  if (DRY_RUN) {
    highlightField(field);
    logAction("Dry run: would select value.");
    return true;
  }
  if (INTERACTION_MODE === "manual") {
    highlightField(field);
    logAction("Manual assist: please select value.");
    return true;
  }
  const target = String(value).trim().toLowerCase();
  const option = Array.from(field.options).find((opt) => {
    const optValue = String(opt.value || "").trim().toLowerCase();
    const optLabel = String(opt.textContent || "").trim().toLowerCase();
    return optValue === target || optLabel === target;
  });
  if (!option) return false;
  field.value = option.value;
  dispatchEvents(field);
  return true;
};

const setMultiSelectValue = async (field, values) => {
  if (!field || field.tagName !== "SELECT") return false;
  if (!Array.isArray(values) || values.length === 0) return false;
  if (DRY_RUN) {
    highlightField(field);
    logAction("Dry run: would select multiple values.");
    return true;
  }
  if (INTERACTION_MODE === "manual") {
    highlightField(field);
    logAction("Manual assist: please select multiple values.");
    return true;
  }
  const normalized = values.map((val) => String(val).trim().toLowerCase());
  Array.from(field.options).forEach((opt) => {
    const optValue = String(opt.value || "").trim().toLowerCase();
    const optLabel = String(opt.textContent || "").trim().toLowerCase();
    const shouldSelect = normalized.includes(optValue) || normalized.includes(optLabel);
    opt.selected = shouldSelect;
  });
  dispatchEvents(field);
  return true;
};

const setCheckboxValue = async (field, value) => {
  if (!field || field.type !== "checkbox") return false;
  if (DRY_RUN) {
    highlightField(field);
    logAction("Dry run: would set checkbox.");
    return true;
  }
  if (INTERACTION_MODE === "manual") {
    highlightField(field);
    logAction("Manual assist: please toggle checkbox.");
    return true;
  }
  field.checked = Boolean(value);
  dispatchEvents(field);
  return true;
};

const setRadioValue = async (field, value, name) => {
  const targetValue = String(value).trim().toLowerCase();
  const radios = Array.from(document.querySelectorAll(`input[type="radio"][name="${name}"]`));
  const match = radios.find((radio) => String(radio.value).trim().toLowerCase() === targetValue);
  if (!match) return false;
  if (DRY_RUN) {
    highlightField(match);
    logAction("Dry run: would set radio.");
    return true;
  }
  if (INTERACTION_MODE === "manual") {
    highlightField(match);
    logAction("Manual assist: please set radio.");
    return true;
  }
  match.click();
  return true;
};

const clickSubmit = (selector) => {
  let submitButton = selector ? document.querySelector(selector) : null;
  if (!submitButton) {
    const buttons = Array.from(document.querySelectorAll("button, input[type=submit]"));
    submitButton = buttons.find((button) => {
      if (button.tagName === "INPUT") {
        return button.value && button.value.toLowerCase().includes("submit");
      }
      const text = button.textContent || "";
      return text.toLowerCase().includes("submit");
    });
  }
  if (!submitButton) return false;
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
};

const fillField = async (fieldSpec) => {
  const { value, type, name, selector, label } = fieldSpec;
  const field = findField({ selector, name, label, type });
  if (!field) {
    logAction(`Field not found: ${selector || name || label || "unknown"}`);
    return false;
  }
  const fieldType = type || fieldSpec.fieldType || field.type || field.tagName?.toLowerCase();
  if (fieldType === "select-multiple" || fieldSpec.multi === true) {
    return setMultiSelectValue(field, Array.isArray(value) ? value : [value]);
  }
  if (fieldType === "select" || field.tagName === "SELECT") {
    return setSelectValue(field, value);
  }
  if (fieldType === "checkbox") {
    return setCheckboxValue(field, value);
  }
  if (fieldType === "radio") {
    return setRadioValue(field, value, name || field.name);
  }
  return setTextValue(field, value);
};

const run = async () => {
  const { caAcpPayload, caAcpQueueState, caAcpAutoSubmit, caAcpDryRun, caAcpInteractionMode } = await loadStorage([
    STORAGE_KEYS.payload,
    STORAGE_KEYS.queueState,
    STORAGE_KEYS.autoSubmit,
    STORAGE_KEYS.dryRun,
    STORAGE_KEYS.interactionMode,
  ]);

  if (!caAcpPayload) return;
  if (caAcpPayload.formType === "acp" || caAcpPayload.formType === "emar") return;
  if (!caAcpQueueState || typeof caAcpQueueState.currentIndex !== "number") return;
  if (!Array.isArray(caAcpPayload.fields)) {
    logAction("Custom payload missing fields array.");
    return;
  }
  if (caAcpPayload.formId) {
    const params = new URLSearchParams(window.location.search);
    const currentFormId = params.get("formId");
    if (currentFormId && currentFormId !== String(caAcpPayload.formId)) {
      return;
    }
  }

  const processedKey = `caCustomAutofillProcessed_${caAcpQueueState.currentIndex}`;
  const processedKey = buildProcessedKey(caAcpQueueState);
  if (sessionStorage.getItem(processedKey)) return;
  sessionStorage.setItem(processedKey, "1");

  DRY_RUN = Boolean(caAcpDryRun);
  INTERACTION_MODE = caAcpInteractionMode || "auto";
  if (DRY_RUN) {
    logAction("Dry run enabled. No fields will be changed.");
  }

  for (const fieldSpec of caAcpPayload.fields) {
    await fillField(fieldSpec);
    await wait(fieldSpec.delayMs || 150);
  }

  const shouldAutoSubmit = caAcpAutoSubmit !== false;
  if (shouldAutoSubmit) {
    const submitted = clickSubmit(caAcpPayload.submitSelector);
    if (!submitted) {
      logAction("Submit button not found. Please submit manually.");
      return;
    }
  }

  saveStorage({
    [STORAGE_KEYS.queueState]: null,
    [STORAGE_KEYS.payload]: null,
    [STORAGE_KEYS.caseInfo]: null,
  });
};

run();
})();
