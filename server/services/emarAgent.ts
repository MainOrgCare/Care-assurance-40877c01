import { getPreferredModel, type AiUserContext } from "./aiClient";
import { parseJsonFromContent } from "../utils/jsonParser";
import { executeSecureTextCompletion } from "../utils/secureAiPipeline";
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

// Use admin-configured model instead of hardcoding — respects AI settings panel
const getAgentModel = (): string => getPreferredModel();
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

// extractJsonObject and parseJsonFromContent are now imported from ../utils/jsonParser
// (removed duplicated implementations that lacked the shared version's
//  truncated-JSON recovery, markdown-fence stripping, and smart-quote handling)

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

export const inferRequiredGapHoursFromText = (text: string): number | null => {
  const lower = String(text || "").toLowerCase();
  if (!lower) return null;

  const candidates: Array<number | null> = [];
  const wordToNumber: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
    twentyfour: 24,
  };
  const wordNumberPattern =
    "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty(?:\\s|-)?four";
  const toNumber = (value: string): number | null => {
    if (!value) return null;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    const normalizedWord = value.toLowerCase().replace(/[\s-]/g, "");
    return wordToNumber[normalizedWord] ?? null;
  };

  // "must be 12 hours apart", "12 hours apart", "12 hrs apart"
  const apartMatch = lower.match(/\b(\d{1,2})\s*(?:hours?|hrs?|hr)\s*apart\b/);
  if (apartMatch) candidates.push(Number(apartMatch[1]));
  const apartWordMatch = lower.match(new RegExp(`\\b(${wordNumberPattern})\\s*(?:hours?|hrs?|hr)\\s*apart\\b`));
  if (apartWordMatch) candidates.push(toNumber(apartWordMatch[1]));

  // "at least 6 hours between doses", "minimum 6 hours"
  const minMatch = lower.match(
    /\b(?:at\s*least|minimum|min\.?|no\s*less\s*than|not\s*less\s*than)\s*(\d{1,2})\s*(?:hours?|hrs?|hr)\b/
  );
  if (minMatch) candidates.push(Number(minMatch[1]));
  const minWordMatch = lower.match(
    new RegExp(`\\b(?:at\\s*least|minimum|min\\.?|no\\s*less\\s*than|not\\s*less\\s*than)\\s*(${wordNumberPattern})\\s*(?:hours?|hrs?|hr)\\b`)
  );
  if (minWordMatch) candidates.push(toNumber(minWordMatch[1]));

  // "6 hours between doses"
  const betweenMatch = lower.match(/\b(\d{1,2})\s*(?:hours?|hrs?|hr)\s*between\b/);
  if (betweenMatch) candidates.push(Number(betweenMatch[1]));
  const betweenWordMatch = lower.match(new RegExp(`\\b(${wordNumberPattern})\\s*(?:hours?|hrs?|hr)\\s*between\\b`));
  if (betweenWordMatch) candidates.push(toNumber(betweenWordMatch[1]));

  // "every 8 hours", "every 6 hour"
  const everyMatch = lower.match(/\bevery\s*(\d{1,2})\s*(?:hours?|hrs?|hr|h)\b/);
  if (everyMatch) candidates.push(Number(everyMatch[1]));
  const everyWordMatch = lower.match(new RegExp(`\\bevery\\s*(${wordNumberPattern})\\s*(?:hours?|hrs?|hr)\\b`));
  if (everyWordMatch) candidates.push(toNumber(everyWordMatch[1]));

  // "4-6 hourly", "4 - 6 hours"
  const rangeMatch = lower.match(/\b(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*(?:hours?|hrs?|hr|hourly|hrly)\b/);
  if (rangeMatch) candidates.push(Number(rangeMatch[1]));
  const wordRangeMatch = lower.match(
    new RegExp(`\\b(${wordNumberPattern}|\\d{1,2})\\s*(?:-|–|to)\\s*(${wordNumberPattern}|\\d{1,2})\\s*(?:hours?|hrs?|hr|hourly|hrly)\\b`)
  );
  if (wordRangeMatch) candidates.push(toNumber(wordRangeMatch[1]));

  // "6 hourly"
  const hourlyMatch = lower.match(/\b(\d{1,2})\s*[- ]?\s*(?:hourly|hrly)\b/);
  if (hourlyMatch) candidates.push(Number(hourlyMatch[1]));
  const hourlyWordMatch = lower.match(new RegExp(`\\b(${wordNumberPattern})\\s*[- ]?\\s*(?:hourly|hrly)\\b`));
  if (hourlyWordMatch) candidates.push(toNumber(hourlyWordMatch[1]));

  // "q6h", "q6hr", "q6 hrs", "q4-6h"
  const qMatch = lower.match(/\bq\s*(\d{1,2})(?:\s*(?:-|–|to)\s*(\d{1,2}))?\s*(?:h|hr|hrs|hours)\b/);
  if (qMatch) candidates.push(Number(qMatch[1]));

  // Explicit time pairs like "8am and 8pm" -> 12 hours
  const explicitTimes = lower.match(/\b(?:0?[1-9]|1[0-2])(?::[0-5]\d)?\s*(?:am|pm)\b/g) || [];
  if (explicitTimes.length >= 2) {
    const toMinutes = (token: string): number | null => {
      const match = token.match(/\b(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/);
      if (!match) return null;
      let hours = Number(match[1]);
      const minutes = match[2] ? Number(match[2]) : 0;
      const meridiem = match[3];
      if (hours === 12) hours = 0;
      if (meridiem === "pm") hours += 12;
      return hours * 60 + minutes;
    };

    const uniqueMinutes = Array.from(
      new Set(explicitTimes.map(toMinutes).filter((value): value is number => value != null))
    ).sort((a, b) => a - b);

    if (uniqueMinutes.length >= 2) {
      let minGap = 24 * 60;
      for (let i = 0; i < uniqueMinutes.length; i++) {
        const curr = uniqueMinutes[i];
        const next = uniqueMinutes[(i + 1) % uniqueMinutes.length];
        const gap = (i === uniqueMinutes.length - 1)
          ? 24 * 60 - curr + next
          : next - curr;
        if (gap > 0 && gap < minGap) minGap = gap;
      }
      if (minGap > 0 && minGap <= 24 * 60) {
        candidates.push(Math.round(minGap / 60));
      }
    }
  }

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
  if (code === "-" || code === "--" || code === "BLANK" || code === "EMPTY" || code === "NONE" || code === "NULL" || code === "NIL") return "BLANK";
  if (code === "F" || code === "FA" || code === "FAMILY" || code === "FAM" || code === "F/A") return "F";
  if (code === "S/A" || code === "S-A") return "SA";
  if (code === "M/U") return "MU";
  if (code === "N/H") return "NH";
  if (code === "A/D") return "AD";
  if (code === "A/S") return "AS";
  if (code === "PRNAD" || code === "PRN-AD") return "PRN-AD";
  if (code === "PRNAS" || code === "PRN-AS") return "PRN-AS";
  if (code === "PRNR" || code === "PRN-R" || code === "PRNREFUSED" || code === "PRNREFUS" || code === "PRNREF" || code === "PRNRF") return "PRN-R";
  if (code === "REFUSED" || code === "REFUSE" || code === "REF") return "R";
  if (code === "SELADMIN" || code === "SELFADMIN" || code === "SA") return "SA";
  if (code === "MEDUNAV" || code === "MEDUNAVAILABLE" || code === "UNAVAILABLE" || code === "MU") return "MU";
  if (code === "NOTHOME" || code === "NH") return "NH";
  if (code === "NA") return "N/A";
  return code;
};

const TIME_RANGE_PATTERN = /\b(?:\d{1,2}[:.][0-5]\d|\d{1,2}\s*(?:am|pm)|(?:[01]?\d|2[0-3])[0-5]\d)\s*[-–]\s*(?:\d{1,2}[:.][0-5]\d|\d{1,2}\s*(?:am|pm)|(?:[01]?\d|2[0-3])[0-5]\d)\b/gi;
const SINGLE_TIME_PATTERN = /\b(?:\d{1,2}[:.][0-5]\d(?:\s*(?:am|pm))?|(?:[01]?\d|2[0-3])[0-5]\d)\b/i;
const CODE_TOKEN_PATTERN = /\b(PRN\s*[-–]?\s*AD|PRNAD|PRN\s*[-–]?\s*AS|PRNAS|PRN\s*[-–]?\s*R|PRNR|PRNREFUSED|PRNREFUS|PRNREF|PRNRF|MISSED|N\/?A|AD|AS|P|R|MU|NH|SA|FA|F|S\s*\/\s*A|S\s*[-–]\s*A|F\s*\/\s*A|M\s*\/\s*U|N\s*\/\s*H|A\s*\/\s*D|A\s*\/\s*S|REFUSED|REFUSE|MED(?:ICATION)?\s*UNAVAILABLE|NOT\s*HOME)\b/i;

const normalizeCodeTextForScan = (value: unknown): string => {
  const text = String(value || "");
  if (!text.trim()) return "";
  return text
    .toUpperCase()
    .replace(/[(){}[\]]/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\bP\s*R\s*N\s*[-–]?\s*A\s*D\b/g, "PRN-AD")
    .replace(/\bP\s*R\s*N\s*[-–]?\s*A\s*S\b/g, "PRN-AS")
    .replace(/\bP\s*R\s*N\s*[-–]?\s*R\b/g, "PRN-R")
    .replace(/\bP\s*R\s*N\b/g, "PRN")
    .replace(/\bS\s*[-–\/]?\s*A\b/g, "SA")
    .replace(/\bF\s*[-–\/]?\s*A\b/g, "F")
    .replace(/\bM\s*\/\s*U\b/g, "MU")
    .replace(/\bN\s*\/\s*H\b/g, "NH")
    .replace(/\bA\s*\/\s*D\b/g, "AD")
    .replace(/\bA\s*\/\s*S\b/g, "AS");
};

const extractCodeFromContent = (value: unknown): string => {
  const normalizedText = normalizeCodeTextForScan(value);
  if (!normalizedText) return "";
  const match = normalizedText.match(CODE_TOKEN_PATTERN);
  if (!match) return "";
  return normalizeCode(match[1]);
};

const extractTimeFromContent = (value: unknown): string => {
  const text = String(value || "");
  if (!text.trim()) return "";
  const withoutRanges = text.replace(TIME_RANGE_PATTERN, " ");
  const match = withoutRanges.match(SINGLE_TIME_PATTERN);
  return match ? match[0].trim() : "";
};

const normalizeMedicationCodeForType = (code: string, isPrn: boolean, hasTime: boolean): string => {
  const normalized = normalizeCode(code);
  if (!normalized || normalized === "BLANK" || normalized === "N/A") return normalized;
  if (!isPrn) return normalized;

  if (normalized === "R") return "PRN-R";
  if (normalized === "AD") return hasTime ? "PRN-AD" : "PRN-R";
  if (normalized === "AS") return hasTime ? "PRN-AS" : "PRN-R";
  if (normalized === "P") return hasTime ? "PRN" : "PRN-R";
  if (normalized === "PRN" && !hasTime) return "PRN-R";
  return normalized;
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
  F: 70,
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
    "F": 75,
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
      // Normalize codes so FA/F/F/A all count as the same key and priority lookup works.
      const vKey = normalizeCode(String(v.code || "BLANK"));
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

    // Pick the best example of this code from the variants (normalize before comparing)
    const bestVariant = variants
      .filter((v) => normalizeCode(String(v.code || "")) === winnerCode)
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
Return a structured JSON output reflecting the document's records exactly as required by the schema.

CRITICAL RULES:
1. serviceUserInitials: Convert "Freda O'Neill" -> "F.O.". Two-part names get two initials with dots. Ensure initials are followed by dots.
2. medications: Be exhaustive. Scan EVERY page. Include strength (e.g., 500mg) and form (e.g., Tablets). Do NOT merge separate medications even if similar.
3. isPRN: True ONLY if instructions explicitly mention "PRN", "as required", "when needed", "if needed", "up to X times", or "when necessary". Regular scheduled medications are NOT PRN.
4. instructions: Capture EVERYTHING in the medication label area verbatim, including route (e.g., "Route Oral", "Apply thin layer"), frequency, and any special instructions.
5. scheduledTimeSlots: For each medication, identify ONLY time slots where a grid cell/box exists for administration. Omit time slots not applicable to that medication.
6. dates: Extract ALL dates that appear as column headers in the grid. Format them EXACTLY as they appear (e.g., "Sun, 30 Nov"). Do not add or omit any.
7. requiredGapHours: Minimum hours between doses (used to detect time-gap violations for PRN/repeat doses) — "four times daily" → 4, "three times daily" → 6, "twice daily" → 8, "once daily" → 12, "PRN max 4-hourly" → 4. Default 4 when unclear.
8. allergies: Extract the full allergy/adverse reaction text. Use "NKDA" or "None known" if stated, or empty string if not mentioned.`;

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

Respond with STRICT JSON data adhering to the schema.

EXTRACTION RULES:
1. MAP TO GRID: Each entry must correspond to a specific (medication, date, timeSlot) intersection in the grid.
2. NON-ADMINISTRATION CODES ARE VITAL: You MUST capture R (Refused), MU (Medication Unavailable), NH (Not Home), SA (Self Admin), F (Family Admin). Missing these causes compliance failures.
3. BLANK CELLS: If a cell is blank and it's a scheduled dose (non-PRN medication with that time slot in its scheduledTimeSlots), it's a MISSING entry. Use "MISSED" as code. Do NOT skip blank scheduled cells.
4. PRN DOSES: For PRN medications, only include entries if there is a visible code, time, or signature. A completely empty PRN cell is NOT an entry.
5. TIME: Only set "hasTime" true and provide "time" if an actual administration time (e.g., 08:45) is handwritten or typed in the cell, distinct from the time-slot header.
6. INITIALS: Capture the 2 or 3 letter care worker initials from the cell exactly as written. Leave empty string "" if absent.
7. AMBIGUITY: If a code or signature exists but the time slot is unclear, assign the most probable slot. Use timeSlot "UNSPECIFIED" only when truly impossible to determine.
8. CODE LEGEND: AD=Administered, AS=Assisted Self-Admin, R=Refused, MU=Medication Unavailable, NH=Not Home, SA=Self Admin, F=Family Admin, P=Prompted, PRN=PRN Administered, PRN-AD=PRN Administered, PRN-AS=PRN Assisted, PRN-R=PRN Refused, MISSED=Scheduled dose not recorded.
9. DATE FORMAT: Use dates EXACTLY as they appear in the DATES list above. Do not reformat, shorten, or invent dates.
10. COMPLETENESS: For SCHEDULED medications, generate one entry per (medication × date × timeSlot) for every slot in its scheduledTimeSlots — including blank cells (use "MISSED"). For PRN medications, only include entries where administration occurred (see Rule 4). Omitting scheduled entries causes missed-dose detection to fail.`;

const metadataSchema = {
  name: "EMARMetadata",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["serviceUserInitials", "allergies", "medications", "dates", "timeSlots"],
    properties: {
      serviceUserInitials: { type: "string" },
      allergies: { type: "string" },
      medications: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "genericName", "isPRN", "instructions", "requiredGapHours", "scheduledTimeSlots"],
          properties: {
            name: { type: "string" },
            genericName: { type: "string" },
            isPRN: { type: "boolean" },
            instructions: { type: "string" },
            requiredGapHours: { type: "number" },
            scheduledTimeSlots: {
              type: "array",
              items: { type: "string" }
            }
          }
        }
      },
      dates: {
        type: "array",
        items: { type: "string" }
      },
      timeSlots: {
        type: "array",
        items: { type: "string" }
      }
    }
  }
};

const entriesSchema = {
  name: "EMAREntries",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["entries"],
    properties: {
      entries: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["medicationId", "date", "timeSlot", "code", "careWorkerInitials", "time", "hasTime", "isOfficeClosed", "closedByStaff", "closedTime"],
          properties: {
            medicationId: { type: "number" },
            date: { type: "string" },
            timeSlot: { type: "string" },
            code: { type: "string" },
            careWorkerInitials: { type: "string" },
            time: { type: "string" },
            hasTime: { type: "boolean" },
            isOfficeClosed: { type: "boolean" },
            closedByStaff: { type: "string" },
            closedTime: { type: "string" }
          }
        }
      }
    }
  }
};

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
        const code = nonBlankCode((cell as any)?.code) || nonBlankCode(extractCodeFromContent((cell as any)?.content));
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
          
          // VALIDATION: Filter out low-quality medication names
          // Reject names ending with invalid trailing characters (dash, slash, etc.)
          if (/[-\/\\:;,]$/.test(name)) {
            return null;
          }
          
          // Reject pure dose patterns with optional trailing punctuation (e.g., "10mg -", "500mcg/")
          if (/^\d+(?:\.\d+)?\s*(?:mg|mcg|ml|g|iu|units?|%)\s*[-\/\\]?$/i.test(name)) {
            return null;
          }
          
          // Reject names with no meaningful alphabetic tokens (3+ chars)
          const tokens = name.split(/\s+/).filter(Boolean);
          const hasMeaningfulToken = tokens.some((token) => {
            const normalized = token.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
            return normalized.length >= 3 && /[a-zA-Z]/.test(normalized);
          });
          if (!hasMeaningfulToken) {
            return null;
          }
          
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
          const careWorkerInitials = normalizeInitials((cell as any)?.careWorker || (cell as any)?.careWorkerInitials);
          const time = String((cell as any)?.time || "").trim() || extractTimeFromContent((cell as any)?.content);
          const hasTime = computeHasTime({ time });

          let code = nonBlankCode((cell as any)?.code) || nonBlankCode(extractCodeFromContent((cell as any)?.content));

          const hasInitials = Boolean(careWorkerInitials);

          // Infer missing codes when we still have evidence of an administration (time/initials)
          if (!code && (hasTime || hasInitials)) {
            code = isPrn ? "PRN" : "AD";
          }

          code = normalizeMedicationCodeForType(code, isPrn, hasTime);

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
      const response = await executeSecureTextCompletion({
        endpoint: "/api/admin/emar-audit/agent",
        feature: `emar_agent_metadata_pass${passIndex + 1}`,
        model: getAgentModel(),
        userContext: aiUserContext,
        systemPrompt: metadataPrompt,
        inputText: `Extract metadata from this EMAR document:\n\n${rawText}`,
        temperature: passIndex === 0 ? 0 : 0.1,
        maxCompletionTokens: 2000,
        seed: passIndex === 0 ? DETERMINISTIC_SEED : undefined,
        responseFormat: { type: "json_schema", json_schema: metadataSchema },
        useCache: false,
      });
      const content = response.restoredText || "{}";
      return parseJsonFromContent(content) || {};
    };

    console.log("[EMAR Agent] Running 2-pass metadata extraction...");
    const [meta1, meta2] = await Promise.all([runMetadataPass(0), runMetadataPass(1)]);

    const metadataParsed = {
      serviceUserInitials: meta1.serviceUserInitials || meta2.serviceUserInitials || "",
      allergies: meta1.allergies || meta2.allergies || "",
      medications: [...(meta1.medications || []), ...(meta2.medications || [])],
      dates: uniqueStrings([...(meta1.dates || []), ...(meta2.dates || [])]),
      timeSlots: uniqueStrings([...(meta1.timeSlots || []), ...(meta2.timeSlots || [])]),
    };

    const serviceUserInitialsRaw = String(
      metadataParsed.serviceUserInitials || meta1.serviceUserName || meta2.serviceUserName || ""
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

          const response = await executeSecureTextCompletion({
            endpoint: "/api/admin/emar-audit/agent",
            feature: `emar_agent_entries_pass${passIndex + 1}`,
            model: getAgentModel(),
            userContext: aiUserContext,
            systemPrompt: prompt,
            inputText: `Extract entries from this EMAR document:\n\n${rawText}`,
            temperature: passIndex === 0 ? 0 : 0.1,
            maxCompletionTokens: 8000,
            seed: passIndex === 0 ? DETERMINISTIC_SEED : undefined,
            responseFormat: { type: "json_schema", json_schema: entriesSchema },
            useCache: false,
          });

          const content = response.restoredText || "{\"entries\":[]}";
          const parsed = parseJsonFromContent(content) || { entries: [] };
          return Array.isArray(parsed.entries) ? parsed.entries : [];
        })
      );
      return results.flat();
    };

    console.log(`[EMAR Agent] Running 3-pass extraction for ${medicationsWithIds.length} medications...`);
    const [pass1Entries, pass2Entries, pass3Entries] = await Promise.all([
      runPass(0),
      runPass(1),
      runPass(2),
    ]);

    const validMedicationIds = new Set(medicationsWithIds.map((med) => med.medicationId));
    const medIdsByKey = new Map<string, number[]>();
    const knownDateByKey = new Map<string, string>();
    for (const med of medicationsWithIds) {
      const key = normalizeMedicationKey(med.name);
      if (!key) continue;
      const existing = medIdsByKey.get(key) || [];
      existing.push(med.medicationId);
      medIdsByKey.set(key, existing);
    }
    for (const date of mergedMetadata.dates) {
      const normalized = normalizeDate(date);
      if (!normalized) continue;
      knownDateByKey.set(normalizeKeyString(normalized), normalized);
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
      const rawDate = normalizeDate(entry?.date);
      const date = knownDateByKey.get(normalizeKeyString(rawDate)) || rawDate;
      const time = String(entry?.time || "").trim() || extractTimeFromContent(entry?.content || entry?.cellContent);
      let timeSlot = resolveTimeSlot(entry?.timeSlot, time, mergedMetadata.timeSlots);
      let code = normalizeCode(entry?.code) || normalizeCode(extractCodeFromContent(entry?.content || entry?.cellContent));
      const careWorkerInitials = normalizeInitials(entry?.careWorkerInitials || entry?.careWorker);
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
      code = normalizeMedicationCodeForType(code, isPrn, hasTime);
      if (!date || !code) return null;
      if (code === "N/A" || code === "BLANK") return null;

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

    // Compute consensus agreement rate for diagnostics
    const passEntryCounts = [rawPass1.length, rawPass2.length, rawPass3.length];
    const avgPassEntries = passEntryCounts.reduce((s, n) => s + n, 0) / 3;
    const maxDeviation = Math.max(...passEntryCounts.map(n => Math.abs(n - avgPassEntries)));
    const agreementRate = avgPassEntries > 0 ? ((1 - maxDeviation / avgPassEntries) * 100).toFixed(0) : "0";
    console.log(`[EMAR Agent] Consensus: ${entries.length} entries from passes [${passEntryCounts.join(", ")}], agreement: ${agreementRate}%`);

    return {
      entries,
      metadata: {
        ...mergedMetadata,
        medications: medicationsWithIds,
      },
      consensusStatus: `triple_pass_consensus (${agreementRate}% agreement)`,
      validationPassed: entries.length > 0,
      model: getAgentModel(),
    };
  }
};
