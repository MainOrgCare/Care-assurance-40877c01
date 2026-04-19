import {
  analyzeRiskLevel,
  calculatePlanQuality,
  extractCarePlanSections,
  extractCommonFields,
  extractContinenceInfo,
  extractEnvironmentInfo,
  extractMedicationInfo,
  extractNutritionInfo,
  extractPersonalCareNeeds,
  generateBasicSummary,
  getRecommendedAssessments,
} from "./ruleBasedEngine";

export function computeAverageSectionConfidence(sections: Record<string, { confidence: number }>): number {
  const values = Object.values(sections);
  if (values.length === 0) return 0;
  const total = values.reduce((sum, section) => sum + (typeof section.confidence === "number" ? section.confidence : 0), 0);
  return total / values.length;
}

export function shouldSuggestCareDataAIEnhancement(extractionConfidence: number, requiresAI: boolean): boolean {
  return extractionConfidence < 0.6 || requiresAI;
}

export function getPlanQualityGrade(score: number): "Good" | "Fair" | "Needs Work" {
  if (score >= 80) return "Good";
  if (score >= 60) return "Fair";
  return "Needs Work";
}

export function shouldSuggestPlanQualityAIEnhancement(score: number, feedbackCount: number): boolean {
  return score < 70 || feedbackCount > 2;
}

export function buildPlanQualityCheckResult(planContent: string) {
  const quality = calculatePlanQuality(planContent);
  const extractedFields = extractCommonFields(planContent);
  const riskAnalysis = analyzeRiskLevel(planContent);

  return {
    score: quality.score,
    grade: getPlanQualityGrade(quality.score),
    feedback: quality.feedback,
    suggestAIEnhancement: shouldSuggestPlanQualityAIEnhancement(quality.score, quality.feedback.length),
    detectedRisk: riskAnalysis.level,
    detectedFields: extractedFields,
  };
}

export function buildExtractCareDataResult(documentContent: string) {
  const sections = extractCarePlanSections(documentContent);
  const medications = extractMedicationInfo(documentContent);
  const personalCare = extractPersonalCareNeeds(documentContent);
  const continence = extractContinenceInfo(documentContent);
  const nutrition = extractNutritionInfo(documentContent);
  const environment = extractEnvironmentInfo(documentContent);
  const overallRisk = analyzeRiskLevel(documentContent);
  const recommendedAssessments = getRecommendedAssessments({
    sections,
    medications,
    personalCare,
    continence,
    nutrition,
    environment,
  });

  const basicSummaries = Object.fromEntries(
    Object.entries({ personalCare, continence, nutrition }).map(([section, data]) => [
      section,
      generateBasicSummary(section, data),
    ]),
  );

  const extractionConfidence = computeAverageSectionConfidence(sections);
  const suggestAIEnhancement = shouldSuggestCareDataAIEnhancement(extractionConfidence, overallRisk.requiresAI);

  return {
    success: true,
    rulesBased: true,
    sections,
    medications,
    personalCare,
    continence,
    nutrition,
    environment,
    overallRiskLevel: overallRisk.level,
    overallRiskConfidence: overallRisk.confidence,
    riskKeywords: overallRisk.matchedKeywords,
    recommendedAssessments,
    basicSummaries,
    extractionConfidence,
    suggestAIEnhancement,
    aiEnhancementReason: suggestAIEnhancement
      ? extractionConfidence < 0.6
        ? "Low extraction confidence"
        : "Complex risk factors detected"
      : null,
  };
}