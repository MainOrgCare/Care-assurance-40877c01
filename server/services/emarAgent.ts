import { createChatCompletionWithLogging, type AiUserContext } from "./aiClient";

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

const AGENT_MODEL = "gpt-4o-mini";
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
      if (start !== null && end !== null && timeMinutes >= start && timeMinutes <= end) {
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

const deduplicateEntries = (entries: any[]): any[] => {
  const bestByKey = new Map<string, any>();
  for (const entry of entries) {
    const key = `${entry.medicationId}|${String(entry.date || "").toLowerCase()}|${String(entry.timeSlot || "").toLowerCase()}|${String(entry.code || "").toLowerCase()}`;
    const existing = bestByKey.get(key);
    if (!existing) {
      bestByKey.set(key, entry);
      continue;
    }
    if (entry.hasTime && !existing.hasTime) {
      bestByKey.set(key, entry);
      continue;
    }
    if (entry.careWorkerInitials && !existing.careWorkerInitials) {
      bestByKey.set(key, entry);
      continue;
    }
    if (String(entry.code || "").length > String(existing.code || "").length) {
      bestByKey.set(key, entry);
    }
  }
  return Array.from(bestByKey.values());
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

const buildMetadataPrompt = (tableContext: string, correctionsContext: string) => `You are an EMAR (Electronic Medication Administration Record) data extractor.
${tableContext}${correctionsContext}
Extract ONLY metadata from the document text. Return a JSON object with this exact structure:
{
  "serviceUserInitials": "F.O.",
  "allergies": "No known allergies",
  "medications": [
    {
      "name": "Paracetamol 500mg Tablets",
      "genericName": "paracetamol",
      "isPRN": true,
      "instructions": "Take 1-2 tablets every 4-6 hours as needed",
      "requiredGapHours": 4,
      "scheduledTimeSlots": ["08:00-09:00", "20:30-21:00"]
    }
  ],
  "dates": ["Sun, 30 Nov", "Mon, 01 Dec"],
  "timeSlots": ["08:00-09:00", "12:00-12:30", "16:00-16:30", "20:30-21:00"]
}

Rules:
1. serviceUserInitials: Convert the service user name to initials with dots (e.g., "Freda O'Neill" -> "F.O.").
2. allergies: Use "No known allergies" if none visible.
3. medications: Include every medication row visible, with strength/form if shown.
4. isPRN: true ONLY if instructions contain PRN/as required/as needed wording.
5. requiredGapHours: use 4 as default if not explicit.
6. scheduledTimeSlots: list only time slots that apply to that medication.`;

const buildEntriesPrompt = (
  medList: string,
  dates: string[],
  timeSlots: string[],
  tableContext: string,
  correctionsContext: string
) => `You are an EMAR data extractor. Extract administration entries ONLY for the medications listed.
${tableContext}${correctionsContext}
MEDICATIONS TO FIND (use exact medicationId in output):
${medList}

DATES: ${dates.join(", ")}
TIME SLOTS: ${timeSlots.join(", ")}

Return JSON with this exact structure:
{
  "entries": [
    {"medicationId": 1, "date": "Sat, 06 Dec", "timeSlot": "08:00-09:00", "code": "AD", "careWorkerInitials": "RK", "time": "08:30", "hasTime": true, "isOfficeClosed": false, "closedByStaff": "", "closedTime": ""},
    {"medicationId": 1, "date": "Sun, 07 Dec", "timeSlot": "08:00-09:00", "code": "AS", "careWorkerInitials": "", "time": "", "hasTime": false, "isOfficeClosed": false, "closedByStaff": "", "closedTime": ""}
  ]
}

Rules:
1. Only include entries that clearly map to a date column and time slot.
2. Always include R/MU/NH/SA/FA entries (non-administration codes are critical).
3. hasTime true only when a specific admin time is recorded (not the time-slot range).
4. If medication is PRN and there is no time recorded, use PRN-R for refusals.
5. Care worker initials are typically 2 letters; leave empty if not present.
6. isOfficeClosed is true ONLY if explicitly stated in the document.`;

export const emarAgent = {
  async extract(
    analysisText: string,
    tableStructure: any,
    correctionsContext: string,
    aiUserContext: AiUserContext
  ): Promise<EmarAgentResult> {
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

    const metadataResponse = await createChatCompletionWithLogging(
      {
        model: AGENT_MODEL,
        messages: [
          { role: "system", content: metadataPrompt },
          { role: "user", content: `Extract metadata from this EMAR document:\n\n${rawText}` },
        ],
        temperature: 0,
        max_completion_tokens: 2000,
        seed: DETERMINISTIC_SEED,
        response_format: { type: "json_object" },
      },
      "emar_agent_metadata",
      aiUserContext
    );

    const metadataContent = metadataResponse.choices[0]?.message?.content || "{}";
    const metadataParsed = parseJsonFromContent(metadataContent) || {};

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
      const key = normalizeMedicationKey(name);
      if (!key) continue;
      const existing = medByKey.get(key);
      const next = {
        name,
        genericName: String(med?.genericName || "").trim(),
        isPRN: typeof med?.isPRN === "boolean" ? med.isPRN : isPrnFromText(String(med?.instructions || "")),
        instructions: String(med?.instructions || "").trim(),
        requiredGapHours: Number(med?.requiredGapHours || 0) || 4,
        scheduledTimeSlots: uniqueStrings(Array.isArray(med?.scheduledTimeSlots) ? med.scheduledTimeSlots : []),
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
      requiredGapHours: Number(med.requiredGapHours || 0) || 4,
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

    const batchResults = await Promise.all(
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
            temperature: 0,
            max_completion_tokens: 8000,
            seed: DETERMINISTIC_SEED,
            response_format: { type: "json_object" },
          },
          "emar_agent_entries",
          aiUserContext
        );

        const content = response.choices[0]?.message?.content || "{\"entries\":[]}";
        const parsed = parseJsonFromContent(content) || { entries: [] };
        return Array.isArray(parsed.entries) ? parsed.entries : [];
      })
    );

    const validMedicationIds = new Set(medicationsWithIds.map((med) => med.medicationId));
    const medIdByKey = new Map<string, number>();
    for (const med of medicationsWithIds) {
      const key = normalizeMedicationKey(med.name);
      if (key) medIdByKey.set(key, med.medicationId);
    }

    const normalizeEntry = (entry: any): any | null => {
      let medId = Number(entry?.medicationId || 0);
      if (!validMedicationIds.has(medId)) {
        const medName = String(entry?.medication || entry?.medicationName || entry?.name || "").trim();
        const key = normalizeMedicationKey(medName);
        if (key && medIdByKey.has(key)) {
          medId = medIdByKey.get(key) as number;
        }
      }
      if (!validMedicationIds.has(medId)) return null;

      const medDetails = medicationsWithIds.find((med) => med.medicationId === medId);
      const isPrn = Boolean(medDetails?.isPRN);
      const date = normalizeDate(entry?.date);
      const time = String(entry?.time || "").trim();
      const timeSlot = resolveTimeSlot(entry?.timeSlot, time, mergedMetadata.timeSlots);
      let code = normalizeCode(entry?.code);
      const careWorkerInitials = normalizeInitials(entry?.careWorkerInitials);
      const hasTime = typeof entry?.hasTime === "boolean" ? entry.hasTime : computeHasTime({ time });
      const isOfficeClosed = Boolean(entry?.isOfficeClosed);
      const closedByStaff = String(entry?.closedByStaff || "").trim();
      const closedTime = String(entry?.closedTime || "").trim();

      if (!code && (hasTime || careWorkerInitials)) {
        code = isPrn ? "PRN" : "AD";
      }
      if (isPrn && (code === "PRN" || code === "") && !hasTime) {
        code = "PRN-R";
      }
      if (!date || !timeSlot || !code) return null;

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

    const rawEntries = batchResults.flat().map(normalizeEntry).filter(Boolean) as any[];
    const entries = deduplicateEntries(rawEntries);

    if (entries.length === 0) {
      throw new Error("EMAR agent: no entries extracted");
    }

    return {
      entries,
      metadata: {
        ...mergedMetadata,
        medications: medicationsWithIds,
      },
      consensusStatus: "single_pass",
      validationPassed: entries.length > 0,
      model: AGENT_MODEL,
    };
  }
};
