import { createChatCompletionWithLogging, AiUserContext } from './aiClient';

export interface EmarMetadata {
  serviceUserInitials: string;
  allergies: string;
  medications: EmarMedication[];
  dates: string[];
  timeSlots: string[];
}

export interface EmarMedication {
  medicationId: number;
  name: string;
  genericName?: string;
  isPRN: boolean;
  instructions?: string;
  requiredGapHours?: number;
  scheduledTimeSlots?: string[];
}

export interface EmarEntry {
  medicationId: number;
  medication?: string;
  date: string;
  timeSlot: string;
  code: string;
  careWorkerInitials: string;
  time?: string;
  hasTime: boolean;
}

export interface EmarExtractionResult {
  metadata: EmarMetadata;
  entries: EmarEntry[];
  consensusStatus: 'verified' | 'single_pass' | 'no_consensus';
  validationPassed: boolean;
  model: string;
}

const VALID_CODES = new Set([
  'AD', 'AS', 'P', 'PRN', 'PRN-R', 'PRN-AD', 'PRN-AS',
  'R', 'MU', 'NH', 'SA', 'FA', 'MISSED', 'G', 'A'
]);

const UK_EMAR_SYSTEM_PROMPT = `You are an expert UK EMAR (Electronic Medication Administration Record) data extractor.
You have extensive experience with UK care home medication systems including CMM, CarePlanner, MedPass, PCS, and others.

UK EMAR CONVENTIONS:
- EMAR charts are typically grids with DATES as columns (left to right) and MEDICATIONS as rows (top to bottom)
- Each cell contains: administration CODE + care worker INITIALS (2-3 letters like RK, HB, GM)
- Time slots appear as row headers (e.g., "08:00-09:00", "Morning", "Breakfast", "Night")
- Some EMAGs have PRN (as needed) medications in a separate section

ADMINISTRATION CODES (UK Standard):
- AD = Administered (carer gave the medication)
- AS = Assisted (carer helped but didn't directly administer)
- P = Prompted (carer reminded, service user self-administered)
- PRN = Given as PRN when needed
- R = Refused (CRITICAL - service user declined medication)
- MU = Medication Unavailable
- NH = Not Home (service user was away)
- SA = Self-Administered (documented but witnessed)
- FA = Family Administered
- MISSED = Dose was missed
- G or A = Given/Administered (alternative codes)

CRITICAL EXTRACTION RULES:
1. NEVER skip R (refused) codes - these are essential for compliance audits
2. Care worker initials are ALWAYS 2-3 uppercase letters
3. Each entry must have: date, timeSlot, code, and ideally initials
4. Blank/empty cells should be IGNORED completely
5. IGNORE red coloring - if a cell has a valid code, extract it regardless of color
6. Each medication row may have different scheduled time slots
7. Once-daily medications will only have entries in ONE time slot per day

DATE HANDLING:
- Dates appear in column headers (e.g., "Sun, 01 Dec", "01/12/2024")
- Keep dates in the EXACT format shown in the document
- Each entry belongs to the date column it appears under - be precise

OUTPUT FORMAT:
Always return valid JSON. Be thorough but accurate - extract what you see, don't guess.`;

const FEW_SHOT_EXAMPLES = `
EXAMPLE 1 - Grid format EMAR:
Document shows: "Paracetamol 500mg" row with "AD RK" under "Mon, 02 Dec" at "08:00-09:00"
Output: {"medicationId": 1, "date": "Mon, 02 Dec", "timeSlot": "08:00-09:00", "code": "AD", "careWorkerInitials": "RK", "hasTime": false}

EXAMPLE 2 - Refusal:
Document shows: "Omeprazole 20mg" row with "R HB" under "Tue, 03 Dec" at "08:00-09:00"
Output: {"medicationId": 2, "date": "Tue, 03 Dec", "timeSlot": "08:00-09:00", "code": "R", "careWorkerInitials": "HB", "hasTime": false}

EXAMPLE 3 - PRN with time:
Document shows: PRN section "Paracetamol PRN" with "PRN GM 14:30" under "Wed, 04 Dec"
Output: {"medicationId": 3, "date": "Wed, 04 Dec", "timeSlot": "PRN", "code": "PRN", "careWorkerInitials": "GM", "time": "14:30", "hasTime": true}

EXAMPLE 4 - Once-daily medication (only one slot):
Document shows: "Atorvastatin 20mg" (once daily at night) with "AD SB" under "Thu, 05 Dec" at "22:00"
Output: {"medicationId": 4, "date": "Thu, 05 Dec", "timeSlot": "22:00", "code": "AD", "careWorkerInitials": "SB", "hasTime": false}
Note: This medication appears ONLY in the night column - other time slots are blank and should be IGNORED.
`;

export class EmarAgent {
  private determinisiticSeed = 42;
  private model = 'gpt-4o-mini';

  async extractMetadata(
    documentText: string,
    tableStructure: { hasTable: boolean; tableType: string; detectedTimeSlots: string[]; rowCount: number },
    correctionsContext: string,
    aiUserContext: AiUserContext
  ): Promise<EmarMetadata> {
    const tableContext = tableStructure.hasTable
      ? `\nDOCUMENT LAYOUT: ${tableStructure.tableType.toUpperCase()} format
- Time slots detected: ${tableStructure.detectedTimeSlots.join(', ')}
- Estimated medication rows: ${tableStructure.rowCount}`
      : '';

    const prompt = `${UK_EMAR_SYSTEM_PROMPT}
${tableContext}
${correctionsContext}

TASK: Extract ONLY metadata from this EMAR document. Do NOT extract individual entries yet.

Return JSON:
{
  "serviceUserInitials": "F.O.",
  "allergies": "No known allergies",
  "medications": [
    {
      "name": "Paracetamol 500mg Tablets",
      "genericName": "paracetamol",
      "isPRN": false,
      "instructions": "Take 2 tablets four times daily",
      "requiredGapHours": 4,
      "scheduledTimeSlots": ["08:00-09:00", "12:00-12:30", "17:00-17:30", "22:00"]
    }
  ],
  "dates": ["Sun, 01 Dec", "Mon, 02 Dec", "Tue, 03 Dec"],
  "timeSlots": ["08:00-09:00", "12:00-12:30", "17:00-17:30", "22:00"]
}

RULES:
1. serviceUserInitials: Convert name to initials with dots (e.g., "John Smith" -> "J.S.")
2. allergies: Extract or "No known allergies" if not visible
3. medications: List ALL medications with:
   - name: Full name with strength/form exactly as shown
   - genericName: Active ingredient (paracetamol, omeprazole, etc.)
   - isPRN: true if marked PRN/as needed/when required
   - scheduledTimeSlots: Which time slots apply to THIS specific medication
4. dates: ALL dates in EXACT format shown
5. timeSlots: ALL time windows found`;

    const response = await createChatCompletionWithLogging({
      model: this.model,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: `Extract metadata from this EMAR:\n\n${documentText}` }
      ],
      max_completion_tokens: 4000,
      temperature: 0,
      seed: this.determinisiticSeed,
      response_format: { type: 'json_object' }
    }, 'emar_agent_metadata', aiUserContext);

    const content = response.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);

    return {
      serviceUserInitials: parsed.serviceUserInitials || '',
      allergies: parsed.allergies || 'No known allergies',
      medications: (parsed.medications || []).map((m: any, idx: number) => ({
        medicationId: idx + 1,
        name: m.name || '',
        genericName: m.genericName,
        isPRN: Boolean(m.isPRN),
        instructions: m.instructions,
        requiredGapHours: m.requiredGapHours,
        scheduledTimeSlots: m.scheduledTimeSlots
      })),
      dates: parsed.dates || [],
      timeSlots: parsed.timeSlots || []
    };
  }

  async extractEntries(
    documentText: string,
    metadata: EmarMetadata,
    correctionsContext: string,
    aiUserContext: AiUserContext
  ): Promise<{ entries: EmarEntry[]; consensusStatus: 'verified' | 'single_pass' | 'no_consensus' }> {
    const medList = metadata.medications.map(m =>
      `[ID:${m.medicationId}] ${m.name}${m.isPRN ? ' (PRN)' : ''} - slots: ${m.scheduledTimeSlots?.join(', ') || 'all'}`
    ).join('\n');

    const extractionPrompt = `${UK_EMAR_SYSTEM_PROMPT}

${FEW_SHOT_EXAMPLES}
${correctionsContext}

MEDICATIONS TO EXTRACT (use exact medicationId):
${medList}

DATES: ${metadata.dates.join(', ')}
TIME SLOTS: ${metadata.timeSlots.join(', ')}

TASK: Extract ALL administration entries for the medications listed.

Return JSON:
{
  "entries": [
    {"medicationId": 1, "date": "Mon, 02 Dec", "timeSlot": "08:00-09:00", "code": "AD", "careWorkerInitials": "RK", "hasTime": false}
  ]
}

CRITICAL RULES:
1. Extract EVERY cell with a code - especially R (refused) codes
2. careWorkerInitials: 2-3 uppercase letters (RK, HB, GM, etc.)
3. hasTime: true ONLY if a specific time is recorded (e.g., "14:30")
4. Skip completely blank cells - but capture ALL cells with any mark
5. Each entry must match one of the dates and timeSlots listed above
6. IGNORE red coloring - extract the code regardless of color`;

    const runPass = async (): Promise<EmarEntry[]> => {
      const response = await createChatCompletionWithLogging({
        model: this.model,
        messages: [
          { role: 'system', content: extractionPrompt },
          { role: 'user', content: `Extract entries from this EMAR:\n\n${documentText}` }
        ],
        max_completion_tokens: 8000,
        temperature: 0,
        seed: this.determinisiticSeed,
        response_format: { type: 'json_object' }
      }, 'emar_agent_extraction', aiUserContext);

      const content = response.choices[0]?.message?.content || '{"entries":[]}';
      const parsed = JSON.parse(content);
      return parsed.entries || [];
    };

    const [pass1, pass2, pass3] = await Promise.all([runPass(), runPass(), runPass()]);

    console.log(`EMAR Agent: Pass counts - P1: ${pass1.length}, P2: ${pass2.length}, P3: ${pass3.length}`);

    const validMedIds = new Set(metadata.medications.map(m => m.medicationId));
    const validDates = new Set(metadata.dates.map(d => d.toLowerCase().trim()));
    const validTimeSlots = new Set(metadata.timeSlots.map(t => t.toLowerCase().trim()));

    const validateEntry = (e: EmarEntry): boolean => {
      if (!e.medicationId || !e.date || !e.timeSlot || !e.code) return false;
      if (!validMedIds.has(e.medicationId)) return false;
      if (!VALID_CODES.has(e.code.toUpperCase())) return false;
      const normDate = e.date.toLowerCase().trim();
      const normSlot = e.timeSlot.toLowerCase().trim();
      if (!validDates.has(normDate)) return false;
      if (!validTimeSlots.has(normSlot) && normSlot !== 'prn') return false;
      return true;
    };

    const validatePass = (entries: EmarEntry[]): EmarEntry[] =>
      entries.filter(validateEntry).map(e => ({
        ...e,
        code: e.code.toUpperCase().trim(),
        careWorkerInitials: (e.careWorkerInitials || '').toUpperCase().trim(),
        hasTime: Boolean(e.hasTime)
      }));

    const v1 = validatePass(pass1);
    const v2 = validatePass(pass2);
    const v3 = validatePass(pass3);

    const dedupe = (entries: EmarEntry[]): EmarEntry[] => {
      const seen = new Set<string>();
      return entries.filter(e => {
        const key = `${e.medicationId}-${e.date}-${e.timeSlot}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    const d1 = dedupe(v1);
    const d2 = dedupe(v2);
    const d3 = dedupe(v3);

    const entryKey = (e: EmarEntry) => `${e.medicationId}|${e.date}|${e.timeSlot}|${e.code}`;
    const s1 = new Set(d1.map(entryKey));
    const s2 = new Set(d2.map(entryKey));
    const s3 = new Set(d3.map(entryKey));

    const match12 = Array.from(s1).every(k => s2.has(k)) && Array.from(s2).every(k => s1.has(k));
    const match23 = Array.from(s2).every(k => s3.has(k)) && Array.from(s3).every(k => s2.has(k));
    const match13 = Array.from(s1).every(k => s3.has(k)) && Array.from(s3).every(k => s1.has(k));

    if (match12 && match23) {
      console.log('EMAR Agent: Full consensus across all 3 passes');
      return { entries: d1, consensusStatus: 'verified' };
    }
    if (match12 || match13 || match23) {
      console.log('EMAR Agent: 2/3 consensus');
      const best = match12 ? d1 : match13 ? d1 : d2;
      return { entries: best, consensusStatus: 'verified' };
    }

    console.log('EMAR Agent: No consensus - using highest count pass');
    const counts = [d1.length, d2.length, d3.length];
    const maxIdx = counts.indexOf(Math.max(...counts));
    const fallback = [d1, d2, d3][maxIdx];
    return { entries: fallback, consensusStatus: 'no_consensus' };
  }

  async selfCheck(
    entries: EmarEntry[],
    metadata: EmarMetadata,
    documentText: string,
    aiUserContext: AiUserContext
  ): Promise<{ passed: boolean; issues: string[]; correctedEntries?: EmarEntry[] }> {
    const checkPrompt = `You are a quality assurance checker for EMAR data extraction.

EXTRACTED DATA:
- Medications: ${metadata.medications.length}
- Dates: ${metadata.dates.length} (${metadata.dates.join(', ')})
- Time slots: ${metadata.timeSlots.length}
- Entries extracted: ${entries.length}

ENTRY SUMMARY:
${entries.slice(0, 20).map(e => `Med ${e.medicationId}: ${e.date} @ ${e.timeSlot} = ${e.code} by ${e.careWorkerInitials}`).join('\n')}
${entries.length > 20 ? `... and ${entries.length - 20} more` : ''}

VALIDATION CHECKLIST:
1. Are there any R (refused) codes that might have been missed?
2. Do the entry counts seem reasonable for the number of meds x dates x slots?
3. Are care worker initials properly formatted (2-3 letters)?
4. Are all codes valid UK EMAR codes?

Return JSON:
{
  "passed": true,
  "issues": [],
  "missedRefusals": 0,
  "confidence": 95
}

If issues found:
{
  "passed": false,
  "issues": ["Missing refusal codes for Medication X", "Initials 'ABC123' invalid"],
  "missedRefusals": 2,
  "confidence": 60
}`;

    const response = await createChatCompletionWithLogging({
      model: this.model,
      messages: [
        { role: 'system', content: checkPrompt },
        { role: 'user', content: `Validate extraction against document:\n\n${documentText.substring(0, 3000)}` }
      ],
      max_completion_tokens: 1000,
      temperature: 0,
      response_format: { type: 'json_object' }
    }, 'emar_agent_validation', aiUserContext);

    const content = response.choices[0]?.message?.content || '{"passed":true,"issues":[]}';
    const result = JSON.parse(content);

    return {
      passed: result.passed !== false && (result.confidence || 100) >= 70,
      issues: result.issues || []
    };
  }

  async extract(
    documentText: string,
    tableStructure: { hasTable: boolean; tableType: string; detectedTimeSlots: string[]; rowCount: number },
    correctionsContext: string,
    aiUserContext: AiUserContext
  ): Promise<EmarExtractionResult> {
    console.log('EMAR Agent: Starting extraction with GPT-4o-mini');

    const metadata = await this.extractMetadata(documentText, tableStructure, correctionsContext, aiUserContext);
    console.log(`EMAR Agent: Metadata - ${metadata.medications.length} meds, ${metadata.dates.length} dates`);

    if (!metadata.medications.length) {
      throw new Error('No medications found in document');
    }

    const { entries, consensusStatus } = await this.extractEntries(documentText, metadata, correctionsContext, aiUserContext);
    console.log(`EMAR Agent: Extracted ${entries.length} entries (${consensusStatus})`);

    const validation = await this.selfCheck(entries, metadata, documentText, aiUserContext);
    console.log(`EMAR Agent: Validation ${validation.passed ? 'PASSED' : 'FAILED'} - ${validation.issues.length} issues`);

    return {
      metadata,
      entries,
      consensusStatus,
      validationPassed: validation.passed,
      model: this.model
    };
  }
}

export const emarAgent = new EmarAgent();
