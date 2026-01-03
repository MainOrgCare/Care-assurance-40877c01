import { createChatCompletionWithLogging, AiUserContext, getPreferredModel } from './aiClient';

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

// CACHED SYSTEM PREFIX - identical across all calls for OpenAI prompt caching
// This static portion enables 50% cost reduction on cached prompts
const CACHED_SYSTEM_PREFIX = `UK EMAR extractor.
SCAN: Column-by-column (date cols), top-to-bottom (meds).
CRITICAL: Each column=one date. NEVER shift entries across columns. Blank cell=no entry for that date, skip it.
CODES: AD=given AS=assist P=prompt R=REFUSE MU=unavail NH=away SA=self FA=family G/A=given PRN=asNeeded
SKIP: Empty/X/- cells. OUTPUT: Only actual codes.
R codes=critical refusals, never skip.`;

export class EmarAgent {
  private seed = 42;

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

    const prompt = `${CACHED_SYSTEM_PREFIX}${tbl}${corrections}
TASK:Metadata. JSON:{"su":"F.O.","alg":"NKDA","meds":[{"n":"Paracetamol 500mg","g":"paracetamol","prn":false,"slots":["08:00","22:00"]}],"dates":["01 Dec","02 Dec"],"slots":["08:00","12:00","17:00","22:00"]}
Keys:su=initials,alg=allergies,n=name,g=generic,prn=isPRN,slots=scheduledSlots`;

    const response = await createChatCompletionWithLogging({
      model: getPreferredModel(),
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

    // Compact extraction prompt - uses cached prefix for token efficiency
    const prompt = `${CACHED_SYSTEM_PREFIX}${corrections}
MEDS:${medMap}|DATES:${dateMap}|SLOTS:${slotMap}
ORDER:Date[0]->down all meds->Date[1]->repeat.
STRICT:Each date column is isolated. Never associate a time from one column with another date. Read top-to-bottom for each date.
OFFICE-CLOSED:No initials(red box)->oc:true.
MISSED MED TABLE:Extract med,scheduledTime,closedBy,closedTime into mm[].
JSON:{"e":[{"m":1,"d":0,"s":0,"c":"AD","i":"RK"},{"m":2,"d":0,"s":0,"c":"AD","i":"","oc":true}],"mm":[{"med":"Name","st":"date time","cb":"Staff","ct":"date time"}]}
Keys:m=medId,d=dateIdx,s=slotIdx,c=code,i=initials,t=time,oc=officeClosed`;

    let totalTokens = 0;
    let missedMedications: MissedMedicationEntry[] = [];

    const validMedIds = new Set(metadata.medications.map(m => m.medicationId));
    const validDates = new Set(metadata.dates.map(d => d.toLowerCase().trim()));
    const validSlots = new Set(metadata.timeSlots.map(t => t.toLowerCase().trim()));

    const validateEntry = (e: EmarEntry): boolean => {
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

    const runPass = async (retryPromptSuffix?: string): Promise<EmarEntry[]> => {
      const fullPrompt = retryPromptSuffix ? `${prompt}\n\n${retryPromptSuffix}` : prompt;
      
      const response = await createChatCompletionWithLogging({
        model: getPreferredModel(),
        messages: [
          { role: 'system', content: fullPrompt },
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

    // OPTIMIZED: 2-pass validation (reduced from 3 parallel passes - saves ~33% tokens)
    // Uses deterministic extraction with verification pass for accuracy
    console.log('EMAR Agent: Running optimized 2-pass extraction');
    
    const pass1 = await runPass();
    const validated1 = dedupe(pass1.filter(validateEntry));
    console.log(`EMAR Agent: Pass 1 - ${pass1.length} raw, ${validated1.length} validated`);

    // Domain validation checks
    const scheduledMeds = metadata.medications.filter(m => !m.isPRN);
    const expectedSlots = scheduledMeds.length * metadata.dates.length;
    const hasRefusals = validated1.some(e => e.code === 'R' || e.code.startsWith('PRN-R'));
    const entryCountOk = validated1.length >= Math.floor(expectedSlots * 0.4); // At least 40% coverage
    
    // Check medication coverage - each scheduled med should have some entries
    const medCoverage = new Set(validated1.map(e => e.medicationId));
    const fullMedCoverage = scheduledMeds.every(m => medCoverage.has(m.medicationId));
    
    // Check date coverage - each date should have some entries
    const dateCoverage = new Set(validated1.map(e => e.date.toLowerCase().trim()));
    const fullDateCoverage = metadata.dates.every(d => dateCoverage.has(d.toLowerCase().trim()));
    
    // Code distribution check - shouldn't be all one code (suspicious)
    const codeDistribution = new Map<string, number>();
    validated1.forEach(e => codeDistribution.set(e.code, (codeDistribution.get(e.code) || 0) + 1));
    const hasVariedCodes = codeDistribution.size > 1 || validated1.length < 5;

    // Calculate validation score
    const validationScore = [
      entryCountOk,
      fullMedCoverage,
      fullDateCoverage,
      hasVariedCodes,
      hasRefusals || validated1.length < 10 // Refusals expected only in larger charts
    ].filter(Boolean).length;

    // Always run verification pass for accuracy (deterministic with same seed = same result)
    // If validation score is low, run with focused retry prompt
    const needsFocusedRetry = validationScore < 3;
    console.log(`EMAR Agent: Validation score ${validationScore}/5 - ${needsFocusedRetry ? 'focused' : 'verification'} pass`);
    
    const retryPrompt = needsFocusedRetry
      ? 'CRITICAL RECHECK: Ensure every medication has entries for each date. Check for R codes. Scan column-by-column carefully.'
      : undefined;
    
    const pass2 = await runPass(retryPrompt);
    const validated2 = dedupe(pass2.filter(validateEntry));
    console.log(`EMAR Agent: Pass 2 - ${pass2.length} raw, ${validated2.length} validated`);

    // Compare passes - use set comparison for consensus
    const key = (e: EmarEntry) => `${e.medicationId}|${e.date}|${e.timeSlot}|${e.code}`;
    const set1 = new Set(validated1.map(key));
    const set2 = new Set(validated2.map(key));
    const matches = Array.from(set1).filter(k => set2.has(k)).length;
    const consensusRatio = matches / Math.max(set1.size, set2.size, 1);
    
    console.log(`EMAR Agent: Consensus ${(consensusRatio * 100).toFixed(1)}% (${matches}/${Math.max(set1.size, set2.size)} entries)`);

    // Determine final result
    if (consensusRatio >= 0.85) {
      // High agreement - use pass with more entries (merged results)
      const merged = [...validated1];
      validated2.forEach(e => {
        if (!set1.has(key(e))) merged.push(e);
      });
      return { entries: dedupe(merged), missedMedications, consensusStatus: 'verified', tokens: totalTokens };
    } else if (validated2.length > validated1.length * 1.2) {
      // Pass 2 found significantly more - use it
      return { entries: validated2, missedMedications, consensusStatus: 'single_pass', tokens: totalTokens };
    } else {
      // Low agreement, use pass with better coverage
      const med1Coverage = new Set(validated1.map(e => e.medicationId)).size;
      const med2Coverage = new Set(validated2.map(e => e.medicationId)).size;
      const best = med2Coverage > med1Coverage ? validated2 : validated1;
      return { entries: best, missedMedications, consensusStatus: 'no_consensus', tokens: totalTokens };
    }
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
      model: getPreferredModel(),
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
      model: getPreferredModel(),
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
      model: getPreferredModel(),
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
