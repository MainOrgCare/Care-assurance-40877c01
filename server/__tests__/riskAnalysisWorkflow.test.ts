import assert from "node:assert/strict";
import test from "node:test";

import {
  RULE_BASED_SIGNAL_GROUPS,
  buildFallbackRiskProfileSummary,
  deescalateRiskRating,
  extractSignalLabels,
  normalizeRiskRating,
} from "../services/riskAnalysisWorkflow";

test("normalizeRiskRating maps supported strings and falls back to Low", () => {
  assert.equal(normalizeRiskRating("HIGH RISK"), "High");
  assert.equal(normalizeRiskRating("medium concern"), "Medium");
  assert.equal(normalizeRiskRating("low"), "Low");
  assert.equal(normalizeRiskRating("unknown"), "Low");
  assert.equal(normalizeRiskRating(null), "Low");
});

test("deescalateRiskRating lowers residual ratings conservatively", () => {
  assert.equal(deescalateRiskRating("High"), "Medium");
  assert.equal(deescalateRiskRating("Medium"), "Low");
  assert.equal(deescalateRiskRating("Low"), "Low");
});

test("extractSignalLabels finds rule-based signals across medical, care and environment groups", () => {
  const content = "Client has diabetes, uses a walking frame, needs medication prompts and has stairs at home.";

  assert.deepEqual(extractSignalLabels(content, [...RULE_BASED_SIGNAL_GROUPS.medicalConditions]), ["Diabetes"]);
  assert.deepEqual(extractSignalLabels(content, [...RULE_BASED_SIGNAL_GROUPS.careActivities]), [
    "Medication support",
    "Mobility and transfers",
  ]);
  assert.deepEqual(extractSignalLabels(content, [...RULE_BASED_SIGNAL_GROUPS.environmentalFactors]), [
    "Stairs or step access",
  ]);
});

test("buildFallbackRiskProfileSummary returns default text when no signals exist", () => {
  assert.equal(
    buildFallbackRiskProfileSummary(
      { medicalConditions: [], careActivities: [], concerns: [] },
      (value) => value,
    ),
    "I need a person-centred review of my care needs based on the documents provided.",
  );
});

test("buildFallbackRiskProfileSummary includes health, support and concern segments", () => {
  const summary = buildFallbackRiskProfileSummary(
    {
      medicalConditions: ["Diabetes", "Respiratory condition"],
      careActivities: ["Medication support", "Personal care support"],
      concerns: ["Falls risk", "Infection risk"],
    },
    (value) => `FIRST:${value}`,
  );

  assert.match(summary, /^FIRST:/);
  assert.match(summary, /Diabetes/);
  assert.match(summary, /Medication support/);
  assert.match(summary, /Falls risk/);
});