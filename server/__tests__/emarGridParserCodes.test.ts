import test from "node:test";
import assert from "node:assert/strict";
import { extractCodesFromCell } from "../emarGridParser";

test("extractCodesFromCell normalizes FA/F-A/F-A forms to FA", () => {
  const plain = extractCodesFromCell("FA");
  assert.equal(plain.code, "FA");
  assert.equal(plain.careWorker, "");
  assert.equal(plain.time, "");

  const slashed = extractCodesFromCell("F/A GH");
  assert.equal(slashed.code, "FA");
  assert.equal(slashed.careWorker, "GH");
  assert.equal(slashed.time, "");
});

test("extractCodesFromCell reports key mismatch when code is not in allowed key set", () => {
  const allowedCodes = new Set<string>(["AD", "AS"]);
  const result = extractCodesFromCell("F/A GH", allowedCodes);

  assert.equal(result.code, "BLANK");
  assert.equal(result.keyMismatch, true);
  assert.equal(result.detectedCode, "FA");
});

test("extractCodesFromCell preserves normalized code, time, and initials from one cell", () => {
  const result = extractCodesFromCell("08:45 F/A GH");

  assert.equal(result.code, "FA");
  assert.equal(result.time, "08:45");
  assert.equal(result.careWorker, "GH");
});

test("extractCodesFromCell treats x-only markups as blank entries", () => {
  const result = extractCodesFromCell("× ×");

  assert.equal(result.code, "BLANK");
  assert.equal(result.careWorker, "");
  assert.equal(result.time, "");
});
