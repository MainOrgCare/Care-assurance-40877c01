/**
 * Service Order Builder
 * 
 * Extracts and builds service orders from analyzed workbook data.
 * Service orders represent recurring call patterns for service users.
 * 
 * Format: "AM x7 days x2 carers, 30 mins"
 * 
 * Template detection uses the most recent 28-day window:
 * - If the same call type appears on the same day in multiple instances,
 *   only the most recent instance determines template status
 * - Calls not appearing in current week 1/2 rotation are NOT templated
 */

import crypto from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

export interface RawCallRecord {
  serviceUserName: string;
  workerName: string;
  templateWorkerName?: string;
  callTypeLabel: string;
  callDate: string; // YYYY-MM-DD
  scheduledStart?: number; // minutes from midnight
  actualStart?: number;
  plannedDuration?: number;
  actualDuration?: number;
  isDoubleUp?: boolean;
  isTimeCritical?: boolean;
  serviceRequirementStart?: number;
}

export interface ServiceOrderSummary {
  serviceUserKey: string;
  serviceUserName: string;
  callTypeLabel: string;
  callTypeKey: string;
  timeBand: string;
  serviceRequirementMinutes: number;
  serviceRequirementStartTime?: number;
  serviceRequirementEndTime?: number;
  daysPerWeek: number;
  week1Days: string[];
  week2Days: string[];
  carersRequired: number;
  isTimeCritical: boolean;
  orderSummary: string;
  actualAvgStartTime?: number;
  actualAvgDuration?: number;
  durationVariance?: number;
  startTimeVariance?: number;
  recommendedAdjustment?: string;
  recommendedDurationMinutes?: number;
  recommendedStartMinutes?: number;
  sourceDataCount: number;
}

export interface TemplateAssignmentRecord {
  workerKey: string;
  workerName: string;
  serviceUserKey: string;
  serviceUserName: string;
  callTypeLabel: string;
  timeBand: string;
  templateWeek: 'week1' | 'week2';
  templateDay: string;
  isTemplated: boolean;
  isPrimary: boolean;
  serviceRequirementStartMinutes?: number;
  sourceDateKey: string;
  sourceRowHash?: string;
}

export interface AnalyzedCallRecord {
  callHash: string;
  serviceUserKey: string;
  serviceUserName: string;
  workerKey: string;
  workerName: string;
  callTypeLabel: string;
  callTypeKey: string;
  timeBand: string;
  callDate: string;
  templateWeek: 'week1' | 'week2';
  templateDay: string;
  isTemplated: boolean;
  isDoubleUp: boolean;
  isTimeCritical: boolean;
  serviceRequirementStartMinutes?: number;
  plannedStartMinutes?: number;
  actualStartMinutes?: number;
  plannedDurationMinutes?: number;
  actualDurationMinutes?: number;
  durationVarianceMinutes?: number;
  startVarianceMinutes?: number;
}

export interface ServiceUserProfile {
  serviceUserKey: string;
  serviceUserName: string;
  serviceUserArea?: string;
  serviceUserAddress?: string;
  totalCallsAnalyzed: number;
  earliestDataDate?: string;
  latestDataDate?: string;
}

export interface CareWorkerProfile {
  workerKey: string;
  workerName: string;
  workerNameNormalized: string;
  isAdminStaff: boolean;
  totalCallsAnalyzed: number;
  uniqueServiceUsers: number;
  avgCallsPerDay?: number;
  avgMinutesPerDay?: number;
  earliestDataDate?: string;
  latestDataDate?: string;
}

export interface CallRecommendationRecord {
  serviceUserKey: string;
  serviceUserName: string;
  callTypeLabel: string;
  recommendationType: 'time_change' | 'duration_change' | 'worker_change';
  currentValue?: string;
  recommendedValue?: string;
  reason: string;
  confidence: number;
  priority: number;
  dataPoints: number;
}

export interface ExtractionResult {
  serviceUsers: ServiceUserProfile[];
  careWorkers: CareWorkerProfile[];
  calls: AnalyzedCallRecord[];
  serviceOrders: ServiceOrderSummary[];
  templateAssignments: TemplateAssignmentRecord[];
  templateSlotStates: TemplateSlotState[];
  recommendations: CallRecommendationRecord[];
  stats: {
    totalRows: number;
    dateRangeStart?: string;
    dateRangeEnd?: string;
    careWorkersExtracted: number;
    serviceUsersExtracted: number;
    callsExtracted: number;
    serviceOrdersGenerated: number;
    templatesDetected: number;
    recommendationsCreated: number;
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const TIME_RECOMMENDATION_THRESHOLD_MINUTES = 10;

/**
 * Normalize a name for consistent matching
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '');
}

/**
 * Generate a unique key for a service user
 */
export function generateServiceUserKey(name: string): string {
  return 'su_' + normalizeName(name).replace(/\s+/g, '_');
}

/**
 * Generate a unique key for a care worker
 */
export function generateWorkerKey(name: string): string {
  return 'cw_' + normalizeName(name).replace(/\s+/g, '_');
}

/**
 * Generate a unique hash for a call record (for deduplication)
 */
export function generateCallHash(
  serviceUserKey: string,
  workerKey: string,
  callDate: string,
  callTypeKey: string,
  plannedStartMinutes?: number
): string {
  const data = `${serviceUserKey}|${workerKey}|${callDate}|${callTypeKey}|${plannedStartMinutes ?? 'none'}`;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
}

/**
 * Template slot state (latest data within window)
 */
export interface TemplateSlotState {
  serviceUserKey: string;
  callTypeKey: string;
  templateWeek: 'week1' | 'week2';
  templateDay: string;
  hasTemplate: boolean;
}

/**
 * Determine call type key from label
 */
export function getCallTypeKey(label: string): string {
  const normalized = label.toLowerCase().trim();
  if (normalized.includes('morning') || normalized.includes('am') || normalized.includes('wake')) {
    return 'morning';
  }
  if (normalized.includes('lunch') || normalized.includes('midday') || normalized.includes('noon')) {
    return 'lunch';
  }
  if (normalized.includes('tea') || normalized.includes('afternoon')) {
    return 'tea';
  }
  if (normalized.includes('bed') || normalized.includes('night') || normalized.includes('pm') || normalized.includes('eve')) {
    return 'bed';
  }
  if (normalized.includes('domestic') || normalized.includes('clean')) {
    return 'domestic';
  }
  if (normalized.includes('shop')) {
    return 'shopping';
  }
  if (normalized.includes('med') || normalized.includes('medication')) {
    return 'medication';
  }
  return 'other';
}

/**
 * Determine time band from minutes since midnight
 */
export function getTimeBand(minutes?: number): string {
  if (minutes === undefined || minutes === null) return 'UNKNOWN';
  
  if (minutes < 360) return 'EARLY'; // Before 6am
  if (minutes < 720) return 'AM'; // 6am - 12pm
  if (minutes < 840) return 'LUNCH'; // 12pm - 2pm
  if (minutes < 1020) return 'PM'; // 2pm - 5pm
  if (minutes < 1200) return 'EVE'; // 5pm - 8pm
  return 'LATE'; // After 8pm
}

/**
 * Determine template week (week1 or week2) from a date
 */
export function getTemplateWeek(dateStr: string, referenceDate?: string): 'week1' | 'week2' {
  // Use a reference date to establish consistent week numbering
  // Default reference: Jan 5, 2026 (Monday) as week 1
  const ref = referenceDate ? new Date(referenceDate) : new Date('2026-01-05');
  const date = new Date(dateStr);
  
  const diffDays = Math.floor((date.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24));
  const weekOffset = Math.floor(diffDays / 7);
  const parity = ((weekOffset % 2) + 2) % 2;
  
  return parity === 0 ? 'week1' : 'week2';
}

/**
 * Get day name from date
 */
export function getDayName(dateStr: string): string {
  const date = new Date(dateStr);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
}

/**
 * Check if a worker name looks like admin staff
 */
export function isAdminStaff(name: string): boolean {
  const normalized = name.toLowerCase();
  const adminKeywords = ['office', 'admin', 'manager', 'coordinator', 'supervisor', 'unknown', 'tbc', 'tba'];
  return adminKeywords.some(kw => normalized.includes(kw));
}

/**
 * Format time from minutes since midnight to HH:MM
 */
export function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Generate service order summary text
 * Format: "AM x7 days x2 carers, 30 mins"
 */
export function formatServiceOrderSummary(
  timeBand: string,
  daysPerWeek: number,
  carersRequired: number,
  durationMinutes: number
): string {
  const daysText = daysPerWeek === 7 ? 'x7 days' : `x${daysPerWeek} days`;
  const carersText = carersRequired === 1 ? '' : ` x${carersRequired} carers`;
  const durationText = `${durationMinutes} mins`;
  
  return `${timeBand} ${daysText}${carersText}, ${durationText}`;
}

// ============================================================================
// MAIN EXTRACTION
// ============================================================================

/**
 * Extract all data from raw call records
 */
export function extractFromRawCalls(calls: RawCallRecord[]): ExtractionResult {
  if (!calls.length) {
    return {
      serviceUsers: [],
      careWorkers: [],
      calls: [],
      serviceOrders: [],
      templateAssignments: [],
      templateSlotStates: [],
      recommendations: [],
      stats: {
        totalRows: 0,
        careWorkersExtracted: 0,
        serviceUsersExtracted: 0,
        callsExtracted: 0,
        serviceOrdersGenerated: 0,
        templatesDetected: 0,
        recommendationsCreated: 0,
      },
    };
  }

  // Track unique entities
  const serviceUserMap = new Map<string, ServiceUserProfile>();
  const careWorkerMap = new Map<string, CareWorkerProfile>();
  const callMap = new Map<string, AnalyzedCallRecord>();
  
  // For template detection - track most recent occurrence of each call slot
  const templateSlotMap = new Map<
    string,
    {
      dateStr: string;
      sortIndex: number;
      hasTemplate: boolean;
      workerKey?: string;
      workerName?: string;
      callTypeLabel: string;
      timeBand: string;
      serviceRequirementStartMinutes?: number;
    }
  >();
  
  // For service order building - aggregate by service user + call type
  const orderAggregateMap = new Map<string, {
    records: RawCallRecord[];
    startTimes: number[];
    durations: number[];
    daysSeen: Map<string, Set<string>>; // week -> Set<dayName>
    carersRequired: number;
  }>();

  // Sort calls by date (most recent last for template detection)
  const sortedCalls = [...calls]
    .map((call, index) => ({ call, index }))
    .sort((a, b) => a.call.callDate.localeCompare(b.call.callDate) || a.index - b.index);

  // Find date range for 28-day template window
  const dates = sortedCalls.map(c => c.call.callDate).filter(Boolean);
  const dateRangeStart = dates[0];
  const dateRangeEnd = dates[dates.length - 1];
  
  // Calculate 28-day cutoff for template detection
  const latestDate = new Date(dateRangeEnd);
  const templateCutoffDate = new Date(latestDate.getTime() - 28 * 24 * 60 * 60 * 1000);
  const templateCutoffStr = templateCutoffDate.toISOString().split('T')[0];

  // First pass: Process all calls
  for (const entry of sortedCalls) {
    const call = entry.call;
    const serviceUserKey = generateServiceUserKey(call.serviceUserName);
    const workerKey = generateWorkerKey(call.workerName);
    const callTypeKey = getCallTypeKey(call.callTypeLabel);
    const timeBand = getTimeBand(call.actualStart ?? call.scheduledStart ?? call.serviceRequirementStart);
    const templateWeek = getTemplateWeek(call.callDate);
    const templateDay = getDayName(call.callDate);
    
    // Update service user
    if (!serviceUserMap.has(serviceUserKey)) {
      serviceUserMap.set(serviceUserKey, {
        serviceUserKey,
        serviceUserName: call.serviceUserName,
        totalCallsAnalyzed: 0,
        earliestDataDate: call.callDate,
        latestDataDate: call.callDate,
      });
    }
    const su = serviceUserMap.get(serviceUserKey)!;
    su.totalCallsAnalyzed++;
    if (call.callDate < (su.earliestDataDate || call.callDate)) su.earliestDataDate = call.callDate;
    if (call.callDate > (su.latestDataDate || call.callDate)) su.latestDataDate = call.callDate;
    
    // Update care worker
    if (!careWorkerMap.has(workerKey)) {
      careWorkerMap.set(workerKey, {
        workerKey,
        workerName: call.workerName,
        workerNameNormalized: normalizeName(call.workerName),
        isAdminStaff: isAdminStaff(call.workerName),
        totalCallsAnalyzed: 0,
        uniqueServiceUsers: 0,
        earliestDataDate: call.callDate,
        latestDataDate: call.callDate,
      });
    }
    const cw = careWorkerMap.get(workerKey)!;
    cw.totalCallsAnalyzed++;
    if (call.callDate < (cw.earliestDataDate || call.callDate)) cw.earliestDataDate = call.callDate;
    if (call.callDate > (cw.latestDataDate || call.callDate)) cw.latestDataDate = call.callDate;
    
    // Build call record
    const callHash = generateCallHash(
      serviceUserKey,
      workerKey,
      call.callDate,
      callTypeKey,
      call.scheduledStart
    );
    
    // Only add if not already seen (deduplication)
    if (!callMap.has(callHash)) {
      const durationVariance = (call.actualDuration !== undefined && call.plannedDuration !== undefined)
        ? call.actualDuration - call.plannedDuration
        : undefined;
      const startVariance = (call.actualStart !== undefined && call.serviceRequirementStart !== undefined)
        ? call.actualStart - call.serviceRequirementStart
        : undefined;
        
      callMap.set(callHash, {
        callHash,
        serviceUserKey,
        serviceUserName: call.serviceUserName,
        workerKey,
        workerName: call.workerName,
        callTypeLabel: call.callTypeLabel,
        callTypeKey,
        timeBand,
        callDate: call.callDate,
        templateWeek,
        templateDay,
        isTemplated: false, // Will be set later
        isDoubleUp: call.isDoubleUp ?? false,
        isTimeCritical: call.isTimeCritical ?? false,
        serviceRequirementStartMinutes: call.serviceRequirementStart,
        plannedStartMinutes: call.scheduledStart,
        actualStartMinutes: call.actualStart,
        plannedDurationMinutes: call.plannedDuration,
        actualDurationMinutes: call.actualDuration,
        durationVarianceMinutes: durationVariance,
        startVarianceMinutes: startVariance,
      });
    }
    
    // Track template slots (only for calls in 28-day window)
    if (call.callDate >= templateCutoffStr) {
      const templateSlotKey = `${serviceUserKey}|${callTypeKey}|${templateWeek}|${templateDay}`;
      const templateWorkerName = call.templateWorkerName?.trim() || undefined;
      const hasTemplate = Boolean(templateWorkerName) && !isAdminStaff(templateWorkerName ?? "");
      let templateWorkerKey: string | undefined;
      if (hasTemplate && templateWorkerName) {
        templateWorkerKey = generateWorkerKey(templateWorkerName);
      }
      const existing = templateSlotMap.get(templateSlotKey);
      const shouldReplace =
        !existing ||
        call.callDate > existing.dateStr ||
        (call.callDate === existing.dateStr && entry.index >= existing.sortIndex);

      if (shouldReplace) {
        templateSlotMap.set(templateSlotKey, {
          dateStr: call.callDate,
          sortIndex: entry.index,
          hasTemplate,
          workerKey: templateWorkerKey,
          workerName: templateWorkerName,
          callTypeLabel: call.callTypeLabel,
          timeBand,
          serviceRequirementStartMinutes: call.serviceRequirementStart,
        });
      }
    }
    
    // Aggregate for service orders
    const orderKey = `${serviceUserKey}|${callTypeKey}|${timeBand}`;
    if (!orderAggregateMap.has(orderKey)) {
      orderAggregateMap.set(orderKey, {
        records: [],
        startTimes: [],
        durations: [],
        daysSeen: new Map([['week1', new Set()], ['week2', new Set()]]),
        carersRequired: 1,
      });
    }
    const agg = orderAggregateMap.get(orderKey)!;
    agg.records.push(call);
    const startCandidate =
      call.actualStart ??
      call.scheduledStart ??
      call.serviceRequirementStart;
    if (startCandidate !== undefined) agg.startTimes.push(startCandidate);
    if (call.actualDuration !== undefined) agg.durations.push(call.actualDuration);
    agg.daysSeen.get(templateWeek)!.add(templateDay);
    if (call.isDoubleUp) agg.carersRequired = 2;
  }

  // Count unique service users per worker
  const workerServiceUsers = new Map<string, Set<string>>();
  for (const call of callMap.values()) {
    if (!workerServiceUsers.has(call.workerKey)) {
      workerServiceUsers.set(call.workerKey, new Set());
    }
    workerServiceUsers.get(call.workerKey)!.add(call.serviceUserKey);
  }
  for (const [workerKey, serviceUsers] of workerServiceUsers) {
    const cw = careWorkerMap.get(workerKey);
    if (cw) cw.uniqueServiceUsers = serviceUsers.size;
  }

  // Build template assignments from slot map
  const templateAssignments: TemplateAssignmentRecord[] = [];
  const templateSlotStates: TemplateSlotState[] = [];
  for (const [slotKey, slotData] of templateSlotMap) {
    const [serviceUserKey, _callTypeKey, templateWeek, templateDay] = slotKey.split('|');
    const su = serviceUserMap.get(serviceUserKey);

    templateSlotStates.push({
      serviceUserKey,
      callTypeKey: _callTypeKey,
      templateWeek: templateWeek as 'week1' | 'week2',
      templateDay,
      hasTemplate: slotData.hasTemplate,
    });

    if (!slotData.hasTemplate || !slotData.workerKey || !slotData.workerName) {
      continue;
    }

    templateAssignments.push({
      workerKey: slotData.workerKey,
      workerName: slotData.workerName,
      serviceUserKey,
      serviceUserName: su?.serviceUserName || 'Unknown',
      callTypeLabel: _callTypeKey, // Keep key for consistent matching
      timeBand: slotData.timeBand,
      templateWeek: templateWeek as 'week1' | 'week2',
      templateDay,
      isTemplated: true,
      isPrimary: true,
      serviceRequirementStartMinutes: slotData.serviceRequirementStartMinutes,
      sourceDateKey: slotData.dateStr,
    });
  }

  // Mark templated calls
  for (const call of callMap.values()) {
    const templateSlotKey = `${call.serviceUserKey}|${call.callTypeKey}|${call.templateWeek}|${call.templateDay}`;
    const templateData = templateSlotMap.get(templateSlotKey);
    call.isTemplated = Boolean(templateData?.hasTemplate);
  }

  // Track worker frequency for non-templated calls (for recommendations)
  const orderWorkerCounts = new Map<string, Map<string, number>>();
  const orderTotals = new Map<string, number>();
  const orderHasTemplate = new Map<string, boolean>();
  for (const call of callMap.values()) {
    const orderKey = `${call.serviceUserKey}|${call.callTypeKey}|${call.timeBand}`;
    if (call.isTemplated) {
      orderHasTemplate.set(orderKey, true);
      continue;
    }
    const counts = orderWorkerCounts.get(orderKey) ?? new Map<string, number>();
    counts.set(call.workerName, (counts.get(call.workerName) ?? 0) + 1);
    orderWorkerCounts.set(orderKey, counts);
    orderTotals.set(orderKey, (orderTotals.get(orderKey) ?? 0) + 1);
  }

  // Build service orders
  const serviceOrders: ServiceOrderSummary[] = [];
  for (const [orderKey, agg] of orderAggregateMap) {
    const [serviceUserKey, callTypeKey, timeBand] = orderKey.split('|');
    const su = serviceUserMap.get(serviceUserKey);
    
    // Calculate statistics
    const avgStartTime = agg.startTimes.length > 0
      ? Math.round(agg.startTimes.reduce((a, b) => a + b, 0) / agg.startTimes.length)
      : undefined;
    const avgDuration = agg.durations.length > 0
      ? Math.round(agg.durations.reduce((a, b) => a + b, 0) / agg.durations.length)
      : undefined;
      
    // Get planned/required duration for variance
    const plannedDurations = agg.records
      .map(r => r.plannedDuration)
      .filter((d): d is number => d !== undefined);
    const avgPlannedDuration = plannedDurations.length > 0
      ? Math.round(plannedDurations.reduce((a, b) => a + b, 0) / plannedDurations.length)
      : avgDuration ?? 30;
      
    const durationVariance = avgDuration !== undefined && avgPlannedDuration
      ? avgDuration - avgPlannedDuration
      : undefined;

    // Get service requirement start time
    const reqStarts = agg.records
      .map(r => r.serviceRequirementStart)
      .filter((s): s is number => s !== undefined);
    const reqStartTime = reqStarts.length > 0
      ? Math.round(reqStarts.reduce((a, b) => a + b, 0) / reqStarts.length)
      : undefined;
      
    const startVariance = avgStartTime !== undefined && reqStartTime !== undefined
      ? avgStartTime - reqStartTime
      : undefined;

    // Calculate days per week
    const week1Days = Array.from(agg.daysSeen.get('week1')!);
    const week2Days = Array.from(agg.daysSeen.get('week2')!);
    const allDays = new Set([...week1Days, ...week2Days]);
    const daysPerWeek = allDays.size;

    // Determine recommended adjustments
    let recommendedAdjustment: string | undefined;
    let recommendedDurationMinutes: number | undefined;
    let recommendedStartMinutes: number | undefined = avgStartTime;
    
    // If actual duration is consistently > 10 mins more than planned, recommend increase
    if (durationVariance !== undefined && durationVariance > 10) {
      recommendedAdjustment = 'increase_duration';
      recommendedDurationMinutes = avgDuration;
    }
    // If actual duration is consistently < 10 mins less, recommend decrease
    else if (durationVariance !== undefined && durationVariance < -10) {
      recommendedAdjustment = 'decrease_duration';
      recommendedDurationMinutes = avgDuration;
    }

    // Check time critical
    const isTimeCritical = agg.records.some(r => r.isTimeCritical);

    // Build order summary
    const orderSummary = formatServiceOrderSummary(
      timeBand,
      daysPerWeek,
      agg.carersRequired,
      avgPlannedDuration || avgDuration || 30
    );

    serviceOrders.push({
      serviceUserKey,
      serviceUserName: su?.serviceUserName || 'Unknown',
      callTypeLabel: callTypeKey.charAt(0).toUpperCase() + callTypeKey.slice(1),
      callTypeKey,
      timeBand,
      serviceRequirementMinutes: avgPlannedDuration || avgDuration || 30,
      serviceRequirementStartTime: reqStartTime,
      daysPerWeek,
      week1Days,
      week2Days,
      carersRequired: agg.carersRequired,
      isTimeCritical,
      orderSummary,
      actualAvgStartTime: avgStartTime,
      actualAvgDuration: avgDuration,
      durationVariance,
      startTimeVariance: startVariance,
      recommendedAdjustment,
      recommendedDurationMinutes,
      recommendedStartMinutes,
      sourceDataCount: agg.records.length,
    });
  }

  // Build recommendations
  const recommendations: CallRecommendationRecord[] = [];
  for (const order of serviceOrders) {
    const orderKey = `${order.serviceUserKey}|${order.callTypeKey}|${order.timeBand}`;
    const hasTemplate = orderHasTemplate.get(orderKey) ?? false;
    const workerCounts = orderWorkerCounts.get(orderKey);
    const totalCalls = orderTotals.get(orderKey) ?? 0;

    if (
      order.startTimeVariance !== undefined &&
      order.actualAvgStartTime !== undefined &&
      order.serviceRequirementStartTime !== undefined &&
      Math.abs(order.startTimeVariance) >= TIME_RECOMMENDATION_THRESHOLD_MINUTES
    ) {
      const direction = order.startTimeVariance > 0 ? "later" : "earlier";
      recommendations.push({
        serviceUserKey: order.serviceUserKey,
        serviceUserName: order.serviceUserName,
        callTypeLabel: order.callTypeLabel,
        recommendationType: 'time_change',
        currentValue: formatTime(order.serviceRequirementStartTime),
        recommendedValue: formatTime(order.actualAvgStartTime),
        reason: `Actual start averages ${Math.abs(order.startTimeVariance)} mins ${direction} than requirement`,
        confidence: Math.min(95, 50 + order.sourceDataCount * 2),
        priority: order.startTimeVariance && Math.abs(order.startTimeVariance) > 20 ? 4 : 3,
        dataPoints: order.sourceDataCount,
      });
      if (!order.recommendedAdjustment) {
        order.recommendedAdjustment = 'adjust_start_time';
      }
      order.recommendedStartMinutes = order.actualAvgStartTime;
    }

    if (!hasTemplate && workerCounts && totalCalls > 0) {
      let topWorker = "";
      let topCount = 0;
      for (const [workerName, count] of workerCounts.entries()) {
        if (count > topCount) {
          topCount = count;
          topWorker = workerName;
        }
      }
      const share = topCount / totalCalls;
      if (topWorker && topCount >= 2 && share >= 0.5) {
        recommendations.push({
          serviceUserKey: order.serviceUserKey,
          serviceUserName: order.serviceUserName,
          callTypeLabel: order.callTypeLabel,
          recommendationType: 'worker_change',
          currentValue: "Mixed coverage",
          recommendedValue: topWorker,
          reason: `${topWorker} completed ${topCount} of ${totalCalls} recent non-templated calls`,
          confidence: Math.min(95, 40 + topCount * 10),
          priority: share >= 0.7 ? 4 : 3,
          dataPoints: totalCalls,
        });
      }
    }

    if (order.recommendedAdjustment === 'increase_duration') {
      recommendations.push({
        serviceUserKey: order.serviceUserKey,
        serviceUserName: order.serviceUserName,
        callTypeLabel: order.callTypeLabel,
        recommendationType: 'duration_change',
        currentValue: `${order.serviceRequirementMinutes} mins`,
        recommendedValue: `${order.recommendedDurationMinutes} mins`,
        reason: `Actual duration averages ${order.durationVariance} mins longer than scheduled`,
        confidence: Math.min(95, 50 + order.sourceDataCount * 2),
        priority: order.durationVariance && order.durationVariance > 20 ? 4 : 3,
        dataPoints: order.sourceDataCount,
      });
    }
    else if (order.recommendedAdjustment === 'decrease_duration') {
      recommendations.push({
        serviceUserKey: order.serviceUserKey,
        serviceUserName: order.serviceUserName,
        callTypeLabel: order.callTypeLabel,
        recommendationType: 'duration_change',
        currentValue: `${order.serviceRequirementMinutes} mins`,
        recommendedValue: `${order.recommendedDurationMinutes} mins`,
        reason: `Actual duration averages ${Math.abs(order.durationVariance!)} mins shorter than scheduled`,
        confidence: Math.min(95, 50 + order.sourceDataCount * 2),
        priority: 2,
        dataPoints: order.sourceDataCount,
      });
    }
  }

  return {
    serviceUsers: Array.from(serviceUserMap.values()),
    careWorkers: Array.from(careWorkerMap.values()),
    calls: Array.from(callMap.values()),
    serviceOrders,
    templateAssignments,
    templateSlotStates,
    recommendations,
    stats: {
      totalRows: calls.length,
      dateRangeStart,
      dateRangeEnd,
      careWorkersExtracted: careWorkerMap.size,
      serviceUsersExtracted: serviceUserMap.size,
      callsExtracted: callMap.size,
      serviceOrdersGenerated: serviceOrders.length,
      templatesDetected: templateAssignments.length,
      recommendationsCreated: recommendations.length,
    },
  };
}

/**
 * Calculate expiry date (3 months from now)
 */
export function getExpiryDate(): Date {
  const date = new Date();
  date.setMonth(date.getMonth() + 3);
  return date;
}
