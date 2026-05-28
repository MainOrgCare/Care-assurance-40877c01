(() => {
if (window.__CA_GENERIC_INITIALIZED) return;
window.__CA_GENERIC_INITIALIZED = true;

const __caBootstrap = (window.CA_CONTENT_BOOTSTRAP && window.CA_CONTENT_BOOTSTRAP.resolve())
  || { STORAGE_KEYS: {}, MESSAGE_TYPES: {}, STORAGE_HELPERS: {
    get: (keys) => new Promise((r) => chrome.storage.local.get(keys, (i) => r(i || {}))),
    set: (items) => new Promise((r) => chrome.storage.local.set(items, () => r())),
  } };
const { STORAGE_KEYS, MESSAGE_TYPES, STORAGE_HELPERS } = __caBootstrap;

const loadStorage = (keys) => STORAGE_HELPERS.get(keys);
const saveStorage = (items) => STORAGE_HELPERS.set(items);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let DRY_RUN = false;
let INTERACTION_MODE = "auto";

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

const dispatchEvents = (field) => {
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
  field.dispatchEvent(new Event("blur", { bubbles: true }));
};

const typeLikeHuman = async (field, value) => {
  field.focus();
  setNativeFieldValue(field, "");
  dispatchInputEvent(field, null);
  for (const char of String(value)) {
    setNativeFieldValue(field, `${field.value}${char}`);
    dispatchInputEvent(field, char);
    await wait(25 + Math.random() * 30);
  }
  dispatchEvents(field);
};

const buildProcessedKey = (queueState) => {
  const batchId = queueState?.batchId || "legacy";
  const currentIndex = typeof queueState?.currentIndex === "number" ? queueState.currentIndex : "single";
  return `caCustomAutofillProcessed_${batchId}_${currentIndex}`;
};

const findField = ({ selector, name, label, type } = {}) => {
  if (selector) {
    const el = document.querySelector(selector);
    if (el) return el;
  }

  if (name) {
    const byName = document.querySelector(`[name="${name}"]`);
    if (byName) return byName;
  }

  if (label) {
    const loweredLabel = String(label).trim().toLowerCase();
    const labels = Array.from(document.querySelectorAll("label"));
    const match = labels.find((node) => {
      const text = (node.textContent || "").trim().toLowerCase();
      return text === loweredLabel || text.includes(loweredLabel);
    });

    if (match) {
      const forId = match.getAttribute("for");
      if (forId) {
        const safeId = window.CSS?.escape ? window.CSS.escape(forId) : forId;
        const byFor = document.querySelector(`#${safeId}`);
        if (byFor) return byFor;
      }

      const nested = match.querySelector("input, textarea, select");
      if (nested) return nested;

      const container = match.parentElement;
      if (container) {
        const siblingInput = container.querySelector("input, textarea, select");
        if (siblingInput) return siblingInput;
      }
    }
  }

  if (type === "radio" && name) {
    return document.querySelector(`input[type="radio"][name="${name}"]`);
  }

  return null;
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

const setRadioValue = async (value, name) => {
  if (!name) return false;
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
    return setRadioValue(value, name || field.name);
  }
  return setTextValue(field, value);
};

const run = async () => {
  let processedKey = null;
  try {
    const { caAcpPayload, caAcpQueueState, caAcpAutoSubmit, caAcpDryRun, caAcpInteractionMode } = await loadStorage([
      STORAGE_KEYS.payload,
      STORAGE_KEYS.queueState,
      STORAGE_KEYS.autoSubmit,
      STORAGE_KEYS.dryRun,
      STORAGE_KEYS.interactionMode,
    ]);

    if (!caAcpPayload) return;
    if (caAcpPayload.formType === "acp" || caAcpPayload.formType === "emar" || caAcpPayload.formType === "initialAssessment") return;
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

    processedKey = buildProcessedKey(caAcpQueueState);
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
        sessionStorage.removeItem(processedKey);
        return;
      }
    }

    await saveStorage({
      [STORAGE_KEYS.queueState]: null,
      [STORAGE_KEYS.payload]: null,
      [STORAGE_KEYS.caseInfo]: null,
    });
  } catch (error) {
    if (processedKey) {
      sessionStorage.removeItem(processedKey);
    }
    throw error;
  }
};

run().catch((error) => {
  logAction(`Custom form autofill failed: ${error?.message || "Unknown error"}`);
});
})();
