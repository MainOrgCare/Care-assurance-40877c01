const BILLING_DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type BillingDayKey = (typeof BILLING_DAY_KEYS)[number];
export type BillingDayCounts = Record<BillingDayKey, number>;

export type BillingRowInput = {
  startDate?: string | null;
  start_date?: string | null;
  start?: string | null;
  endDate?: string | null;
  end_date?: string | null;
  end?: string | null;
  startTime?: string | null;
  start_time?: string | null;
  startTimeText?: string | null;
  endTime?: string | null;
  end_time?: string | null;
  endTimeText?: string | null;
  duration?: string | null;
  durationText?: string | null;
  duration_minutes?: string | number | null;
  durationMinutes?: string | number | null;
  mon?: string | number | null;
  monday?: string | number | null;
  monQty?: string | number | null;
  mon_qty?: string | number | null;
  tue?: string | number | null;
  tuesday?: string | number | null;
  tueQty?: string | number | null;
  tue_qty?: string | number | null;
  wed?: string | number | null;
  wednesday?: string | number | null;
  wedQty?: string | number | null;
  wed_qty?: string | number | null;
  thu?: string | number | null;
  thursday?: string | number | null;
  thuQty?: string | number | null;
  thu_qty?: string | number | null;
  fri?: string | number | null;
  friday?: string | number | null;
  friQty?: string | number | null;
  fri_qty?: string | number | null;
  sat?: string | number | null;
  saturday?: string | number | null;
  satQty?: string | number | null;
  sat_qty?: string | number | null;
  sun?: string | number | null;
  sunday?: string | number | null;
  sunQty?: string | number | null;
  sun_qty?: string | number | null;
  occursEveryWeeks?: string | number | null;
  occurs_every_weeks?: string | number | null;
  occursEvery?: string | number | null;
  occursEveryWeek?: string | number | null;
  serviceType?: string | null;
  service_type?: string | null;
  service?: string | null;
  serviceTypeName?: string | null;
  [key: string]: unknown;
};

export type BillingSegmentRow = {
  id: string;
  startDate: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
  durationText: string | null;
  occursEveryWeeks: number;
  serviceType: string | null;
  dayCounts: BillingDayCounts;
  weeklyHours: number | null;
  warnings?: string[];
};

export type BillingSegment = {
  id: string;
  startDate: string;
  endDate: string;
  days: number;
  weeklyHoursTotal: number;
  rows: BillingSegmentRow[];
};

export type BillingAnalysisResult = {
  summary: {
    imageCount: number;
    rowCount: number;
    segmentsCount: number;
    analysisEndDate: string | null;
    warnings?: string[];
    skippedRows?: number;
  };
  segments: BillingSegment[];
};

export type AnalyzeBillingRowsOptions = {
  analysisEndDate: Date;
  analysisAsOfDate?: Date | null;
  imageCount?: number;
  extractionWarnings?: string[];
};

type NormalizedBillingRow = {
  id: string;
  startDate: Date;
  endDate: Date | null;
  startDateText: string;
  endDateText: string | null;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
  durationText: string | null;
  occursEveryWeeks: number;
  serviceType: string | null;
  dayCounts: BillingDayCounts;
  weeklyMinutes: number | null;
  warnings: string[];
  wasEndDateMissing: boolean;
  effectiveEndDate?: Date;
};

const normalizeDate = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const addDays = (date: Date, amount: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return normalizeDate(next);
};

const differenceInDays = (start: Date, end: Date): number => {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((normalizeDate(end).getTime() - normalizeDate(start).getTime()) / msPerDay);
};

const startOfWeekMonday = (date: Date): Date => {
  const day = date.getDay();
  const diff = (day + 6) % 7;
  return addDays(normalizeDate(date), -diff);
};

export const parseDateInput = (value?: string | null): Date | null => {
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

const parseInteger = (value: any): number => {
  if (value === null || value === undefined) return 0;
  const match = String(value).match(/-?\d+/);
  if (!match) return 0;
  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : 0;
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

const parseDurationMinutes = (value?: string | null): number | null => {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const timeMatch = trimmed.match(/(\d{1,2})[:.](\d{2})/);
  if (timeMatch) {
    const hours = Number(timeMatch[1]);
    const mins = Number(timeMatch[2]);
    if (Number.isFinite(hours) && Number.isFinite(mins)) {
      return hours * 60 + mins;
    }
  }

  const hourMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*h/i);
  if (hourMatch) {
    const hours = Number(hourMatch[1]);
    if (Number.isFinite(hours)) return Math.round(hours * 60);
  }

  const minMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*m/i);
  if (minMatch) {
    const mins = Number(minMatch[1]);
    if (Number.isFinite(mins)) return Math.round(mins);
  }

  return null;
};

const formatDurationFromMinutes = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};

const getBillingDayIndex = (date: Date): number => (date.getDay() + 6) % 7;

const getBillingDayKey = (date: Date): BillingDayKey => BILLING_DAY_KEYS[getBillingDayIndex(date)];

const DAY_NAMES: Record<BillingDayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

/**
 * Detects which days have coverage (qty > 0) and which are gaps (qty = 0).
 * Returns information about partial day coverage patterns.
 */
function detectDayCoverageGaps(dayCounts: BillingDayCounts): {
  hasPartialCoverage: boolean;
  coveredDays: BillingDayKey[];
  gapDays: BillingDayKey[];
  gapDescription: string | null;
} {
  const coveredDays = BILLING_DAY_KEYS.filter((day) => dayCounts[day] > 0);
  const gapDays = BILLING_DAY_KEYS.filter((day) => dayCounts[day] === 0);
  
  // No gaps if all days have coverage or no days have coverage
  if (gapDays.length === 0 || coveredDays.length === 0) {
    return { hasPartialCoverage: false, coveredDays, gapDays, gapDescription: null };
  }
  
  // Has partial coverage - some days have values, others are gaps
  const gapDayNames = gapDays.map((d) => DAY_NAMES[d]);
  const gapDescription = `No coverage: ${gapDayNames.join(", ")}`;
  
  return {
    hasPartialCoverage: true,
    coveredDays,
    gapDays,
    gapDescription,
  };
}

/**
 * Determines if two time ranges overlap.
 * Returns true if the time brackets are the same or overlap significantly.
 */
function timeRangesOverlap(
  startA: string | null,
  endA: string | null,
  startB: string | null,
  endB: string | null
): boolean {
  // If both have exact same start time, they overlap
  if (startA && startB && startA === startB) return true;
  
  const startAMin = parseTimeToMinutes(startA);
  const endAMin = parseTimeToMinutes(endA);
  const startBMin = parseTimeToMinutes(startB);
  const endBMin = parseTimeToMinutes(endB);
  
  // If we can't parse times, can't determine overlap
  if (startAMin == null || endAMin == null || startBMin == null || endBMin == null) {
    return false;
  }
  
  // Handle overnight shifts (end < start means next-day; end === start is same-time, not 24h)
  const aStart = startAMin;
  const aEnd = endAMin < startAMin ? endAMin + 24 * 60 : endAMin;
  const bStart = startBMin;
  const bEnd = endBMin < startBMin ? endBMin + 24 * 60 : endBMin;
  
  // Check if time ranges overlap (with tolerance for boundary cases)
  // Two ranges overlap if one starts before the other ends
  const tolerance = 15; // 15 minute tolerance for similar time brackets
  return aStart < bEnd + tolerance && aEnd > bStart - tolerance;
}

/**
 * Checks if two service types represent the same type of visit.
 */
function isSameServiceType(serviceA: string | null, serviceB: string | null): boolean {
  const a = (serviceA || '').toLowerCase().trim();
  const b = (serviceB || '').toLowerCase().trim();
  
  if (!a || !b) return false;
  if (a === b) return true;
  
  // Extract the core service type (e.g., "AM" from "Extra Care - AM")
  const extractCore = (s: string) => {
    // Remove common prefixes
    const cleaned = s
      .replace(/extra\s*care\s*[-–]\s*/i, '')
      .replace(/personal\s*care\s*[-–]\s*/i, '')
      .replace(/care\s*[-–]\s*/i, '')
      .trim();
    return cleaned;
  };
  
  const coreA = extractCore(a);
  const coreB = extractCore(b);
  
  // Same core type (e.g., both are "AM" visits)
  if (coreA === coreB) return true;
  
  // One contains the other
  if (a.includes(b) || b.includes(a)) return true;
  
  return false;
}

/**
 * Filters out older service order rows that are superseded by newer rows
 * with overlapping time slots. When two rows have the same/similar time bracket,
 * the newer one (later start date) takes precedence on the overlap day.
 * 
 * Key rule: If a new service order starts on the same day an old one ends,
 * the new one takes over for that time slot.
 */
function filterSupersededRows(rows: NormalizedBillingRow[]): NormalizedBillingRow[] {
  if (rows.length <= 1) return rows;
  
  const result: NormalizedBillingRow[] = [];
  
  for (const row of rows) {
    // Check if this row is superseded by a newer row with overlapping time
    const isSuperseded = rows.some((other) => {
      // Don't compare with self
      if (row.id === other.id) return false;
      
      // Other row must have a later start date to supersede
      if (other.startDate.getTime() <= row.startDate.getTime()) return false;
      
      // Check for same/similar service types
      const sameService = isSameServiceType(row.serviceType, other.serviceType);
      
      // Check if times overlap
      const timesOverlap = timeRangesOverlap(
        row.startTime,
        row.endTime,
        other.startTime,
        other.endTime
      );
      
      // Row is superseded if:
      // 1. Same service type AND overlapping times - this is a replacement
      if (sameService && timesOverlap) {
        return true;
      }
      
      // 2. Exact same time slot (same start AND end time) - replacement regardless of service name
      if (row.startTime && other.startTime && row.endTime && other.endTime) {
        if (row.startTime === other.startTime && row.endTime === other.endTime) {
          return true;
        }
      }
      
      // 3. Very similar times (within 15 mins) and same service type category
      if (timesOverlap && sameService) {
        return true;
      }
      
      return false;
    });
    
    if (!isSuperseded) {
      result.push(row);
    }
  }
  
  return result;
}


export function analyzeBillingRows(
  rawRows: BillingRowInput[],
  options: AnalyzeBillingRowsOptions
): BillingAnalysisResult {
  const analysisEndDate = normalizeDate(options.analysisEndDate);
  const summaryWarnings = new Set<string>(options.extractionWarnings || []);
  const normalizedRows: NormalizedBillingRow[] = [];
  const seenKeys = new Set<string>();
  let skippedRows = 0;
  let openEndedRows = 0;
  let cappedRows = 0;
  let missingDurationRows = 0;
  let noDayCountRows = 0;
  let partialCoverageRows = 0;

  for (const raw of rawRows) {
    const startDateValue = (raw as any)?.startDate ?? (raw as any)?.start_date ?? (raw as any)?.start;
    const startDate = parseDateInput(startDateValue);
    if (!startDate) {
      skippedRows += 1;
      continue;
    }

    const endDateValue = (raw as any)?.endDate ?? (raw as any)?.end_date ?? (raw as any)?.end;
    const endDate = parseDateInput(endDateValue);

    const startTime = normalizeTime((raw as any)?.startTime ?? (raw as any)?.start_time ?? (raw as any)?.startTimeText);
    const endTime = normalizeTime((raw as any)?.endTime ?? (raw as any)?.end_time ?? (raw as any)?.endTimeText);

    const durationRaw = (raw as any)?.duration ?? (raw as any)?.durationText ?? (raw as any)?.duration_minutes ?? (raw as any)?.durationMinutes;
    let durationMinutes = parseDurationMinutes(durationRaw);
    if (durationMinutes == null) {
      const startMinutes = parseTimeToMinutes(startTime);
      const endMinutes = parseTimeToMinutes(endTime);
      if (startMinutes != null && endMinutes != null) {
        let diff = endMinutes - startMinutes;
        if (diff < 0) diff += 24 * 60;  // genuine overnight shift (e.g. 22:00→06:00)
        durationMinutes = diff;
      }
    }
    if (durationMinutes != null && durationMinutes <= 0) {
      durationMinutes = null;
    }

    const occursEveryWeeks = Math.max(
      1,
      parseInteger(
        (raw as any)?.occursEveryWeeks ?? (raw as any)?.occurs_every_weeks ?? (raw as any)?.occursEvery ?? (raw as any)?.occursEveryWeek ?? 1
      )
    );

    const dayCounts: BillingDayCounts = {
      mon: parseInteger((raw as any)?.mon ?? (raw as any)?.monday ?? (raw as any)?.monQty ?? (raw as any)?.mon_qty),
      tue: parseInteger((raw as any)?.tue ?? (raw as any)?.tuesday ?? (raw as any)?.tueQty ?? (raw as any)?.tue_qty),
      wed: parseInteger((raw as any)?.wed ?? (raw as any)?.wednesday ?? (raw as any)?.wedQty ?? (raw as any)?.wed_qty),
      thu: parseInteger((raw as any)?.thu ?? (raw as any)?.thursday ?? (raw as any)?.thuQty ?? (raw as any)?.thu_qty),
      fri: parseInteger((raw as any)?.fri ?? (raw as any)?.friday ?? (raw as any)?.friQty ?? (raw as any)?.fri_qty),
      sat: parseInteger((raw as any)?.sat ?? (raw as any)?.saturday ?? (raw as any)?.satQty ?? (raw as any)?.sat_qty),
      sun: parseInteger((raw as any)?.sun ?? (raw as any)?.sunday ?? (raw as any)?.sunQty ?? (raw as any)?.sun_qty),
    };

    const serviceTypeValue = (raw as any)?.serviceType ?? (raw as any)?.service_type ?? (raw as any)?.service ?? (raw as any)?.serviceTypeName;
    const serviceType = serviceTypeValue ? String(serviceTypeValue).trim() : null;
    const durationText =
      durationMinutes != null ? formatDurationFromMinutes(durationMinutes) : durationRaw ? String(durationRaw).trim() : null;

    const warnings: string[] = [];
    if (!endDate) {
      warnings.push("Missing end date");
      openEndedRows += 1;
    }
    if (!durationMinutes) {
      warnings.push("Missing duration");
      missingDurationRows += 1;
    }
    if (Object.values(dayCounts).every((value) => value === 0)) {
      warnings.push("No day quantities");
      noDayCountRows += 1;
    }
    
    // Detect partial day coverage (gaps where some days have values, others don't)
    const gapInfo = detectDayCoverageGaps(dayCounts);
    if (gapInfo.hasPartialCoverage && gapInfo.gapDescription) {
      warnings.push(gapInfo.gapDescription);
      partialCoverageRows += 1;
    }

    const weeklyMinutes =
      durationMinutes != null ? Object.values(dayCounts).reduce((sum, count) => sum + count * durationMinutes!, 0) / occursEveryWeeks : null;

    const rowKey =
      [
        formatDate(startDate),
        endDate ? formatDate(endDate) : "",
        startTime || "",
        endTime || "",
        durationText || "",
        ...BILLING_DAY_KEYS.map((key) => dayCounts[key]),
        occursEveryWeeks,
        (serviceType || "").toLowerCase(),
      ].join("|");

    if (seenKeys.has(rowKey)) continue;
    seenKeys.add(rowKey);

    normalizedRows.push({
      id: `row-${normalizedRows.length + 1}`,
      startDate,
      endDate,
      startDateText: formatDate(startDate),
      endDateText: endDate ? formatDate(endDate) : null,
      startTime,
      endTime,
      durationMinutes,
      durationText,
      occursEveryWeeks,
      serviceType,
      dayCounts,
      weeklyMinutes,
      warnings,
      wasEndDateMissing: !endDate,
    });
  }

  if (normalizedRows.length === 0) {
    return {
      summary: {
        imageCount: options.imageCount ?? 0,
        rowCount: 0,
        segmentsCount: 0,
        analysisEndDate: analysisEndDate ? formatDate(analysisEndDate) : null,
        warnings: Array.from(summaryWarnings),
        skippedRows,
      },
      segments: [],
    };
  }

  const rowsWithEffectiveEnd = normalizedRows
    .map((row) => {
      let effectiveEndDate = row.endDate ?? analysisEndDate;
      const warnings = [...row.warnings];
      if (effectiveEndDate.getTime() < row.startDate.getTime()) {
        return null;
      }
      if (effectiveEndDate.getTime() > analysisEndDate.getTime()) {
        effectiveEndDate = analysisEndDate;
        warnings.push(`End date capped at ${formatDate(analysisEndDate)}`);
        cappedRows += 1;
      }
      if (row.wasEndDateMissing) {
        warnings.push(`End date set to ${formatDate(analysisEndDate)}`);
      }
      return {
        ...row,
        endDateText: formatDate(effectiveEndDate),
        effectiveEndDate,
        warnings,
      };
    })
    .filter(Boolean) as NormalizedBillingRow[];

  if (rowsWithEffectiveEnd.length === 0) {
    return {
      summary: {
        imageCount: options.imageCount ?? 0,
        rowCount: 0,
        segmentsCount: 0,
        analysisEndDate: formatDate(analysisEndDate),
        warnings: Array.from(summaryWarnings),
        skippedRows,
      },
      segments: [],
    };
  }

  if (openEndedRows > 0) {
    summaryWarnings.add(`Open-ended rows used ${formatDate(analysisEndDate)} as the end date.`);
  }
  if (cappedRows > 0) {
    summaryWarnings.add(`Rows extending beyond ${formatDate(analysisEndDate)} were capped to that date.`);
  }
  if (missingDurationRows > 0) {
    summaryWarnings.add("Some rows were missing duration values; hours may be understated.");
  }
  if (noDayCountRows > 0) {
    summaryWarnings.add("Some rows have no day quantities; check the extracted data.");
  }
  if (partialCoverageRows > 0) {
    summaryWarnings.add(`${partialCoverageRows} row${partialCoverageRows === 1 ? " has" : "s have"} partial day coverage (gaps in weekly schedule).`);
  }

  const boundarySet = new Set<number>();
  rowsWithEffectiveEnd.forEach((row) => {
    boundarySet.add(row.startDate.getTime());
    boundarySet.add(addDays(row.effectiveEndDate!, 1).getTime());
  });
  const boundaries = Array.from(boundarySet).sort((a, b) => a - b);

  const segments: BillingSegment[] = [];
  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const segmentStart = normalizeDate(new Date(boundaries[i]));
    const segmentEnd = addDays(normalizeDate(new Date(boundaries[i + 1])), -1);
    if (segmentEnd.getTime() < segmentStart.getTime()) continue;

    const activeRows = rowsWithEffectiveEnd
      .filter(
        (row) => row.startDate.getTime() <= segmentStart.getTime() && row.effectiveEndDate!.getTime() >= segmentStart.getTime()
      )
      .sort((a, b) => {
        const dateDiff = a.startDate.getTime() - b.startDate.getTime();
        if (dateDiff !== 0) return dateDiff;
        const timeA = parseTimeToMinutes(a.startTime) ?? 0;
        const timeB = parseTimeToMinutes(b.startTime) ?? 0;
        return timeA - timeB;
      });
    if (activeRows.length === 0) continue;

    // Filter out older rows that are superseded by newer rows with the same time slot
    // When a newer service order starts for the same time bracket, it replaces the old one
    const filteredRows = filterSupersededRows(activeRows);
    if (filteredRows.length === 0) continue;

    const rowsForSegment: BillingSegmentRow[] = filteredRows.map((row) => ({
      id: row.id,
      startDate: row.startDateText,
      endDate: row.endDateText,
      startTime: row.startTime,
      endTime: row.endTime,
      durationMinutes: row.durationMinutes,
      durationText: row.durationText,
      occursEveryWeeks: row.occursEveryWeeks,
      serviceType: row.serviceType,
      dayCounts: row.dayCounts,
      weeklyHours: row.weeklyMinutes != null ? row.weeklyMinutes / 60 : null,
      warnings: row.warnings,
    }));

    const weeklyHoursTotal = rowsForSegment.reduce((sum, row) => sum + (row.weeklyHours || 0), 0);
    const daysInRange = differenceInDays(segmentStart, segmentEnd) + 1;

    segments.push({
      id: `segment-${segmentStart.getTime()}`,
      startDate: formatDate(segmentStart),
      endDate: formatDate(segmentEnd),
      days: daysInRange,
      weeklyHoursTotal,
      rows: rowsForSegment,
    });
  }

  return {
    summary: {
      imageCount: options.imageCount ?? 0,
      rowCount: rowsWithEffectiveEnd.length,
      segmentsCount: segments.length,
      analysisEndDate: formatDate(analysisEndDate),
      warnings: Array.from(summaryWarnings),
      skippedRows,
    },
    segments,
  };
}
