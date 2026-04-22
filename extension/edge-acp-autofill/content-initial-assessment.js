(() => {
if (window.__CA_IA_INITIALIZED) return;
window.__CA_IA_INITIALIZED = true;

/**
 * Content script for Initial Assessment Form autofill
 * Form ID: 1040788
 */

const FALLBACK_STORAGE_KEYS = {
  payload: "caAcpPayload",
  caseInfo: "caAcpCaseInfo",
  queueState: "caAcpQueueState",
  autoSubmit: "caAcpAutoSubmit",
  dryRun: "caAcpDryRun",
  interactionMode: "caAcpInteractionMode",
  overlayPinned: "caAcpOverlayPinned",
  signatureData: "caAcpSignatureData",
  signatureBatchId: "caAcpSignatureBatchId",
  verificationFields: "caAcpVerificationFields",
};

const FALLBACK_STORAGE_HELPERS = {
  get: (keys) =>
    new Promise((resolve) => chrome.storage.local.get(keys, (items) => resolve(items || {}))),
  set: (items) =>
    new Promise((resolve) => chrome.storage.local.set(items, () => resolve())),
};

const { STORAGE_KEYS, MESSAGE_TYPES, STORAGE_HELPERS, DEBUG: CA_DEBUG } = window.CA_EXTENSION_CONSTANTS || {
  STORAGE_KEYS: FALLBACK_STORAGE_KEYS,
  MESSAGE_TYPES: {
    log: "CA_EXTENSION_LOG",
    stepComplete: "CA_EXTENSION_STEP_COMPLETE",
    toggleOverlay: "CA_EXTENSION_TOGGLE_OVERLAY",
  },
  STORAGE_HELPERS: FALLBACK_STORAGE_HELPERS,
};

// Initial Assessment form field mappings based on the HTML structure
const IA_FIELD_MAPPINGS = {
  // Section 1: Initial Assessment/Care Plan
  basicInfo: {
    title: "form_component_965_2",
    serviceUserName: "form_component_2_3",
    nhsNumber: "form_component_1276_4",
    startDateOfService: "form_component_1036_5",
    knownAs: "form_component_447_6",
    address: "form_component_4_7",
    postcode: "form_component_5_8",
    contactNumbers: "form_component_1031_9",
    dateOfBirth: "form_component_1035_10",
    gender: "form_component_1105_11",
    sexualOrientation: "form_component_1106_12",
    religiousBeliefs: "form_component_1107_13",
    ethnicGroup: "form_component_1108_14",
    spokenLanguage: "form_component_513_15",
    culturalNeeds: "form_component_893_16",
  },
  
  // Section 13: Assessment Information
  assessmentInfo: {
    assessmentType: "form_component_1277_1",
    initialVisitReviewDate: "form_component_1283_1",
    sixMonthlyReviewDate: "form_component_1284_1",
    annualReviewDate: "form_component_1285_1",
    assessor: "form_component_449_18",
    dateOfAssessment: "form_component_450_19",
    representativesTable: "Table_967_20",
    presentAtAssessment: "form_component_14_23",
    funder: "form_component_970_24",
    otherFunder: "form_component_972_25",
    careWorkerPreference: "form_component_17_26",
    allergies: "form_component_18_27",
    medicationLevel: "form_component_287_28",
    vaccinationStatus: "form_component_1116_29",
    vaccinationReason: "form_component_1117_30",
  },
  
  // Section 435: Contact Details
  contacts: {
    contactsTable: "Table_436_32",
    emergencyContact: "form_component_455_37",
  },
  
  // Section 515: This is me
  thisIsMe: {
    whoAmI: "form_component_894_39",
    hobbiesInterests: "form_component_895_40",
    goodDay: "form_component_896_41",
    goalsTable: "Table_508_42",
    internetSupport: "form_component_1109_47",
    supportRequired: "form_component_1111_48",
    assistiveTechAwareness: "form_component_1113_49",
    assistiveTechExamples: "form_component_1115_50",
    assistiveTechInPlace: "form_component_1119_51",
  },
  
  // Section 39: Advance Decisions DNR and LPA
  advanceDecisions: {
    advanceDecisionInSitu: "form_component_290_56",
    dnrLocation: "form_component_41_57",
    otherDecisionsToRefuse: "form_component_42_58",
    lpaInPlace: "form_component_291_59",
    poaOptions: "form_component_522_60",
    contactInfo: "form_component_521_61",
  },
  
  // Section 523: My Care Plan
  carePlan: {
    capacityDecisionMaking: "form_component_915_63",
    healthAndWellbeing: "form_component_916_64",
    triggerPoints: "form_component_917_65",
    medicationRequirements: "form_component_921_66",
    nutrition: "form_component_986_67",
    personalCareNeeds: "form_component_987_68",
    mobilityAndEquipment: "form_component_923_69",
    houseworkShopping: "form_component_1074_70",
    financialArrangements: "form_component_924_71",
    companyFinancialPolicies: "form_component_978_72",
    levelOfPotentialRisk: "form_component_1096_73",
    financesRiskTable: "Table_941_74",
  },
  
  // Section 995: Risk Assessments - Mental and Physical Health
  mentalPhysicalHealth: {
    communicationTable: "Table_542_77",
    hearingTable: "Table_547_80",
    eyesightTable: "Table_552_83",
    generalHealthTable: "Table_556_86",
    urinaryIncontinenceTable: "Table_559_89",
    faecalIncontinenceTable: "Table_563_92",
    memory: "form_component_567_96",
    moods: "form_component_568_97",
    orientation: "form_component_569_98",
    sleepPattern: "form_component_570_99",
    behaviours: "form_component_571_100",
    understandsInfo: "form_component_573_102",
    retainsInfo: "form_component_574_103",
    contemplatesProsAndCons: "form_component_575_104",
    communicatesDecision: "form_component_576_105",
    actionsComments: "form_component_578_107",
    potentialRisksTable: "Table_579_108",
  },
  
  // Section 540: Medication Assessment
  medication: {
    orderCollectPrescriptions: "form_component_583_112",
    dosageSystem: "form_component_591_113",
    systemMaintainer: "form_component_590_114",
    medicationStorage: "form_component_589_115",
    currentInvestigations: "form_component_588_116",
    surplusOutOfDate: "form_component_587_117",
    medicationConcerns: "form_component_586_118",
    herbalMedicines: "form_component_585_119",
    takingPRN: "form_component_1056_120",
    covertMedication: "form_component_1057_121",
    pickingUpTablets: "form_component_593_123",
    openingBoxes: "form_component_594_124",
    openingLiquids: "form_component_595_125",
    usingDosageSystem: "form_component_596_126",
    applyingCreams: "form_component_597_127",
    swallowingTablets: "form_component_598_128",
    understandingInstructions: "form_component_599_129",
    managingInhalers: "form_component_600_130",
    instillingDrops: "form_component_601_131",
    additionalMedicationTable: "Table_945_132",
    medicationRiskTable: "Table_948_136",
  },
  
  // Section 1058: Skin Integrity
  skinIntegrity: {
    atRisk: "form_component_1059_140",
    actionsDetails: "form_component_1060_141",
    pictureConsent: "form_component_1087_142",
    bodyMapCompleted: "form_component_1061_143",
  },
  
  // Section 996: Nutrition Assessment
  nutrition: {
    mealAssistance: "form_component_979_145",
    normalDietTable: "Table_612_146",
    specialDietaryTable: "Table_615_149",
    foodAllergiesTable: "Table_614_152",
    softDietTable: "Table_613_155",
    foodIntoleranceTable: "Table_611_158",
    tubeFeedTable: "Table_609_161",
    supplementaryTable: "Table_610_164",
    foodLikesDislikes: "form_component_926_167",
    portionSizes: "form_component_927_168",
    mainMealTime: "form_component_928_169",
    fluidIntake: "form_component_929_170",
    nutritionRisksTable: "Table_605_171",
  },
  
  // Section 1001: Equipment Assessment
  equipment: {
    equipmentTable: "Table_636_175",
    remedialAction: "form_component_659_182",
    equipmentRisksTable: "Table_660_183",
  },
  
  // Section 1002: Mobility Assessment
  mobility: {
    weightBareTable: "Table_664_187",
    walkingTable: "Table_673_190",
    stairsStepsTable: "Table_672_193",
    sitToStandTable: "Table_671_196",
    washingTable: "Table_670_199",
    dressingTable: "Table_669_202",
    oralCareTable: "Table_667_205",
    bathShowerTable: "Table_668_208",
    toiletCommodeTable: "Table_697_211",
    wheelchairTable: "Table_696_214",
    transfersTable: "Table_695_217",
    moveInBedTable: "Table_694_220",
    inOutOfBedTable: "Table_693_223",
    chairToWheelchairTable: "Table_692_226",
    inOutOfCarTable: "Table_691_229",
    otherTransfersTable: "Table_690_232",
    communityAccessTable: "Table_689_235",
    specialistEquipmentTable: "Table_688_238",
    leftAloneTable: "Table_721_241",
    proneToFallsTable: "Table_724_244",
    mobilityRisksTable: "Table_727_247",
  },
  
  // Section 999: Appliances Assessment
  appliances: {
    cooker: "form_component_733_252",
    microwave: "form_component_750_253",
    iron: "form_component_753_254",
    kettle: "form_component_756_255",
    toaster: "form_component_760_256",
    tumbleDryer: "form_component_763_257",
    floorCoverings: "form_component_779_258",
    handGrabRails: "form_component_782_259",
    electricBlanket: "form_component_812_260",
    bed: "form_component_815_261",
    washingMachine: "form_component_824_262",
    centralHeating: "form_component_809_263",
    appliancesActions: "form_component_1000_264",
  },
  
  // Section 1075: Fire Safety
  fireSafety: {
    atRiskOfFire: "form_component_1086_266",
    fireRiskReason: "form_component_1077_267",
    ragRating: "form_component_1078_268",
    plugSockets: "form_component_818_269",
    electricCables: "form_component_821_270",
    smokingPolicy: "form_component_960_271",
    smokeAlarmLocation: "form_component_1083_272",
    smokeAlarmWorking: "form_component_1088_273",
    coDetectorLocation: "form_component_1082_274",
    coDetectorWorking: "form_component_1089_275",
    actionsTaken: "form_component_1080_276",
    actionsDetails: "form_component_1081_277",
    canEvacuate: "form_component_1084_278",
    healthSafetyTable: "Table_980_279",
  },
  
  // Section 1091: COSHH
  coshh: {
    cleaningMaterialsStorage: "form_component_1094_286",
  },
  
  // Section 1003: External Safety
  externalSafety: {
    accessTable: "Table_1005_289",
    pathwaysTable: "Table_834_292",
    externalRailsTable: "Table_839_295",
    entranceStepsTable: "Table_840_298",
    lightingTable: "Table_838_301",
    rampsTable: "Table_837_304",
    personalSecurityTable: "Table_836_307",
    parkingTable: "Table_835_310",
    externalActions: "form_component_1008_313",
    externalRisksTable: "Table_877_314",
  },
  
  // Section 1009: Security Entry and Emergency Access
  securityAccess: {
    accessTable: "Table_880_318",
    keysafeConsent: "form_component_1095_322",
    gasShutOffLocation: "form_component_889_323",
    stopTapLocation: "form_component_888_324",
    fuseBoxLocation: "form_component_1033_325",
    securityRisksTable: "Table_890_326",
  },
  
  // Section 1063: Service User Bands
  serviceUserBands: {
    personalCare: "form_component_1072_330",
    mentalHealth: "form_component_1064_331",
    physicalDisability: "form_component_1065_332",
    dementia: "form_component_1066_333",
    eatingDisorder: "form_component_1067_334",
    sensoryImpairment: "form_component_1068_335",
    detainedMHA: "form_component_1069_336",
    drugAlcoholMisuse: "form_component_1070_337",
    learningDifficulties: "form_component_1071_338",
  },
  
  // Final fields
  completion: {
    dateCompleted: "form_component_935_339",
    nameOfAssessor: "form_component_937_340",
  },
};

// Initial Assessment Form ID
const INITIAL_ASSESSMENT_FORM_ID = "1040788";

const IA_ASSESSMENT_TYPE_OPTIONS = {
  initial: "Initial Visit / Service Setup",
  sixMonthly: "6 Monthly Review",
  annual: "Annual Review",
};

const IA_ASSESSMENT_REVIEW_DATE_FIELDS = {
  [IA_ASSESSMENT_TYPE_OPTIONS.initial]: IA_FIELD_MAPPINGS.assessmentInfo.initialVisitReviewDate,
  [IA_ASSESSMENT_TYPE_OPTIONS.sixMonthly]: IA_FIELD_MAPPINGS.assessmentInfo.sixMonthlyReviewDate,
  [IA_ASSESSMENT_TYPE_OPTIONS.annual]: IA_FIELD_MAPPINGS.assessmentInfo.annualReviewDate,
};

const normalizeAssessmentType = (value) => {
  if (!value || typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";
  if (normalized.includes("annual")) return IA_ASSESSMENT_TYPE_OPTIONS.annual;
  if (normalized.includes("6") || normalized.includes("six") || normalized.includes("monthly")) {
    return IA_ASSESSMENT_TYPE_OPTIONS.sixMonthly;
  }
  if (normalized.includes("initial") || normalized.includes("setup") || normalized.includes("service")) {
    return IA_ASSESSMENT_TYPE_OPTIONS.initial;
  }
  return value.trim();
};

let DRY_RUN = false;
let INTERACTION_MODE = "auto";
let VERIFICATION_SUMMARY_PINNED = false;
const OVERLAY_PINNED_STORAGE_KEY = STORAGE_KEYS.overlayPinned || 'caAcpOverlayPinned';

// Track fields that need human verification
const NEEDS_VERIFICATION = [];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const FIELD_LOOKUP_CACHE = new Map();
const GROUP_LOOKUP_CACHE = new Map();

const isConnectedElement = (element) => Boolean(element && element.isConnected && document.contains(element));

const resolveCachedElement = (cacheKey, resolver) => {
  const cached = FIELD_LOOKUP_CACHE.get(cacheKey);
  if (isConnectedElement(cached)) return cached;
  const resolved = resolver();
  if (isConnectedElement(resolved)) {
    FIELD_LOOKUP_CACHE.set(cacheKey, resolved);
    return resolved;
  }
  FIELD_LOOKUP_CACHE.delete(cacheKey);
  return null;
};

const resolveCachedGroup = (cacheKey, resolver) => {
  const cached = GROUP_LOOKUP_CACHE.get(cacheKey);
  if (Array.isArray(cached) && cached.length > 0 && cached.every(isConnectedElement)) {
    return cached;
  }
  const resolved = resolver();
  if (Array.isArray(resolved) && resolved.length > 0) {
    GROUP_LOOKUP_CACHE.set(cacheKey, resolved);
    return resolved;
  }
  GROUP_LOOKUP_CACHE.delete(cacheKey);
  return [];
};

const resolveTextField = (fieldName) =>
  resolveCachedElement(`text:${fieldName}`, () =>
    document.querySelector(`[name="${fieldName}"]`) ||
    document.querySelector(`#${fieldName}`) ||
    document.querySelector(`#textarea_${fieldName}`)
  );

const resolveNamedField = (fieldName) =>
  resolveCachedElement(`named:${fieldName}`, () =>
    document.querySelector(`[name="${fieldName}"]`) ||
    document.querySelector(`#${fieldName}`)
  );

const resolveRadioGroup = (fieldName) =>
  resolveCachedGroup(`radio:${fieldName}`, () =>
    Array.from(document.querySelectorAll(`[name="${fieldName}"]`))
  );

const resolveCheckboxGroup = (fieldName) =>
  resolveCachedGroup(`checkbox:${fieldName}`, () =>
    Array.from(document.querySelectorAll(`[name="${fieldName}"]`))
  );

const resolveTable = (tableId) =>
  resolveCachedElement(`table:${tableId}`, () =>
    document.querySelector(`#${tableId}_Table`) || document.querySelector(`#${tableId}`)
  );

const resolveTableAddButton = (tableId) =>
  resolveCachedElement(`tableAdd:${tableId}`, () => document.querySelector(`a#${tableId}`));

// Realistic Typing helpers come from realistic-typing.js (loaded first
// in manifest content_scripts). Each declaration falls back to a minimal
// inline implementation so this script keeps working if the shared helper
// somehow fails to load.
const __caRT = window.__CA_RealisticTyping || {};
const setNativeFieldValue = __caRT.setNativeFieldValue || ((field, value) => {
  if (!field) return;
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field) || {}, "value");
  if (descriptor?.set) {
    descriptor.set.call(field, value);
    return;
  }
  field.value = value;
});
const dispatchInputEvent = __caRT.dispatchInputEvent || ((field, data = null) => {
  if (typeof InputEvent === "function") {
    field.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      data,
      inputType: data == null ? "insertReplacementText" : "insertText",
    }));
    return;
  }
  field.dispatchEvent(new Event("input", { bubbles: true }));
});
const dispatchCommitEvents = __caRT.dispatchCommitEvents || ((field) => {
  field.dispatchEvent(new Event("change", { bubbles: true }));
  field.dispatchEvent(new Event("blur", { bubbles: true }));
});
const typeLikeHuman = __caRT.typeLikeHuman || (async (field, value) => {
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
});


const buildProcessedKey = (queueState, payload) => {
  const batchId = queueState?.batchId || payload?.metadata?.batchId || payload?.batchId || payload?.caseId || "legacy";
  const currentIndex = typeof queueState?.currentIndex === "number" ? queueState.currentIndex : "single";
  return `caIAAutofillProcessed_${batchId}_${currentIndex}`;
};

/**
 * Check if a value indicates missing or ambiguous information
 * Returns: 'missing' | 'ambiguous' | 'valid'
 */
const checkValueStatus = (value) => {
  if (!value) return 'missing';
  const normalized = String(value).toLowerCase().trim();
  
  // Check for "information not provided" variations
  if (normalized.includes('information is not provided') ||
      normalized.includes('information not provided') ||
      normalized.includes('not provided') ||
      normalized.includes('no information') ||
      normalized === 'n/a' ||
      normalized === 'na' ||
      normalized === 'unknown') {
    return 'missing';
  }
  
  // Check for ambiguous yes/no (both selected or unclear)
  if (normalized.includes('yes') && normalized.includes('no')) {
    return 'ambiguous';
  }
  if (normalized === 'both' || normalized === 'unclear' || normalized === 'unsure') {
    return 'ambiguous';
  }
  
  return 'valid';
};

/**
 * Highlight a field that needs human verification
 */
const highlightField = (field, reason) => {
  if (!field) return;
  
  // Apply subtle yellow highlight
  field.style.backgroundColor = '#fefce8';
  field.style.border = '1.5px solid hsl(45, 70%, 55%)';
  field.style.boxShadow = '0 0 0 2px hsla(45, 70%, 55%, 0.15)';
  field.setAttribute('data-ca-verification', reason);
  
  // Add title tooltip explaining why
  const tooltipText = reason === 'missing' 
    ? 'Information not provided \u2013 requires verification' 
    : 'Ambiguous answer \u2013 requires verification';
  field.title = tooltipText;
  
  // Highlight parent container for visibility
  const container = field.closest('.form-group') || field.closest('td') || field.parentElement;
  if (container && container !== field) {
    container.style.backgroundColor = '#fefce8';
  }
  
  logAction(`Needs verification (${reason}): ${field.name || field.id}`);
};

/**
 * Highlight radio button group
 */
const highlightRadioGroup = (fieldName, reason) => {
  const radios = document.querySelectorAll(`[name="${fieldName}"]`);
  radios.forEach(radio => {
    const label = radio.closest('label') || radio.parentElement;
    if (label) {
      label.style.backgroundColor = '#fefce8';
      label.style.border = '1.5px solid hsl(45, 70%, 55%)';
      label.style.padding = '2px 4px';
      label.style.borderRadius = '4px';
      label.setAttribute('data-ca-verification', reason);
    }
  });
  
  // Also highlight container
  if (radios.length > 0) {
    const container = radios[0].closest('.form-group') || radios[0].closest('td');
    if (container) {
      container.style.backgroundColor = '#fefce8';
      container.title = reason === 'missing' 
        ? 'Information not provided \u2013 requires verification' 
        : 'Ambiguous answer \u2013 requires verification';
    }
  }
  logAction(`Needs verification (${reason}): ${fieldName}`);
};

const highlightActionField = (field) => {
  if (!field) return;
  field.style.outline = "2px solid #1ea97a";
  field.style.outlineOffset = "2px";
};

const logAction = (message) => {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[IA Autofill] ${message}`);
  try {
    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES?.log || "CA_EXTENSION_LOG",
      entry: `[${timestamp}] [IA] ${message}`,
    });
  } catch (e) {
    // Extension context may be invalid
  }
};

const loadStorage = (keys) => STORAGE_HELPERS.get(keys);
const saveStorage = (items) => STORAGE_HELPERS.set(items);

/**
 * Set value for a text input or textarea
 * Also highlights field if value indicates missing information
 */
const setTextValue = async (fieldName, value) => {
  if (!value && value !== 0) return false;

  const field = resolveTextField(fieldName);
  if (!field) {
    logAction(`Field not found: ${fieldName}`);
    return false;
  }
  
  // Check if value indicates missing information
  const valueStatus = checkValueStatus(value);
  
  if (DRY_RUN) {
    highlightActionField(field);
    logAction(`Dry run: would set ${fieldName}`);
    return true;
  }

  if (INTERACTION_MODE === "manual") {
    highlightActionField(field);
    logAction(`Manual assist: please fill ${fieldName}`);
    return true;
  }
  
  // If information is not provided, highlight and leave empty or set with highlight
  if (valueStatus === 'missing') {
    highlightField(field, 'missing');
    // Still set the value so user can see what was provided, but highlighted
    setNativeFieldValue(field, String(value));
    dispatchInputEvent(field, null);
    dispatchCommitEvents(field);
    NEEDS_VERIFICATION.push({ field: fieldName, reason: 'missing' });
    return true;
  }

  if (INTERACTION_MODE === "slow") {
    await typeLikeHuman(field, String(value));
    return true;
  }

  setNativeFieldValue(field, String(value));
  dispatchInputEvent(field, null);
  dispatchCommitEvents(field);
  return true;
};

/**
 * Set value for a select dropdown
 */
const setSelectValue = async (fieldName, value) => {
  if (!value) return false;
  const field = resolveNamedField(fieldName);
  if (!field || field.tagName !== "SELECT") {
    logAction(`Select field not found: ${fieldName}`);
    return false;
  }
  if (DRY_RUN) {
    highlightActionField(field);
    logAction(`Dry run: would select ${value} for ${fieldName}`);
    return true;
  }

  if (INTERACTION_MODE === "manual") {
    highlightActionField(field);
    logAction(`Manual assist: please select ${value} for ${fieldName}`);
    return true;
  }
  
  // Try exact match first
  const targetValue = String(value).trim().toLowerCase();
  let matched = false;
  
  for (const option of field.options) {
    const optValue = (option.value || "").trim().toLowerCase();
    const optText = (option.textContent || "").trim().toLowerCase();
    if (optValue === targetValue || optText === targetValue || 
        optValue.includes(targetValue) || optText.includes(targetValue)) {
      field.value = option.value;
      matched = true;
      break;
    }
  }
  
  if (matched) {
    field.dispatchEvent(new Event("change", { bubbles: true }));
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }
  return matched;
};

/**
 * Set value for a multi-select dropdown
 */
const setMultiSelectValue = async (fieldName, values) => {
  if (!values || !Array.isArray(values) || values.length === 0) return false;
  const field = resolveNamedField(fieldName);
  if (!field || field.tagName !== "SELECT") {
    logAction(`Multi-select field not found: ${fieldName}`);
    return false;
  }
  if (DRY_RUN) {
    highlightActionField(field);
    logAction(`Dry run: would select ${values.length} options for ${fieldName}`);
    return true;
  }

  if (INTERACTION_MODE === "manual") {
    highlightActionField(field);
    logAction(`Manual assist: please select ${values.length} options for ${fieldName}`);
    return true;
  }
  
  const normalizedValues = values.map((v) => String(v).trim().toLowerCase());
  let matched = 0;
  
  for (const option of field.options) {
    const optValue = (option.value || "").trim().toLowerCase();
    const optText = (option.textContent || "").trim().toLowerCase();
    const shouldSelect = normalizedValues.some((nv) => 
      optValue.includes(nv) || optText.includes(nv) || nv.includes(optValue) || nv.includes(optText)
    );
    option.selected = shouldSelect;
    if (shouldSelect) matched++;
  }
  
  field.dispatchEvent(new Event("change", { bubbles: true }));
  field.dispatchEvent(new Event("input", { bubbles: true }));
  return matched > 0;
};

/**
 * Set value for radio buttons
 * For yes/no fields: if ambiguous (both yes and no indicated), leave blank for human verification
 * If information is not provided, highlight the field
 */
const setRadioValue = async (fieldName, value) => {
  if (!value) return false;

  const radios = resolveRadioGroup(fieldName);
  if (radios.length === 0) {
    logAction(`Radio field not found: ${fieldName}`);
    return false;
  }
  
  // Check if this is a yes/no field and if value is ambiguous or missing
  const valueStatus = checkValueStatus(value);
  
  if (DRY_RUN) {
    highlightActionField(radios[0]);
    logAction(`Dry run: would check radio ${value} for ${fieldName}`);
    return true;
  }
  
  // If value is ambiguous (contains both yes and no), leave blank for human verification
  if (valueStatus === 'ambiguous') {
    highlightRadioGroup(fieldName, 'ambiguous');
    NEEDS_VERIFICATION.push({ field: fieldName, reason: 'ambiguous', value: value });
    logAction(`Skipping ambiguous yes/no for ${fieldName}: "${value}" - left for human verification`);
    return false; // Don't select anything
  }
  
  // If information not provided, highlight but don't select
  if (valueStatus === 'missing') {
    highlightRadioGroup(fieldName, 'missing');
    NEEDS_VERIFICATION.push({ field: fieldName, reason: 'missing', value: value });
    logAction(`Skipping missing info for ${fieldName}: "${value}" - highlighted for verification`);
    return false; // Don't select anything
  }

  if (INTERACTION_MODE === "manual") {
    highlightActionField(radios[0]);
    logAction(`Manual assist: please check radio ${value} for ${fieldName}`);
    return true;
  }
  
  // Value is valid, proceed with selection
  const targetValue = String(value).trim().toLowerCase();
  
  for (const radio of radios) {
    const radioValue = (radio.value || "").trim().toLowerCase();
    if (radioValue === targetValue || radioValue.includes(targetValue) || targetValue.includes(radioValue)) {
      radio.checked = true;
      radio.dispatchEvent(new Event("change", { bubbles: true }));
      radio.dispatchEvent(new Event("click", { bubbles: true }));
      return true;
    }
  }
  return false;
};

/**
 * Set value for checkbox fields
 */
const setCheckboxValue = async (fieldName, values) => {
  if (!values) return false;
  const valuesArray = Array.isArray(values) ? values : [values];
  const normalizedValues = valuesArray.map((v) => String(v).trim().toLowerCase());

  const checkboxes = resolveCheckboxGroup(fieldName);
  if (checkboxes.length === 0) {
    logAction(`Checkbox field not found: ${fieldName}`);
    return false;
  }
  if (DRY_RUN) {
    highlightActionField(checkboxes[0]);
    logAction(`Dry run: would check ${valuesArray.length} checkboxes for ${fieldName}`);
    return true;
  }

  if (INTERACTION_MODE === "manual") {
    highlightActionField(checkboxes[0]);
    logAction(`Manual assist: please check ${valuesArray.length} checkboxes for ${fieldName}`);
    return true;
  }
  
  let matched = 0;
  for (const checkbox of checkboxes) {
    const cbValue = (checkbox.value || "").trim().toLowerCase();
    const shouldCheck = normalizedValues.some((nv) => cbValue.includes(nv) || nv.includes(cbValue));
    checkbox.checked = shouldCheck;
    if (shouldCheck) {
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
      matched++;
    }
  }
  return matched > 0;
};

/**
 * Fill a single-row assessment table with a select value and details textarea
 * Many sections (communication, hearing, eyesight, mobility items, etc.)
 * use a table with one row: [Label | Select | Details Textarea]
 */
const fillAssessmentTable = async (tableId, selectValue, detailsValue) => {
  const table = resolveTable(tableId);
  if (!table) {
    logAction(`Assessment table not found: ${tableId}`);
    return false;
  }
  
  const row = table.querySelector("tbody tr");
  if (!row) {
    logAction(`No row found in assessment table: ${tableId}`);
    return false;
  }
  
  let filled = false;
  
  // Set select value (usually in the 2nd column)
  if (selectValue) {
    const select = row.querySelector("select");
    if (select) {
      if (DRY_RUN) {
        highlightActionField(select);
        logAction(`Dry run: would select ${selectValue} in ${tableId}`);
        filled = true;
      } else if (INTERACTION_MODE === "manual") {
        highlightActionField(select);
        logAction(`Manual assist: please select ${selectValue} in ${tableId}`);
        filled = true;
      } else {
        const targetValue = String(selectValue).trim().toLowerCase();
        for (const option of select.options) {
          const optValue = (option.value || "").trim().toLowerCase();
          const optText = (option.textContent || "").trim().toLowerCase();
          if (optValue === targetValue || optText === targetValue ||
              optValue.includes(targetValue) || optText.includes(targetValue)) {
            select.value = option.value;
            select.dispatchEvent(new Event("change", { bubbles: true }));
            select.dispatchEvent(new Event("input", { bubbles: true }));
            filled = true;
            break;
          }
        }
        if (!filled) {
          logAction(`No matching option for "${selectValue}" in ${tableId}`);
        }
      }
    }
  }
  
  // Set details/textarea value (usually in the 3rd column)
  if (detailsValue) {
    const textarea = row.querySelector("textarea");
    if (textarea) {
      if (DRY_RUN) {
        highlightActionField(textarea);
        logAction(`Dry run: would fill details in ${tableId}`);
      } else if (INTERACTION_MODE === "manual") {
        highlightActionField(textarea);
        logAction(`Manual assist: please fill details in ${tableId}`);
      } else {
        if (INTERACTION_MODE === "slow") {
          await typeLikeHuman(textarea, String(detailsValue));
        } else {
          setNativeFieldValue(textarea, String(detailsValue));
          dispatchInputEvent(textarea, null);
          dispatchCommitEvents(textarea);
        }
      }
      filled = true;
    }
  }
  
  return filled;
};

/**
 * Add rows to a table and fill data
 */
const fillTableRows = async (tableId, rows) => {
  if (!rows || !Array.isArray(rows) || rows.length === 0) return false;

  const table = resolveTable(tableId);
  if (!table) {
    logAction(`Table not found: ${tableId}`);
    return false;
  }

  const addButton = resolveTableAddButton(tableId);
  const existingRows = table.querySelectorAll("tbody tr");
  
  // Add more rows if needed
  if (addButton && rows.length > existingRows.length) {
    const rowsToAdd = rows.length - existingRows.length;
    for (let i = 0; i < rowsToAdd; i++) {
      if (DRY_RUN) {
        highlightActionField(addButton);
        logAction(`Dry run: would add row to ${tableId}`);
        break;
      }
      if (INTERACTION_MODE === "manual") {
        highlightActionField(addButton);
        logAction(`Manual assist: please add a row to ${tableId}`);
        return true;
      }
      addButton.click();
      await wait(300);
    }
  }
  
  // Now fill the rows
  const tableRows = table.querySelectorAll("tbody tr");
  for (let i = 0; i < rows.length && i < tableRows.length; i++) {
    const rowData = rows[i];
    const tableRow = tableRows[i];
    
    for (const [key, value] of Object.entries(rowData)) {
      const input = tableRow.querySelector(`[name*="${key}"], [id*="${key}"]`);
      if (input) {
        if (input.tagName === "SELECT") {
          await setSelectValue(input.name || input.id, value);
        } else if (input.tagName === "TEXTAREA" || input.type === "text") {
          await setTextValue(input.name || input.id, value);
        } else if (input.type === "radio") {
          await setRadioValue(input.name, value);
        }
      }
    }
  }
  
  return true;
};

/**
 * Map Plan Enhancer output to Initial Assessment form fields
 * Handles the comprehensive payload from sendToInitialAssessment
 * 
 * The Plan Enhancer output nests fields under section objects:
 * - planData.thisIsMe.whoAmI
 * - planData.goalSetting.goals
 * - planData.advanceDecisions.advanceDecisionInPlace
 * - planData.myCarePlan.healthAndWellbeing
 * - planData.riskSection1Health.speech
 * - planData.riskSection2Medication.covertMedication
 * - etc.
 * 
 * This mapper unwraps them into flat keys for fillInitialAssessment.
 */
const mapPlanEnhancerToFormData = (planData) => {
  if (!planData) return {};
  
  const formData = {};
  
  // Helper: extract value, picking ONE value from "EXACTLY ONE OF:" or "/" separated options
  const extractSingleValue = (val) => {
    if (!val || typeof val !== 'string') return val;
    // If the AI returned something like "Good" or "Yes", just use it directly
    // Strip any "EXACTLY ONE OF:" prefix the AI might echo back
    return val.replace(/^EXACTLY ONE OF:\s*/i, '').trim();
  };

  const normalizedAssessmentType = normalizeAssessmentType(planData.assessmentType);
  if (normalizedAssessmentType) {
    formData.assessmentType = normalizedAssessmentType;
  }
  
  // === This Is Me Section ===
  if (planData.thisIsMe) {
    formData.whoAmI = planData.thisIsMe.whoAmI || "";
    formData.hobbiesInterests = planData.thisIsMe.hobbiesInterests || "";
    formData.goodDay = planData.thisIsMe.whatMakesGoodDay || "";
    formData.culturalNeeds = planData.thisIsMe.communicationNeeds || "";
  }
  
  // === Goal Setting ===
  const gs = planData.goalSetting || {};
  if (gs.goals && Array.isArray(gs.goals)) {
    formData.goals = gs.goals.map((g) => ({
      goal: g.goal || "",
      howToAchieve: g.howToAchieve || "",
      barriers: g.potentialBarriers || "",
      timeFrame: g.timeFrame || "",
    }));
  }
  if (gs.internetSupport) {
    const isVal = extractSingleValue(gs.internetSupport);
    formData.internetSupport = isVal.toLowerCase().includes("yes") ? "Yes" : "No";
    // Also set support required details
    if (isVal.toLowerCase().includes("yes") && isVal.length > 5) {
      formData.supportRequired = isVal;
    }
  }
  if (gs.assistiveTechnology) {
    formData.assistiveTechExamples = gs.assistiveTechnology;
    // Set awareness based on whether tech is in use
    const atVal = gs.assistiveTechnology.toLowerCase();
    formData.assistiveTechAwareness = (atVal.includes("yes") || atVal.includes("aware") || atVal.includes("uses") || atVal.includes("in place")) ? "Yes" : "No";
  }
  
  // === Advance Decisions ===
  const ad = planData.advanceDecisions || {};
  if (ad.advanceDecisionInPlace) {
    formData.advanceDecisionInSitu = extractSingleValue(ad.advanceDecisionInPlace).toLowerCase().includes("yes") ? "Yes" : "No";
  }
  if (ad.dnrDetails) formData.dnrLocation = ad.dnrDetails;
  if (ad.lastingPOA) {
    formData.lpaInPlace = extractSingleValue(ad.lastingPOA).toLowerCase().includes("yes") ? "Yes" : "No";
  }
  if (ad.poaType) {
    // poaType can be "Health", "Finance", "Both", or specific options
    // Map to the multi-select values
    const poaVal = ad.poaType.toLowerCase();
    const poaOptions = [];
    if (poaVal.includes("health") || poaVal.includes("both")) poaOptions.push("HEALTH AND WELFARE");
    if (poaVal.includes("finance") || poaVal.includes("financial") || poaVal.includes("property") || poaVal.includes("both")) poaOptions.push("PROPERTY AND FINANCIAL AFFAIRS");
    if (poaVal.includes("enduring")) poaOptions.push("ENDURING POWER OF ATTORNEY");
    if (poaVal.includes("court") || poaVal.includes("deputy")) poaOptions.push("COURT OF PROTECTION APPOINTED DEPUTY/S");
    if (poaOptions.length > 0) formData.poaOptions = poaOptions;
  }
  if (ad.poaContact) formData.lpaContactInfo = ad.poaContact;
  
  // === My Care Plan Section ===
  const cp = planData.myCarePlan || {};
  if (cp.capacityAndSafeguarding) formData.capacityDecisionMaking = cp.capacityAndSafeguarding;
  if (cp.healthAndWellbeing) formData.healthAndWellbeing = cp.healthAndWellbeing;
  if (cp.triggerPoints) formData.triggerPoints = cp.triggerPoints;
  if (cp.medicationRequirements) formData.medicationRequirements = cp.medicationRequirements;
  if (cp.nutrition) formData.nutrition = cp.nutrition;
  if (cp.personalCareNeeds) formData.personalCareNeeds = cp.personalCareNeeds;
  if (cp.mobilityAndEquipment) formData.mobilityAndEquipment = cp.mobilityAndEquipment;
  if (cp.houseworkAndSocial) formData.houseworkShopping = cp.houseworkAndSocial;
  if (cp.financialArrangements) formData.financialArrangements = cp.financialArrangements;
  
  // === Risk Section 1: Mental and Physical Health ===
  const r1 = planData.riskSection1Health || {};
  // Communication fields
  if (r1.speech) formData.speech = extractSingleValue(r1.speech);
  if (r1.speechDetails) formData.speechDetails = r1.speechDetails;
  if (r1.hearing) formData.hearing = extractSingleValue(r1.hearing);
  if (r1.hearingDetails) formData.hearingDetails = r1.hearingDetails;
  if (r1.eyesight) formData.eyesight = extractSingleValue(r1.eyesight);
  if (r1.eyesightDetails) formData.eyesightDetails = r1.eyesightDetails;
  // General health
  if (r1.breathlessness) formData.breathlessness = extractSingleValue(r1.breathlessness);
  if (r1.breathlessnessDetails) formData.breathlessnessDetails = r1.breathlessnessDetails;
  if (r1.urinaryIncontinence) formData.urinaryIncontinence = extractSingleValue(r1.urinaryIncontinence);
  if (r1.urinaryDetails) formData.urinaryDetails = r1.urinaryDetails;
  if (r1.faecalIncontinence) formData.faecalIncontinence = extractSingleValue(r1.faecalIncontinence);
  if (r1.faecalDetails) formData.faecalDetails = r1.faecalDetails;
  // Mental health assessment
  if (r1.memory) formData.memory = extractSingleValue(r1.memory);
  if (r1.moods) formData.moods = extractSingleValue(r1.moods);
  if (r1.orientation) formData.orientation = extractSingleValue(r1.orientation);
  if (r1.sleepPattern) formData.sleepPattern = extractSingleValue(r1.sleepPattern);
  if (r1.behaviours) formData.behaviours = extractSingleValue(r1.behaviours);
  // Mental capacity assessment
  if (r1.understandsInfo) formData.understandsInfo = extractSingleValue(r1.understandsInfo);
  if (r1.retainsInfo) formData.retainsInfo = extractSingleValue(r1.retainsInfo);
  if (r1.weighsDecision) formData.contemplatesProsAndCons = extractSingleValue(r1.weighsDecision);
  if (r1.communicatesDecision) formData.communicatesDecision = extractSingleValue(r1.communicatesDecision);
  if (r1.capacityDetails) formData.actionsComments = r1.capacityDetails;
  // Risk level
  if (r1.riskLevel) formData.healthRiskLevel = extractSingleValue(r1.riskLevel);
  if (r1.riskPrevention) formData.healthRiskPrevention = r1.riskPrevention;
  
  // === Risk Section 2: Medication ===
  const r2 = planData.riskSection2Medication || {};
  if (r2.prescriptionOrdering) formData.orderCollectPrescriptions = r2.prescriptionOrdering;
  if (r2.dosageSystem) formData.dosageSystem = r2.dosageSystem;
  if (r2.systemMaintainer) formData.systemMaintainer = r2.systemMaintainer;
  if (r2.medicationStorage) formData.medicationStorage = r2.medicationStorage;
  if (r2.currentInvestigations) formData.currentInvestigations = r2.currentInvestigations;
  if (r2.surplusMedication) formData.surplusOutOfDate = r2.surplusMedication;
  if (r2.medicationConcerns) formData.medicationConcerns = r2.medicationConcerns;
  if (r2.homeopathicMeds) formData.herbalMedicines = r2.homeopathicMeds;
  if (r2.prnMedication) formData.takingPRN = extractSingleValue(r2.prnMedication);
  if (r2.covertMedication) formData.covertMedication = extractSingleValue(r2.covertMedication);
  // Medication difficulties - ensure single value YES/NO/N/A
  if (r2.pickingUpTablets) formData.pickingUpTablets = extractSingleValue(r2.pickingUpTablets);
  if (r2.openingBoxes) formData.openingBoxes = extractSingleValue(r2.openingBoxes);
  if (r2.pouringLiquids) formData.openingLiquids = extractSingleValue(r2.pouringLiquids);
  if (r2.usingDosageSystem) formData.usingDosageSystem = extractSingleValue(r2.usingDosageSystem);
  if (r2.applyingCreams) formData.applyingCreams = extractSingleValue(r2.applyingCreams);
  if (r2.swallowingTablets) formData.swallowingTablets = extractSingleValue(r2.swallowingTablets);
  if (r2.understandingInstructions) formData.understandingInstructions = extractSingleValue(r2.understandingInstructions);
  if (r2.managingInhalers) formData.managingInhalers = extractSingleValue(r2.managingInhalers);
  if (r2.instillingDrops) formData.instillingDrops = extractSingleValue(r2.instillingDrops);
  // Skin integrity (lives under medication section in the form)
  if (r2.skinIntegrity) {
    formData.skinIntegrityRisk = extractSingleValue(r2.skinIntegrity).toLowerCase().includes("yes") ? "Yes" : "No";
  }
  if (r2.skinDetails) formData.skinIntegrityDetails = r2.skinDetails;
  if (r2.pictureConsent) {
    formData.pictureConsent = extractSingleValue(r2.pictureConsent).toLowerCase().includes("yes") ? "Yes" : "No";
  }
  if (r2.bodyMapCompleted) {
    formData.bodyMapCompleted = extractSingleValue(r2.bodyMapCompleted).toLowerCase().includes("yes") ? "Yes" : "No";
  }
  
  // === Risk Section 3: Nutrition ===
  const r3 = planData.riskSection3Nutrition || {};
  if (r3.mealAssistance) {
    formData.mealAssistance = extractSingleValue(r3.mealAssistance).toLowerCase().includes("yes") ? "Yes" : "No";
  }
  if (r3.normalDiet) formData.normalDiet = extractSingleValue(r3.normalDiet);
  if (r3.normalDietDetails) formData.normalDietDetails = r3.normalDietDetails;
  if (r3.specialDietary) formData.specialDietary = extractSingleValue(r3.specialDietary);
  if (r3.specialDietaryDetails) formData.specialDietaryDetails = r3.specialDietaryDetails;
  if (r3.foodAllergies) formData.foodAllergies = extractSingleValue(r3.foodAllergies);
  if (r3.foodAllergiesDetails) formData.foodAllergiesDetails = r3.foodAllergiesDetails;
  if (r3.softDiet) formData.softDiet = extractSingleValue(r3.softDiet);
  if (r3.softDietDetails) formData.softDietDetails = r3.softDietDetails;
  if (r3.foodIntolerances) formData.foodIntolerances = extractSingleValue(r3.foodIntolerances);
  if (r3.foodIntolerancesDetails) formData.foodIntolerancesDetails = r3.foodIntolerancesDetails;
  if (r3.tubeFeed) formData.tubeFeed = extractSingleValue(r3.tubeFeed);
  if (r3.tubeFeedDetails) formData.tubeFeedDetails = r3.tubeFeedDetails;
  if (r3.supplementaryFoods) formData.supplementaryFoods = extractSingleValue(r3.supplementaryFoods);
  if (r3.supplementaryFoodsDetails) formData.supplementaryFoodsDetails = r3.supplementaryFoodsDetails;
  // Combine food likes/dislikes
  const foodPrefs = [];
  if (r3.foodLikes) foodPrefs.push(`Foods I like: ${r3.foodLikes}`);
  if (r3.foodDislikes) foodPrefs.push(`Foods I dislike: ${r3.foodDislikes}`);
  if (foodPrefs.length > 0) formData.foodLikesDislikes = foodPrefs.join("\n\n");
  if (r3.portionSize) formData.portionSizes = r3.portionSize;
  if (r3.mainMealTime) formData.mainMealTime = r3.mainMealTime;
  if (r3.fluidIntake) formData.fluidIntake = r3.fluidIntake;
  
  // === Risk Section 4: Equipment ===
  const r4 = planData.riskSection4Equipment || {};
  if (r4.equipment && Array.isArray(r4.equipment)) {
    formData.equipment = r4.equipment.map((eq) => ({
      name: eq.name || "",
      fitForPurpose: extractSingleValue(eq.fitForPurpose) || "",
      supplier: eq.supplier || "",
      nextService: eq.nextService || "",
    }));
  }
  if (r4.remedialAction) formData.remedialAction = r4.remedialAction;
  
  // === Risk Section 5: Mobility ===
  const r5 = planData.riskSection5Mobility || {};
  if (r5.weightBearing) formData.weightBearing = extractSingleValue(r5.weightBearing);
  if (r5.weightBearingDetails) formData.weightBearingDetails = r5.weightBearingDetails;
  if (r5.walking) formData.walking = extractSingleValue(r5.walking);
  if (r5.walkingDetails) formData.walkingDetails = r5.walkingDetails;
  if (r5.stairs) formData.stairs = extractSingleValue(r5.stairs);
  if (r5.stairsDetails) formData.stairsDetails = r5.stairsDetails;
  if (r5.sitToStand) formData.sitToStand = extractSingleValue(r5.sitToStand);
  if (r5.sitToStandDetails) formData.sitToStandDetails = r5.sitToStandDetails;
  if (r5.washing) formData.washing = extractSingleValue(r5.washing);
  if (r5.washingDetails) formData.washingDetails = r5.washingDetails;
  if (r5.dressing) formData.dressing = extractSingleValue(r5.dressing);
  if (r5.dressingDetails) formData.dressingDetails = r5.dressingDetails;
  if (r5.oralCare) formData.oralCare = extractSingleValue(r5.oralCare);
  if (r5.oralCareDetails) formData.oralCareDetails = r5.oralCareDetails;
  if (r5.bathShower) formData.bathShower = extractSingleValue(r5.bathShower);
  if (r5.bathShowerDetails) formData.bathShowerDetails = r5.bathShowerDetails;
  if (r5.toiletCommode) formData.toiletCommode = extractSingleValue(r5.toiletCommode);
  if (r5.toiletCommodeDetails) formData.toiletCommodeDetails = r5.toiletCommodeDetails;
  if (r5.wheelchair) formData.wheelchair = extractSingleValue(r5.wheelchair);
  if (r5.wheelchairDetails) formData.wheelchairDetails = r5.wheelchairDetails;
  if (r5.transfers) formData.transfers = extractSingleValue(r5.transfers);
  if (r5.transfersDetails) formData.transfersDetails = r5.transfersDetails;
  if (r5.moveInBed) formData.moveInBed = extractSingleValue(r5.moveInBed);
  if (r5.moveInBedDetails) formData.moveInBedDetails = r5.moveInBedDetails;
  if (r5.inOutOfBed) formData.inOutOfBed = extractSingleValue(r5.inOutOfBed);
  if (r5.inOutOfBedDetails) formData.inOutOfBedDetails = r5.inOutOfBedDetails;
  if (r5.chairToWheelchair) formData.chairToWheelchair = extractSingleValue(r5.chairToWheelchair);
  if (r5.chairToWheelchairDetails) formData.chairToWheelchairDetails = r5.chairToWheelchairDetails;
  if (r5.inOutOfCar) formData.inOutOfCar = extractSingleValue(r5.inOutOfCar);
  if (r5.inOutOfCarDetails) formData.inOutOfCarDetails = r5.inOutOfCarDetails;
  if (r5.otherTransfers) formData.otherTransfers = extractSingleValue(r5.otherTransfers);
  if (r5.otherTransfersDetails) formData.otherTransfersDetails = r5.otherTransfersDetails;
  if (r5.communityAccess) formData.communityAccess = extractSingleValue(r5.communityAccess);
  if (r5.communityAccessDetails) formData.communityAccessDetails = r5.communityAccessDetails;
  if (r5.specialistEquipment) formData.specialistEquipment = extractSingleValue(r5.specialistEquipment);
  if (r5.specialistEquipmentDetails) formData.specialistEquipmentDetails = r5.specialistEquipmentDetails;
  if (r5.canBeLeftAlone) formData.canBeLeftAlone = extractSingleValue(r5.canBeLeftAlone);
  if (r5.canBeLeftAloneDetails) formData.canBeLeftAloneDetails = r5.canBeLeftAloneDetails;
  if (r5.proneToFalls) formData.proneToFalls = extractSingleValue(r5.proneToFalls);
  if (r5.proneToFallsDetails) formData.proneToFallsDetails = r5.proneToFallsDetails;
  
  // === Risk Section 6: Appliances ===
  const r6 = planData.riskSection6Appliances || {};
  if (r6.cooker) formData.cooker = extractSingleValue(r6.cooker);
  if (r6.microwave) formData.microwave = extractSingleValue(r6.microwave);
  if (r6.iron) formData.iron = extractSingleValue(r6.iron);
  if (r6.kettle) formData.kettle = extractSingleValue(r6.kettle);
  if (r6.toaster) formData.toaster = extractSingleValue(r6.toaster);
  if (r6.tumbleDryer) formData.tumbleDryer = extractSingleValue(r6.tumbleDryer);
  if (r6.floorCoverings) formData.floorCoverings = extractSingleValue(r6.floorCoverings);
  if (r6.handRails) formData.handGrabRails = extractSingleValue(r6.handRails);
  if (r6.electricBlanket) formData.electricBlanket = extractSingleValue(r6.electricBlanket);
  if (r6.bed) formData.bed = extractSingleValue(r6.bed);
  if (r6.washingMachine) formData.washingMachine = extractSingleValue(r6.washingMachine);
  if (r6.centralHeating) formData.centralHeating = extractSingleValue(r6.centralHeating);
  if (r6.actionsRequired) formData.appliancesActions = r6.actionsRequired;
  
  // === Risk Section 7: Fire Safety ===
  const r7 = planData.riskSection7Fire || {};
  if (r7.atRisk) {
    formData.atRiskOfFire = extractSingleValue(r7.atRisk).toLowerCase().includes("yes") ? "Yes" : "No";
  }
  // riskReasons is an array for multi-select
  if (r7.riskReasons && Array.isArray(r7.riskReasons)) {
    formData.fireRiskReason = r7.riskReasons;
  } else if (r7.riskReason) {
    // Legacy: single string, split by comma
    formData.fireRiskReason = r7.riskReason.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
  }
  if (r7.ragRating) formData.ragRating = extractSingleValue(r7.ragRating);
  if (r7.plugSockets) formData.plugSockets = extractSingleValue(r7.plugSockets);
  if (r7.electricCables) formData.electricCables = extractSingleValue(r7.electricCables);
  if (r7.smokingPolicy) {
    formData.smokingPolicy = extractSingleValue(r7.smokingPolicy).toLowerCase().includes("yes") ? "Yes" : "No";
  }
  if (r7.smokeAlarmLocation) formData.smokeAlarmLocation = r7.smokeAlarmLocation;
  if (r7.smokeAlarmWorking) {
    formData.smokeAlarmWorking = extractSingleValue(r7.smokeAlarmWorking).toLowerCase().includes("yes") ? "Yes" : "No";
  }
  if (r7.coDetectorLocation) formData.coDetectorLocation = r7.coDetectorLocation;
  if (r7.coDetectorWorking) {
    formData.coDetectorWorking = extractSingleValue(r7.coDetectorWorking).toLowerCase().includes("yes") ? "Yes" : "No";
  }
  if (r7.actionsTaken) formData.fireActionsTaken = extractSingleValue(r7.actionsTaken);
  if (r7.actionsDetails) formData.fireActionsDetails = r7.actionsDetails;
  // Legacy field name support
  if (r7.actionsAndSafety && !r7.actionsDetails) formData.fireActionsDetails = r7.actionsAndSafety;
  if (r7.canEvacuate) formData.canEvacuate = r7.canEvacuate;
  
  // === Risk Section 8: COSHH ===
  const r8 = planData.riskSection8COSHH || {};
  if (r8.cleaningStorage) formData.cleaningMaterialsStorage = r8.cleaningStorage;
  
  // === Risk Section 9: External Access ===
  const r9 = planData.riskSection9External || {};
  if (r9.access) formData.access = extractSingleValue(r9.access);
  if (r9.clearPathways) formData.clearPathways = extractSingleValue(r9.clearPathways);
  if (r9.handrails) formData.handrails = extractSingleValue(r9.handrails);
  if (r9.entranceSteps) formData.entranceSteps = extractSingleValue(r9.entranceSteps);
  if (r9.lighting) formData.lighting = extractSingleValue(r9.lighting);
  if (r9.ramps) formData.ramps = extractSingleValue(r9.ramps);
  if (r9.personalSecurity) formData.personalSecurity = extractSingleValue(r9.personalSecurity);
  if (r9.parking) formData.parking = extractSingleValue(r9.parking);
  if (r9.actionsRequired) formData.externalActions = r9.actionsRequired;
  
  // === Risk Section 10: Security ===
  const r10 = planData.riskSection10Security || {};
  if (r10.meansOfAccess) formData.meansOfAccess = extractSingleValue(r10.meansOfAccess);
  if (r10.propertyType) formData.propertyType = extractSingleValue(r10.propertyType);
  if (r10.enterUsing) formData.enterUsing = extractSingleValue(r10.enterUsing);
  if (r10.keysafeConsent) {
    formData.keysafeConsent = extractSingleValue(r10.keysafeConsent).toLowerCase().includes("yes") ? "Yes" : "No";
  }
  if (r10.gasShutOff) formData.gasShutOffLocation = r10.gasShutOff;
  if (r10.stopTap) formData.stopTapLocation = r10.stopTap;
  if (r10.fuseBox) formData.fuseBoxLocation = r10.fuseBox;
  
  // === Section 11: Service User Bands ===
  const s11 = planData.section11Bands || {};
  const bandFields = [
    "personalCare", "mentalHealth", "physicalDisability", "dementia",
    "eatingDisorder", "sensoryImpairment", "detainedMHA", "drugAlcoholMisuse",
    "learningDifficulties"
  ];
  for (const field of bandFields) {
    if (s11[field]) {
      formData[field] = extractSingleValue(s11[field]).toLowerCase().includes("yes") ? "Yes" : "No";
    }
  }
  
  return formData;
};

/**
 * Fill the Initial Assessment form with provided data
 */
const fillInitialAssessment = async (data, metadata = {}) => {
  logAction("Starting Initial Assessment autofill...");
  
  // Reset verification tracking for new fill
  NEEDS_VERIFICATION.length = 0;
  
  // Basic Info Section
  if (data.title) await setSelectValue(IA_FIELD_MAPPINGS.basicInfo.title, data.title);
  if (data.serviceUserName) await setTextValue(IA_FIELD_MAPPINGS.basicInfo.serviceUserName, data.serviceUserName);
  if (data.nhsNumber) await setTextValue(IA_FIELD_MAPPINGS.basicInfo.nhsNumber, data.nhsNumber);
  if (data.startDateOfService) await setTextValue(IA_FIELD_MAPPINGS.basicInfo.startDateOfService, data.startDateOfService);
  if (data.knownAs) await setTextValue(IA_FIELD_MAPPINGS.basicInfo.knownAs, data.knownAs);
  if (data.address) await setTextValue(IA_FIELD_MAPPINGS.basicInfo.address, data.address);
  if (data.postcode) await setTextValue(IA_FIELD_MAPPINGS.basicInfo.postcode, data.postcode);
  if (data.contactNumbers) await setTextValue(IA_FIELD_MAPPINGS.basicInfo.contactNumbers, data.contactNumbers);
  if (data.dateOfBirth) await setTextValue(IA_FIELD_MAPPINGS.basicInfo.dateOfBirth, data.dateOfBirth);
  if (data.gender) await setSelectValue(IA_FIELD_MAPPINGS.basicInfo.gender, data.gender);
  if (data.sexualOrientation) await setSelectValue(IA_FIELD_MAPPINGS.basicInfo.sexualOrientation, data.sexualOrientation);
  if (data.religiousBeliefs) await setSelectValue(IA_FIELD_MAPPINGS.basicInfo.religiousBeliefs, data.religiousBeliefs);
  if (data.ethnicGroup) await setSelectValue(IA_FIELD_MAPPINGS.basicInfo.ethnicGroup, data.ethnicGroup);
  if (data.spokenLanguage) await setTextValue(IA_FIELD_MAPPINGS.basicInfo.spokenLanguage, data.spokenLanguage);
  if (data.culturalNeeds) await setTextValue(IA_FIELD_MAPPINGS.basicInfo.culturalNeeds, data.culturalNeeds);
  
  logAction("Basic info section complete");
  
  // Assessment Info Section
  const selectedAssessmentType = normalizeAssessmentType(data.assessmentType || metadata.assessmentType);
  if (selectedAssessmentType) {
    await setSelectValue(IA_FIELD_MAPPINGS.assessmentInfo.assessmentType, selectedAssessmentType);
    await wait(150);
  }

  if (data.assessor || metadata.assessor) {
    await setTextValue(IA_FIELD_MAPPINGS.assessmentInfo.assessor, data.assessor || metadata.assessor);
  }
  const assessmentDate = data.dateOfAssessment || metadata.date;
  if (assessmentDate) {
    await setTextValue(IA_FIELD_MAPPINGS.assessmentInfo.dateOfAssessment, assessmentDate);
    const conditionalDateField = selectedAssessmentType
      ? IA_ASSESSMENT_REVIEW_DATE_FIELDS[selectedAssessmentType]
      : null;
    if (conditionalDateField) {
      await setTextValue(conditionalDateField, assessmentDate);
    }
  }
  if (data.presentAtAssessment) await setTextValue(IA_FIELD_MAPPINGS.assessmentInfo.presentAtAssessment, data.presentAtAssessment);
  if (data.funder) await setRadioValue(IA_FIELD_MAPPINGS.assessmentInfo.funder, data.funder);
  if (data.otherFunder) await setTextValue(IA_FIELD_MAPPINGS.assessmentInfo.otherFunder, data.otherFunder);
  if (data.careWorkerPreference) await setTextValue(IA_FIELD_MAPPINGS.assessmentInfo.careWorkerPreference, data.careWorkerPreference);
  if (data.allergies) await setTextValue(IA_FIELD_MAPPINGS.assessmentInfo.allergies, data.allergies);
  if (data.medicationLevel) await setRadioValue(IA_FIELD_MAPPINGS.assessmentInfo.medicationLevel, data.medicationLevel);
  if (data.vaccinationStatus) await setRadioValue(IA_FIELD_MAPPINGS.assessmentInfo.vaccinationStatus, data.vaccinationStatus);
  if (data.vaccinationReason) await setTextValue(IA_FIELD_MAPPINGS.assessmentInfo.vaccinationReason, data.vaccinationReason);
  
  logAction("Assessment info section complete");
  
  // Contacts Section
  if (data.emergencyContact) await setTextValue(IA_FIELD_MAPPINGS.contacts.emergencyContact, data.emergencyContact);
  if (data.contacts && Array.isArray(data.contacts)) {
    await fillTableRows("Table_436_32", data.contacts);
  }
  
  // This Is Me Section
  if (data.whoAmI) await setTextValue(IA_FIELD_MAPPINGS.thisIsMe.whoAmI, data.whoAmI);
  if (data.hobbiesInterests) await setTextValue(IA_FIELD_MAPPINGS.thisIsMe.hobbiesInterests, data.hobbiesInterests);
  if (data.goodDay) await setTextValue(IA_FIELD_MAPPINGS.thisIsMe.goodDay, data.goodDay);
  if (data.internetSupport) await setRadioValue(IA_FIELD_MAPPINGS.thisIsMe.internetSupport, data.internetSupport);
  if (data.supportRequired) await setTextValue(IA_FIELD_MAPPINGS.thisIsMe.supportRequired, data.supportRequired);
  if (data.assistiveTechAwareness) await setRadioValue(IA_FIELD_MAPPINGS.thisIsMe.assistiveTechAwareness, data.assistiveTechAwareness);
  if (data.assistiveTechExamples) await setTextValue(IA_FIELD_MAPPINGS.thisIsMe.assistiveTechExamples, data.assistiveTechExamples);
  if (data.assistiveTechInPlace && Array.isArray(data.assistiveTechInPlace)) {
    await setMultiSelectValue(IA_FIELD_MAPPINGS.thisIsMe.assistiveTechInPlace, data.assistiveTechInPlace);
  }
  if (data.goals && Array.isArray(data.goals)) {
    await fillTableRows("Table_508_42", data.goals);
  }
  
  logAction("This is me section complete");
  
  // Advance Decisions and LPA
  if (data.advanceDecisionInSitu) await setRadioValue(IA_FIELD_MAPPINGS.advanceDecisions.advanceDecisionInSitu, data.advanceDecisionInSitu);
  if (data.dnrLocation) await setTextValue(IA_FIELD_MAPPINGS.advanceDecisions.dnrLocation, data.dnrLocation);
  if (data.otherDecisionsToRefuse) await setTextValue(IA_FIELD_MAPPINGS.advanceDecisions.otherDecisionsToRefuse, data.otherDecisionsToRefuse);
  if (data.lpaInPlace) await setRadioValue(IA_FIELD_MAPPINGS.advanceDecisions.lpaInPlace, data.lpaInPlace);
  if (data.poaOptions && Array.isArray(data.poaOptions)) {
    await setMultiSelectValue(IA_FIELD_MAPPINGS.advanceDecisions.poaOptions, data.poaOptions);
  }
  if (data.lpaContactInfo) await setTextValue(IA_FIELD_MAPPINGS.advanceDecisions.contactInfo, data.lpaContactInfo);
  
  // My Care Plan Section
  if (data.capacityDecisionMaking) await setTextValue(IA_FIELD_MAPPINGS.carePlan.capacityDecisionMaking, data.capacityDecisionMaking);
  if (data.healthAndWellbeing) await setTextValue(IA_FIELD_MAPPINGS.carePlan.healthAndWellbeing, data.healthAndWellbeing);
  if (data.triggerPoints) await setTextValue(IA_FIELD_MAPPINGS.carePlan.triggerPoints, data.triggerPoints);
  if (data.medicationRequirements) await setTextValue(IA_FIELD_MAPPINGS.carePlan.medicationRequirements, data.medicationRequirements);
  if (data.nutrition) await setTextValue(IA_FIELD_MAPPINGS.carePlan.nutrition, data.nutrition);
  if (data.personalCareNeeds) await setTextValue(IA_FIELD_MAPPINGS.carePlan.personalCareNeeds, data.personalCareNeeds);
  if (data.mobilityAndEquipment) await setTextValue(IA_FIELD_MAPPINGS.carePlan.mobilityAndEquipment, data.mobilityAndEquipment);
  if (data.houseworkShopping) await setTextValue(IA_FIELD_MAPPINGS.carePlan.houseworkShopping, data.houseworkShopping);
  if (data.financialArrangements) await setTextValue(IA_FIELD_MAPPINGS.carePlan.financialArrangements, data.financialArrangements);
  if (data.companyFinancialPolicies) await setRadioValue(IA_FIELD_MAPPINGS.carePlan.companyFinancialPolicies, data.companyFinancialPolicies || "Yes");
  if (data.levelOfPotentialRisk) await setSelectValue(IA_FIELD_MAPPINGS.carePlan.levelOfPotentialRisk, data.levelOfPotentialRisk);
  
  logAction("Care plan section complete");
  
  // Mental and Physical Health Section
  // Communication, Hearing, Eyesight tables (select + details)
  if (data.speech || data.speechDetails) {
    await fillAssessmentTable(IA_FIELD_MAPPINGS.mentalPhysicalHealth.communicationTable, data.speech, data.speechDetails);
  }
  if (data.hearing || data.hearingDetails) {
    await fillAssessmentTable(IA_FIELD_MAPPINGS.mentalPhysicalHealth.hearingTable, data.hearing, data.hearingDetails);
  }
  if (data.eyesight || data.eyesightDetails) {
    await fillAssessmentTable(IA_FIELD_MAPPINGS.mentalPhysicalHealth.eyesightTable, data.eyesight, data.eyesightDetails);
  }
  // General Health tables
  if (data.breathlessness || data.breathlessnessDetails) {
    await fillAssessmentTable(IA_FIELD_MAPPINGS.mentalPhysicalHealth.generalHealthTable, data.breathlessness, data.breathlessnessDetails);
  }
  if (data.urinaryIncontinence || data.urinaryDetails) {
    await fillAssessmentTable(IA_FIELD_MAPPINGS.mentalPhysicalHealth.urinaryIncontinenceTable, data.urinaryIncontinence, data.urinaryDetails);
  }
  if (data.faecalIncontinence || data.faecalDetails) {
    await fillAssessmentTable(IA_FIELD_MAPPINGS.mentalPhysicalHealth.faecalIncontinenceTable, data.faecalIncontinence, data.faecalDetails);
  }
  // Mental health dropdowns (direct select fields)
  if (data.memory) await setSelectValue(IA_FIELD_MAPPINGS.mentalPhysicalHealth.memory, data.memory);
  if (data.moods) await setSelectValue(IA_FIELD_MAPPINGS.mentalPhysicalHealth.moods, data.moods);
  if (data.orientation) await setSelectValue(IA_FIELD_MAPPINGS.mentalPhysicalHealth.orientation, data.orientation);
  if (data.sleepPattern) await setSelectValue(IA_FIELD_MAPPINGS.mentalPhysicalHealth.sleepPattern, data.sleepPattern);
  if (data.behaviours) await setSelectValue(IA_FIELD_MAPPINGS.mentalPhysicalHealth.behaviours, data.behaviours);
  // Mental capacity radios
  if (data.understandsInfo) await setRadioValue(IA_FIELD_MAPPINGS.mentalPhysicalHealth.understandsInfo, data.understandsInfo);
  if (data.retainsInfo) await setRadioValue(IA_FIELD_MAPPINGS.mentalPhysicalHealth.retainsInfo, data.retainsInfo);
  if (data.contemplatesProsAndCons) await setRadioValue(IA_FIELD_MAPPINGS.mentalPhysicalHealth.contemplatesProsAndCons, data.contemplatesProsAndCons);
  if (data.communicatesDecision) await setRadioValue(IA_FIELD_MAPPINGS.mentalPhysicalHealth.communicatesDecision, data.communicatesDecision);
  if (data.actionsComments) await setTextValue(IA_FIELD_MAPPINGS.mentalPhysicalHealth.actionsComments, data.actionsComments);
  
  logAction("Mental and physical health section complete");
  
  // Medication Section
  if (data.orderCollectPrescriptions) await setTextValue(IA_FIELD_MAPPINGS.medication.orderCollectPrescriptions, data.orderCollectPrescriptions);
  if (data.dosageSystem) await setTextValue(IA_FIELD_MAPPINGS.medication.dosageSystem, data.dosageSystem);
  if (data.systemMaintainer) await setTextValue(IA_FIELD_MAPPINGS.medication.systemMaintainer, data.systemMaintainer);
  if (data.medicationStorage) await setTextValue(IA_FIELD_MAPPINGS.medication.medicationStorage, data.medicationStorage);
  if (data.currentInvestigations) await setTextValue(IA_FIELD_MAPPINGS.medication.currentInvestigations, data.currentInvestigations);
  if (data.surplusOutOfDate) await setTextValue(IA_FIELD_MAPPINGS.medication.surplusOutOfDate, data.surplusOutOfDate);
  if (data.medicationConcerns) await setTextValue(IA_FIELD_MAPPINGS.medication.medicationConcerns, data.medicationConcerns);
  if (data.herbalMedicines) await setTextValue(IA_FIELD_MAPPINGS.medication.herbalMedicines, data.herbalMedicines);
  if (data.takingPRN) await setRadioValue(IA_FIELD_MAPPINGS.medication.takingPRN, data.takingPRN);
  if (data.covertMedication) await setRadioValue(IA_FIELD_MAPPINGS.medication.covertMedication, data.covertMedication);
  // Medication difficulties (radio YES/NO/N/A)
  if (data.pickingUpTablets) await setRadioValue(IA_FIELD_MAPPINGS.medication.pickingUpTablets, data.pickingUpTablets);
  if (data.openingBoxes) await setRadioValue(IA_FIELD_MAPPINGS.medication.openingBoxes, data.openingBoxes);
  if (data.openingLiquids) await setRadioValue(IA_FIELD_MAPPINGS.medication.openingLiquids, data.openingLiquids);
  if (data.usingDosageSystem) await setRadioValue(IA_FIELD_MAPPINGS.medication.usingDosageSystem, data.usingDosageSystem);
  if (data.applyingCreams) await setRadioValue(IA_FIELD_MAPPINGS.medication.applyingCreams, data.applyingCreams);
  if (data.swallowingTablets) await setRadioValue(IA_FIELD_MAPPINGS.medication.swallowingTablets, data.swallowingTablets);
  if (data.understandingInstructions) await setRadioValue(IA_FIELD_MAPPINGS.medication.understandingInstructions, data.understandingInstructions);
  if (data.managingInhalers) await setRadioValue(IA_FIELD_MAPPINGS.medication.managingInhalers, data.managingInhalers);
  if (data.instillingDrops) await setRadioValue(IA_FIELD_MAPPINGS.medication.instillingDrops, data.instillingDrops);
  
  logAction("Medication section complete");
  
  // Skin Integrity
  if (data.skinIntegrityRisk) await setRadioValue(IA_FIELD_MAPPINGS.skinIntegrity.atRisk, data.skinIntegrityRisk);
  if (data.skinIntegrityDetails) await setTextValue(IA_FIELD_MAPPINGS.skinIntegrity.actionsDetails, data.skinIntegrityDetails);
  if (data.pictureConsent) await setRadioValue(IA_FIELD_MAPPINGS.skinIntegrity.pictureConsent, data.pictureConsent);
  if (data.bodyMapCompleted) await setRadioValue(IA_FIELD_MAPPINGS.skinIntegrity.bodyMapCompleted, data.bodyMapCompleted);
  
  // Nutrition Section (assessment tables with Yes/No select + details textarea)
  if (data.mealAssistance) await setRadioValue(IA_FIELD_MAPPINGS.nutrition.mealAssistance, data.mealAssistance);
  if (data.normalDiet || data.normalDietDetails) {
    await fillAssessmentTable(IA_FIELD_MAPPINGS.nutrition.normalDietTable, data.normalDiet, data.normalDietDetails);
  }
  if (data.specialDietary || data.specialDietaryDetails) {
    await fillAssessmentTable(IA_FIELD_MAPPINGS.nutrition.specialDietaryTable, data.specialDietary, data.specialDietaryDetails);
  }
  if (data.foodAllergies || data.foodAllergiesDetails) {
    await fillAssessmentTable(IA_FIELD_MAPPINGS.nutrition.foodAllergiesTable, data.foodAllergies, data.foodAllergiesDetails);
  }
  if (data.softDiet || data.softDietDetails) {
    await fillAssessmentTable(IA_FIELD_MAPPINGS.nutrition.softDietTable, data.softDiet, data.softDietDetails);
  }
  if (data.foodIntolerances || data.foodIntolerancesDetails) {
    await fillAssessmentTable(IA_FIELD_MAPPINGS.nutrition.foodIntoleranceTable, data.foodIntolerances, data.foodIntolerancesDetails);
  }
  if (data.tubeFeed || data.tubeFeedDetails) {
    await fillAssessmentTable(IA_FIELD_MAPPINGS.nutrition.tubeFeedTable, data.tubeFeed, data.tubeFeedDetails);
  }
  if (data.supplementaryFoods || data.supplementaryFoodsDetails) {
    await fillAssessmentTable(IA_FIELD_MAPPINGS.nutrition.supplementaryTable, data.supplementaryFoods, data.supplementaryFoodsDetails);
  }
  if (data.foodLikesDislikes) await setTextValue(IA_FIELD_MAPPINGS.nutrition.foodLikesDislikes, data.foodLikesDislikes);
  if (data.portionSizes) await setTextValue(IA_FIELD_MAPPINGS.nutrition.portionSizes, data.portionSizes);
  if (data.mainMealTime) await setTextValue(IA_FIELD_MAPPINGS.nutrition.mainMealTime, data.mainMealTime);
  if (data.fluidIntake) await setTextValue(IA_FIELD_MAPPINGS.nutrition.fluidIntake, data.fluidIntake);
  
  logAction("Nutrition section complete");
  
  // Equipment Section
  if (data.equipment && Array.isArray(data.equipment)) {
    await fillTableRows(IA_FIELD_MAPPINGS.equipment.equipmentTable, data.equipment);
  }
  if (data.remedialAction) await setTextValue(IA_FIELD_MAPPINGS.equipment.remedialAction, data.remedialAction);
  
  logAction("Equipment section complete");
  
  // Mobility Section (each assessment is a separate table with select + details)
  const mobilityTableFills = [
    ["weightBearing", "weightBearingDetails", "weightBareTable"],
    ["walking", "walkingDetails", "walkingTable"],
    ["stairs", "stairsDetails", "stairsStepsTable"],
    ["sitToStand", "sitToStandDetails", "sitToStandTable"],
    ["washing", "washingDetails", "washingTable"],
    ["dressing", "dressingDetails", "dressingTable"],
    ["oralCare", "oralCareDetails", "oralCareTable"],
    ["bathShower", "bathShowerDetails", "bathShowerTable"],
    ["toiletCommode", "toiletCommodeDetails", "toiletCommodeTable"],
    ["wheelchair", "wheelchairDetails", "wheelchairTable"],
    ["transfers", "transfersDetails", "transfersTable"],
    ["moveInBed", "moveInBedDetails", "moveInBedTable"],
    ["inOutOfBed", "inOutOfBedDetails", "inOutOfBedTable"],
    ["chairToWheelchair", "chairToWheelchairDetails", "chairToWheelchairTable"],
    ["inOutOfCar", "inOutOfCarDetails", "inOutOfCarTable"],
    ["otherTransfers", "otherTransfersDetails", "otherTransfersTable"],
    ["communityAccess", "communityAccessDetails", "communityAccessTable"],
    ["specialistEquipment", "specialistEquipmentDetails", "specialistEquipmentTable"],
    ["canBeLeftAlone", "canBeLeftAloneDetails", "leftAloneTable"],
    ["proneToFalls", "proneToFallsDetails", "proneToFallsTable"],
  ];
  for (const [valueKey, detailsKey, tableKey] of mobilityTableFills) {
    if (data[valueKey] || data[detailsKey]) {
      await fillAssessmentTable(IA_FIELD_MAPPINGS.mobility[tableKey], data[valueKey], data[detailsKey]);
    }
  }
  
  logAction("Mobility section complete");
  
  logAction("Health sections complete");
  
  // Appliances Section
  const applianceFields = [
    ["cooker", "cooker"], ["microwave", "microwave"], ["iron", "iron"],
    ["kettle", "kettle"], ["toaster", "toaster"], ["tumbleDryer", "tumbleDryer"],
    ["floorCoverings", "floorCoverings"], ["handGrabRails", "handGrabRails"],
    ["electricBlanket", "electricBlanket"], ["bed", "bed"],
    ["washingMachine", "washingMachine"], ["centralHeating", "centralHeating"]
  ];
  for (const [dataKey, mappingKey] of applianceFields) {
    if (data[dataKey]) await setSelectValue(IA_FIELD_MAPPINGS.appliances[mappingKey], data[dataKey]);
  }
  if (data.appliancesActions) await setTextValue(IA_FIELD_MAPPINGS.appliances.appliancesActions, data.appliancesActions);
  
  // Fire Safety Section
  if (data.atRiskOfFire) await setRadioValue(IA_FIELD_MAPPINGS.fireSafety.atRiskOfFire, data.atRiskOfFire);
  if (data.fireRiskReason && Array.isArray(data.fireRiskReason)) {
    await setMultiSelectValue(IA_FIELD_MAPPINGS.fireSafety.fireRiskReason, data.fireRiskReason);
  }
  if (data.ragRating) await setRadioValue(IA_FIELD_MAPPINGS.fireSafety.ragRating, data.ragRating);
  if (data.plugSockets) await setSelectValue(IA_FIELD_MAPPINGS.fireSafety.plugSockets, data.plugSockets);
  if (data.electricCables) await setSelectValue(IA_FIELD_MAPPINGS.fireSafety.electricCables, data.electricCables);
  if (data.smokingPolicy) await setRadioValue(IA_FIELD_MAPPINGS.fireSafety.smokingPolicy, data.smokingPolicy);
  if (data.smokeAlarmLocation) await setTextValue(IA_FIELD_MAPPINGS.fireSafety.smokeAlarmLocation, data.smokeAlarmLocation);
  if (data.smokeAlarmWorking) await setRadioValue(IA_FIELD_MAPPINGS.fireSafety.smokeAlarmWorking, data.smokeAlarmWorking);
  if (data.coDetectorLocation) await setTextValue(IA_FIELD_MAPPINGS.fireSafety.coDetectorLocation, data.coDetectorLocation);
  if (data.coDetectorWorking) await setRadioValue(IA_FIELD_MAPPINGS.fireSafety.coDetectorWorking, data.coDetectorWorking);
  if (data.fireActionsTaken) await setSelectValue(IA_FIELD_MAPPINGS.fireSafety.actionsTaken, data.fireActionsTaken);
  if (data.fireActionsDetails) await setTextValue(IA_FIELD_MAPPINGS.fireSafety.actionsDetails, data.fireActionsDetails);
  if (data.canEvacuate) await setTextValue(IA_FIELD_MAPPINGS.fireSafety.canEvacuate, data.canEvacuate);
  
  logAction("Fire safety section complete");
  
  // COSHH Section
  if (data.cleaningMaterialsStorage) await setTextValue(IA_FIELD_MAPPINGS.coshh.cleaningMaterialsStorage, data.cleaningMaterialsStorage);
  
  // External Safety Section (each item is a table with location select + assessment select)
  const externalTableFills = [
    ["access", "accessTable"],
    ["clearPathways", "pathwaysTable"],
    ["handrails", "externalRailsTable"],
    ["entranceSteps", "entranceStepsTable"],
    ["lighting", "lightingTable"],
    ["ramps", "rampsTable"],
    ["personalSecurity", "personalSecurityTable"],
    ["parking", "parkingTable"],
  ];
  for (const [dataKey, tableKey] of externalTableFills) {
    if (data[dataKey]) {
      await fillAssessmentTable(IA_FIELD_MAPPINGS.externalSafety[tableKey], data[dataKey], null);
    }
  }
  if (data.externalActions) await setTextValue(IA_FIELD_MAPPINGS.externalSafety.externalActions, data.externalActions);
  
  logAction("External safety section complete");
  
  // Security/Access Section
  if (data.keysafeConsent) await setRadioValue(IA_FIELD_MAPPINGS.securityAccess.keysafeConsent, data.keysafeConsent);
  if (data.gasShutOffLocation) await setTextValue(IA_FIELD_MAPPINGS.securityAccess.gasShutOffLocation, data.gasShutOffLocation);
  if (data.stopTapLocation) await setTextValue(IA_FIELD_MAPPINGS.securityAccess.stopTapLocation, data.stopTapLocation);
  if (data.fuseBoxLocation) await setTextValue(IA_FIELD_MAPPINGS.securityAccess.fuseBoxLocation, data.fuseBoxLocation);
  
  // Service User Bands Section
  const bandFields = [
    ["personalCare", "personalCare"], ["mentalHealth", "mentalHealth"],
    ["physicalDisability", "physicalDisability"], ["dementia", "dementia"],
    ["eatingDisorder", "eatingDisorder"], ["sensoryImpairment", "sensoryImpairment"],
    ["detainedMHA", "detainedMHA"], ["drugAlcoholMisuse", "drugAlcoholMisuse"],
    ["learningDifficulties", "learningDifficulties"]
  ];
  for (const [dataKey, mappingKey] of bandFields) {
    if (data[dataKey]) await setRadioValue(IA_FIELD_MAPPINGS.serviceUserBands[mappingKey], data[dataKey]);
  }
  
  logAction("Service user bands complete");
  
  // Completion Section
  if (data.dateCompleted || metadata.date) {
    await setTextValue(IA_FIELD_MAPPINGS.completion.dateCompleted, data.dateCompleted || metadata.date);
  }
  if (data.nameOfAssessor || metadata.assessor) {
    await setTextValue(IA_FIELD_MAPPINGS.completion.nameOfAssessor, data.nameOfAssessor || metadata.assessor);
  }
  
  // Log summary of fields needing verification
  if (NEEDS_VERIFICATION.length > 0) {
    const missingCount = NEEDS_VERIFICATION.filter(f => f.reason === 'missing').length;
    const ambiguousCount = NEEDS_VERIFICATION.filter(f => f.reason === 'ambiguous').length;
    logAction(`⚠️ ${NEEDS_VERIFICATION.length} fields need human verification:`);
    if (missingCount > 0) logAction(`  - ${missingCount} fields have 'Information not provided'`);
    if (ambiguousCount > 0) logAction(`  - ${ambiguousCount} yes/no fields have ambiguous answers`);
    logAction("Look for YELLOW highlighted fields on the form.");
    
    // Save verification fields to storage for popup access
    try {
      saveStorage({
        [STORAGE_KEYS.verificationFields || 'caAcpVerificationFields']: NEEDS_VERIFICATION
      });
    } catch (e) {
      console.warn('Failed to save verification fields to storage:', e);
    }
    
    // Show a summary notification on the page
    showVerificationSummary(NEEDS_VERIFICATION);
  } else {
    // Clear verification fields from storage if none needed
    try {
      saveStorage({
        [STORAGE_KEYS.verificationFields || 'caAcpVerificationFields']: []
      });
    } catch (e) {
      // Ignore
    }
  }
  
  logAction("Initial Assessment autofill complete!");
  return true;
};

/**
 * Show a floating notification about fields needing verification with navigation
 */
const showVerificationSummary = (fields) => {
  const existing = document.getElementById('ca-verification-summary');
  if (existing) existing.remove();
  
  // Inject animation styles for pulse effect
  if (!document.getElementById('ca-verification-styles')) {
    const style = document.createElement('style');
    style.id = 'ca-verification-styles';
    style.textContent = `
      @keyframes ca-pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.02); box-shadow: 0 0 15px rgba(255, 193, 7, 0.8); }
      }
      [data-ca-verification] {
        transition: all 0.2s ease;
      }
      [data-ca-verification]:focus {
        box-shadow: 0 0 10px rgba(255, 193, 7, 0.8) !important;
      }
      .ca-nav-btn {
        padding: 5px 10px;
        border: 1px solid hsl(214, 25%, 89%);
        border-radius: 6px;
        background: hsl(210, 15%, 97%);
        color: hsl(222, 47%, 11%);
        cursor: pointer;
        font-size: 11px;
        font-weight: 500;
        transition: all 0.15s;
      }
      .ca-nav-btn:hover {
        background: hsl(215, 50%, 35%);
        color: #fff;
        border-color: hsl(215, 50%, 35%);
      }
      .ca-nav-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .ca-pin-btn {
        border: 1px solid hsl(214, 25%, 89%);
        border-radius: 6px;
        background: hsl(210, 15%, 97%);
        color: hsl(215, 15%, 42%);
        cursor: pointer;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        padding: 2px 7px;
        margin-right: 6px;
      }
      .ca-pin-btn.is-active {
        border-color: hsl(200, 75%, 45%);
        background: hsl(200, 80%, 94%);
        color: hsl(200, 85%, 34%);
      }
      .ca-summary-header {
        cursor: default;
      }
      .ca-summary-resize-handle {
        position: absolute;
        right: 8px;
        bottom: 8px;
        width: 14px;
        height: 14px;
        border-radius: 4px;
        border: 1px solid hsl(214, 25%, 76%);
        background: linear-gradient(135deg, hsl(210, 20%, 98%), hsl(214, 24%, 87%));
        cursor: nwse-resize;
        touch-action: none;
        user-select: none;
        box-shadow: 0 6px 12px rgba(15, 23, 42, 0.15);
      }
      .ca-summary-resize-handle.is-resizing {
        border-color: hsl(200, 76%, 44%);
        background: linear-gradient(135deg, hsl(200, 90%, 96%), hsl(199, 89%, 84%));
      }
      #ca-verification-summary[data-ca-summary-minimized='true'] .ca-summary-resize-handle {
        display: none;
      }
    `;
    document.head.appendChild(style);
  }
  
  const missingCount = fields.filter(f => f.reason === 'missing').length;
  const ambiguousCount = fields.filter(f => f.reason === 'ambiguous').length;
  
  // Track current navigation index
  let currentIndex = -1;
  
  const summary = document.createElement('div');
  summary.id = 'ca-verification-summary';
  summary.style.cssText = `
    position: fixed;
    top: 16px;
    right: 16px;
    background: #fff;
    border: 1px solid hsl(214, 25%, 89%);
    border-radius: 8px;
    padding: 16px 18px;
    box-shadow: 0 6px 16px rgba(0,0,0,0.1);
    z-index: 10000;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    max-width: min(560px, calc(100vw - 32px));
    min-width: 280px;
    min-height: 120px;
    max-height: calc(100vh - 32px);
    resize: none;
    overflow: hidden;
  `;
  
  summary.innerHTML = `
    <div class="ca-summary-header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
      <strong style="color: hsl(222, 47%, 11%); font-size: 13px;">Verification Required</strong>
      <div>
        <button id="ca-pin-summary" class="ca-pin-btn" title="Pin panel">Pin</button>
        <button id="ca-minimize-summary" style="background: none; border: none; cursor: pointer; font-size: 13px; color: hsl(215, 15%, 42%); margin-right: 6px;" title="Minimize">_</button>
        <button id="ca-close-summary" style="background: none; border: none; cursor: pointer; font-size: 16px; color: hsl(215, 15%, 42%);" title="Close">\u00d7</button>
      </div>
    </div>
    <div id="ca-summary-content" style="color: hsl(222, 47%, 11%); font-size: 12px; line-height: 1.5;">
      <p style="margin: 0 0 8px 0; color: hsl(45, 70%, 28%);">${fields.length} field(s) need manual review:</p>
      <ul style="margin: 0; padding-left: 16px; margin-bottom: 10px; color: hsl(215, 15%, 42%); font-size: 11px;">
        ${missingCount > 0 ? `<li>${missingCount} with missing information</li>` : ''}
        ${ambiguousCount > 0 ? `<li>${ambiguousCount} with ambiguous answers</li>` : ''}
      </ul>
      
      <div style="display: flex; gap: 6px; justify-content: center; align-items: center; margin: 10px 0;">
        <button id="ca-nav-prev" class="ca-nav-btn" title="Previous field">\u2190 Prev</button>
        <span id="ca-nav-counter" style="font-size: 11px; min-width: 50px; text-align: center; color: hsl(215, 15%, 42%);">- / ${fields.length}</span>
        <button id="ca-nav-next" class="ca-nav-btn" title="Next field">Next \u2192</button>
      </div>
      
      <p id="ca-current-field" style="margin: 6px 0 0 0; font-size: 10px; text-align: center; font-style: italic; color: hsl(215, 15%, 42%);">Click Next to start navigating</p>
      
      <p style="margin: 8px 0 0 0; font-size: 10px; text-align: center; color: hsl(215, 15%, 55%);">
        <kbd style="background: hsl(210, 15%, 95%); padding: 1px 4px; border-radius: 3px; border: 1px solid hsl(214, 25%, 89%); font-size: 9px;">Ctrl+Shift+N</kbd> Next
        <kbd style="background: hsl(210, 15%, 95%); padding: 1px 4px; border-radius: 3px; border: 1px solid hsl(214, 25%, 89%); font-size: 9px; margin-left: 4px;">Ctrl+Shift+P</kbd> Prev
      </p>
    </div>
  `;
  
  document.body.appendChild(summary);
  const summaryResizeHandle = document.createElement('div');
  summaryResizeHandle.className = 'ca-summary-resize-handle';
  summaryResizeHandle.title = 'Resize panel';
  
  const counterEl = document.getElementById('ca-nav-counter');
  const currentFieldEl = document.getElementById('ca-current-field');
  const contentEl = document.getElementById('ca-summary-content');
  const headerEl = summary.querySelector('.ca-summary-header');

  const SUMMARY_MARGIN = 8;
  const SUMMARY_MIN_WIDTH = 280;
  const SUMMARY_MIN_HEIGHT = 120;

  const clampSummaryPosition = (left, top) => {
    const rect = summary.getBoundingClientRect();
    const maxLeft = Math.max(SUMMARY_MARGIN, window.innerWidth - rect.width - SUMMARY_MARGIN);
    const maxTop = Math.max(SUMMARY_MARGIN, window.innerHeight - rect.height - SUMMARY_MARGIN);
    return {
      left: Math.min(Math.max(SUMMARY_MARGIN, left), maxLeft),
      top: Math.min(Math.max(SUMMARY_MARGIN, top), maxTop),
    };
  };

  const setSummaryPosition = (left, top) => {
    const next = clampSummaryPosition(left, top);
    summary.style.left = `${next.left}px`;
    summary.style.top = `${next.top}px`;
    summary.style.right = 'auto';
    summary.style.bottom = 'auto';
  };

  const getSummarySizeBounds = () => {
    const rect = summary.getBoundingClientRect();
    return {
      maxWidth: Math.max(SUMMARY_MIN_WIDTH, window.innerWidth - rect.left - SUMMARY_MARGIN),
      maxHeight: Math.max(SUMMARY_MIN_HEIGHT, window.innerHeight - rect.top - SUMMARY_MARGIN),
    };
  };

  const setSummarySize = (width, height) => {
    const { maxWidth, maxHeight } = getSummarySizeBounds();
    const nextWidth = Math.min(Math.max(SUMMARY_MIN_WIDTH, width), maxWidth);
    const nextHeight = Math.min(Math.max(SUMMARY_MIN_HEIGHT, height), maxHeight);
    summary.style.width = `${Math.round(nextWidth)}px`;
    summary.style.height = `${Math.round(nextHeight)}px`;
  };

  const keepSummaryInViewport = () => {
    const isMinimized = summary.dataset.caSummaryMinimized === 'true';
    if (!isMinimized) {
      const summaryRect = summary.getBoundingClientRect();
      const { maxWidth, maxHeight } = getSummarySizeBounds();
      if (summaryRect.width > maxWidth + 0.5 || summaryRect.height > maxHeight + 0.5) {
        setSummarySize(summaryRect.width, summaryRect.height);
      }
    }

    const rect = summary.getBoundingClientRect();
    const next = clampSummaryPosition(rect.left, rect.top);
    if (Math.abs(next.left - rect.left) > 0.5 || Math.abs(next.top - rect.top) > 0.5) {
      setSummaryPosition(next.left, next.top);
    }
  };

  let dragState = null;
  let resizeState = null;
  let activePointerId = null;
  let activePointerCaptureElement = null;

  const capturePointer = (element, event) => {
    if (!(element instanceof Element)) return;
    if (!Number.isFinite(event.pointerId)) return;
    if (typeof element.setPointerCapture !== 'function') return;

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
      typeof activePointerCaptureElement.releasePointerCapture === 'function'
    ) {
      try {
        if (
          typeof activePointerCaptureElement.hasPointerCapture !== 'function' ||
          activePointerCaptureElement.hasPointerCapture(activePointerId)
        ) {
          activePointerCaptureElement.releasePointerCapture(activePointerId);
        }
      } catch {
        // Ignore release errors from stale pointer captures.
      }
    }

    activePointerId = null;
    activePointerCaptureElement = null;
  };

  const isTrackedPointerEvent = (event) => (
    !Number.isFinite(activePointerId) ||
    !Number.isFinite(event.pointerId) ||
    event.pointerId === activePointerId
  );

  const isPrimaryPointer = (event) => {
    if (!event.isPrimary) return false;
    if (event.pointerType === 'mouse' && event.button !== 0) return false;
    return true;
  };

  const stopPointerInteraction = () => {
    dragState = null;
    resizeState = null;
    releaseCapturedPointer();
    if (headerEl) {
      headerEl.classList.remove('is-dragging');
    }
    summaryResizeHandle.classList.remove('is-resizing');
    document.body.style.userSelect = '';
    window.removeEventListener('pointermove', handleDragMove);
    window.removeEventListener('pointermove', handleResizeMove);
    window.removeEventListener('pointerup', stopPointerInteraction);
    window.removeEventListener('pointercancel', stopPointerInteraction);
  };

  const handleDragMove = (event) => {
    if (!dragState || !isTrackedPointerEvent(event)) return;
    event.preventDefault();
    const nextLeft = dragState.originLeft + (event.clientX - dragState.startX);
    const nextTop = dragState.originTop + (event.clientY - dragState.startY);
    setSummaryPosition(nextLeft, nextTop);
  };

  const handleResizeMove = (event) => {
    if (!resizeState || summary.dataset.caSummaryMinimized === 'true' || !isTrackedPointerEvent(event)) return;
    event.preventDefault();
    const nextWidth = resizeState.originWidth + (event.clientX - resizeState.startX);
    const nextHeight = resizeState.originHeight + (event.clientY - resizeState.startY);
    setSummarySize(nextWidth, nextHeight);
    keepSummaryInViewport();
  };

  // Drag and resize interactions are intentionally disabled.

  window.addEventListener('resize', keepSummaryInViewport);

  let summaryResizeObserver = null;
  if (typeof ResizeObserver === 'function') {
    summaryResizeObserver = new ResizeObserver(() => keepSummaryInViewport());
    summaryResizeObserver.observe(summary);
  }

  keepSummaryInViewport();

  const setSummaryMinimized = (minimized) => {
    if (minimized && VERIFICATION_SUMMARY_PINNED) {
      return;
    }
    summary.dataset.caSummaryMinimized = minimized ? 'true' : 'false';
    contentEl.style.display = minimized ? 'none' : 'block';
    summary.style.width = minimized ? 'auto' : '';
    summary.style.height = minimized ? 'auto' : '';
    summary.style.minWidth = minimized ? '150px' : '280px';
    const minimizeButton = document.getElementById('ca-minimize-summary');
    if (minimizeButton) {
      minimizeButton.textContent = minimized ? '+' : '_';
      minimizeButton.title = minimized ? 'Expand' : 'Minimize';
    }
  };
  
  const updateCounter = () => {
    counterEl.textContent = `${currentIndex + 1} / ${fields.length}`;
    const field = fields[currentIndex];
    if (field) {
      currentFieldEl.textContent = field.reason === 'missing' 
        ? `Missing info: ${field.field}`
        : `Ambiguous: ${field.field}`;
    }
  };
  
  const navigateToField = (index) => {
    const verificationFields = document.querySelectorAll('[data-ca-verification]');
    if (verificationFields.length === 0) return;
    
    currentIndex = ((index % verificationFields.length) + verificationFields.length) % verificationFields.length;
    const field = verificationFields[currentIndex];
    
    if (field) {
      field.scrollIntoView({ behavior: 'smooth', block: 'center' });
      field.style.animation = 'none';
      field.offsetHeight; // Trigger reflow
      field.style.animation = 'ca-pulse 0.5s ease-in-out 2';
      field.focus();
      
      // Try to focus the actual input if this is a container
      const input = field.querySelector('input, select, textarea') || field;
      if (input && typeof input.focus === 'function') {
        setTimeout(() => input.focus(), 100);
      }
    }
    
    updateCounter();
  };
  
  document.getElementById('ca-nav-next').addEventListener('click', () => navigateToField(currentIndex + 1));
  document.getElementById('ca-nav-prev').addEventListener('click', () => navigateToField(currentIndex - 1));
  
  document.getElementById('ca-close-summary').addEventListener('click', () => {
    summary.remove();
  });
  
  document.getElementById('ca-minimize-summary').addEventListener('click', () => {
    const isMinimized = summary.dataset.caSummaryMinimized === 'true';
    setSummaryMinimized(!isMinimized);
  });

  document.getElementById('ca-pin-summary').addEventListener('click', () => {
    setVerificationSummaryPinned(!VERIFICATION_SUMMARY_PINNED);
  });

  loadStorage([OVERLAY_PINNED_STORAGE_KEY])
    .then((stored) => {
      setVerificationSummaryPinned(Boolean(stored?.[OVERLAY_PINNED_STORAGE_KEY]), { persist: false });
    })
    .catch(() => {});

  setSummaryMinimized(false);
  
  // Keyboard shortcuts
  const keyHandler = (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'N') {
      e.preventDefault();
      navigateToField(currentIndex + 1);
    } else if (e.ctrlKey && e.shiftKey && e.key === 'P') {
      e.preventDefault();
      navigateToField(currentIndex - 1);
    }
  };
  
  document.addEventListener('keydown', keyHandler);
  
  // Clean up event listener when summary is closed
  const observer = new MutationObserver(() => {
    if (!document.getElementById('ca-verification-summary')) {
      document.removeEventListener('keydown', keyHandler);
      window.removeEventListener('resize', keepSummaryInViewport);
      stopPointerInteraction();
      if (summaryResizeObserver) {
        summaryResizeObserver.disconnect();
      }
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true });
  
  // Don't auto-close - let user close manually
  logAction(`Verification panel ready. ${fields.length} fields to review.`);
};

const getVerificationSummaryFields = () => {
  if (NEEDS_VERIFICATION.length > 0) {
    return NEEDS_VERIFICATION;
  }

  return Array.from(document.querySelectorAll('[data-ca-verification]')).map((field, index) => ({
    field: field.getAttribute('name') || field.getAttribute('id') || `Field ${index + 1}`,
    reason: field.dataset.caVerification || 'missing',
  }));
};

const setVerificationSummaryMinimized = (minimized) => {
  if (minimized && VERIFICATION_SUMMARY_PINNED) {
    return false;
  }
  const summary = document.getElementById('ca-verification-summary');
  if (!summary) return false;
  const content = document.getElementById('ca-summary-content');
  const minimizeButton = document.getElementById('ca-minimize-summary');
  summary.dataset.caSummaryMinimized = minimized ? 'true' : 'false';
  summary.style.width = minimized ? 'auto' : '';
  summary.style.height = minimized ? 'auto' : '';
  summary.style.minWidth = minimized ? '150px' : '280px';
  if (content) {
    content.style.display = minimized ? 'none' : 'block';
  }
  if (minimizeButton) {
    minimizeButton.textContent = minimized ? '+' : '_';
    minimizeButton.title = minimized ? 'Expand' : 'Minimize';
  }
  return true;
};

const setVerificationSummaryPinned = (pinned, { persist = true } = {}) => {
  VERIFICATION_SUMMARY_PINNED = Boolean(pinned);

  const pinButton = document.getElementById('ca-pin-summary');
  if (pinButton) {
    pinButton.textContent = VERIFICATION_SUMMARY_PINNED ? 'Pinned' : 'Pin';
    pinButton.title = VERIFICATION_SUMMARY_PINNED ? 'Unpin panel' : 'Pin panel';
    pinButton.classList.toggle('is-active', VERIFICATION_SUMMARY_PINNED);
  }

  const summary = document.getElementById('ca-verification-summary');
  if (summary && VERIFICATION_SUMMARY_PINNED && summary.dataset.caSummaryMinimized === 'true') {
    setVerificationSummaryMinimized(false);
  }

  if (persist) {
    saveStorage({ [OVERLAY_PINNED_STORAGE_KEY]: VERIFICATION_SUMMARY_PINNED }).catch(() => {});
  }

  return VERIFICATION_SUMMARY_PINNED;
};

const ensureVerificationSummaryVisible = () => {
  const existing = document.getElementById('ca-verification-summary');
  if (existing) {
    setVerificationSummaryMinimized(false);
    return true;
  }

  const fields = getVerificationSummaryFields();
  if (!fields.length) {
    return false;
  }

  showVerificationSummary(fields);
  return true;
};

/**
 * Check if this is an Initial Assessment form page
 */
const isInitialAssessmentPage = () => {
  if (!window.location.pathname.includes("new_case_form") && 
      !window.location.pathname.includes("edit_case_form")) {
    return false;
  }
  
  // Check for form ID in URL
  const params = new URLSearchParams(window.location.search);
  const formId = params.get("formId");
  if (formId === INITIAL_ASSESSMENT_FORM_ID) return true;
  
  // Check for form ID in hidden input
  const formIdInput = document.querySelector("#formId");
  if (formIdInput && formIdInput.value === INITIAL_ASSESSMENT_FORM_ID) return true;
  
  // Check for section headers that indicate this is an Initial Assessment form
  const headers = document.querySelectorAll("h3");
  for (const h of headers) {
    if (h.textContent?.includes("Initial Assessment/Care Plan")) return true;
  }
  
  return false;
};

/**
 * Listen for messages from popup to fill form
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "CA_EXTENSION_REQUEST_STATUS") {
    sendResponse({ detected: true, refreshRequired: false, workflow: "initialAssessment" });
    return false;
  }
  if (message?.type === "CA_FILL_INITIAL_ASSESSMENT") {
    const { data, metadata, dryRun, interactionMode } = message.payload || {};
    DRY_RUN = Boolean(dryRun);
    INTERACTION_MODE = interactionMode || "auto";
    
    // If data comes from Plan Enhancer output, map it first
    const mappedData = data?.thisIsMe ? mapPlanEnhancerToFormData(data) : data;
    
    fillInitialAssessment(mappedData, metadata)
      .then((ok) => sendResponse({ ok }))
      .catch((error) => {
        logAction(`Error: ${error.message}`);
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }
  
  if (message?.type === "CA_CHECK_INITIAL_ASSESSMENT_PAGE") {
    sendResponse({ isInitialAssessmentPage: isInitialAssessmentPage() });
    return true;
  }
  
  // Handle scroll-to-next verification field from popup
  if (message?.type === "CA_EXTENSION_SCROLL_TO_NEXT") {
    const requestedIndex = message.payload?.index ?? 0;
    const verificationFields = document.querySelectorAll('[data-ca-verification]');
    
    if (verificationFields.length === 0) {
      sendResponse({ found: false, total: 0 });
      return true;
    }
    
    // Clamp index to valid range
    const index = Math.max(0, Math.min(requestedIndex, verificationFields.length - 1));
    const field = verificationFields[index];
    
    if (field) {
      field.scrollIntoView({ behavior: 'smooth', block: 'center' });
      field.style.animation = 'none';
      field.offsetHeight; // Trigger reflow
      field.style.animation = 'ca-pulse 0.5s ease-in-out 2';
      
      // Try to focus
      const focusable = field.querySelector('input, select, textarea') || field;
      if (focusable && typeof focusable.focus === 'function') {
        setTimeout(() => focusable.focus(), 100);
      }
    }
    
    sendResponse({
      found: true,
      index: index,
      total: verificationFields.length,
      fieldName: field?.dataset?.caVerification || ''
    });
    return true;
  }
  
  // Handle get verification status
  if (message?.type === "CA_EXTENSION_GET_VERIFICATION_STATUS") {
    const fields = document.querySelectorAll('[data-ca-verification]');
    const status = {
      total: fields.length,
      missing: Array.from(fields).filter(f => f.dataset.caVerification === 'missing').length,
      ambiguous: Array.from(fields).filter(f => f.dataset.caVerification === 'ambiguous').length
    };
    sendResponse(status);
    return true;
  }

  if (message?.type === (MESSAGE_TYPES?.toggleOverlay || "CA_EXTENSION_TOGGLE_OVERLAY")) {
    const hasSummary = ensureVerificationSummaryVisible();
    if (!hasSummary) {
      sendResponse({ ok: false, error: 'No verification summary available on this page.' });
      return true;
    }

    if (typeof message?.payload?.pin === 'boolean') {
      setVerificationSummaryPinned(Boolean(message.payload.pin));
    }

    const summary = document.getElementById('ca-verification-summary');
    const currentlyMinimized = summary?.dataset?.caSummaryMinimized === 'true';

    if (message?.payload?.open) {
      setVerificationSummaryMinimized(false);
    } else if (message?.payload?.minimize) {
      if (!VERIFICATION_SUMMARY_PINNED) {
        setVerificationSummaryMinimized(true);
      }
    } else {
      if (!VERIFICATION_SUMMARY_PINNED) {
        setVerificationSummaryMinimized(!currentlyMinimized);
      }
    }

    sendResponse({ ok: true });
    return true;
  }
  
  return false;
});

/**
 * Auto-run if payload is waiting in storage
 */
const run = async () => {
  if (!isInitialAssessmentPage()) return;
  
  logAction("Initial Assessment form detected");
  
  const { caAcpPayload, caAcpQueueState, caAcpDryRun, caAcpInteractionMode } = await loadStorage([
    STORAGE_KEYS.payload,
    STORAGE_KEYS.queueState,
    STORAGE_KEYS.dryRun,
    STORAGE_KEYS.interactionMode,
  ]);
  
  // Check if payload is for initial assessment
  if (!caAcpPayload || caAcpPayload.formType !== "initialAssessment") return;
  
  // DEBUG: Show payload loaded from storage
  if (CA_DEBUG) console.log("[CA Extension DEBUG] Payload loaded from storage:", JSON.stringify(caAcpPayload, null, 2));
  
  const processedKey = buildProcessedKey(caAcpQueueState, caAcpPayload);
  if (sessionStorage.getItem(processedKey)) return;
  
  DRY_RUN = Boolean(caAcpDryRun);
  INTERACTION_MODE = caAcpInteractionMode || "auto";
  
  // Wait for form to be fully loaded
  await wait(1500);
  
  const formData = caAcpPayload.initialAssessmentData || caAcpPayload.data;
  if (!formData) {
    logAction("No initial assessment data found in payload");
    return;
  }
  
  // DEBUG: Show extracted formData before mapping
  if (CA_DEBUG) {
    console.log("[CA Extension DEBUG] FormData before mapping:", JSON.stringify(formData, null, 2));
    console.log("[CA Extension DEBUG] Has thisIsMe property:", !!formData?.thisIsMe);
  }
  
  // DEBUG: Show mapped data after Plan Enhancer transformation
  const mappedData = formData?.thisIsMe ? mapPlanEnhancerToFormData(formData) : formData;
  if (CA_DEBUG) {
    console.log("[CA Extension DEBUG] Data after mapping:", JSON.stringify(mappedData, null, 2));
    console.log("[CA Extension DEBUG] Mapping was applied:", !!formData?.thisIsMe);
  }

  sessionStorage.setItem(processedKey, "1");
  try {
    await fillInitialAssessment(mappedData, {
      assessor: caAcpPayload.assessor,
      date: caAcpPayload.date,
      assessmentType: caAcpPayload.assessmentType,
    });
  } catch (error) {
    sessionStorage.removeItem(processedKey);
    logAction(`Initial Assessment autofill failed: ${error?.message || "Unknown error"}`);
  }
};

// Run when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", run);
} else {
  run();
}
})();
