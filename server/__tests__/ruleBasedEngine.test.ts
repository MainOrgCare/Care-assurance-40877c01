import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeRiskLevel,
  calculatePlanQuality,
  extractCarePlanSections,
  extractMedicationInfo,
  getRecommendedAssessments,
  shouldUseAI,
} from "../services/ruleBasedEngine.ts";

test("analyzeRiskLevel ignores negated high-risk phrases and uses medium indicators", () => {
  const result = analyzeRiskLevel("The client denies self-harm, has no aggression, and mobilises with a walking frame indoors.");

  assert.equal(result.level, "Medium");
  assert.ok(result.matchedKeywords.includes("walking frame"));
  assert.ok(!result.matchedKeywords.includes("self-harm"));
});

test("analyzeRiskLevel falls back to AI when no rule-based risk keywords are present", () => {
  const result = analyzeRiskLevel("The notes describe general wellbeing and family visits without clinical or mobility detail.");

  assert.equal(result.level, "Medium");
  assert.equal(result.requiresAI, true);
  assert.equal(result.matchedKeywords.length, 0);
});

test("analyzeRiskLevel keeps low-risk summaries deterministic without AI", () => {
  const result = analyzeRiskLevel("The client is independent, self-medicating, mobile, alert, continent, and has strong family support.");

  assert.equal(result.level, "Low");
  assert.equal(result.requiresAI, false);
  assert.ok(result.matchedKeywords.includes("independent"));
});

test("shouldUseAI skips AI for simple extractions when rule-based fields are available", () => {
  const decision = shouldUseAI(
    "simple_extraction",
    "Good memory, stable mood, fully mobile, and clear speech throughout the visit.",
  );

  assert.equal(decision.useAI, false);
  assert.equal(decision.reason, "Rule-based extraction sufficient");
  assert.equal(decision.ruleBasedResult.memory, "Good");
  assert.equal(decision.ruleBasedResult.moods, "Stable");
});

test("extractCarePlanSections groups content into relevant care-plan sections", () => {
  const sections = extractCarePlanSections(
    "Diagnosis includes COPD and hypertension. Medication is provided in a dosette box. The home has a key safe and stairs at the front entrance.",
  );

  assert.ok(sections.health);
  assert.ok(sections.medication);
  assert.ok(sections.environment);
  assert.equal(sections.health.riskLevel, "Medium");
});

test("calculatePlanQuality rewards specific first-person content and penalizes placeholders", () => {
  const strong = calculatePlanQuality(
    "I take 10mg morphine at 08:00 and 20:00. My carers support me with a stand aid for transfers and record each visit in detail.",
  );
  const weak = calculatePlanQuality("Care plan to be completed as needed with [Name] and some appropriate support.");

  assert.ok(strong.score > weak.score);
  assert.ok(strong.feedback.some((item) => item.includes("specific measurements")));
  assert.ok(weak.feedback.some((item) => item.includes("first person")));
  assert.ok(weak.feedback.some((item) => item.includes("placeholders")));
});

test("extractMedicationInfo captures monitoring and frequency for common medicines", () => {
  const medications = extractMedicationInfo(
    "Warfarin is taken oral once daily and requires INR blood test monitoring. Morphine is available as required and stored as a controlled drug.",
  );

  const warfarin = medications.find((medication) => medication.name === "warfarin");
  const morphine = medications.find((medication) => medication.name === "morphine");

  assert.ok(warfarin);
  assert.equal(warfarin?.frequency, "once daily");
  assert.equal(warfarin?.needsMonitoring, true);
  assert.ok(morphine);
  assert.equal(morphine?.frequency, "as required");
  assert.equal(morphine?.isControlled, true);
});

test("getRecommendedAssessments adds targeted follow-up assessments for higher-risk inputs", () => {
  const recommended = getRecommendedAssessments({
    environment: { smoker: true, equipment: ["hoist"] },
    mobility: { mobilityLevel: "High" },
    nutrition: { nutritionRisk: "High" },
    continence: { bladderRisk: "High" },
  });

  assert.ok(recommended.includes("Fire Risk Assessment"));
  assert.ok(recommended.includes("Equipment Safety Check"));
  assert.ok(recommended.includes("Pressure Ulcer Risk Assessment (Waterlow)"));
  assert.ok(recommended.includes("Malnutrition Universal Screening Tool (MUST)"));
  assert.ok(recommended.includes("Continence Assessment"));
});