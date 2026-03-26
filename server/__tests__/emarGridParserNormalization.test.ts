import test from "node:test";
import assert from "node:assert/strict";
import { extractCodesFromCell } from "../emarGridParser";

// ─── Standard short codes (direct cell content) ────────────────────────────

test("normalizes standard codes: AD, AS, R, MU, NH, FA, SA", () => {
  assert.equal(extractCodesFromCell("AD").code, "AD");
  assert.equal(extractCodesFromCell("AS").code, "AS");
  assert.equal(extractCodesFromCell("R").code, "R");
  assert.equal(extractCodesFromCell("MU").code, "MU");
  assert.equal(extractCodesFromCell("NH").code, "NH");
  assert.equal(extractCodesFromCell("FA").code, "FA");
  assert.equal(extractCodesFromCell("SA").code, "SA");
});

test("normalizes slash-separated variants: A/D, A/S, N/H, M/U, F/A, S/A, N/A", () => {
  assert.equal(extractCodesFromCell("A/D").code, "AD");
  assert.equal(extractCodesFromCell("A/S").code, "AS");
  assert.equal(extractCodesFromCell("N/H").code, "NH");
  assert.equal(extractCodesFromCell("M/U").code, "MU");
  assert.equal(extractCodesFromCell("F/A").code, "FA");
  assert.equal(extractCodesFromCell("S/A").code, "SA");
  assert.equal(extractCodesFromCell("N/A").code, "N/A");
});

test("normalizes PRN base and PRN-R variant", () => {
  assert.equal(extractCodesFromCell("PRN").code, "PRN");
  assert.equal(extractCodesFromCell("PRN-R").code, "PRN-R");
  assert.equal(extractCodesFromCell("PRN-AD").code, "PRN-AD");
  assert.equal(extractCodesFromCell("PRN-AS").code, "PRN-AS");
});

test("is case-insensitive for short code forms", () => {
  assert.equal(extractCodesFromCell("ad").code, "AD");
  assert.equal(extractCodesFromCell("prn-r").code, "PRN-R");
  assert.equal(extractCodesFromCell("Fa").code, "FA");
  assert.equal(extractCodesFromCell("n/h").code, "NH");
});

// ─── extractCodesFromCell: code + worker + time parsing ─────────────────────

test("extracts care worker initials alongside code", () => {
  const result = extractCodesFromCell("AD JB");
  assert.equal(result.code, "AD");
  assert.equal(result.careWorker, "JB");
});

test("extracts care worker initials from F/A variant", () => {
  const result = extractCodesFromCell("F/A GH");
  assert.equal(result.code, "FA");
  assert.equal(result.careWorker, "GH");
});

test("extracts time from cell content", () => {
  const result = extractCodesFromCell("AD JB 09:15");
  assert.equal(result.code, "AD");
  assert.equal(result.careWorker, "JB");
  assert.ok(result.time.includes("09:15") || result.time.includes("0915"));
});

test("returns BLANK for empty or whitespace-only input", () => {
  assert.equal(extractCodesFromCell("").code, "BLANK");
  assert.equal(extractCodesFromCell("   ").code, "BLANK");
});

test("returns BLANK for null-like values", () => {
  // extractCodesFromCell should handle falsy inputs gracefully
  const nullResult = extractCodesFromCell(null as any);
  assert.equal(nullResult.code, "BLANK");
  const undefinedResult = extractCodesFromCell(undefined as any);
  assert.equal(undefinedResult.code, "BLANK");
});

// ─── Key code validation ────────────────────────────────────────────────────

test("key mismatch: detects when code is not in allowed set", () => {
  const allowed = new Set(["AD", "AS", "R"]);
  const result = extractCodesFromCell("MU JB", allowed);
  assert.equal(result.code, "BLANK");
  assert.equal(result.keyMismatch, true);
  assert.equal(result.detectedCode, "MU");
});

test("key validation: allows codes in the allowed set", () => {
  const allowed = new Set(["AD", "AS", "R", "MU"]);
  const result = extractCodesFromCell("MU JB", allowed);
  assert.equal(result.code, "MU");
  assert.equal(result.keyMismatch, undefined);
});

test("key validation: PRN variants are individually checked", () => {
  const allowed = new Set(["AD", "PRN-R"]);
  const prnR = extractCodesFromCell("PRN-R JB", allowed);
  assert.equal(prnR.code, "PRN-R");
});

// ─── Code priority ──────────────────────────────────────────────────────────

test("picks higher priority code when multiple exist in cell", () => {
  const result = extractCodesFromCell("R");
  assert.equal(result.code, "R");
});

test("F alone normalizes to FA (Family Administered)", () => {
  const result = extractCodesFromCell("F JB");
  assert.equal(result.code, "FA");
  assert.equal(result.careWorker, "JB");
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

test("handles extra whitespace in codes", () => {
  assert.equal(extractCodesFromCell("  AD  ").code, "AD");
});

test("NA and N/A both normalize to N/A", () => {
  assert.equal(extractCodesFromCell("NA").code, "N/A");
  assert.equal(extractCodesFromCell("N/A").code, "N/A");
});

test("key mismatch reports detected code in result", () => {
  const allowed = new Set(["AD", "AS"]);
  const result = extractCodesFromCell("F/A GH", allowed);
  assert.equal(result.code, "BLANK");
  assert.equal(result.keyMismatch, true);
  assert.equal(result.detectedCode, "FA");
});

test("multiple initials: first non-code initial is the care worker", () => {
  const result = extractCodesFromCell("AD LB 14:30");
  assert.equal(result.code, "AD");
  assert.equal(result.careWorker, "LB");
  assert.ok(result.time !== "");
});

test("code with no care worker returns empty worker", () => {
  const result = extractCodesFromCell("MU");
  assert.equal(result.code, "MU");
  assert.equal(result.careWorker, "");
});

test("PRN standalone code detected", () => {
  const result = extractCodesFromCell("PRN");
  assert.equal(result.code, "PRN");
});

test("SA code (Self-Administered) detected", () => {
  const result = extractCodesFromCell("SA TP");
  assert.equal(result.code, "SA");
  assert.equal(result.careWorker, "TP");
});
