import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAuditHints,
  buildDeterministicVisitAudit,
  enrichVisitResult,
  mergeVisitAuditResults,
  normalizeAuditContext,
} from "../services/visitAuditWorkflow";

test("buildDeterministicVisitAudit flags location and duration discrepancies", () => {
  const result = buildDeterministicVisitAudit([
    "Columns:SU|CWa|Date|ExpDur|ActDur|Loc|Notes",
    "J.S.|M.Smith|03/04|30|15|outside|",
  ]);

  assert.equal(result.serviceUserName, "J.S.");
  assert.equal(result.hasDiscrepancies, true);
  assert.equal(result.careCalls.length, 1);
  assert.equal(result.careCalls[0].percentageStayed, 50);
  assert.equal(result.careCalls[0].compliant, false);
  assert.equal(result.discrepancies.length, 2);
  assert.match(result.themesAndTrends, /Location compliance issues: 1/);
  assert.match(result.themesAndTrends, /Short visits/);
});

test("buildDeterministicVisitAudit keeps justified short visits compliant", () => {
  const result = buildDeterministicVisitAudit([
    "Columns:SU|CWa|Date|ExpDur|ActDur|Loc|Notes",
    "J.S.|A.Brown|04/04|45|20|yes|Service user requested early finish due to family visit",
  ]);

  assert.equal(result.hasDiscrepancies, false);
  assert.equal(result.discrepancies.length, 0);
  assert.equal(result.careCalls[0].compliant, true);
  assert.equal(result.careCalls[0].justification, "Justified - see notes");
});

test("buildDeterministicVisitAudit converts fractional-hour durations into minute-based audit rows", () => {
  const result = buildDeterministicVisitAudit([
    "Columns:SU|CWa|Date|ExpDur|ActDur|Loc|Notes",
    "J.S.|A.Brown|04/04|0.5|0.25|yes|",
  ]);

  assert.equal(result.careCalls[0].expectedTime, "30m");
  assert.equal(result.careCalls[0].actualTime, "15m");
  assert.equal(result.careCalls[0].percentageStayed, 50);
  assert.equal(result.hasDiscrepancies, true);
});

test("mergeVisitAuditResults combines audit windows and detects multiple service users", () => {
  const merged = mergeVisitAuditResults([
    {
      serviceUserName: "J.S.",
      auditPeriodStart: "03/04/2026",
      auditPeriodEnd: "05/04/2026",
      hasDiscrepancies: false,
      careCalls: [{ careWorkerName: "A.Brown" }],
      discrepancies: [],
      themesAndTrends: "Timing stable",
      gapsInKnowledge: "No gaps",
    },
    {
      serviceUserName: "M.T.",
      auditPeriodStart: "01/04/2026",
      auditPeriodEnd: "07/04/2026",
      hasDiscrepancies: true,
      careCalls: [{ careWorkerName: "M.Smith" }],
      discrepancies: [{ careWorkerName: "M.Smith", issue: "Short visit" }],
      themesAndTrends: "Duration variance",
      gapsInKnowledge: "Duration checks",
    },
  ]);

  assert.equal(merged.serviceUserName, "Multiple");
  assert.equal(merged.auditPeriodStart, "01/04/2026");
  assert.equal(merged.auditPeriodEnd, "07/04/2026");
  assert.equal(merged.hasDiscrepancies, true);
  assert.equal(merged.careCalls.length, 2);
  assert.equal(merged.discrepancies.length, 1);
  assert.match(merged.themesAndTrends, /Timing stable/);
  assert.match(merged.themesAndTrends, /Duration variance/);
});

test("mergeVisitAuditResults preserves a single service-user name across overlapping windows", () => {
  const merged = mergeVisitAuditResults([
    {
      serviceUserName: "J.S.",
      auditPeriodStart: "05/04/2026",
      auditPeriodEnd: "06/04/2026",
      hasDiscrepancies: false,
      careCalls: [{ careWorkerName: "A.Brown" }],
      discrepancies: [],
      themesAndTrends: "Stable schedule",
      gapsInKnowledge: "No gaps",
    },
    {
      serviceUserName: "J.S.",
      auditPeriodStart: "04/04/2026",
      auditPeriodEnd: "07/04/2026",
      hasDiscrepancies: false,
      careCalls: [{ careWorkerName: "M.Smith" }],
      discrepancies: [],
      themesAndTrends: "Good location compliance",
      gapsInKnowledge: "No gaps",
    },
  ]);

  assert.equal(merged.serviceUserName, "J.S.");
  assert.equal(merged.auditPeriodStart, "04/04/2026");
  assert.equal(merged.auditPeriodEnd, "07/04/2026");
  assert.equal(merged.careCalls.length, 2);
});

test("normalizeAuditContext trims fields and applyAuditHints fills only missing values", () => {
  const hints = normalizeAuditContext({
    serviceUserName: "  Jane Smith  ",
    auditPeriodStart: " 01/04/2026 ",
    auditPeriodEnd: " 07/04/2026 ",
    notes: "  operator note  ",
  });

  assert.deepEqual(hints, {
    serviceUserName: "Jane Smith",
    auditPeriodStart: "01/04/2026",
    auditPeriodEnd: "07/04/2026",
    notes: "operator note",
  });

  const filled = applyAuditHints(
    { serviceUserName: "N.N.", auditPeriodStart: "", auditPeriodEnd: "", discrepancies: [] },
    hints,
    (name) => `normalized:${name}`,
  );
  assert.equal(filled.serviceUserName, "normalized:Jane Smith");
  assert.equal(filled.auditPeriodStart, "01/04/2026");
  assert.equal(filled.auditPeriodEnd, "07/04/2026");

  const preserved = applyAuditHints(
    { serviceUserName: "J.S.", auditPeriodStart: "02/04/2026", auditPeriodEnd: "03/04/2026", discrepancies: [] },
    hints,
    (name) => `normalized:${name}`,
  );
  assert.equal(preserved.serviceUserName, "J.S.");
  assert.equal(preserved.auditPeriodStart, "02/04/2026");
  assert.equal(preserved.auditPeriodEnd, "03/04/2026");
});

test("enrichVisitResult backfills empty audit results without overwriting populated values", () => {
  const enriched = enrichVisitResult(
    {
      serviceUserName: "Multiple",
      auditPeriodStart: "",
      auditPeriodEnd: "",
      careCalls: [],
      discrepancies: [],
      themesAndTrends: "",
      gapsInKnowledge: "",
      hasDiscrepancies: false,
    },
    {
      serviceUserName: "J.S.",
      auditPeriodStart: "01/04/2026",
      auditPeriodEnd: "02/04/2026",
      careCalls: [{ careWorkerName: "A.Brown" }],
      discrepancies: [{ careWorkerName: "A.Brown", issue: "Short visit" }],
      themesAndTrends: "Short visits",
      gapsInKnowledge: "Duration checks",
    },
  );

  assert.equal(enriched.serviceUserName, "J.S.");
  assert.equal(enriched.auditPeriodStart, "01/04/2026");
  assert.equal(enriched.auditPeriodEnd, "02/04/2026");
  assert.equal(enriched.careCalls.length, 1);
  assert.equal(enriched.discrepancies.length, 1);
  assert.equal(enriched.hasDiscrepancies, true);
});

test("buildDeterministicVisitAudit flags zero-minute actual visit as non-compliant", () => {
  const result = buildDeterministicVisitAudit([
    "Columns:SU|CWa|Date|ExpDur|ActDur|Loc|Notes",
    "J.S.|A.Brown|05/04|30|0|yes|",
  ]);

  assert.equal(result.careCalls[0].actualTime, "0m");
  assert.equal(result.careCalls[0].percentageStayed, 0);
  assert.equal(result.careCalls[0].compliant, false);
  assert.equal(result.hasDiscrepancies, true);
});

test("buildDeterministicVisitAudit treats justified location non-compliance as compliant", () => {
  const result = buildDeterministicVisitAudit([
    "Columns:SU|CWa|Date|ExpDur|ActDur|Loc|Notes",
    "J.S.|A.Brown|05/04|30|25|outside|Service user requested care outside usual location due to hospital appointment",
  ]);

  assert.equal(result.careCalls[0].compliant, true);
  assert.equal(result.careCalls[0].justification, "Justified - see notes");
  assert.equal(result.discrepancies.length, 0);
  assert.equal(result.hasDiscrepancies, false);
});

test("buildDeterministicVisitAudit correctly rejects 'not ok' location as non-compliant", () => {
  const result = buildDeterministicVisitAudit([
    "Columns:SU|CWa|Date|ExpDur|ActDur|Loc|Notes",
    "J.S.|A.Brown|05/04|30|30|not ok|",
  ]);

  assert.equal(result.careCalls[0].locationOK, false);
  assert.equal(result.careCalls[0].compliant, false);
  assert.ok(result.discrepancies.some((d) => /location/i.test(d.issue)));
});