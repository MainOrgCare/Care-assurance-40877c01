import { createChatCompletionWithLogging, type AiUserContext } from "./aiClient";
import type { ParsedEMAR } from "../emarGridParser";

interface EmarAgentResult {
  entries: any[];
  metadata: {
    serviceUserInitials: string;
    allergies: string;
    medications: any[];
    dates: string[];
    timeSlots: string[];
  };
  consensusStatus: string;
  validationPassed: boolean;
  model: string;
}

type TableStructureInfo = {
  hasTable?: boolean;
  columns?: string[];
  rowCount?: number;
  tableType?: string;
  columnBoundaries?: number[];
  detectedTimeSlots?: string[];
  detectedDatesOnSameLine?: number;
};

const AGENT_MODEL = "gpt-4.1-mini";
const MIN_TEXT_CHARS = 180000;
const MAX_TEXT_CHARS_CAP = 360000;
const MIN_EXPECTED_ENTRIES = 600;
const MAX_EXPECTED_ENTRIES_CAP = 2500;
const EST_CHARS_PER_PAGE = 8000;
const EST_ENTRIES_PER_PAGE = 120;
const MAX_DAYS_FOR_ENTRY_ADJUST = 14;
const MED_BATCH_SIZE = 4;
const DETERMINISTIC_SEED = 42;

const clampNumber = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const normalizeKeyString = (value: unknown): string => String(value || "").trim().toLowerCase();

const estimatePageCount = (text: string): number => {
  const matches = text.match(/--- PAGE BREAK ---/g);
  if (matches && matches.length > 0) {
    return Math.min(60, matches.length + 1);
  }
  const rough = Math.max(1, Math.round(text.length / 6000));
  return Math.min(60, rough);
};

const computeAdaptiveLimits = (text: string): { maxTextChars: number; maxExpectedEntries: number } => {
  const pageCount = estimatePageCount(text);
  const maxTextChars = clampNumber(
    MIN_TEXT_CHARS + pageCount * EST_CHARS_PER_PAGE,
    MIN_TEXT_CHARS,
    MAX_TEXT_CHARS_CAP
  );
  const maxExpectedEntries = clampNumber(
    MIN_EXPECTED_ENTRIES + pageCount * EST_ENTRIES_PER_PAGE,
    MIN_EXPECTED_ENTRIES,
    MAX_EXPECTED_ENTRIES_CAP
  );
  return { maxTextChars, maxExpectedEntries };
};

const adjustExpectedEntries = (
  baseMax: number,
  metadata: { medications?: any[]; timeSlots?: string[]; dates?: string[] }
): number => {
  const medCount = Array.isArray(metadata.medications) ? metadata.medications.length : 0;
  const slotCount = Math.max(1, Array.isArray(metadata.timeSlots) ? metadata.timeSlots.length : 0);
  const dateCount = Array.isArray(metadata.dates) ? metadata.dates.length : 0;
  const gridEstimate = medCount * slotCount * Math.min(dateCount, MAX_DAYS_FOR_ENTRY_ADJUST);
  return clampNumber(Math.max(baseMax, gridEstimate), MIN_EXPECTED_ENTRIES, MAX_EXPECTED_ENTRIES_CAP);
};

const extractJsonObject = (content: string): string | null => {
  if (!content) return null;
  const start = content.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < content.length; i++) {
    const char = content[i];
    if (char === "\"" && content[i - 1] !== "\\") {
      inString = !inString;
    }
    if (!inString) {
      if (char === "{") depth += 1;
      if (char === "}") {
        depth -= 1;
        if (depth === 0) return content.slice(start, i + 1);
      }
    }
  }
  return null;
};

const parseJsonFromContent = (content: string): any | null => {
  const jsonText = extractJsonObject(content);
  if (!jsonText) return null;
  try {
    return JSON.parse(jsonText);
  } catch {
    const cleaned = jsonText.replace(/,\s*([}\]])/g, "$1");
    try {
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
};

const inferGenericNameFromMedicationLabel = (name: string): string => {
  if (!name) return "";
  const cleaned = name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b\d+(?:\.\d+)?\s*(mg|mcg|g|ml|iu|units?)\b/g, " ")
    .replace(/\b\d+(?:\.\d+)?\s*(micrograms?|milligrams?|grams?|millilitres?)\b/g, " ")
    .replace(/\b(tablets?|capsules?|caps?|tab|cap|patches?|sprays?|drops?|solution|syrup|suspension|ointment|cream|gel|inhaler|injection|ampoules?|nebules?|puffs?)\b/g, " ")
    .replace(/\b(oral|topical|subcutaneous|intravenous|iv|im|pr|sc)\b/g, " ")
    .replace(/[^a-z\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  const tokens = cleaned.split(" ").filter((token) => token.length >= 3);
  return tokens[0] || "";
};

const normalizeMedicationKey = (name: string): string =>
  (name || "")
    .toLowerCase()
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const PRN_TEXT_PATTERN = /\b(prn|as required|as needed|when required|when needed|if needed|as necessary|up to \d+\s*(?:times|tablets?|capsules?|puffs|drops?)\s*(?:daily|per day))\b/i;
const isPrnFromText = (text: string): boolean => PRN_TEXT_PATTERN.test(text || "");

const buildMedicationVariantKey = (name: string, instructions: string): string => {
  const base = normalizeMedicationKey(name || "");
  const combined = `${name || ""} ${instructions || ""}`.toLowerCase();
  if (!base || !combined.trim()) return base;

  const signature = new Set<string>();

  const ratioMatches =
    combined.match(/\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|units?)\s*\/\s*\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|units?)\b/g) || [];
  for (const match of ratioMatches) signature.add(normalizeMedicationKey(match));

  const strengthMatches =
    combined.match(/\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|units?|%)\b/g) || [];
  for (const match of strengthMatches) signature.add(normalizeMedicationKey(match));

  const formMatches =
    combined.match(/\b(tablets?|tabs?|capsules?|caps?|liquid|solution|syrup|suspension|cream|ointment|gel|patch(?:es)?|spray|drops?|inhaler|injection|ampoules?|nebules?|puffs?)\b/g) ||
    [];
  for (const match of formMatches) signature.add(normalizeMedicationKey(match));

  const signatureKey = Array.from(signature).filter(Boolean).sort().join("-");
  return signatureKey ? `${base}|${signatureKey}` : base;
};

const inferRequiredGapHoursFromText = (text: string): number | null => {
  const lower = String(text || "").toLowerCase();
  if (!lower) return null;

  const candidates: Array<number | null> = [];

  // "must be 12 hours apart", "12 hours apart"
  const apartMatch = lower.match(/\b(\d{1,2})\s*hours?\s*apart\b/);
  if (apartMatch) candidates.push(Number(apartMatch[1]));

  // "every 8 hours", "every 6 hour"
  const everyMatch = lower.match(/\bevery\s*(\d{1,2})\s*hours?\b/);
  if (everyMatch) candidates.push(Number(everyMatch[1]));

  // "4-6 hourly", "4 - 6 hours"
  const rangeMatch = lower.match(/\b(\d{1,2})\s*[-–]\s*(\d{1,2})\s*(?:hours?|hourly)\b/);
  if (rangeMatch) candidates.push(Number(rangeMatch[1]));

  // "6 hourly"
  const hourlyMatch = lower.match(/\b(\d{1,2})\s*hourly\b/);
  if (hourlyMatch) candidates.push(Number(hourlyMatch[1]));

  const cleaned = candidates
    .filter((value): value is number => Number.isFinite(value))
    .map((value) => Math.round(value))
    .filter((value) => value >= 1 && value <= 24);

  if (cleaned.length === 0) return null;
  return Math.min(...cleaned);
};

const normalizeCode = (raw: unknown): string => {
  if (!raw) return "";
  let code = String(raw)
    .toUpperCase()
    .trim()
    .replace(/[()\[\]{}]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, "");

  if (!code) return "";
  if (code === "F" || code === "FAMILY" || code === "FAM" || code === "F/A") return "FA";
  if (code === "S/A" || code === "S-A") return "SA";
  if (code === "M/U") return "MU";
  if (code === "N/H") return "NH";
  if (code === "A/D") return "AD";
  if (code === "A/S") return "AS";
  if (code === "PRNAD" || code === "PRN-AD") return "PRN-AD";
  if (code === "PRNAS" || code === "PRN-AS") return "PRN-AS";
  if (code === "PRNR" || code === "PRN-R" || code === "PRNREFUSED" || code === "PRNREFUS") return "PRN-R";
  if (code === "REFUSED" || code === "REFUSE" || code === "REF") return "R";
  if (code === "SELADMIN" || code === "SELFADMIN" || code === "SA") return "SA";
  if (code === "MEDUNAV" || code === "MEDUNAVAILABLE" || code === "UNAVAILABLE" || code === "MU") return "MU";
  if (code === "NOTHOME" || code === "NH") return "NH";
  if (code === "NA") return "N/A";
  return code;
};

const TIME_REGEX = /^(?:(?:0?[0-9]|1[0-9]|2[0-3])[:.]?[0-5][0-9]|(?:0?[0-9]|1[0-2])[:.]?[0-5][0-9]\s*(?:am|pm|AM|PM))$/;

const computeHasTime = (entry: any): boolean => {
  const timeStr = String(entry?.time || "").trim();
  if (
    timeStr === "" ||
    timeStr === "-" ||
    timeStr === "--" ||
    timeStr.toLowerCase() === "n/a" ||
    timeStr.toLowerCase() === "na" ||
    timeStr.toLowerCase() === "null" ||
    timeStr === "0"
  ) {
    return false;
  }

  const rangePattern = /\d{1,2}[:.]\d{2}\s*[-–]\s*\d{1,2}[:.]\d{2}/;
  if (rangePattern.test(timeStr)) return false;
  if (TIME_REGEX.test(timeStr)) return true;
  const tokenMatch = timeStr.match(/\b(?:0?[0-9]|1[0-9]|2[0-3])[:.]?[0-5][0-9](?:\s*(?:am|pm|AM|PM))?\b/);
  return !!tokenMatch;
};

const normalizeTimeSlot = (value: unknown): string => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.replace(/\s*-\s*/g, "-").replace(/\s+/g, " ");
};

const normalizeDate = (value: unknown): string => String(value || "").trim();

const normalizeInitials = (value: unknown): string =>
  String(value || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 4);

const normalizeSlotKey = (entry: any): string =>
  [
    String(entry?.medicationId ?? ""),
    normalizeKeyString(normalizeDate(entry?.date)),
    normalizeKeyString(normalizeTimeSlot(entry?.timeSlot)),
  ].join("|");

const codePriority: Record<string, number> = {
  "PRN-R": 90,
  "PRN-AD": 82,
  "PRN-AS": 82,
  PRN: 80,
  AD: 65,
  AS: 65,
  P: 60,
  "N/A": 10,
  BLANK: 0,
};

const computeEntryScore = (entry: any): number => {
  const code = normalizeCode(entry?.code || "");
  let score = codePriority[code] ?? (code ? 60 : 0);
  if (computeHasTime(entry)) score += 5;
  const initials = String(entry?.careWorkerInitials || "").toUpperCase().trim();
  if (initials && initials !== "MANUAL") score += 3;
  if (String(entry?.time || "").trim()) score += 1;
  return score;
};

const shouldReplaceEntry = (current: any, candidate: any): boolean => {
  const currentScore = computeEntryScore(current);
  const candidateScore = computeEntryScore(candidate);
  if (candidateScore !== currentScore) return candidateScore > currentScore;

  const currentHasTime = computeHasTime(current);
  const candidateHasTime = computeHasTime(candidate);
  if (currentHasTime !== candidateHasTime) return candidateHasTime;

  const currentInitials = String(current?.careWorkerInitials || "").toUpperCase().trim();
  const candidateInitials = String(candidate?.careWorkerInitials || "").toUpperCase().trim();
  if (currentInitials !== candidateInitials) {
    if (candidateInitials && candidateInitials !== "MANUAL") return true;
    if (currentInitials && !candidateInitials) return false;
  }

  const currentCode = normalizeCode(current?.code || "");
  const candidateCode = normalizeCode(candidate?.code || "");
  if (candidateCode !== currentCode) {
    return candidateCode.length > currentCode.length;
  }

  return false;
};

const deduplicateEntries = (entries: any[]): any[] => {
  const bestByKey = new Map<string, any>();
  for (const entry of entries) {
    const key = normalizeSlotKey(entry);
    if (!bestByKey.has(key)) {
      bestByKey.set(key, entry);
      continue;
    }
    const existing = bestByKey.get(key);
    if (shouldReplaceEntry(existing, entry)) {
      bestByKey.set(key, entry);
    }
  }
  return Array.from(bestByKey.values());
};

const uniqueStrings = (items: unknown[]): string[] => {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const value = String(item || "").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
};

const extractDatesFromText = (text: string): string[] => {
  const dates = new Set<string>();
  const datePattern1 = /\b(Sun|Mon|Tue|Wed|Thu|Fri|Sat)[,.]?\s*(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/gi;
  const datePattern2 = /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/gi;
  const datePattern3 = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/g;

  let match;
  while ((match = datePattern1.exec(text)) !== null) {
    dates.add(`${match[1]}, ${match[2].padStart(2, "0")} ${match[3]}`);
  }
  while ((match = datePattern2.exec(text)) !== null) {
    dates.add(`${match[1].padStart(2, "0")} ${match[2]}`);
  }
  while ((match = datePattern3.exec(text)) !== null) {
    dates.add(`${match[1].padStart(2, "0")}/${match[2].padStart(2, "0")}/${match[3]}`);
  }
  return Array.from(dates);
};

const extractTimeSlotsFromText = (text: string): string[] => {
  const timePattern = /\b(\d{1,2}:\d{2})(?:\s*-\s*(\d{1,2}:\d{2}))?\b/g;
  const slots = new Set<string>();
  let match;
  while ((match = timePattern.exec(text)) !== null) {
    if (match[2]) {
      slots.add(`${match[1]}-${match[2]}`);
    } else {
      slots.add(match[1]);
    }
  }
  return Array.from(slots);
};

const parseTimeToMinutes = (value: string): number | null => {
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2})[:.](\d{2})(?:\s*(am|pm))?$/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3];
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (meridiem) {
    if (meridiem === "pm" && hours < 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;
  }
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
};

const resolveTimeSlot = (timeSlot: string, time: string, timeSlots: string[]): string => {
  const normalizedSlot = normalizeTimeSlot(timeSlot);
  if (normalizedSlot) return normalizedSlot;
  const timeMinutes = parseTimeToMinutes(String(time || ""));
  if (timeMinutes === null) return "";
  for (const slot of timeSlots) {
    const normalized = normalizeTimeSlot(slot);
    const rangeMatch = normalized.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
    if (rangeMatch) {
      const start = parseTimeToMinutes(rangeMatch[1]);
      const end = parseTimeToMinutes(rangeMatch[2]);
      // End is exclusive to avoid boundary double-matches (e.g. 09:00 matching both 08:00-09:00 and 09:00-10:00)
      if (start !== null && end !== null && timeMinutes >= start && timeMinutes < end) {
        return normalized;
      }
    } else {
      const single = parseTimeToMinutes(normalized);
      if (single !== null && single === timeMinutes) {
        return normalized;
      }
    }
  }
  return "";
};


const reconcileConsensusEntries = (passResults: any[][]): any[] => {
  if (passResults.length === 0) return [];
  if (passResults.length === 1) return passResults[0];

  const grouped = new Map<string, any[]>();
  for (let i = 0; i < passResults.length; i++) {
    const pass = passResults[i];
    for (const entry of pass) {
      const key = normalizeSlotKey(entry);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(entry);
    }
  }

  const finalEntries: any[] = [];
  const CODE_SAFETY_PRIORITY: Record<string, number> = {
    "R": 100,
    "PRN-R": 100,
    "MISSED": 95,
    "MU": 90,
    "NH": 80,
    "SA": 75,
    "FA": 75,
    "AD": 50,
    "AS": 50,
    "PRN-AD": 50,
    "PRN-AS": 50,
    "PRN": 40,
    "P": 30,
    "N/A": 10,
  };

  for (const [key, variants] of Array.from(grouped.entries())) {
    const voteCount = new Map<string, number>();
    for (const v of variants) {
      const vKey = String(v.code || "BLANK").toUpperCase();
      voteCount.set(vKey, (voteCount.get(vKey) || 0) + 1);
    }

    let winnerCode = "";
    let maxVotes = 0;
    for (const [code, count] of Array.from(voteCount.entries())) {
      if (count > maxVotes) {
        maxVotes = count;
        winnerCode = code;
      } else if (count === maxVotes) {
        // Tie-breaker: safety critical codes first
        const p1 = CODE_SAFETY_PRIORITY[winnerCode] || 0;
        const p2 = CODE_SAFETY_PRIORITY[code] || 0;
        if (p2 > p1) winnerCode = code;
      }
    }

    // Pick the best example of this code from the variants
    const bestVariant = variants
      .filter((v) => String(v.code || "").toUpperCase() === winnerCode)
      .sort((a, b) => {
        const scoreA = (a.hasTime ? 2 : 0) + (a.careWorkerInitials ? 1 : 0);
        const scoreB = (b.hasTime ? 2 : 0) + (b.careWorkerInitials ? 1 : 0);
        return scoreB - scoreA;
      })[0];

    if (bestVariant) finalEntries.push(bestVariant);
  }

  return finalEntries;
};

const buildTableContext = (tableStructure: TableStructureInfo | null): string => {
  if (!tableStructure || !tableStructure.hasTable) return "";
  const datesInfo = Array.isArray(tableStructure.columns) && tableStructure.columns.length > 0
    ? `Detected dates: ${tableStructure.columns.slice(0, 20).join(", ")}`
    : "Detected dates: none";
  const timeInfo = Array.isArray(tableStructure.detectedTimeSlots) && tableStructure.detectedTimeSlots.length > 0
    ? `Detected time slots: ${tableStructure.detectedTimeSlots.join(", ")}`
    : "Detected time slots: none";
  return `DOCUMENT LAYOUT:
- Table type: ${tableStructure.tableType || "unknown"}
- Dates on header line: ${tableStructure.detectedDatesOnSameLine || 0}
- ${datesInfo}
- ${timeInfo}
- Estimated medication rows: ${tableStructure.rowCount || 0}
`;
};

const buildMetadataPrompt = (tableContext: string, correctionsContext: string) => `You are an EMAR (Electronic Medication Administration Record) data extractor specialized in UK healthcare records.
${tableContext}${correctionsContext}

Extract metadata from the document text. The document may contain multiple pages.
Return a JSON object with this structure:
{
  "serviceUserInitials": "F.O.",
  "allergies": "No known allergies",
  "medications": [
    {
      "name": "FULL MEDICATION NAME AND STRENGTH",
      "genericName": "generic name",
      "isPRN": true,
      "instructions": "Full administration instructions including route",
      "requiredGapHours": 4,
      "scheduledTimeSlots": ["list of relevant slots"]
    }
  ],
  "dates": ["list of all unique dates as columns in the record"],
  "timeSlots": ["all unique time slot headers found"]
}

CRITICAL RULES:
1. serviceUserInitials: Convert "Freda O'Neill" -> "F.O.". Ensure initials are followed by dots.
2. medications: Be exhaustive. Scan EVERY page. Include strength (e.g., 500mg) and form (e.g., Tablets).
3. isPRN: True if instructions mention "PRN", "as required", "when needed", etc.
4. instructions: Capture EVERYTHING in the medication label area, including "Route Oral", "Apply thin layer", etc.
5. scheduledTimeSlots: For each medication, identify which time slots have grid boxes for administration.
6. dates: Extract ALL dates that appear as column headers in the grid. Format them exactly as they appear (e.g., "Sun, 30 Nov").`;

const buildEntriesPrompt = (
  medList: string,
  dates: string[],
  timeSlots: string[],
  tableContext: string,
  correctionsContext: string
) => `You are an EMAR data extractor. Your task is to extract administration entries for specific medications from a grid-based record.

${tableContext}${correctionsContext}

TARGET MEDICATIONS (use exact medicationId in output):
${medList}

GRID DIMENSIONS:
DATES: ${dates.join(", ")}
TIME SLOTS: ${timeSlots.join(", ")}

Return JSON with this exact structure:
{
  "entries": [
    {"medicationId": 1, "date": "Sat, 06 Dec", "timeSlot": "08:00-09:00", "code": "AD", "careWorkerInitials": "RK", "time": "08:30", "hasTime": true, "isOfficeClosed": false, "closedByStaff": "", "closedTime": ""},
    {"medicationId": 1, "date": "Sun, 07 Dec", "timeSlot": "08:00-09:00", "code": "AS", "careWorkerInitials": "", "time": "", "hasTime": false, "isOfficeClosed": false, "closedByStaff": "", "closedTime": ""}
  ]
}

EXTRACTION RULES:
1. MAP TO GRID: Each entry must correspond to a specific (medication, date, timeSlot) intersection in the grid.
2. NON-ADMINISTRATION CODES ARE VITAL: Always capture R (Refused), MU (Medication Unavailable), NH (Not Home), SA (Self Admin), FA (Family Admin).
3. BLANK CELLS: If a cell is blank and it's a scheduled dose (non-PRN), it's a MISSING entry. Use "MISSED" as code.
4. PRN DOSES: For PRN medications, only include entries if there is a code, time, or signature. If the box is empty for a PRN med, do NOT create an entry.
5. TIME: Only set "hasTime" true and provide "time" if an actual administration time (e.g., 08:45) is handwritten or typed in the box, distinct from the slot header.
6. INITIALS: Capture the 2 or 3 letter care worker initials if present.
7. AMBIGUITY: If you see a code like "AD" or a signature but the exact time slot is hard to determine, use the most likely slot and set timeSlot to "UNSPECIFIED" if truly impossible to map.`;

export const emarAgent = {
  async extract(
    analysisText: string,
    tableStructure: any,
    correctionsContext: string,
    aiUserContext: AiUserContext,
    options?: { gridBaseline?: ParsedEMAR | null }
  ): Promise<EmarAgentResult> {
    const gridBaseline = options?.gridBaseline || null;
    if (gridBaseline && Array.isArray(gridBaseline.cells) && gridBaseline.cells.length > 0) {
      const gridDates = uniqueStrings(Array.isArray(gridBaseline.dates) ? gridBaseline.dates : []);
      const gridTimeSlots = uniqueStrings(Array.isArray(gridBaseline.timeSlots) ? gridBaseline.timeSlots : []).map(normalizeTimeSlot).filter(Boolean);

      const rawMeds = Array.isArray(gridBaseline.medications) ? gridBaseline.medications : [];
      const rawCells = Array.isArray(gridBaseline.cells) ? gridBaseline.cells : [];

      const nonBlankCode = (value: unknown) => {
        const code = normalizeCode(value);
        if (!code || code === "BLANK" || code === "N/A") return "";
        return code;
      };

      const resolveCellMedicationId = (cell: any): number | null => {
        const direct = Number(cell?.medicationId);
        if (Number.isFinite(direct) && direct > 0) return direct;
        const row = Number(cell?.medicationRow);
        if (Number.isFinite(row) && row >= 0) return row + 1;
        return null;
      };

      const medStatsById = new Map<number, { prnCount: number; nonBlankCount: number }>();
      const medStatsByKey = new Map<string, { prnCount: number; nonBlankCount: number }>();
      for (const cell of rawCells) {
        const code = nonBlankCode((cell as any)?.code);
        if (!code) continue;

        const medId = resolveCellMedicationId(cell);
        if (medId) {
          if (!medStatsById.has(medId)) {
            medStatsById.set(medId, { prnCount: 0, nonBlankCount: 0 });
          }
          const stats = medStatsById.get(medId)!;
          stats.nonBlankCount += 1;
          if (code.startsWith("PRN")) stats.prnCount += 1;
        }

        const medKey = normalizeMedicationKey(String(cell?.medication || ""));
        if (medKey) {
          if (!medStatsByKey.has(medKey)) {
            medStatsByKey.set(medKey, { prnCount: 0, nonBlankCount: 0 });
          }
          const stats = medStatsByKey.get(medKey)!;
          stats.nonBlankCount += 1;
          if (code.startsWith("PRN")) stats.prnCount += 1;
        }
      }

      const medsWithIds = rawMeds
        .map((med: any, index: number) => {
          const rawName = String(med?.name || "").trim();
          if (!rawName) return null;
          const name = rawName
            .replace(/\s+/g, " ")
            .trim();
          const row = Number.isFinite(Number(med?.row)) ? Number(med.row) : index;
          const medicationId = row + 1;
          const key = normalizeMedicationKey(name);
          const stats = medStatsById.get(medicationId) || (key ? medStatsByKey.get(key) : undefined);
          const nonBlankCount = stats?.nonBlankCount || 0;
          const prnCount = stats?.prnCount || 0;
          const prnRatio = nonBlankCount > 0 ? prnCount / nonBlankCount : 0;
          const gridPrnStrong = prnCount >= 2 && prnRatio >= 0.5;
          const instructionText = String(med?.instructions || "").replace(/\s+/g, " ").trim();
          const isPRN = isPrnFromText(`${name} ${instructionText}`) || gridPrnStrong;
          const inferredGap = inferRequiredGapHoursFromText(`${name} ${String(med?.instructions || "")}`);

          const scheduledSlots = uniqueStrings(Array.isArray(med?.timeSlots) ? med.timeSlots : [])
            .map(normalizeTimeSlot)
            .filter(Boolean);
          return {
            medicationId,
            name,
            genericName: inferGenericNameFromMedicationLabel(name),
            isPRN,
            instructions: instructionText,
            requiredGapHours: clampNumber(Math.round(inferredGap ?? 4), 1, 24),
            scheduledTimeSlots: (scheduledSlots.length > 0 ? scheduledSlots : gridTimeSlots),
          };
        })
        .filter(Boolean) as any[];

      const medCandidatesByKey = new Map<string, Array<{ medicationId: number; scheduledTimeSlots: string[] }>>();
      for (const med of medsWithIds) {
        const key = normalizeMedicationKey(med.name);
        if (!key) continue;
        const scheduled = uniqueStrings(Array.isArray(med?.scheduledTimeSlots) ? med.scheduledTimeSlots : [])
          .map(normalizeTimeSlot)
          .filter(Boolean);
        const candidates = medCandidatesByKey.get(key) || [];
        candidates.push({ medicationId: med.medicationId, scheduledTimeSlots: scheduled });
        medCandidatesByKey.set(key, candidates);
      }

      const resolveMedicationIdByNameAndSlot = (name: string, timeSlotHint?: string): number | null => {
        const key = normalizeMedicationKey(name || "");
        if (!key) return null;
        const directCandidates = medCandidatesByKey.get(key) || [];
        if (directCandidates.length === 1) return directCandidates[0].medicationId;
        if (directCandidates.length > 1 && timeSlotHint) {
          const normalizedHint = normalizeTimeSlot(timeSlotHint) || timeSlotHint;
          const matching = directCandidates.filter((candidate) => {
            const slots = candidate.scheduledTimeSlots.map((s) => normalizeTimeSlot(s) || s);
            return slots.includes(normalizedHint);
          });
          if (matching.length === 1) return matching[0].medicationId;
        }

        let bestCandidate: { medicationId: number; scheduledTimeSlots: string[] } | null = null;
        let bestScore = 0;
        for (const [candidateKey, candidates] of medCandidatesByKey.entries()) {
          if (!candidateKey) continue;
          const hit = candidateKey.includes(key) || key.includes(candidateKey);
          if (!hit) continue;
          const score = Math.min(candidateKey.length, key.length);
          if (score > bestScore) {
            bestScore = score;
            bestCandidate = candidates[0] || null;
          }
        }

        if (bestScore >= 6 && bestCandidate) {
          if (timeSlotHint) {
            const normalizedHint = normalizeTimeSlot(timeSlotHint) || timeSlotHint;
            const candidates = medCandidatesByKey.get(normalizeMedicationKey(name || "")) || [];
            const slotMatched = candidates.find((candidate) => {
              const slots = candidate.scheduledTimeSlots.map((s) => normalizeTimeSlot(s) || s);
              return slots.includes(normalizedHint);
            });
            if (slotMatched) return slotMatched.medicationId;
          }
          return bestCandidate.medicationId;
        }
        return null;
      };

      const prnMedIds = new Set<number>();
      for (const med of medsWithIds) {
        if (med.isPRN) prnMedIds.add(med.medicationId);
      }

      const buildEntriesFromGrid = (): any[] => {
        const entries: any[] = [];

        for (const cell of rawCells) {
          const medId =
            resolveCellMedicationId(cell) ||
            resolveMedicationIdByNameAndSlot(
              String((cell as any)?.medication || ""),
              String((cell as any)?.timeSlot || "")
            );
          if (!medId) continue;
          const isPrn = prnMedIds.has(medId);

          const date = normalizeDate((cell as any)?.date);
          const timeSlot = normalizeTimeSlot((cell as any)?.timeSlot) || "UNSPECIFIED";
          const careWorkerInitials = normalizeInitials((cell as any)?.careWorker);
          const time = String((cell as any)?.time || "").trim();
          const hasTime = computeHasTime({ time });

          let code = nonBlankCode((cell as any)?.code);

          const hasInitials = Boolean(careWorkerInitials);

          // Infer missing codes when we still have evidence of an administration (time/initials)
          if (!code && (hasTime || hasInitials)) {
            code = isPrn ? "PRN" : "AD";
          }

          // Normalize PRN refusal handling when no time is recorded.
          if (isPrn) {
            if (code === "R") code = "PRN-R";
            if (code === "PRN" && !hasTime) code = "PRN-R";
          }

          if (!date || !code) continue;
          if (code === "N/A" || code === "BLANK") continue;

          entries.push({
            medicationId: medId,
            date,
            timeSlot,
            code,
            careWorkerInitials,
            time,
            hasTime,
            isOfficeClosed: false,
          });
        }

        return deduplicateEntries(entries);
      };

      const entries = buildEntriesFromGrid();

      return {
        entries,
        metadata: {
          serviceUserInitials: String(gridBaseline.serviceUserName || "").trim() || "N.N.",
          allergies: String(gridBaseline.allergies || "").trim() || "No known allergies",
          medications: medsWithIds,
          dates: gridDates,
          timeSlots: gridTimeSlots,
        },
        consensusStatus: "verified",
        validationPassed: true,
        model: "grid-parser",
      };
    }

    const rawText = String(analysisText || "");
    if (!rawText.trim()) {
      throw new Error("EMAR agent: empty document text");
    }
    const { maxTextChars, maxExpectedEntries: baseMaxExpectedEntries } = computeAdaptiveLimits(rawText);
    if (rawText.length > maxTextChars) {
      throw new Error(`EMAR agent: document too large for fast path (${rawText.length} chars, limit ${maxTextChars})`);
    }

    const tableContext = buildTableContext(tableStructure as TableStructureInfo);
    const metadataPrompt = buildMetadataPrompt(tableContext, correctionsContext);

    const runMetadataPass = async (passIndex: number) => {
      const response = await createChatCompletionWithLogging(
        {
          model: AGENT_MODEL,
          messages: [
            { role: "system", content: metadataPrompt },
            { role: "user", content: `Extract metadata from this EMAR document:\n\n${rawText}` },
          ],
          temperature: passIndex === 0 ? 0 : 0.1,
          max_completion_tokens: 2000,
          seed: passIndex === 0 ? DETERMINISTIC_SEED : undefined,
          response_format: { type: "json_object" },
        },
        `emar_agent_metadata_pass${passIndex + 1}`,
        aiUserContext
      );
      const content = response.choices[0]?.message?.content || "{}";
      return parseJsonFromContent(content) || {};
    };

    console.log("EMAR Agent: Running 2-pass metadata extraction...");
    const [meta1, meta2] = await Promise.all([runMetadataPass(0), runMetadataPass(1)]);

    const metadataParsed = {
      ...meta1,
      ...meta2,
      serviceUserInitials: meta1.serviceUserInitials || meta2.serviceUserInitials,
      allergies: meta1.allergies || meta2.allergies,
      medications: [...(meta1.medications || []), ...(meta2.medications || [])],
      dates: uniqueStrings([...(meta1.dates || []), ...(meta2.dates || [])]),
      timeSlots: uniqueStrings([...(meta1.timeSlots || []), ...(meta2.timeSlots || [])]),
    };

    const serviceUserInitialsRaw = String(
      metadataParsed.serviceUserInitials || metadataParsed.serviceUserName || ""
    ).trim();
    const allergiesRaw = String(metadataParsed.allergies || "").trim();
    const mergedMetadata = {
      serviceUserInitials: serviceUserInitialsRaw,
      allergies: allergiesRaw || "No known allergies",
      medications: [] as any[],
      dates: uniqueStrings(Array.isArray(metadataParsed.dates) ? metadataParsed.dates : []),
      timeSlots: uniqueStrings(Array.isArray(metadataParsed.timeSlots) ? metadataParsed.timeSlots : []),
    };

    const medicationCandidates = Array.isArray(metadataParsed.medications) ? metadataParsed.medications : [];
    const medByKey = new Map<string, any>();
    for (const med of medicationCandidates) {
      const name = String(med?.name || "").trim();
      if (!name) continue;
      const instructions = String(med?.instructions || "").trim();
      const key = buildMedicationVariantKey(name, instructions);
      if (!key) continue;
      const existing = medByKey.get(key);
      const next = {
        name,
        genericName: String(med?.genericName || "").trim(),
        isPRN:
          typeof med?.isPRN === "boolean" ? med.isPRN : isPrnFromText(`${name} ${String(med?.instructions || "")}`),
        instructions,
        requiredGapHours: (() => {
          const rawGap = Number(med?.requiredGapHours);
          const inferred = inferRequiredGapHoursFromText(`${name} ${instructions}`);
          const gap = Number.isFinite(rawGap) && rawGap >= 1 && rawGap <= 24 ? rawGap : inferred ?? 4;
          return clampNumber(Math.round(gap), 1, 24);
        })(),
        scheduledTimeSlots: uniqueStrings(Array.isArray(med?.scheduledTimeSlots) ? med.scheduledTimeSlots : [])
          .map(normalizeTimeSlot)
          .filter(Boolean),
      };
      if (!existing) {
        medByKey.set(key, next);
        continue;
      }
      const existingInstr = String(existing.instructions || "");
      if (next.instructions.length > existingInstr.length) {
        medByKey.set(key, { ...existing, ...next });
      }
    }
    mergedMetadata.medications = Array.from(medByKey.values()).map((med) => ({
      ...med,
      genericName: med.genericName || inferGenericNameFromMedicationLabel(med.name),
      scheduledTimeSlots: med.scheduledTimeSlots.length > 0 ? med.scheduledTimeSlots : mergedMetadata.timeSlots,
    }));

    if (mergedMetadata.dates.length === 0) {
      const tableDates = Array.isArray((tableStructure as TableStructureInfo)?.columns)
        ? (tableStructure as TableStructureInfo).columns || []
        : [];
      mergedMetadata.dates = uniqueStrings(tableDates);
    }

    if (mergedMetadata.timeSlots.length === 0) {
      const tableSlots = Array.isArray((tableStructure as TableStructureInfo)?.detectedTimeSlots)
        ? (tableStructure as TableStructureInfo).detectedTimeSlots || []
        : [];
      mergedMetadata.timeSlots = uniqueStrings(tableSlots);
    }

    if (mergedMetadata.dates.length === 0) {
      mergedMetadata.dates = extractDatesFromText(rawText);
    }
    if (mergedMetadata.timeSlots.length === 0) {
      mergedMetadata.timeSlots = extractTimeSlotsFromText(rawText);
    }
    mergedMetadata.timeSlots = uniqueStrings(mergedMetadata.timeSlots.map(normalizeTimeSlot)).filter(Boolean);

    if (mergedMetadata.medications.length === 0 || mergedMetadata.dates.length === 0) {
      throw new Error("EMAR agent: metadata incomplete");
    }

    const medicationsWithIds = mergedMetadata.medications.map((med, index) => ({
      ...med,
      medicationId: index + 1,
      scheduledTimeSlots: med.scheduledTimeSlots.length > 0 ? med.scheduledTimeSlots : mergedMetadata.timeSlots,
      requiredGapHours: clampNumber(Math.round(Number(med.requiredGapHours || 0) || 4), 1, 24),
    }));

    const expectedEntriesCount =
      medicationsWithIds.length *
      mergedMetadata.dates.length *
      Math.max(mergedMetadata.timeSlots.length, 1);

    const maxExpectedEntries = adjustExpectedEntries(baseMaxExpectedEntries, mergedMetadata);

    if (expectedEntriesCount > maxExpectedEntries) {
      throw new Error(
        `EMAR agent: expected entry count too large for fast path (${expectedEntriesCount}, limit ${maxExpectedEntries})`
      );
    }

    const medicationBatches: any[][] = [];
    for (let i = 0; i < medicationsWithIds.length; i += MED_BATCH_SIZE) {
      medicationBatches.push(medicationsWithIds.slice(i, i + MED_BATCH_SIZE));
    }

    const runPass = async (passIndex: number) => {
      const results = await Promise.all(
        medicationBatches.map(async (batch) => {
          const medList = batch
            .map((med) => `[ID:${med.medicationId}] ${med.name}${med.isPRN ? " (PRN)" : ""}`)
            .join("\n");

          const prompt = buildEntriesPrompt(
            medList,
            mergedMetadata.dates,
            mergedMetadata.timeSlots,
            tableContext,
            correctionsContext
          );

          const response = await createChatCompletionWithLogging(
            {
              model: AGENT_MODEL,
              messages: [
                { role: "system", content: prompt },
                { role: "user", content: `Extract entries from this EMAR document:\n\n${rawText}` },
              ],
              temperature: passIndex === 0 ? 0 : 0.1,
              max_completion_tokens: 8000,
              seed: passIndex === 0 ? DETERMINISTIC_SEED : undefined,
              response_format: { type: "json_object" },
            },
            `emar_agent_entries_pass${passIndex + 1}`,
            aiUserContext
          );

          const content = response.choices[0]?.message?.content || "{\"entries\":[]}";
          const parsed = parseJsonFromContent(content) || { entries: [] };
          return Array.isArray(parsed.entries) ? parsed.entries : [];
        })
      );
      return results.flat();
    };

    console.log(`EMAR Agent: Running 3-pass extraction for ${medicationsWithIds.length} medications...`);
    const [pass1Entries, pass2Entries, pass3Entries] = await Promise.all([
      runPass(0),
      runPass(1),
      runPass(2),
    ]);

    const validMedicationIds = new Set(medicationsWithIds.map((med) => med.medicationId));
    const medIdsByKey = new Map<string, number[]>();
    for (const med of medicationsWithIds) {
      const key = normalizeMedicationKey(med.name);
      if (!key) continue;
      const existing = medIdsByKey.get(key) || [];
      existing.push(med.medicationId);
      medIdsByKey.set(key, existing);
    }

    const normalizeEntry = (entry: any): any | null => {
      let medId = Number(entry?.medicationId || 0);
      if (!validMedicationIds.has(medId)) {
        const medName = String(entry?.medication || entry?.medicationName || entry?.name || "").trim();
        const key = normalizeMedicationKey(medName);
        const candidates = key ? medIdsByKey.get(key) || [] : [];
        if (candidates.length === 1) {
          medId = candidates[0];
        } else if (candidates.length > 1) {
          const time = String(entry?.time || "").trim();
          const timeSlotHint = resolveTimeSlot(entry?.timeSlot, time, mergedMetadata.timeSlots);
          if (timeSlotHint) {
            const normalizedHint = normalizeTimeSlot(timeSlotHint) || timeSlotHint;
              const matching = candidates.filter((candidateId) => {
                const medDetails = medicationsWithIds.find((med) => med.medicationId === candidateId);
                const slots = Array.isArray(medDetails?.scheduledTimeSlots) ? medDetails.scheduledTimeSlots : [];
                const normalizedSlots = slots.map((slot: string) => normalizeTimeSlot(slot) || slot);
                return normalizedSlots.includes(normalizedHint);
              });
            if (matching.length === 1) {
              medId = matching[0];
            }
          }
        }
      }
      if (!validMedicationIds.has(medId)) return null;

      const medDetails = medicationsWithIds.find((med) => med.medicationId === medId);
      const isPrn = Boolean(medDetails?.isPRN);
      const date = normalizeDate(entry?.date);
      const time = String(entry?.time || "").trim();
      let timeSlot = resolveTimeSlot(entry?.timeSlot, time, mergedMetadata.timeSlots);
      let code = normalizeCode(entry?.code);
      const careWorkerInitials = normalizeInitials(entry?.careWorkerInitials);
      const hasTime = typeof entry?.hasTime === "boolean" ? entry.hasTime : computeHasTime({ time });
      const isOfficeClosed = Boolean(entry?.isOfficeClosed);
      const closedByStaff = String(entry?.closedByStaff || "").trim();
      const closedTime = String(entry?.closedTime || "").trim();

      if (!timeSlot) {
        if (medDetails?.scheduledTimeSlots?.length === 1) {
          timeSlot = medDetails.scheduledTimeSlots[0];
        } else if (mergedMetadata.timeSlots.length === 1) {
          timeSlot = mergedMetadata.timeSlots[0];
        } else {
          timeSlot = "UNSPECIFIED";
        }
      }

      if (!code && (hasTime || careWorkerInitials)) {
        code = isPrn ? "PRN" : "AD";
      }
      if (isPrn && (code === "PRN" || code === "") && !hasTime) {
        code = "PRN-R";
      }
      if (!date || !code) return null;

      return {
        medicationId: medId,
        date,
        timeSlot,
        code,
        careWorkerInitials,
        time,
        hasTime,
        isOfficeClosed,
        closedByStaff,
        closedTime,
      };
    };

    const rawPass1 = pass1Entries.map(normalizeEntry).filter(Boolean);
    const rawPass2 = pass2Entries.map(normalizeEntry).filter(Boolean);
    const rawPass3 = pass3Entries.map(normalizeEntry).filter(Boolean);

    const entries = reconcileConsensusEntries([rawPass1, rawPass2, rawPass3]);

    return {
      entries,
      metadata: {
        ...mergedMetadata,
        medications: medicationsWithIds,
      },
      consensusStatus: "triple_pass_consensus",
      validationPassed: entries.length > 0,
      model: AGENT_MODEL,
    };
  }
};
