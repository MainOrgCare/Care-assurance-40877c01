export interface PlanEnhancerSourceDocumentLike {
  label: string;
  name: string;
  contentLength: number;
  isParsing: boolean;
  parseError?: string;
}

export interface PlanEnhancerSourceSummary {
  total: number;
  ready: number;
  parsing: number;
  failed: number;
}

export interface PlanEnhancerTokenAssessment {
  supportingTokens: number;
  carePlanTokens: number;
  totalContentTokens: number;
  maxTokens: number;
  percentUsed: number;
  excessTokens: number;
  excessKilobytes: number;
  isOverLimit: boolean;
  exceedsWarningThreshold: boolean;
}

export const PLAN_ENHANCER_TOKEN_LIMITS: Record<string, number> = {
  github: 10000,
  openai: 80000,
  local: 40000,
};

export function estimatePlanEnhancerTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function summarizePlanEnhancerSources(
  sourceDocuments: PlanEnhancerSourceDocumentLike[],
): PlanEnhancerSourceSummary {
  return {
    total: sourceDocuments.length,
    ready: sourceDocuments.filter((document) => document.contentLength > 0 && !document.parseError && !document.isParsing).length,
    parsing: sourceDocuments.filter((document) => document.isParsing).length,
    failed: sourceDocuments.filter((document) => Boolean(document.parseError)).length,
  };
}

export function collectPlanEnhancerParseErrors(sourceDocuments: PlanEnhancerSourceDocumentLike[]) {
  return sourceDocuments
    .filter((document) => Boolean(document.parseError))
    .map((document) => ({
      label: document.label,
      name: document.name,
      message: document.parseError || "Parsing failed",
    }));
}

export function hasPlanEnhancerData(
  sourceDocuments: PlanEnhancerSourceDocumentLike[],
  hasAdditionalNotes: boolean,
  hasUpdateNotes: boolean,
): boolean {
  return Boolean(sourceDocuments.length > 0 || hasAdditionalNotes || hasUpdateNotes);
}

export function assessPlanEnhancerPayloadSize(options: {
  supportingContent: string;
  carePlanContent?: string;
  activeProvider: string;
}): PlanEnhancerTokenAssessment {
  const supportingTokens = estimatePlanEnhancerTokens(options.supportingContent);
  const carePlanTokens = options.carePlanContent ? estimatePlanEnhancerTokens(options.carePlanContent) : 0;
  const totalContentTokens = supportingTokens + carePlanTokens;
  const maxTokens = PLAN_ENHANCER_TOKEN_LIMITS[options.activeProvider] ?? PLAN_ENHANCER_TOKEN_LIMITS.github;
  const excessTokens = Math.max(0, totalContentTokens - maxTokens);

  return {
    supportingTokens,
    carePlanTokens,
    totalContentTokens,
    maxTokens,
    percentUsed: Math.round((totalContentTokens / maxTokens) * 100),
    excessTokens,
    excessKilobytes: Math.ceil((excessTokens * 4) / 1024),
    isOverLimit: totalContentTokens > maxTokens,
    exceedsWarningThreshold: totalContentTokens > maxTokens * 0.8,
  };
}

export function buildPlanEnhancerTokenLimitError(assessment: PlanEnhancerTokenAssessment): string {
  return (
    `Document content is too large (~${Math.ceil(assessment.totalContentTokens / 1000)}K tokens, limit is ${Math.ceil(assessment.maxTokens / 1000)}K tokens). ` +
    `Your content exceeds the limit by ~${assessment.excessKilobytes}KB. ` +
    `\n\nPlease reduce content by:\n` +
    `• Uploading only the most relevant pages/sections\n` +
    `• Removing redundant or outdated documents\n` +
    `• Summarizing lengthy medical histories\n` +
    `• Splitting into multiple care plan generations\n\n` +
    `Or switch AI provider in Secret Admin Portal for higher limits.`
  );
}