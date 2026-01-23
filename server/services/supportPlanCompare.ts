import { parse as parseDateFns } from "date-fns";

export type SupportPlanVisit = {
  time: string; // "09:00" or "09:00-09:45" or "overnight"
  duration?: number | null; // in minutes
  description?: string | null;
  days?: string[]; // which days this visit occurs (empty = all days)
  carerCount?: number | null; // number of carers for this visit
  frequency?: string | null; // "per day", "daily", etc.
  startDate?: string | null; // when this visit schedule starts
  endDate?: string | null; // when this visit schedule ends
};

export type SupportPlanSection = {
  provider: string | null;
  startDate: string | null;
  endDate: string | null;
  visits: SupportPlanVisit[];
  weeklyHours: number | null;
  serviceType: string | null; // "Extra Care overnight", "Personal Care", etc.
  rawText?: string;
};

export type SupportPlanData = {
  provider: string | null;
  providerValid: boolean;
  startDate: string | null;
  endDate: string | null;
  times: string[];
  weeklyHours: number | null;
  sections: SupportPlanSection[];
  visits: SupportPlanVisit[];
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
    rows?: Array<{ 
      startTime?: string | null; 
      endTime?: string | null; 
      serviceType?: string | null;
      durationMinutes?: number | null;
      dayCounts?: Record<string, number>;
    }>;
  }>;
};

export type ServiceOrderVisitSummary = {
  time: string;
  duration: number | null;
  serviceType: string | null;
  totalCarersPerWeek: number;
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
  visitComparison?: {
    planVisits: SupportPlanVisit[];
    serviceOrderVisits: ServiceOrderVisitSummary[];
    mismatches: string[];
  };
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

  // Date patterns for reuse
  const numericDatePattern = "\\d{1,2}[\\/-]\\d{1,2}[\\/-]\\d{2,4}";
  const longDatePattern = "\\d{1,2}[\\s-](?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\\s-]\\d{2,4}";
  const dashedLongDatePattern = "\\d{1,2}[\\/-](?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\\/-]\\d{2,4}";
  const datePattern = `(?:${numericDatePattern}|${longDatePattern}|${dashedLongDatePattern})`;

  // Split text into sections by "Provider:" markers
  const extractAllSections = (): SupportPlanSection[] => {
    const sections: SupportPlanSection[] = [];
    const providerRegex = /provider\s*:\s*/gi;
    const indices: number[] = [];
    let match: RegExpExecArray | null;
    
    while ((match = providerRegex.exec(text)) !== null) {
      indices.push(match.index);
    }
    
    if (indices.length === 0) return sections;

    for (let i = 0; i < indices.length; i += 1) {
      const start = indices[i];
      const end = i + 1 < indices.length ? indices[i + 1] : text.length;
      const block = text.slice(start, end);
      
      const section = parseSectionBlock(block);
      if (section) {
        sections.push(section);
      }
    }
    
    return sections;
  };

  // Parse a single section block
  const parseSectionBlock = (block: string): SupportPlanSection | null => {
    const blockLower = block.toLowerCase();
    
    // Extract provider
    const providerMatch = block.match(/provider\s*:\s*([^\n\r]+)/i);
    const provider = providerMatch ? providerMatch[1].trim() : null;
    
    // Extract start date
    const startDateMatch = block.match(/start\s*date\s*:\s*([^\n\r]+)/i);
    const startDateStr = startDateMatch ? startDateMatch[1].trim() : null;
    const startDate = tryParseAnyDate(startDateStr);
    
    // Extract end date
    const endDateMatch = block.match(/end\s*date\s*:\s*([^\n\r]+)/i);
    const endDateStr = endDateMatch ? endDateMatch[1].trim() : null;
    const endDate = tryParseAnyDate(endDateStr);
    
    // Extract service type (e.g., "Extra Care overnight cost")
    const typeMatch = block.match(/type\s*of\s*placement\s*:\s*([^\n\r]+)/i);
    const serviceType = typeMatch ? typeMatch[1].trim() : null;
    
    // Extract "Support to be provided" section
    const supportMatch = block.match(/support\s*to\s*be\s*provided\s*:\s*([\s\S]*?)(?=(?:appropriate\s*provision|extra\s*care\s*service|$))/i);
    const supportText = supportMatch ? supportMatch[1].trim() : '';
    
    // Parse visits from the support text
    const visits = parseVisitsFromSupportText(supportText);
    
    // Calculate weekly hours from visits
    let weeklyHours: number | null = null;
    if (visits.length > 0) {
      let totalMinutesPerWeek = 0;
      for (const visit of visits) {
        if (visit.duration) {
          // If frequency is "per day", multiply by 7
          const daysPerWeek = visit.frequency?.toLowerCase().includes('per day') || 
                              visit.frequency?.toLowerCase().includes('daily') ? 7 : 7;
          totalMinutesPerWeek += visit.duration * daysPerWeek;
        }
      }
      if (totalMinutesPerWeek > 0) {
        weeklyHours = totalMinutesPerWeek / 60;
      }
    }
    
    // Also check for explicit "Number of hours" field
    const hoursMatch = block.match(/number\s*of\s*hours\s*:\s*(\d+(?:\.\d+)?)/i);
    if (hoursMatch) {
      const explicitHours = Number.parseFloat(hoursMatch[1]);
      if (Number.isFinite(explicitHours)) {
        weeklyHours = explicitHours;
      }
    }
    
    return {
      provider,
      startDate: startDate ? formatDate(startDate) : null,
      endDate: endDate ? formatDate(endDate) : null,
      visits,
      weeklyHours,
      serviceType,
      rawText: block,
    };
  };

  // Parse visits from "Support to be provided" text
  const parseVisitsFromSupportText = (supportText: string): SupportPlanVisit[] => {
    const visits: SupportPlanVisit[] = [];
    if (!supportText) return visits;
    
    const supportLower = supportText.toLowerCase();
    
    // Pattern: "One overnight call x2 carers for 15 mins"
    // Pattern: "x2 carers for 15 mins", "2 carers for 30 minutes"
    // Pattern: "One call for 45 mins", "Two visits for 1 hour"
    
    // Extract carer count: "x2 carers", "2 carers", "x 2 carers"
    let carerCount: number | null = null;
    const carerMatch = supportText.match(/x\s*(\d+)\s*carers?|(\d+)\s*carers?/i);
    if (carerMatch) {
      carerCount = Number.parseInt(carerMatch[1] || carerMatch[2], 10);
    }
    
    // Extract duration: "15 mins", "30 minutes", "1 hour", "1.5 hours"
    let duration: number | null = null;
    const durationMatch = supportText.match(/(\d+(?:\.\d+)?)\s*(?:mins?|minutes?)/i);
    if (durationMatch) {
      duration = Number.parseInt(durationMatch[1], 10);
    } else {
      const hourMatch = supportText.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/i);
      if (hourMatch) {
        duration = Math.round(Number.parseFloat(hourMatch[1]) * 60);
      }
    }
    
    // Extract frequency: "per day", "daily", "once daily"
    let frequency: string | null = null;
    if (supportLower.includes('per day')) {
      frequency = 'per day';
    } else if (supportLower.includes('daily')) {
      frequency = 'daily';
    } else if (supportLower.includes('per week')) {
      frequency = 'per week';
    }
    
    // Extract time of day: "overnight", "morning", "evening", "lunchtime"
    let time = 'unspecified';
    if (supportLower.includes('overnight')) {
      time = 'overnight';
    } else if (supportLower.includes('morning')) {
      time = 'morning';
    } else if (supportLower.includes('evening') || supportLower.includes('tea')) {
      time = 'evening';
    } else if (supportLower.includes('lunch')) {
      time = 'lunch';
    } else if (supportLower.includes('afternoon')) {
      time = 'afternoon';
    }
    
    // Extract specific times if present (HH:MM format)
    const timeMatch = supportText.match(/(\d{1,2}[:.]\d{2})\s*[-–to]+\s*(\d{1,2}[:.]\d{2})/);
    if (timeMatch) {
      const startTime = normalizeTime(timeMatch[1]);
      const endTime = normalizeTime(timeMatch[2]);
      if (startTime && endTime) {
        time = `${startTime}-${endTime}`;
        // Calculate duration from time range if not already set
        if (!duration) {
          const startMins = parseTimeToMinutes(startTime);
          const endMins = parseTimeToMinutes(endTime);
          if (startMins != null && endMins != null) {
            duration = endMins - startMins;
            if (duration <= 0) duration += 24 * 60;
          }
        }
      }
    }
    
    // Extract visit count: "One", "Two", "Three" or "1", "2", "3"
    const wordToNum: Record<string, number> = {
      'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
      'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
    };
    let visitCount = 1;
    const countWordMatch = supportLower.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/);
    if (countWordMatch) {
      visitCount = wordToNum[countWordMatch[1]] || 1;
    } else {
      const countNumMatch = supportText.match(/\b(\d+)\s*(?:call|visit|overnight)/i);
      if (countNumMatch) {
        visitCount = Number.parseInt(countNumMatch[1], 10) || 1;
      }
    }
    
    // Create visits based on count
    for (let i = 0; i < visitCount; i++) {
      visits.push({
        time,
        duration,
        description: supportText.trim(),
        carerCount,
        frequency,
      });
    }
    
    return visits;
  };

  // Extract all sections
  const sections = extractAllSections();
  
  // Pick the most relevant section for overall data
  const pickRelevantSection = (): SupportPlanSection | null => {
    if (sections.length === 0) return null;
    
    // Score sections by relevance
    const scored = sections.map(section => {
      let score = 0;
      if (section.visits.length > 0) score += 5;
      if (section.weeklyHours != null) score += 4;
      if (section.startDate) score += 2;
      if (section.endDate) score += 2;
      if (section.serviceType) score += 1;
      return { section, score };
    });
    
    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.section || null;
  };
  
  const mainSection = pickRelevantSection();
  
  // Collect all visits from all sections
  const allVisits: SupportPlanVisit[] = [];
  for (const section of sections) {
    for (const visit of section.visits) {
      allVisits.push({
        ...visit,
        startDate: section.startDate,
        endDate: section.endDate,
      });
    }
  }
  
  // Extract times from visits
  const planTimes = new Set<string>();
  for (const visit of allVisits) {
    if (visit.time && visit.time !== 'unspecified' && visit.time !== 'overnight') {
      // If it's a time range like "09:00-09:45", add both start and end
      if (visit.time.includes('-')) {
        const [start, end] = visit.time.split('-');
        if (start) planTimes.add(start);
        if (end) planTimes.add(end);
      } else {
        planTimes.add(visit.time);
      }
    }
  }
  
  // Calculate overall weekly hours
  let totalWeeklyHours: number | null = null;
  if (mainSection?.weeklyHours != null) {
    totalWeeklyHours = mainSection.weeklyHours;
  } else {
    // Sum from all sections
    let total = 0;
    let hasHours = false;
    for (const section of sections) {
      if (section.weeklyHours != null) {
        total += section.weeklyHours;
        hasHours = true;
      }
    }
    if (hasHours) totalWeeklyHours = total;
  }

  // Provider detection
  const provider = mainSection?.provider || sections[0]?.provider || null;
  const providerValid = provider ? /lawson|newcastle/i.test(provider) : false;

  return {
    provider,
    providerValid,
    startDate: mainSection?.startDate || sections[0]?.startDate || null,
    endDate: mainSection?.endDate || sections[0]?.endDate || null,
    times: Array.from(planTimes).sort(),
    weeklyHours: totalWeeklyHours,
    sections,
    visits: allVisits,
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
    rows: Array<{ 
      startTime?: string | null; 
      endTime?: string | null; 
      serviceType?: string | null;
      durationMinutes?: number | null;
      dayCounts?: Record<string, number>;
    }>;
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

  // Build service order visit summaries from the latest/most relevant segment
  const serviceOrderVisits: ServiceOrderVisitSummary[] = [];
  const latestSegment = effectiveSegments.length ? effectiveSegments[effectiveSegments.length - 1] : null;
  if (latestSegment) {
    for (const row of latestSegment.rows) {
      const startTime = normalizeTime(row.startTime || undefined);
      const endTime = normalizeTime(row.endTime || undefined);
      if (startTime && endTime) {
        const dayCounts = row.dayCounts || {};
        const totalCarersPerWeek = Object.values(dayCounts).reduce((sum, count) => sum + (count || 0), 0);
        
        serviceOrderVisits.push({
          time: `${startTime}-${endTime}`,
          duration: row.durationMinutes || null,
          serviceType: row.serviceType || null,
          totalCarersPerWeek,
        });
      }
    }
  }

  const serviceOrderHours = (() => {
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

  // Compare visit times between plan and service order
  const planTimes = new Set(plan.times);
  const visitMismatches: string[] = [];
  
  for (const window of serviceTimes) {
    const [start, end] = window.split("-");
    if (!planTimes.has(start) && !planTimes.has(end) && !planTimes.has(window)) {
      const msg = `Service order time ${window} not found in support plan.`;
      discrepancies.push(msg);
      visitMismatches.push(msg);
    }
  }

  for (const t of planTimes) {
    if (![...serviceTimes].some((w) => w.startsWith(t) || w.endsWith(t) || w === t)) {
      const msg = `Support plan time ${t} not present in service order schedule.`;
      discrepancies.push(msg);
      visitMismatches.push(msg);
    }
  }

  // Compare visit durations if we have detailed visit data
  if (plan.visits.length > 0 && serviceOrderVisits.length > 0) {
    for (const planVisit of plan.visits) {
      const matchingServiceVisit = serviceOrderVisits.find(sv => {
        // Match by overlapping time
        const planTime = planVisit.time;
        const serviceTime = sv.time;
        if (planTime === serviceTime) return true;
        
        // Check if start times match
        const planStart = planTime.split('-')[0];
        const serviceStart = serviceTime.split('-')[0];
        return planStart === serviceStart;
      });
      
      if (matchingServiceVisit && planVisit.duration && matchingServiceVisit.duration) {
        const durationDiff = Math.abs(planVisit.duration - matchingServiceVisit.duration);
        if (durationDiff > 5) { // More than 5 minutes difference
          const msg = `Visit at ${planVisit.time}: duration mismatch - plan ${planVisit.duration}min vs service order ${matchingServiceVisit.duration}min`;
          visitMismatches.push(msg);
        }
      }
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
    visitComparison: {
      planVisits: plan.visits,
      serviceOrderVisits,
      mismatches: visitMismatches,
    },
  };
};
