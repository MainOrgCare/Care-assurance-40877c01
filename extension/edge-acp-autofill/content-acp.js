const STORAGE_KEYS = {
  payload: "caAcpPayload",
  caseInfo: "caAcpCaseInfo",
  queueState: "caAcpQueueState",
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

const setValue = (fieldName, value) => {
  if (!value) return false;
  const field = document.querySelector(`[name="${fieldName}"]`);
  if (!field) return false;
  field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
  field.dispatchEvent(new Event("blur", { bubbles: true }));
  return true;
};

const setMultiSelect = (fieldName, values) => {
  if (!values || values.length === 0) return false;
  const field = document.querySelector(`[name="${fieldName}"]`);
  if (!field || field.tagName !== "SELECT") return false;
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
    submitButton.click();
    return true;
  }
  return false;
};

const fillRiskAssessment = async (assessment, serviceUserLabel) => {
  setValue(FORM_FIELD_NAMES.serviceUser, serviceUserLabel);
  setValue(FORM_FIELD_NAMES.assessor, assessment.signedBy || "");
  setValue(FORM_FIELD_NAMES.assessmentDate, assessment.assessmentDate || "");
  setValue(FORM_FIELD_NAMES.reason, `Risk Assessment: ${assessment.category}`);
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
  assessment.risks.forEach((risk, index) => {
    const row = rows[index];
    if (!row) return;

    const identifiedField = row.querySelector('textarea[name^="form_component_10"]');
    const harmedField = row.querySelector('select[name^="form_component_11"]');
    const defineField = row.querySelector('textarea[name^="form_component_12"]');
    const ratingField = row.querySelector('select[name^="form_component_13"]');
    const controlField = row.querySelector('textarea[name^="form_component_14"]');
    const residualField = row.querySelector('select[name^="form_component_15"]');
    const signedField = row.querySelector('input[name^="form_component_16"]');

    if (identifiedField) setValue(identifiedField.name, risk.riskDefinition);
    if (defineField) setValue(defineField.name, risk.howItsARisk);
    if (controlField) setValue(controlField.name, risk.controlMeasures);
    if (ratingField) setValue(ratingField.name, risk.initialRating);
    if (residualField) setValue(residualField.name, risk.ratingAfterControls);
    if (signedField) {
      const signed = assessment.jobTitle
        ? `${assessment.signedBy} (${assessment.jobTitle})`
        : assessment.signedBy;
      setValue(signedField.name, signed);
    }
    if (harmedField) {
      const harmedValues = parseWhoHarmed(risk.whoWillBeHarmed);
      setMultiSelect(harmedField.name, harmedValues);
    }
  });
};

const loadStorage = (keys) =>
  new Promise((resolve) => chrome.storage.local.get(keys, (items) => resolve(items)));

const notifyStepComplete = () =>
  chrome.runtime.sendMessage({ type: "CA_EXTENSION_STEP_COMPLETE" });

const isRiskFormPage = () => Boolean(document.querySelector("#Table_9_9_Table"));

const uploadSignature = async () => {
  const signatureField = document.querySelector('[name="form_component_18_19"]');
  if (!signatureField || signatureField.type !== "file") return false;

  const storedField = document.querySelector('[name="form_component_18_19_stored"]');
  if (storedField && storedField.value) return true;

  try {
    const response = await fetch(SIGNATURE_URL, { cache: "no-store" });
    if (!response.ok) return false;
    const blob = await response.blob();
    const file = new File([blob], "signature.jpg", { type: blob.type || "image/jpeg" });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    signatureField.files = dataTransfer.files;
    signatureField.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  } catch (error) {
    console.warn("Signature upload failed", error);
    return false;
  }
};

const run = async () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get("caAutofill") !== "1") return;

  const { caAcpPayload, caAcpQueueState } = await loadStorage([
    STORAGE_KEYS.payload,
    STORAGE_KEYS.queueState,
  ]);

  if (!caAcpPayload || !Array.isArray(caAcpPayload.assessments)) return;
  if (!caAcpQueueState || typeof caAcpQueueState.currentIndex !== "number") return;
  if (!isRiskFormPage()) return;

  const assessment = caAcpPayload.assessments[caAcpQueueState.currentIndex];
  if (!assessment) return;

  await wait(1000);

  const serviceUserLabel =
    caAcpPayload.serviceUserDisplayName || caAcpPayload.serviceUserInitials || "Service User";
  await fillRiskAssessment(assessment, serviceUserLabel);

  await uploadSignature();
  await wait(1000);
  clickSubmit();
  await wait(2000);

  if (caAcpQueueState.currentIndex + 1 < caAcpQueueState.total) {
    notifyStepComplete();
  } else {
    chrome.storage.local.set({ [STORAGE_KEYS.queueState]: null });
  }
};

run();
