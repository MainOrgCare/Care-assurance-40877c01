import { parse as parseDateFns } from "date-fns";

export type SupportPlanData = {
  provider: string | null;
  providerValid: boolean;
  startDate: string | null;
  endDate: string | null;
  times: string[];
  weeklyHours: number | null;
};

export type ServiceOrderComparisonInput = {
  summary?: {
    earliestStart?: string | null;
    latestEnd?: string | null;
    totalWeeklyHours?: number | null;
  };
  segments?: Array<{
    startDate?: string | null;
    endDate?: string | null;
    weeklyHoursTotal?: number | null;
    rows?: Array<{ startTime?: string | null; endTime?: string | null; serviceType?: string | null }>;
  }>;
};

export type SupportPlanComparison = {
  provider: string | null;
  providerValid: boolean;
  planDates: { start: string | null; end: string | null };
  serviceDates: { start: string | null; end: string | null };
  planTimes: string[];
  serviceTimes: string[];
  weeklyHours: { supportPlan: number | null; serviceOrder: number };
  weeklyHourChanges: Array<{ date: string; from: number; to: number }>;
  discrepancies: string[];
};

const normalizeDate = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const parseDateInput = (value?: string | null): Date | null => {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return normalizeDate(date);
    }
    return null;
  }

  const match = trimmed.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += 2000;

  const date = new Date(year, month - 1, day);
  if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
    return normalizeDate(date);
  }
  return null;
};

const formatDate = (date: Date): string => {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${day}/${month}/${year}`;
};

const normalizeTime = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = String(value).trim();
  const match = trimmed.match(/(\d{1,2})[:.](\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null;
  if (hours < 0 || hours > 23 || mins < 0 || mins > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};

const parseTimeToMinutes = (value?: string | null): number | null => {
  const normalized = normalizeTime(value);
  if (!normalized) return null;
  const [hours, mins] = normalized.split(":").map((v) => Number.parseInt(v, 10));
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null;
  return hours * 60 + mins;
};

export const tryParseAnyDate = (raw?: string | null): Date | null => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const parsedDirect = parseDateInput(trimmed);
  if (parsedDirect) return parsedDirect;

  const formats = [
    "d MMM yyyy",
    "d MMM yy",
    "d MMMM yyyy",
    "d MMMM yy",
    "d-MMM-yyyy",
    "d-MMM-yy",
    "d-MMMM-yyyy",
    "d-MMMM-yy",
    "dd-MM-yyyy",
    "dd.MM.yyyy",
    "dd-MMM-yyyy",
    "dd-MMM-yy",
    "dd-MMMM-yyyy",
    "dd-MMMM-yy",
  ] as const;

  for (const fmt of formats) {
    const parsed = parseDateFns(trimmed, fmt, new Date());
    if (parsed && !Number.isNaN(parsed.getTime())) {
      return normalizeDate(parsed);
    }
  }
  return null;
};

export const extractSupportPlanDataFromText = (text: string): SupportPlanData => {
  const lower = text.toLowerCase();

  const pickRelevantSupportSection = () => {
    const blocks: Array<{ text: string; start: number; score: number }> = [];
    const providerRegex = /provider\s*:\s*/gi;
    let match: RegExpExecArray | null;
    const indices: number[] = [];
    while ((match = providerRegex.exec(text)) !== null) {
      indices.push(match.index);
    }
    if (indices.length === 0) return null;

    for (let i = 0; i < indices.length; i += 1) {
      const start = indices[i];
      const end = i + 1 < indices.length ? indices[i + 1] : text.length;
      const block = text.slice(start, end);
      const blockLower = block.toLowerCase();
      let score = 0;
      if (blockLower.includes("number of hours")) score += 6;
      if (blockLower.includes("hourly cost")) score += 4;
      if (blockLower.includes("support to be provided")) score += 3;
      if (blockLower.includes("start date")) score += 2;
      if (blockLower.includes("end date")) score += 2;
      if (blockLower.includes("service status")) score += 1;
      blocks.push({ text: block, start, score });
    }

    blocks.sort((a, b) => b.score - a.score || a.start - b.start);
    return blocks[0]?.text || null;
  };

  const candidateSection = pickRelevantSupportSection();
  const sectionText = candidateSection || text;
  const sectionLower = sectionText.toLowerCase();

  // Provider detection (prefer section; keep original casing for display)
  const providerMatch =
    sectionText.match(/provider\s*:\s*([^\n\r]+)/i) || text.match(/provider\s*:\s*([^\n\r]+)/i);
  const provider = providerMatch ? providerMatch[1].trim() : null;
  const providerValid = provider ? /lawson|newcastle/i.test(provider) : false;

  // Date extraction (within section)
  const numericDatePattern = "\\d{1,2}[\\/-]\\d{1,2}[\\/-]\\d{2,4}";
  const longDatePattern = "\\d{1,2}\\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\s+\\d{2,4}";
  const dashedLongDatePattern = "\\d{1,2}[\\/-](?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\\/-]\\d{2,4}";
  const datePattern = `(?:${numericDatePattern}|${longDatePattern}|${dashedLongDatePattern})`;
  const dateRegex = new RegExp(`(${numericDatePattern})`, "g");
  const longDateRegex = new RegExp(`(${longDatePattern})`, "gi");
  const dashedLongDateRegex = new RegExp(`(${dashedLongDatePattern})`, "gi");

  const dateTokens: Array<{ value: string; index: number }> = [];
  let tokenMatch: RegExpExecArray | null;

  while ((tokenMatch = dateRegex.exec(sectionText)) !== null) {
    dateTokens.push({ value: tokenMatch[1], index: tokenMatch.index });
  }
  while ((tokenMatch = longDateRegex.exec(sectionText)) !== null) {
    dateTokens.push({ value: tokenMatch[1], index: tokenMatch.index });
  }
  while ((tokenMatch = dashedLongDateRegex.exec(sectionText)) !== null) {
    dateTokens.push({ value: tokenMatch[1], index: tokenMatch.index });
  }

  const isDobContext = (index: number) => {
    const start = Math.max(0, index - 25);
    const end = Math.min(sectionLower.length, index + 25);
    const window = sectionLower.slice(start, end);
    return window.includes("date of birth") || /\bdob\b/.test(window) || window.includes("birth");
  };

  const filteredTokens = dateTokens.filter((token) => !isDobContext(token.index));
  filteredTokens.sort((a, b) => a.index - b.index);

  const findDateByKeywords = (keywords: string[]) => {
    const keywordPattern = keywords
      .map((keyword) => keyword.trim().replace(/\s+/g, "\\s+"))
      .filter(Boolean)
      .join("|");
    if (!keywordPattern) return null;
    const regex = new RegExp(`(?:${keywordPattern})[\\s\\S]{0,80}?(${datePattern})`, "i");
    const found = sectionText.match(regex);
    return found?.[1] || null;
  };

  const startMatch = findDateByKeywords([
    "start date",
    "package start",
    "start",
    "commence",
    "commencement",
    "begin",
    "beginning",
    "from",
  ]);
  const endMatch = findDateByKeywords([
    "end date",
    "end of",
    "ending",
    "end",
    "expires",
    "expiry",
    "until",
  ]);

  const rangeRegex = new RegExp(
    `(?:from|starting|starts|start)\\s+([^\\n]{0,30}?${datePattern}[^\\n]{0,20}?)\\s+(?:to|until|through|thru)\\s+([^\\n]{0,30}?${datePattern}[^\\n]{0,20}?)`,
    "i"
  );
  const rangeMatch = sectionText.match(rangeRegex);

  const startDate = tryParseAnyDate(rangeMatch?.[1] || startMatch || filteredTokens[0]?.value || null);
  const endDate = tryParseAnyDate(rangeMatch?.[2] || endMatch || filteredTokens[filteredTokens.length - 1]?.value || null);

  // Time extraction (HH:MM and "9am"/"9:30pm")
  const timeRegex = /(\d{1,2}[:.]\d{2})/g;
  const planTimes = new Set<string>();
  while ((tokenMatch = timeRegex.exec(sectionText)) !== null) {
    const normalized = normalizeTime(tokenMatch[1]);
    if (normalized) planTimes.add(normalized);
  }

  const timeAmPmRegex = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi;
  while ((tokenMatch = timeAmPmRegex.exec(sectionText)) !== null) {
    const hours = Number(tokenMatch[1]);
    const minutes = tokenMatch[2] ? Number(tokenMatch[2]) : 0;
    const suffix = tokenMatch[3].toLowerCase();
    if (Number.isFinite(hours) && hours >= 1 && hours <= 12 && Number.isFinite(minutes) && minutes >= 0 && minutes < 60) {
      const h24 = ((hours % 12) + (suffix === "pm" ? 12 : 0)).toString().padStart(2, "0");
      const m = minutes.toString().padStart(2, "0");
      planTimes.add(`${h24}:${m}`);
    }
  }

  // Weekly hours extraction (prefer explicit "Number of hours")
  let supportPlanHours: number | null = null;
  const numberOfHoursMatch = sectionText.match(/number of hours\s*:\s*(\d+(?:\.\d+)?)/i);
  if (numberOfHoursMatch?.[1]) {
    const candidate = Number.parseFloat(numberOfHoursMatch[1]);
    if (Number.isFinite(candidate)) {
      supportPlanHours = candidate;
    }
  }

  if (supportPlanHours == null) {
    const weeklyHoursPattern =
      /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|hr)\s*(?:per\s*week|weekly|per\s*wk|\/\s*week|\/\s*wk|\bpw\b|\bp\/w\b)/i;
    const weeklyHoursMatch = sectionText.match(weeklyHoursPattern);
    if (weeklyHoursMatch && weeklyHoursMatch[1]) {
      const candidate = Number.parseFloat(weeklyHoursMatch[1]);
      if (Number.isFinite(candidate)) {
        supportPlanHours = candidate;
      }
    }
  }

  if (supportPlanHours == null) {
    const hoursRegex = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|hr)\b/gi;
    const weeklyMarkers = [
      "per week",
      "weekly",
      "per wk",
      "/week",
      "/wk",
      " pw",
      "p/w",
      "pw ",
      "a week",
      "each week",
      "perweek",
      "per-week",
      "wkly",
      "weekly hours",
    ];
    while ((tokenMatch = hoursRegex.exec(sectionText)) !== null) {
      const candidate = Number.parseFloat(tokenMatch[1]);
      if (!Number.isFinite(candidate)) continue;
      const tail = sectionText.slice(tokenMatch.index, tokenMatch.index + 64).toLowerCase();
      if (weeklyMarkers.some((marker) => tail.includes(marker))) {
        supportPlanHours = candidate;
        break;
      }
      if (supportPlanHours == null) {
        supportPlanHours = candidate;
      }
    }
  }

  if (supportPlanHours == null) {
    const weeklyLine = sectionText.match(/weekly\s+hours[^\d]{0,12}(\d+(?:\.\d+)?)/i);
    if (weeklyLine?.[1]) {
      const candidate = Number.parseFloat(weeklyLine[1]);
      if (Number.isFinite(candidate)) supportPlanHours = candidate;
    }
  }

  return {
    provider,
    providerValid,
    startDate: startDate ? formatDate(startDate) : null,
    endDate: endDate ? formatDate(endDate) : null,
    times: Array.from(planTimes).sort(),
    weeklyHours: supportPlanHours,
  };
};

export const compareSupportPlanToServiceOrders = (
  plan: SupportPlanData,
  orders: ServiceOrderComparisonInput
): SupportPlanComparison => {
  const discrepancies: string[] = [];

  const segments = orders.segments || [];
  const hourTolerance = 0.25;

  const formatHoursValue = (value: number): string => {
    const rounded = Math.round(value * 100) / 100;
    if (Number.isInteger(rounded)) return `${rounded.toFixed(0)}h`;
    return `${rounded.toFixed(2)}h`;
  };

  const normalizeWeeklyHours = (value?: number | null): number | null => {
    if (value == null) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
  };

  const normalizedSegments = segments
    .map((seg) => {
      const start = tryParseAnyDate(seg.startDate || null);
      const end = tryParseAnyDate(seg.endDate || null);
      if (!start || !end) return null;
      return {
        start,
        end,
        startText: seg.startDate || formatDate(start),
        endText: seg.endDate || formatDate(end),
        weeklyHours: normalizeWeeklyHours(seg.weeklyHoursTotal ?? null),
        rows: seg.rows || [],
      };
    })
    .filter(Boolean) as Array<{
    start: Date;
    end: Date;
    startText: string;
    endText: string;
    weeklyHours: number | null;
    rows: Array<{ startTime?: string | null; endTime?: string | null; serviceType?: string | null }>;
  }>;

  normalizedSegments.sort((a, b) => a.start.getTime() - b.start.getTime());

  const serviceEarliest = tryParseAnyDate(orders.summary?.earliestStart || null) || normalizedSegments[0]?.start || null;
  const serviceLatest =
    tryParseAnyDate(orders.summary?.latestEnd || null) || (normalizedSegments.length ? normalizedSegments[normalizedSegments.length - 1].end : null);

  const planStartDate = plan.startDate ? tryParseAnyDate(plan.startDate) : null;
  const planEndDate = plan.endDate ? tryParseAnyDate(plan.endDate) : null;
  const coverageStart = planStartDate || serviceEarliest;
  const coverageEnd = planEndDate || serviceLatest;

  const segmentsInCoverage = normalizedSegments.filter((seg) => {
    if (!coverageStart || !coverageEnd) return true;
    return seg.start.getTime() <= coverageEnd.getTime() && seg.end.getTime() >= coverageStart.getTime();
  });
  const effectiveSegments = segmentsInCoverage.length ? segmentsInCoverage : normalizedSegments;

  const serviceOrderHours = (() => {
    const latestSegment = effectiveSegments.length ? effectiveSegments[effectiveSegments.length - 1] : null;
    if (latestSegment?.weeklyHours != null) return latestSegment.weeklyHours;
    if (Number.isFinite(orders.summary?.totalWeeklyHours || NaN)) {
      return Number(orders.summary!.totalWeeklyHours);
    }
    const total = normalizedSegments.reduce((sum, seg) => sum + (seg.weeklyHours || 0), 0);
    return total;
  })();

  const serviceTimes = new Set<string>();
  for (const seg of effectiveSegments.length ? effectiveSegments : normalizedSegments) {
    for (const row of seg.rows || []) {
      const start = normalizeTime(row.startTime || undefined);
      const end = normalizeTime(row.endTime || undefined);
      if (start && end) serviceTimes.add(`${start}-${end}`);
    }
  }

  if (!plan.startDate && serviceEarliest) {
    discrepancies.push("Support plan start date not found; check file formatting.");
  }
  if (!plan.endDate && serviceLatest) {
    discrepancies.push("Support plan end date not found; check file formatting.");
  }
  if (plan.times.length === 0 && serviceTimes.size > 0) {
    discrepancies.push("Support plan visit times not detected; cannot compare time windows.");
  }

  if (!plan.provider) {
    discrepancies.push("Support plan provider not found.");
  } else if (!plan.providerValid) {
    discrepancies.push(`Provider "${plan.provider}" is not Lawson or Newcastle.`);
  }

  if (plan.startDate && planStartDate && serviceEarliest) {
    if (planStartDate.getTime() > serviceEarliest.getTime()) {
      discrepancies.push(`Support plan starts later (${plan.startDate}) than service order (${formatDate(serviceEarliest)}).`);
    }
  }

  if (plan.endDate && planEndDate && serviceLatest) {
    if (planEndDate.getTime() < serviceLatest.getTime()) {
      discrepancies.push(`Support plan ends earlier (${plan.endDate}) than service order (${formatDate(serviceLatest)}).`);
    }
  }

  const planTimes = new Set(plan.times);
  for (const window of serviceTimes) {
    const [start, end] = window.split("-");
    if (!planTimes.has(start) && !planTimes.has(end) && !planTimes.has(window)) {
      discrepancies.push(`Service order time ${window} not found in support plan.`);
    }
  }

  for (const t of planTimes) {
    if (![...serviceTimes].some((w) => w.startsWith(t) || w.endsWith(t) || w === t)) {
      discrepancies.push(`Support plan time ${t} not present in service order schedule.`);
    }
  }

  const planWeeklyHours = Number.isFinite(plan.weeklyHours) ? Number(plan.weeklyHours) : null;
  const hourSegments = effectiveSegments.filter((seg) => seg.weeklyHours != null);
  if (planWeeklyHours == null && hourSegments.length > 0) {
    discrepancies.push("Support plan weekly hours not detected; cannot compare hours.");
  }

  const distinctHours: number[] = [];
  hourSegments.forEach((seg) => {
    const hours = seg.weeklyHours!;
    if (!distinctHours.some((value) => Math.abs(value - hours) <= hourTolerance)) {
      distinctHours.push(hours);
    }
  });

  const changePoints: Array<{ dateText: string; from: number; to: number }> = [];
  for (let i = 1; i < hourSegments.length; i += 1) {
    const prev = hourSegments[i - 1];
    const curr = hourSegments[i];
    if (Math.abs(prev.weeklyHours! - curr.weeklyHours!) > hourTolerance) {
      changePoints.push({
        dateText: curr.startText,
        from: prev.weeklyHours!,
        to: curr.weeklyHours!,
      });
    }
  }

  const weeklyHourChanges = changePoints.map((change) => ({
    date: change.dateText,
    from: change.from,
    to: change.to,
  }));

  if (planWeeklyHours != null && hourSegments.length > 0) {
    if (distinctHours.length <= 1) {
      const diff = Math.abs(planWeeklyHours - (hourSegments[0]?.weeklyHours ?? 0));
      if (diff > hourTolerance) {
        discrepancies.push(
          `Weekly hours differ: support plan ${formatHoursValue(planWeeklyHours)} vs service order ${formatHoursValue(
            hourSegments[0]?.weeklyHours ?? serviceOrderHours
          )}.`
        );
      }
    } else if (changePoints.length > 0) {
      changePoints.forEach((change) => {
        discrepancies.push(
          `Service order weekly hours change on ${change.dateText}: ${formatHoursValue(change.from)} \u2192 ${formatHoursValue(
            change.to
          )}, but support plan lists ${formatHoursValue(planWeeklyHours)}.`
        );
      });
    }
  } else if (planWeeklyHours != null && hourSegments.length === 0) {
    const diff = Math.abs(planWeeklyHours - serviceOrderHours);
    if (diff > hourTolerance) {
      discrepancies.push(
        `Weekly hours differ: support plan ${formatHoursValue(planWeeklyHours)} vs service order ${formatHoursValue(serviceOrderHours)}.`
      );
    }
  } else if (planWeeklyHours == null && changePoints.length > 0) {
    changePoints.forEach((change) => {
      discrepancies.push(
        `Service order weekly hours change on ${change.dateText}: ${formatHoursValue(change.from)} \u2192 ${formatHoursValue(
          change.to
        )}, but support plan does not specify weekly hours.`
      );
    });
  }

  return {
    provider: plan.provider,
    providerValid: plan.providerValid,
    planDates: { start: plan.startDate, end: plan.endDate },
    serviceDates: {
      start: serviceEarliest ? formatDate(serviceEarliest) : null,
      end: serviceLatest ? formatDate(serviceLatest) : null,
    },
    planTimes: Array.from(planTimes).sort(),
    serviceTimes: Array.from(serviceTimes).sort(),
    weeklyHours: {
      supportPlan: plan.weeklyHours ?? null,
      serviceOrder: serviceOrderHours,
    },
    weeklyHourChanges,
    discrepancies,
  };
};
