import assert from "node:assert/strict";
import test from "node:test";

import {
  RULE_BASED_SIGNAL_GROUPS,
  buildFallbackRiskProfileSummary,
  countPersonCentredViolations,
  deescalateRiskRating,
  extractSignalLabels,
  getRuleBasedRiskTargetCount,
  hasFirstPersonMarkers,
  looksLikeStructuredRiskArtifactText,
  normalizeGeneratedRiskRows,
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

test("extractSignalLabels matches diabetes signals from hyperglycemia terminology", () => {
  const content = "Client experiences hyperglycemia episodes overnight and requires glucose monitoring.";
  assert.deepEqual(extractSignalLabels(content, [...RULE_BASED_SIGNAL_GROUPS.medicalConditions]), ["Diabetes"]);
  assert.deepEqual(
    extractSignalLabels("Client reports hyperglycemic symptoms after meals.", [...RULE_BASED_SIGNAL_GROUPS.medicalConditions]),
    ["Diabetes"],
  );
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

test("looksLikeStructuredRiskArtifactText rejects support-plan style document headers", () => {
  assert.equal(
    looksLikeStructuredRiskArtifactText(
      "Support Plan This Support Plan is for:: Date of birth: Client ID: PER9107 Address:,,,, Phone:: This plan is: a review and update support plan",
    ),
    true,
  );
  assert.equal(
    looksLikeStructuredRiskArtifactText("Client enjoys family visits and needs support to attend appointments in the community."),
    false,
  );
});

test("getRuleBasedRiskTargetCount stays conservative when evidence is weak or generic", () => {
  assert.equal(
    getRuleBasedRiskTargetCount({
      hasCategoryEvidenceTerms: false,
      evidencePool: ["Client needs support to attend appointments."],
      hasDiverseEvidence: false,
    }),
    1,
  );
  assert.equal(
    getRuleBasedRiskTargetCount({
      hasCategoryEvidenceTerms: true,
      evidencePool: ["Client needs prompts", "Client needs prompts"],
      hasDiverseEvidence: false,
    }),
    2,
  );
  assert.equal(
    getRuleBasedRiskTargetCount({
      hasCategoryEvidenceTerms: true,
      evidencePool: [
        "Needs support to attend appointments in the community.",
        "Can become socially isolated without reassurance and escort support.",
        "Needs help with shopping and maintaining social routines.",
      ],
      hasDiverseEvidence: true,
    }),
    4,
  );
  assert.equal(
    getRuleBasedRiskTargetCount({
      hasCategoryEvidenceTerms: true,
      evidencePool: new Array(20).fill("Detailed evidence statement."),
      hasDiverseEvidence: true,
    }),
    7,
  );
});

test("hasFirstPersonMarkers detects first-person language in risk text", () => {
  assert.equal(hasFirstPersonMarkers("I am at risk of falling due to my balance difficulties."), true);
  assert.equal(hasFirstPersonMarkers("My carers support me to take my medication safely."), true);
  assert.equal(hasFirstPersonMarkers("I need support to move safely around my home."), true);
  assert.equal(hasFirstPersonMarkers("The service user is at risk of falling."), false);
  assert.equal(hasFirstPersonMarkers("Client needs support with daily activities."), false);
  assert.equal(hasFirstPersonMarkers(""), false);
});

test("countPersonCentredViolations counts risks lacking first-person language", () => {
  assert.equal(
    countPersonCentredViolations([
      {
        riskDefinition: "I am at risk of falling.",
        howItsARisk: "My balance makes falls likely.",
        controlMeasures: "My care team monitor me when I mobilise.",
      },
      {
        riskDefinition: "The service user is at risk of medication errors.",
        howItsARisk: "They may take incorrect doses.",
        controlMeasures: "Staff to administer medication at all times.",
      },
    ]),
    1,
  );

  assert.equal(
    countPersonCentredViolations([
      {
        riskDefinition: "I am at risk of falling.",
        howItsARisk: "My balance makes falls likely.",
        controlMeasures: "My care team monitor me when I mobilise.",
      },
    ]),
    0,
  );
});

test("normalizeGeneratedRiskRows drops blank and near-blank risk rows", () => {
  const risks = [
    { riskDefinition: "", howItsARisk: "Something", controlMeasures: "Something" },
    { riskDefinition: "   ", howItsARisk: "Something", controlMeasures: "Something" },
    { riskDefinition: "Short", howItsARisk: "Short", controlMeasures: "Short" },
    { riskDefinition: "I am at risk of falling due to my balance difficulties.", howItsARisk: "My balance makes me unsteady.", controlMeasures: "My carer supports me." },
  ];
  const result = normalizeGeneratedRiskRows(risks);
  assert.equal(result.length, 1);
  assert.equal((result[0] as any).riskDefinition, "I am at risk of falling due to my balance difficulties.");
});

test("normalizeGeneratedRiskRows deduplicates on composite riskDefinition+howItsARisk key", () => {
  const risks = [
    {
      riskDefinition: "I am at risk of a fall due to unsteady gait.",
      howItsARisk: "My balance deteriorates when tired.",
      controlMeasures: "My care team use a gait belt.",
    },
    {
      riskDefinition: "I am at risk of a fall due to unsteady gait.",
      howItsARisk: "My balance deteriorates when tired.",
      controlMeasures: "Different control measures here.",
    },
    {
      riskDefinition: "I am at risk of skin breakdown from prolonged sitting.",
      howItsARisk: "Pressure builds on my sacrum during long periods in my chair.",
      controlMeasures: "My carers reposition me every two hours.",
    },
  ];
  const result = normalizeGeneratedRiskRows(risks);
  assert.equal(result.length, 2);
});

test("normalizeGeneratedRiskRows keeps distinct risks that share similar opening sentences", () => {
  const risks = [
    {
      riskDefinition: "I am at risk of falling when mobilising indoors.",
      howItsARisk: "My hallway is narrow and has a step that I can catch my foot on.",
      controlMeasures: "My carer walks close beside me.",
    },
    {
      riskDefinition: "I am at risk of falling when mobilising indoors.",
      howItsARisk: "My medication causes dizziness which increases my fall risk.",
      controlMeasures: "My GP has reviewed my medication.",
    },
  ];
  const result = normalizeGeneratedRiskRows(risks);
  assert.equal(result.length, 2);
});

test("normalizeGeneratedRiskRows passes through an empty array unchanged", () => {
  assert.deepEqual(normalizeGeneratedRiskRows([]), []);
});

test("normalizeGeneratedRiskRows handles non-array input gracefully", () => {
  assert.deepEqual(normalizeGeneratedRiskRows(null as unknown as unknown[]), []);
  assert.deepEqual(normalizeGeneratedRiskRows(undefined as unknown as unknown[]), []);
});

test("normalizeGeneratedRiskRows keeps rows with same definition/how but different findings", () => {
  // Bug: composite key was only def+how, so rows with the same definition and explanation
  // but different findings evidence were incorrectly deduplicated (one silently dropped).
  const risks = [
    {
      riskDefinition: "I am at risk of a fall due to unsteady gait.",
      howItsARisk: "My balance deteriorates when tired.",
      findings: "Recent fall last week on the stairs",
    },
    {
      riskDefinition: "I am at risk of a fall due to unsteady gait.",
      howItsARisk: "My balance deteriorates when tired.",
      findings: "History of vertigo documented by GP",
    },
  ];
  const result = normalizeGeneratedRiskRows(risks);
  assert.equal(result.length, 2, "Distinct findings must preserve both rows");
});
