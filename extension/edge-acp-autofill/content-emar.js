const FALLBACK_STORAGE_KEYS = {
  payload: "caAcpPayload",
  caseInfo: "caAcpCaseInfo",
  queueState: "caAcpQueueState",
  autoSubmit: "caAcpAutoSubmit",
  dryRun: "caAcpDryRun",
  interactionMode: "caAcpInteractionMode",
};
const FALLBACK_FORM_CONFIGS = {
  emar: { formId: "1044009" },
};
const FALLBACK_MESSAGE_TYPES = {
  log: "CA_EXTENSION_LOG",
};

const { STORAGE_KEYS, FORM_CONFIGS, MESSAGE_TYPES } = window.CA_EXTENSION_CONSTANTS || {
  STORAGE_KEYS: FALLBACK_STORAGE_KEYS,
  FORM_CONFIGS: FALLBACK_FORM_CONFIGS,
  MESSAGE_TYPES: FALLBACK_MESSAGE_TYPES,
};

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
};

let DRY_RUN = false;
let INTERACTION_MODE = "auto";

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
  field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
  field.dispatchEvent(new Event("blur", { bubbles: true }));
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

  const { caAcpPayload, caAcpQueueState, caAcpAutoSubmit, caAcpDryRun, caAcpInteractionMode } = await new Promise(
    (resolve) => chrome.storage.local.get([
      STORAGE_KEYS.payload,
      STORAGE_KEYS.queueState,
      STORAGE_KEYS.autoSubmit,
      STORAGE_KEYS.dryRun,
      STORAGE_KEYS.interactionMode,
    ], (items) => resolve(items))
  );

  if (!caAcpPayload || caAcpPayload.formType !== "emar") return;
  if (!caAcpQueueState || typeof caAcpQueueState.currentIndex !== "number") return;

  const processedKey = `caEmarAutofillProcessed_${caAcpQueueState.currentIndex}`;
  if (sessionStorage.getItem(processedKey)) return;
  sessionStorage.setItem(processedKey, "1");

  DRY_RUN = Boolean(caAcpDryRun);
  INTERACTION_MODE = caAcpInteractionMode || "auto";
  if (DRY_RUN) {
    logAction("Dry run enabled. No fields will be changed.");
  }

  const payload = caAcpPayload;
  await waitForSelector("#section_1_1");
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
    chrome.storage.local.set({
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
    return;
  }

  if (submitButton) {
    submitButton.addEventListener("click", () => clearQueue(), { once: true });
    logAction("Manual mode: waiting for submit click.");
  } else {
    logAction("Submit button not found. Please submit manually.");
  }
};

run();
