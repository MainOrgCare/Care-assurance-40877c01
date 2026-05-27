import { getPreferredModel, type AiUserContext } from "./aiClient";
import { parseJsonFromContent } from "../utils/jsonParser";
import { executeSecureTextCompletion } from "../utils/secureAiPipeline";

/**
 * Simple reversible name anonymization for schedule analysis.
 * Maps real worker names to pseudonyms before sending to AI,
 * then restores them in the response. No PII leaves the server.
 */
class ScheduleNameVault {
  private nameToAlias = new Map<string, string>();
  private aliasToName = new Map<string, string>();
  private counter = 0;

  private static readonly PSEUDONYMS = [
    "Worker A", "Worker B", "Worker C", "Worker D", "Worker E",
    "Worker F", "Worker G", "Worker H", "Worker I", "Worker J",
    "Worker K", "Worker L", "Worker M", "Worker N", "Worker O",
    "Worker P", "Worker Q", "Worker R", "Worker S", "Worker T",
    "Worker U", "Worker V", "Worker W", "Worker X", "Worker Y", "Worker Z",
  ];

  anonymize(name: string): string {
    if (!name) return name;
    const existing = this.nameToAlias.get(name);
    if (existing) return existing;
    const alias = this.counter < ScheduleNameVault.PSEUDONYMS.length
      ? ScheduleNameVault.PSEUDONYMS[this.counter]
      : `Worker ${this.counter + 1}`;
    this.counter++;
    this.nameToAlias.set(name, alias);
    this.aliasToName.set(alias, name);
    return alias;
  }

  restore(text: string): string {
    let result = text;
    // Replace longest aliases first to avoid partial matches
    const entries = [...this.aliasToName.entries()].sort((a, b) => b[0].length - a[0].length);
    for (const [alias, name] of entries) {
      result = result.split(alias).join(name);
    }
    return result;
  }

  restoreObject<T>(data: T): T {
    if (data === null || data === undefined) return data;
    if (typeof data === "string") return this.restore(data) as unknown as T;
    if (Array.isArray(data)) return data.map(item => this.restoreObject(item)) as unknown as T;
    if (typeof data === "object") {
      const restored: Record<string, unknown> = {};
      for (const key of Object.keys(data as Record<string, unknown>)) {
        restored[key] = this.restoreObject((data as Record<string, unknown>)[key]);
      }
      return restored as T;
    }
    return data;
  }
}

export interface ScheduleAnalysisInput {
  workers: Array<{
    key: string;
    name: string;
    calls: number;
    minutes: number;
    serviceUsers: number;
  }>;
  conflicts: number;
  travelGaps: number;
  utilizationStats: {
    avgCalls: number;
    avgHours: number;
    workersOverLimit: number;
    workersUnderUtilized: number;
  };
  constraintViolations: Array<{
    workerName: string;
    violationType: string;
    actual: number;
    limit: number;
  }>;
  weekDay: string;
  weekNumber: string;
}

export interface ScheduleAnalysisResult {
  overallScore: number; // 0-100
  scoreRationale?: string; // One-line justification grounded in input metrics
  insights: Array<{
    type: "positive" | "warning" | "critical";
    category: "workload" | "efficiency" | "quality" | "compliance";
    title: string;
    description: string;
    impact: "high" | "medium" | "low";
  }>;
  recommendations: Array<{
    priority: number; // 1-10
    action: string;
    expectedBenefit: string;
    affectedWorkers: string[];
  }>;
  predictive: {
    burnoutRisk: Array<{
      workerName: string;
      riskScore: number; // 0-100
      factors: string[];
    }>;
    bottlenecks: Array<{
      timeWindow: string;
      description: string;
      affectedCalls: number;
    }>;
    optimizationPotential: {
      travelTimeReduction: number; // minutes
      workloadBalanceImprovement: number; // percentage
      conflictElimination: number; // count
    };
  };
}

export async function analyzeScheduleWithAI(
  input: ScheduleAnalysisInput,
  aiUserContext?: AiUserContext
): Promise<ScheduleAnalysisResult> {
  if (!input.workers || input.workers.length === 0) {
    throw new Error("Schedule analysis requires at least one worker");
  }
  // Anonymize worker names before sending to AI
  const vault = new ScheduleNameVault();

  const totalWorkers = input.workers.length;
  const totalCalls = input.workers.reduce((sum, w) => sum + (w.calls || 0), 0);
  const totalHours = Math.round(input.workers.reduce((sum, w) => sum + (w.minutes || 0), 0) / 60 * 10) / 10;
  const sortedByCalls = [...input.workers].sort((a, b) => b.calls - a.calls);
  const heaviestWorker = sortedByCalls[0];
  const lightestWorker = sortedByCalls[sortedByCalls.length - 1];
  const callsSpread = heaviestWorker && lightestWorker
    ? heaviestWorker.calls - lightestWorker.calls
    : 0;

  const systemPrompt = `You are a senior care scheduling analyst for UK domiciliary care providers. You apply CQC quality standards, Working Time Regulations 1998 (max 48h/week, 11h daily rest, 20-min break after 6h), and operational realities of community-based visits (travel time between calls, double-up coverage, time-critical medication windows).

YOUR JOB
Produce a *rigorous, evidence-based* schedule assessment. Every insight, recommendation, and predicted risk MUST be grounded in the numeric inputs provided — never invent workers, calls, or violations. If the data is insufficient to support a claim, omit the claim.

ANALYSIS DIMENSIONS (weight in scoring)
1. Workload balance (30%) — call/hour spread across workers, over-limit and under-utilised counts.
2. Compliance (30%) — explicit constraint violations, WTR risks, double-up gaps.
3. Operational efficiency (25%) — travel gaps, schedule conflicts, sequencing.
4. Care quality & continuity (15%) — service-user concentration, predictability for clients.

SCORING DISCIPLINE (0–100, integer)
- 90–100 Excellent: 0 violations, 0 conflicts, balanced workload (spread ≤25%), no burnout flags.
- 75–89 Good: ≤1 violation OR ≤2 conflicts, minor imbalance.
- 60–74 Fair: multiple minor issues or 1 medium imbalance.
- 40–59 Poor: any high-severity constraint breach, or workload spread >50%.
- 0–39 Critical: WTR breach, unresolved conflicts, or systemic over-allocation.
Justify the score with at least one specific metric.

INSIGHT RULES
- 3 to 7 insights total. Each must reference a concrete number from the input.
- type ∈ {"positive","warning","critical"}; category ∈ {"workload","efficiency","quality","compliance"}.
- impact ∈ {"high","medium","low"} reflecting operational consequence, not severity of feeling.

RECOMMENDATION RULES
- 3 to 6 recommendations, sorted by priority DESC. priority is 1–10 (10 = act today).
- Each "action" MUST be a single imperative sentence (e.g. "Reassign 2 evening calls from Worker A to Worker D on Tuesday").
- "expectedBenefit" MUST quantify (e.g. "Cuts conflicts from 3 to 1; reduces Worker A workload by 14%").
- "affectedWorkers" lists only worker names that appear in the input.

PREDICTIVE RULES
- burnoutRisk: include any worker whose calls or hours are >120% of the team average, OR who appears in constraint violations. riskScore 0–100. factors must cite the numeric trigger.
- bottlenecks: only include if travelGaps>0 or conflicts>0. Otherwise return [].
- optimizationPotential numbers must be conservative best-estimates (never fabricated).

OUTPUT
Return ONLY a JSON object matching this exact shape (no markdown, no prose):
{
  "overallScore": number,
  "scoreRationale": string,
  "insights": [{ "type": string, "category": string, "title": string, "description": string, "impact": string }],
  "recommendations": [{ "priority": number, "action": string, "expectedBenefit": string, "affectedWorkers": string[] }],
  "predictive": {
    "burnoutRisk": [{ "workerName": string, "riskScore": number, "factors": string[] }],
    "bottlenecks": [{ "timeWindow": string, "description": string, "affectedCalls": number }],
    "optimizationPotential": { "travelTimeReduction": number, "workloadBalanceImprovement": number, "conflictElimination": number }
  }
}`;

  const userPrompt = `Analyse this domiciliary care schedule for ${input.weekDay}, ${input.weekNumber}.

TEAM TOTALS
- Workers on shift: ${totalWorkers}
- Total calls: ${totalCalls}
- Total scheduled hours: ${totalHours}h
- Workload spread (highest − lowest calls): ${callsSpread}

WORKER LOAD (sorted by calls desc)
${sortedByCalls.map((w, i) => `${i + 1}. ${vault.anonymize(w.name)} — ${w.calls} calls / ${Math.round(w.minutes / 60 * 10) / 10}h / ${w.serviceUsers} service users`).join('\n')}

UTILISATION STATS
- Average per worker: ${input.utilizationStats.avgCalls} calls, ${input.utilizationStats.avgHours}h
- Workers above target ceiling: ${input.utilizationStats.workersOverLimit}
- Workers below target floor: ${input.utilizationStats.workersUnderUtilized}

OPERATIONAL ISSUES
- Schedule conflicts (overlapping calls): ${input.conflicts}
- Travel gaps flagged (insufficient time between calls): ${input.travelGaps}
- Constraint violations recorded: ${input.constraintViolations.length}

${input.constraintViolations.length > 0
  ? `CONSTRAINT VIOLATIONS\n${input.constraintViolations.map(v => `- ${vault.anonymize(v.workerName)}: ${v.violationType} — actual ${v.actual} vs limit ${v.limit} (over by ${Math.max(0, v.actual - v.limit)})`).join('\n')}`
  : 'CONSTRAINT VIOLATIONS\n- None recorded.'}

Produce the strict JSON described in the system prompt. Reference workers by the names listed above (do not paraphrase).`;

  const response = await executeSecureTextCompletion({
    endpoint: "/api/schedule/analyze",
    feature: "schedule_analysis",
    model: getPreferredModel(),
    userContext: aiUserContext || { userId: null, username: null },
    systemPrompt,
    inputText: userPrompt,
    temperature: 0.2,
    maxCompletionTokens: 3000,
    responseFormat: { type: "json_object" },
    useCache: false,
  });

  const content = response.restoredText;
  if (!content) {
    throw new Error("No response from AI analysis");
  }

  const parsed = parseJsonFromContent(content) as ScheduleAnalysisResult | null;
  if (!parsed) {
    throw new Error("Failed to parse AI analysis response as JSON");
  }
  
  // Restore real worker names in the AI response
  return vault.restoreObject(parsed);
}

export interface ScheduleComparisonInput {
  beforeSchedule: {
    workers: Array<{ name: string; calls: number; minutes: number }>;
    conflicts: number;
    travelGaps: number;
  };
  afterSchedule: {
    workers: Array<{ name: string; calls: number; minutes: number }>;
    conflicts: number;
    travelGaps: number;
  };
  changes: {
    timeShifts: number;
    reassignments: number;
    deletions: number;
  };
}

export interface ScheduleComparisonResult {
  improvementScore: number; // -100 to 100 (negative = worse)
  summary: string;
  metrics: {
    conflictChange: number;
    travelGapChange: number;
    workloadBalance: {
      before: number;
      after: number;
      improvement: number;
    };
  };
  workerImpact: Array<{
    workerName: string;
    callsDelta: number;
    minutesDelta: number;
    impact: "positive" | "neutral" | "negative";
    note: string;
  }>;
  recommendation: string;
}

export async function compareSchedulesWithAI(
  input: ScheduleComparisonInput,
  aiUserContext?: AiUserContext
): Promise<ScheduleComparisonResult> {
  // Anonymize worker names before sending to AI
  const vault = new ScheduleNameVault();

  const beforeTotal = input.beforeSchedule.workers.reduce((s, w) => s + w.calls, 0);
  const afterTotal = input.afterSchedule.workers.reduce((s, w) => s + w.calls, 0);
  const beforeHours = Math.round(input.beforeSchedule.workers.reduce((s, w) => s + w.minutes, 0) / 60 * 10) / 10;
  const afterHours = Math.round(input.afterSchedule.workers.reduce((s, w) => s + w.minutes, 0) / 60 * 10) / 10;

  const systemPrompt = `You are evaluating whether a schedule edit improved a UK domiciliary care roster. Be ruthlessly objective — improvements must be backed by the numbers; do not reward churn for its own sake.

EVALUATION CRITERIA (in order)
1. Conflict reduction — fewer overlapping calls is the single biggest win.
2. Compliance — fewer over-limit workers / WTR breaches.
3. Workload balance — narrower call/hour spread across the team.
4. Travel efficiency — fewer flagged travel gaps.
5. Worker disruption — large reassignments without measurable benefit are negative.

SCORE (-100 to 100, integer)
- 80–100 transformational improvement.
- 40–79 clear, measurable improvement.
- 10–39 minor improvement.
- −9 to 9 neutral / cosmetic only.
- −10 to −39 mild regression.
- −40 to −79 significant regression.
- −80 to −100 severe regression (e.g. introduced conflicts, broke compliance).

OUTPUT
Return ONLY this JSON shape (no markdown):
{
  "improvementScore": number,
  "summary": string,                 // 1–2 sentences, must cite at least one before→after metric
  "metrics": {
    "conflictChange": number,        // afterConflicts − beforeConflicts (negative = better)
    "travelGapChange": number,       // afterGaps − beforeGaps (negative = better)
    "workloadBalance": { "before": number, "after": number, "improvement": number }
  },
  "workerImpact": [{ "workerName": string, "callsDelta": number, "minutesDelta": number, "impact": "positive"|"neutral"|"negative", "note": string }],
  "recommendation": string           // "Accept", "Accept with caveat: …", or "Reject because …"
}

WORKER IMPACT
- Only include workers whose calls OR minutes changed by 5%+ or whose impact materially changed. Skip unchanged workers.`;

  const userPrompt = `Compare these two schedule versions.

BEFORE (totals: ${beforeTotal} calls, ${beforeHours}h, ${input.beforeSchedule.conflicts} conflicts, ${input.beforeSchedule.travelGaps} travel gaps)
${input.beforeSchedule.workers.map(w => `- ${vault.anonymize(w.name)}: ${w.calls} calls, ${Math.round(w.minutes / 60 * 10) / 10}h`).join('\n')}

AFTER (totals: ${afterTotal} calls, ${afterHours}h, ${input.afterSchedule.conflicts} conflicts, ${input.afterSchedule.travelGaps} travel gaps)
${input.afterSchedule.workers.map(w => `- ${vault.anonymize(w.name)}: ${w.calls} calls, ${Math.round(w.minutes / 60 * 10) / 10}h`).join('\n')}

EDIT VOLUME
- Time shifts: ${input.changes.timeShifts}
- Reassignments: ${input.changes.reassignments}
- Deletions: ${input.changes.deletions}

Produce the strict JSON described in the system prompt. Compute conflictChange and travelGapChange exactly from the totals above.`;

  const response = await executeSecureTextCompletion({
    endpoint: "/api/schedule/compare",
    feature: "schedule_comparison",
    model: getPreferredModel(),
    userContext: aiUserContext || { userId: null, username: null },
    systemPrompt,
    inputText: userPrompt,
    temperature: 0.2,
    maxCompletionTokens: 2000,
    responseFormat: { type: "json_object" },
    useCache: false,
  });

  const content = response.restoredText;
  if (!content) {
    throw new Error("No response from AI comparison");
  }

  const parsed = parseJsonFromContent(content) as ScheduleComparisonResult | null;
  if (!parsed) {
    throw new Error("Failed to parse AI comparison response as JSON");
  }
  
  // Restore real worker names in the AI response
  return vault.restoreObject(parsed);
}
