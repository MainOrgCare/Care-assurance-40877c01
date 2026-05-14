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
  
  const systemPrompt = `You are an expert care scheduling analyst with deep knowledge of UK care facility operations, workforce management, and compliance requirements. Your role is to analyze care worker schedules and provide actionable insights to improve efficiency, reduce burnout, and ensure quality care delivery.

ANALYSIS FRAMEWORK:
1. Workload Distribution - Identify imbalances, overloaded workers, underutilization
2. Operational Efficiency - Travel time, schedule gaps, call sequencing
3. Care Quality - Time-critical calls, service user continuity, double-up coverage
4. Compliance - Working time regulations, constraint violations, break requirements

SCORING CRITERIA (0-100):
- 90-100: Excellent - Highly optimized, minimal issues
- 75-89: Good - Well-structured with minor improvements possible
- 60-74: Fair - Functional but significant optimization opportunities
- 40-59: Poor - Major issues requiring immediate attention
- 0-39: Critical - Severe problems affecting care delivery

OUTPUT REQUIREMENTS:
1. Overall Score (0-100) with clear justification
2. Insights - Categorized observations (positive, warning, critical)
3. Recommendations - Prioritized actions ranked 1-10 by impact
4. Predictive Analysis - Burnout risks, bottlenecks, optimization potential

FORMAT: JSON only. Be concise but specific. Include worker names and quantifiable metrics.`;

  const userPrompt = `Analyze this care worker schedule for ${input.weekDay}, ${input.weekNumber}:

WORKFORCE SUMMARY:
${input.workers.map((w, i) => `${i + 1}. ${vault.anonymize(w.name)}: ${w.calls} calls, ${Math.round(w.minutes / 60 * 10) / 10}h, ${w.serviceUsers} service users`).join('\n')}

UTILIZATION STATS:
- Average: ${input.utilizationStats.avgCalls} calls/worker, ${input.utilizationStats.avgHours}h/worker
- Under-utilized workers: ${input.utilizationStats.workersUnderUtilized}
- Over-limit workers: ${input.utilizationStats.workersOverLimit}

ISSUES:
- Schedule conflicts: ${input.conflicts}
- Travel gaps detected: ${input.travelGaps}
- Constraint violations: ${input.constraintViolations.length}

${input.constraintViolations.length > 0 ? `CONSTRAINT VIOLATIONS:\n${input.constraintViolations.map(v => `- ${vault.anonymize(v.workerName)}: ${v.violationType} - ${v.actual} exceeds limit of ${v.limit}`).join('\n')}` : ''}

Provide comprehensive analysis with actionable recommendations to optimize this schedule.`;

  const response = await executeSecureTextCompletion({
    endpoint: "/api/schedule/analyze",
    feature: "schedule_analysis",
    model: getPreferredModel(),
    userContext: aiUserContext || { userId: null, username: null },
    systemPrompt,
    inputText: userPrompt,
    temperature: 0.7,
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

  const systemPrompt = `You are an expert at evaluating schedule optimizations for care facilities. Compare before/after schedules and determine if the changes improved the schedule quality.

EVALUATION CRITERIA:
1. Conflict reduction (high priority)
2. Workload balance improvement
3. Travel efficiency gains
4. Minimal disruption to workers

IMPROVEMENT SCORE (-100 to 100):
- 80-100: Excellent improvements
- 40-79: Good improvements
- 10-39: Minor improvements
- -9 to 9: Neutral (no meaningful change)
- -10 to -39: Minor degradation
- -40 to -79: Significant degradation
- -80 to -100: Severe degradation

FORMAT: JSON only with quantifiable metrics.`;

  const userPrompt = `Compare these schedule versions:

BEFORE:
${input.beforeSchedule.workers.map(w => `- ${vault.anonymize(w.name)}: ${w.calls} calls, ${Math.round(w.minutes / 60 * 10) / 10}h`).join('\n')}
Conflicts: ${input.beforeSchedule.conflicts}, Travel gaps: ${input.beforeSchedule.travelGaps}

AFTER:
${input.afterSchedule.workers.map(w => `- ${vault.anonymize(w.name)}: ${w.calls} calls, ${Math.round(w.minutes / 60 * 10) / 10}h`).join('\n')}
Conflicts: ${input.afterSchedule.conflicts}, Travel gaps: ${input.afterSchedule.travelGaps}

CHANGES: ${input.changes.timeShifts} time shifts, ${input.changes.reassignments} reassignments, ${input.changes.deletions} deletions

Evaluate if this optimization improved the schedule.`;

  const response = await executeSecureTextCompletion({
    endpoint: "/api/schedule/compare",
    feature: "schedule_comparison",
    model: getPreferredModel(),
    userContext: aiUserContext || { userId: null, username: null },
    systemPrompt,
    inputText: userPrompt,
    temperature: 0.5,
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
