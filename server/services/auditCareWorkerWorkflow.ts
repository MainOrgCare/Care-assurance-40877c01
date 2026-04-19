export interface AuditCareWorkerDiscrepancy {
  date: string;
  type: string;
  issue: string;
  auditId: string;
}

export interface AuditCareWorkerSummary {
  name: string;
  auditCount: number;
  discrepancyCount: number;
  discrepancies: AuditCareWorkerDiscrepancy[];
  lastSeen: string;
}

interface AuditDiscrepancyLike {
  careWorkerName?: string | null;
  date?: string | null;
  issue?: string | null;
  medication?: string | null;
}

interface VisitCareCallLike {
  careWorkerName?: string | null;
  date?: string | null;
  compliant?: boolean | null;
  comment?: string | null;
}

interface AuditResultsLike {
  discrepancies?: AuditDiscrepancyLike[] | null;
  careCalls?: VisitCareCallLike[] | null;
}

export interface AuditRecordLike {
  id: string;
  auditType?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  results?: AuditResultsLike | null;
}

const parseComparableDate = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const native = Date.parse(trimmed);
  if (!Number.isNaN(native)) return native;

  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  const rawYear = match[3] ? Number(match[3]) : new Date().getFullYear();
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  const parsed = new Date(year, month, day).getTime();
  return Number.isNaN(parsed) ? null : parsed;
};

const shouldReplaceLastSeen = (currentValue: string, nextValue: string) => {
  if (!nextValue) return false;
  if (!currentValue) return true;

  const currentTime = parseComparableDate(currentValue);
  const nextTime = parseComparableDate(nextValue);

  if (currentTime !== null && nextTime !== null) return nextTime > currentTime;
  if (currentTime === null && nextTime !== null) return true;
  if (currentTime !== null && nextTime === null) return false;

  return nextValue > currentValue;
};

const ensureWorker = (
  careWorkerMap: Map<string, AuditCareWorkerSummary>,
  rawName: string | null | undefined,
  auditDate: string,
) => {
  const name = String(rawName || "").trim();
  if (!name || name === "Code Conflict") return null;

  if (!careWorkerMap.has(name)) {
    careWorkerMap.set(name, {
      name,
      auditCount: 0,
      discrepancyCount: 0,
      discrepancies: [],
      lastSeen: auditDate,
    });
  }

  const worker = careWorkerMap.get(name)!;
  if (shouldReplaceLastSeen(worker.lastSeen, auditDate)) {
    worker.lastSeen = auditDate;
  }
  return worker;
};

export function buildCareWorkerAuditSummaries(audits: AuditRecordLike[]): AuditCareWorkerSummary[] {
  const careWorkerMap = new Map<string, AuditCareWorkerSummary>();

  for (const audit of audits) {
    const results = audit.results;
    if (!results) continue;

    const auditType = String(audit.auditType || "");
    const auditDate = String(audit.periodEnd || audit.periodStart || "").trim();

    if (auditType === "EMAR" && Array.isArray(results.discrepancies)) {
      for (const discrepancy of results.discrepancies) {
        const worker = ensureWorker(careWorkerMap, discrepancy.careWorkerName, auditDate);
        if (!worker) continue;

        worker.auditCount += 1;
        worker.discrepancyCount += 1;
        worker.discrepancies.push({
          date: String(discrepancy.date || auditDate || ""),
          type: "EMAR",
          issue: String(discrepancy.issue || discrepancy.medication || "Issue recorded").trim(),
          auditId: audit.id,
        });
      }
    }

    if (auditType === "Visit") {
      if (Array.isArray(results.careCalls)) {
        for (const call of results.careCalls) {
          const worker = ensureWorker(careWorkerMap, call.careWorkerName, auditDate);
          if (!worker) continue;

          worker.auditCount += 1;

          if (call.compliant === false) {
            worker.discrepancyCount += 1;
            worker.discrepancies.push({
              date: String(call.date || auditDate || ""),
              type: "Visit",
              issue: String(call.comment || "Non-compliant visit"),
              auditId: audit.id,
            });
          }
        }
      }

      if (Array.isArray(results.discrepancies)) {
        for (const discrepancy of results.discrepancies) {
          const worker = ensureWorker(careWorkerMap, discrepancy.careWorkerName, auditDate);
          if (!worker) continue;

          worker.discrepancyCount += 1;
          worker.discrepancies.push({
            date: String(discrepancy.date || auditDate || ""),
            type: "Visit",
            issue: String(discrepancy.issue || "Discrepancy recorded"),
            auditId: audit.id,
          });
        }
      }
    }
  }

  return Array.from(careWorkerMap.values()).sort((left, right) => right.discrepancyCount - left.discrepancyCount);
}