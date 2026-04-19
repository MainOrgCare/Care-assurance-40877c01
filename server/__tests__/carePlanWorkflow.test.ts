import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExtractCareDataResult,
  buildPlanQualityCheckResult,
  computeAverageSectionConfidence,
  getPlanQualityGrade,
  shouldSuggestCareDataAIEnhancement,
  shouldSuggestPlanQualityAIEnhancement,
} from "../services/carePlanWorkflow";

test("computeAverageSectionConfidence returns 0 for empty sections and averages present confidences", () => {
  assert.equal(computeAverageSectionConfidence({}), 0);
  assert.equal(
    computeAverageSectionConfidence({
      mobility: { confidence: 0.9 },
      medication: { confidence: 0.3 },
      nutrition: { confidence: 0.6 },
    }),
    0.6,
  );
});

test("care-data AI suggestion triggers for low confidence or explicit complex risk", () => {
  assert.equal(shouldSuggestCareDataAIEnhancement(0.59, false), true);
  assert.equal(shouldSuggestCareDataAIEnhancement(0.8, true), true);
  assert.equal(shouldSuggestCareDataAIEnhancement(0.8, false), false);
});

test("plan-quality grading and AI suggestion thresholds are stable", () => {
  assert.equal(getPlanQualityGrade(80), "Good");
  assert.equal(getPlanQualityGrade(60), "Fair");
  assert.equal(getPlanQualityGrade(59), "Needs Work");

  assert.equal(shouldSuggestPlanQualityAIEnhancement(69, 0), true);
  assert.equal(shouldSuggestPlanQualityAIEnhancement(85, 3), true);
  assert.equal(shouldSuggestPlanQualityAIEnhancement(85, 2), false);
});

test("buildExtractCareDataResult returns rule-based extraction output with audit metadata", () => {
  const result = buildExtractCareDataResult(`
    Mrs Jane Smith needs support with personal care, dressing and continence care.
    She uses a Zimmer frame for mobility and takes warfarin every evening.
    She is diabetic and at risk of falls. She requires meal prompts and hydration monitoring.
  `);

  assert.equal(result.success, true);
  assert.equal(result.rulesBased, true);
  assert.equal(typeof result.extractionConfidence, "number");
  assert.equal(Array.isArray(result.medications), true);
  assert.equal(Array.isArray(result.recommendedAssessments), true);
  assert.equal(typeof result.basicSummaries.personalCare, "string");
  assert.equal(typeof result.basicSummaries.continence, "string");
  assert.equal(typeof result.basicSummaries.nutrition, "string");
  assert.equal(typeof result.overallRiskLevel, "string");
  assert.equal(Array.isArray(result.riskKeywords), true);
  assert.equal(
    result.aiEnhancementReason === null ||
      result.aiEnhancementReason === "Low extraction confidence" ||
      result.aiEnhancementReason === "Complex risk factors detected",
    true,
  );
});

test("buildPlanQualityCheckResult preserves score, grade and audit suggestion contract", () => {
  const result = buildPlanQualityCheckResult(`
    My name is Jane Smith. I need support with washing, dressing, medication and meals.
    I use a walking frame and need carers to monitor fall risks and report any concerns.
  `);

  assert.equal(typeof result.score, "number");
  assert.equal(["Good", "Fair", "Needs Work"].includes(result.grade), true);
  assert.equal(Array.isArray(result.feedback), true);
  assert.equal(typeof result.suggestAIEnhancement, "boolean");
  assert.equal(typeof result.detectedRisk, "string");
  assert.equal(typeof result.detectedFields, "object");
});