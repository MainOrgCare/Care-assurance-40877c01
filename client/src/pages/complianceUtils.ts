export interface ComplianceAuditResultsLike {
  discrepancies?: unknown[] | null;
  warnings?: unknown[] | null;
}

export interface ComplianceAuditLike {
  auditType?: string | null;
  createdAt?: string | null;
  periodEnd?: string | null;
  periodStart?: string | null;
  results?: ComplianceAuditResultsLike | null;
}

export interface ComplianceOverview {
  totalAudits: number;
  emarAuditCount: number;
  visitAuditCount: number;
  totalDiscrepancies: number;
  totalWarnings: number;
  complianceRate: number;
  auditTypeData: Array<{ name: string; value: number; color: string }>;
}

const getAuditCollectionLength = (value: unknown): number => (Array.isArray(value) ? value.length : 0);

const normalizeAuditType = (value: unknown): string => String(value || "").trim().toLowerCase();

export function summarizeAuditAlerts(audit: ComplianceAuditLike) {
  const discrepancyCount = getAuditCollectionLength(audit?.results?.discrepancies);
  const warningCount = getAuditCollectionLength(audit?.results?.warnings);

  return {
    discrepancyCount,
    warningCount,
    isClean: discrepancyCount === 0 && warningCount === 0,
  };
}

export function buildComplianceOverview(audits: ComplianceAuditLike[]): ComplianceOverview {
  const auditList = Array.isArray(audits) ? audits : [];
  const emarAuditCount = auditList.filter((audit) => normalizeAuditType(audit.auditType) === "emar").length;
  const visitAuditCount = auditList.filter((audit) => normalizeAuditType(audit.auditType) === "visit").length;

  const totalDiscrepancies = auditList.reduce((sum, audit) => sum + summarizeAuditAlerts(audit).discrepancyCount, 0);
  const totalWarnings = auditList.reduce((sum, audit) => sum + summarizeAuditAlerts(audit).warningCount, 0);
  const totalAudits = auditList.length;
  const complianceRate = totalAudits > 0
    ? Math.max(0, Math.min(100, Math.round(100 - (totalDiscrepancies / totalAudits) * 10)))
    : 100;

  return {
    totalAudits,
    emarAuditCount,
    visitAuditCount,
    totalDiscrepancies,
    totalWarnings,
    complianceRate,
    auditTypeData: [
      { name: "EMAR Audits", value: emarAuditCount, color: "hsl(var(--primary))" },
      { name: "Visit Audits", value: visitAuditCount, color: "hsl(var(--secondary))" },
    ],
  };
}

export function getMonthlyAuditData(audits: ComplianceAuditLike[]) {
  const monthCounts: Record<string, { label: string; count: number; sortKey: number }> = {};

  audits.forEach((audit) => {
    const rawDate = audit.createdAt || audit.periodEnd || audit.periodStart;
    const date = rawDate ? new Date(rawDate) : null;
    if (!date || Number.isNaN(date.getTime())) return;

    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!monthCounts[monthKey]) {
      monthCounts[monthKey] = {
        label: date.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        count: 0,
        sortKey: date.getFullYear() * 100 + date.getMonth(),
      };
    }
    monthCounts[monthKey].count += 1;
  });

  return Object.values(monthCounts)
    .sort((left, right) => left.sortKey - right.sortKey)
    .slice(-6)
    .map(({ label, count }) => ({ month: label, count }));
}