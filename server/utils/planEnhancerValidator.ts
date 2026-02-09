/**
 * Plan Enhancer Response Validation Utilities
 * 
 * Validates AI-generated plan enhancement responses against the comprehensive schema.
 * Ensures categorical fields contain valid values and identifies deviations for logging/correction.
 */

// Schema definitions for validation
const FIELD_SCHEMAS = {
  riskSection1Health: {
    speech: ["Good", "Fair", "Very Poor", "Severe Loss"],
    hearing: ["Good", "Fair", "Very Poor", "Severe Loss"],
    eyesight: ["Good", "Fair", "Very Poor", "Severe Loss"],
    breathlessness: ["Independent", "Use of Resources"],
    urinaryIncontinence: ["Independent", "Use of Resources"],
    faecalIncontinence: ["Independent", "Use of Resources"],
    memory: ["Good", "Forgetful", "Very Poor", "Severe Loss"],
    moods: ["Stable", "Anxious", "Depressed", "Unstable"],
    orientation: ["Full", "Not always", "Unaware", "Disoriented"],
    sleepPattern: ["Good", "Fair", "Wakes often", "Sleeps little"],
    behaviours: ["Good", "Uncooperative", "Unpredictable", "Aggressive"],
    understandsInfo: ["Yes", "Partially", "No"],
    retainsInfo: ["Yes", "Partially", "No"],
    weighsDecision: ["Yes", "Partially", "No"],
    communicatesDecision: ["Yes", "Partially", "No"],
    riskLevel: ["High", "Medium", "Low"]
  },
  riskSection2Medication: {
    prnMedication: ["Yes", "No", "N/A"],
    covertMedication: ["Yes", "No"],
    pickingUpTablets: ["YES", "NO", "N/A"],
    openingBoxes: ["YES", "NO", "N/A"],
    pouringLiquids: ["YES", "NO", "N/A"],
    usingDosageSystem: ["YES", "NO", "N/A"],
    applyingCreams: ["YES", "NO", "N/A"],
    swallowingTablets: ["YES", "NO", "N/A"],
    understandingInstructions: ["YES", "NO", "N/A"],
    managingInhalers: ["YES", "NO", "N/A"],
    instillingDrops: ["YES", "NO", "N/A"],
    skinIntegrity: ["Yes", "No"],
    pictureConsent: ["Yes", "No"],
    bodyMapCompleted: ["Yes", "No"],
    riskLevel: ["High", "Medium", "Low"]
  },
  riskSection3Nutrition: {
    mealAssistance: ["Yes", "No"],
    normalDiet: ["Yes", "No"],
    specialDietary: ["Yes", "No"],
    foodAllergies: ["Yes", "No"],
    softDiet: ["Yes", "No"],
    foodIntolerances: ["Yes", "No"],
    tubeFeed: ["Yes", "No"],
    supplementaryFoods: ["Yes", "No"],
    riskLevel: ["High", "Medium", "Low"]
  },
  riskSection4Equipment: {
    equipmentFitForPurpose: ["Yes", "No"],
    riskLevel: ["High", "Medium", "Low"]
  },
  riskSection5Mobility: {
    weightBearing: ["Independent", "Requires Assistance", "Uses Equipment", "Unable"],
    walking: ["Independent", "Requires Assistance", "Uses Equipment", "Unable"],
    stairs: ["Independent", "Requires Assistance", "Uses Equipment", "Unable", "No steps/stairs"],
    sitToStand: ["Independent", "Requires Assistance", "Uses Equipment", "Unable"],
    washing: ["Independent", "Requires Assistance", "Uses Equipment", "Unable"],
    dressing: ["Independent", "Requires Assistance", "Uses Equipment", "Unable"],
    oralCare: ["Independent", "Requires Assistance", "Uses Equipment", "Unable"],
    bathShower: ["Independent", "Requires Assistance", "Uses Equipment", "Unable"],
    toiletCommode: ["Independent", "Requires Assistance", "Uses Equipment", "Unable"],
    wheelchair: ["Independent", "Requires Assistance", "Uses Equipment", "Unable", "N/A"],
    transfers: ["Independent", "Requires Assistance", "Uses Equipment", "Unable", "N/A"],
    moveInBed: ["Independent", "Requires Assistance", "Uses Equipment", "Unable"],
    inOutOfBed: ["Independent", "Requires Assistance", "Uses Equipment", "Unable"],
    chairToWheelchair: ["Independent", "Requires Assistance", "Uses Equipment", "Unable", "N/A"],
    inOutOfCar: ["Independent", "Requires Assistance", "Uses Equipment", "Unable"],
    otherTransfers: ["Independent", "Requires Assistance", "Uses Equipment", "Unable", "N/A"],
    communityAccess: ["Independent", "Requires Assistance", "Uses Equipment", "Unable"],
    specialistEquipment: ["Independent", "Requires Assistance", "Uses Equipment", "Unable", "N/A"],
    canBeLeftAlone: ["Always", "Long Period", "Short Period", "Not at all"],
    proneToFalls: ["Never", "Occasionally", "Often", "Frequent"],
    riskLevel: ["High", "Medium", "Low"]
  },
  riskSection6Appliances: {
    cooker: ["Fit for Purpose", "Not Fit for Purpose", "N/A"],
    microwave: ["Fit for Purpose", "Not Fit for Purpose", "N/A"],
    iron: ["Fit for Purpose", "Not Fit for Purpose", "N/A"],
    kettle: ["Fit for Purpose", "Not Fit for Purpose", "N/A"],
    toaster: ["Fit for Purpose", "Not Fit for Purpose", "N/A"],
    tumbleDryer: ["Fit for Purpose", "Not Fit for Purpose", "N/A"],
    floorCoverings: ["Fit for Purpose", "Not Fit for Purpose", "N/A"],
    handRails: ["Fit for Purpose", "Not Fit for Purpose", "N/A"],
    electricBlanket: ["Fit for Purpose", "Not Fit for Purpose", "N/A"],
    bed: ["Fit for Purpose", "Not Fit for Purpose", "N/A"],
    washingMachine: ["Fit for Purpose", "Not Fit for Purpose", "N/A"],
    centralHeating: ["Fit for Purpose", "Not Fit for Purpose", "N/A"]
  },
  riskSection7Fire: {
    atRisk: ["Yes", "No"],
    riskReasons: ["Smoking", "Cooking", "Hoarding", "Lighter Fuel", "Open Fire", "Free standing heaters", "Paraffin-based emollients", "Oxygen", "Candles", "Other"],
    ragRating: ["Red", "Amber", "Green"],
    plugSockets: ["Fit for Purpose", "Not Fit for Purpose", "N/A"],
    electricCables: ["Fit for Purpose", "Not Fit for Purpose", "N/A"],
    smokingPolicy: ["Yes", "No"],
    smokeAlarmWorking: ["Yes", "No"],
    coDetectorWorking: ["Yes", "No"],
    actionsTaken: ["Referral made to Fire Service", "Social Services", "No Actions Required", "Other"]
  },
  riskSection8COSHH: {
    riddorExplained: ["Yes", "No"]
  },
  riskSection9External: {
    access: ["Fit for Purpose", "Concerns", "N/A"],
    accessLocation: ["Front", "Rear", "Side", "Other"],
    clearPathways: ["Fit for Purpose", "Concerns", "N/A"],
    clearPathwaysLocation: ["Front", "Rear", "Side", "Other"],
    handrails: ["Fit for Purpose", "Concerns", "N/A"],
    handrailsLocation: ["Front", "Rear", "Side", "Other"],
    entranceSteps: ["Fit for Purpose", "Concerns", "N/A"],
    entranceStepsLocation: ["Front", "Rear", "Side", "Other"],
    lighting: ["Fit for Purpose", "Concerns", "N/A"],
    lightingLocation: ["Front", "Rear", "Side", "Other"],
    ramps: ["Fit for Purpose", "Concerns", "N/A"],
    rampsLocation: ["Front", "Rear", "Side", "Other"],
    personalSecurity: ["Fit for Purpose", "Concerns", "N/A"],
    personalSecurityLocation: ["Front", "Rear", "Side", "Other"],
    parking: ["Fit for Purpose", "Concerns", "N/A"],
    parkingLocation: ["Front", "Rear", "Side", "Other"],
    riskLevel: ["High", "Medium", "Low"]
  },
  riskSection10Security: {
    meansOfAccess: ["Key safe", "Key held", "Other"],
    propertyType: ["House", "Flat", "Bungalow", "Other"],
    enterUsing: ["Front door", "Side door", "Back door", "Other"],
    keysafeConsent: ["Yes", "No"],
    riskLevel: ["High", "Medium", "Low"]
  },
  section11Bands: {
    personalCare: ["Yes", "No"],
    mentalHealth: ["Yes", "No"],
    physicalDisability: ["Yes", "No"],
    dementia: ["Yes", "No"],
    eatingDisorder: ["Yes", "No"],
    sensoryImpairment: ["Yes", "No"],
    detainedMHA: ["Yes", "No"],
    drugAlcoholMisuse: ["Yes", "No"],
    learningDifficulties: ["Yes", "No"]
  },
  advanceDecisions: {
    advanceDecisionInPlace: ["Yes", "No"],
    lastingPOA: ["Yes", "No"]
  }
};

/**
 * Validation result interface
 */
interface ValidationResult {
  valid: boolean;
  errors: Array<{
    section: string;
    field: string;
    value: string;
    expected: string[];
    severity: "error" | "warning";
  }>;
  warnings: Array<{
    section: string;
    field: string;
    message: string;
  }>;
}

/**
 * Strip EXACTLY ONE OF: prefix from a value
 */
function stripPrefix(value: string): string {
  if (!value || typeof value !== "string") return value;
  return value.replace(/^EXACTLY ONE OF:\s*/i, "").trim();
}

/**
 * Validate a single categorical field value
 */
function validateFieldValue(
  section: string,
  field: string,
  value: any,
  allowedValues: string[]
): { valid: boolean; error?: any; warning?: any } {
  // Skip validation for null/undefined
  if (value === null || value === undefined) {
    return { valid: true };
  }

  // Skip validation for narrative text fields (objects with nested fields)
  if (typeof value === "object" && !Array.isArray(value)) {
    return { valid: true };
  }

  // Handle array fields (like fire risk reasons)
  if (Array.isArray(value)) {
    const invalidItems = value.filter(item => {
      const cleaned = stripPrefix(item);
      return !allowedValues.includes(cleaned);
    });
    
    if (invalidItems.length > 0) {
      return {
        valid: false,
        error: {
          section,
          field,
          value: invalidItems.join(", "),
          expected: allowedValues,
          severity: "error"
        }
      };
    }
    return { valid: true };
  }

  // Single value validation
  const cleaned = stripPrefix(String(value));
  
  // Check for "Not specified" or similar placeholders (these are acceptable)
  const placeholders = [
    "not specified in documents provided",
    "to be confirmed at initial visit",
    "not specified",
    "to be confirmed",
    "information not provided"
  ];
  
  if (placeholders.some(p => cleaned.toLowerCase().includes(p))) {
    return {
      valid: true,
      warning: {
        section,
        field,
        message: `Field value is placeholder: "${cleaned}"`
      }
    };
  }

  // Check if value matches allowed values (case-sensitive)
  if (!allowedValues.includes(cleaned)) {
    // Try case-insensitive match as warning
    const caseInsensitiveMatch = allowedValues.find(
      av => av.toLowerCase() === cleaned.toLowerCase()
    );
    
    if (caseInsensitiveMatch) {
      return {
        valid: false,
        error: {
          section,
          field,
          value: cleaned,
          expected: allowedValues,
          severity: "warning"
        }
      };
    }
    
    return {
      valid: false,
      error: {
        section,
        field,
        value: cleaned,
        expected: allowedValues,
        severity: "error"
      }
    };
  }

  return { valid: true };
}

/**
 * Validate entire plan enhancer response
 */
export function validatePlanEnhancerResponse(response: any): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: []
  };

  // Validate each section
  for (const [sectionName, schema] of Object.entries(FIELD_SCHEMAS)) {
    const sectionData = response[sectionName];
    
    if (!sectionData) {
      // Section missing - this is acceptable if it's optional
      continue;
    }

    // Validate each field in the section
    for (const [fieldName, allowedValues] of Object.entries(schema)) {
      const fieldValue = sectionData[fieldName];
      
      // Special handling for equipment array
      if (sectionName === "riskSection4Equipment" && fieldName === "equipmentFitForPurpose") {
        if (Array.isArray(sectionData.equipment)) {
          sectionData.equipment.forEach((eq: any, index: number) => {
            const validation = validateFieldValue(
              `${sectionName}.equipment[${index}]`,
              "fitForPurpose",
              eq.fitForPurpose,
              allowedValues
            );
            
            if (!validation.valid && validation.error) {
              result.errors.push(validation.error);
              result.valid = false;
            }
            if (validation.warning) {
              result.warnings.push(validation.warning);
            }
          });
        }
        continue;
      }

      const validation = validateFieldValue(sectionName, fieldName, fieldValue, allowedValues);
      
      if (!validation.valid && validation.error) {
        result.errors.push(validation.error);
        if (validation.error.severity === "error") {
          result.valid = false;
        }
      }
      
      if (validation.warning) {
        result.warnings.push(validation.warning);
      }
    }
  }

  return result;
}

/**
 * Auto-correct common AI response issues
 */
export function autoCorrectPlanEnhancerResponse(response: any): {
  corrected: any;
  corrections: string[];
} {
  const corrections: string[] = [];
  const corrected = JSON.parse(JSON.stringify(response)); // Deep clone

  // Auto-correct case mismatches
  for (const [sectionName, schema] of Object.entries(FIELD_SCHEMAS)) {
    const sectionData = corrected[sectionName];
    if (!sectionData) continue;

    for (const [fieldName, allowedValues] of Object.entries(schema)) {
      const fieldValue = sectionData[fieldName];
      
      if (fieldValue && typeof fieldValue === "string") {
        const cleaned = stripPrefix(fieldValue);
        const exactMatch = allowedValues.includes(cleaned);
        
        if (!exactMatch) {
          // Try case-insensitive match
          const caseInsensitiveMatch = allowedValues.find(
            av => av.toLowerCase() === cleaned.toLowerCase()
          );
          
          if (caseInsensitiveMatch) {
            sectionData[fieldName] = caseInsensitiveMatch;
            corrections.push(
              `${sectionName}.${fieldName}: "${cleaned}" → "${caseInsensitiveMatch}" (case correction)`
            );
          }
        }
      }
    }
  }

  return { corrected, corrections };
}

/**
 * Generate validation report for logging
 */
export function generateValidationReport(validation: ValidationResult): string {
  if (validation.valid && validation.errors.length === 0 && validation.warnings.length === 0) {
    return "✅ Plan enhancer response is fully valid";
  }

  const parts: string[] = [];
  
  if (validation.errors.length > 0) {
    parts.push(`❌ ${validation.errors.length} validation error(s):`);
    validation.errors.forEach(err => {
      parts.push(`  • ${err.section}.${err.field}: "${err.value}" (expected one of: ${err.expected.join(", ")})`);
    });
  }
  
  if (validation.warnings.length > 0) {
    parts.push(`⚠️  ${validation.warnings.length} validation warning(s):`);
    validation.warnings.forEach(warn => {
      parts.push(`  • ${warn.section}.${warn.field}: ${warn.message}`);
    });
  }

  return parts.join("\n");
}
