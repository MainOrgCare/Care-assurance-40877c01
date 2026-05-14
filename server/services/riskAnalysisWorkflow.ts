export const RULE_BASED_SIGNAL_GROUPS = {
  medicalConditions: [
    { label: "Diabetes", terms: ["diabet", "insulin", "blood glucose", "hypogly", "hyperglyce"] },
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
    { label: "Medication adherence concern", terms: ["refuses medication", "declined medication", "non-compliant", "non compliant", "medication compliance", "not taking", "won't take"] },
    { label: "Behavior or safeguarding concern", terms: ["agitation", "aggressive", "wandering", "self neglect", "abuse"] },
    { label: "Social isolation or loneliness", terms: ["isolated", "isolation", "lonely", "loneliness", "no visitors", "no social contact", "no contact"] },
    { label: "Infection risk", terms: ["infection", "uti", "mrsa", "sepsis", "covid"] },
    { label: "Sleep disturbance", terms: ["sleep", "insomnia", "night waking", "restless", "disturbed sleep", "night-time"] },
    { label: "Financial exploitation or abuse risk", terms: ["financial abuse", "exploitation", "coercion", "undue influence", "financial", "money concerns"] },
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
    { label: "Medication dispenser or dosette box", terms: ["dosette", "blister pack", "medication dispenser", "automatic dispenser", "pill organiser"] },
    { label: "Door entry or key safe system", terms: ["key safe", "keysafe", "key box", "door entry", "door code"] },
    { label: "Night sensor or bed sensor", terms: ["night sensor", "bed sensor", "movement sensor", "bed exit"] },
  ],
  communicationNeeds: [
    { label: "Hearing support", terms: ["hearing", "hearing aid"] },
    { label: "Vision support", terms: ["vision", "eyesight", "glasses"] },
    { label: "Speech/language support", terms: ["speech", "aphasia", "language"] },
    { label: "Cognitive communication support", terms: ["memory", "confus", "orientation"] },
    { label: "Interpreter or translation support", terms: ["interpreter", "translation", "english as second language", "does not speak english", "limited english"] },
    { label: "Augmentative communication", terms: ["picture board", "communication board", "pecs", "sign language", "makaton", "non-verbal"] },
  ],
  environmentalFactors: [
    { label: "Stairs or step access", terms: ["stairs", "steps", "upstairs"] },
    { label: "Key safe or controlled access", terms: ["key safe", "keysafe", "key box"] },
    { label: "Fire safety considerations", terms: ["smoke alarm", "fire", "smoking", "oxygen near heat"] },
    { label: "Clutter or trip hazards", terms: ["clutter", "trip hazard", "uneven flooring", "poor lighting"] },
    { label: "Lone working considerations", terms: ["lone working", "single carer", "double up care"] },
  ],
} as const;

const STRUCTURED_RISK_ARTIFACT_PATTERNS = [
  /\bcare assessment\b/i,
  /\bsupport plan\b/i,
  /\bthis care assessment is for\b/i,
  /\bthis support plan is for\b/i,
  /\bthis plan is\b/i,
  /\bdate of birth\b/i,
  /\bclient id\b/i,
  /\baddress\b/i,
  /\bphone\b/i,
  /\bassessment date\b/i,
  /\bplan is\b/i,
  /\breview and update support plan\b/i,
  /\bcommitted to protecting your privacy\b/i,
  /\brisk identified\b/i,
  /\boutcome\b/i,
  /\bcontrol measures\b/i,
  /\bwho will be harmed\b/i,
];

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

export function looksLikeStructuredRiskArtifactText(value: string | undefined | null): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  const labelMatches = STRUCTURED_RISK_ARTIFACT_PATTERNS.filter((pattern) => pattern.test(normalized)).length;
  if (labelMatches >= 3) return true;
  const punctuationArtifacts = (normalized.match(/={2,}|:{2,}|,{2,}/g) || []).length;
  return labelMatches >= 2 && punctuationArtifacts > 0;
}

export function getRuleBasedRiskTargetCount(params: {
  hasCategoryEvidenceTerms: boolean;
  evidencePool: string[];
  hasDiverseEvidence: boolean;
}): number {
  const evidenceCount = Array.isArray(params.evidencePool)
    ? params.evidencePool.filter((item) => typeof item === "string" && item.trim().length > 0).length
    : 0;
  if (evidenceCount === 0) return 1;
  const canExpand = params.hasCategoryEvidenceTerms && evidenceCount > 1 && params.hasDiverseEvidence;
  if (canExpand) {
    return Math.min(7, Math.max(4, evidenceCount + 1));
  }
  return Math.max(1, Math.min(3, evidenceCount));
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
  if (rating === "Medium") return "Low";
  return "Low";
}

export function hasFirstPersonMarkers(text: string): boolean {
  if (typeof text !== "string" || !text) return false;
  const lower = text.toLowerCase();
  return (
    // Matches first-person "I + verb" phrasing (for example: "I have", "I need", "I feel").
    /\bi\s+(?:am|have|need|can|will|experience|use|require|feel|struggle|find|may|get|was|had|could|must)\b/.test(lower) ||
    // Matches possessive first-person "my + care/health noun" phrasing (for example: "my medication", "my care team").
    /\bmy\s+(?:carer|care\s+team|medication|condition|health|mobility|home|plan|risk|needs?|routine|ability|independence|safety)\b/.test(lower) ||
    // Matches common first-person contractions (for example: "I'm", "I've", "I'll", "I'd").
    /\bi(?:'m|'ve|'ll|'d)\s/.test(lower) ||
    // Matches objective first-person "me + preposition/connector" phrasing (for example: "me with", "me for").
    /\bme\s+(?:to|when|with|by|for|at|from|if)\b/.test(lower)
  );
}

const MIN_NARRATIVE_TEXT_LENGTH = 12;

export function countPersonCentredViolations(risks: unknown[]): number {
  if (!Array.isArray(risks)) return 0;
  return risks.filter((risk) => {
    if (!risk || typeof risk !== "object") return false;
    const r = risk as Record<string, unknown>;
    const narrativeText = [r.riskDefinition, r.howItsARisk, r.controlMeasures]
      .filter((v) => typeof v === "string" && (v as string).trim().length > MIN_NARRATIVE_TEXT_LENGTH)
      .join(" ");
    return narrativeText.length > MIN_NARRATIVE_TEXT_LENGTH && !hasFirstPersonMarkers(narrativeText);
  }).length;
}

/**
 * Removes blank and duplicate risk rows from an AI-generated risks array.
 * Deduplication uses a composite key of riskDefinition + howItsARisk to avoid
 * collapsing distinct risks that share similar opening sentences.
 * Apply this BEFORE enrichment (toFirstPerson) and quality scoring.
 */
export function normalizeGeneratedRiskRows(risks: unknown[]): unknown[] {
  if (!Array.isArray(risks)) return [];
  const seen = new Set<string>();
  return risks.filter((risk) => {
    if (!risk || typeof risk !== "object") return false;
    const r = risk as Record<string, unknown>;
    const def = typeof r.riskDefinition === "string" ? r.riskDefinition.trim() : "";
    if (def.length < 10) return false;
    const how = typeof r.howItsARisk === "string" ? r.howItsARisk.trim() : "";
    const compositeKey = `${def} ${how} ${String(r.findings ?? "").trim().slice(0, 60)}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .slice(0, 160);
    if (seen.has(compositeKey)) return false;
    seen.add(compositeKey);
    return true;
  });
}
