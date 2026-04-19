import { describe, expect, it } from "vitest";

import { buildComplianceOverview, getMonthlyAuditData, summarizeAuditAlerts } from "../complianceUtils";

describe("complianceUtils", () => {
  it("builds compliance overview totals for EMAR, Visit, discrepancies, and warnings", () => {
    const overview = buildComplianceOverview([
      {
        auditType: " EMAR ",
        results: { discrepancies: [{}, {}], warnings: [{}] },
      },
      {
        auditType: "visit",
        results: { discrepancies: [], warnings: [{}, {}] },
      },
      {
        auditType: "Other",
        results: null,
      },
    ]);

    expect(overview.totalAudits).toBe(3);
    expect(overview.emarAuditCount).toBe(1);
    expect(overview.visitAuditCount).toBe(1);
    expect(overview.totalDiscrepancies).toBe(2);
    expect(overview.totalWarnings).toBe(3);
    expect(overview.complianceRate).toBe(93);
  });

  it("returns a fully compliant baseline when there are no audits", () => {
    expect(buildComplianceOverview([]).complianceRate).toBe(100);
  });

  it("summarizes recent audit alert counts and clean state", () => {
    expect(
      summarizeAuditAlerts({ results: { discrepancies: [{}, {}], warnings: [{}] } }),
    ).toEqual({ discrepancyCount: 2, warningCount: 1, isClean: false });

    expect(summarizeAuditAlerts({ results: { discrepancies: [], warnings: [] } }).isClean).toBe(true);
  });

  it("keeps the last six months of audit data sorted chronologically", () => {
    const monthly = getMonthlyAuditData([
      { createdAt: "2025-11-03T10:00:00.000Z" },
      { createdAt: "2025-12-03T10:00:00.000Z" },
      { createdAt: "2026-01-03T10:00:00.000Z" },
      { createdAt: "2026-02-03T10:00:00.000Z" },
      { createdAt: "2026-03-03T10:00:00.000Z" },
      { createdAt: "2026-04-03T10:00:00.000Z" },
      { createdAt: "2026-05-03T10:00:00.000Z" },
      { createdAt: "2026-05-12T10:00:00.000Z" },
    ]);

    expect(monthly).toEqual([
      { month: "Dec 25", count: 1 },
      { month: "Jan 26", count: 1 },
      { month: "Feb 26", count: 1 },
      { month: "Mar 26", count: 1 },
      { month: "Apr 26", count: 1 },
      { month: "May 26", count: 2 },
    ]);
  });
});