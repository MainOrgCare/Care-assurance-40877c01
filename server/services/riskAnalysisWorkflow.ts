export const RULE_BASED_SIGNAL_GROUPS = {
  medicalConditions: [
    { label: "Diabetes", terms: ["diabet", "insulin", "blood glucose", "hypogly", "hypergly"] },
    { label: "Dementia or cognitive impairment", terms: ["dementia", "alzheimer", "memory", "cognit", "confus"] },
    { label: "Epilepsy or seizures", terms: ["epilep", "seizure"] },
    { label: "Respiratory condition", terms: ["copd", "asthma", "breathless", "oxygen", "inhaler"] },
    { label: "Cardiovascular condition", terms: ["heart", "cardiac", "angina", "hypertension", "bp"] },
    { label: "Arthritis or musculoskeletal condition", terms: ["arthritis", "joint pain", "mobility pain"] },
    { label: "Mental health condition", terms: ["depress", "anxiety", "psych", "low mood"] },
  ],
  careActivities: [
    { label: "Medication support", terms: ["medication", "medicine", "tablet", "dosette", "blister pack", "mar"] },
    { label: "Personal care support", terms: ["wash", "bathing", "shower", "dressing", "toilet", "toileting"] },
    { label: "Mobility and transfers", terms: ["mobility", "transfer", "hoist", "stand aid", "wheelchair", "walking frame"] },
    { label: "Nutrition and hydration support", terms: ["meal", "diet", "nutrition", "hydration", "feeding", "swallow"] },
    { label: "Continence support", terms: ["continence", "incontinence", "catheter", "pad", "bowel", "urinary"] },
    { label: "Communication support", terms: ["communication", "speech", "hearing", "vision", "interpreter"] },
  ],
  concerns: [
    { label: "Falls risk", terms: ["fall", "unsteady", "trip", "slip", "balance"] },
    { label: "Skin integrity risk", terms: ["pressure", "ulcer", "wound", "skin tear", "sore"] },
    { label: "Choking or aspiration risk", terms: ["choking", "aspiration", "dysphagia", "thickened"] },
    { label: "Medication safety risk", terms: ["medication error", "missed medication", "time critical"] },
    { label: "Behavior or safeguarding concern", terms: ["agitation", "aggressive", "wandering", "self neglect", "abuse"] },
    { label: "Infection risk", terms: ["infection", "uti", "mrsa", "sepsis", "covid"] },
  ],
  equipment: [
    { label: "Hoist", terms: ["hoist"] },
    { label: "Stand aid", terms: ["stand aid", "sara steady"] },
    { label: "Wheelchair", terms: ["wheelchair"] },
    { label: "Walking frame", terms: ["walking frame", "zimmer", "rollator"] },
    { label: "Hospital/profiling bed", terms: ["hospital bed", "profiling bed"] },
    { label: "Pressure-relieving equipment", terms: ["pressure mattress", "pressure cushion"] },
    { label: "Assistive bathroom equipment", terms: ["shower chair", "bath board", "toilet frame", "commode", "grab rails"] },
    { label: "Telecare or falls alarm", terms: ["falls sensor", "telecare", "pendant alarm"] },
  ],
  communicationNeeds: [
    { label: "Hearing support", terms: ["hearing", "hearing aid"] },
    { label: "Vision support", terms: ["vision", "eyesight", "glasses"] },
    { label: "Speech/language support", terms: ["speech", "aphasia", "language"] },
    { label: "Cognitive communication support", terms: ["memory", "confus", "orientation"] },
  ],
  environmentalFactors: [
    { label: "Stairs or step access", terms: ["stairs", "steps", "upstairs"] },
    { label: "Key safe or controlled access", terms: ["key safe", "keysafe", "key box"] },
    { label: "Fire safety considerations", terms: ["smoke alarm", "fire", "smoking", "oxygen near heat"] },
    { label: "Clutter or trip hazards", terms: ["clutter", "trip hazard", "uneven flooring", "poor lighting"] },
    { label: "Lone working considerations", terms: ["lone working", "single carer", "double up care"] },
  ],
} as const;

export function normalizeRiskRating(value: unknown): "Low" | "Medium" | "High" {
  if (typeof value !== "string") return "Low";
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("high")) return "High";
  if (normalized.includes("medium")) return "Medium";
  if (normalized.includes("low")) return "Low";
  return "Low";
}

export function extractSignalLabels(
  content: string,
  groups: ReadonlyArray<{ label: string; terms: ReadonlyArray<string> }>,
): string[] {
  if (!content) return [];
  const lower = content.toLowerCase();
  return groups
    .filter((group) => group.terms.some((term) => lower.includes(term)))
    .map((group) => group.label);
}

export function buildFallbackRiskProfileSummary(
  analysis: {
    careActivities: string[];
    concerns: string[];
    medicalConditions: string[];
  },
  formatFirstPerson: (value: string) => string,
): string {
  const segments: string[] = [];
  if (analysis.medicalConditions.length > 0) {
    segments.push(`I have documented health needs including ${analysis.medicalConditions.slice(0, 3).join(", ")}.`);
  }
  if (analysis.careActivities.length > 0) {
    segments.push(`I need support with ${analysis.careActivities.slice(0, 3).join(", ")}.`);
  }
  if (analysis.concerns.length > 0) {
    segments.push(`My records identify risks around ${analysis.concerns.slice(0, 3).join(", ")}.`);
  }
  if (segments.length === 0) {
    return "I need a person-centred review of my care needs based on the documents provided.";
  }
  return formatFirstPerson(segments.join(" "));
}

export function deescalateRiskRating(rating: "Low" | "Medium" | "High"): "Low" | "Medium" | "High" {
  if (rating === "High") return "Medium";
  return "Low";
}