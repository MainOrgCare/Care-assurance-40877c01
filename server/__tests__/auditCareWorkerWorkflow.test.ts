import assert from "node:assert/strict";
import test from "node:test";

import { buildCareWorkerAuditSummaries } from "../services/auditCareWorkerWorkflow";

test("buildCareWorkerAuditSummaries counts EMAR discrepancies as audited activity and skips Code Conflict", () => {
  const result = buildCareWorkerAuditSummaries([
    {
      id: "audit-emar",
      auditType: "EMAR",
      periodEnd: "30/03/2026",
      results: {
        discrepancies: [
          { careWorkerName: "A. Brown", date: "29/03/2026", medication: "Paracetamol" },
          { careWorkerName: "Code Conflict", date: "29/03/2026", issue: "Ignore me" },
        ],
      },
    },
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].name, "A. Brown");
  assert.equal(result[0].auditCount, 1);
  assert.equal(result[0].discrepancyCount, 1);
  assert.equal(result[0].emarDiscrepancyCount, 1);
  assert.equal(result[0].visitAuditCount, 0);
  assert.equal(result[0].visitDiscrepancyCount, 0);
  assert.equal(result[0].discrepancies[0].type, "EMAR");
  assert.equal(result[0].discrepancies[0].issue, "Paracetamol");
});

test("buildCareWorkerAuditSummaries keeps the latest seen date using chronological comparison and visit activity", () => {
  const result = buildCareWorkerAuditSummaries([
    {
      id: "audit-emar",
      auditType: "EMAR",
      periodEnd: "30/03/2026",
      results: {
        discrepancies: [{ careWorkerName: "A. Brown", date: "30/03/2026", issue: "Missed dose" }],
      },
    },
    {
      id: "audit-visit",
      auditType: "Visit",
      periodEnd: "02/04/2026",
      results: {
        careCalls: [
          { careWorkerName: "A. Brown", date: "02/04/2026", compliant: false, comment: "Late arrival" },
          { careWorkerName: "B. Green", date: "02/04/2026", compliant: true },
        ],
        discrepancies: [{ careWorkerName: "A. Brown", date: "02/04/2026", issue: "Short visit" }],
      },
    },
  ]);

  const brown = result.find((worker) => worker.name === "A. Brown");
  const green = result.find((worker) => worker.name === "B. Green");

  assert.ok(brown);
  assert.equal(brown.auditCount, 2);
  assert.equal(brown.discrepancyCount, 2);
  // Visit-specific counts: 1 call (non-compliant) + EMAR-specific count: 1
  assert.equal(brown.visitAuditCount, 1);
  assert.equal(brown.visitDiscrepancyCount, 1);
  assert.equal(brown.emarDiscrepancyCount, 1);
  assert.equal(brown.lastSeen, "02/04/2026");

  assert.ok(green);
  assert.equal(green.auditCount, 1);
  assert.equal(green.discrepancyCount, 0);
  assert.equal(green.visitAuditCount, 1);
  assert.equal(green.visitDiscrepancyCount, 0);
  assert.equal(green.emarDiscrepancyCount, 0);
  assert.equal(green.lastSeen, "02/04/2026");
});