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
  signatureData: "caAcpSignatureData",
  signatureBatchId: "caAcpSignatureBatchId",
};

const { STORAGE_KEYS, MESSAGE_TYPES } = window.CA_EXTENSION_CONSTANTS || {
  STORAGE_KEYS: FALLBACK_STORAGE_KEYS,
  MESSAGE_TYPES: {
    log: "CA_EXTENSION_LOG",
    stepComplete: "CA_EXTENSION_STEP_COMPLETE",
  },
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

let DRY_RUN = false;
let INTERACTION_MODE = "auto";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const loadStorage = (keys) =>
  new Promise((resolve) => chrome.storage.local.get(keys, (items) => resolve(items)));

/**
 * Set value for a text input or textarea
 */
const setTextValue = async (fieldName, value) => {
  if (!value && value !== 0) return false;
  const field = document.querySelector(`[name="${fieldName}"]`) ||
                document.querySelector(`#${fieldName}`) ||
                document.querySelector(`#textarea_${fieldName}`);
  if (!field) {
    logAction(`Field not found: ${fieldName}`);
    return false;
  }
  if (DRY_RUN) {
    field.style.outline = "2px solid #1ea97a";
    logAction(`Dry run: would set ${fieldName}`);
    return true;
  }
  field.value = String(value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
  field.dispatchEvent(new Event("blur", { bubbles: true }));
  return true;
};

/**
 * Set value for a select dropdown
 */
const setSelectValue = async (fieldName, value) => {
  if (!value) return false;
  const field = document.querySelector(`[name="${fieldName}"]`) ||
                document.querySelector(`#${fieldName}`);
  if (!field || field.tagName !== "SELECT") {
    logAction(`Select field not found: ${fieldName}`);
    return false;
  }
  if (DRY_RUN) {
    field.style.outline = "2px solid #1ea97a";
    logAction(`Dry run: would select ${value} for ${fieldName}`);
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
  const field = document.querySelector(`[name="${fieldName}"]`) ||
                document.querySelector(`#${fieldName}`);
  if (!field || field.tagName !== "SELECT") {
    logAction(`Multi-select field not found: ${fieldName}`);
    return false;
  }
  if (DRY_RUN) {
    field.style.outline = "2px solid #1ea97a";
    logAction(`Dry run: would select ${values.length} options for ${fieldName}`);
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
 */
const setRadioValue = async (fieldName, value) => {
  if (!value) return false;
  const targetValue = String(value).trim().toLowerCase();
  const radios = document.querySelectorAll(`[name="${fieldName}"]`);
  if (radios.length === 0) {
    logAction(`Radio field not found: ${fieldName}`);
    return false;
  }
  if (DRY_RUN) {
    radios[0].style.outline = "2px solid #1ea97a";
    logAction(`Dry run: would check radio ${value} for ${fieldName}`);
    return true;
  }
  
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
  
  const checkboxes = document.querySelectorAll(`[name="${fieldName}"]`);
  if (checkboxes.length === 0) {
    logAction(`Checkbox field not found: ${fieldName}`);
    return false;
  }
  if (DRY_RUN) {
    checkboxes[0].style.outline = "2px solid #1ea97a";
    logAction(`Dry run: would check ${valuesArray.length} checkboxes for ${fieldName}`);
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
 * Add rows to a table and fill data
 */
const fillTableRows = async (tableId, rows) => {
  if (!rows || !Array.isArray(rows) || rows.length === 0) return false;
  
  const table = document.querySelector(`#${tableId}_Table`);
  if (!table) {
    logAction(`Table not found: ${tableId}`);
    return false;
  }
  
  const addButton = document.querySelector(`a#${tableId}`);
  const existingRows = table.querySelectorAll("tbody tr");
  
  // Add more rows if needed
  if (addButton && rows.length > existingRows.length) {
    const rowsToAdd = rows.length - existingRows.length;
    for (let i = 0; i < rowsToAdd; i++) {
      if (DRY_RUN) {
        logAction(`Dry run: would add row to ${tableId}`);
        break;
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
 */
const mapPlanEnhancerToFormData = (planData) => {
  if (!planData) return {};
  
  const formData = {};
  
  // === This Is Me Section ===
  if (planData.thisIsMe) {
    formData.whoAmI = planData.thisIsMe.whoAmI || "";
    formData.hobbiesInterests = planData.thisIsMe.hobbiesInterests || "";
    formData.goodDay = planData.thisIsMe.whatMakesGoodDay || "";
    formData.culturalNeeds = planData.thisIsMe.communicationNeeds || "";
  }
  
  // === Goal Setting ===
  if (planData.goals && Array.isArray(planData.goals)) {
    formData.goals = planData.goals.map((g) => ({
      goal: g.goal || "",
      howToAchieve: g.howToAchieve || "",
      barriers: g.potentialBarriers || "",
      timeFrame: g.timeFrame || "",
    }));
  }
  if (planData.internetSupport) {
    formData.internetSupport = planData.internetSupport.toLowerCase().includes("yes") ? "Yes" : "No";
  }
  if (planData.assistiveTechnology) {
    formData.assistiveTechExamples = planData.assistiveTechnology;
  }
  
  // === Advance Decisions ===
  if (planData.advanceDecisionInSitu) {
    formData.advanceDecisionInSitu = planData.advanceDecisionInSitu.toLowerCase().includes("yes") ? "Yes" : "No";
  }
  if (planData.dnrLocation) formData.dnrLocation = planData.dnrLocation;
  if (planData.lpaInPlace) {
    formData.lpaInPlace = planData.lpaInPlace.toLowerCase().includes("yes") ? "Yes" : "No";
  }
  if (planData.lpaContactInfo) formData.lpaContactInfo = planData.lpaContactInfo;
  
  // === My Care Plan Section ===
  if (planData.capacityDecisionMaking) formData.capacityDecisionMaking = planData.capacityDecisionMaking;
  if (planData.healthAndWellbeing) formData.healthAndWellbeing = planData.healthAndWellbeing;
  if (planData.triggerPoints) formData.triggerPoints = planData.triggerPoints;
  if (planData.medicationRequirements) formData.medicationRequirements = planData.medicationRequirements;
  if (planData.nutrition) formData.nutrition = planData.nutrition;
  if (planData.personalCareNeeds) formData.personalCareNeeds = planData.personalCareNeeds;
  if (planData.mobilityAndEquipment) formData.mobilityAndEquipment = planData.mobilityAndEquipment;
  if (planData.houseworkShopping) formData.houseworkShopping = planData.houseworkShopping;
  if (planData.financialArrangements) formData.financialArrangements = planData.financialArrangements;
  
  // === Risk Section 1: Mental and Physical Health ===
  // Communication fields
  if (planData.speech) formData.speech = planData.speech;
  if (planData.speechDetails) formData.speechDetails = planData.speechDetails;
  if (planData.hearing) formData.hearing = planData.hearing;
  if (planData.hearingDetails) formData.hearingDetails = planData.hearingDetails;
  if (planData.eyesight) formData.eyesight = planData.eyesight;
  if (planData.eyesightDetails) formData.eyesightDetails = planData.eyesightDetails;
  // General health
  if (planData.breathlessness) formData.breathlessness = planData.breathlessness;
  if (planData.breathlessnessDetails) formData.breathlessnessDetails = planData.breathlessnessDetails;
  if (planData.urinaryIncontinence) formData.urinaryIncontinence = planData.urinaryIncontinence;
  if (planData.urinaryDetails) formData.urinaryDetails = planData.urinaryDetails;
  if (planData.faecalIncontinence) formData.faecalIncontinence = planData.faecalIncontinence;
  if (planData.faecalDetails) formData.faecalDetails = planData.faecalDetails;
  // Mental health assessment
  if (planData.memory) formData.memory = planData.memory.replace(/\s+/g, "");
  if (planData.moods) formData.moods = planData.moods.replace(/\s+/g, "");
  if (planData.orientation) formData.orientation = planData.orientation.replace(/\s+/g, "");
  if (planData.sleepPattern) formData.sleepPattern = planData.sleepPattern.replace(/\s+/g, "");
  if (planData.behaviours) formData.behaviours = planData.behaviours.replace(/\s+/g, "");
  // Mental capacity assessment
  if (planData.understandsInfo) formData.understandsInfo = planData.understandsInfo;
  if (planData.retainsInfo) formData.retainsInfo = planData.retainsInfo;
  if (planData.contemplatesProsAndCons) formData.contemplatesProsAndCons = planData.contemplatesProsAndCons;
  if (planData.communicatesDecision) formData.communicatesDecision = planData.communicatesDecision;
  if (planData.capacityDetails) formData.actionsComments = planData.capacityDetails;
  
  // === Risk Section 2: Medication ===
  if (planData.prescriptionOrdering) formData.orderCollectPrescriptions = planData.prescriptionOrdering;
  if (planData.dosageSystem) formData.dosageSystem = planData.dosageSystem;
  if (planData.systemMaintainer) formData.systemMaintainer = planData.systemMaintainer;
  if (planData.medicationStorage) formData.medicationStorage = planData.medicationStorage;
  if (planData.currentInvestigations) formData.currentInvestigations = planData.currentInvestigations;
  if (planData.surplusMedication) formData.surplusOutOfDate = planData.surplusMedication;
  if (planData.medicationConcerns) formData.medicationConcerns = planData.medicationConcerns;
  if (planData.homeopathicMeds) formData.herbalMedicines = planData.homeopathicMeds;
  if (planData.prnMedication) formData.takingPRN = planData.prnMedication;
  if (planData.covertMedication) formData.covertMedication = planData.covertMedication;
  // Medication difficulties
  if (planData.pickingUpTablets) formData.pickingUpTablets = planData.pickingUpTablets;
  if (planData.openingBoxes) formData.openingBoxes = planData.openingBoxes;
  if (planData.pouringLiquids) formData.openingLiquids = planData.pouringLiquids;
  if (planData.usingDosageSystem) formData.usingDosageSystem = planData.usingDosageSystem;
  if (planData.applyingCreams) formData.applyingCreams = planData.applyingCreams;
  if (planData.swallowingTablets) formData.swallowingTablets = planData.swallowingTablets;
  if (planData.understandingInstructions) formData.understandingInstructions = planData.understandingInstructions;
  if (planData.managingInhalers) formData.managingInhalers = planData.managingInhalers;
  if (planData.instillingDrops) formData.instillingDrops = planData.instillingDrops;
  // Skin integrity
  if (planData.skinIntegrityRisk) {
    formData.skinIntegrityRisk = planData.skinIntegrityRisk.toLowerCase().includes("yes") ? "Yes" : "No";
  }
  if (planData.skinIntegrityDetails) formData.skinIntegrityDetails = planData.skinIntegrityDetails;
  
  // === Risk Section 3: Nutrition ===
  if (planData.mealAssistance) {
    formData.mealAssistance = planData.mealAssistance.toLowerCase().includes("yes") ? "Yes" : "No";
  }
  if (planData.normalDiet) formData.normalDiet = planData.normalDiet;
  if (planData.specialDietary) formData.specialDietary = planData.specialDietary;
  if (planData.foodAllergies) formData.foodAllergies = planData.foodAllergies;
  if (planData.softDiet) formData.softDiet = planData.softDiet;
  if (planData.foodIntolerances) formData.foodIntolerances = planData.foodIntolerances;
  if (planData.tubeFeed) formData.tubeFeed = planData.tubeFeed;
  if (planData.supplementaryFoods) formData.supplementaryFoods = planData.supplementaryFoods;
  // Combine food likes/dislikes
  const foodPrefs = [];
  if (planData.foodLikes) foodPrefs.push(`Foods I like: ${planData.foodLikes}`);
  if (planData.foodDislikes) foodPrefs.push(`Foods I dislike: ${planData.foodDislikes}`);
  if (foodPrefs.length > 0) formData.foodLikesDislikes = foodPrefs.join("\n\n");
  if (planData.portionSize) formData.portionSizes = planData.portionSize;
  if (planData.mainMealTime) formData.mainMealTime = planData.mainMealTime;
  if (planData.fluidIntake) formData.fluidIntake = planData.fluidIntake;
  
  // === Risk Section 4: Equipment ===
  if (planData.equipment && Array.isArray(planData.equipment)) {
    formData.equipment = planData.equipment.map((eq) => ({
      name: eq.name || "",
      fitForPurpose: eq.fitForPurpose || "",
      supplier: eq.supplier || "",
      nextService: eq.nextService || "",
    }));
  }
  if (planData.equipmentRemedialAction) formData.remedialAction = planData.equipmentRemedialAction;
  
  // === Risk Section 5: Mobility ===
  if (planData.weightBearing) formData.weightBearing = planData.weightBearing;
  if (planData.weightBearingDetails) formData.weightBearingDetails = planData.weightBearingDetails;
  if (planData.walking) formData.walking = planData.walking;
  if (planData.walkingDetails) formData.walkingDetails = planData.walkingDetails;
  if (planData.stairs) formData.stairs = planData.stairs;
  if (planData.stairsDetails) formData.stairsDetails = planData.stairsDetails;
  if (planData.sitToStand) formData.sitToStand = planData.sitToStand;
  if (planData.sitToStandDetails) formData.sitToStandDetails = planData.sitToStandDetails;
  if (planData.washing) formData.washing = planData.washing;
  if (planData.washingDetails) formData.washingDetails = planData.washingDetails;
  if (planData.dressing) formData.dressing = planData.dressing;
  if (planData.dressingDetails) formData.dressingDetails = planData.dressingDetails;
  if (planData.oralCare) formData.oralCare = planData.oralCare;
  if (planData.oralCareDetails) formData.oralCareDetails = planData.oralCareDetails;
  if (planData.bathShower) formData.bathShower = planData.bathShower;
  if (planData.toiletCommode) formData.toiletCommode = planData.toiletCommode;
  if (planData.wheelchair) formData.wheelchair = planData.wheelchair;
  if (planData.transfers) formData.transfers = planData.transfers;
  if (planData.moveInBed) formData.moveInBed = planData.moveInBed;
  if (planData.inOutOfBed) formData.inOutOfBed = planData.inOutOfBed;
  if (planData.canBeLeftAlone) formData.canBeLeftAlone = planData.canBeLeftAlone;
  if (planData.proneToFalls) formData.proneToFalls = planData.proneToFalls;
  
  // === Risk Section 6: Appliances ===
  if (planData.cooker) formData.cooker = planData.cooker;
  if (planData.microwave) formData.microwave = planData.microwave;
  if (planData.iron) formData.iron = planData.iron;
  if (planData.kettle) formData.kettle = planData.kettle;
  if (planData.toaster) formData.toaster = planData.toaster;
  if (planData.tumbleDryer) formData.tumbleDryer = planData.tumbleDryer;
  if (planData.floorCoverings) formData.floorCoverings = planData.floorCoverings;
  if (planData.handGrabRails) formData.handGrabRails = planData.handGrabRails;
  if (planData.electricBlanket) formData.electricBlanket = planData.electricBlanket;
  if (planData.bed) formData.bed = planData.bed;
  if (planData.washingMachine) formData.washingMachine = planData.washingMachine;
  if (planData.centralHeating) formData.centralHeating = planData.centralHeating;
  if (planData.appliancesActions) formData.appliancesActions = planData.appliancesActions;
  
  // === Risk Section 7: Fire Safety ===
  if (planData.atRiskOfFire) {
    formData.atRiskOfFire = planData.atRiskOfFire.toLowerCase().includes("yes") ? "Yes" : "No";
  }
  if (planData.fireRiskReason) formData.fireRiskReason = planData.fireRiskReason;
  if (planData.ragRating) formData.ragRating = planData.ragRating;
  if (planData.plugSockets) formData.plugSockets = planData.plugSockets;
  if (planData.electricCables) formData.electricCables = planData.electricCables;
  if (planData.smokingPolicy) {
    formData.smokingPolicy = planData.smokingPolicy.toLowerCase().includes("yes") ? "Yes" : "No";
  }
  if (planData.smokeAlarmLocation) formData.smokeAlarmLocation = planData.smokeAlarmLocation;
  if (planData.smokeAlarmWorking) {
    formData.smokeAlarmWorking = planData.smokeAlarmWorking.toLowerCase().includes("yes") ? "Yes" : "No";
  }
  if (planData.coDetectorLocation) formData.coDetectorLocation = planData.coDetectorLocation;
  if (planData.coDetectorWorking) {
    formData.coDetectorWorking = planData.coDetectorWorking.toLowerCase().includes("yes") ? "Yes" : "No";
  }
  if (planData.canEvacuate) formData.canEvacuate = planData.canEvacuate;
  if (planData.fireActionsDetails) formData.fireActionsDetails = planData.fireActionsDetails;
  
  // === Risk Section 8: COSHH ===
  if (planData.cleaningMaterialsStorage) formData.cleaningMaterialsStorage = planData.cleaningMaterialsStorage;
  
  // === Risk Section 9: External Access ===
  if (planData.access) formData.access = planData.access;
  if (planData.clearPathways) formData.clearPathways = planData.clearPathways;
  if (planData.handrails) formData.handrails = planData.handrails;
  if (planData.entranceSteps) formData.entranceSteps = planData.entranceSteps;
  if (planData.lighting) formData.lighting = planData.lighting;
  if (planData.ramps) formData.ramps = planData.ramps;
  if (planData.personalSecurity) formData.personalSecurity = planData.personalSecurity;
  if (planData.parking) formData.parking = planData.parking;
  if (planData.externalActionsRequired) formData.externalActions = planData.externalActionsRequired;
  
  // === Risk Section 10: Security ===
  if (planData.meansOfAccess) formData.meansOfAccess = planData.meansOfAccess;
  if (planData.propertyType) formData.propertyType = planData.propertyType;
  if (planData.enterUsing) formData.enterUsing = planData.enterUsing;
  if (planData.keysafeConsent) {
    formData.keysafeConsent = planData.keysafeConsent.toLowerCase().includes("yes") ? "Yes" : "No";
  }
  if (planData.gasShutOffLocation) formData.gasShutOffLocation = planData.gasShutOffLocation;
  if (planData.stopTapLocation) formData.stopTapLocation = planData.stopTapLocation;
  if (planData.fuseBoxLocation) formData.fuseBoxLocation = planData.fuseBoxLocation;
  
  // === Section 11: Service User Bands ===
  const bandFields = [
    "personalCare", "mentalHealth", "physicalDisability", "dementia",
    "eatingDisorder", "sensoryImpairment", "detainedMHA", "drugAlcoholMisuse",
    "learningDifficulties"
  ];
  for (const field of bandFields) {
    if (planData[field]) {
      formData[field] = planData[field].toLowerCase().includes("yes") ? "Yes" : "No";
    }
  }
  
  return formData;
};

/**
 * Fill the Initial Assessment form with provided data
 */
const fillInitialAssessment = async (data, metadata = {}) => {
  logAction("Starting Initial Assessment autofill...");
  
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
  if (data.assessor || metadata.assessor) {
    await setTextValue(IA_FIELD_MAPPINGS.assessmentInfo.assessor, data.assessor || metadata.assessor);
  }
  if (data.dateOfAssessment || metadata.date) {
    await setTextValue(IA_FIELD_MAPPINGS.assessmentInfo.dateOfAssessment, data.dateOfAssessment || metadata.date);
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
  if (data.memory) await setSelectValue(IA_FIELD_MAPPINGS.mentalPhysicalHealth.memory, data.memory);
  if (data.moods) await setSelectValue(IA_FIELD_MAPPINGS.mentalPhysicalHealth.moods, data.moods);
  if (data.orientation) await setSelectValue(IA_FIELD_MAPPINGS.mentalPhysicalHealth.orientation, data.orientation);
  if (data.sleepPattern) await setSelectValue(IA_FIELD_MAPPINGS.mentalPhysicalHealth.sleepPattern, data.sleepPattern);
  if (data.behaviours) await setSelectValue(IA_FIELD_MAPPINGS.mentalPhysicalHealth.behaviours, data.behaviours);
  if (data.understandsInfo) await setRadioValue(IA_FIELD_MAPPINGS.mentalPhysicalHealth.understandsInfo, data.understandsInfo);
  if (data.retainsInfo) await setRadioValue(IA_FIELD_MAPPINGS.mentalPhysicalHealth.retainsInfo, data.retainsInfo);
  if (data.contemplatesProsAndCons) await setRadioValue(IA_FIELD_MAPPINGS.mentalPhysicalHealth.contemplatesProsAndCons, data.contemplatesProsAndCons);
  if (data.communicatesDecision) await setRadioValue(IA_FIELD_MAPPINGS.mentalPhysicalHealth.communicatesDecision, data.communicatesDecision);
  if (data.actionsComments) await setTextValue(IA_FIELD_MAPPINGS.mentalPhysicalHealth.actionsComments, data.actionsComments);
  
  // Skin Integrity
  if (data.skinIntegrityRisk) await setRadioValue(IA_FIELD_MAPPINGS.skinIntegrity.atRisk, data.skinIntegrityRisk);
  if (data.skinIntegrityDetails) await setTextValue(IA_FIELD_MAPPINGS.skinIntegrity.actionsDetails, data.skinIntegrityDetails);
  if (data.pictureConsent) await setRadioValue(IA_FIELD_MAPPINGS.skinIntegrity.pictureConsent, data.pictureConsent);
  if (data.bodyMapCompleted) await setRadioValue(IA_FIELD_MAPPINGS.skinIntegrity.bodyMapCompleted, data.bodyMapCompleted);
  
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
  
  logAction("Initial Assessment autofill complete!");
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
  
  return false;
});

/**
 * Auto-run if payload is waiting in storage
 */
const run = async () => {
  if (!isInitialAssessmentPage()) return;
  
  logAction("Initial Assessment form detected");
  
  const { caAcpPayload, caAcpDryRun, caAcpInteractionMode } = await loadStorage([
    STORAGE_KEYS.payload,
    STORAGE_KEYS.dryRun,
    STORAGE_KEYS.interactionMode,
  ]);
  
  // Check if payload is for initial assessment
  if (!caAcpPayload || caAcpPayload.formType !== "initialAssessment") return;
  
  const processedKey = "caIAAutofillProcessed";
  if (sessionStorage.getItem(processedKey)) return;
  sessionStorage.setItem(processedKey, "1");
  
  DRY_RUN = Boolean(caAcpDryRun);
  INTERACTION_MODE = caAcpInteractionMode || "auto";
  
  // Wait for form to be fully loaded
  await wait(1500);
  
  const formData = caAcpPayload.initialAssessmentData || caAcpPayload.data;
  if (!formData) {
    logAction("No initial assessment data found in payload");
    return;
  }
  
  await fillInitialAssessment(formData, {
    assessor: caAcpPayload.assessor,
    date: caAcpPayload.date,
  });
};

// Run when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", run);
} else {
  run();
}
