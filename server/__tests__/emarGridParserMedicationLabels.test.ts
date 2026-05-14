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