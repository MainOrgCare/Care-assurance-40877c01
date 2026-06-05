import test from "node:test";
import assert from "node:assert/strict";
import {
  validateAndNormalizeCompliance,
  EMAR_CODES,
} from "../services/emarComplianceValidator.ts";

const NOW = "2026-01-01T00:00:00.000Z";

test("recomputes summary counts and ignores the model's self-reported totals", () => {
  const raw = {
    records: [
      { date: "2026-01-01", timeSlot: "08:00", medicine: "Paracetamol", code: "R", careWorker: "L.Barron", requiresVerification: false, inferredFromSameSlot: false, notes: null },
      { date: "2026-01-01", timeSlot: "12:00", medicine: "Paracetamol", code: "SA", careWorker: "L.Barron", requiresVerification: false, inferredFromSameSlot: false, notes: null },
      { date: "2026-01-01", timeSlot: "18:00", medicine: "Paracetamol", code: "R", careWorker: "M.Smith", requiresVerification: false, inferredFromSameSlot: false, notes: null },
    ],
    allCareWorkers: ["L.Barron"],
    trendWarnings: [],
    // Deliberately wrong, model-supplied aggregates.
    summary: { totalRecords: 99, byCode: { R: 1, SA: 0, F: 0, NH: 0, MU: 0 } },
  };

  const result = validateAndNormalizeCompliance(raw, { now: NOW });

  assert.equal(result.summary.totalRecords, 3);
  assert.equal(result.summary.byCode.R, 2);
  assert.equal(result.summary.byCode.SA, 1);
  // allCareWorkers reconciled to the union of record workers + listed workers.
  assert.deepEqual(result.allCareWorkers, ["L.Barron", "M.Smith"]);
  assert.equal(result.integrity.normalized, true);
  assert.ok(result.integrity.corrections.some((c) => c.includes("summary.totalRecords")));
  assert.ok(result.integrity.corrections.some((c) => c.includes("summary.byCode.R")));
});

test("forces requiresVerification=true for NH codes", () => {
  const raw = {
    records: [
      { date: "2026-01-01", timeSlot: "08:00", medicine: "Insulin", code: "NH", careWorker: "L.Barron", requiresVerification: false, inferredFromSameSlot: false, notes: null },
    ],
    allCareWorkers: [],
    trendWarnings: [],
    summary: { totalRecords: 1, byCode: { R: 0, SA: 0, F: 0, NH: 1, MU: 0 } },
  };

  const result = validateAndNormalizeCompliance(raw, { now: NOW });

  assert.equal(result.records[0].requiresVerification, true);
  assert.equal(result.integrity.verificationRequiredCount, 1);
  assert.equal(result.integrity.requiresHumanReview, true);
});

test("forces requiresVerification=true for blank (null) codes", () => {
  const raw = {
    records: [
      { date: "2026-01-01", timeSlot: "08:00", medicine: "Insulin", code: null, careWorker: null, requiresVerification: false, inferredFromSameSlot: false, notes: null },
    ],
    allCareWorkers: [],
    trendWarnings: [],
    summary: { totalRecords: 1, byCode: { R: 0, SA: 0, F: 0, NH: 0, MU: 0 } },
  };

  const result = validateAndNormalizeCompliance(raw, { now: NOW });

  assert.equal(result.records[0].requiresVerification, true);
  assert.equal(result.integrity.nullCodeCount, 1);
});

test("clamps invalid codes to null and records a correction", () => {
  const raw = {
    records: [
      { date: "2026-01-01", timeSlot: "08:00", medicine: "Insulin", code: "ZZ", careWorker: "L.Barron", requiresVerification: false, inferredFromSameSlot: false, notes: null },
    ],
    allCareWorkers: [],
    trendWarnings: [],
    summary: { totalRecords: 1, byCode: { R: 0, SA: 0, F: 0, NH: 0, MU: 0 } },
  };

  const result = validateAndNormalizeCompliance(raw, { now: NOW });

  assert.equal(result.records[0].code, null);
  assert.equal(result.records[0].requiresVerification, true);
  assert.ok(result.integrity.corrections.some((c) => c.includes("invalid code")));
});

test("normalizes lowercase codes to canonical uppercase", () => {
  const raw = {
    records: [
      { date: "2026-01-01", timeSlot: "08:00", medicine: "Insulin", code: "sa", careWorker: "L.Barron", requiresVerification: false, inferredFromSameSlot: false, notes: null },
    ],
    allCareWorkers: [],
    trendWarnings: [],
    summary: { totalRecords: 1, byCode: { R: 0, SA: 1, F: 0, NH: 0, MU: 0 } },
  };

  const result = validateAndNormalizeCompliance(raw, { now: NOW });
  assert.equal(result.records[0].code, "SA");
  assert.equal(result.summary.byCode.SA, 1);
});

test("clears inferredFromSameSlot when careWorker is empty", () => {
  const raw = {
    records: [
      { date: "2026-01-01", timeSlot: "08:00", medicine: "Insulin", code: "R", careWorker: "  ", requiresVerification: false, inferredFromSameSlot: true, notes: null },
    ],
    allCareWorkers: [],
    trendWarnings: [],
    summary: { totalRecords: 1, byCode: { R: 1, SA: 0, F: 0, NH: 0, MU: 0 } },
  };

  const result = validateAndNormalizeCompliance(raw, { now: NOW });
  assert.equal(result.records[0].careWorker, null);
  assert.equal(result.records[0].inferredFromSameSlot, false);
});

test("flags a baseline mismatch when AI populated record count diverges from the grid", () => {
  const raw = {
    records: [
      { date: "2026-01-01", timeSlot: "08:00", medicine: "Insulin", code: "R", careWorker: "L.Barron", requiresVerification: false, inferredFromSameSlot: false, notes: null },
    ],
    allCareWorkers: ["L.Barron"],
    trendWarnings: [],
    summary: { totalRecords: 1, byCode: { R: 1, SA: 0, F: 0, NH: 0, MU: 0 } },
  };

  const result = validateAndNormalizeCompliance(raw, {
    now: NOW,
    gridBaseline: { dateCount: 7, timeSlotCount: 3, medicationCount: 2, cellCount: 5 },
  });

  assert.ok(result.integrity.baselineCrossCheck);
  assert.equal(result.integrity.baselineCrossCheck?.mismatched, true);
  assert.equal(result.integrity.requiresHumanReview, true);
  assert.ok(result.integrity.confidence < 0.75);
});

test("clean result with matching grid baseline is high confidence and needs no review", () => {
  const raw = {
    records: [
      { date: "2026-01-01", timeSlot: "08:00", medicine: "Insulin", code: "R", careWorker: "L.Barron", requiresVerification: false, inferredFromSameSlot: false, notes: null },
      { date: "2026-01-01", timeSlot: "12:00", medicine: "Insulin", code: "R", careWorker: "L.Barron", requiresVerification: false, inferredFromSameSlot: false, notes: null },
    ],
    allCareWorkers: ["L.Barron"],
    trendWarnings: [],
    summary: { totalRecords: 2, byCode: { R: 2, SA: 0, F: 0, NH: 0, MU: 0 } },
  };

  const result = validateAndNormalizeCompliance(raw, {
    now: NOW,
    gridBaseline: { dateCount: 1, timeSlotCount: 2, medicationCount: 1, cellCount: 2 },
  });

  assert.equal(result.integrity.normalized, false);
  assert.equal(result.integrity.requiresHumanReview, false);
  assert.equal(result.integrity.confidence, 1);
  assert.equal(result.integrity.baselineCrossCheck?.mismatched, false);
});

test("handles non-object / malformed input safely", () => {
  const result = validateAndNormalizeCompliance(null, { now: NOW });
  assert.deepEqual(result.records, []);
  assert.equal(result.summary.totalRecords, 0);
  assert.deepEqual(result.summary.byCode, { R: 0, SA: 0, F: 0, NH: 0, MU: 0 });
  assert.equal(result.integrity.confidence, 0);
  assert.equal(result.integrity.requiresHumanReview, true);
  assert.ok(result.integrity.warnings.length > 0);
});

test("dedupes and sorts trend warnings", () => {
  const raw = {
    records: [],
    allCareWorkers: [],
    trendWarnings: ["  Late dose  ", "Late dose", "Missed dose"],
    summary: { totalRecords: 0, byCode: { R: 0, SA: 0, F: 0, NH: 0, MU: 0 } },
  };
  const result = validateAndNormalizeCompliance(raw, { now: NOW });
  assert.deepEqual(result.trendWarnings, ["Late dose", "Missed dose"]);
});

test("EMAR_CODES is the canonical enum", () => {
  assert.deepEqual([...EMAR_CODES], ["R", "SA", "F", "NH", "MU"]);
});

test("drops allCareWorkers entries not backed by any record (hallucination guard)", () => {
  const raw = {
    records: [
      { date: "2026-01-01", timeSlot: "08:00", medicine: "Insulin", code: "R", careWorker: "L.Barron", requiresVerification: false, inferredFromSameSlot: false, notes: null },
    ],
    allCareWorkers: ["L.Barron", "Z.Ghost"],
    trendWarnings: [],
    summary: { totalRecords: 1, byCode: { R: 1, SA: 0, F: 0, NH: 0, MU: 0 } },
  };
  const result = validateAndNormalizeCompliance(raw, { now: NOW });
  assert.deepEqual(result.allCareWorkers, ["L.Barron"]);
  assert.ok(result.integrity.corrections.some((c) => c.includes("Z.Ghost")));
});

test("flags a non-anonymized (full name) care worker for verification", () => {
  const raw = {
    records: [
      { date: "2026-01-01", timeSlot: "08:00", medicine: "Insulin", code: "R", careWorker: "John Smith", requiresVerification: false, inferredFromSameSlot: false, notes: null },
    ],
    allCareWorkers: ["John Smith"],
    trendWarnings: [],
    summary: { totalRecords: 1, byCode: { R: 1, SA: 0, F: 0, NH: 0, MU: 0 } },
  };
  const result = validateAndNormalizeCompliance(raw, { now: NOW });
  assert.equal(result.records[0].requiresVerification, true);
  assert.ok(result.integrity.corrections.some((c) => c.includes("not anonymized")));
  assert.equal(result.integrity.requiresHumanReview, true);
});

test("an excess of AI records over grid cells is informational, not a hard mismatch", () => {
  const raw = {
    records: [
      { date: "2026-01-01", timeSlot: "08:00", medicine: "Insulin", code: "R", careWorker: "L.Barron", requiresVerification: false, inferredFromSameSlot: false, notes: null },
      { date: "2026-01-01", timeSlot: "12:00", medicine: "Insulin", code: "R", careWorker: "L.Barron", requiresVerification: false, inferredFromSameSlot: false, notes: null },
    ],
    allCareWorkers: ["L.Barron"],
    trendWarnings: [],
    summary: { totalRecords: 2, byCode: { R: 2, SA: 0, F: 0, NH: 0, MU: 0 } },
  };
  const result = validateAndNormalizeCompliance(raw, {
    now: NOW,
    gridBaseline: { dateCount: 1, timeSlotCount: 2, medicationCount: 1, cellCount: 1 },
  });
  assert.equal(result.integrity.baselineCrossCheck?.mismatched, false);
  assert.equal(result.integrity.requiresHumanReview, false);
});
