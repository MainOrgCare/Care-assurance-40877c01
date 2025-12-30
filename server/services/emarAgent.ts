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
  isOfficeClosed?: boolean;
  closedByStaff?: string;
  closedTime?: string;
}

export interface MissedMedicationEntry {
  medication: string;
  scheduledTime: string;
  status: string;
  closedBy: string;
  closedTime: string;
}

export interface DrugInteraction {
  drug1: string;
  drug2: string;
  severity: 'high' | 'moderate' | 'low';
  description: string;
}

export interface EmarExtractionResult {
  metadata: EmarMetadata;
  entries: EmarEntry[];
  drugInteractions: DrugInteraction[];
  consensusStatus: 'verified' | 'single_pass' | 'no_consensus';
  validationPassed: boolean;
  model: string;
  tokenStats?: { metadata: number; extraction: number; validation: number; interactions: number };
}

const VALID_CODES = new Set([
  'AD', 'AS', 'P', 'PRN', 'PRN-R', 'PRN-AD', 'PRN-AS',
  'R', 'MU', 'NH', 'SA', 'FA', 'MISSED', 'G', 'A'
]);

const COMPACT_SYSTEM = `UK EMAR extractor. CRITICAL SCANNING ORDER:
1. Scan COLUMN-BY-COLUMN (date by date), NOT row-by-row
2. For each DATE column, go TOP-TO-BOTTOM through all medications
3. Within each cell: extract CODE + INITIALS (2-3 caps)

Codes: AD=given, AS=assisted, P=prompted, R=REFUSED, MU=unavail, NH=away, SA=self, FA=family, G/A=given, PRN=as needed

BLANK HANDLING:
- Empty cells, "X", "-", or no entry = SKIP completely, do NOT output
- Only output cells with actual codes (AD, R, AS, etc.)
- NEVER create entries for blank/X cells

CRITICAL: Never skip R codes - they are important refusals`;

export class EmarAgent {
  private seed = 42;
  private model = 'gpt-5.1';

  async extractMetadata(
    documentText: string,
    tableStructure: { hasTable: boolean; tableType: string; detectedTimeSlots: string[]; rowCount: number },
    correctionsContext: string,
    aiUserContext: AiUserContext
  ): Promise<{ metadata: EmarMetadata; tokens: number }> {
    const docChunk = documentText.substring(0, 4000);
    
    const tbl = tableStructure.hasTable 
      ? `Layout:${tableStructure.tableType},slots:${tableStructure.detectedTimeSlots.slice(0,4).join(',')},rows:${tableStructure.rowCount}`
      : '';

    const corrections = correctionsContext ? `\nFixes:${correctionsContext.substring(0, 200)}` : '';

    const prompt = `${COMPACT_SYSTEM}${tbl}${corrections}

Extract metadata only. JSON:
{"su":"F.O.","alg":"NKDA","meds":[{"n":"Paracetamol 500mg","g":"paracetamol","prn":false,"slots":["08:00","22:00"]}],"dates":["01 Dec","02 Dec"],"slots":["08:00","12:00","17:00","22:00"]}

Keys: su=initials, alg=allergies, n=name, g=generic, prn=isPRN, slots=scheduledSlots`;

    const response = await createChatCompletionWithLogging({
      model: this.model,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: docChunk }
      ],
      max_completion_tokens: 2000,
      temperature: 0,
      seed: this.seed,
      response_format: { type: 'json_object' }
    }, 'emar_agent_metadata', aiUserContext);

    const content = response.choices[0]?.message?.content || '{}';
    const tokens = response.usage?.total_tokens || 0;
    const p = JSON.parse(content);

    const metadata: EmarMetadata = {
      serviceUserInitials: p.su || p.serviceUserInitials || '',
      allergies: p.alg || p.allergies || 'NKDA',
      medications: (p.meds || p.medications || []).map((m: any, idx: number) => ({
        medicationId: idx + 1,
        name: m.n || m.name || '',
        genericName: m.g || m.genericName,
        isPRN: Boolean(m.prn ?? m.isPRN),
        instructions: m.ins || m.instructions,
        requiredGapHours: m.gap || m.requiredGapHours,
        scheduledTimeSlots: m.slots || m.scheduledTimeSlots
      })),
      dates: p.dates || [],
      timeSlots: p.slots || p.timeSlots || []
    };

    return { metadata, tokens };
  }

  async extractEntries(
    documentText: string,
    metadata: EmarMetadata,
    correctionsContext: string,
    aiUserContext: AiUserContext
  ): Promise<{ entries: EmarEntry[]; missedMedications: MissedMedicationEntry[]; consensusStatus: 'verified' | 'single_pass' | 'no_consensus'; tokens: number }> {
    const medMap = metadata.medications.map(m => `${m.medicationId}:${m.name.substring(0, 30)}`).join('|');
    const dateMap = metadata.dates.map((d, i) => `${i}:${d}`).join('|');
    const slotMap = metadata.timeSlots.map((s, i) => `${i}:${s}`).join('|');

    const docChunk = documentText.substring(0, 6000);
    const corrections = correctionsContext ? `\nFixes:${correctionsContext.substring(0, 150)}` : '';

    const prompt = `${COMPACT_SYSTEM}${corrections}

Meds:${medMap}
Dates:${dateMap}
Slots:${slotMap}

EXTRACTION ORDER (CRITICAL):
Step 1: Take Date[0] (${metadata.dates[0] || 'first date'})
Step 2: Go down ALL medications for that date, extract codes
Step 3: Move to Date[1], repeat down all meds
Step 4: Continue for each date column

OFFICE-CLOSED ENTRIES:
- If a code has NO INITIALS (just code in red box), set "oc":true
- These are manually closed by office staff, NOT care worker administered
- Still extract the code, but mark it as office-closed

MISSED MEDICATION SECTION:
- Look for "Missed Medication" table at bottom of document
- Extract entries with: medication, scheduledTime, closedBy (staff name), closedTime
- Include in "mm" array

Example output:
{"e":[
  {"m":1,"d":0,"s":0,"c":"AD","i":"RK"},
  {"m":2,"d":0,"s":0,"c":"AD","i":"","oc":true},
  {"m":1,"d":2,"s":0,"c":"R","i":"HB"}
],
"mm":[
  {"med":"Paracetamol","st":"06/Dec/25 04:00 AM","cb":"Kerri McLaughlin","ct":"08/Dec/25 01:31 PM"}
]}

Keys: m=medId, d=dateIdx, s=slotIdx, c=code, i=initials, t=time, oc=officeClosed
mm keys: med=medication, st=scheduledTime, cb=closedBy, ct=closedTime
CRITICAL: Include ALL R codes. Never output blank/X cells.`;

    let totalTokens = 0;

    let missedMedications: MissedMedicationEntry[] = [];

    const runPass = async (): Promise<EmarEntry[]> => {
      const response = await createChatCompletionWithLogging({
        model: this.model,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: docChunk }
        ],
        max_completion_tokens: 4000,
        temperature: 0,
        seed: this.seed,
        response_format: { type: 'json_object' }
      }, 'emar_agent_extraction', aiUserContext);

      totalTokens += response.usage?.total_tokens || 0;
      const content = response.choices[0]?.message?.content || '{"e":[]}';
      const parsed = JSON.parse(content);
      const rawEntries = parsed.e || parsed.entries || [];
      
      // Extract missed medication entries (only once from first pass)
      if (missedMedications.length === 0 && parsed.mm) {
        missedMedications = (parsed.mm || []).map((m: any) => ({
          medication: m.med || m.medication || '',
          scheduledTime: m.st || m.scheduledTime || '',
          status: m.status || 'Completed',
          closedBy: m.cb || m.closedBy || '',
          closedTime: m.ct || m.closedTime || ''
        }));
      }

      return rawEntries.map((e: any) => ({
        medicationId: e.m ?? e.medicationId,
        date: typeof e.d === 'number' ? metadata.dates[e.d] : e.d || e.date,
        timeSlot: typeof e.s === 'number' ? metadata.timeSlots[e.s] : e.s || e.timeSlot,
        code: (e.c || e.code || '').toUpperCase(),
        careWorkerInitials: (e.i || e.careWorkerInitials || '').toUpperCase(),
        time: e.t || e.time,
        hasTime: Boolean(e.t || e.time),
        isOfficeClosed: Boolean(e.oc || e.officeClosed || (!e.i && !e.careWorkerInitials))
      }));
    };

    const [pass1, pass2, pass3] = await Promise.all([runPass(), runPass(), runPass()]);
    console.log(`EMAR Agent: Pass counts - P1:${pass1.length}, P2:${pass2.length}, P3:${pass3.length}`);

    const validMedIds = new Set(metadata.medications.map(m => m.medicationId));
    const validDates = new Set(metadata.dates.map(d => d.toLowerCase().trim()));
    const validSlots = new Set(metadata.timeSlots.map(t => t.toLowerCase().trim()));

    const validate = (e: EmarEntry): boolean => {
      if (!e.medicationId || !e.date || !e.timeSlot || !e.code) return false;
      if (!validMedIds.has(e.medicationId)) return false;
      if (!VALID_CODES.has(e.code)) return false;
      const normDate = e.date.toLowerCase().trim();
      const normSlot = e.timeSlot.toLowerCase().trim();
      if (!validDates.has(normDate)) return false;
      if (!validSlots.has(normSlot) && normSlot !== 'prn') return false;
      return true;
    };

    const dedupe = (entries: EmarEntry[]): EmarEntry[] => {
      const seen = new Set<string>();
      return entries.filter(e => {
        const key = `${e.medicationId}-${e.date}-${e.timeSlot}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    const d1 = dedupe(pass1.filter(validate));
    const d2 = dedupe(pass2.filter(validate));
    const d3 = dedupe(pass3.filter(validate));

    const key = (e: EmarEntry) => `${e.medicationId}|${e.date}|${e.timeSlot}|${e.code}`;
    const s1 = new Set(d1.map(key));
    const s2 = new Set(d2.map(key));
    const s3 = new Set(d3.map(key));

    const eq = (a: Set<string>, b: Set<string>) => 
      a.size === b.size && Array.from(a).every(k => b.has(k));

    if (eq(s1, s2) && eq(s2, s3)) {
      return { entries: d1, missedMedications, consensusStatus: 'verified', tokens: totalTokens };
    }
    if (eq(s1, s2) || eq(s1, s3) || eq(s2, s3)) {
      const best = eq(s1, s2) ? d1 : eq(s1, s3) ? d1 : d2;
      return { entries: best, missedMedications, consensusStatus: 'verified', tokens: totalTokens };
    }

    const counts = [d1.length, d2.length, d3.length];
    const maxIdx = counts.indexOf(Math.max(...counts));
    return { entries: [d1, d2, d3][maxIdx], missedMedications, consensusStatus: 'no_consensus', tokens: totalTokens };
  }

  async checkDrugInteractions(
    medications: EmarMedication[],
    aiUserContext: AiUserContext
  ): Promise<{ interactions: DrugInteraction[]; tokens: number }> {
    if (medications.length < 2) {
      return { interactions: [], tokens: 0 };
    }

    const meds = medications.map(m => m.genericName || m.name.split(' ')[0].toLowerCase());
    const uniqueMeds = Array.from(new Set(meds));
    
    if (uniqueMeds.length < 2) {
      return { interactions: [], tokens: 0 };
    }

    const pairs: number[][] = [];
    for (let i = 0; i < uniqueMeds.length; i++) {
      for (let j = i + 1; j < uniqueMeds.length; j++) {
        pairs.push([i, j]);
      }
    }

    const prompt = `UK pharmacist. Check drug interactions.
Meds:${uniqueMeds.map((m, i) => `${i}:${m}`).join(',')}
Pairs:${pairs.map(p => `[${p[0]},${p[1]}]`).join(',')}

JSON:{"i":[{"p":[0,1],"s":"H","n":"bleed risk"}]}
s:H=high,M=mod,L=low. Empty if none:{"i":[]}`;

    const response = await createChatCompletionWithLogging({
      model: this.model,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: 'Check interactions' }
      ],
      max_completion_tokens: 200,
      temperature: 0,
      seed: this.seed,
      response_format: { type: 'json_object' }
    }, 'emar_agent_interactions', aiUserContext);

    const tokens = response.usage?.total_tokens || 0;
    const content = response.choices[0]?.message?.content || '{"i":[]}';
    const parsed = JSON.parse(content);

    const sevMap: Record<string, 'high' | 'moderate' | 'low'> = { H: 'high', M: 'moderate', L: 'low' };

    const interactions: DrugInteraction[] = (parsed.i || parsed.interactions || []).map((int: any) => {
      const p = int.p || int.pair || [0, 1];
      return {
        drug1: uniqueMeds[p[0]] || '',
        drug2: uniqueMeds[p[1]] || '',
        severity: sevMap[int.s] || int.severity || 'moderate',
        description: int.n || int.note || int.description || ''
      };
    });

    return { interactions, tokens };
  }

  async selfCheck(
    entries: EmarEntry[],
    metadata: EmarMetadata,
    aiUserContext: AiUserContext
  ): Promise<{ passed: boolean; issues: string[]; tokens: number }> {
    const refusals = entries.filter(e => e.code === 'R' || e.code.startsWith('PRN-R')).length;
    const summary = `Meds:${metadata.medications.length},Dates:${metadata.dates.length},Slots:${metadata.timeSlots.length},Entries:${entries.length},R:${refusals}`;

    const prompt = `QA check. ${summary}
Sample:${entries.slice(0, 10).map(e => `${e.medicationId}:${e.code}`).join(',')}

Validate:
1. R codes captured?
2. Counts reasonable?
3. Initials 2-3 caps?

JSON:{"ok":true,"issues":[],"conf":95}
If problems:{"ok":false,"issues":["Missing R codes"],"conf":60}`;

    const response = await createChatCompletionWithLogging({
      model: this.model,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: 'Validate' }
      ],
      max_completion_tokens: 150,
      temperature: 0,
      seed: this.seed,
      response_format: { type: 'json_object' }
    }, 'emar_agent_validation', aiUserContext);

    const tokens = response.usage?.total_tokens || 0;
    const content = response.choices[0]?.message?.content || '{"ok":true}';
    const r = JSON.parse(content);

    return {
      passed: (r.ok ?? r.passed) !== false && (r.conf ?? r.confidence ?? 100) >= 70,
      issues: r.issues || [],
      tokens
    };
  }

  async extract(
    documentText: string,
    tableStructure: { hasTable: boolean; tableType: string; detectedTimeSlots: string[]; rowCount: number },
    correctionsContext: string,
    aiUserContext: AiUserContext
  ): Promise<EmarExtractionResult> {
    console.log('EMAR Agent: Starting optimized extraction with GPT-5.1');

    const { metadata, tokens: metaTokens } = await this.extractMetadata(
      documentText, tableStructure, correctionsContext, aiUserContext
    );
    console.log(`EMAR Agent: Metadata - ${metadata.medications.length} meds, ${metadata.dates.length} dates (${metaTokens} tokens)`);

    if (!metadata.medications.length) {
      throw new Error('No medications found in document');
    }

    const [entriesResult, interactionsResult] = await Promise.all([
      this.extractEntries(documentText, metadata, correctionsContext, aiUserContext),
      this.checkDrugInteractions(metadata.medications, aiUserContext)
    ]);

    console.log(`EMAR Agent: ${entriesResult.entries.length} entries (${entriesResult.tokens} tokens), ${interactionsResult.interactions.length} interactions (${interactionsResult.tokens} tokens)`);

    const validation = await this.selfCheck(entriesResult.entries, metadata, aiUserContext);
    console.log(`EMAR Agent: Validation ${validation.passed ? 'PASSED' : 'FAILED'} (${validation.tokens} tokens)`);

    const totalTokens = metaTokens + entriesResult.tokens + interactionsResult.tokens + validation.tokens;
    console.log(`EMAR Agent: Total tokens used: ${totalTokens}`);

    return {
      metadata,
      entries: entriesResult.entries,
      drugInteractions: interactionsResult.interactions,
      consensusStatus: entriesResult.consensusStatus,
      validationPassed: validation.passed,
      model: this.model,
      tokenStats: {
        metadata: metaTokens,
        extraction: entriesResult.tokens,
        validation: validation.tokens,
        interactions: interactionsResult.tokens
      }
    };
  }
}

export const emarAgent = new EmarAgent();
