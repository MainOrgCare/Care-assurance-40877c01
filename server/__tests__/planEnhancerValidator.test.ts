import test from "node:test";
import assert from "node:assert/strict";

import {
  autoCorrectPlanEnhancerResponse,
  generateValidationReport,
  validatePlanEnhancerResponse,
} from "../utils/planEnhancerValidator.ts";

test("validatePlanEnhancerResponse treats documented placeholders as warnings instead of hard failures", () => {
  const validation = validatePlanEnhancerResponse({
    riskSection1Health: {
      speech: "Not specified in documents provided",
      hearing: "Good",
    },
  });

  assert.equal(validation.valid, true);
  assert.ok(validation.warnings.some((warning) => warning.field === "speech"));
});

test("autoCorrectPlanEnhancerResponse normalizes prefixed case mismatches", () => {
  const result = autoCorrectPlanEnhancerResponse({
    riskSection1Health: {
      speech: "EXACTLY ONE OF: good",
    },
  });

  assert.equal(result.corrected.riskSection1Health.speech, "Good");
  assert.ok(result.corrections.some((correction) => correction.includes("case correction")));
});

test("validatePlanEnhancerResponse treats case-only array mismatches as warnings", () => {
  const validation = validatePlanEnhancerResponse({
    riskSection7Fire: {
      riskReasons: ["smoking", "other"],
    },
  });

  assert.equal(validation.valid, true);
  assert.equal(validation.errors.length, 0);
  assert.ok(validation.warnings.some((warning) => warning.field === "riskReasons"));
});

test("autoCorrectPlanEnhancerResponse normalizes arrays and equipment fit-for-purpose values", () => {
  const result = autoCorrectPlanEnhancerResponse({
    riskSection7Fire: {
      riskReasons: ["smoking", "other"],
    },
    riskSection4Equipment: {
      equipment: [
        { name: "Hoist", fitForPurpose: "yes" },
        { name: "Stand aid", fitForPurpose: "NO" },
      ],
    },
  });

  assert.deepEqual(result.corrected.riskSection7Fire.riskReasons, ["Smoking", "Other"]);
  assert.equal(result.corrected.riskSection4Equipment.equipment[0].fitForPurpose, "Yes");
  assert.equal(result.corrected.riskSection4Equipment.equipment[1].fitForPurpose, "No");
  assert.ok(result.corrections.some((correction) => correction.includes("riskSection7Fire.riskReasons[0]")));
  assert.ok(result.corrections.some((correction) => correction.includes("riskSection4Equipment.equipment[0].fitForPurpose")));
});

test("validatePlanEnhancerResponse rejects invalid categorical values", () => {
  const validation = validatePlanEnhancerResponse({
    riskSection7Fire: {
      riskReasons: ["Smoking", "Laser beams"],
    },
  });

  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.field === "riskReasons"));
});

test("generateValidationReport includes both errors and warnings when present", () => {
  const validation = validatePlanEnhancerResponse({
    riskSection1Health: {
      speech: "To be confirmed at initial visit",
    },
    riskSection7Fire: {
      riskReasons: ["Smoking", "Laser beams"],
    },
  });

  const report = generateValidationReport(validation);
  assert.match(report, /validation error/);
  assert.match(report, /validation warning/);
  assert.match(report, /riskSection7Fire\.riskReasons/);
});