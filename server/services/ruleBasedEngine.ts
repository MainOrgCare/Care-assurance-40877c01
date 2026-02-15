/**
 * Rule-Based Risk Assessment Engine v2.0
 * Reduces AI usage by handling predictable patterns with deterministic rules.
 * Falls back to AI only for complex or ambiguous cases.
 */

// Risk level determination based on keywords
const RISK_KEYWORDS = {
  high: [
    "falls frequently", "multiple falls", "non-compliant", "refuses medication",
    "aggressive", "violence", "self-harm", "dementia", "alzheimers", "wandering",
    "oxygen dependent", "peg feed", "catheter", "insulin dependent", "diabetic hypo",
    "seizures", "epilepsy", "pacemaker", "chest pain", "breathless at rest",
    "bedridden", "hoisted", "full assist", "two carers", "pressure sores",
    "grade 3", "grade 4", "sepsis risk", "end of life", "palliative",
    "swallowing difficulties", "choking risk", "nil by mouth", "thickened fluids",
    "fire risk", "smoker", "unsafe electrics", "hoarding", "no smoke alarm",
    "dols", "deprivation of liberty", "lacks capacity", "best interest decision",
    "double up care", "hoist required", "stand aid", "profiling bed",
    "suicidal", "overdose", "self neglect", "severe anxiety", "psychosis"
  ],
  medium: [
    "occasional falls", "unsteady", "walking frame", "zimmer", "rollator",
    "forgetful", "confused at times", "mild dementia", "supervision needed",
    "medication prompts", "needs reminding", "blister pack", "dosette",
    "diabetes type 2", "hypertension", "copd", "asthma", "heart condition",
    "arthritis", "limited mobility", "one carer assist", "strip wash only",
    "hearing impaired", "vision impaired", "glasses required", "hearing aids",
    "anxiety", "depression", "low mood", "social isolation",
    "oxygen prn", "nebuliser", "inhaler", "blood pressure monitoring",
    "stoma", "leg ulcers", "wound dressing", "fragile skin", "bruises easily"
  ],
  low: [
    "independent", "self-medicating", "mobile", "walks unaided", "alert",
    "oriented", "good appetite", "no allergies", "social activities",
    "family support", "regular visitors", "stable condition",
    "no mobility issues", "good cognition", "continent", "no equipment"
  ]
};

// Care plan section patterns
const CARE_PLAN_SECTIONS = {
  health: {
    keywords: ["diagnosis", "condition", "medical history", "gp", "doctor", "hospital", "clinic"],
    prompts: ["My health conditions include", "I have been diagnosed with", "My GP is"]
  },
  medication: {
    keywords: ["medication", "tablet", "medicine", "prescription", "pharmacy", "dosette", "blister pack"],
    prompts: ["I take medication for", "My medicines are", "I need help with my medication because"]
  },
  nutrition: {
    keywords: ["eating", "drinking", "appetite", "diet", "food", "meal", "fluid", "nutrition"],
    prompts: ["I enjoy eating", "My dietary needs include", "I need", "glasses of fluid daily"]
  },
  personalCare: {
    keywords: ["washing", "bathing", "dressing", "personal care", "hygiene", "shower", "bath"],
    prompts: ["I prefer to wash", "I need assistance with", "My personal care routine includes"]
  },
  mobility: {
    keywords: ["walking", "mobility", "movement", "transfer", "wheelchair", "frame", "hoist"],
    prompts: ["I am able to", "I use a", "I need help moving because"]
  },
  skin: {
    keywords: ["skin", "pressure", "wound", "bruise", "mark", "waterlow", "integrity"],
    prompts: ["My skin condition is", "I have", "I need skin checks because"]
  },
  continence: {
    keywords: ["continence", "toilet", "pad", "catheter", "bowel", "bladder", "incontinence"],
    prompts: ["I am", "continent", "I use", "I need assistance with toileting because"]
  },
  environment: {
    keywords: ["home", "living", "equipment", "safety", "stairs", "access", "hazard"],
    prompts: ["My home has", "I have equipment including", "Access to my home is"]
  },
  social: {
    keywords: ["family", "friends", "activities", "hobbies", "interests", "social", "community"],
    prompts: ["I enjoy", "My family includes", "I like to spend time"]
  },
  communication: {
    keywords: ["communication", "speech", "language", "hearing", "vision", "understand"],
    prompts: ["I communicate by", "I understand best when", "I need support with communication because"]
  }
};

// Medication patterns for extraction
const MEDICATION_PATTERNS = {
  routes: {
    oral: ["oral", "by mouth", "swallow", "tablet", "capsule", "liquid oral"],
    topical: ["topical", "apply to skin", "cream", "ointment", "gel", "patch"],
    inhaled: ["inhaled", "inhaler", "nebuliser", "puff"],
    injection: ["injection", "inject", "subcutaneous", "intramuscular", "insulin"],
    rectal: ["rectal", "suppository", "enema"],
    sublingual: ["sublingual", "under tongue", "dissolve"]
  },
  frequencies: {
    "once daily": ["once daily", "od", "daily", "every day", "morning", "night"],
    "twice daily": ["twice daily", "bd", "twice a day", "morning and evening"],
    "three times daily": ["three times", "tds", "tid", "8 hourly"],
    "four times daily": ["four times", "qds", "qid", "6 hourly"],
    "as required": ["prn", "as required", "when needed", "as needed"]
  },
  storage: {
    fridge: ["fridge", "refrigerat", "cold", "2-8"],
    room: ["room temperature", "cupboard", "dry place"],
    controlled: ["controlled drug", "cd", "schedule 2", "morphine", "oxycodone"]
  }
};

// Equipment safety patterns
const EQUIPMENT_PATTERNS = {
  safe: ["working", "tested", "serviced", "good condition", "fit for purpose", "yes", "passed", "compliant"],
  unsafe: ["not working", "broken", "faulty", "damaged", "needs repair", "overdue service", "no", "failed", "non-compliant"]
};

export interface RuleBasedRisk {
  level: "Low" | "Medium" | "High";
  confidence: number; // 0-1 scale
  matchedKeywords: string[];
  requiresAI: boolean;
  reason: string;
}

export interface ExtractedCarePlanData {
  section: string;
  content: string[];
  confidence: number;
  riskLevel?: "Low" | "Medium" | "High";
}

export interface MedicationInfo {
  name?: string;
  route?: string;
  frequency?: string;
  storage?: string;
  isControlled?: boolean;
  needsMonitoring?: boolean;
}

/**
 * Check if a keyword match is negated by a preceding "no", "not", "no known", "denies", etc.
 */
function isNegated(text: string, keyword: string): boolean {
  const idx = text.indexOf(keyword);
  if (idx < 0) return false;
  // Look at the 20 chars before the keyword for negation words
  const prefix = text.slice(Math.max(0, idx - 20), idx).trim().toLowerCase();
  return /\b(no|not|no known|denies|denied|without|nil|never|none|absent|negative for)\s*$/.test(prefix);
}

/**
 * Analyze text for risk level using keyword matching
 */
export function analyzeRiskLevel(text: string): RuleBasedRisk {
  const normalized = text.toLowerCase();
  const matchedHigh: string[] = [];
  const matchedMedium: string[] = [];
  const matchedLow: string[] = [];
  
  // Check for high-risk indicators (skip if negated)
  for (const keyword of RISK_KEYWORDS.high) {
    if (normalized.includes(keyword) && !isNegated(normalized, keyword)) {
      matchedHigh.push(keyword);
    }
  }
  
  // Check for medium-risk indicators (skip if negated)
  for (const keyword of RISK_KEYWORDS.medium) {
    if (normalized.includes(keyword) && !isNegated(normalized, keyword)) {
      matchedMedium.push(keyword);
    }
  }
  
  // Check for low-risk indicators
  for (const keyword of RISK_KEYWORDS.low) {
    if (normalized.includes(keyword)) {
      matchedLow.push(keyword);
    }
  }
  
  // Determine risk level
  const totalMatches = matchedHigh.length + matchedMedium.length + matchedLow.length;
  
  if (totalMatches === 0) {
    return {
      level: "Medium",
      confidence: 0.3,
      matchedKeywords: [],
      requiresAI: true,
      reason: "No recognizable risk keywords found - AI analysis recommended"
    };
  }
  
  // High risk takes priority
  if (matchedHigh.length > 0) {
    const confidence = Math.min(0.95, 0.5 + (matchedHigh.length * 0.15));
    return {
      level: "High",
      confidence,
      matchedKeywords: matchedHigh,
      requiresAI: confidence < 0.7,
      reason: `Found ${matchedHigh.length} high-risk indicator(s)`
    };
  }
  
  // Medium vs Low
  if (matchedMedium.length > matchedLow.length) {
    const confidence = Math.min(0.9, 0.5 + (matchedMedium.length * 0.1));
    return {
      level: "Medium",
      confidence,
      matchedKeywords: matchedMedium,
      requiresAI: confidence < 0.6,
      reason: `Found ${matchedMedium.length} medium-risk indicator(s)`
    };
  }
  
  if (matchedLow.length > 0) {
    const confidence = Math.min(0.85, 0.5 + (matchedLow.length * 0.1));
    return {
      level: "Low",
      confidence,
      matchedKeywords: matchedLow,
      requiresAI: false,
      reason: `Found ${matchedLow.length} low-risk indicator(s)`
    };
  }
  
  return {
    level: "Medium",
    confidence: 0.5,
    matchedKeywords: [],
    requiresAI: true,
    reason: "Insufficient information for confident assessment"
  };
}

/**
 * Parse equipment safety status without AI
 */
export function parseEquipmentStatus(text: string): "Safe" | "Concerns" | "N/A" | null {
  const normalized = text.toLowerCase().trim();
  
  if (normalized === "n/a" || normalized === "not applicable" || normalized === "") {
    return "N/A";
  }
  
  for (const pattern of EQUIPMENT_PATTERNS.unsafe) {
    if (normalized.includes(pattern)) return "Concerns";
  }
  
  for (const pattern of EQUIPMENT_PATTERNS.safe) {
    if (normalized.includes(pattern)) return "Safe";
  }
  
  return null;
}

/**
 * Extract common values from text using patterns (no AI needed)
 */
export function extractCommonFields(text: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const normalized = text.toLowerCase();
  
  // Helper to check if any term is present
  const has = (terms: string[]) => terms.some(t => normalized.includes(t));
  
  // Memory level detection
  if (has(["good memory", "remembers well", "memory is good", "intact memory", "no memory issues"])) {
    fields.memory = "Good";
  } else if (has(["poor memory", "forgets often", "significant memory loss", "severe memory", "no short term memory"])) {
    fields.memory = "Poor";
  } else if (has(["fair memory", "sometimes forgets", "mild memory", "occasional memory", "forgetful"])) {
    fields.memory = "Fair";
  }
  
  // Mood detection
  if (has(["stable mood", "happy", "content", "bright mood", "good spirits", "cheerful"])) {
    fields.moods = "Stable";
  } else if (has(["variable mood", "mood swings", "mood can change", "fluctuating mood"])) {
    fields.moods = "Variable";
  } else if (has(["low mood", "depressed", "anxious", "tearful", "withdrawn", "flat mood"])) {
    fields.moods = "Low";
  }
  
  // Orientation detection
  if (has(["fully oriented", "knows time and place", "oriented to time", "well oriented", "oriented x3"])) {
    fields.orientation = "Good";
  } else if (has(["disorientated", "disorientated to time", "severely confused", "does not know where"])) {
    fields.orientation = "Disorientated";
  } else if (has(["sometimes confused", "occasionally confused", "confused at times", "mild confusion", "gets confused"])) {
    fields.orientation = "Confused at times";
  }
  
  // Sleep pattern detection
  if (has(["sleeps well", "good sleep", "sleeps through", "no sleep issues", "restful sleep"])) {
    fields.sleepPattern = "Good";
  } else if (has(["disturbed sleep", "wakes frequently", "wakes during", "night waking", "restless at night"])) {
    fields.sleepPattern = "Disturbed";
  } else if (has(["poor sleep", "insomnia", "rarely sleeps", "very little sleep", "chronic sleep"])) {
    fields.sleepPattern = "Poor";
  }
  
  // Mobility detection
  if (has(["fully mobile", "walks independently", "no mobility issues", "mobile unaided", "independent mobility"])) {
    fields.mobility = "Independent";
  } else if (has(["uses frame", "zimmer", "rollator", "walking stick", "walking aid", "crutch", "walks with aid"])) {
    fields.mobility = "With aid";
  } else if (has(["wheelchair", "non-ambulant", "bedridden", "bed bound", "immobile", "unable to walk"])) {
    fields.mobility = "Unable";
  }
  
  // Speech detection
  if (has(["clear speech", "speaks clearly", "good speech", "communicates well", "articulate"])) {
    fields.speech = "Good";
  } else if (has(["communication device", "uses device", "lightwriter", "picture board", "communication aid"])) {
    fields.speech = "Uses device";
  } else if (has(["impaired speech", "speech difficulty", "slurred", "aphasia", "dysarthria", "non-verbal", "limited speech", "difficulty speaking"])) {
    fields.speech = "Impaired";
  }
  
  // Hearing detection
  if (has(["good hearing", "hearing is good", "hears well", "no hearing issues", "hearing normal"])) {
    fields.hearing = "Good";
  } else if (has(["hearing aid", "wears aids", "uses hearing", "bilateral hearing aids", "requires hearing"])) {
    fields.hearing = "Impaired/Uses aids";
  } else if (has(["hearing impaired", "hard of hearing", "deaf", "hearing loss", "poor hearing", "partially deaf"])) {
    fields.hearing = "Impaired";
  }
  
  // Eyesight detection
  if (has(["good eyesight", "good vision", "sees well", "eyesight is good", "vision normal", "no vision issues"])) {
    fields.eyesight = "Good";
  } else if (has(["wears glasses", "uses glasses", "spectacles", "contact lenses", "reading glasses", "varifocal"])) {
    fields.eyesight = "Impaired/Uses glasses";
  } else if (has(["poor vision", "vision impaired", "partially sighted", "blind", "registered blind", "cataract", "macular", "glaucoma", "poor eyesight"])) {
    fields.eyesight = "Impaired";
  }
  
  // Breathlessness detection
  if (has(["no breathlessness", "breathing normal", "no respiratory", "lungs clear"])) {
    fields.breathlessness = "None";
  } else if (has(["breathless at rest", "severe breathlessness", "oxygen dependent", "continuous oxygen", "breathless on talking"])) {
    fields.breathlessness = "Severe";
  } else if (has(["moderate breathlessness", "breathless on exertion", "breathless walking", "gets breathless", "short of breath"])) {
    fields.breathlessness = "Moderate";
  } else if (has(["mild breathlessness", "occasionally breathless", "slight breathlessness", "breathless on stairs"])) {
    fields.breathlessness = "Mild";
  }
  
  // Urinary incontinence detection
  if (has(["continent", "no incontinence", "uses toilet independently", "no urinary issues"])) {
    fields.urinaryIncontinence = "None";
  } else if (has(["frequent incontinence", "incontinent of urine", "catheter", "urinary catheter", "always wears pad"])) {
    fields.urinaryIncontinence = "Frequent";
  } else if (has(["occasional incontinence", "sometimes wet", "urgency", "stress incontinence", "wears pad", "night pad"])) {
    fields.urinaryIncontinence = "Occasional";
  }
  
  // Faecal incontinence detection
  if (has(["faecal incontinence", "bowel incontinence", "incontinent of faeces", "soiling", "stoma", "colostomy"])) {
    fields.faecalIncontinence = has(["frequent", "regular", "daily", "stoma", "colostomy"]) ? "Frequent" : "Occasional";
  } else if (has(["bowels regular", "no bowel issues", "continent of faeces"])) {
    fields.faecalIncontinence = "None";
  }
  
  // Behaviours detection
  if (has(["aggressive", "violent behaviour", "physical aggression", "challenging behaviour", "frequently agitated"])) {
    fields.behaviours = "Frequent concerns";
  } else if (has(["occasional agitation", "sometimes agitated", "can become anxious", "occasional distress", "wandering"])) {
    fields.behaviours = "Occasional";
  } else if (has(["no behavioural", "no concerns", "calm", "cooperative", "pleasant"])) {
    fields.behaviours = "None";
  }
  
  // Weight bearing detection
  if (has(["full weight bearing", "fwb", "bears weight fully", "stands independently"])) {
    fields.weightBearing = "Full";
  } else if (has(["partial weight bearing", "pwb", "some weight bearing", "assisted weight bearing"])) {
    fields.weightBearing = "Partial";
  } else if (has(["non weight bearing", "nwb", "no weight bearing", "unable to bear weight", "hoisted"])) {
    fields.weightBearing = "None";
  }
  
  // Stairs detection
  if (has(["manages stairs independently", "stairs unaided", "uses stairs alone"])) {
    fields.stairs = "Independent";
  } else if (has(["stairs with support", "needs help on stairs", "one step at a time", "stairlift", "rail on stairs"])) {
    fields.stairs = "With support";
  } else if (has(["unable to manage stairs", "cannot do stairs", "no stairs", "ground floor only", "bungalow"])) {
    fields.stairs = "Unable";
  }
  
  // Sit to stand detection
  if (has(["stands independently", "sit to stand independent", "gets up without help"])) {
    fields.sitToStand = "Independent";
  } else if (has(["needs help to stand", "assist to stand", "stand aid", "sara steady", "help getting up", "needs pulling up"])) {
    fields.sitToStand = "Needs help";
  }
  
  // Washing detection
  if (has(["washes independently", "independent with washing", "manages own wash"])) {
    fields.washing = "Independent";
  } else if (has(["needs assistance with wash", "help with washing", "strip wash", "assist with shower", "wash support"])) {
    fields.washing = "Needs assistance";
  }
  
  // Dressing detection
  if (has(["dresses independently", "independent with dressing", "manages own clothing"])) {
    fields.dressing = "Independent";
  } else if (has(["needs help dressing", "help with dressing", "assist with clothing", "cannot dress", "dressing support"])) {
    fields.dressing = "Needs help";
  }
  
  // Can be left alone detection
  if (has(["can be left alone", "safe to leave", "lives alone", "on own safely", "independent at home"])) {
    fields.canBeLeftAlone = "Yes";
  } else if (has(["cannot be left alone", "not safe alone", "supervision required", "24 hour care", "constant supervision"])) {
    fields.canBeLeftAlone = "No";
  }
  
  // Prone to falls detection
  if (has(["history of falls", "falls frequently", "fallen recently", "prone to falls", "unsteady", "fall risk", "recurrent falls", "multiple falls"])) {
    fields.proneToFalls = "Yes";
  } else if (has(["no falls", "no history of falls", "steady on feet", "no fall risk"])) {
    fields.proneToFalls = "No";
  }
  
  // Property type detection
  if (has(["bungalow"])) {
    fields.propertyType = "Bungalow";
  } else if (has(["flat", "apartment", "maisonette"])) {
    fields.propertyType = "Flat";
  } else if (has(["house", "semi-detached", "detached", "terraced"])) {
    fields.propertyType = "House";
  }
  
  // Key safe detection
  if (has(["key safe", "keysafe", "key box", "keybox"])) {
    fields.meansOfAccess = "Key safe";
  } else if (has(["key held", "key held by", "spare key"])) {
    fields.meansOfAccess = "Key held";
  }
  
  // Smoking detection
  if (has(["non-smoker", "non smoker", "does not smoke", "never smoked", "ex-smoker", "ex smoker", "gave up smoking"])) {
    fields.smokingStatus = "Non-smoker";
  } else if (has(["smoker", "smokes", "cigarette", "tobacco", "rolls own"])) {
    fields.smokingStatus = "Smoker";
  }
  
  return fields;
}

/**
 * Calculate a rule-based quality score for care plan text
 */
export function calculatePlanQuality(text: string): { score: number; feedback: string[] } {
  const feedback: string[] = [];
  let score = 100;
  
  const wordCount = text.trim().split(/\s+/).length;
  
  // Check word count
  if (wordCount < 100) {
    score -= 30;
    feedback.push("Content is too brief - needs more detail");
  } else if (wordCount < 300) {
    score -= 15;
    feedback.push("Content could be more detailed");
  }
  
  // Check for first person
  const hasFirstPerson = /\b(I|my|me)\b/i.test(text);
  if (!hasFirstPerson) {
    score -= 20;
    feedback.push("Should be written in first person (I, my, me)");
  }
  
  // Check for vague language
  const vagueTerms = ["various", "some", "appropriate", "as needed", "when required"];
  const foundVague = vagueTerms.filter(term => text.toLowerCase().includes(term));
  if (foundVague.length > 0) {
    score -= foundVague.length * 5;
    feedback.push(`Contains vague terms: ${foundVague.join(", ")}`);
  }
  
  // Check for placeholders
  if (text.includes("[") && text.includes("]")) {
    score -= 10;
    feedback.push("Contains unfilled placeholders");
  }
  
  // Check for specifics (good indicators)
  const hasSpecifics = /\d+\s*(mg|ml|times|hours|minutes|am|pm)/i.test(text);
  if (hasSpecifics) {
    score += 5;
    feedback.push("Good: Contains specific measurements/times");
  }
  
  return {
    score: Math.max(0, Math.min(100, score)),
    feedback
  };
}

/**
 * Determine if AI is needed for a given task based on complexity
 */
export function shouldUseAI(
  taskType: "risk_assessment" | "care_plan" | "simple_extraction",
  text: string,
  existingData?: Record<string, any>
): { useAI: boolean; reason: string; ruleBasedResult?: any } {
  const wordCount = text.trim().split(/\s+/).length;
  
  switch (taskType) {
    case "simple_extraction":
      // Never use AI for simple Yes/No or status extractions
      const extracted = extractCommonFields(text);
      const hasResults = Object.keys(extracted).length > 0;
      return {
        useAI: !hasResults,
        reason: hasResults ? "Rule-based extraction sufficient" : "Complex extraction needed",
        ruleBasedResult: extracted
      };
      
    case "risk_assessment":
      const riskAnalysis = analyzeRiskLevel(text);
      if (riskAnalysis.confidence > 0.75) {
        return {
          useAI: false,
          reason: `High confidence rule-based assessment (${(riskAnalysis.confidence * 100).toFixed(0)}%)`,
          ruleBasedResult: riskAnalysis
        };
      }
      return {
        useAI: true,
        reason: `Low confidence (${(riskAnalysis.confidence * 100).toFixed(0)}%) - AI recommended`,
        ruleBasedResult: riskAnalysis
      };
      
    case "care_plan":
      // Care plans generally need AI for synthesis
      // But we can skip if text is very short
      if (wordCount < 50) {
        return {
          useAI: false,
          reason: "Insufficient content for care plan generation",
          ruleBasedResult: { error: "Please provide more detailed information" }
        };
      }
      return {
        useAI: true,
        reason: "Care plan synthesis requires AI"
      };
      
    default:
      return { useAI: true, reason: "Unknown task type" };
  }
}

console.log("[RuleEngine] Rule-based risk assessment engine v2.0 loaded");

/**
 * Extract care plan content by section from raw text
 */
export function extractCarePlanSections(text: string): Record<string, ExtractedCarePlanData> {
  const normalized = text.toLowerCase();
  const results: Record<string, ExtractedCarePlanData> = {};
  
  for (const [section, patterns] of Object.entries(CARE_PLAN_SECTIONS)) {
    const content: string[] = [];
    let matchCount = 0;
    
    // Find keyword matches
    for (const keyword of patterns.keywords) {
      if (normalized.includes(keyword)) {
        matchCount++;
        // Extract sentences containing the keyword
        const sentences = text.split(/[.!?]+/).filter(s => 
          s.toLowerCase().includes(keyword) && s.trim().length > 10
        );
        content.push(...sentences.map(s => s.trim()));
      }
    }
    
    // Analyze risk level for this section
    const sectionRisk = analyzeRiskLevel(content.join(" "));
    
    if (matchCount > 0) {
      results[section] = {
        section,
        content: [...new Set(content)].slice(0, 5), // Dedupe and limit
        confidence: Math.min(0.9, 0.4 + (matchCount * 0.1)),
        riskLevel: sectionRisk.level
      };
    }
  }
  
  return results;
}

/**
 * Extract medication information from text
 */
export function extractMedicationInfo(text: string): MedicationInfo[] {
  const normalized = text.toLowerCase();
  const medications: MedicationInfo[] = [];
  
  // Common medication name patterns (simplified)
  const medPatterns = [
    /(\d+\s*(?:mg|mcg|ml)\s+\w+)/gi,
    /(paracetamol|ibuprofen|aspirin|omeprazole|metformin|amlodipine|ramipril|bisoprolol|atorvastatin|levothyroxine|lansoprazole|simvastatin|warfarin|apixaban|rivaroxaban|morphine|oxycodone|tramadol|codeine|gabapentin|pregabalin)/gi
  ];
  
  const foundMeds = new Set<string>();
  for (const pattern of medPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      foundMeds.add(match[1].toLowerCase());
    }
  }
  
  for (const medName of foundMeds) {
    const info: MedicationInfo = { name: medName };
    
    // Find the context around this medication mention for per-medication attribute detection
    const medIndex = normalized.indexOf(medName);
    // Use a window of ~200 chars around the medication name for context-sensitive matching
    const contextStart = Math.max(0, medIndex - 50);
    const contextEnd = Math.min(normalized.length, medIndex + medName.length + 150);
    const medContext = normalized.slice(contextStart, contextEnd);
    
    // Detect route (check medication context first, then fall back to full text)
    for (const [route, patterns] of Object.entries(MEDICATION_PATTERNS.routes)) {
      if (patterns.some(p => medContext.includes(p) || normalized.includes(p))) {
        info.route = route;
        break;
      }
    }
    
    // Detect frequency (check medication context first, then fall back to full text)
    for (const [freq, patterns] of Object.entries(MEDICATION_PATTERNS.frequencies)) {
      if (patterns.some(p => medContext.includes(p))) {
        info.frequency = freq;
        break;
      }
    }
    // If no frequency found in context, try the full text as fallback
    if (!info.frequency) {
      for (const [freq, patterns] of Object.entries(MEDICATION_PATTERNS.frequencies)) {
        if (patterns.some(p => normalized.includes(p))) {
          info.frequency = freq;
          break;
        }
      }
    }
    
    // Detect storage (per-medication context)
    for (const [storage, patterns] of Object.entries(MEDICATION_PATTERNS.storage)) {
      if (patterns.some(p => medContext.includes(p) || normalized.includes(p))) {
        info.storage = storage;
        info.isControlled = storage === "controlled";
        break;
      }
    }
    
    // Check for monitoring needs (both per-med and known monitored drugs)
    const monitoredDrugs = /warfarin|lithium|digoxin|theophylline|phenytoin|carbamazepine|methotrexate/i;
    info.needsMonitoring = monitoredDrugs.test(medName) || /inr|blood test|monitoring|level check/i.test(medContext);
    
    medications.push(info);
  }
  
  return medications;
}

/**
 * Extract personal care needs from text
 */
export function extractPersonalCareNeeds(text: string): Record<string, string> {
  const normalized = text.toLowerCase();
  const needs: Record<string, string> = {};
  
  // Washing/bathing
  if (/full assist|fully assisted|two carers|hoist|shower chair/i.test(normalized)) {
    needs.washing = "Full assistance required";
    needs.washingLevel = "High";
  } else if (/some assist|one carer|minimal help|prompts/i.test(normalized)) {
    needs.washing = "Some assistance required";
    needs.washingLevel = "Medium";
  } else if (/independent|self|manages own/i.test(normalized)) {
    needs.washing = "Independent";
    needs.washingLevel = "Low";
  }
  
  // Dressing
  if (/full assist.*dress|cannot dress|needs dressing/i.test(normalized)) {
    needs.dressing = "Full assistance required";
    needs.dressingLevel = "High";
  } else if (/some help.*dress|choice of clothes|prompts.*dress/i.test(normalized)) {
    needs.dressing = "Some assistance required";
    needs.dressingLevel = "Medium";
  } else if (/dresses independently|manages.*clothing/i.test(normalized)) {
    needs.dressing = "Independent";
    needs.dressingLevel = "Low";
  }
  
  // Grooming
  if (/shaving|haircare|nail care|oral care/i.test(normalized)) {
    needs.grooming = "Grooming support needed";
  }
  
  return needs;
}

/**
 * Extract continence information from text
 */
export function extractContinenceInfo(text: string): Record<string, string> {
  const normalized = text.toLowerCase();
  const info: Record<string, string> = {};
  
  // Bladder
  if (/catheter|urinary catheter|suprapubic/i.test(normalized)) {
    info.bladder = "Catheter in situ";
    info.bladderRisk = "High";
  } else if (/incontinent|bladder pad|wet at times/i.test(normalized)) {
    info.bladder = "Incontinence - uses pads";
    info.bladderRisk = "Medium";
  } else if (/continent|no issues|independent.*toilet/i.test(normalized)) {
    info.bladder = "Continent";
    info.bladderRisk = "Low";
  }
  
  // Bowel
  if (/bowel incontinent|faecal|stoma|colostomy|ileostomy/i.test(normalized)) {
    info.bowel = "Management required";
    info.bowelRisk = "High";
  } else if (/occasional.*accident|sometimes/i.test(normalized)) {
    info.bowel = "Occasional issues";
    info.bowelRisk = "Medium";
  } else if (/regular bowel|continent|no bowel issues/i.test(normalized)) {
    info.bowel = "Regular and continent";
    info.bowelRisk = "Low";
  }
  
  return info;
}

/**
 * Extract nutrition and hydration information
 */
export function extractNutritionInfo(text: string): Record<string, string> {
  const normalized = text.toLowerCase();
  const info: Record<string, string> = {};
  
  // Diet type
  if (/peg feed|peg tube|enteral/i.test(normalized)) {
    info.feedingMethod = "PEG feeding";
    info.nutritionRisk = "High";
  } else if (/nil by mouth|nbm/i.test(normalized)) {
    info.feedingMethod = "Nil by mouth";
    info.nutritionRisk = "High";
  } else if (/thickened|thickener|soft diet|pureed/i.test(normalized)) {
    info.modified = "Modified texture diet";
    info.nutritionRisk = "Medium";
  } else if (/normal diet|eats well|good appetite/i.test(normalized)) {
    info.feedingMethod = "Normal oral diet";
    info.nutritionRisk = "Low";
  }
  
  // Allergies
  const allergies = text.match(/allerg(?:y|ies)\s+(?:to\s+)?([^.]+)/i);
  if (allergies) {
    info.allergies = allergies[1].trim();
  }
  if (/no known allerg|nkda/i.test(normalized)) {
    info.allergies = "NKDA - No known drug allergies";
  }
  
  // Fluids
  if (/fluid restrict|limit fluid/i.test(normalized)) {
    info.fluids = "Fluid restricted";
  } else if (/thickened fluid|stage \d/i.test(normalized)) {
    info.fluids = "Thickened fluids required";
  }
  
  // MUST score
  const mustMatch = text.match(/must\s+(?:score)?[:\s]*(\d)/i);
  if (mustMatch) {
    info.mustScore = mustMatch[1];
    info.nutritionRisk = parseInt(mustMatch[1]) >= 2 ? "High" : "Medium";
  }
  
  return info;
}

/**
 * Extract environment and equipment information
 */
export function extractEnvironmentInfo(text: string): Record<string, any> {
  const normalized = text.toLowerCase();
  const info: Record<string, any> = {};
  
  // Property type
  if (/house|bungalow|detached|semi-detached/i.test(normalized)) {
    info.propertyType = "House";
  } else if (/flat|apartment/i.test(normalized)) {
    info.propertyType = "Flat";
  } else if (/care home|nursing home|residential/i.test(normalized)) {
    info.propertyType = "Care setting";
  }
  
  // Access
  if (/key safe|keysafe|key box/i.test(normalized)) {
    info.access = "Key safe";
    const codeMatch = text.match(/(?:key\s*safe|code)[:\s]*(\d{4,})/i);
    if (codeMatch) {
      info.keySafeCode = codeMatch[1];
    }
  } else if (/door bell|ring bell|knock/i.test(normalized)) {
    info.access = "Ring/knock";
  }
  
  // Stairs
  if (/no stairs|ground floor|bungalow|stairlift/i.test(normalized)) {
    info.stairsRisk = "Managed";
  } else if (/stairs|steps|upstairs bedroom/i.test(normalized)) {
    info.stairsRisk = "Present - assess mobility";
  }
  
  // Equipment detected
  const equipment: string[] = [];
  const equipmentTerms = [
    "hoist", "stand aid", "sara steady", "wheelchair", "walking frame",
    "zimmer", "rollator", "hospital bed", "profiling bed", "pressure mattress",
    "shower chair", "bath board", "toilet frame", "commode", "grab rails",
    "oxygen", "suction", "nebuliser", "falls sensor", "telecare", "pendant alarm"
  ];
  
  for (const term of equipmentTerms) {
    if (normalized.includes(term)) {
      equipment.push(term);
    }
  }
  info.equipment = equipment;
  
  // Fire safety
  if (/smoke alarm|fire alarm|fire safety/i.test(normalized)) {
    info.smokeAlarm = parseEquipmentStatus(text.match(/smoke alarm[^.]*\./i)?.[0] || "") || "Present";
  }
  if (/smoker|cigarette|lighter/i.test(normalized)) {
    info.smoker = true;
    info.fireRisk = "Elevated - smoker";
  }
  
  return info;
}

/**
 * Generate a basic first-person summary without AI (for lite mode)
 */
export function generateBasicSummary(sectionName: string, extractedData: Record<string, string>): string {
  const dataPoints = Object.entries(extractedData)
    .filter(([key, val]) => val && !key.includes("Level") && !key.includes("Risk"))
    .map(([key, val]) => `${key}: ${val}`);
  
  if (dataPoints.length === 0) {
    return "Information to be completed during assessment.";
  }
  
  // Convert to first person approximation
  const summaries: Record<string, (data: Record<string, string>) => string> = {
    health: (d) => d.conditions ? `I have the following health conditions: ${d.conditions}.` : "My health conditions are being assessed.",
    medication: (d) => d.method ? `I take my medication with ${d.method}.` : "I take regular medication.",
    nutrition: (d) => d.feedingMethod ? `I ${d.feedingMethod.toLowerCase()}.` : "I have regular meals.",
    personalCare: (d) => d.washing ? `For personal care, I ${d.washing.toLowerCase()}.` : "I manage my personal care.",
    mobility: (d) => d.mobility ? `I am ${d.mobility.toLowerCase()}.` : "My mobility is being assessed.",
    skin: (d) => d.skinCondition ? `My skin ${d.skinCondition}.` : "My skin integrity is monitored.",
    continence: (d) => d.bladder ? `Regarding continence: ${d.bladder}.` : "I manage my continence.",
    environment: (d) => d.propertyType ? `I live in a ${d.propertyType.toLowerCase()}.` : "Details about my home are being recorded.",
    social: (d) => d.activities ? `I enjoy ${d.activities}.` : "Details about my interests will be recorded.",
    communication: (d) => d.method ? `I communicate by ${d.method.toLowerCase()}.` : "I am able to communicate my needs."
  };
  
  const generator = summaries[sectionName];
  if (generator) {
    return generator(extractedData);
  }
  
  return dataPoints.join(". ") + ".";
}

/**
 * Get recommended assessments based on extracted data
 */
export function getRecommendedAssessments(extractedData: Record<string, any>): string[] {
  const recommended: string[] = [];
  const mandatoryAssessments = [
    "Fire Risk Assessment",
    "Moving and Handling Risk Assessment", 
    "Falls Risk Assessment",
    "Medication Risk Assessment"
  ];
  
  // Always include mandatory
  recommended.push(...mandatoryAssessments);
  
  // Check for additional based on content
  if (extractedData.environment?.smoker || extractedData.environment?.fireRisk) {
    if (!recommended.includes("Fire Risk Assessment")) {
      recommended.unshift("Fire Risk Assessment"); // Prioritize
    }
  }
  
  if (extractedData.mobility?.mobilityLevel === "High" || extractedData.personalCare?.washingLevel === "High") {
    recommended.push("Pressure Ulcer Risk Assessment (Waterlow)");
  }
  
  if (extractedData.nutrition?.nutritionRisk === "High") {
    recommended.push("Malnutrition Universal Screening Tool (MUST)");
    recommended.push("Swallowing/Dysphagia Risk Assessment");
  }
  
  if (extractedData.continence?.bladderRisk === "High" || extractedData.continence?.bowelRisk === "High") {
    recommended.push("Continence Assessment");
  }
  
  if (extractedData.environment?.equipment?.includes("hoist") || 
      extractedData.environment?.equipment?.includes("stand aid")) {
    recommended.push("Equipment Safety Check");
    recommended.push("Manual Handling Risk Assessment");
  }
  
  // Deduplicate while preserving order
  return [...new Set(recommended)];
}
