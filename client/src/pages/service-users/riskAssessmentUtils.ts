const TOKEN_ARTIFACT_PATTERNS = [
  /\{\{[^{}\n]*PII_[^{}\n]*\}\}/gi,
  /\{\{[^{}\n]*PII_[^{}\n]*/gi,
  /\bPII_[a-z0-9]+_[A-Z_]+_\d+\b/gi,
];

const TEMPLATE_ARTIFACT_PATTERNS = [
  /\bunderstand the information provided\b/gi,
  /\bservice user information\b/gi,
  /\bservice user details\b/gi,
  /\bdocuments? to analyze\b/gi,
  /\bstructure reference only\b/gi,
  /\bplaceholder text\b/gi,
  /\breal service user (?:information|documents?)\b/gi,
  /\bdo not use any content from templates?\b/gi,
  /\btemplate\/example text\b/gi,
];

const QUESTIONNAIRE_SENTENCE_PATTERNS = [
  /(?:^|[.!?]\s*)(if there (?:is|was|were)|would i(?: be able to)?|am i able to|can i|will i|do i need|should i|is there|are there|who would|what would happen if)\b/i,
  /\bevacuate the premises\b/i,
  /\bunderstand the information provided\b/i,
];

const DISPLAY_BOILERPLATE_PATTERNS = [
  /\bany concerns should be reported to the office\b/i,
  /\bshould be assessed and documented here\b/i,
  /\breported to the office immediately\b/i,
  /\bthis section should be completed\b/i,
];

const FALLBACK_LEAD_IN_PATTERNS = [
  /^i have (?:a|an)\s+(?:priority|additional)\s+.+?\s+risk identified in my records\.?$/i,
];

const STRUCTURED_FIELD_LABEL_PATTERNS = [
  /\bcare assessment\b/i,
  /\bsupport plan\b/i,
  /\bthis care assessment is for\b/i,
  /\bthis support plan is for\b/i,
  /\bdate of birth\b/i,
  /\bclient id\b/i,
  /\baddress\b/i,
  /\bphone\b/i,
  /\bassessment date\b/i,
  /\bthis plan is\b/i,
  /\breview and update support plan\b/i,
  /\bcommitted to protecting your privacy\b/i,
  /\brisk identified\b/i,
  /\boutcome\b/i,
  /\bcontrol measures\b/i,
  /\bwho will be harmed\b/i,
];

const NAME_PLACEHOLDER_LABELS = new Set([
  "name",
  "name name",
  "full name",
  "first name",
  "last name",
  "surname",
  "service user",
  "service user name",
  "client",
  "client name",
  "resident",
  "patient",
]);

const SIGNED_BY_PLACEHOLDER_VALUES = new Set([
  "USER",
  "UNKNOWN",
  "STAFF",
  "STAFF MEMBER",
  "CARE STAFF",
  "CARE WORKER",
  "CARER",
  "ASSISTANT",
  "NOT PROVIDED",
  "NOT KNOWN",
  "N A",
  "NA",
]);

const PERSON_NAME_PARTICLES = new Set([
  "al",
  "ap",
  "ben",
  "bin",
  "da",
  "de",
  "del",
  "della",
  "der",
  "di",
  "dos",
  "du",
  "ibn",
  "la",
  "le",
  "st",
  "st.",
  "van",
  "von",
]);

type SanitizableRiskRow = {
  riskDefinition?: string | null;
  howItsARisk?: string | null;
  whoWillBeHarmed?: string | null;
  controlMeasures?: string | null;
  initialRating?: string | null;
  ratingAfterControls?: string | null;
};

type SanitizableGeneratedAssessment = {
  category?: string | null;
  serviceUserInitials?: string | null;
  risks?: SanitizableRiskRow[] | null;
  supportingEvidence?: string[] | null;
  additionalNotes?: string | null;
  signedBy?: string | null;
  jobTitle?: string | null;
};

function looksLikeStructuredFieldNoise(value: string): boolean {
  const labelMatches = STRUCTURED_FIELD_LABEL_PATTERNS.filter((pattern) => pattern.test(value)).length;
  if (labelMatches >= 3) return true;
  const punctuationArtifacts = (value.match(/={2,}|:{2,}|,{2,}/g) || []).length;
  return labelMatches >= 2 && punctuationArtifacts > 0;
}

export function sanitizeRiskDisplayText(value?: string | null): string {
  if (typeof value !== "string") return "";
  let cleaned = value;
  for (const pattern of TOKEN_ARTIFACT_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }
  for (const pattern of TEMPLATE_ARTIFACT_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }
  cleaned = cleaned
    .replace(/\bmy documents note:\s*/gi, "")
    .replace(/={2,}/g, " ")
    .replace(/^[\s:;-]+|[\s:;-]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();

  const sentenceParts = cleaned.match(/[^.!?]+[.!?]?/g) || [cleaned];
  cleaned = sentenceParts
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .filter((part) => !FALLBACK_LEAD_IN_PATTERNS.some((pattern) => pattern.test(part)))
    .filter((part) => !QUESTIONNAIRE_SENTENCE_PATTERNS.some((pattern) => pattern.test(part)))
    .filter((part) => !DISPLAY_BOILERPLATE_PATTERNS.some((pattern) => pattern.test(part)))
    .filter((part) => !looksLikeStructuredFieldNoise(part))
    .filter((part) => {
      if (/[.!?]$/.test(part)) return true;
      const lastToken = part.split(/\s+/).pop() || "";
      return !(part.length > 40 && lastToken.length <= 2);
    })
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();

  if (NAME_PLACEHOLDER_LABELS.has(cleaned.toLowerCase())) {
    return "";
  }

  return cleaned;
}

export function sanitizeStringList(values?: string[]): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const cleaned: string[] = [];

  values.forEach((value) => {
    const next = sanitizeRiskDisplayText(value);
    if (!next) return;
    const key = next.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    cleaned.push(next);
  });

  return cleaned;
}

function normalizeCompactText(value?: string | null): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function hasMeaningfulRiskNarrative(row: SanitizableRiskRow): boolean {
  return Boolean(
    normalizeCompactText(row.riskDefinition) ||
      normalizeCompactText(row.howItsARisk) ||
      normalizeCompactText(row.controlMeasures)
  );
}

function buildRiskRowSignature(row: SanitizableRiskRow): string {
  return [
    normalizeCompactText(row.riskDefinition).toLowerCase(),
    normalizeCompactText(row.howItsARisk).toLowerCase(),
    normalizeCompactText(row.whoWillBeHarmed).toLowerCase(),
    normalizeCompactText(row.controlMeasures).toLowerCase(),
    normalizeCompactText(row.initialRating).toLowerCase(),
    normalizeCompactText(row.ratingAfterControls).toLowerCase(),
  ].join("||");
}

export function sanitizeRiskRow<T extends SanitizableRiskRow>(row: T): T {
  return {
    ...row,
    riskDefinition: sanitizeRiskDisplayText(row.riskDefinition),
    howItsARisk: sanitizeRiskDisplayText(row.howItsARisk),
    whoWillBeHarmed: sanitizeRiskDisplayText(row.whoWillBeHarmed),
    controlMeasures: sanitizeRiskDisplayText(row.controlMeasures),
  };
}

export function sanitizeGeneratedAssessmentResult<T extends SanitizableGeneratedAssessment>(assessment: T): T {
  const seenRiskRows = new Set<string>();
  const risks = Array.isArray(assessment.risks)
    ? assessment.risks
        .map((risk) => sanitizeRiskRow(risk))
        .filter((risk) => hasMeaningfulRiskNarrative(risk))
        .filter((risk) => {
          const signature = buildRiskRowSignature(risk);
          if (!signature || seenRiskRows.has(signature)) return false;
          seenRiskRows.add(signature);
          return true;
        })
    : [];

  return {
    ...assessment,
    category: sanitizeRiskDisplayText(assessment.category) || assessment.category,
    risks: risks as T["risks"],
    supportingEvidence: sanitizeStringList(assessment.supportingEvidence || undefined) as T["supportingEvidence"],
    additionalNotes: sanitizeRiskDisplayText(assessment.additionalNotes),
    signedBy: sanitizeRiskDisplayText(assessment.signedBy) || assessment.signedBy,
    jobTitle: sanitizeRiskDisplayText(assessment.jobTitle) || assessment.jobTitle,
  };
}

export function looksLikeServiceUserName(value: string): boolean {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;

  let capitalizedCount = 0;
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const bare = word.replace(/[.'`-]/g, "");
    if (!bare) return false;

    const lower = bare.toLowerCase();
    if (PERSON_NAME_PARTICLES.has(lower)) {
      if (index === 0 || index === words.length - 1) return false;
      continue;
    }

    if (/^[A-Z][A-Za-z'`-]+$/.test(word) || /^[A-Z]{2,}$/.test(bare)) {
      capitalizedCount += 1;
      continue;
    }

    return false;
  }

  return capitalizedCount >= 2;
}

export function sanitizeServiceUserName(value?: string | null): string {
  const cleaned = sanitizeRiskDisplayText(value);
  if (!cleaned) return "";
  if (/information not found/i.test(cleaned)) return "";
  if (!looksLikeServiceUserName(cleaned)) return "";
  return cleaned;
}

export function sanitizePerformerName(value?: string | null): string {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (!raw) return "";
  if (/^\{\{PII_[a-z0-9]+_[A-Z_]+_\d+\}\}$/i.test(raw)) return "";
  if (/^\[[^\]\n]{2,}\]$/.test(raw)) return "";

  const cleaned = sanitizeRiskDisplayText(raw)
    .replace(/\./g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";

  const normalized = cleaned.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  if (!normalized || SIGNED_BY_PLACEHOLDER_VALUES.has(normalized)) return "";
  return cleaned;
}