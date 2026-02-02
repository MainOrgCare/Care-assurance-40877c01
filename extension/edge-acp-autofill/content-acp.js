const STORAGE_KEYS = {
  payload: "caAcpPayload",
  caseInfo: "caAcpCaseInfo",
  queueState: "caAcpQueueState",
  autoSubmit: "caAcpAutoSubmit",
  dryRun: "caAcpDryRun",
  interactionMode: "caAcpInteractionMode",
};
const SIGNATURE_URL =
  "https://raw.githubusercontent.com/MainOrgCare/Care-assurance-40877c01/main/attached_assets/Signature.jpg";

const FORM_FIELD_NAMES = {
  serviceUser: "form_component_4_3",
  assessor: "form_component_5_4",
  assessmentDate: "form_component_6_5",
  reason: "form_component_25_8",
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const logAction = (message) => {
  const timestamp = new Date().toLocaleTimeString();
  chrome.runtime.sendMessage({
    type: "CA_EXTENSION_LOG",
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
  chrome.runtime.sendMessage({ type: "CA_EXTENSION_STEP_COMPLETE" });

const isRiskFormPage = () => Boolean(document.querySelector("#Table_9_9_Table"));

const uploadSignature = async () => {
  const signatureField = document.querySelector('[name="form_component_18_19"]');
  if (!signatureField || signatureField.type !== "file") return false;

  if (DRY_RUN) {
    highlightField(signatureField);
    logAction("Dry run: would upload signature.");
    return true;
  }

  try {
    const response = await fetch(SIGNATURE_URL, { cache: "no-store" });
    if (!response.ok) return false;
    const blob = await response.blob();
    const file = new File([blob], "signature.jpg", { type: blob.type || "image/jpeg" });
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
  const signatureField = document.querySelector('[name="form_component_18_19"]');
  if (!signatureField || signatureField.type !== "file") return false;

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
  if (message?.type !== "CA_EXTENSION_UPLOAD_SIGNATURE") return false;
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
  return formId === "1048191";
};

const run = async () => {
  if (!isAutofillTargetPage()) return;

  const { caAcpPayload, caAcpQueueState, caAcpAutoSubmit, caAcpDryRun, caAcpInteractionMode } = await loadStorage([
    STORAGE_KEYS.payload,
    STORAGE_KEYS.queueState,
    STORAGE_KEYS.autoSubmit,
    STORAGE_KEYS.dryRun,
    STORAGE_KEYS.interactionMode,
  ]);

  if (!caAcpPayload || !Array.isArray(caAcpPayload.assessments)) return;
  if (!caAcpQueueState || typeof caAcpQueueState.currentIndex !== "number") return;

  const processedKey = `caAutofillProcessed_${caAcpQueueState.currentIndex}`;
  if (sessionStorage.getItem(processedKey)) return;
  sessionStorage.setItem(processedKey, "1");
  if (!isRiskFormPage()) return;

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
  await fillRiskAssessment(assessment, serviceUserLabel);

  await uploadSignature();
  await wait(1000);

  const shouldAutoSubmit = caAcpAutoSubmit !== false;
  if (shouldAutoSubmit) {
    clickSubmit();
    await wait(2000);
    if (caAcpQueueState.currentIndex + 1 < caAcpQueueState.total) {
      notifyStepComplete();
    } else {
      chrome.storage.local.set({ [STORAGE_KEYS.queueState]: null });
    }
    return;
  }

  attachManualSubmitListener(() => {
    if (caAcpQueueState.currentIndex + 1 < caAcpQueueState.total) {
      notifyStepComplete();
    } else {
      chrome.storage.local.set({ [STORAGE_KEYS.queueState]: null });
    }
  });
};

run();
