import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const getStandardFontDataUrl = () => {
  const fontsPath = path.resolve(process.cwd(), 'node_modules', 'pdfjs-dist', 'standard_fonts');
  return pathToFileURL(fontsPath + path.sep).toString();
};

const EMAR_GRID_DEBUG_FLAG = (process.env.EMAR_GRID_DEBUG || "").toLowerCase();
const EMAR_GRID_DEBUG_ENABLED =
  EMAR_GRID_DEBUG_FLAG === "1" ||
  EMAR_GRID_DEBUG_FLAG === "true" ||
  EMAR_GRID_DEBUG_FLAG === "yes" ||
  EMAR_GRID_DEBUG_FLAG === "on";

const debugLog = (...args: unknown[]) => {
  if (EMAR_GRID_DEBUG_ENABLED) console.log(...args);
};

const MEDICATION_NAME_STOP_WORDS = new Set([
  "tablet",
  "tablets",
  "tab",
  "tabs",
  "capsule",
  "capsules",
  "cap",
  "caps",
  "patch",
  "patches",
  "cream",
  "ointment",
  "gel",
  "lotion",
  "spray",
  "drops",
  "drop",
  "solution",
  "syrup",
  "suspension",
  "inhaler",
  "injection",
  "ampoule",
  "ampoules",
  "nebule",
  "nebules",
  "puff",
  "puffs",
  "sachet",
  "sachets",
  "powder",
  "granules",
  "suppository",
  "suppositories",
]);

const MEDICATION_NAME_INSTRUCTION_WORDS = new Set([
  "take",
  "apply",
  "administer",
  "give",
  "to",
  "be",
  "with",
  "without",
  "this",
  "that",
  "the",
  "and",
  "or",
  "if",
  "then",
  "per",
  "via",
  "by",
  "insert",
  "inhale",
  "use",
  "dissolve",
  "mix",
  "instill",
  "oral",
  "topical",
  "subcutaneous",
  "intravenous",
  "iv",
  "im",
  "pr",
  "sc",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "once",
  "twice",
  "thrice",
  "half",
  "quarter",
  "every",
  "hourly",
  "hours",
  "daily",
  "weekly",
  "monthly",
  "morning",
  "noon",
  "midday",
  "afternoon",
  "evening",
  "night",
  "bedtime",
  "taken",
  "before",
  "after",
  "food",
  "breakfast",
  "lunch",
  "dinner",
  "meal",
  "meals",
  "water",
  "when",
  "required",
  "needed",
  "prn",
  "upto",
  "up",
  "max",
  "maximum",
  "times",
  "per",
  "dose",
  "doses",
  // Time-based instruction words (to prevent "tea time", "beds time" false positives)
  "tea",
  "time",
  "beds",
  "bed",
  "supper",
  "at",
  "and",
  "then",
  // Incomplete medication parts (often appear on split rows)
  "sulfate",
  "sulphate",
  "hydrochloride",
  "maleate",
  "succinate",
  "phosphate",
  "chloride",
  "citrate",
  "fumarate",
  "tartrate",
]);

const splitMedicationLabel = (label: string): { name: string; instructions: string } => {
  const cleaned = String(label || "")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return { name: "", instructions: "" };

  // EARLY CHECK: Pure dose pattern with trailing punctuation (e.g., "10mg -", "500mcg /", "20mg - ")
  const pureDoselRegex = /^\d+(?:\.\d+)?\s*(?:mg|mcg|ml|g|iu|units?|%)\s*[-\/\\:;,\s]+$/i;
  if (pureDoselRegex.test(cleaned)) {
    return { name: "", instructions: cleaned };
  }

  const tokens = cleaned.split(" ").filter(Boolean);
  const firstToken = tokens[0]?.toLowerCase() || "";
  if (MEDICATION_NAME_STOP_WORDS.has(firstToken) || MEDICATION_NAME_INSTRUCTION_WORDS.has(firstToken)) {
    return { name: "", instructions: cleaned };
  }

  const strengthPattern = /^\d+(?:\.\d+)?(?:mg|mcg|g|ml|iu|units?|%)$/i;
  const strengthRatioPattern = /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?(?:mg|mcg|g|ml|iu|units?)$/i;
  const quantityPattern = /^(?:\d+\s*[x×]|\d+[x×]|x\d+)$/i;
  const rangePattern = /^\d{1,2}\s*[-–]\s*\d{1,2}$/;

  const nameTokens: string[] = [];
  let stopIndex = tokens.length;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const lower = token.toLowerCase();
    const prevLower = i > 0 ? tokens[i - 1].toLowerCase() : "";
    const nextLower = i + 1 < tokens.length ? tokens[i + 1].toLowerCase() : "";

    const isLetterDigitToken = /^[a-z]+[0-9]+[a-z0-9]*$/i.test(token);
    const isDigitsOnlyToken = /^\d+$/.test(token);
    const startsWithDigit = /^\d/.test(token);

    if (quantityPattern.test(token)) {
      continue;
    }

    // Allow "Omega 3" style names.
    if (isDigitsOnlyToken && (prevLower === "omega" || prevLower === "vitamin")) {
      nameTokens.push(token);
      continue;
    }

    // Allow letter+digit tokens like "D3", "B12".
    if (isLetterDigitToken) {
      nameTokens.push(token);
      continue;
    }

    if (startsWithDigit) {
      const compact = token.replace(/[()]/g, "").trim();
      if (strengthPattern.test(compact) || strengthRatioPattern.test(compact)) {
        nameTokens.push(token);
        continue;
      }
      if (rangePattern.test(token)) {
        stopIndex = i;
        break;
      }
      // Skip leading numeric prefixes like "0.9%" in "0.9% Sodium Chloride".
      if (nameTokens.length === 0) {
        continue;
      }
      stopIndex = i;
      break;
    }
    if (lower === "to" && ["be", "taken", "take", "administered"].includes(nextLower)) {
      stopIndex = i;
      break;
    }
    if (lower === "route") {
      stopIndex = i;
      break;
    }
    if (MEDICATION_NAME_INSTRUCTION_WORDS.has(lower)) {
      stopIndex = i;
      break;
    }
    if (MEDICATION_NAME_STOP_WORDS.has(lower)) {
      nameTokens.push(token);
      continue;
    }

    nameTokens.push(token);
  }

  const name = nameTokens.join(" ").trim();
  const instructions = stopIndex < tokens.length ? tokens.slice(stopIndex).join(" ").trim() : "";

  const isDoseToken = (token: string): boolean => {
    const compact = token.replace(/[()]/g, "").trim();
    if (!compact) return false;
    if (strengthPattern.test(compact) || strengthRatioPattern.test(compact)) return true;
    if (quantityPattern.test(compact) || rangePattern.test(compact)) return true;
    if (/^\d+(?:\.\d+)?$/.test(compact)) return true;
    if (/^\d/.test(compact) && /(?:mg|mcg|g|ml|iu|units?|%)$/i.test(compact)) return true;
    // NEW: Also check for incomplete dose patterns with trailing punctuation
    if (/^\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|units?|%)\s*[-\/\\]?$/i.test(compact)) return true;
    return false;
  };

  if (!name) return { name: "", instructions: cleaned };
  
  // REJECT if name ends with invalid trailing characters (dash, slash, colon, etc.)
  if (/[-\/\\:;,]$/.test(name)) {
    return { name: "", instructions: cleaned };
  }

  // REJECT if name is just a dose with optional trailing punctuation (e.g., "10mg -", "500mcg/")
  const isDoseOnlyWithTrailing = /^\d+(?:\.\d+)?\s*(?:mg|mcg|ml|g|iu|units?|%)\s*[-\/\\]?$/i.test(name);
  if (isDoseOnlyWithTrailing) {
    return { name: "", instructions: cleaned };
  }

  const nameTokensNormalized = name.split(/\s+/).filter(Boolean);
  const nameLooksDoseOnly = nameTokensNormalized.length > 0 && nameTokensNormalized.every(isDoseToken);
  if (nameLooksDoseOnly) {
    return { name: "", instructions: cleaned };
  }
  return { name, instructions: instructions || cleaned };
};

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

export interface GridCell {
  medication: string;
  medicationRow?: number;
  medicationId?: number;
  date: string;
  timeSlot: string;
  content: string;
  code: string;
  careWorker: string;
  time: string;
  keyMismatch?: boolean;
  detectedCode?: string;
}

export interface ParsedEMAR {
  serviceUserName: string;
  allergies: string;
  auditPeriodStart: string;
  auditPeriodEnd: string;
  pageCount: number;
  pageCharCounts: number[];
  pageTexts: string[];
  dates: string[];
  timeSlots: string[];
  medications: Array<{
    name: string;
    row: number;
    instructions: string;
    timeSlots: string[];
  }>;
  cells: GridCell[];
  rawText: string;
  debugInfo: {
    totalTextItems: number;
    dateColumnsFound: number;
    medicationsFound: number;
    timeSlotsFound: number;
    cellsGenerated: number;
    keyCodesFound?: number;
    confidenceScore?: number;
    validationWarnings?: string[];
    passLabel?: string;
  };
}

interface ParseOptions {
  yTolerance?: number;
  textRowTolerance?: number;
  minDatesForHeader?: number;
  maxHeaderScanRows?: number;
  headerSpreadMin?: number;
  leftCutoffRatio?: number;
  leftCutoffMin?: number;
  passLabel?: string;
}

const DATE_PATTERNS = [
  // Day name + day + month (e.g., "Sun, 30 Nov", "Mon 01 Dec")
  /\b(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)[,.]?\s*\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/gi,
  // Day name + numeric date (e.g., "Mon 01/12", "Tue 1-12-2024")
  /\b(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)[,.]?\s*\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?\b/gi,
  // Day + month (e.g., "30 Nov", "01 December")
  /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/gi,
  /\d{1,2}\/\d{1,2}\/\d{2,4}/g,
  /\d{1,2}\/\d{1,2}/g,
  // Strict numeric dates with separators. Guard against false positives inside time ranges like "08:00-09:00"
  // Require a year for hyphen/dot formats to avoid misclassifying dose frequencies like "4-6 hourly".
  /(?<!:)\b(?:0?[1-9]|[12][0-9]|3[01])-(?:0?[1-9]|1[0-2])-(?:\d{2,4})\b(?!:)/g,
  /(?<!:)\b(?:0?[1-9]|[12][0-9]|3[01])\.(?:0?[1-9]|1[0-2])\.(?:\d{2,4})\b(?!:)/g,
];
const TIME_RANGE_PATTERN = /\b\d{1,2}[:.][0-5]\d\s*[-–]\s*\d{1,2}[:.][0-5]\d\b/g;
const TIME_RANGE_COMPACT_PATTERN = /\b(?:[01]?\d|2[0-3])[0-5]\d\s*[-–]\s*(?:[01]?\d|2[0-3])[0-5]\d\b/g;
const TIME_RANGE_AMPM_PATTERN = /\b\d{1,2}(?:[:.][0-5]\d)?\s*(?:am|pm)\s*[-–]\s*\d{1,2}(?:[:.][0-5]\d)?\s*(?:am|pm)\b/gi;
const TIME_RANGE_ANY_PATTERN = new RegExp(
  `${TIME_RANGE_PATTERN.source}|${TIME_RANGE_COMPACT_PATTERN.source}|${TIME_RANGE_AMPM_PATTERN.source}`,
  "gi"
);
const TIME_SLOT_PATTERN = TIME_RANGE_ANY_PATTERN;
const TIME_TOKEN_PATTERN = /\b\d{1,2}[:.][0-5]\d\b/g;
const TIME_COMPACT_PATTERN = /\b(?:[01]?\d|2[0-3])[0-5]\d\b/g;
const TIME_AMPM_PATTERN = /\b\d{1,2}(?:[:.][0-5]\d)?\s*(?:am|pm)\b/gi;
const TIME_ANY_PATTERN = /\b(?:\d{1,2}[:.][0-5]\d\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm)|(?:[01]?\d|2[0-3])[0-5]\d)\b/gi;
const TIME_WORD_PATTERN = /\b(morning|noon|midday|lunch|afternoon|evening|night|bed(?:time)?|tea|breakfast|am|pm)\b/i;
const CODE_PATTERN = /\b(AD|AS|P|R|MU|NH|SA|FA|F|F\s*\/\s*A|S\s*\/\s*A|S\s*[-–]\s*A|PRN\s*[-–]?\s*R|PRN\s*[-–]?\s*AD|PRN\s*[-–]?\s*AS|PRN|MISSED|N\/?A)\b/gi;
const CODE_PATTERN_SINGLE = /\b(AD|AS|P|R|MU|NH|SA|FA|F|F\s*\/\s*A|S\s*\/\s*A|S\s*[-–]\s*A|PRN\s*[-–]?\s*R|PRN\s*[-–]?\s*AD|PRN\s*[-–]?\s*AS|PRN|MISSED|N\/?A)\b/i;
const TIME_PATTERN = /\d{1,2}[:.][0-5]\d/g;
const INITIALS_PATTERN = /\b[A-Z]{2,3}\b/g;
const INITIALS_WITH_DOTS_PATTERN = /\b(?:[A-Z]\.){2,3}\b/g;
const CODE_INITIALS = new Set(["AD", "AS", "MU", "NH", "SA", "FA", "F", "PRN", "NA"]);
const CODE_PRIORITY: Record<string, number> = {
  "PRN-R": 100,
  "R": 100,
  "MISSED": 95,
  "MU": 90,
  "NH": 90,
  "SA": 88,
  "FA": 88,
  "PRN-AD": 82,
  "PRN-AS": 82,
  "PRN": 80,
  "AD": 65,
  "AS": 65,
  "P": 60,
  "N/A": 10,
  "BLANK": 0,
};

const pad2 = (value: number): string => String(value).padStart(2, "0");

const parseTimeToken = (value: string): { hour: number; minute: number } | null => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;

  const ampmMatch = raw.match(/(am|pm)\b/);
  const ampm = ampmMatch ? ampmMatch[1] : "";

  const cleaned = raw
    .replace(/(am|pm)\b/g, "")
    .replace(/[()]/g, "")
    .replace(/\s+/g, "");

  if (!cleaned && !ampm) return null;

  let hour: number | null = null;
  let minute: number | null = null;

  if (cleaned.includes(":") || cleaned.includes(".")) {
    const parts = cleaned.split(/[:.]/).filter(Boolean);
    if (parts.length >= 2) {
      hour = Number(parts[0]);
      minute = Number(parts[1]);
    }
  } else if (/^\d{3,4}$/.test(cleaned)) {
    if (cleaned.length === 3) {
      hour = Number(cleaned.slice(0, 1));
      minute = Number(cleaned.slice(1));
    } else {
      hour = Number(cleaned.slice(0, 2));
      minute = Number(cleaned.slice(2));
    }
  } else if (/^\d{1,2}$/.test(cleaned) && ampm) {
    hour = Number(cleaned);
    minute = 0;
  }

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour === null || minute === null) return null;
  if (minute < 0 || minute > 59) return null;

  if (ampm) {
    if (hour < 0 || hour > 12) return null;
    if (hour === 12) {
      hour = ampm === "am" ? 0 : 12;
    } else if (ampm === "pm") {
      hour += 12;
    }
  }

  if (hour < 0 || hour > 23) return null;
  return { hour, minute };
};

const normalizeTimeToken = (value: string): string => {
  const parsed = parseTimeToken(value);
  if (!parsed) return "";
  return `${pad2(parsed.hour)}:${pad2(parsed.minute)}`;
};

const normalizeTimeRange = (value: string): string => {
  const cleaned = String(value || "")
    .replace(/[–—]/g, "-")
    .replace(/\b(?:hrs?|hours?)\b/gi, "")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned.includes("-")) return "";
  const parts = cleaned.split("-").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return "";

  const startRaw = parts[0];
  const endRaw = parts[1];
  let start = normalizeTimeToken(startRaw);
  let end = normalizeTimeToken(endRaw);
  if (!start || !end) {
    const startAmpm = startRaw.match(/\b(am|pm)\b/i)?.[1];
    const endAmpm = endRaw.match(/\b(am|pm)\b/i)?.[1];
    const inferredAmpm = startAmpm || endAmpm || "";
    if (inferredAmpm) {
      if (!start) start = normalizeTimeToken(`${startRaw}${inferredAmpm}`);
      if (!end) end = normalizeTimeToken(`${endRaw}${inferredAmpm}`);
    }
  }
  if (!start || !end) return "";
  return `${start}-${end}`;
};

const stripTimeRangesFromText = (text: string): string => {
  if (!text) return "";
  const rangeRegex = new RegExp(TIME_RANGE_ANY_PATTERN.source, "gi");
  return text.replace(rangeRegex, " ").replace(/\s+/g, " ").trim();
};

const extractFirstTimeToken = (text: string): string => {
  if (!text) return "";
  const cleaned = stripTimeRangesFromText(text);
  if (!cleaned) return "";
  const timeRegex = new RegExp(TIME_ANY_PATTERN.source, "gi");
  const matches = cleaned.match(timeRegex);
  if (!matches) return "";
  for (const match of matches) {
    const normalized = normalizeTimeToken(match);
    if (normalized) return normalized;
  }
  return "";
};

const normalizeCodeText = (value: string): string => {
  if (!value) return "";
  return value
    .toUpperCase()
    .replace(/\bP\s*R\s*N\s*[-–]?\s*R\b/g, "PRN-R")
    .replace(/\bP\s*R\s*N\s*[-–]?\s*A\s*D\b/g, "PRN-AD")
    .replace(/\bP\s*R\s*N\s*[-–]?\s*A\s*S\b/g, "PRN-AS")
    .replace(/\bP\s*R\s*N\b/g, "PRN")
    .replace(/\bS\s*[-–\/]?\s*A\b/g, "SA")
    .replace(/\bF\s*[-–\/]?\s*A\b/g, "FA")
    .replace(/\bN\s*\/\s*H\b/g, "NH")
    .replace(/\bM\s*\/\s*U\b/g, "MU")
    .replace(/\bA\s*\/\s*D\b/g, "AD")
    .replace(/\bA\s*\/\s*S\b/g, "AS")
    .replace(/\bN\s*H\b/g, "NH")
    .replace(/\bM\s*U\b/g, "MU")
    .replace(/\bA\s*D\b/g, "AD")
    .replace(/\bA\s*S\b/g, "AS")
    .replace(/\bF\b/g, "FA");
};

const expandKeyCodes = (codes: Set<string>): Set<string> => {
  const expanded = new Set<string>();
  codes.forEach((code) => expanded.add(code));
  if (codes.has("PRN")) {
    expanded.add("PRN-R");
    expanded.add("PRN-AD");
    expanded.add("PRN-AS");
  }
  return expanded;
};

const extractKeyCodes = (text: string): Set<string> => {
  const found = new Set<string>();
  if (!text) return found;
  const keyRegex = /\bKEY\b[:\s-]*/gi;
  const keyPositions: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = keyRegex.exec(text)) !== null) {
    keyPositions.push(match.index);
    if (keyPositions.length >= 3) break;
  }
  if (keyPositions.length === 0) return found;

  for (const pos of keyPositions) {
    const slice = text.slice(pos, pos + 900);
    const codeRegex = new RegExp(CODE_PATTERN.source, "gi");
    for (const codeMatch of slice.matchAll(codeRegex)) {
      const normalized = normalizeGridCode(codeMatch[1]);
      if (normalized) found.add(normalized);
    }
  }
  return found;
};

const extractCareWorkerInitials = (content: string): string => {
  if (!content) return "";
  const normalizeToken = (value: string) => value.replace(/\./g, "").toUpperCase();
  const dottedMatches = (content.match(INITIALS_WITH_DOTS_PATTERN) || []).map(normalizeToken);
  const plainMatches = (content.match(INITIALS_PATTERN) || []).map(normalizeToken);
  const seen = new Set<string>();
  for (const token of [...dottedMatches, ...plainMatches]) {
    if (!token || seen.has(token)) continue;
    seen.add(token);
    if (!CODE_INITIALS.has(token)) return token;
  }
  return "";
};

const normalizeGridCode = (raw: string): string => {
  const normalized = raw
    .toUpperCase()
    .trim()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, "");

  if (normalized === "N/A" || normalized === "NA") return "N/A";
  if (normalized === "F/A" || normalized === "FA" || normalized === "F") return "FA";
  if (normalized === "S/A" || normalized === "S-A" || normalized === "SA") return "SA";
  if (normalized === "M/U" || normalized === "MU" || normalized === "M-U") return "MU";
  if (normalized === "N/H" || normalized === "NH" || normalized === "N-H") return "NH";
  if (normalized === "A/D" || normalized === "AD" || normalized === "A-D") return "AD";
  if (normalized === "A/S" || normalized === "AS" || normalized === "A-S") return "AS";
  if (normalized === "PRNR" || normalized === "PRN-R" || normalized === "PRN/R" || normalized === "PRN.R") return "PRN-R";
  if (normalized === "PRNAD" || normalized === "PRN-AD" || normalized === "PRN/AD" || normalized === "PRN.AD") return "PRN-AD";
  if (normalized === "PRNAS" || normalized === "PRN-AS" || normalized === "PRN/AS" || normalized === "PRN.AS") return "PRN-AS";
  if (normalized === "REFUSED" || normalized === "REFUSE" || normalized === "REF" || normalized === "REFUSAL") return "R";
  if (normalized === "GIVEN" || normalized === "GIV") return "AD";
  if (normalized === "NOTHOME" || normalized === "NOTATHOME") return "NH";
  if (normalized === "SELADMIN" || normalized === "SELFADMIN" || normalized === "SELF-ADMIN") return "SA";
  if (normalized === "MEDUNAV" || normalized === "MEDUNAVAILABLE" || normalized === "UNAVAILABLE" || normalized === "MEDUNAVAIL") return "MU";
  if (normalized === "NOADMIN" || normalized === "NONADMIN" || normalized === "NOTADMIN") return "N/A";
  if (normalized === "P" || normalized === "PROMPT" || normalized === "PROMPTED") return "P";
  if (normalized === "ASSISTED" || normalized === "ASSIST") return "AS";
  if (normalized === "ADMINISTERED" || normalized === "ADMINISTER") return "AD";

  return normalized;
};

const pickBestCode = (codes: string[]): string => {
  let best = "BLANK";
  let bestScore = -1;
  for (const raw of codes) {
    const normalized = normalizeGridCode(raw);
    const score = CODE_PRIORITY[normalized] ?? (normalized ? 50 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = normalized;
    }
  }
  return best;
};

async function parseEMARGridWithOptions(pdfBuffer: Buffer, options: ParseOptions = {}): Promise<ParsedEMAR> {
  const uint8Array = new Uint8Array(pdfBuffer);
  // Server-side parsing: disable worker to avoid PDF.js API/worker version mismatches.
  const loadingTask = pdfjsLib.getDocument({
    data: uint8Array,
    disableWorker: true,
    standardFontDataUrl: getStandardFontDataUrl(),
    useSystemFonts: true,
  } as any);
  const pdf = await loadingTask.promise;
  
  const allTextItems: TextItem[] = [];
  let rawText = "";
  const pageTexts: string[] = [];
  const pageCharCounts: number[] = [];
  
  const pdfjsUtil = (pdfjsLib as any).Util;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });

    for (const item of textContent.items) {
      if ('str' in item && item.str.trim()) {
        const tx = pdfjsUtil.transform(viewport.transform, (item as any).transform);
        const x = tx[4];
        const y = tx[5];

        allTextItems.push({
          str: item.str.trim(),
          x,
          y,
          width: (item as any).width || 0,
          height: (item as any).height || 0,
          page: pageNum
        });
      }
    }
  }
  
  // IMPORTANT: Group by page first. Y coordinates are only meaningful within a page.
  const yTolerance = options.yTolerance ?? 12;
  const itemsByPage = new Map<number, TextItem[]>();
  for (const item of allTextItems) {
    if (!itemsByPage.has(item.page)) itemsByPage.set(item.page, []);
    itemsByPage.get(item.page)!.push(item);
  }

  // Build a more readable text extraction (re-using already-parsed PDF items).
  // This matches the legacy text extractor behavior closely enough for downstream heuristics.
  const textRowTolerance = options.textRowTolerance ?? 2.5;
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const pageItems = itemsByPage.get(pageNum) || [];
    const rows = groupByY(pageItems, textRowTolerance);
    const lines = rows
      .map((row) =>
        row
          .map((segment) => segment.str)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim()
      )
      .filter(Boolean);
    const pageText = lines.join("\n");
    pageTexts.push(pageText);
    pageCharCounts.push(pageText.length);
  }

  rawText = pageTexts.join("\n\n--- PAGE BREAK ---\n\n");

  const rowsByPage = new Map<number, TextItem[][]>();
  for (const [page, items] of Array.from(itemsByPage.entries())) {
    rowsByPage.set(page, groupByY(items, yTolerance));
  }
  
  // Per-page detected headers (each page may cover a different date range)
  const pageHeaders: Array<{
    page: number;
    headerRowIndex: number;
    dateColumns: Array<{ date: string; xStart: number; xEnd: number }>;
  }> = [];

  const allDatesOrdered: string[] = [];
  const dateSeen = new Set<string>();

  const MIN_DATES_FOR_HEADER = options.minDatesForHeader ?? 2; // allow shorter EMARs (e.g., 2-4 days)
  const MAX_HEADER_SCAN_ROWS = options.maxHeaderScanRows ?? 40; // keep search near the top to reduce false positives
  const headerSpreadMin = options.headerSpreadMin ?? 150;

  for (const [page, rows] of Array.from(rowsByPage.entries()).sort((a, b) => a[0] - b[0])) {
    let headerRowIndex = -1;
    let dateColumns: Array<{ date: string; xStart: number; xEnd: number }> = [];

    for (let i = 0; i < Math.min(rows.length, MAX_HEADER_SCAN_ROWS); i++) {
      const row = rows[i];
      const rowText = row.map(item => item.str).join(" ");
      let foundDates: Array<{ date: string; xStart: number; xEnd: number }> = [];

      for (const pattern of DATE_PATTERNS) {
        const matches = Array.from(rowText.matchAll(pattern));
        for (const match of matches) {
          if (!match[0]) continue;

          const dateStr = match[0].trim();
          const matchIndex = match.index || 0;

          let charCount = 0;
          let xStart = row[0]?.x || 0;
          let xEnd = xStart + 50;

          for (let itemIndex = 0; itemIndex < row.length; itemIndex++) {
            const item = row[itemIndex];
            const itemText = item.str;
            const itemEnd = charCount + itemText.length;
            if (charCount <= matchIndex && matchIndex < itemEnd) {
              xStart = item.x - 5;
            }
            if (charCount <= matchIndex + dateStr.length && matchIndex + dateStr.length <= itemEnd) {
              xEnd = item.x + item.width + 5;
            }
            // account for a space between items in rowText
            charCount = itemEnd + 1;
          }

          foundDates.push({ date: dateStr, xStart, xEnd });
        }

        if (foundDates.length >= MIN_DATES_FOR_HEADER) break;
      }

      // De-duplicate by date string and sort by X; guard against repeated matches
      const byDate = new Map<string, { date: string; xStart: number; xEnd: number }>();
      for (const d of foundDates) {
        if (!byDate.has(d.date)) byDate.set(d.date, d);
      }
      foundDates = Array.from(byDate.values()).sort((a, b) => a.xStart - b.xStart);

      // Simple sanity: header-like row should have multiple dates spread across page
      const spread = foundDates.length >= 2 ? (foundDates[foundDates.length - 1].xStart - foundDates[0].xStart) : 0;
      const looksLikeHeader = foundDates.length >= MIN_DATES_FOR_HEADER && spread >= headerSpreadMin;

      if (looksLikeHeader) {
        headerRowIndex = i;
        dateColumns = [];
        for (let j = 0; j < foundDates.length; j++) {
          const current = foundDates[j];
          const next = foundDates[j + 1];
          dateColumns.push({
            date: current.date,
            xStart: current.xStart,
            xEnd: next ? next.xStart - 1 : current.xEnd + 80
          });
        }

        for (const col of dateColumns) {
          if (!dateSeen.has(col.date)) {
            dateSeen.add(col.date);
            allDatesOrdered.push(col.date);
          }
        }

        debugLog(`DEBUG: Found ${dateColumns.length} dates in page ${page} row ${i}:`, dateColumns.map(d => d.date));
        break;
      }
    }

    // FALLBACK: Some PDFs render each date as its own text item (rowText joins won't show multiple dates).
    // In that case, detect date columns by clustering DATE items on similar Y (header line).
    if (headerRowIndex === -1) {
      const pageItems = itemsByPage.get(page) || [];

      const normalizeDateLabel = (value: string): string =>
        (value || "")
          .trim()
          .replace(/\s+/g, " ");

      type DateCandidate = { date: string; x: number; y: number; width: number };
      const candidates: DateCandidate[] = [];

      for (const item of pageItems) {
        const text = item.str;
        if (!text || text.length < 4) continue;
        for (const pattern of DATE_PATTERNS) {
          const matches = Array.from(text.matchAll(pattern));
          for (const m of matches) {
            if (!m[0]) continue;
            candidates.push({
              date: normalizeDateLabel(m[0]),
              x: item.x,
              y: item.y,
              width: item.width || 0,
            });
          }
        }
      }

      if (candidates.length > 0) {
        // Cluster by Y (header items share the same row).
        const sorted = [...candidates].sort((a, b) => a.y - b.y);
        const clusters: DateCandidate[][] = [];
        let current: DateCandidate[] = [sorted[0]];
        let currentY = sorted[0].y;
        for (let i = 1; i < sorted.length; i++) {
          const c = sorted[i];
          if (Math.abs(c.y - currentY) <= yTolerance) {
            current.push(c);
          } else {
            clusters.push(current);
            current = [c];
            currentY = c.y;
          }
        }
        clusters.push(current);

        // Choose best cluster: most unique dates, then widest spread, then nearest to top.
        let best: { cluster: DateCandidate[]; uniqueCount: number; spread: number; avgY: number } | null = null;
        for (const cluster of clusters) {
          const byDate = new Map<string, DateCandidate>();
          for (const c of cluster) {
            if (!byDate.has(c.date)) byDate.set(c.date, c);
          }
          const unique = Array.from(byDate.values()).sort((a, b) => a.x - b.x);
          if (unique.length < MIN_DATES_FOR_HEADER) continue;

          const spread = unique.length >= 2 ? (unique[unique.length - 1].x - unique[0].x) : 0;
          if (spread < headerSpreadMin) continue;

          const avgY = unique.reduce((sum, c) => sum + c.y, 0) / unique.length;
          const candidate = { cluster: unique, uniqueCount: unique.length, spread, avgY };
          if (!best) {
            best = candidate;
            continue;
          }
          if (candidate.uniqueCount > best.uniqueCount) {
            best = candidate;
            continue;
          }
          if (candidate.uniqueCount === best.uniqueCount && candidate.spread > best.spread) {
            best = candidate;
            continue;
          }
          if (
            candidate.uniqueCount === best.uniqueCount &&
            candidate.spread === best.spread &&
            candidate.avgY < best.avgY
          ) {
            best = candidate;
          }
        }

        if (best) {
          // Infer header row index by finding the nearest grouped row to the header Y.
          let nearestIndex = -1;
          let nearestDist = Number.POSITIVE_INFINITY;
          for (let i = 0; i < Math.min(rows.length, MAX_HEADER_SCAN_ROWS); i++) {
            const row = rows[i];
            const avgY = row.reduce((sum, item) => sum + item.y, 0) / row.length;
            const dist = Math.abs(avgY - best.avgY);
            if (dist < nearestDist) {
              nearestDist = dist;
              nearestIndex = i;
            }
          }

          headerRowIndex = nearestIndex;
          dateColumns = [];
          for (let j = 0; j < best.cluster.length; j++) {
            const current = best.cluster[j];
            const next = best.cluster[j + 1];
            dateColumns.push({
              date: current.date,
              xStart: current.x - 5,
              xEnd: next ? next.x - 1 : current.x + (current.width || 0) + 80,
            });
          }

          for (const col of dateColumns) {
            if (!dateSeen.has(col.date)) {
              dateSeen.add(col.date);
              allDatesOrdered.push(col.date);
            }
          }

          debugLog(
            `DEBUG: Header detected via date-item clustering on page ${page} (row ${headerRowIndex}) with ${dateColumns.length} dates:`
          );
        }
      }
    }

    if (headerRowIndex !== -1 && dateColumns.length > 0) {
      pageHeaders.push({ page, headerRowIndex, dateColumns });
    }
  }

  const dates: string[] = allDatesOrdered;
  const rawKeyCodes = extractKeyCodes(rawText);
  const keyCodes = rawKeyCodes.size >= 3 ? expandKeyCodes(rawKeyCodes) : new Set<string>();
  const dateColumns: Array<{ date: string; xStart: number; xEnd: number; page: number }> = [];
  for (const ph of pageHeaders) {
    for (const col of ph.dateColumns) {
      dateColumns.push({ ...col, page: ph.page });
    }
  }

  const isLikelyTransposedLayout = (): boolean => {
    if (pageHeaders.length === 0) return true;
    let transposedVotes = 0;
    for (const ph of pageHeaders) {
      const xs = ph.dateColumns.map(col => col.xStart).filter((x) => Number.isFinite(x));
      if (xs.length < 2) {
        transposedVotes += 1;
        continue;
      }
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const spread = maxX - minX;
      const pageItems = itemsByPage.get(ph.page) || [];
      const pageMaxX = pageItems.length > 0
        ? Math.max(...pageItems.map((item) => item.x + (item.width || 0)))
        : maxX;
      const spreadRatio = pageMaxX > 0 ? spread / pageMaxX : 0;
      const appearsVertical = maxX < 260 || spreadRatio < 0.35;
      if (appearsVertical) transposedVotes += 1;
    }
    return transposedVotes >= Math.max(1, Math.ceil(pageHeaders.length / 2));
  };

  const preferTransposedByDate = isLikelyTransposedLayout();
  
  if (dateColumns.length === 0) {
    debugLog("DEBUG: No dates found. Trying aggregated row search...");

    for (const [page, rows] of Array.from(rowsByPage.entries()).sort((a, b) => a[0] - b[0])) {
      for (let i = 0; i < Math.min(10, rows.length); i++) {
        const row = rows[i];
        const rowText = row.map(item => item.str).join(" ");
        debugLog(`Page ${page} Row ${i}: ${rowText.substring(0, 100)}`);
      }
    }
    
    const allText = allTextItems.map(i => i.str).join(" ");
    for (const pattern of DATE_PATTERNS) {
      const matches = Array.from(allText.matchAll(pattern));
      if (matches.length > 0) {
        debugLog(`DEBUG: Found ${matches.length} date matches with pattern ${pattern}:`, matches.slice(0, 10).map(m => m[0]));
      }
    }
  }
  
  const medicationPattern = /\d+\s*(mg|mcg|ml|%|g|units?|iu)/i;

  // Some EMARs include medicines without strength units on the same line as forms/instructions.
  const medicationPatternLoose = /\b(\d+\s*(mg|mcg|ml|%|g|units?|iu)|tablets?|capsules?|gel|patch|spray|drops?|cream|ointment|lotion|powder|inhaler)\b/i;

  const blockedMedCandidatePattern = /\b(case id|case-|printed|date of birth|mar chart|service user|resident|patient|title|allerg(?:y|ies)|key)\b/i;

  const strengthPattern = /^\d+(?:\.\d+)?(?:mg|mcg|g|ml|iu|units?|%)$/i;
  const strengthRatioPattern = /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?(?:mg|mcg|g|ml|iu|units?)$/i;
  const quantityPattern = /^(?:\d+\s*[x×]|\d+[x×]|x\d+)$/i;
  const rangePattern = /^\d{1,2}\s*[-–]\s*\d{1,2}$/;

  const isLowInformationMedicationName = (name: string): boolean => {
    const cleaned = (name || "").trim();
    if (!cleaned) return true;
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return true;
    const hasAlpha = tokens.some((t) => /[a-zA-Z]/.test(t));
    if (!hasAlpha) return true;
    return tokens.every((token) => {
      const lower = token.toLowerCase();
      return (
        MEDICATION_NAME_STOP_WORDS.has(lower) ||
        MEDICATION_NAME_INSTRUCTION_WORDS.has(lower) ||
        strengthPattern.test(token) ||
        strengthRatioPattern.test(token) ||
        quantityPattern.test(token) ||
        rangePattern.test(token)
      );
    });
  };

  const INSTRUCTION_FILLER_WORDS = new Set([
    "to",
    "be",
    "with",
    "without",
    "this",
    "that",
    "the",
    "and",
    "or",
    "if",
    "then",
    "per",
    "via",
    "by",
    "before",
    "after",
    "food",
    "meal",
    "meals",
  ]);

  const isDoseInstructionText = (text: string): boolean => {
    const cleaned = (text || "").trim();
    if (!cleaned) return false;
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return false;
    const startsWithDigit = /^\d/.test(tokens[0]);
    if (!startsWithDigit) return false;
    return tokens.every((token) => {
      const lower = token.toLowerCase();
      return (
        MEDICATION_NAME_INSTRUCTION_WORDS.has(lower) ||
        MEDICATION_NAME_STOP_WORDS.has(lower) ||
        INSTRUCTION_FILLER_WORDS.has(lower) ||
        strengthPattern.test(token) ||
        strengthRatioPattern.test(token) ||
        quantityPattern.test(token) ||
        rangePattern.test(token) ||
        /^\d+(?:\.\d+)?$/.test(token)
      );
    });
  };

  const MEDICATION_NAME_EXTRA_STOP_WORDS = new Set(["day", "days", "per", "via", "with", "without"]);
  const MEDICATION_NAME_BAD_STARTERS = new Set([
    "a",
    "an",
    "the",
    "of",
    "with",
    "and",
    "or",
    "to",
    "for",
    "in",
    "on",
    "at",
    "by",
    "as",
    "not",
    "be",
    "this",
    "that",
    "then",
    "per",
    "via",
  ]);

  const hasMeaningfulMedicationToken = (name: string): boolean => {
    const cleaned = (name || "").trim();
    if (!cleaned) return false;
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    return tokens.some((token) => {
      const normalized = token.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      if (normalized.length < 3) return false;
      if (!/[a-zA-Z]/.test(normalized)) return false;
      if (MEDICATION_NAME_STOP_WORDS.has(normalized)) return false;
      if (MEDICATION_NAME_INSTRUCTION_WORDS.has(normalized)) return false;
      if (MEDICATION_NAME_EXTRA_STOP_WORDS.has(normalized)) return false;
      if (TIME_WORD_PATTERN.test(normalized)) return false;
      return true;
    });
  };

  const isTimeLabelOnly = (value: string): boolean => {
    const cleaned = (value || "").trim();
    if (!cleaned) return false;
    const rangeRegex = new RegExp(`^${TIME_SLOT_PATTERN.source}$`, "i");
    const ampmRegex = new RegExp(`^${TIME_AMPM_PATTERN.source}$`, "i");
    const tokenRegex = new RegExp(`^${TIME_TOKEN_PATTERN.source}$`, "i");
    const compactRegex = new RegExp(`^${TIME_COMPACT_PATTERN.source}$`, "i");
    const wordRegex = new RegExp(`^${TIME_WORD_PATTERN.source}$`, "i");
    return (
      rangeRegex.test(cleaned) ||
      ampmRegex.test(cleaned) ||
      tokenRegex.test(cleaned) ||
      compactRegex.test(cleaned) ||
      wordRegex.test(cleaned)
    );
  };

  interface SlotColumn {
    slot: string;
    xStart: number;
    xEnd: number;
  }

  interface DateRow {
    date: string;
    yStart: number;
    yEnd: number;
  }
  
  interface MedicationBlock {
    name: string;
    instructions: string;
    row?: number;
    yStart: number;
    yEnd: number;
    timeSlots: Array<{ slot: string; y: number; yStart: number; yEnd: number }>;
  }
  
  const medicationBlocks: MedicationBlock[] = [];
  let allTimeSlots: string[] = [];

  // =====================================================================
  // TRANSPOSED LAYOUT SUPPORT
  // Some EMAR PDFs (like weekly summaries) render dates as ROW labels on the left,
  // and time slots as COLUMN headers along the top.
  // When we fail to detect date columns, try to detect this transposed grid.
  // =====================================================================
  const transposedPageCells: GridCell[] = [];
  const transposedMedications: Array<{ name: string; row: number; instructions: string; timeSlots: string[] }> = [];

  const normalizeSlot = (value: string) => {
    const cleaned = String(value || "")
      .trim()
      .replace(/[–—]/g, "-")
      .replace(/\./g, ":")
      .replace(/\s*-\s*/g, "-")
      .replace(/\s+/g, " ");

    if (!cleaned) return "";
    const normalizedRange = normalizeTimeRange(cleaned);
    if (normalizedRange) return normalizedRange;

    const normalizedSingle = normalizeTimeToken(cleaned);
    return normalizedSingle || cleaned;
  };

  const normalizeSlotWord = (value: string): string => {
    const key = value.toLowerCase();
    const wordMap: Record<string, string> = {
      morning: "Morning",
      noon: "Noon",
      midday: "Midday",
      lunch: "Lunch",
      afternoon: "Afternoon",
      evening: "Evening",
      night: "Night",
      bedtime: "Bedtime",
      tea: "Tea",
      breakfast: "Breakfast",
      am: "AM",
      pm: "PM",
    };
    return wordMap[key] || value;
  };

  const extractSlotLabels = (text: string): string[] => {
    const cleaned = (text || "").replace(/\s+/g, " ").trim();
    if (!cleaned) return [];

    const isHeaderLeftover = (leftover: string) => {
      const normalized = leftover
        .replace(/[^a-zA-Z]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      if (!normalized) return false;
      const tokens = normalized.split(" ").filter(Boolean);
      if (tokens.length === 0) return false;
      const headerTokens = new Set(["time", "times", "slot", "slots", "hour", "hours", "hrs"]);
      return tokens.every((token) => headerTokens.has(token));
    };

    // Check if text looks like medication instruction text (should not extract slots from this)
    const looksLikeInstructionText = (str: string): boolean => {
      const lower = str.toLowerCase();
      // Common instruction patterns that indicate we shouldn't extract time slots
      const instructionIndicators = [
        /\b(take|apply|administer|use|insert|dissolve|mix|inhale|give)\b/i,
        /\b(tablet|tablets|capsule|capsules|dose|doses|puff|puffs|drop|drops)\b/i,
        /\b(daily|twice|once|hourly|hours apart)\b/i,
        /\b(morning and|and evening|and pm|and tea|and lunch|am and|at am|at pm)\b/i,
        /\b(route|oral|topical)\b/i,
        /\d+\s*mg\b/i,
        /\d+\s*%\b/i,
      ];
      return instructionIndicators.some(pattern => pattern.test(str));
    };

    const rangeRegex = new RegExp(TIME_RANGE_ANY_PATTERN.source, "gi");
    const rangeMatches = Array.from(cleaned.matchAll(rangeRegex)).map((m) => m[0]).filter(Boolean);
    if (rangeMatches.length > 0) {
      const leftover = cleaned
        .replace(rangeRegex, "")
        .replace(/\b(?:am|pm|hrs?|hours?)\b/gi, "")
        .replace(/[()]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!leftover || (rangeMatches.length >= 2 && isHeaderLeftover(leftover))) {
        return rangeMatches.map((slot) => normalizeSlot(slot));
      }
      // Loose mode: allow a single range label even when other tokens are present
      // (common in MAR rows like "08:00-09:00 63225 HB 09:27 AD ...").
      if (rangeMatches.length === 1) {
        return [normalizeSlot(rangeMatches[0])];
      }
    }

    // Don't extract AMPM or simple time slots from instruction-like text
    if (looksLikeInstructionText(cleaned)) {
      return [];
    }

    const ampmRegex = new RegExp(TIME_AMPM_PATTERN.source, "gi");
    const ampmMatches = Array.from(cleaned.matchAll(ampmRegex)).map((m) => m[0]).filter(Boolean);
    const tokenRegex = new RegExp(TIME_TOKEN_PATTERN.source, "g");
    const compactRegex = new RegExp(TIME_COMPACT_PATTERN.source, "g");
    let tokenMatches =
      ampmMatches.length > 0
        ? ampmMatches
        : Array.from(cleaned.matchAll(tokenRegex)).map((m) => m[0]).filter(Boolean);
    if (tokenMatches.length === 0) {
      tokenMatches = Array.from(cleaned.matchAll(compactRegex)).map((m) => m[0]).filter(Boolean);
    }
    if (tokenMatches.length > 0) {
      const leftover = cleaned
        .replace(ampmRegex, "")
        .replace(tokenRegex, "")
        .replace(compactRegex, "")
        .replace(/\b(?:am|pm|hrs?|hours?)\b/gi, "")
        .replace(/[()]/g, " ")
        .replace(/\s+/g, " ")
        .replace(/[–-]/g, "")
        .trim();
      if (!leftover || (tokenMatches.length >= 2 && isHeaderLeftover(leftover))) {
        return tokenMatches.map((slot) => normalizeSlot(slot));
      }
    }

    const wordMatch = cleaned.match(TIME_WORD_PATTERN);
    if (wordMatch) {
      const leftover = cleaned.replace(TIME_WORD_PATTERN, "").trim();
      if (!leftover) {
        return [normalizeSlotWord(wordMatch[1])];
      }
    }

    return [];
  };

  const sanitizeInstructionText = (text: string): string => {
    if (!text) return "";
    let cleaned = stripTimeRangesFromText(text);
    // Remove legend snippets like "AD - Administered (Level 3)" that bleed into instructions.
    cleaned = cleaned.replace(
      /\b(?:AD|AS|NH|MU|SA|F|FA|PRN)\s*[-–]\s*[A-Za-z ]+(?:\([^)]+\))?/gi,
      " "
    );
    return cleaned.replace(/\s+/g, " ").trim();
  };

  const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const stripNamePrefix = (text: string, name: string): string => {
    if (!text || !name) return text;
    const pattern = new RegExp(`^${escapeRegex(name)}\\b[\\s:;\\-–—]*`, "i");
    return text.replace(pattern, "").trim();
  };

  const normalizeDateLabel = (value: string) =>
    (value || "")
      .trim()
      .replace(/\s+/g, " ");

  const isLikelyDateLabel = (text: string) => {
    if (!text) return false;
    for (const pattern of DATE_PATTERNS) {
      // Avoid stateful global RegExp issues by compiling a fresh non-global regex
      const nonGlobal = new RegExp(pattern.source, pattern.flags.replace(/g/g, ""));
      if (nonGlobal.test(text)) return true;
    }
    return false;
  };

  const extractTimeSlotHeaderClustersForPage = (page: number): Array<{ headerY: number; columns: SlotColumn[] }> => {
    const pageItems = itemsByPage.get(page) || [];
    const debugTransposed = process.env.DEBUG_EMAR_GRID === 'true';
    type SlotCandidate = { slot: string; x: number; y: number; width: number; isRange: boolean };
    const candidates: SlotCandidate[] = [];
    const pageMaxX = pageItems.length > 0
      ? Math.max(...pageItems.map((item) => item.x + (item.width || 0)))
      : 0;
    const leftCutoffRatio = options.leftCutoffRatio ?? 0.35;
    const leftCutoffMin = options.leftCutoffMin ?? 250;
    const leftCutoff = Math.max(leftCutoffMin, pageMaxX * leftCutoffRatio);
    const dateLineYs: number[] = [];

    for (const item of pageItems) {
      const text = item.str;
      if (!text || text.length < 4) continue;
      if (item.x > leftCutoff) continue;
      for (const pattern of DATE_PATTERNS) {
        const dateRegex = new RegExp(pattern.source, pattern.flags);
        const matches = Array.from(text.matchAll(dateRegex));
        if (matches.length > 0) {
          dateLineYs.push(item.y);
          break;
        }
      }
    }

    for (const item of pageItems) {
      const text = item.str;
      if (!text) continue;
      const labels = extractSlotLabels(text);
      for (const label of labels) {
        if (!label) continue;
        candidates.push({ slot: label, x: item.x, y: item.y, width: item.width || 0, isRange: label.includes("-") });
      }
    }

    if (debugTransposed && candidates.length === 0) {
      const timeTokenRegex = new RegExp(TIME_TOKEN_PATTERN.source, "i");
      const ampmTokenRegex = new RegExp(TIME_AMPM_PATTERN.source, "i");
      const timeLike = pageItems
        .filter(i => timeTokenRegex.test(i.str) || ampmTokenRegex.test(i.str))
        .slice(0, 12)
        .map(i => ({ str: i.str, x: i.x, y: i.y }));
      console.log(`[EMAR GRID DEBUG] page=${page} timeSlotCandidates=0 sampleTimeLike=`, timeLike);
    }

    if (candidates.length === 0) return [];

    // Prefer explicit time RANGE headers when present to avoid accidentally treating
    // administration times (single HH:MM tokens inside cells) as slot headers.
    const rangeCandidates = candidates.filter(c => c.isRange);
    const candidatesToCluster = rangeCandidates.length >= 2 ? rangeCandidates : candidates;

    // Cluster by Y to find the header line containing multiple time slots.
    const sorted = [...candidatesToCluster].sort((a, b) => a.y - b.y);
    const clusters: SlotCandidate[][] = [];
    let current: SlotCandidate[] = [sorted[0]];
    let currentY = sorted[0].y;
    for (let i = 1; i < sorted.length; i++) {
      const c = sorted[i];
      if (Math.abs(c.y - currentY) <= yTolerance) {
        current.push(c);
      } else {
        clusters.push(current);
        current = [c];
        currentY = c.y;
      }
    }
    clusters.push(current);

    const clusterCandidates: Array<{ unique: SlotCandidate[]; spread: number; avgY: number }> = [];

    for (const cluster of clusters) {
      const bySlot = new Map<string, SlotCandidate>();
      for (const c of cluster) {
        const key = `${c.slot}|${Math.round(c.x / 40)}`;
        if (!bySlot.has(key)) bySlot.set(key, c);
      }
      const unique = Array.from(bySlot.values()).sort((a, b) => a.x - b.x);
      if (unique.length < 2) continue;

      const spread = unique[unique.length - 1].x - unique[0].x;
      if (spread < 60) continue;

      const avgY = unique.reduce((sum, c) => sum + c.y, 0) / unique.length;
      const hasDateLabelNearby = dateLineYs.some((y) => Math.abs(y - avgY) <= yTolerance * 1.5);
      if (hasDateLabelNearby) continue;

      clusterCandidates.push({ unique, spread, avgY });
    }

    if (clusterCandidates.length === 0) {
      if (debugTransposed) {
        const clusterSummaries = clusters.map((cluster) => {
          const bySlot = new Map<string, SlotCandidate>();
          for (const c of cluster) {
            const key = `${c.slot}|${Math.round(c.x / 40)}`;
            if (!bySlot.has(key)) bySlot.set(key, c);
          }
          const unique = Array.from(bySlot.values()).sort((a, b) => a.x - b.x);
          const spread = unique.length >= 2 ? unique[unique.length - 1].x - unique[0].x : 0;
          const avgY = unique.length ? unique.reduce((sum, c) => sum + c.y, 0) / unique.length : 0;
          return {
            uniqueCount: unique.length,
            spread: Number(spread.toFixed(1)),
            avgY: Number(avgY.toFixed(1)),
            minX: unique.length ? Number(unique[0].x.toFixed(1)) : 0,
            slots: unique.map((u) => u.slot).slice(0, 6),
          };
        });
        console.log(`[EMAR GRID DEBUG] page=${page} timeSlotHeadersNotFound clusters=`, clusterSummaries);
      }
      return [];
    }

    // Prefer higher-on-page headers first (smaller Y).
    clusterCandidates.sort((a, b) => a.avgY - b.avgY);

    // Deduplicate very-close header lines (keep the richer one).
    const deduped: Array<{ unique: SlotCandidate[]; spread: number; avgY: number }> = [];
    for (const cand of clusterCandidates) {
      const existingIndex = deduped.findIndex((d) => Math.abs(d.avgY - cand.avgY) <= yTolerance);
      if (existingIndex === -1) {
        deduped.push(cand);
        continue;
      }
      const existing = deduped[existingIndex];
      const candBetter =
        cand.unique.length > existing.unique.length ||
        (cand.unique.length === existing.unique.length && cand.spread > existing.spread);
      if (candBetter) deduped[existingIndex] = cand;
    }

    const results: Array<{ headerY: number; columns: SlotColumn[] }> = [];
    for (const cand of deduped) {
      const cols: SlotColumn[] = [];
      for (let i = 0; i < cand.unique.length; i++) {
        const cur = cand.unique[i];
        const next = cand.unique[i + 1];
        cols.push({
          slot: cur.slot,
          xStart: cur.x - 5,
          xEnd: next ? next.x - 1 : cur.x + (cur.width || 0) + 80,
        });
      }
      results.push({ headerY: cand.avgY, columns: cols });
    }

    return results;
  };

  const extractDateRowsForPage = (page: number): DateRow[] => {
    const pageItems = itemsByPage.get(page) || [];
    type DateCandidate = { date: string; x: number; y: number };
    const candidates: DateCandidate[] = [];

    const pageMaxX = pageItems.length > 0
      ? Math.max(...pageItems.map((item) => item.x + (item.width || 0)))
      : 0;
    const leftCutoff = Math.max(250, pageMaxX * 0.35);

    for (const item of pageItems) {
      const text = item.str;
      if (!text || text.length < 4) continue;
      // Only consider likely row-label positions (left area).
      if (item.x > leftCutoff) continue;
      for (const pattern of DATE_PATTERNS) {
        const dateRegex = new RegExp(pattern.source, pattern.flags);
        const matches = Array.from(text.matchAll(dateRegex));
        for (const m of matches) {
          if (!m[0]) continue;
          candidates.push({ date: normalizeDateLabel(m[0]), x: item.x, y: item.y });
        }
      }
    }

    if (candidates.length === 0) return [];

    // Consolidate by Y (date labels often appear twice: "Sun, 30 Nov" and "30 Nov" at same Y).
    // Cluster by Y, then choose the best label in that cluster.
    const sortedByY = [...candidates].sort((a, b) => a.y - b.y);
    const clusters: DateCandidate[][] = [];
    let current: DateCandidate[] = [sortedByY[0]];
    let currentY = sortedByY[0].y;
    for (let i = 1; i < sortedByY.length; i++) {
      const c = sortedByY[i];
      if (Math.abs(c.y - currentY) <= yTolerance * 1.25) {
        current.push(c);
      } else {
        clusters.push(current);
        current = [c];
        currentY = c.y;
      }
    }
    clusters.push(current);

    const points = clusters
      .map((cluster) => {
        const bestLabel = cluster
          .map((c) => c.date)
          .sort((a, b) => {
            const aHasDow = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)/i.test(a);
            const bHasDow = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)/i.test(b);
            if (aHasDow !== bHasDow) return aHasDow ? -1 : 1;
            return b.length - a.length;
          })[0];
        const avgY = cluster.reduce((sum, c) => sum + c.y, 0) / cluster.length;
        return { date: bestLabel, y: avgY };
      })
      .filter((p) => Boolean(p.date));

    // In viewport coordinates, smaller Y is higher on the page.
    points.sort((a, b) => a.y - b.y);

    const rowPadding = 26;
    const rows: DateRow[] = [];
    for (let i = 0; i < points.length; i++) {
      const cur = points[i];
      const prev = points[i - 1];
      const next = points[i + 1];

      const yStart = prev ? (prev.y + cur.y) / 2 : cur.y - rowPadding;
      const yEnd = next ? (cur.y + next.y) / 2 : cur.y + rowPadding;

      rows.push({ date: cur.date, yStart, yEnd });
    }

    return rows;
  };

  const hasTransposedSlotHeaders = (): boolean => {
    const pages = Array.from(itemsByPage.keys()).sort((a, b) => a - b);
    if (pages.length === 0) return false;
    let transposedVotes = 0;

    for (const page of pages) {
      const headerClusters = extractTimeSlotHeaderClustersForPage(page);
      if (headerClusters.length === 0) continue;
      const dateRows = extractDateRowsForPage(page);
      if (dateRows.length < 2) continue;
      const hasMultipleColumns = headerClusters.some((cluster) => cluster.columns.length >= 2);
      if (hasMultipleColumns) transposedVotes += 1;
    }

    return transposedVotes >= Math.max(1, Math.ceil(pages.length / 2));
  };

  const preferTransposed = preferTransposedByDate || hasTransposedSlotHeaders();
  if (preferTransposedByDate && pageHeaders.length > 0) {
    debugLog("DEBUG: Header dates appear in a narrow column; preferring transposed layout extraction.");
  }
  if (!preferTransposedByDate && preferTransposed) {
    debugLog("DEBUG: Time-slot header clusters detected with date rows; preferring transposed layout extraction.");
  }

  const splitRowIntoSegments = (
    rowItems: TextItem[],
    gapThreshold: number
  ): Array<{ items: TextItem[]; xMin: number; xMax: number }> => {
    if (rowItems.length === 0) return [];
    const sorted = [...rowItems].sort((a, b) => a.x - b.x);
    const segments: Array<{ items: TextItem[]; xMin: number; xMax: number }> = [];
    let current: TextItem[] = [sorted[0]];
    let currentMin = sorted[0].x;
    let currentMax = sorted[0].x + (sorted[0].width || 0);

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      const gap = cur.x - prev.x;
      if (gap > gapThreshold) {
        segments.push({ items: current, xMin: currentMin, xMax: currentMax });
        current = [cur];
        currentMin = cur.x;
        currentMax = cur.x + (cur.width || 0);
        continue;
      }
      current.push(cur);
      currentMax = Math.max(currentMax, cur.x + (cur.width || 0));
    }
    segments.push({ items: current, xMin: currentMin, xMax: currentMax });
    return segments;
  };

  const extractMedicationCandidatesForPage = (
    page: number,
    headerY: number | null,
    upperBoundY: number | null
  ): {
    meds: Array<{ name: string; x: number; y: number; xMin: number; xMax: number; score: number }>;
    instructionHints: Array<{ text: string; x: number; y: number; xMin: number; xMax: number }>;
  } => {
    const pageItems = itemsByPage.get(page) || [];
    const rows = groupByY(pageItems, yTolerance);
    const candidates: Array<{ name: string; x: number; y: number; xMin: number; xMax: number; score: number }> = [];
    const instructionHints: Array<{ text: string; x: number; y: number; xMin: number; xMax: number }> = [];

    for (const row of rows) {
      const avgY = row.reduce((sum, i) => sum + i.y, 0) / row.length;

      if (headerY !== null) {
        if (upperBoundY !== null && avgY <= upperBoundY) continue;
        if (avgY >= headerY - 5) continue;
        const distanceFromHeader = headerY - avgY;
        if (distanceFromHeader > 220) continue;
      }

      const segments = splitRowIntoSegments(row, 45);
      const rowHasRouteLabel = segments.some((segment) => {
        const segmentText = segment.items.map(i => i.str).join(" ").replace(/\s+/g, " ").trim();
        return /\broute\b/i.test(segmentText);
      });
      for (const segment of segments) {
        // Focus on the left content region for medication labels.
        if (segment.xMin > 520) continue;
        const text = segment.items.map(i => i.str).join(" ").replace(/\s+/g, " ").trim();
        if (!text) continue;
        if (/^\s*route\s*$/i.test(text)) continue;
        if (isLikelyDateLabel(text)) continue;
        const slotHeaderRegex = new RegExp(TIME_SLOT_PATTERN.source, "i");
        if (slotHeaderRegex.test(text)) continue;

        const routeIndex = text.toLowerCase().indexOf("route");
        const cleaned = (routeIndex > 0 ? text.slice(0, routeIndex) : text).trim();
        if (!cleaned) continue;

        const matchesMed = medicationPattern.test(cleaned) || medicationPatternLoose.test(cleaned);
        let candidateName = cleaned;

        if (!matchesMed && /route/i.test(text)) {
          const routeParts = text
            .split(/route/i)
            .map(part => part.trim())
            .filter(part => part.length > 0);
          if (routeParts.length > 0) {
            candidateName = routeParts[0];
          }
        }

        const trimmedCandidate = candidateName.trim();
        const lowInfoCandidate = isLowInformationMedicationName(trimmedCandidate);
        const firstToken = trimmedCandidate.split(/\s+/)[0]?.toLowerCase() || "";
        const startsWithStopWord = MEDICATION_NAME_STOP_WORDS.has(firstToken);
        const startsWithInstructionWord = MEDICATION_NAME_INSTRUCTION_WORDS.has(firstToken);
        const instructionVerbPattern = /\b(take|apply|administer|give|dissolve|mix|use|insert|instill|inhale|inject)\b/i;
        const instructionLike = instructionVerbPattern.test(trimmedCandidate) && (startsWithStopWord || startsWithInstructionWord);
        const isInstructionOnly = /^\d/.test(trimmedCandidate) && /\btake\b/i.test(trimmedCandidate);
        const isBlocked = blockedMedCandidatePattern.test(trimmedCandidate);
        const doseOnlyCandidate = isDoseInstructionText(trimmedCandidate);
        const upperCandidate = trimmedCandidate.toUpperCase();
        if (isBlocked || lowInfoCandidate) continue;
        if (upperCandidate === "KEY" || upperCandidate === "ROUTE") continue;

        const routeDerived =
          rowHasRouteLabel &&
          /[a-zA-Z]/.test(trimmedCandidate) &&
          trimmedCandidate.length >= 3 &&
          !isBlocked;

        const looksLikeMedicationHeader =
          headerY !== null &&
          !matchesMed &&
          /[a-zA-Z]/.test(trimmedCandidate) &&
          trimmedCandidate.length >= 3 &&
          trimmedCandidate.length <= 60 &&
          !/^\d/.test(trimmedCandidate) &&
          !/\b(take|apply|dissolve|mix|route)\b/i.test(trimmedCandidate) &&
          !isBlocked;

        const instructionTokenPattern = /\b(daily|hourly|times?|tablet|tablets|capsule|capsules|mg|mcg|ml|drops?|puffs?|sachet|sachets|oral|topical|route|apply|take)\b/i;
        const instructionCandidate =
          (instructionLike || isInstructionOnly || startsWithStopWord || startsWithInstructionWord || doseOnlyCandidate) &&
          /[a-z]/i.test(trimmedCandidate) &&
          (instructionVerbPattern.test(trimmedCandidate) || instructionTokenPattern.test(trimmedCandidate));

        if (instructionCandidate) {
          const hintText = trimmedCandidate.substring(0, 160).trim();
          const tokenCount = hintText.split(/\s+/).filter(Boolean).length;
          const hasDetail =
            instructionVerbPattern.test(hintText) ||
            /\d/.test(hintText) ||
            tokenCount >= 3;
          if (hintText.length >= 6 && hasDetail) {
            instructionHints.push({
              text: hintText,
              x: (segment.xMin + segment.xMax) / 2,
              y: avgY,
              xMin: segment.xMin,
              xMax: segment.xMax,
            });
          }
        }

        const split = splitMedicationLabel(trimmedCandidate);
        const candidateNameOnly = split.name.trim();
        const candidateMeaningful = Boolean(candidateNameOnly) && hasMeaningfulMedicationToken(candidateNameOnly);
        
        // STRENGTHENED CHECKS: Reject names with trailing invalid characters or dose-only patterns
        const endsWithInvalidChar = candidateNameOnly && /[-\/\\:;,]$/.test(candidateNameOnly);
        const isPureDoseFragment = candidateNameOnly && /^\d+(?:\.\d+)?\s*(?:mg|mcg|ml|g|iu|units?|%)\s*[-\/\\]?$/i.test(candidateNameOnly);
        
        if (!candidateMeaningful || isLowInformationMedicationName(candidateNameOnly) || endsWithInvalidChar || isPureDoseFragment) {
          continue;
        }

        const validCandidate =
          matchesMed ||
          routeDerived ||
          (candidateName !== cleaned && /[a-zA-Z]/.test(trimmedCandidate) && trimmedCandidate.length >= 3) ||
          looksLikeMedicationHeader;

        const instructionOnlyCandidate = (startsWithStopWord || startsWithInstructionWord || isInstructionOnly || doseOnlyCandidate) &&
          !routeDerived &&
          !looksLikeMedicationHeader;

        if (!validCandidate || instructionOnlyCandidate) continue;

        const xCenter = (segment.xMin + segment.xMax) / 2;
        const score =
          (routeDerived ? 6 : 0) +
          (matchesMed ? 3 : 0) +
          (looksLikeMedicationHeader ? 1 : 0) -
          (instructionLike ? 4 : 0);
        candidates.push({
          name: candidateNameOnly.substring(0, 140).trim(),
          x: xCenter,
          y: avgY,
          xMin: segment.xMin,
          xMax: segment.xMax,
          score,
        });
      }
    }

    const deduped: Array<{ name: string; x: number; y: number; xMin: number; xMax: number; score: number }> = [];
    for (const candidate of candidates.sort((a, b) => a.x - b.x)) {
      const existing = deduped.find((d) => Math.abs(d.x - candidate.x) <= 40);
      if (!existing) {
        deduped.push(candidate);
        continue;
      }
      const scoreDelta = candidate.score - existing.score;
      if (scoreDelta > 0 || (scoreDelta === 0 && candidate.name.length > existing.name.length)) {
        existing.name = candidate.name;
        existing.y = candidate.y;
        existing.x = candidate.x;
        existing.xMin = candidate.xMin;
        existing.xMax = candidate.xMax;
        existing.score = candidate.score;
      }
    }
    return { meds: deduped, instructionHints };
  };

  const inferMedicationNameForPage = (page: number, headerY: number | null, upperBoundY: number | null): string => {
    const pageItems = itemsByPage.get(page) || [];
    const rows = groupByY(pageItems, yTolerance);

    let best: { text: string; distanceFromHeader: number; score: number } | null = null;
    for (const row of rows) {
      // Focus on the left content region to avoid combining multiple unrelated columns.
      const leftRowItems = row.filter((i) => i.x < 420);
      const rowText = leftRowItems.map(i => i.str).join(" ").replace(/\s+/g, " ").trim();
      if (!rowText) continue;

      // Prefer rows above the time-slot header (where med name & instructions usually are)
      if (headerY !== null) {
        const avgY = row.reduce((sum, i) => sum + i.y, 0) / row.length;
        // In viewport coordinates, smaller Y is higher on the page.
        // Medication text typically sits ABOVE the slot header line.
        if (upperBoundY !== null && avgY <= upperBoundY) continue;
        if (avgY >= headerY - 5) continue;

        // Prefer the row closest above the header (usually the actual medication label for the table).
        const distanceFromHeader = headerY - avgY;
        // Ignore very far-away rows (likely other sections)
        if (distanceFromHeader > 220) continue;

        // Truncate common trailing sections.
        const routeIndex = rowText.toLowerCase().indexOf("route");
        const cleaned = (routeIndex > 0 ? rowText.slice(0, routeIndex) : rowText).trim();
        if (!cleaned) continue;

        const matchesMed = medicationPattern.test(cleaned) || medicationPatternLoose.test(cleaned);
        if (!matchesMed) continue;
        if (isDoseInstructionText(cleaned)) continue;

        const { name: inferredName } = splitMedicationLabel(cleaned);
        if (!inferredName || isLowInformationMedicationName(inferredName)) continue;
        const score = inferredName.length;
        if (!best) {
          best = { text: inferredName, distanceFromHeader, score };
          continue;
        }
        if (distanceFromHeader < best.distanceFromHeader) {
          best = { text: inferredName, distanceFromHeader, score };
          continue;
        }
        if (distanceFromHeader === best.distanceFromHeader && score > best.score) {
          best = { text: inferredName, distanceFromHeader, score };
        }
        continue;
      }

      // If we don't have a headerY, fall back to the previous heuristics.
      if (isLikelyDateLabel(rowText)) continue;
      {
        const slotHeaderRegex = new RegExp(TIME_SLOT_PATTERN.source, "i");
        if (slotHeaderRegex.test(rowText)) continue;
      }
      const matchesMed = medicationPattern.test(rowText) || medicationPatternLoose.test(rowText);
      if (!matchesMed) continue;
      if (isDoseInstructionText(rowText)) continue;
      const routeIndex = rowText.toLowerCase().indexOf("route");
      const cleaned = (routeIndex > 0 ? rowText.slice(0, routeIndex) : rowText).trim();
      if (!cleaned) continue;
      const { name: inferredName } = splitMedicationLabel(cleaned);
      if (!inferredName || isLowInformationMedicationName(inferredName)) continue;
      const score = inferredName.length;
      if (!best) {
        best = { text: inferredName, distanceFromHeader: Number.POSITIVE_INFINITY, score };
      } else if (score > best.score) {
        best = { text: inferredName, distanceFromHeader: best.distanceFromHeader, score };
      }
    }

    return (best?.text || "").substring(0, 140).trim();
  };

  // Build medication blocks & time slots per page (after detected header)
  const medicationBlocksByPage = new Map<number, MedicationBlock[]>();
  for (const ph of pageHeaders) {
    const rows = rowsByPage.get(ph.page) || [];
    const medsOnPage: MedicationBlock[] = [];
    const instructionLinePattern = /\b(take|apply|administer|give|route|dose|doses|daily|weekly|monthly|times?|prn|as needed|once|twice|morning|noon|midday|afternoon|evening|night|bedtime|before|after|with|without|food|meal|meals|ml|mg|mcg|units?|tablets?|capsules?|drops?)\b/i;
    const dateLeftEdge = ph.dateColumns.length > 0
      ? Math.min(...ph.dateColumns.map(col => col.xStart))
      : 250;
    const leftCutoff = Math.max(200, dateLeftEdge - 10);

    for (let i = ph.headerRowIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      const leftItems = row.filter(item => item.x < leftCutoff);
      const leftText = leftItems.map(item => item.str).join(" ");

      const trimmedLeft = leftText.replace(/\s+/g, " ").trim();
      const routeIndex = trimmedLeft.toLowerCase().indexOf("route");
      const cleanedLeft = (routeIndex > 0 ? trimmedLeft.slice(0, routeIndex) : trimmedLeft).trim();
      const matchesMed = medicationPattern.test(cleanedLeft) || medicationPatternLoose.test(cleanedLeft);
      const blocked = blockedMedCandidatePattern.test(cleanedLeft);
      if (blocked) continue;

      const rawLabel = cleanedLeft.substring(0, 260).trim();
      const sanitizedLabel = sanitizeInstructionText(rawLabel);
      const { name: medName, instructions: medInstructions } = splitMedicationLabel(sanitizedLabel);
      const previous = medsOnPage[medsOnPage.length - 1];
      const isTimeLabel = isTimeLabelOnly(medName);
      const hasMeaningfulToken = hasMeaningfulMedicationToken(medName);
      const firstToken = medName.split(/\s+/)[0]?.toLowerCase() || "";
      const startsWithInstruction =
        MEDICATION_NAME_INSTRUCTION_WORDS.has(firstToken) || MEDICATION_NAME_BAD_STARTERS.has(firstToken);
      const rowHasTimeSlot = extractSlotLabels(cleanedLeft).length > 0;
      const looksLikeMedicationHeader =
        Boolean(medName) &&
        hasMeaningfulToken &&
        !startsWithInstruction &&
        !isTimeLabel &&
        (matchesMed || rowHasTimeSlot);

      if (!looksLikeMedicationHeader || isLowInformationMedicationName(medName)) {
        const isInstructionLine =
          Boolean(cleanedLeft) &&
          (instructionLinePattern.test(cleanedLeft) || isDoseInstructionText(cleanedLeft));
        if (previous && (matchesMed || medName || isInstructionLine)) {
          if (sanitizedLabel && sanitizedLabel.toLowerCase() !== previous.name.toLowerCase()) {
            let appendText = stripNamePrefix(sanitizedLabel, previous.name);
            if (appendText) {
              const existing = String(previous.instructions || "").toLowerCase();
              const next = appendText.toLowerCase();
              if (!existing.includes(next)) {
                previous.instructions = [previous.instructions, appendText].filter(Boolean).join(" ");
              }
            }
          }
        }
        continue;
      }

      const avgY = row.reduce((sum, item) => sum + item.y, 0) / row.length;
      medsOnPage.push({
        name: medName,
        instructions: (() => {
          if (medInstructions) return medInstructions;
          if (sanitizedLabel && sanitizedLabel.toLowerCase() !== medName.toLowerCase()) {
            return stripNamePrefix(sanitizedLabel, medName);
          }
          return "";
        })(),
        yStart: avgY - 5,
        yEnd: 0,
        timeSlots: []
      });
    }

    for (let i = 0; i < medsOnPage.length; i++) {
      const current = medsOnPage[i];
      const next = medsOnPage[i + 1];
      current.yEnd = next ? next.yStart - 1 : current.yStart + 150;
    }

    medicationBlocksByPage.set(ph.page, medsOnPage);
  }

  // Detect time slots and assign to medication blocks on the same page
  for (const ph of pageHeaders) {
    const rows = rowsByPage.get(ph.page) || [];
    const medsOnPage = medicationBlocksByPage.get(ph.page) || [];
    const dateLeftEdge = ph.dateColumns.length > 0
      ? Math.min(...ph.dateColumns.map(col => col.xStart))
      : 250;
    const leftCutoff = Math.max(200, dateLeftEdge - 10);

    for (let i = ph.headerRowIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      const leftItems = row.filter(item => item.x < leftCutoff);
      const leftText = leftItems.map(item => item.str).join(" ");
      const timeSlotMatches = extractSlotLabels(leftText);

      for (const slotLabel of timeSlotMatches) {
        const normalizedSlot = normalizeSlot(slotLabel);
        const avgY = row.reduce((sum, item) => sum + item.y, 0) / row.length;

        if (!allTimeSlots.includes(normalizedSlot)) {
          allTimeSlots.push(normalizedSlot);
        }

        for (const med of medsOnPage) {
          if (avgY >= med.yStart && avgY < med.yEnd) {
            const existingSlot = med.timeSlots.find(ts => ts.slot === normalizedSlot);
            if (!existingSlot) {
              // Initial Y-range, will be expanded below if multiple rows exist
              med.timeSlots.push({
                slot: normalizedSlot,
                y: avgY,
                yStart: avgY - 25,
                yEnd: avgY + 25
              });
            } else {
              // Same slot label at different Y position - expand the Y-range
              // This handles staggered layouts where data for different dates
              // appears at different Y positions for the same time slot
              existingSlot.yStart = Math.min(existingSlot.yStart, avgY - 25);
              existingSlot.yEnd = Math.max(existingSlot.yEnd, avgY + 25);
              existingSlot.y = (existingSlot.yStart + existingSlot.yEnd) / 2;
            }
            break;
          }
        }
      }
    }
  }

  // Post-process medication time slots: expand Y-ranges to fill gaps
  // and ensure proper coverage between adjacent slots
  for (const [page, meds] of Array.from(medicationBlocksByPage.entries())) {
    for (const med of meds) {
      if (med.timeSlots.length <= 1) continue;
      
      // Sort by Y position
      med.timeSlots.sort((a, b) => a.y - b.y);
      
      // Adjust boundaries to prevent gaps
      for (let i = 0; i < med.timeSlots.length; i++) {
        const current = med.timeSlots[i];
        const prev = med.timeSlots[i - 1];
        const next = med.timeSlots[i + 1];
        
        // Extend yStart towards previous slot or medication start
        if (prev) {
          current.yStart = Math.max(current.yStart, prev.yEnd);
        } else {
          current.yStart = Math.min(current.yStart, med.yStart);
        }
        
        // Extend yEnd towards next slot or medication end
        if (next) {
          // Set midpoint as boundary
          const midpoint = (current.y + next.y) / 2;
          current.yEnd = Math.max(current.yEnd, midpoint);
        } else {
          current.yEnd = Math.max(current.yEnd, med.yEnd);
        }
      }
    }
  }

  // Flatten medication blocks
  let medicationRowCounter = 0;
  for (const [page, meds] of Array.from(medicationBlocksByPage.entries()).sort((a, b) => a[0] - b[0])) {
    for (const med of meds) {
      med.row = medicationRowCounter;
      medicationBlocks.push({ ...med });
      medicationRowCounter += 1;
    }
  }

  // If we have range-based time slots, drop word-only time slots (e.g., "Tea") and standalone
  // AMPM time slots (e.g., "8pm") from both meds and allTimeSlots. These are typically extracted
  // from instruction text rather than being actual scheduled time slot headers.
  const hasRangeSlotsDetected = allTimeSlots.some((slot) =>
    new RegExp(`^${TIME_RANGE_PATTERN.source}$`, "i").test(slot)
  );
  if (hasRangeSlotsDetected) {
    const timeWordOnly = new RegExp(`^${TIME_WORD_PATTERN.source}$`, "i");
    const standaloneAmPm = new RegExp(`^${TIME_AMPM_PATTERN.source}$`, "i");
    
    // Also filter slots that look like single AM/PM times without a range (e.g., "8pm", "9am")
    const isSpuriousSlot = (slot: string): boolean => {
      if (timeWordOnly.test(slot)) return true;
      if (standaloneAmPm.test(slot)) return true;
      // Filter simple HH:MM without range when we have proper ranges
      const simpleTime = /^\d{1,2}:\d{2}$/;
      if (simpleTime.test(slot)) return true;
      return false;
    };
    
    for (const med of medicationBlocks) {
      if (Array.isArray(med.timeSlots) && med.timeSlots.length > 0) {
        med.timeSlots = med.timeSlots.filter((ts) => !isSpuriousSlot(ts.slot));
      }
    }
    allTimeSlots = allTimeSlots.filter((slot) => !isSpuriousSlot(slot));
  }

  // If no date columns were detected, attempt the transposed layout extraction.
  if (pageHeaders.length === 0 || preferTransposed) {
    const debugTransposed = process.env.DEBUG_EMAR_GRID === 'true';
    for (const [page] of Array.from(itemsByPage.entries()).sort((a, b) => a[0] - b[0])) {
      const dateRows = extractDateRowsForPage(page);
      const headerClusters = extractTimeSlotHeaderClustersForPage(page);
      if (debugTransposed) {
        console.log(`[EMAR GRID DEBUG] page=${page} headerClusters=${headerClusters.length} dateRows=${dateRows.length}`);
      }

      if (headerClusters.length === 0 || dateRows.length < 2) {
        if (debugTransposed) {
          console.log(
            `[EMAR GRID DEBUG] SKIP page=${page} reason=${headerClusters.length === 0 ? 'no_header_clusters' : 'insufficient_date_rows'}`
          );
        }
        continue;
      }

      const pageItems = itemsByPage.get(page) || [];

      for (let sectionIndex = 0; sectionIndex < headerClusters.length; sectionIndex++) {
        const section = headerClusters[sectionIndex];
        const nextSection = headerClusters[sectionIndex + 1];
        const prevSection = headerClusters[sectionIndex - 1];

        // Limit cells to the vertical band between this header and the next header below (stacked grids).
        const yTop = section.headerY + 2;
        // Some PDFs yield large Y coordinates near the bottom of the page.
        // Use +Infinity so we don't drop valid lower rows.
        const yBottom = nextSection ? nextSection.headerY - 2 : Number.POSITIVE_INFINITY;

        const sectionDateRows = dateRows.filter((dr) => {
          const midY = (dr.yStart + dr.yEnd) / 2;
          return midY >= yTop && midY <= yBottom;
        });

        if (debugTransposed) {
          console.log(
            `[EMAR GRID DEBUG] page=${page} section=${sectionIndex} headerY=${section.headerY.toFixed(1)} columns=${section.columns.length} yTop=${yTop.toFixed(1)} yBottom=${yBottom.toFixed(1)} sectionDateRows=${sectionDateRows.length}`
          );
        }

        if (section.columns.length === 0 || sectionDateRows.length < 2) {
          if (debugTransposed) {
            console.log(
              `[EMAR GRID DEBUG] SKIP page=${page} section=${sectionIndex} reason=${section.columns.length === 0 ? 'no_columns' : 'insufficient_section_date_rows'}`
            );
          }
          continue;
        }

        // Capture global slots/dates
        for (const c of section.columns) {
          if (!allTimeSlots.includes(c.slot)) allTimeSlots.push(c.slot);
        }
        for (const r of sectionDateRows) {
          if (!dates.includes(r.date)) dates.push(r.date);
        }

        // Upper bound prevents the medication-name heuristic from selecting the prior stacked section.
        const upperBoundY = prevSection ? prevSection.headerY + 2 : null;
        const { meds: medCandidates, instructionHints } = extractMedicationCandidatesForPage(page, section.headerY, upperBoundY);

        const assignColumnsToMeds = (
          columns: SlotColumn[],
          meds: Array<{ name: string; x: number; y: number; xMin: number; xMax: number }>
        ): Map<number, SlotColumn[]> => {
          const grouped = new Map<number, SlotColumn[]>();
          for (let i = 0; i < meds.length; i++) grouped.set(i, []);
          for (const col of columns) {
            const center = (col.xStart + col.xEnd) / 2;
            let bestIndex = 0;
            let bestDist = Number.POSITIVE_INFINITY;
            let inBandIndex = -1;
            let inBandDist = Number.POSITIVE_INFINITY;
            for (let i = 0; i < meds.length; i++) {
              const dist = Math.abs(center - meds[i].x);
              const bandMin = Math.max(0, meds[i].xMin - 40);
              const bandMax = meds[i].xMax + 120;
              if (center >= bandMin && center <= bandMax && dist < inBandDist) {
                inBandIndex = i;
                inBandDist = dist;
              }
              if (dist < bestDist) {
                bestDist = dist;
                bestIndex = i;
              }
            }
            const targetIndex = inBandIndex >= 0 ? inBandIndex : bestIndex;
            grouped.get(targetIndex)!.push(col);
          }

          // Ensure each medication gets at least one column, even if shared.
          for (let i = 0; i < meds.length; i++) {
            if ((grouped.get(i) || []).length > 0) continue;
            let closest: SlotColumn | null = null;
            let closestDist = Number.POSITIVE_INFINITY;
            for (const col of columns) {
              const center = (col.xStart + col.xEnd) / 2;
              const dist = Math.abs(center - meds[i].x);
              if (dist < closestDist) {
                closestDist = dist;
                closest = col;
              }
            }
            if (closest) grouped.get(i)!.push(closest);
          }
          return grouped;
        };

        const medGroups =
          medCandidates.length > 0
            ? assignColumnsToMeds(section.columns, medCandidates)
            : new Map<number, SlotColumn[]>([
                [0, section.columns],
              ]);

        const medsForSection =
          medCandidates.length > 0
            ? medCandidates
            : [
                {
                  name:
                    inferMedicationNameForPage(page, section.headerY, upperBoundY) ||
                    `Medication page ${page} block ${sectionIndex + 1}`,
                  x: section.columns[0]?.xStart || 0,
                  y: section.headerY,
                  xMin: section.columns[0]?.xStart || 0,
                  xMax: section.columns[section.columns.length - 1]?.xEnd || section.columns[0]?.xStart || 0,
                  score: 0,
                },
              ];

        const mapInstructionHintsToMeds = (
          meds: Array<{ x: number; xMin?: number; xMax?: number }>,
          hints: Array<{ text: string; x: number; y: number; xMin: number; xMax: number }>
        ): Map<number, string[]> => {
          const map = new Map<number, string[]>();
          if (meds.length === 0 || hints.length === 0) return map;

          for (const hint of hints) {
            const hintMin = typeof hint.xMin === "number" ? hint.xMin : hint.x;
            const hintMax = typeof hint.xMax === "number" ? hint.xMax : hint.x;
            const hintFirstToken = hint.text.split(/\s+/)[0]?.toLowerCase() || "";
            const preferLeftEdge =
              MEDICATION_NAME_STOP_WORDS.has(hintFirstToken) || MEDICATION_NAME_INSTRUCTION_WORDS.has(hintFirstToken);
            let bestIndex = -1;
            let bestOverlap = -1;
            let bestDist = Number.POSITIVE_INFINITY;

            for (let i = 0; i < meds.length; i++) {
              const med = meds[i];
              const medMin = typeof med.xMin === "number" ? med.xMin : med.x;
              const medMax = typeof med.xMax === "number" ? med.xMax : med.x;
              const overlap = Math.min(hintMax, medMax) - Math.max(hintMin, medMin);
              const dist = Math.abs(hintMin - medMin);

              if (preferLeftEdge) {
                if (dist < bestDist) {
                  bestDist = dist;
                  bestIndex = i;
                }
                continue;
              }

              if (overlap > 0) {
                if (overlap > bestOverlap || (overlap === bestOverlap && dist < bestDist)) {
                  bestOverlap = overlap;
                  bestDist = dist;
                  bestIndex = i;
                }
                continue;
              }

              if (bestOverlap < 0 && dist < bestDist) {
                bestDist = dist;
                bestIndex = i;
              }
            }

            const targetIndex = bestIndex >= 0 && (bestOverlap > 0 || bestDist <= 160) ? bestIndex : -1;
            if (targetIndex < 0) continue;
            const existing = map.get(targetIndex) || [];
            if (!existing.includes(hint.text)) {
              existing.push(hint.text);
              map.set(targetIndex, existing);
            }
          }
          return map;
        };

        const instructionByMedIndex = mapInstructionHintsToMeds(medsForSection, instructionHints);

	        const dedupeColumnsBySlot = (columns: SlotColumn[], targetX: number): SlotColumn[] => {
	          const bySlot = new Map<string, SlotColumn>();
          for (const col of columns) {
            const slotKey = normalizeSlot(col.slot);
            const center = (col.xStart + col.xEnd) / 2;
            const existing = bySlot.get(slotKey);
            if (!existing) {
              bySlot.set(slotKey, col);
              continue;
            }
            const existingCenter = (existing.xStart + existing.xEnd) / 2;
            if (Math.abs(center - targetX) < Math.abs(existingCenter - targetX)) {
              bySlot.set(slotKey, col);
            }
          }
	          return Array.from(bySlot.values());
	        };

	        const medicationIndexBySlotKey = new Map<string, number>();
	        const processedSlotsByMedicationIndex = new Map<number, Set<string>>();
	        let lastMedicationIndexInSection: number | null = null;

	        for (let i = 0; i < medsForSection.length; i++) {
	          const med = medsForSection[i];
	          const assignedColumnsRaw = medGroups.get(i) || [];
	          const assignedColumns = dedupeColumnsBySlot(assignedColumnsRaw, med.x);
	          if (assignedColumns.length === 0) continue;

	          const normalizedSlots = assignedColumns.map((c) => normalizeSlot(c.slot)).filter(Boolean);
	          const slotKey = [...normalizedSlots].sort().join("|");

	          const rawLabel = String(med.name || "").trim();
	          const { name: cleanMedName, instructions: medInstructions } = splitMedicationLabel(rawLabel);
            const extraInstructionText = (instructionByMedIndex.get(i) || []).join(" ").trim();

	          let medicationIndex: number | null = null;
	          let medicationNameForCells = "";

	          if (cleanMedName && !isLowInformationMedicationName(cleanMedName)) {
	            medicationNameForCells = cleanMedName;
              const baseInstructions = medInstructions || rawLabel;
              const combinedInstructions = [baseInstructions, extraInstructionText].filter(Boolean).join(" ").trim();
	            transposedMedications.push({
	              name: medicationNameForCells,
	              row: transposedMedications.length,
	              instructions: combinedInstructions || rawLabel,
	              timeSlots: assignedColumns.map((c) => c.slot),
	            });
	            medicationIndex = transposedMedications.length - 1;
	            medicationIndexBySlotKey.set(slotKey, medicationIndex);
	            lastMedicationIndexInSection = medicationIndex;
	          } else {
	            const existingIndex =
	              medicationIndexBySlotKey.get(slotKey) ??
	              (typeof lastMedicationIndexInSection === "number" ? lastMedicationIndexInSection : undefined);
	            if (typeof existingIndex !== "number") continue;
	            medicationIndex = existingIndex;
	            const existing = transposedMedications[medicationIndex];
	            medicationNameForCells = existing?.name || "";

	            if (existing && rawLabel) {
	              const existingInstructions = String(existing.instructions || "").trim();
	              if (!existingInstructions) {
	                existing.instructions = rawLabel;
	              } else if (!existingInstructions.includes(rawLabel)) {
	                existing.instructions = `${existingInstructions} ${rawLabel}`.trim();
	              }
                if (extraInstructionText && !existing.instructions.includes(extraInstructionText)) {
                  existing.instructions = `${existing.instructions} ${extraInstructionText}`.trim();
                }

	              const slotSet = new Set(existing.timeSlots.map((s) => normalizeSlot(s)));
	              for (const col of assignedColumns) {
	                const norm = normalizeSlot(col.slot);
	                if (!norm || slotSet.has(norm)) continue;
	                slotSet.add(norm);
	                existing.timeSlots.push(col.slot);
	              }
	            }
	          }

	          if (typeof medicationIndex !== "number" || !medicationNameForCells) continue;

	          let processedSlots = processedSlotsByMedicationIndex.get(medicationIndex);
	          if (!processedSlots) {
	            processedSlots = new Set<string>();
	            processedSlotsByMedicationIndex.set(medicationIndex, processedSlots);
	          }

	          for (const col of assignedColumns) {
	            const slotNorm = normalizeSlot(col.slot);
	            if (slotNorm && processedSlots.has(slotNorm)) continue;
	            if (slotNorm) processedSlots.add(slotNorm);

	            for (const dr of sectionDateRows) {
              const cellItems = pageItems.filter((item) =>
                item.x >= col.xStart &&
                item.x < col.xEnd &&
                item.y >= dr.yStart &&
                item.y <= dr.yEnd &&
                item.y >= yTop &&
                item.y <= yBottom
              );

	              const content = cellItems.map((i) => i.str).join(" ");
              const extracted = extractCodesFromCell(content, keyCodes.size > 0 ? keyCodes : undefined);
              const code = extracted.code;
              const careWorker = extracted.careWorker;
              const time = extracted.time;

              transposedPageCells.push({
                medication: medicationNameForCells,
                medicationRow: medicationIndex,
                medicationId: medicationIndex + 1,
                date: dr.date,
                timeSlot: col.slot,
                content,
                code,
                careWorker,
                time,
                keyMismatch: extracted.keyMismatch,
                detectedCode: extracted.detectedCode,
              });
	            }
	          }
	        }
	      }
	    }
	  }
  
  const hasRangeSlots = allTimeSlots.some((slot) =>
    new RegExp(`^${TIME_RANGE_PATTERN.source}$`, "i").test(slot)
  );
  if (hasRangeSlots) {
    const timeWordOnly = new RegExp(`^${TIME_WORD_PATTERN.source}$`, "i");
    const ampmOnly = new RegExp(`^${TIME_AMPM_PATTERN.source}$`, "i");
    const simpleTime = /^\d{1,2}:\d{2}$/;
    // Filter out spurious slots (word-only, standalone AMPM, or simple time without range)
    allTimeSlots = allTimeSlots.filter((slot) => 
      !timeWordOnly.test(slot) && !ampmOnly.test(slot) && !simpleTime.test(slot)
    );
  }

  debugLog(`DEBUG: Found ${allTimeSlots.length} time slots:`, allTimeSlots);
  
  const cells: GridCell[] = [];

  // Generate cells per page using that page's header columns and medication blocks
  if (!preferTransposed || transposedPageCells.length === 0) {
    for (const ph of pageHeaders) {
      const page = ph.page;
      const medsOnPage = medicationBlocksByPage.get(page) || [];
      const dateColsOnPage = ph.dateColumns;

      for (const med of medsOnPage) {
        for (const dateCol of dateColsOnPage) {
          const slotsToUse = med.timeSlots.length > 0 ? med.timeSlots :
            allTimeSlots.map(slot => ({ slot, y: med.yStart + 30, yStart: med.yStart, yEnd: med.yEnd }));

          for (const ts of slotsToUse) {
            const cellItems = allTextItems.filter(item =>
              item.page === page &&
              item.x >= dateCol.xStart &&
              item.x < dateCol.xEnd &&
              item.y >= (med.timeSlots.length > 0 ? ts.yStart : med.yStart) &&
              item.y < (med.timeSlots.length > 0 ? ts.yEnd : med.yEnd)
            );

            const content = cellItems.map(i => i.str).join(" ");
            const extracted = extractCodesFromCell(content, keyCodes.size > 0 ? keyCodes : undefined);
            const code = extracted.code;
            const careWorker = extracted.careWorker;
            const time = extracted.time;

            cells.push({
              medication: med.name,
              medicationRow: typeof med.row === "number" ? med.row : undefined,
              medicationId: typeof med.row === "number" ? med.row + 1 : undefined,
              date: dateCol.date,
              timeSlot: ts.slot,
              content,
              code,
              careWorker,
              time,
              keyMismatch: extracted.keyMismatch,
              detectedCode: extracted.detectedCode,
            });
          }
        }
      }
    }
  }

  // If transposed mode produced cells, prefer them when requested or when standard parsing failed.
  if ((preferTransposed || cells.length === 0) && transposedPageCells.length > 0) {
    cells.push(...transposedPageCells);
  }
  
  if (cells.length === 0 && medicationBlocks.length > 0 && dateColumns.length === 0) {
    debugLog("DEBUG: No cells generated - grid structure not detected. Falling back to simpler approach.");
    
    for (const med of medicationBlocks) {
      for (const slot of allTimeSlots.length > 0 ? allTimeSlots : ["Morning", "Noon", "Evening", "Night"]) {
        cells.push({
          medication: med.name,
          medicationRow: typeof med.row === "number" ? med.row : undefined,
          medicationId: typeof med.row === "number" ? med.row + 1 : undefined,
          date: "Unknown",
          timeSlot: slot,
          content: "",
          code: "BLANK",
          careWorker: "",
          time: ""
        });
      }
    }
  }
  
  // Filter cells to remove those with spurious time slots (word-only, AMPM-only, etc.)
  // This handles cases where cells were generated before the allTimeSlots was filtered
  const validTimeSlotSet = new Set(allTimeSlots);
  const simpleTimePattern = /^\d{1,2}:\d{2}$/;
  const filteredCells = cells.filter((cell) => {
    // Always keep cells whose time slot is in the validated list
    if (validTimeSlotSet.has(cell.timeSlot)) return true;
    // If there's no validated slots, keep all cells (edge case)
    if (validTimeSlotSet.size === 0) return true;
    // If range slots exist, drop stray single-time slots.
    if (hasRangeSlots && simpleTimePattern.test(cell.timeSlot)) return false;
    // Filter out cells with spurious time slots
    const timeWordOnly = new RegExp(`^${TIME_WORD_PATTERN.source}$`, "i");
    const standaloneAmPm = new RegExp(`^${TIME_AMPM_PATTERN.source}$`, "i");
    const isSpurious = timeWordOnly.test(cell.timeSlot) || standaloneAmPm.test(cell.timeSlot);
    return !isSpurious;
  });
  
  // Replace cells array with filtered version
  cells.length = 0;
  cells.push(...filteredCells);
  
  let serviceUserName = "";
  const normalizeInitials = (fullName: string): string => {
    const parts = fullName
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length === 0) return "";
    return parts.map(p => p[0]).join(".") + ".";
  };
  const namePatterns = [
    /Printed date\s+([A-Z][A-Za-z'`-]+(?:\s+[A-Z][A-Za-z'`-]+)+)\s+CASE/i,
    /Service User(?: Name)?[:\s]+([A-Z][A-Za-z'`-]+(?:\s+[A-Z][A-Za-z'`-]+)+)/i,
    /Resident(?: Name)?[:\s]+([A-Z][A-Za-z'`-]+(?:\s+[A-Z][A-Za-z'`-]+)+)/i,
    /Patient(?: Name)?[:\s]+([A-Z][A-Za-z'`-]+(?:\s+[A-Z][A-Za-z'`-]+)+)/i,
    /Client(?: Name)?[:\s]+([A-Z][A-Za-z'`-]+(?:\s+[A-Z][A-Za-z'`-]+)+)/i,
    /Name[:\s]+([A-Z][A-Za-z'`-]+(?:\s+[A-Z][A-Za-z'`-]+)+)/i,
  ];
  for (const pattern of namePatterns) {
    const match = rawText.match(pattern);
    if (match) {
      const fullName = match[1];
      serviceUserName = normalizeInitials(fullName);
      break;
    }
  }
  
  let allergies = "No known allergies";
  const allergyMatch = rawText.match(/Allerg(?:y|ies)\s*[:\-]?\s*([A-Za-z0-9 ,/'()\-]{0,120})/i);
  if (allergyMatch) {
    let captured = allergyMatch[1].trim();
    if (captured) {
      captured = captured.split(/(?:Route|Date|Time|Sun|Mon|Tue|Wed|Thu|Fri|Sat|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i)[0].trim();
      const tooLong = captured.length > 80;
      const hasDateLike = /\b(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\b/i.test(captured) || /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(captured);
      const hasTimeLike = /\b\d{1,2}:\d{2}\b/.test(captured);
      const tokens = captured.split(/\s+/).filter(Boolean);
      const upperTokens = tokens.map(token => token.replace(/[.,]/g, "").toUpperCase());
      const knownAllergyFlags = new Set(["NKA", "NKDA", "NO", "KNOWN", "ALLERGIES"]);
      const isCodeLike =
        upperTokens.length > 0 &&
        upperTokens.every(token => CODE_INITIALS.has(token) || /^[A-Z]{1,3}$/.test(token));
      const isKnownAllergyFlag =
        upperTokens.includes("NKA") ||
        upperTokens.includes("NKDA") ||
        (upperTokens.includes("NO") && upperTokens.includes("KNOWN") && upperTokens.includes("ALLERGIES"));
      if (captured && !tooLong && !hasDateLike && !hasTimeLike && !(isCodeLike && !isKnownAllergyFlag)) {
        allergies = captured;
      }
    }
  }
  
  const detectedDatesCount = dates.length;
  const useTransposedMeds = preferTransposed && transposedMedications.length > 0;
  const detectedMedsCount = useTransposedMeds
    ? transposedMedications.length
    : medicationBlocks.length > 0
      ? medicationBlocks.length
      : transposedMedications.length;
  const parserMode =
    useTransposedMeds ? "transposed" : medicationBlocks.length > 0 ? "grid" : transposedMedications.length > 0 ? "transposed" : "unknown";
  debugLog(
    `DEBUG: Parser complete (${parserMode}) - ${detectedDatesCount} dates, ${detectedMedsCount} meds, ${cells.length} cells`
  );

  const expectedDayInfo = estimateExpectedDays(dates);
  const confidence = computeGridConfidence({
    dates,
    timeSlots: allTimeSlots,
    medications: useTransposedMeds
      ? transposedMedications.map((m) => ({
          name: m.name,
          row: m.row,
          instructions: m.instructions || "",
          timeSlots: m.timeSlots,
        }))
      : medicationBlocks.length > 0
        ? medicationBlocks.map((m, i) => ({
            name: m.name,
            row: typeof m.row === "number" ? m.row : i,
            instructions: m.instructions || "",
            timeSlots: m.timeSlots.map(ts => ts.slot),
          }))
        : transposedMedications,
    cells,
    extraWarnings: expectedDayInfo.warning ? [expectedDayInfo.warning] : undefined,
  });
  
  return {
    serviceUserName,
    allergies,
    auditPeriodStart: dates[0] || "",
    auditPeriodEnd: dates[dates.length - 1] || "",
    pageCount: pdf.numPages,
    pageCharCounts,
    pageTexts,
    dates,
    timeSlots: allTimeSlots,
    medications: (useTransposedMeds
      ? transposedMedications
      : medicationBlocks.length > 0
        ? medicationBlocks.map((m, i) => ({
            name: m.name,
            row: typeof m.row === "number" ? m.row : i,
            instructions: stripNamePrefix(m.instructions || "", m.name),
            timeSlots: m.timeSlots.map(ts => ts.slot)
          }))
        : transposedMedications),
    cells,
    rawText,
    debugInfo: {
      totalTextItems: allTextItems.length,
      dateColumnsFound: dates.length,
      medicationsFound: detectedMedsCount,
      timeSlotsFound: allTimeSlots.length,
      cellsGenerated: cells.length,
      keyCodesFound: keyCodes.size,
      confidenceScore: confidence.score,
      validationWarnings: confidence.warnings,
      passLabel: options.passLabel
    }
  };
}

function computeGridConfidence(input: {
  dates: string[];
  timeSlots: string[];
  medications: Array<{ name: string; row: number; instructions: string; timeSlots: string[] }>;
  cells: GridCell[];
  extraWarnings?: string[];
}) {
  const dateCount = input.dates.length;
  const timeSlotCount = input.timeSlots.length;
  const medicationCount = input.medications.length;
  const cellCount = input.cells.length;
  const nonEmptyCells = input.cells.filter((cell) => {
    const content = String(cell.content || "").trim();
    return content.length > 0 || (cell.code && cell.code !== "BLANK");
  }).length;

  let expectedCells = 0;
  if (dateCount > 0 && medicationCount > 0) {
    const fallbackSlots = Math.max(1, timeSlotCount);
    expectedCells = input.medications.reduce((sum, med) => {
      const slotCount = Array.isArray(med.timeSlots) && med.timeSlots.length > 0
        ? med.timeSlots.length
        : fallbackSlots;
      return sum + (dateCount * slotCount);
    }, 0);
  }
  const cellCoverage = expectedCells > 0 ? Math.min(1, cellCount / expectedCells) : 0;
  const filledRatio = expectedCells > 0 ? Math.min(1, nonEmptyCells / expectedCells) : 0;

  const dateScore = Math.min(1, dateCount / 4);
  const timeScore = Math.min(1, timeSlotCount / 4);
  const medScore = Math.min(1, medicationCount / 6);
  const fillScore = Math.min(1, filledRatio / 0.15);

  const score =
    0.25 * dateScore +
    0.25 * timeScore +
    0.2 * medScore +
    0.2 * cellCoverage +
    0.1 * fillScore;

  const warnings: string[] = [];
  if (dateCount < 1) warnings.push("No dates detected");
  if (timeSlotCount < 2) warnings.push("Time slots below minimum threshold");
  if (medicationCount < 1) warnings.push("No medications detected");
  if (cellCount === 0) warnings.push("No grid cells generated");
  if (expectedCells > 0 && filledRatio < 0.02) warnings.push("Very low filled cell ratio");

  const isLow =
    score < 0.35 ||
    dateCount < 1 ||
    medicationCount < 1 ||
    cellCount === 0 ||
    (timeSlotCount < 2 && dateCount >= 2);

  if (input.extraWarnings && input.extraWarnings.length > 0) {
    warnings.push(...input.extraWarnings);
  }

  return { score, warnings, isLow, expectedCells, nonEmptyCells };
}

const estimateExpectedDays = (dates: string[]): { expected: number | null; warning?: string } => {
  if (dates.length < 2) return { expected: null };
  const parseDateLabel = (value: string): Date | null => {
    const cleaned = (value || "").replace(/[,]/g, " ").replace(/\s+/g, " ").trim();
    if (!cleaned) return null;

    // Try DD/MM/YYYY or DD/MM
    const numericMatch = cleaned.match(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/);
    if (numericMatch) {
      const day = Number(numericMatch[1]);
      const month = Number(numericMatch[2]);
      const year = numericMatch[3] ? Number(numericMatch[3]) : new Date().getFullYear();
      if (!Number.isNaN(day) && !Number.isNaN(month)) {
        return new Date(year, month - 1, day);
      }
    }

    // Try "01 Dec" or "01 December"
    const textMatch = cleaned.match(/\b(\d{1,2})\s+([A-Za-z]{3,})\b/);
    if (textMatch) {
      const day = Number(textMatch[1]);
      const monthStr = textMatch[2].toLowerCase();
      const months: Record<string, number> = {
        jan: 0,
        january: 0,
        feb: 1,
        february: 1,
        mar: 2,
        march: 2,
        apr: 3,
        april: 3,
        may: 4,
        jun: 5,
        june: 5,
        jul: 6,
        july: 6,
        aug: 7,
        august: 7,
        sep: 8,
        sept: 8,
        september: 8,
        oct: 9,
        october: 9,
        nov: 10,
        november: 10,
        dec: 11,
        december: 11,
      };
      const month = months[monthStr];
      if (!Number.isNaN(day) && typeof month === "number") {
        return new Date(new Date().getFullYear(), month, day);
      }
    }

    return null;
  };

  const first = parseDateLabel(dates[0]);
  const last = parseDateLabel(dates[dates.length - 1]);
  if (!first || !last) return { expected: null };

  const start = new Date(first.getFullYear(), first.getMonth(), first.getDate());
  let end = new Date(last.getFullYear(), last.getMonth(), last.getDate());
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { expected: null };

  // Handle year boundary: if end appears before start (e.g., Dec→Jan), bump end year forward.
  if (end < start) {
    end = new Date(end.getFullYear() + 1, end.getMonth(), end.getDate());
  }
  if (end < start) return { expected: null };
  const diffMs = end.getTime() - start.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
  if (diffDays <= 0) return { expected: null };

  if (Math.abs(diffDays - dates.length) > 1) {
    return {
      expected: diffDays,
      warning: `Date range suggests ${diffDays} days but detected ${dates.length} date columns`,
    };
  }

  return { expected: diffDays };
};

export async function parseEMARGrid(pdfBuffer: Buffer): Promise<ParsedEMAR> {
  const primary = await parseEMARGridWithOptions(pdfBuffer, { passLabel: "primary" });
  const primaryConfidence = computeGridConfidence({
    dates: primary.dates,
    timeSlots: primary.timeSlots,
    medications: primary.medications,
    cells: primary.cells,
  });

  if (!primaryConfidence.isLow) {
    return primary;
  }

  const fallback = await parseEMARGridWithOptions(pdfBuffer, {
    yTolerance: 16,
    textRowTolerance: 3.5,
    minDatesForHeader: 1,
    maxHeaderScanRows: 55,
    headerSpreadMin: 110,
    leftCutoffRatio: 0.3,
    leftCutoffMin: 220,
    passLabel: "fallback",
  });

  const fallbackConfidence = computeGridConfidence({
    dates: fallback.dates,
    timeSlots: fallback.timeSlots,
    medications: fallback.medications,
    cells: fallback.cells,
  });

  if (fallbackConfidence.score > primaryConfidence.score + 0.05) {
    return fallback;
  }

  if (fallbackConfidence.score > primaryConfidence.score && fallback.cells.length > primary.cells.length) {
    return fallback;
  }

  return primary;
}

function groupByY(items: TextItem[], tolerance: number): TextItem[][] {
  if (items.length === 0) return [];
  
  const sorted = [...items].sort((a, b) => a.y - b.y);
  const rows: TextItem[][] = [];
  let currentRow: TextItem[] = [sorted[0]];
  let currentY = sorted[0].y;
  
  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    if (Math.abs(item.y - currentY) <= tolerance) {
      currentRow.push(item);
    } else {
      rows.push(currentRow.sort((a, b) => a.x - b.x));
      currentRow = [item];
      currentY = item.y;
    }
  }
  
  if (currentRow.length > 0) {
    rows.push(currentRow.sort((a, b) => a.x - b.x));
  }
  
  return rows;
}

// Pre-compiled regex for extractCodesFromCell hot path (avoids re-creation per cell).
const CELL_CODE_REGEX = new RegExp(CODE_PATTERN.source, "gi");

// Canonical code list for fallback substring matching.
const CANONICAL_CODES = ["AD", "AS", "P", "R", "MU", "NH", "SA", "S/A", "S-A", "FA", "PRN", "PRN-R", "PRN-AD", "PRN-AS", "MISSED", "N/A"];

export function extractCodesFromCell(
  content: string,
  allowedCodes?: Set<string>
): { code: string; careWorker: string; time: string; keyMismatch?: boolean; detectedCode?: string } {
  let careWorker = "";
  let time = "";

  const allowed = allowedCodes && allowedCodes.size > 0 ? allowedCodes : null;
  
  const stripped = String(content || "").replace(/\s+/g, " ").trim();
  const xOnly = stripped.replace(/[^xX×✗✘]/g, "");
  const nonX = stripped.replace(/[xX×✗✘\s]/g, "").trim();
  if ((xOnly.length >= 2 && nonX.length === 0) || /^[xX×✗✘]+$/.test(stripped)) {
    return { code: "BLANK", careWorker: "", time: "" };
  }

  const upperContent = stripped.toUpperCase();
  const normalizedContent = normalizeCodeText(upperContent);
  // Reset lastIndex for the shared global regex before each use.
  CELL_CODE_REGEX.lastIndex = 0;

  const pickCode = (filter?: Set<string>): string => {
    CELL_CODE_REGEX.lastIndex = 0;
    let matches = Array.from(normalizedContent.matchAll(CELL_CODE_REGEX)).map((match) => normalizeGridCode(match[1]));
    if (filter) {
      matches = matches.filter((code) => filter.has(code));
    }
    if (matches.length > 0) {
      return pickBestCode(matches);
    }
    for (const code of CANONICAL_CODES) {
      const normalized = normalizeGridCode(code);
      if (filter && !filter.has(normalized)) continue;
      if (normalizedContent.includes(code)) {
        return normalized;
      }
    }
    return "BLANK";
  };

  let foundCode = pickCode(allowed || undefined);
  let keyMismatch = false;
  let detectedCode: string | undefined;

  if (allowed && foundCode === "BLANK") {
    const fallbackCode = pickCode();
    if (fallbackCode !== "BLANK") {
      keyMismatch = true;
      detectedCode = fallbackCode;
    }
  }
  
  careWorker = extractCareWorkerInitials(content);
  
  const extractedTime = extractFirstTimeToken(content);
  if (extractedTime) {
    time = extractedTime;
  }
  
  return { code: foundCode, careWorker, time, keyMismatch: keyMismatch || undefined, detectedCode };
}
