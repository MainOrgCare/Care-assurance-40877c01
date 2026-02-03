import { createChatCompletionWithLogging, type AiUserContext } from "./aiClient";

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
${input.workers.map((w, i) => `${i + 1}. ${w.name}: ${w.calls} calls, ${Math.round(w.minutes / 60 * 10) / 10}h, ${w.serviceUsers} service users`).join('\n')}

UTILIZATION STATS:
- Average: ${input.utilizationStats.avgCalls} calls/worker, ${input.utilizationStats.avgHours}h/worker
- Under-utilized workers: ${input.utilizationStats.workersUnderUtilized}
- Over-limit workers: ${input.utilizationStats.workersOverLimit}

ISSUES:
- Schedule conflicts: ${input.conflicts}
- Travel gaps detected: ${input.travelGaps}
- Constraint violations: ${input.constraintViolations.length}

${input.constraintViolations.length > 0 ? `CONSTRAINT VIOLATIONS:\n${input.constraintViolations.map(v => `- ${v.workerName}: ${v.violationType} - ${v.actual} exceeds limit of ${v.limit}`).join('\n')}` : ''}

Provide comprehensive analysis with actionable recommendations to optimize this schedule.`;

  const response = await createChatCompletionWithLogging(
    {
      model: "gpt-5.2",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_completion_tokens: 3000,
      response_format: { type: "json_object" },
    },
    "schedule_analysis",
    aiUserContext
  );

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from AI analysis");
  }

  const parsed = JSON.parse(content) as ScheduleAnalysisResult;
  return parsed;
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
${input.beforeSchedule.workers.map(w => `- ${w.name}: ${w.calls} calls, ${Math.round(w.minutes / 60 * 10) / 10}h`).join('\n')}
Conflicts: ${input.beforeSchedule.conflicts}, Travel gaps: ${input.beforeSchedule.travelGaps}

AFTER:
${input.afterSchedule.workers.map(w => `- ${w.name}: ${w.calls} calls, ${Math.round(w.minutes / 60 * 10) / 10}h`).join('\n')}
Conflicts: ${input.afterSchedule.conflicts}, Travel gaps: ${input.afterSchedule.travelGaps}

CHANGES: ${input.changes.timeShifts} time shifts, ${input.changes.reassignments} reassignments, ${input.changes.deletions} deletions

Evaluate if this optimization improved the schedule.`;

  const response = await createChatCompletionWithLogging(
    {
      model: "gpt-5.2",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
      max_completion_tokens: 2000,
      response_format: { type: "json_object" },
    },
    "schedule_comparison",
    aiUserContext
  );

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from AI comparison");
  }

  return JSON.parse(content) as ScheduleComparisonResult;
}
