export interface VisitAuditContext {
  serviceUserName: string;
  auditPeriodStart: string;
  auditPeriodEnd: string;
  notes: string;
}

export interface VisitAuditResultLike {
  serviceUserName?: string;
  auditPeriodStart?: string;
  auditPeriodEnd?: string;
  careCalls?: unknown[];
  discrepancies?: unknown[];
  themesAndTrends?: string;
  gapsInKnowledge?: string;
  hasDiscrepancies?: boolean;
}

const parseAuditDate = (value: string) => {
  if (!value) return null;
  const match = value.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  const rawYear = match[3] ? Number(match[3]) : new Date().getFullYear();
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  const date = new Date(year, month, day);
  // Reject rolled-over dates (e.g. 31/04 → May 1st)
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatAuditDate = (date: Date) => {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()}`;
};

const parseVisitDurationMinutes = (value: string) => {
  if (!value) return null;
  const trimmed = value.trim();

  // "1h 30m", "1hr", "1.5hrs" — hours with optional minutes
  const hMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*h(?:r(?:s)?)?(?:\s*(\d+)\s*m(?:in(?:s)?)?)?$/i);
  if (hMatch) {
    const total = Math.round(Number(hMatch[1]) * 60) + (hMatch[2] ? Number(hMatch[2]) : 0);
    return total > 0 ? total : null;
  }

  // "90 mins", "45m" — plain minutes
  const mMatch = trimmed.match(/^(\d+)\s*m(?:in(?:s)?)?$/i);
  if (mMatch) {
    const total = Number(mMatch[1]);
    return total > 0 ? total : null;
  }

  // Pure numeric: integer = raw minutes, fractional (contains ".") = hours
  const numeric = Number(trimmed);
  if (!Number.isNaN(numeric)) {
    if (numeric < 0) return null;
    if (trimmed.includes(".")) return Math.round(numeric * 60);
    return Math.round(numeric);
  }

  // "H:MM" — hours and minutes
  const timeMatch = trimmed.match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    const total = Number(timeMatch[1]) * 60 + Number(timeMatch[2]);
    return total > 0 ? total : null;
  }

  return null;
};

const parseCompactVisitRows = (lines: string[]) => {
  if (!lines.length) return [];
  const headerLine = lines[0];
  if (!headerLine.startsWith("Columns:")) return [];
  const rawHeaders = headerLine.replace("Columns:", "").split("|").map((h) => h.trim());
  // Deduplicate header names by appending an index to any repeated entry
  const headerCount = new Map<string, number>();
  const headers = rawHeaders.map((h) => {
    const count = headerCount.get(h) ?? 0;
    headerCount.set(h, count + 1);
    return count === 0 ? h : `${h}#${count}`;
  });
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i += 1) {
    const values = lines[i].split("|");
    const row: Record<string, string> = {};
    headers.forEach((key, index) => {
      row[key] = values[index] || "";
    });
    rows.push(row);
  }
  return rows;
};

export function normalizeAuditContext(input: any): VisitAuditContext {
  return {
    serviceUserName: typeof input?.serviceUserName === "string" ? input.serviceUserName.trim() : "",
    auditPeriodStart: typeof input?.auditPeriodStart === "string" ? input.auditPeriodStart.trim() : "",
    auditPeriodEnd: typeof input?.auditPeriodEnd === "string" ? input.auditPeriodEnd.trim() : "",
    notes: typeof input?.notes === "string" ? input.notes.trim() : "",
  };
}

export function mergeVisitAuditResults(results: any[]) {
  const combined: any = {
    serviceUserName: "",
    auditPeriodStart: "",
    auditPeriodEnd: "",
    hasDiscrepancies: false,
    careCalls: [],
    discrepancies: [],
    themesAndTrends: "",
    gapsInKnowledge: "",
  };
  const serviceUsers = new Set<string>();
  const themes = new Set<string>();
  const gaps = new Set<string>();
  let startDate: Date | null = null;
  let endDate: Date | null = null;

  for (const result of results) {
    if (result?.serviceUserName) serviceUsers.add(String(result.serviceUserName).trim());
    if (Array.isArray(result?.careCalls)) combined.careCalls.push(...result.careCalls);
    if (Array.isArray(result?.discrepancies)) combined.discrepancies.push(...result.discrepancies);
    if (result?.hasDiscrepancies) combined.hasDiscrepancies = true;
    if (result?.themesAndTrends) themes.add(String(result.themesAndTrends).trim());
    if (result?.gapsInKnowledge) gaps.add(String(result.gapsInKnowledge).trim());

    const startRaw = result?.auditPeriodStart || "";
    const endRaw = result?.auditPeriodEnd || "";
    const start = parseAuditDate(startRaw);
    const end = parseAuditDate(endRaw);
    if (startRaw && !start) {
      console.warn("[Visit Audit] Could not parse auditPeriodStart", { value: startRaw });
    }
    if (endRaw && !end) {
      console.warn("[Visit Audit] Could not parse auditPeriodEnd", { value: endRaw });
    }
    if (start && (!startDate || start < startDate)) startDate = start;
    if (end && (!endDate || end > endDate)) endDate = end;
  }

  combined.hasDiscrepancies = combined.hasDiscrepancies || combined.discrepancies.length > 0;
  combined.serviceUserName = serviceUsers.size === 1 ? Array.from(serviceUsers)[0] : "Multiple";
  if (startDate) combined.auditPeriodStart = formatAuditDate(startDate);
  if (endDate) combined.auditPeriodEnd = formatAuditDate(endDate);
  if (!combined.auditPeriodStart) combined.auditPeriodStart = results[0]?.auditPeriodStart || "";
  if (!combined.auditPeriodEnd) combined.auditPeriodEnd = results[0]?.auditPeriodEnd || "";
  combined.themesAndTrends = Array.from(themes).filter(Boolean).join(" | ") || "No significant themes identified.";
  combined.gapsInKnowledge = Array.from(gaps).filter(Boolean).join(" | ") || "No significant gaps identified.";
  return combined;
}

export function buildDeterministicVisitAudit(lines: string[]) {
  const rows = parseCompactVisitRows(lines);
  const careCalls: any[] = [];
  const discrepancies: any[] = [];
  const serviceUsers = new Set<string>();
  const dateValues: Date[] = [];
  let locationIssues = 0;
  let durationIssues = 0;

  const justificationKeywords = [
    "hospital",
    "family",
    "refused",
    "declined",
    "requested",
    "no access",
    "emergency",
    "not home",
    "cancelled",
    "canceled",
    "service user",
    "client",
  ];

  for (const row of rows) {
    const serviceUser = row.SU || "N.N.";
    const careWorker = row.CWa || "N.N.";
    const date = row.Date || "NA";
    const expectedMinutes = parseVisitDurationMinutes(row.ExpDur || "");
    const actualMinutes = parseVisitDurationMinutes(row.ActDur || "");
    const locationValue = (row.Loc || "").toLowerCase();
    const notes = row.Notes || "";

    serviceUsers.add(serviceUser);

    const locationOK = locationValue
      ? (() => {
          const lower = locationValue.trim();
          if (/\b(not\s+ok|outside|non[- ]?compliant|no)\b/i.test(lower)) return false;
          if (lower === "y" || lower === "n") return lower === "y";
          return ["yes", "within", "compliant", "ok", "true"].some((token) => lower.includes(token));
        })()
      : true;

    const hasJustification = notes
      ? justificationKeywords.some((keyword) => notes.toLowerCase().includes(keyword))
      : false;

    const percentageStayed = expectedMinutes !== null && actualMinutes !== null && expectedMinutes > 0
      ? Math.round((actualMinutes / expectedMinutes) * 100)
      : 100;
    const durationOK = (expectedMinutes !== null && expectedMinutes > 0) ? percentageStayed >= 70 : true;
    const unjustifiedLocation = !locationOK && !hasJustification;
    const unjustifiedDuration = !durationOK && !hasJustification;
    const compliant = !unjustifiedLocation && !unjustifiedDuration;

    if (date && date.includes("/")) {
      const dateMatch = date.match(/(\d{1,2})\/(\d{1,2})/);
      if (dateMatch) {
        const day = Number(dateMatch[1]);
        const month = Number(dateMatch[2]) - 1;
        const dateObj = new Date(new Date().getFullYear(), month, day);
        if (!Number.isNaN(dateObj.getTime())) dateValues.push(dateObj);
      }
    }

    careCalls.push({
      careWorkerName: careWorker,
      date,
      locationOK,
      expectedTime: expectedMinutes !== null ? `${expectedMinutes}m` : "NA",
      actualTime: actualMinutes !== null ? `${actualMinutes}m` : "NA",
      percentageStayed,
      compliant,
      justification: hasJustification ? "Justified - see notes" : "NA",
      comment: compliant ? "NA" : "Performance discrepancy",
    });

    if (unjustifiedLocation) {
      locationIssues += 1;
      discrepancies.push({
        careWorkerName: careWorker,
        date,
        issue: "Location non-compliant (outside 200m)",
        actions: { performanceNote: true, meeting: "phone", referToManager: false },
      });
    }

    if (unjustifiedDuration) {
      durationIssues += 1;
      discrepancies.push({
        careWorkerName: careWorker,
        date,
        issue: "Stayed less than 70% of expected time",
        actions: { performanceNote: true, meeting: "phone", referToManager: false },
      });
    }
  }

  const auditPeriodStart = dateValues.length
    ? formatAuditDate(new Date(Math.min(...dateValues.map((date) => date.getTime()))))
    : "";
  const auditPeriodEnd = dateValues.length
    ? formatAuditDate(new Date(Math.max(...dateValues.map((date) => date.getTime()))))
    : "";

  const themes: string[] = [];
  if (locationIssues > 0) themes.push(`Location compliance issues: ${locationIssues}`);
  if (durationIssues > 0) themes.push(`Short visits (<70%): ${durationIssues}`);

  const gaps: string[] = [];
  if (durationIssues > 0) gaps.push("Meeting expected visit durations");
  if (locationIssues > 0) gaps.push("Location check compliance");

  return {
    serviceUserName: serviceUsers.size === 1 ? Array.from(serviceUsers)[0] : "Multiple",
    auditPeriodStart,
    auditPeriodEnd,
    hasDiscrepancies: discrepancies.length > 0,
    careCalls,
    discrepancies,
    themesAndTrends: themes.length ? themes.join("; ") : "No significant patterns found.",
    gapsInKnowledge: gaps.length ? gaps.join("; ") : "No significant gaps identified.",
  };
}

export function applyAuditHints<T extends VisitAuditResultLike>(
  result: T,
  hints: VisitAuditContext,
  normalizeServiceUserName: (name: string) => string,
): T {
  if (!result) return result;
  const hintedName = normalizeServiceUserName(hints.serviceUserName);
  if (hintedName && (!result.serviceUserName || result.serviceUserName === "N.N.")) {
    result.serviceUserName = hintedName;
  }
  if (hints.auditPeriodStart && !result.auditPeriodStart) {
    result.auditPeriodStart = hints.auditPeriodStart;
  }
  if (hints.auditPeriodEnd && !result.auditPeriodEnd) {
    result.auditPeriodEnd = hints.auditPeriodEnd;
  }
  return result;
}

export function enrichVisitResult<T extends VisitAuditResultLike>(
  result: T,
  fallback: Partial<VisitAuditResultLike>,
): T {
  if (!result || !fallback) return result;
  if (!Array.isArray(result.careCalls) || result.careCalls.length === 0) {
    result.careCalls = Array.isArray(fallback.careCalls) ? fallback.careCalls : [];
  }
  if (!Array.isArray(result.discrepancies) || result.discrepancies.length === 0) {
    result.discrepancies = Array.isArray(fallback.discrepancies) ? fallback.discrepancies : [];
  }
  if (!result.auditPeriodStart) result.auditPeriodStart = fallback.auditPeriodStart || "";
  if (!result.auditPeriodEnd) result.auditPeriodEnd = fallback.auditPeriodEnd || "";
  if (!result.serviceUserName || result.serviceUserName === "Multiple") {
    result.serviceUserName = fallback.serviceUserName || result.serviceUserName;
  }
  if (!result.themesAndTrends) result.themesAndTrends = fallback.themesAndTrends || "";
  if (!result.gapsInKnowledge) result.gapsInKnowledge = fallback.gapsInKnowledge || "";
  result.hasDiscrepancies = Array.isArray(result.discrepancies) && result.discrepancies.length > 0;
  return result;
}