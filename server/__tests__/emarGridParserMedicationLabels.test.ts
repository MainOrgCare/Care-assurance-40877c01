import test from "node:test";
import assert from "node:assert/strict";

import { splitMedicationLabel } from "../emarGridParser";

test("splitMedicationLabel keeps medication salts in the medication name", () => {
  const result = splitMedicationLabel("Morphine Sulfate 10mg tablets take one at night");

  assert.equal(result.name, "Morphine Sulfate 10mg tablets");
  assert.equal(result.instructions, "take one at night");
});

test("splitMedicationLabel keeps compound medication names when no instructions are present", () => {
  const result = splitMedicationLabel("0.9% Sodium Chloride solution");

  assert.equal(result.name, "Sodium Chloride solution");
  assert.equal(result.instructions, "");
});

test("splitMedicationLabel still treats dose fragments as instruction-only text", () => {
  const result = splitMedicationLabel("10mg -");

  assert.equal(result.name, "");
  assert.equal(result.instructions, "10mg -");
});
test("splitMedicationLabel treats a dose line led by a typo'd instruction verb as instructions, not a medication", () => {
  // Real-world source typo: "Taker ONE tablet on am visit" (should read "Take ONE…").
  // Without handling, "Taker" leaks in as a phantom medication name.
  const result = splitMedicationLabel("Taker ONE tablet on am visit");

  assert.equal(result.name, "");
  assert.equal(result.instructions, "Taker ONE tablet on am visit");
});

test("splitMedicationLabel treats other instruction-verb inflections as instructions", () => {
  for (const verb of ["Takes", "Taking", "Applies", "Giving", "Using"]) {
    const result = splitMedicationLabel(`${verb} one tablet daily`);
    assert.equal(result.name, "", `${verb} should not be a medication name`);
  }
});
