/**
 * Deterministic validation + normalization layer for EMAR compliance results.
 *
 * The AI compliance agent (emarComplianceAgent.ts) returns structured JSON, but even with
 * a strict schema and temperature 0 a language model can miscount summaries, emit codes
 * outside the allowed set, violate the documented `NH => requiresVerification` invariant,
 * leave blank (null) codes unverified, or desync `allCareWorkers`. Medication compliance
 * auditing is safety critical, so we never silently trust the model: this module enforces
 * every deterministic invariant in code and forces human verification on anything that is
 * uncertain or disagrees with the deterministic grid parser.
 *
 * Everything here is pure and synchronous so it can be unit tested under the Node test runner.
 */

export type EmarCode = "R" | "SA" | "F" | "NH" | "MU" | null;

export const EMAR_CODES = ["R", "SA", "F", "NH", "MU"] as const;
export type EmarNonNullCode = (typeof EMAR_CODES)[number];

export interface EmarComplianceRecord {
  date: string | null;
  timeSlot: string | null;
  medicine: string | null;
  code: EmarCode;
  careWorker: string | null;
  requiresVerification: boolean;
  inferredFromSameSlot: boolean;
  notes: string | null;
}

export type EmarCodeCounts = Record<EmarNonNullCode, number>;

export interface EmarComplianceSummary {
  totalRecords: number;
  byCode: EmarCodeCounts;
}

export interface EmarGridBaseline {
  dateCount?: number | null;
  timeSlotCount?: number | null;
  medicationCount?: number | null;
  cellCount?: number | null;
}

export interface EmarBaselineCrossCheck {
  expectedCells: number | null;
  /** Records that map to a real medication administration cell (date + timeSlot + medicine). */
  populatedRecords: number;
  /** Difference between deterministic cell count and populated AI records. */
  cellDelta: number | null;
  /** Distinct dates the deterministic grid parser detected (from the baseline). */
  expectedDates: number | null;
  /** Distinct dates referenced across the AI records. */
  referencedDates: number;
  /** Distinct time slots the deterministic grid parser detected (from the baseline). */
  expectedTimeSlots: number | null;
  /** Distinct time slots referenced across the AI records. */
  referencedTimeSlots: number;
  mismatched: boolean;
  notes: string[];
}

export interface EmarIntegrityReport {
  /** True when the deterministic layer changed anything from the raw AI output. */
  normalized: boolean;
  corrections: string[];
  warnings: string[];
  recordCount: number;
  nullCodeCount: number;
  /**
   * Number of populated records (date + timeSlot + medicine all present) that duplicate an
   * earlier record on the same administration cell. In an EMAR grid every (medicine, date,
   * time slot) cell is a single administration, so duplicates indicate a hallucinated/double
   * extraction and can mask dropped data by inflating the record count.
   */
  duplicateRecordCount: number;
  verificationRequiredCount: number;
  codeCounts: EmarCodeCounts;
  /** 0..1 confidence that the result can be trusted without human review. */
  confidence: number;
  /** True when a human must verify before the audit is relied upon. */
  requiresHumanReview: boolean;
  baselineCrossCheck: EmarBaselineCrossCheck | null;
  checkedAt: string;
}

export interface EmarComplianceResult {
  records: EmarComplianceRecord[];
  allCareWorkers: string[];
  trendWarnings: string[];
  summary: EmarComplianceSummary;
  integrity: EmarIntegrityReport;
}

export interface ValidateOptions {
  gridBaseline?: EmarGridBaseline | null;
  now?: string;
}

const emptyCodeCounts = (): EmarCodeCounts => ({ R: 0, SA: 0, F: 0, NH: 0, MU: 0 });

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const cleanString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Care worker names are stored anonymized as `Initial.Surname` (e.g. `L.Barron`, `L.J.Barron`).
 * A value that is non-empty but does not look anonymized (e.g. a full name leak) is suspicious
 * and must be flagged for human verification rather than trusted.
 */
const ANONYMIZED_WORKER_RE = /^([A-Z]\.)+[A-Za-z][A-Za-z'’\- ]*$/;
const KNOWN_NON_NAME_TOKENS = new Set(["unknown", "n/a", "na", "n.n", "n.n.", "nn"]);

const looksAnonymized = (value: string): boolean => {
  if (KNOWN_NON_NAME_TOKENS.has(value.toLowerCase())) return true;
  return ANONYMIZED_WORKER_RE.test(value);
};

const cleanInteger = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

/**
 * Conservative aliases for the non-administration codes. Not every configured AI provider
 * honours the strict JSON schema (the platform supports GitHub Models and local/Ollama
 * compatible LLMs that may ignore `json_schema`), so the model can emit a recognizable code
 * in a non-canonical form — e.g. `"Refused"`, `"S/A"`, `"Not Home"`. Discarding those to
 * `null` would silently lose the exception classification that feeds `codeCounts` and trend
 * warnings, so the deterministic layer recovers only unambiguous spellings of the documented
 * legend (R=Refused, SA=Self-Administered, F=Family Administered, NH=Not Home,
 * MU=Medication Unavailable). Keys are compacted (alphanumeric-only, uppercase).
 */
const CODE_ALIASES: Record<string, EmarNonNullCode> = {
  REFUSED: "R",
  REFUSAL: "R",
  REFUSE: "R",
  REF: "R",
  SELFADMINISTERED: "SA",
  SELFADMINISTER: "SA",
  SELFADMIN: "SA",
  FAMILYADMINISTERED: "F",
  FAMILYADMINISTER: "F",
  FAMILYADMIN: "F",
  NOTHOME: "NH",
  NOTATHOME: "NH",
  MEDICATIONUNAVAILABLE: "MU",
  MEDICATIONUNAVAIL: "MU",
  MEDUNAVAILABLE: "MU",
  MEDSUNAVAILABLE: "MU",
  UNAVAILABLE: "MU",
};

/**
 * Normalize a raw `code` value to the allowed EMAR enum. Returns the canonical code, a flag
 * indicating the raw value was outside the allowed set (so the caller can record a correction
 * and force verification), and a flag indicating the value was recovered from a recognizable
 * alias (recorded as a correction but trusted — its meaning is unambiguous).
 */
const normalizeCode = (raw: unknown): { code: EmarCode; invalid: boolean; recovered: boolean } => {
  if (raw === null || raw === undefined) return { code: null, invalid: false, recovered: false };
  if (typeof raw !== "string") return { code: null, invalid: true, recovered: false };
  const upper = raw.trim().toUpperCase();
  if (upper === "") return { code: null, invalid: false, recovered: false };
  if ((EMAR_CODES as readonly string[]).includes(upper)) {
    return { code: upper as EmarNonNullCode, invalid: false, recovered: false };
  }
  // Compact to alphanumeric only so separator variants ("S/A", "N-H", "M.U", "Not Home")
  // collapse onto a canonical code or a documented alias.
  const compact = upper.replace(/[^A-Z0-9]/g, "");
  if ((EMAR_CODES as readonly string[]).includes(compact)) {
    return { code: compact as EmarNonNullCode, invalid: false, recovered: true };
  }
  const aliased = CODE_ALIASES[compact];
  if (aliased) {
    return { code: aliased, invalid: false, recovered: true };
  }
  return { code: null, invalid: true, recovered: false };
};

const normalizeRecord = (
  raw: unknown,
  index: number,
  corrections: string[],
): EmarComplianceRecord => {
  const source = isPlainObject(raw) ? raw : {};

  const date = cleanString(source.date);
  const timeSlot = cleanString(source.timeSlot);
  const medicine = cleanString(source.medicine);
  const careWorker = cleanString(source.careWorker);
  const notes = cleanString(source.notes);

  const { code, invalid, recovered } = normalizeCode(source.code);
  if (invalid) {
    corrections.push(`record[${index}]: invalid code ${JSON.stringify(source.code)} reset to null`);
  } else if (recovered) {
    corrections.push(`record[${index}]: code ${JSON.stringify(source.code)} normalized to "${code}"`);
  }

  // Deterministic invariants — enforced in code, never delegated to the model.
  let requiresVerification = source.requiresVerification === true;
  if (code === "NH" && !requiresVerification) {
    requiresVerification = true;
    corrections.push(`record[${index}]: NH code forced requiresVerification=true`);
  }
  if (code === null && !requiresVerification) {
    // A blank / missing administration on a scheduled medicine must always be verified.
    requiresVerification = true;
    corrections.push(`record[${index}]: blank (null) code forced requiresVerification=true`);
  }
  if (invalid && !requiresVerification) {
    requiresVerification = true;
  }

  let inferredFromSameSlot = source.inferredFromSameSlot === true;
  if (inferredFromSameSlot && careWorker === null) {
    inferredFromSameSlot = false;
    corrections.push(`record[${index}]: inferredFromSameSlot cleared because careWorker is empty`);
  }

  // Privacy + accuracy guard: a non-anonymized care worker value is suspicious and must be verified.
  if (careWorker !== null && !looksAnonymized(careWorker) && !requiresVerification) {
    requiresVerification = true;
    corrections.push(`record[${index}]: care worker "${careWorker}" is not anonymized (Initial.Surname); flagged for verification`);
  }

  return {
    date,
    timeSlot,
    medicine,
    code,
    careWorker,
    requiresVerification,
    inferredFromSameSlot,
    notes,
  };
};

const computeCodeCounts = (records: EmarComplianceRecord[]): EmarCodeCounts => {
  const counts = emptyCodeCounts();
  for (const record of records) {
    if (record.code && Object.prototype.hasOwnProperty.call(counts, record.code)) {
      counts[record.code] += 1;
    }
  }
  return counts;
};

/**
 * The `allCareWorkers` list is, by invariant, exactly the unique set of care workers that appear
 * on records. We derive it deterministically from the records and report (via the returned
 * `extras`) any care workers the model listed that are not backed by a record — these are likely
 * hallucinations and are intentionally excluded rather than trusted.
 */
const computeCareWorkers = (
  records: EmarComplianceRecord[],
  rawList: unknown,
): { workers: string[]; extras: string[] } => {
  const fromRecords = new Set<string>();
  for (const record of records) {
    if (record.careWorker) fromRecords.add(record.careWorker);
  }

  const extras: string[] = [];
  if (Array.isArray(rawList)) {
    for (const entry of rawList) {
      const cleaned = cleanString(entry);
      if (cleaned && !fromRecords.has(cleaned) && !extras.includes(cleaned)) {
        extras.push(cleaned);
      }
    }
  }

  return {
    workers: [...fromRecords].sort((a, b) => a.localeCompare(b)),
    extras: extras.sort((a, b) => a.localeCompare(b)),
  };
};

const normalizeTrendWarnings = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    const cleaned = cleanString(entry);
    if (cleaned && !seen.has(cleaned)) {
      seen.add(cleaned);
      out.push(cleaned);
    }
  }
  return out;
};

const buildBaselineCrossCheck = (
  records: EmarComplianceRecord[],
  baseline: EmarGridBaseline | null | undefined,
): EmarBaselineCrossCheck | null => {
  if (!baseline) return null;

  const notes: string[] = [];
  const populatedRecords = records.filter(
    (record) => record.date !== null && record.timeSlot !== null && record.medicine !== null,
  ).length;

  const expectedCells = cleanInteger(baseline.cellCount);
  let cellDelta: number | null = null;
  let mismatched = false;

  if (expectedCells !== null && expectedCells > 0) {
    cellDelta = populatedRecords - expectedCells;
    // Only a shortfall (AI produced fewer populated records than the deterministic grid has
    // scheduled cells) indicates dropped data, which is the dangerous direction. An excess can
    // happen legitimately and is left as an informational note without forcing a mismatch.
    if (cellDelta < 0) {
      mismatched = true;
      notes.push(
        `Deterministic grid parser found ${expectedCells} scheduled grid cells but the AI only produced ${populatedRecords} fully-populated records (${cellDelta} short) — possible dropped data.`,
      );
    } else if (cellDelta > 0) {
      notes.push(
        `AI produced ${populatedRecords} fully-populated records vs ${expectedCells} scheduled grid cells (+${cellDelta}); review for possible duplicated or hallucinated rows.`,
      );
    }
  }

  const medicationCount = cleanInteger(baseline.medicationCount);
  if (medicationCount !== null && medicationCount > 0) {
    const aiMedicines = new Set(
      records.map((record) => record.medicine).filter((m): m is string => m !== null),
    ).size;
    if (aiMedicines < medicationCount) {
      mismatched = true;
      notes.push(
        `Grid parser detected ${medicationCount} medicines but the AI only referenced ${aiMedicines}.`,
      );
    }
  }

  // Distinct dates / time slots cross-check. A shortfall (the AI referenced fewer distinct
  // dates or time slots than the deterministic grid found) is the dangerous direction: it
  // usually means a whole day or administration round was dropped from the extraction.
  const expectedDates = cleanInteger(baseline.dateCount);
  const referencedDates = new Set(
    records.map((record) => record.date).filter((d): d is string => d !== null),
  ).size;
  if (expectedDates !== null && expectedDates > 0 && referencedDates < expectedDates) {
    mismatched = true;
    notes.push(
      `Grid parser detected ${expectedDates} distinct date(s) but the AI only referenced ${referencedDates} — a full day may be missing.`,
    );
  }

  const expectedTimeSlots = cleanInteger(baseline.timeSlotCount);
  const referencedTimeSlots = new Set(
    records.map((record) => record.timeSlot).filter((t): t is string => t !== null),
  ).size;
  if (expectedTimeSlots !== null && expectedTimeSlots > 0 && referencedTimeSlots < expectedTimeSlots) {
    mismatched = true;
    notes.push(
      `Grid parser detected ${expectedTimeSlots} distinct time slot(s) but the AI only referenced ${referencedTimeSlots} — an administration round may be missing.`,
    );
  }

  return {
    expectedCells,
    populatedRecords,
    cellDelta,
    expectedDates,
    referencedDates,
    expectedTimeSlots,
    referencedTimeSlots,
    mismatched,
    notes,
  };
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Flag populated records that duplicate an earlier record on the same administration cell
 * (date + timeSlot + medicine, compared case-insensitively). Each EMAR grid cell is a single
 * administration, so a duplicate is a data-integrity problem: it can pad the record count and
 * hide a genuine shortfall from the baseline cross-check. Duplicates are forced to
 * requiresVerification=true (in place) and counted for the integrity report. Records with any
 * null component cannot be keyed to a cell and are never treated as duplicates.
 */
const markDuplicatePopulatedRecords = (
  records: EmarComplianceRecord[],
  corrections: string[],
): number => {
  const seen = new Set<string>();
  let duplicates = 0;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record.date === null || record.timeSlot === null || record.medicine === null) continue;
    const key = `${record.date}\u0000${record.timeSlot.toLowerCase()}\u0000${record.medicine.toLowerCase()}`;
    if (seen.has(key)) {
      duplicates += 1;
      if (!record.requiresVerification) {
        record.requiresVerification = true;
        corrections.push(
          `record[${index}]: duplicate administration for ${record.medicine} on ${record.date} @ ${record.timeSlot}; flagged for verification`,
        );
      }
    } else {
      seen.add(key);
    }
  }
  return duplicates;
};

/**
 * Validate and deterministically normalize a raw EMAR compliance result from the AI agent.
 * The returned object is guaranteed to satisfy every documented invariant and carries an
 * `integrity` report describing any corrections and whether human review is required.
 */
export function validateAndNormalizeCompliance(
  raw: unknown,
  options: ValidateOptions = {},
): EmarComplianceResult {
  const corrections: string[] = [];
  const warnings: string[] = [];
  const checkedAt = options.now ?? new Date().toISOString();

  const source = isPlainObject(raw) ? raw : {};
  if (!isPlainObject(raw)) {
    warnings.push("AI result was not an object; returning an empty, safe result.");
  }

  const rawRecords = Array.isArray(source.records) ? source.records : [];
  if (!Array.isArray(source.records)) {
    warnings.push("AI result had no records array.");
  }

  const records = rawRecords.map((record, index) => normalizeRecord(record, index, corrections));

  // Deterministically recompute every aggregate — never trust the model's own counts.
  const codeCounts = computeCodeCounts(records);
  const { workers: allCareWorkers, extras: careWorkerExtras } = computeCareWorkers(records, source.allCareWorkers);
  if (careWorkerExtras.length > 0) {
    corrections.push(
      `allCareWorkers dropped ${careWorkerExtras.length} listed worker(s) not present on any record: ${careWorkerExtras.join(", ")}`,
    );
  }
  const trendWarnings = normalizeTrendWarnings(source.trendWarnings);

  const summary: EmarComplianceSummary = {
    totalRecords: records.length,
    byCode: codeCounts,
  };

  // Detect (and silently correct) discrepancies between the model's self-reported summary
  // and the deterministic recomputation so reviewers know the model was unreliable.
  const rawSummary = isPlainObject(source.summary) ? source.summary : null;
  if (rawSummary) {
    const rawTotal = cleanInteger(rawSummary.totalRecords);
    if (rawTotal !== null && rawTotal !== records.length) {
      corrections.push(
        `summary.totalRecords (${rawTotal}) corrected to ${records.length}`,
      );
    }
    const rawByCode = isPlainObject(rawSummary.byCode) ? rawSummary.byCode : null;
    if (rawByCode) {
      for (const code of EMAR_CODES) {
        const reported = cleanInteger(rawByCode[code]);
        if (reported !== null && reported !== codeCounts[code]) {
          corrections.push(
            `summary.byCode.${code} (${reported}) corrected to ${codeCounts[code]}`,
          );
        }
      }
    }
  }

  const nullCodeCount = records.filter((record) => record.code === null).length;
  const duplicateRecordCount = markDuplicatePopulatedRecords(records, corrections);
  if (duplicateRecordCount > 0) {
    warnings.push(
      `${duplicateRecordCount} duplicate administration record(s) detected (same medicine, date and time slot) — possible double extraction; review before relying on counts.`,
    );
  }
  const verificationRequiredCount = records.filter((record) => record.requiresVerification).length;

  const baselineCrossCheck = buildBaselineCrossCheck(records, options.gridBaseline);
  if (baselineCrossCheck) {
    for (const note of baselineCrossCheck.notes) warnings.push(note);
  }

  if (records.length === 0) {
    warnings.push("No EMAR records were produced — the document may be unreadable or empty.");
  }

  // Confidence heuristic: start fully confident, then penalize anything that erodes trust.
  let confidence = 1;
  if (records.length === 0) {
    confidence = 0;
  } else {
    confidence -= Math.min(0.4, corrections.length * 0.05);
    confidence -= Math.min(0.3, (nullCodeCount / records.length) * 0.3);
    if (duplicateRecordCount > 0) {
      confidence -= Math.min(0.3, (duplicateRecordCount / records.length) * 0.5 + 0.1);
    }
    if (baselineCrossCheck?.mismatched) confidence -= 0.35;
  }
  confidence = clamp01(Number(confidence.toFixed(3)));

  const requiresHumanReview =
    verificationRequiredCount > 0 ||
    baselineCrossCheck?.mismatched === true ||
    records.length === 0 ||
    confidence < 0.75;

  const integrity: EmarIntegrityReport = {
    normalized: corrections.length > 0,
    corrections,
    warnings,
    recordCount: records.length,
    nullCodeCount,
    duplicateRecordCount,
    verificationRequiredCount,
    codeCounts,
    confidence,
    requiresHumanReview,
    baselineCrossCheck,
    checkedAt,
  };

  return {
    records,
    allCareWorkers,
    trendWarnings,
    summary,
    integrity,
  };
}
