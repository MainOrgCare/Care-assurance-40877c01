/**
 * Smart Optimization Engine for Rostering Studio
 * 
 * Provides multi-objective optimization for care worker schedules,
 * balancing travel time, workload distribution, care continuity,
 * recommended call times, and worker constraints.
 * 
 * ENFORCED RULES:
 * - Templated calls: LOCKED to assigned worker for that week/day (if lockTemplatedCalls=true)
 * - Time-critical calls: ±tolerance tolerance ENFORCED (default ±15 minutes)
 * - Working hours: All calls within workingHoursStart-workingHoursEnd (default 6am-10pm)
 * - Call priority: Morning → Lunch → Tea → Bed
 * - Non-templated calls: Can be reassigned based on distance/workload
 */

import type { GanttLane, TimelineEntry } from "./rosterModel";
import { haversineDistance, estimateTravelMinutes, orderByNearestNeighbor } from "./travelUtils";
import type { OptimizationWeights, OptimizationConstraints } from "@/components/rostering/OptimizationSettings";

// ============================================================================
// Types
// ============================================================================

export interface OptimizationResult {
  timeOverrides: Record<string, number>;
  laneOverrides: Record<string, string>;
  metrics: OptimizationResultMetrics;
}

export interface OptimizationResultMetrics {
  totalTravelReduction: number;  // Minutes saved
  workloadVariance: number;      // Standard deviation of workload across workers
  continuityScore: number;       // 0-100% of service users keeping same worker
  constraintViolations: number;  // Number of constraint violations
  recommendedTimeScore: number;  // 0-100% of calls at recommended times
}

/** Recommended call time from database */
export interface RecommendedCallTime {
  serviceUserKey: string;
  callTypeLabel: string;
  recommendedStartMinutes: number;
  toleranceMinutes: number;
  priority: number;
}

/** Worker template from database */
export interface WorkerTemplate {
  workerKey: string;
  serviceUserKey: string;
  callTypeLabels: string[];
  isPrimary: boolean;
  priority: number;
}

/** Worker constraint from database */
export interface WorkerConstraint {
  workerKey: string;
  maxCallsPerDay?: number;
  maxMinutesPerDay?: number;
  maxCallsPerWeek?: number;
  maxMinutesPerWeek?: number;
}

export interface WeeklyTotals {
  calls: number;
  minutes: number;
}

interface EntryWithLocation extends TimelineEntry {
  lat?: number | null;
  lon?: number | null;
  originalLaneId: string;
  serviceUserKey?: string | null;
  isTemplated?: boolean;
}

interface LaneWorkload {
  laneId: string;
  label: string;
  totalMinutes: number;
  entries: EntryWithLocation[];
}

// ============================================================================
// Constants (defaults - actual values come from constraints)
// ============================================================================

const DEFAULT_WORKING_HOURS_START = 6 * 60;  // 6:00 AM
const DEFAULT_WORKING_HOURS_END = 22 * 60;   // 10:00 PM
const DEFAULT_TIME_CRITICAL_TOLERANCE = 15;  // ±15 minutes
const CALL_TIME_WINDOWS = [
  { match: /am|morning/, start: 6 * 60, end: 10 * 60 },
  { match: /lunch/, start: 11 * 60, end: 14 * 60 },
  { match: /tea/, start: 14 * 60, end: 17 * 60 },
  { match: /pm|evening|bed|night/, start: 17 * 60, end: 22 * 60 },
];
const UNTIMED_CALL_MATCH = /escort|shopping|housework|domestic|befriending/;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Clamp a start time to be within working hours
 */
const clampToWorkingHours = (
  startMinutes: number,
  durationMinutes: number,
  constraints: OptimizationConstraints
): number => {
  const start = constraints.workingHoursStart ?? DEFAULT_WORKING_HOURS_START;
  const end = constraints.workingHoursEnd ?? DEFAULT_WORKING_HOURS_END;
  
  // Ensure the call fits within working hours
  const clampedStart = Math.max(start, Math.min(startMinutes, end - durationMinutes));
  return clampedStart;
};

const getCallTypeWindow = (
  callTypeLabel: string | null | undefined,
  constraints?: OptimizationConstraints
): { start: number; end: number } | null => {
  if (!callTypeLabel) return null;
  const normalized = callTypeLabel.toLowerCase();
  const workingStart = constraints?.workingHoursStart ?? DEFAULT_WORKING_HOURS_START;
  const workingEnd = constraints?.workingHoursEnd ?? DEFAULT_WORKING_HOURS_END;
  for (const window of CALL_TIME_WINDOWS) {
    if (window.match.test(normalized)) {
      return {
        start: Math.max(workingStart, window.start),
        end: Math.min(workingEnd, window.end),
      };
    }
  }
  return null;
};

const clampToCallTypeWindow = (
  proposedStart: number,
  durationMinutes: number,
  callTypeLabel: string | null | undefined,
  constraints?: OptimizationConstraints
): number => {
  const window = getCallTypeWindow(callTypeLabel, constraints);
  if (!window) return proposedStart;
  const maxStart = Math.max(window.start, window.end - durationMinutes);
  if (proposedStart < window.start) return window.start;
  if (proposedStart > maxStart) return maxStart;
  return proposedStart;
};

const isUntimedCallType = (callTypeLabel: string | null | undefined): boolean => {
  if (!callTypeLabel) return false;
  return UNTIMED_CALL_MATCH.test(callTypeLabel.toLowerCase());
};

const getUntimedWindows = (
  constraints?: OptimizationConstraints
): Array<{ start: number; end: number }> => {
  const workingStart = constraints?.workingHoursStart ?? DEFAULT_WORKING_HOURS_START;
  const workingEnd = constraints?.workingHoursEnd ?? DEFAULT_WORKING_HOURS_END;
  const windows = CALL_TIME_WINDOWS
    .map((window) => ({
      start: Math.max(workingStart, window.start),
      end: Math.min(workingEnd, window.end),
    }))
    .filter((window) => window.end > window.start)
    .sort((a, b) => a.start - b.start);

  const gaps: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < windows.length - 1; i += 1) {
    const gapStart = windows[i].end;
    const gapEnd = windows[i + 1].start;
    if (gapEnd > gapStart) {
      gaps.push({ start: gapStart, end: gapEnd });
    }
  }
  return gaps.length > 0 ? gaps : [{ start: workingStart, end: workingEnd }];
};

const clampToUntimedGap = (
  proposedStart: number,
  durationMinutes: number,
  constraints?: OptimizationConstraints
): number => {
  const gaps = getUntimedWindows(constraints);
  for (const gap of gaps) {
    const maxStart = Math.max(gap.start, gap.end - durationMinutes);
    if (proposedStart <= maxStart) {
      return Math.max(proposedStart, gap.start);
    }
  }
  const lastGap = gaps[gaps.length - 1];
  return Math.max(lastGap.start, lastGap.end - durationMinutes);
};

/**
 * Check if an entry can be moved (respecting templated lock and time-critical rules)
 */
const canMoveEntry = (
  entry: EntryWithLocation,
  constraints: OptimizationConstraints
): { canMove: boolean; canReassign: boolean; reason?: string } => {
  // Templated calls cannot be reassigned if lock is enabled
  const canReassign = !(entry.isTemplated && constraints.lockTemplatedCalls);
  
  // Time-critical calls can be moved but only within tolerance
  if (entry.isTimeCritical && constraints.respectTimeCritical) {
    return { canMove: true, canReassign, reason: "time-critical (limited movement)" };
  }
  
  return { canMove: true, canReassign };
};

/**
 * Validate time-critical call is within tolerance
 */
const validateTimeCriticalTolerance = (
  entry: EntryWithLocation,
  newStartMinutes: number,
  constraints: OptimizationConstraints
): number => {
  if (!entry.isTimeCritical) return newStartMinutes;
  
  const tolerance = constraints.timeCriticalToleranceMinutes ?? DEFAULT_TIME_CRITICAL_TOLERANCE;
  const minStart = entry.startMinutes - tolerance;
  const maxStart = entry.startMinutes + tolerance;
  
  // Clamp to tolerance window
  return Math.max(minStart, Math.min(newStartMinutes, maxStart));
};

// ============================================================================
// Main Optimization Functions
// ============================================================================

/**
 * Run full optimization with weighted objectives and constraints
 */
export const runFullOptimization = (
  lanes: GanttLane[],
  weights: OptimizationWeights,
  constraints: OptimizationConstraints,
  geocodedPoints?: Map<string, { lat: number; lon: number }>,
  rosteringData?: {
    recommendedCallTimes?: RecommendedCallTime[];
    workerTemplates?: WorkerTemplate[];
    workerConstraints?: WorkerConstraint[];
    weeklyTotals?: Map<string, WeeklyTotals>;
  }
): OptimizationResult => {
  const enforcedConstraints: OptimizationConstraints = {
    ...constraints,
    respectTimeCritical: true,
    lockTemplatedCalls: true,
  };

  // Normalize weights to sum to 100
  const totalWeight = weights.travel + weights.balance + weights.continuity;
  const normalizedWeights = totalWeight > 0
    ? {
        travel: weights.travel / totalWeight,
        balance: weights.balance / totalWeight,
        continuity: weights.continuity / totalWeight,
      }
    : { travel: 0.6, balance: 0.3, continuity: 0.1 };

  // Build working data structures
  const workloads = buildWorkloads(lanes, geocodedPoints);
  const originalAssignments = buildOriginalAssignments(lanes);
  
  let resultOverrides: { time: Record<string, number>; lane: Record<string, string> } = {
    time: {},
    lane: {},
  };

  // Phase 0: Apply recommended call times (highest priority)
  if (rosteringData?.recommendedCallTimes?.length) {
    const recommendedResult = applyRecommendedCallTimes(
      workloads,
      rosteringData.recommendedCallTimes,
      enforcedConstraints.respectTimeCritical,
      enforcedConstraints
    );
    mergeOverrides(resultOverrides, recommendedResult);
    applyOverridesToWorkloads(workloads, recommendedResult);
  }

  // Phase 1: Travel optimization (if weight > 0)
  if (normalizedWeights.travel > 0) {
    const travelResult = optimizeForTravel(workloads, enforcedConstraints);
    mergeOverrides(resultOverrides, travelResult);
    applyOverridesToWorkloads(workloads, travelResult);
  }

  // Phase 2: Workload balancing (if weight > 0 and cross-worker moves allowed)
  if (normalizedWeights.balance > 0 && constraints.allowCrossWorkerMoves) {
    const balanceResult = optimizeForBalance(
      workloads,
      enforcedConstraints,
      normalizedWeights.balance,
      rosteringData?.workerConstraints,
      rosteringData?.weeklyTotals
    );
    mergeOverrides(resultOverrides, balanceResult);
    applyOverridesToWorkloads(workloads, balanceResult);
  }

  // Phase 3: Worker template optimization (respect who visits whom)
  if (rosteringData?.workerTemplates?.length && constraints.allowCrossWorkerMoves) {
    const templateResult = optimizeForWorkerTemplates(
      workloads,
      rosteringData.workerTemplates,
      rosteringData.workerConstraints,
      rosteringData.weeklyTotals,
      enforcedConstraints.lockTemplatedCalls
    );
    mergeOverrides(resultOverrides, templateResult);
    applyOverridesToWorkloads(workloads, templateResult);
  }

  // Phase 4: Continuity optimization (if weight > 0)
  if (normalizedWeights.continuity > 0) {
    const continuityResult = optimizeForContinuity(
      workloads,
      originalAssignments,
      enforcedConstraints,
      normalizedWeights.continuity
    );
    mergeOverrides(resultOverrides, continuityResult);
  }

  // Phase 5: Final packing pass (respects working hours constraints)
  const packingResult = packAllLanes(workloads, enforcedConstraints.minBufferMinutes, enforcedConstraints.respectTimeCritical, enforcedConstraints);
  mergeOverrides(resultOverrides, packingResult);

  // Calculate result metrics
  const metrics = calculateResultMetrics(
    lanes,
    workloads,
    originalAssignments,
    resultOverrides,
    enforcedConstraints,
    rosteringData?.recommendedCallTimes
  );

  return {
    timeOverrides: resultOverrides.time,
    laneOverrides: resultOverrides.lane,
    metrics,
  };
};

/**
 * Optimize primarily for minimizing travel time
 */
export const optimizeForTravel = (
  workloads: LaneWorkload[],
  constraints: OptimizationConstraints
): { time: Record<string, number>; lane: Record<string, string> } => {
  const timeOverrides: Record<string, number> = {};

  for (const workload of workloads) {
    // Separate time-critical and flexible entries
    const timeCritical = workload.entries.filter((e) => e.isTimeCritical && constraints.respectTimeCritical);
    const flexible = workload.entries.filter((e) => !e.isTimeCritical || !constraints.respectTimeCritical);

    // Order flexible entries by nearest neighbor
    const orderedIds = orderByNearestNeighbor(
      flexible.map((e) => ({
        id: e.id,
        startMinutes: e.startMinutes,
        durationMinutes: e.durationMinutes,
        lat: e.lat ?? null,
        lon: e.lon ?? null,
      }))
    );

    // Create ordered entry list with time-critical entries in their original positions
    const allEntriesSorted = [...workload.entries].sort((a, b) => a.startMinutes - b.startMinutes);
    const workingStart = constraints.workingHoursStart ?? DEFAULT_WORKING_HOURS_START;
    let cursor = allEntriesSorted[0]?.startMinutes ?? workingStart;

    // Build a combined schedule
    const flexibleOrdered = orderedIds
      .map((id) => flexible.find((e) => e.id === id))
      .filter((e): e is EntryWithLocation => e !== undefined);

    let flexIdx = 0;
    for (const original of allEntriesSorted) {
      if (timeCritical.some((tc) => tc.id === original.id)) {
        // Time-critical: keep original time (within tolerance)
        timeOverrides[original.id] = original.startMinutes;
        cursor = Math.max(cursor, original.startMinutes + original.durationMinutes + 5);
      } else if (flexIdx < flexibleOrdered.length) {
        const entry = flexibleOrdered[flexIdx];
        const newStart = Math.max(cursor, workingStart);
        timeOverrides[entry.id] = clampToWorkingHours(newStart, entry.durationMinutes, constraints);
        cursor = newStart + entry.durationMinutes + 5;
        flexIdx++;
      }
    }
  }

  return { time: timeOverrides, lane: {} };
};

/**
 * Optimize for balanced workload across workers
 */
export const optimizeForBalance = (
  workloads: LaneWorkload[],
  constraints: OptimizationConstraints,
  balanceWeight: number,
  workerConstraints?: WorkerConstraint[],
  weeklyTotals?: Map<string, WeeklyTotals>
): { time: Record<string, number>; lane: Record<string, string> } => {
  const laneOverrides: Record<string, string> = {};
  const timeOverrides: Record<string, number> = {};

  if (workloads.length < 2) return { time: timeOverrides, lane: laneOverrides };

  // Build constraint lookup
  const constraintsByWorker = new Map<string, WorkerConstraint>();
  if (workerConstraints) {
    for (const c of workerConstraints) {
      constraintsByWorker.set(c.workerKey, c);
    }
  }

  const weeklyTotalsByWorker = new Map<string, WeeklyTotals>();
  if (weeklyTotals) {
    for (const [workerKey, totals] of weeklyTotals) {
      weeklyTotalsByWorker.set(workerKey, { ...totals });
    }
  }

  // Calculate target workload per worker
  const totalMinutes = workloads.reduce((sum, w) => sum + w.totalMinutes, 0);
  const targetMinutes = totalMinutes / workloads.length;
  const tolerance = targetMinutes * 0.15; // 15% tolerance

  // Iteratively balance
  const maxIterations = Math.ceil(20 * balanceWeight);
  
  for (let i = 0; i < maxIterations; i++) {
    // Sort by workload
    workloads.sort((a, b) => b.totalMinutes - a.totalMinutes);
    
    const overloaded = workloads[0];
    const underloaded = workloads[workloads.length - 1];
    
    const gap = overloaded.totalMinutes - underloaded.totalMinutes;
    if (gap < tolerance) break;

    // Find moveable entry (not time-critical if constraint is on)
    const moveable = overloaded.entries
      .filter((e) => !e.isTimeCritical || !constraints.respectTimeCritical)
      .filter((e) => !(constraints.lockTemplatedCalls && e.isTemplated))
      .sort((a, b) => b.durationMinutes - a.durationMinutes)[0];

    if (!moveable) break;

    const underloadedConstraint = constraintsByWorker.get(underloaded.laneId);
    const projectedCalls = underloaded.entries.length + 1;
    const projectedMinutes = underloaded.totalMinutes + moveable.durationMinutes;
    if (underloadedConstraint?.maxCallsPerDay && projectedCalls > underloadedConstraint.maxCallsPerDay) {
      continue;
    }
    if (underloadedConstraint?.maxMinutesPerDay && projectedMinutes > underloadedConstraint.maxMinutesPerDay) {
      continue;
    }

    const weeklyUnderloaded = weeklyTotalsByWorker.get(underloaded.laneId) ?? { calls: 0, minutes: 0 };
    if (underloadedConstraint?.maxCallsPerWeek && weeklyUnderloaded.calls + 1 > underloadedConstraint.maxCallsPerWeek) {
      continue;
    }
    if (underloadedConstraint?.maxMinutesPerWeek && weeklyUnderloaded.minutes + moveable.durationMinutes > underloadedConstraint.maxMinutesPerWeek) {
      continue;
    }

    // Move entry
    overloaded.entries = overloaded.entries.filter((e) => e.id !== moveable.id);
    overloaded.totalMinutes -= moveable.durationMinutes;
    underloaded.entries.push(moveable);
    underloaded.totalMinutes += moveable.durationMinutes;
    
    laneOverrides[moveable.id] = underloaded.laneId;

    if (weeklyTotalsByWorker.size > 0) {
      const weeklyOverloaded = weeklyTotalsByWorker.get(overloaded.laneId) ?? { calls: 0, minutes: 0 };
      weeklyUnderloaded.calls += 1;
      weeklyUnderloaded.minutes += moveable.durationMinutes;
      weeklyOverloaded.calls = Math.max(0, weeklyOverloaded.calls - 1);
      weeklyOverloaded.minutes = Math.max(0, weeklyOverloaded.minutes - moveable.durationMinutes);
      weeklyTotalsByWorker.set(underloaded.laneId, weeklyUnderloaded);
      weeklyTotalsByWorker.set(overloaded.laneId, weeklyOverloaded);
    }
  }

  return { time: timeOverrides, lane: laneOverrides };
};

/**
 * Optimize for care continuity (keeping same worker for service users)
 */
export const optimizeForContinuity = (
  workloads: LaneWorkload[],
  originalAssignments: Map<string, string>, // serviceUserKey -> preferred laneId
  constraints: OptimizationConstraints,
  continuityWeight: number
): { time: Record<string, number>; lane: Record<string, string> } => {
  const laneOverrides: Record<string, string> = {};

  if (!constraints.allowCrossWorkerMoves) {
    return { time: {}, lane: laneOverrides };
  }

  // For each entry, check if it should be moved back to preferred worker
  for (const workload of workloads) {
    for (const entry of workload.entries) {
      if (!entry.serviceUserKey) continue;
      if (constraints.lockTemplatedCalls && entry.isTemplated) continue;
      
      const preferredLane = originalAssignments.get(entry.serviceUserKey);
      if (!preferredLane || preferredLane === workload.laneId) continue;

      // Only move if continuity weight justifies it
      if (Math.random() > continuityWeight) continue;

      // Check if time-critical constraint prevents move
      if (entry.isTimeCritical && constraints.respectTimeCritical) continue;

      laneOverrides[entry.id] = preferredLane;
    }
  }

  return { time: {}, lane: laneOverrides };
};

// ============================================================================
// Helper Functions
// ============================================================================

const buildWorkloads = (
  lanes: GanttLane[],
  geocodedPoints?: Map<string, { lat: number; lon: number }>
): LaneWorkload[] => {
  return lanes.map((lane) => ({
    laneId: lane.id,
    label: lane.label,
    totalMinutes: lane.entries.reduce((sum, e) => sum + e.durationMinutes, 0),
    entries: lane.entries.map((entry) => {
      const geo = geocodedPoints?.get(entry.id);
      return {
        ...entry,
        lat: geo?.lat,
        lon: geo?.lon,
        originalLaneId: lane.id,
        serviceUserKey: entry.serviceUserName?.toLowerCase().replace(/\s+/g, "_") ?? null,
        isTemplated: entry.isTemplated ?? false,
      };
    }),
  }));
};

const buildOriginalAssignments = (lanes: GanttLane[]): Map<string, string> => {
  const assignments = new Map<string, string>();
  for (const lane of lanes) {
    for (const entry of lane.entries) {
      const key = entry.serviceUserName?.toLowerCase().replace(/\s+/g, "_");
      if (key && !assignments.has(key)) {
        assignments.set(key, lane.id);
      }
    }
  }
  return assignments;
};

const packAllLanes = (
  workloads: LaneWorkload[],
  bufferMinutes: number,
  respectTimeCritical: boolean,
  constraints?: OptimizationConstraints
): { time: Record<string, number>; lane: Record<string, string> } => {
  const timeOverrides: Record<string, number> = {};
  const workingStart = constraints?.workingHoursStart ?? DEFAULT_WORKING_HOURS_START;
  const workingEnd = constraints?.workingHoursEnd ?? DEFAULT_WORKING_HOURS_END;

  for (const workload of workloads) {
    const sorted = [...workload.entries].sort((a, b) => a.startMinutes - b.startMinutes);
    let cursor = workingStart;

    for (const entry of sorted) {
      if (entry.isTimeCritical && respectTimeCritical) {
        // Time-critical: keep at original time (within tolerance if constraints provided)
        const tolerance = constraints?.timeCriticalToleranceMinutes ?? DEFAULT_TIME_CRITICAL_TOLERANCE;
        timeOverrides[entry.id] = entry.startMinutes;
        cursor = Math.max(cursor, entry.startMinutes + entry.durationMinutes + bufferMinutes);
      } else {
        const window = getCallTypeWindow(entry.callTypeLabel, constraints);
        let proposed = Math.max(cursor, workingStart);
        const isUntimed = isUntimedCallType(entry.callTypeLabel);
        if (window && !entry.isTemplated && !isUntimed) {
          proposed = Math.max(proposed, window.start);
        }
        const maxStart = Math.min(
          workingEnd - entry.durationMinutes,
          window && !entry.isTemplated && !isUntimed
            ? window.end - entry.durationMinutes
            : workingEnd - entry.durationMinutes
        );
        if (proposed > maxStart) {
          proposed = Math.max(cursor, workingStart);
        }
        proposed = Math.min(proposed, workingEnd - entry.durationMinutes);
        if (!entry.isTemplated && !isUntimed) {
          proposed = clampToCallTypeWindow(proposed, entry.durationMinutes, entry.callTypeLabel, constraints);
        } else if (!entry.isTemplated && isUntimed) {
          proposed = clampToUntimedGap(proposed, entry.durationMinutes, constraints);
        }
        if (proposed < cursor) proposed = cursor;
        timeOverrides[entry.id] = Math.max(proposed, workingStart);
        cursor = timeOverrides[entry.id] + entry.durationMinutes + bufferMinutes;
      }
    }
  }

  return { time: timeOverrides, lane: {} };
};

/**
 * Apply recommended call times from database
 */
const applyRecommendedCallTimes = (
  workloads: LaneWorkload[],
  recommendedTimes: RecommendedCallTime[],
  respectTimeCritical: boolean,
  constraints?: OptimizationConstraints
): { time: Record<string, number>; lane: Record<string, string> } => {
  const timeOverrides: Record<string, number> = {};
  
  // Build lookup by service user + call type
  const recommendedLookup = new Map<string, RecommendedCallTime>();
  for (const rec of recommendedTimes) {
    const key = `${rec.serviceUserKey}|${rec.callTypeLabel.toLowerCase()}`;
    recommendedLookup.set(key, rec);
  }
  
  for (const workload of workloads) {
    for (const entry of workload.entries) {
      if (entry.isTimeCritical && respectTimeCritical) continue;
      
      const suKey = entry.serviceUserKey;
      const callType = entry.callTypeLabel?.toLowerCase();
      if (!suKey || !callType) continue;
      
      const key = `${suKey}|${callType}`;
      const recommended = recommendedLookup.get(key);
      if (recommended) {
        let clamped = recommended.recommendedStartMinutes;
        if (!entry.isTemplated && !isUntimedCallType(entry.callTypeLabel)) {
          clamped = clampToCallTypeWindow(
            recommended.recommendedStartMinutes,
            entry.durationMinutes,
            entry.callTypeLabel,
            constraints
          );
        } else if (!entry.isTemplated && isUntimedCallType(entry.callTypeLabel)) {
          clamped = clampToUntimedGap(
            recommended.recommendedStartMinutes,
            entry.durationMinutes,
            constraints
          );
        }
        timeOverrides[entry.id] = clamped;
      }
    }
  }
  
  return { time: timeOverrides, lane: {} };
};

/**
 * Optimize based on worker templates (who should visit whom)
 */
const optimizeForWorkerTemplates = (
  workloads: LaneWorkload[],
  templates: WorkerTemplate[],
  workerConstraints?: WorkerConstraint[],
  weeklyTotals?: Map<string, WeeklyTotals>,
  lockTemplatedCalls = true
): { time: Record<string, number>; lane: Record<string, string> } => {
  const laneOverrides: Record<string, string> = {};
  
  // Build lookup: serviceUserKey -> preferred workerKey
  const preferredWorker = new Map<string, string>();
  for (const template of templates) {
    if (template.isPrimary) {
      preferredWorker.set(template.serviceUserKey, template.workerKey);
    }
  }
  
  // Build constraint lookup
  const constraintsByWorker = new Map<string, WorkerConstraint>();
  if (workerConstraints) {
    for (const c of workerConstraints) {
      constraintsByWorker.set(c.workerKey, c);
    }
  }

  const weeklyTotalsByWorker = new Map<string, WeeklyTotals>();
  if (weeklyTotals) {
    for (const [workerKey, totals] of weeklyTotals) {
      weeklyTotalsByWorker.set(workerKey, { ...totals });
    }
  }
  
  // Track call counts for constraint checking
  const workerCallCounts = new Map<string, number>();
  for (const workload of workloads) {
    workerCallCounts.set(workload.laneId, workload.entries.length);
  }
  
  // Move entries to their preferred workers
  for (const workload of workloads) {
    for (const entry of workload.entries) {
      if (!entry.serviceUserKey) continue;
      if (lockTemplatedCalls && entry.isTemplated) continue;
      
      const preferred = preferredWorker.get(entry.serviceUserKey);
      if (!preferred || preferred === workload.laneId) continue;
      
      // Check if target worker has capacity
      const targetConstraint = constraintsByWorker.get(preferred);
      const targetCallCount = workerCallCounts.get(preferred) || 0;
      if (targetConstraint?.maxCallsPerDay && targetCallCount + 1 > targetConstraint.maxCallsPerDay) {
        continue; // Target worker is at capacity
      }
      const weeklyTarget = weeklyTotalsByWorker.get(preferred) ?? { calls: 0, minutes: 0 };
      if (targetConstraint?.maxCallsPerWeek && weeklyTarget.calls + 1 > targetConstraint.maxCallsPerWeek) {
        continue;
      }
      if (targetConstraint?.maxMinutesPerWeek && weeklyTarget.minutes + entry.durationMinutes > targetConstraint.maxMinutesPerWeek) {
        continue;
      }
      
      laneOverrides[entry.id] = preferred;
      workerCallCounts.set(preferred, targetCallCount + 1);
      workerCallCounts.set(workload.laneId, (workerCallCounts.get(workload.laneId) || 1) - 1);

      if (weeklyTotalsByWorker.size > 0) {
        weeklyTarget.calls += 1;
        weeklyTarget.minutes += entry.durationMinutes;
        const weeklySource = weeklyTotalsByWorker.get(workload.laneId) ?? { calls: 0, minutes: 0 };
        weeklySource.calls = Math.max(0, weeklySource.calls - 1);
        weeklySource.minutes = Math.max(0, weeklySource.minutes - entry.durationMinutes);
        weeklyTotalsByWorker.set(preferred, weeklyTarget);
        weeklyTotalsByWorker.set(workload.laneId, weeklySource);
      }
    }
  }
  
  return { time: {}, lane: laneOverrides };
};

const mergeOverrides = (
  target: { time: Record<string, number>; lane: Record<string, string> },
  source: { time: Record<string, number>; lane: Record<string, string> }
): void => {
  Object.assign(target.time, source.time);
  Object.assign(target.lane, source.lane);
};

const applyOverridesToWorkloads = (
  workloads: LaneWorkload[],
  overrides: { time: Record<string, number>; lane: Record<string, string> }
): void => {
  // Apply time overrides
  for (const workload of workloads) {
    for (const entry of workload.entries) {
      if (overrides.time[entry.id] !== undefined) {
        entry.startMinutes = overrides.time[entry.id];
      }
    }
  }

  // Apply lane overrides
  for (const [entryId, targetLaneId] of Object.entries(overrides.lane)) {
    // Find entry in current workload
    for (const workload of workloads) {
      const entryIdx = workload.entries.findIndex((e) => e.id === entryId);
      if (entryIdx !== -1) {
        const [entry] = workload.entries.splice(entryIdx, 1);
        workload.totalMinutes -= entry.durationMinutes;
        
        // Add to target workload
        const targetWorkload = workloads.find((w) => w.laneId === targetLaneId);
        if (targetWorkload) {
          targetWorkload.entries.push(entry);
          targetWorkload.totalMinutes += entry.durationMinutes;
        }
        break;
      }
    }
  }
};

const calculateResultMetrics = (
  originalLanes: GanttLane[],
  workloads: LaneWorkload[],
  originalAssignments: Map<string, string>,
  overrides: { time: Record<string, number>; lane: Record<string, string> },
  constraints: OptimizationConstraints,
  recommendedTimes?: RecommendedCallTime[]
): OptimizationResultMetrics => {
  // Calculate travel reduction (simplified - would need geocoding for accuracy)
  const originalTotalGaps = calculateTotalGaps(originalLanes);
  const optimizedTotalGaps = calculateTotalGapsFromWorkloads(workloads, overrides.time);
  const totalTravelReduction = Math.max(0, originalTotalGaps - optimizedTotalGaps);

  // Calculate workload variance
  const workloadMinutes = workloads.map((w) => w.totalMinutes);
  const avgWorkload = workloadMinutes.reduce((a, b) => a + b, 0) / workloadMinutes.length;
  const variance = workloadMinutes.reduce((sum, m) => sum + Math.pow(m - avgWorkload, 2), 0) / workloadMinutes.length;
  const workloadVariance = Math.sqrt(variance);

  // Calculate continuity score
  let totalServiceUsers = 0;
  let continuityMaintained = 0;
  for (const workload of workloads) {
    for (const entry of workload.entries) {
      if (!entry.serviceUserKey) continue;
      totalServiceUsers++;
      const originalLane = originalAssignments.get(entry.serviceUserKey);
      const currentLane = overrides.lane[entry.id] || workload.laneId;
      if (originalLane === currentLane) {
        continuityMaintained++;
      }
    }
  }
  const continuityScore = totalServiceUsers > 0
    ? Math.round((continuityMaintained / totalServiceUsers) * 100)
    : 100;

  // Count constraint violations
  let constraintViolations = 0;
  if (constraints.respectTimeCritical) {
    for (const lane of originalLanes) {
      for (const entry of lane.entries) {
        if (entry.isTimeCritical && overrides.time[entry.id] !== entry.startMinutes) {
          constraintViolations++;
        }
      }
    }
  }

  // Calculate recommended time score
  let recommendedTimeScore = 100;
  if (recommendedTimes && recommendedTimes.length > 0) {
    const recommendedLookup = new Map<string, RecommendedCallTime>();
    for (const rec of recommendedTimes) {
      const key = `${rec.serviceUserKey}|${rec.callTypeLabel.toLowerCase()}`;
      recommendedLookup.set(key, rec);
    }
    
    let totalWithRecommendation = 0;
    let withinTolerance = 0;
    
    for (const workload of workloads) {
      for (const entry of workload.entries) {
        const suKey = entry.serviceUserKey;
        const callType = entry.callTypeLabel?.toLowerCase();
        if (!suKey || !callType) continue;
        
        const key = `${suKey}|${callType}`;
        const recommended = recommendedLookup.get(key);
        if (recommended) {
          totalWithRecommendation++;
          const actualTime = overrides.time[entry.id] ?? entry.startMinutes;
          const diff = Math.abs(actualTime - recommended.recommendedStartMinutes);
          if (diff <= recommended.toleranceMinutes) {
            withinTolerance++;
          }
        }
      }
    }
    
    recommendedTimeScore = totalWithRecommendation > 0
      ? Math.round((withinTolerance / totalWithRecommendation) * 100)
      : 100;
  }

  return {
    totalTravelReduction,
    workloadVariance,
    continuityScore,
    constraintViolations,
    recommendedTimeScore,
  };
};

const calculateTotalGaps = (lanes: GanttLane[]): number => {
  let totalGaps = 0;
  for (const lane of lanes) {
    const sorted = [...lane.entries].sort((a, b) => a.startMinutes - b.startMinutes);
    for (let i = 1; i < sorted.length; i++) {
      const prevEnd = sorted[i - 1].startMinutes + sorted[i - 1].durationMinutes;
      const gap = sorted[i].startMinutes - prevEnd;
      if (gap > 0) totalGaps += gap;
    }
  }
  return totalGaps;
};

const calculateTotalGapsFromWorkloads = (
  workloads: LaneWorkload[],
  timeOverrides: Record<string, number>
): number => {
  let totalGaps = 0;
  for (const workload of workloads) {
    const sorted = [...workload.entries]
      .map((e) => ({ ...e, startMinutes: timeOverrides[e.id] ?? e.startMinutes }))
      .sort((a, b) => a.startMinutes - b.startMinutes);
    
    for (let i = 1; i < sorted.length; i++) {
      const prevEnd = sorted[i - 1].startMinutes + sorted[i - 1].durationMinutes;
      const gap = sorted[i].startMinutes - prevEnd;
      if (gap > 0) totalGaps += gap;
    }
  }
  return totalGaps;
};
