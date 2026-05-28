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
  totalTravelReduction: number;         // Minutes saved
  workloadVariance: number;             // Standard deviation of workload across workers
  continuityScore: number;              // 0-100% of service users keeping same worker
  constraintViolations: number;         // Number of hard-constraint violations
  recommendedTimeScore: number;         // 0-100% of calls at recommended times
  breakViolations: number;              // Workers with 5+ hours continuous work and no adequate break
  travelFeasibilityViolations: number;  // Consecutive call pairs where gap < estimated travel time
  avgWorkloadMinutes: number;           // Average care minutes per worker
  overloadedWorkers: number;            // Workers exceeding 8 hours of care
  underutilisedWorkers: number;         // Workers with fewer than 4 hours of care (but > 0)
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

const normalizeLabelForMatch = (value: string | null | undefined) =>
  (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

/**
 * Call time windows keep the day in a predictable order:
 * AM → Lunch → Tea/PM → Bed/Evening
 *
 * NOTE: Treat "PM" as Tea/Afternoon (common rostering convention), not Bed.
 */
const CALL_TIME_WINDOWS = [
  { match: /(^| )(am|morning|wake|breakfast)( |$)/, start: 6 * 60, end: 12 * 60 },
  { match: /(^| )(lunch|midday|noon)( |$)/, start: 12 * 60, end: 14 * 60 },
  { match: /(^| )(tea|afternoon|pm)( |$)/, start: 14 * 60, end: 17 * 60 },
  { match: /(^| )(bed|evening|night|late|eve)( |$)/, start: 17 * 60, end: 22 * 60 },
] as const;
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
  const normalized = normalizeLabelForMatch(callTypeLabel);
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

const getCallTypePriority = (callTypeLabel: string | null | undefined): number => {
  if (!callTypeLabel) return 99;
  const normalized = normalizeLabelForMatch(callTypeLabel);
  for (let i = 0; i < CALL_TIME_WINDOWS.length; i += 1) {
    if (CALL_TIME_WINDOWS[i].match.test(normalized)) return i + 1; // 1..N
  }
  return 99;
};

const getCallTypeWindowIndex = (callTypeLabel: string | null | undefined): number | null => {
  if (!callTypeLabel) return null;
  const normalized = normalizeLabelForMatch(callTypeLabel);
  for (let i = 0; i < CALL_TIME_WINDOWS.length; i += 1) {
    if (CALL_TIME_WINDOWS[i].match.test(normalized)) return i;
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
    rosteringData?.recommendedCallTimes,
    rosteringData?.workerConstraints
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

    // Order flexible entries within each time band (AM -> Lunch -> Tea -> Bed -> Other),
    // then by nearest-neighbor to reduce travel within that band.
    const flexibleByPriority = new Map<number, EntryWithLocation[]>();
    for (const entry of flexible) {
      const prio = getCallTypePriority(entry.callTypeLabel);
      const group = flexibleByPriority.get(prio) ?? [];
      group.push(entry);
      flexibleByPriority.set(prio, group);
    }
    const priorities = Array.from(flexibleByPriority.keys()).sort((a, b) => a - b);
    const flexibleOrdered: EntryWithLocation[] = [];
    for (const prio of priorities) {
      const group = flexibleByPriority.get(prio) ?? [];
      const orderedIds = orderByNearestNeighbor(
        group.map((e) => ({
          id: e.id,
          startMinutes: e.startMinutes,
          durationMinutes: e.durationMinutes,
          lat: e.lat ?? null,
          lon: e.lon ?? null,
        }))
      );
      for (const id of orderedIds) {
        const found = group.find((e) => e.id === id);
        if (found) flexibleOrdered.push(found);
      }
    }

    // Create ordered entry list with time-critical entries in their original positions
    const allEntriesSorted = [...workload.entries].sort((a, b) => a.startMinutes - b.startMinutes);
    const workingStart = constraints.workingHoursStart ?? DEFAULT_WORKING_HOURS_START;
    let cursor = allEntriesSorted[0]?.startMinutes ?? workingStart;

    let flexIdx = 0;
    for (const original of allEntriesSorted) {
      if (timeCritical.some((tc) => tc.id === original.id)) {
        // Time-critical: keep original time (within tolerance)
        timeOverrides[original.id] = original.startMinutes;
        cursor = Math.max(cursor, original.startMinutes + original.durationMinutes + 5);
      } else if (flexIdx < flexibleOrdered.length) {
        const entry = flexibleOrdered[flexIdx];
        let proposed = Math.max(cursor, workingStart);
        proposed = clampToWorkingHours(proposed, entry.durationMinutes, constraints);
        const isUntimed = isUntimedCallType(entry.callTypeLabel);
        if (!isUntimed) {
          proposed = clampToCallTypeWindow(proposed, entry.durationMinutes, entry.callTypeLabel, constraints);
        } else {
          proposed = clampToUntimedGap(proposed, entry.durationMinutes, constraints);
        }
        timeOverrides[entry.id] = proposed;
        cursor = proposed + entry.durationMinutes + 5;
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

  // Collect every entry that could be moved back to its preferred (continuity) worker.
  // Gathering first lets us make a deterministic, reproducible decision below instead of
  // a per-entry random roll — the optimiser must produce identical output for identical input.
  const candidates: Array<{ entryId: string; serviceUserKey: string; preferredLane: string }> = [];
  for (const workload of workloads) {
    for (const entry of workload.entries) {
      if (!entry.serviceUserKey) continue;
      if (constraints.lockTemplatedCalls && entry.isTemplated) continue;

      const preferredLane = originalAssignments.get(entry.serviceUserKey);
      if (!preferredLane || preferredLane === workload.laneId) continue;

      // Time-critical calls cannot be reassigned when the constraint is enforced.
      if (entry.isTimeCritical && constraints.respectTimeCritical) continue;

      candidates.push({ entryId: entry.id, serviceUserKey: entry.serviceUserKey, preferredLane });
    }
  }

  if (candidates.length === 0) return { time: {}, lane: laneOverrides };

  // Higher continuity weight restores more relationships. Decide deterministically:
  // sort candidates by a stable key, then restore the top fraction implied by the weight.
  // weight >= 1 restores all; weight <= 0 restores none.
  const clampedWeight = Math.max(0, Math.min(1, continuityWeight));
  const restoreCount = Math.round(clampedWeight * candidates.length);
  if (restoreCount <= 0) return { time: {}, lane: laneOverrides };

  candidates.sort((a, b) =>
    a.serviceUserKey.localeCompare(b.serviceUserKey) || a.entryId.localeCompare(b.entryId)
  );

  for (let i = 0; i < restoreCount && i < candidates.length; i += 1) {
    laneOverrides[candidates[i].entryId] = candidates[i].preferredLane;
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
  constraints: OptimizationConstraints
): { time: Record<string, number>; lane: Record<string, string> } => {
  const timeOverrides: Record<string, number> = {};
  const workingStart = constraints.workingHoursStart ?? DEFAULT_WORKING_HOURS_START;
  const workingEnd = constraints.workingHoursEnd ?? DEFAULT_WORKING_HOURS_END;

  type Block = { start: number; end: number };
  const insertBlock = (blocks: Block[], block: Block) => {
    if (!Number.isFinite(block.start) || !Number.isFinite(block.end) || block.end <= block.start) return;
    blocks.push(block);
    blocks.sort((a, b) => a.start - b.start);
    // Merge overlaps
    let write = 0;
    for (let i = 0; i < blocks.length; i += 1) {
      const curr = blocks[i];
      if (write === 0) {
        blocks[write++] = curr;
        continue;
      }
      const prev = blocks[write - 1];
      if (curr.start <= prev.end) {
        prev.end = Math.max(prev.end, curr.end);
      } else {
        blocks[write++] = curr;
      }
    }
    blocks.length = write;
  };

  const findEarliestInRange = (
    blocks: Block[],
    rangeStart: number,
    rangeEnd: number,
    desiredStart: number,
    durationMinutes: number
  ): number | null => {
    let cursor = Math.max(rangeStart, desiredStart);
    if (cursor + durationMinutes > rangeEnd) return null;
    for (const block of blocks) {
      if (cursor + durationMinutes <= block.start) {
        return cursor;
      }
      if (cursor < block.end) {
        cursor = block.end;
      }
      if (cursor + durationMinutes > rangeEnd) {
        return null;
      }
    }
    return cursor + durationMinutes <= rangeEnd ? cursor : null;
  };

  const orderedBands = CALL_TIME_WINDOWS.map((band) => ({
    start: Math.max(workingStart, band.start),
    end: Math.min(workingEnd, band.end),
  }));

  for (const workload of workloads) {
    const blocks: Block[] = [];
    const used = new Set<string>();

    // 1) Anchor time-critical calls first (prevents overlaps caused by priority sorting).
    if (respectTimeCritical) {
      const fixed = workload.entries
        .filter((e) => e.isTimeCritical)
        .sort((a, b) => a.startMinutes - b.startMinutes);
      for (const entry of fixed) {
        const start = clampToWorkingHours(entry.startMinutes, entry.durationMinutes, constraints);
        timeOverrides[entry.id] = start;
        insertBlock(blocks, { start, end: start + entry.durationMinutes + bufferMinutes });
        used.add(entry.id);
      }
    }

    const flexible = workload.entries.filter((e) => !used.has(e.id));

    // 2) Timed calls by band order: AM → Lunch → Tea/PM → Bed/Evening
    for (let bandIdx = 0; bandIdx < orderedBands.length; bandIdx += 1) {
      const band = orderedBands[bandIdx];
      if (band.end <= band.start) continue;

      const bandEntries = flexible
        .filter(
          (e) =>
            !used.has(e.id) &&
            !isUntimedCallType(e.callTypeLabel) &&
            getCallTypeWindowIndex(e.callTypeLabel) === bandIdx
        )
        .sort((a, b) => a.startMinutes - b.startMinutes);

      let cursor = band.start;
      for (const entry of bandEntries) {
        const desired = Math.max(band.start, cursor, entry.startMinutes);
        let start =
          findEarliestInRange(blocks, band.start, band.end, desired, entry.durationMinutes) ??
          // If the band is saturated, spill forward (keeps AM before Lunch, etc.)
          findEarliestInRange(
            blocks,
            Math.max(band.end, workingStart),
            workingEnd,
            Math.max(band.end, cursor),
            entry.durationMinutes
          ) ??
          Math.max(workingStart, Math.min(workingEnd - entry.durationMinutes, desired));

        start = clampToWorkingHours(start, entry.durationMinutes, constraints);
        start = clampToCallTypeWindow(start, entry.durationMinutes, entry.callTypeLabel, constraints);

        timeOverrides[entry.id] = start;
        insertBlock(blocks, { start, end: start + entry.durationMinutes + bufferMinutes });
        used.add(entry.id);
        cursor = start + entry.durationMinutes + bufferMinutes;
      }
    }

    // 3) Untimed calls: try to place in natural gaps.
    const untimed = flexible
      .filter((e) => !used.has(e.id) && isUntimedCallType(e.callTypeLabel))
      .sort((a, b) => a.startMinutes - b.startMinutes);

    for (const entry of untimed) {
      const desired = clampToWorkingHours(entry.startMinutes, entry.durationMinutes, constraints);
      const preferred = clampToUntimedGap(desired, entry.durationMinutes, constraints);
      const start =
        findEarliestInRange(blocks, workingStart, workingEnd, preferred, entry.durationMinutes) ??
        findEarliestInRange(blocks, workingStart, workingEnd, desired, entry.durationMinutes) ??
        Math.max(workingStart, Math.min(workingEnd - entry.durationMinutes, desired));

      timeOverrides[entry.id] = start;
      insertBlock(blocks, { start, end: start + entry.durationMinutes + bufferMinutes });
      used.add(entry.id);
    }

    // 4) Everything else (unknown call labels): schedule wherever it fits.
    const remaining = flexible
      .filter((e) => !used.has(e.id))
      .sort((a, b) => a.startMinutes - b.startMinutes);

    for (const entry of remaining) {
      const desired = clampToWorkingHours(entry.startMinutes, entry.durationMinutes, constraints);
      const start =
        findEarliestInRange(blocks, workingStart, workingEnd, desired, entry.durationMinutes) ??
        Math.max(workingStart, Math.min(workingEnd - entry.durationMinutes, desired));

      timeOverrides[entry.id] = start;
      insertBlock(blocks, { start, end: start + entry.durationMinutes + bufferMinutes });
      used.add(entry.id);
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

/**
 * Count hard-constraint violations in the optimised schedule.
 *
 * Mirrors docs/Rostering.md §5.4–5.6 and §6 step 5: a defensible decision trail must
 * surface (a) double-booked / overlapping visits, (b) per-worker hour-cap breaches, and
 * (c) time-critical calls pushed outside their tolerance window. Each distinct failure
 * counts once. Computed from the *final* schedule (final lane membership + override times).
 */
export const countConstraintViolations = (
  workloads: LaneWorkload[],
  overrides: { time: Record<string, number>; lane: Record<string, string> },
  constraints: OptimizationConstraints,
  workerConstraints?: WorkerConstraint[]
): number => {
  let violations = 0;

  const constraintsByWorker = new Map<string, WorkerConstraint>();
  if (workerConstraints) {
    for (const c of workerConstraints) constraintsByWorker.set(c.workerKey, c);
  }

  const tolerance = constraints.timeCriticalToleranceMinutes ?? DEFAULT_TIME_CRITICAL_TOLERANCE;

  for (const workload of workloads) {
    const scheduled = workload.entries
      .map((entry) => {
        const start = overrides.time[entry.id] ?? entry.startMinutes;
        return { entry, start, end: start + entry.durationMinutes };
      })
      .sort((a, b) => a.start - b.start || a.end - b.end);

    // (a) No-overlap / no double-booking: any consecutive pair that overlaps in time.
    for (let i = 1; i < scheduled.length; i += 1) {
      if (scheduled[i].start < scheduled[i - 1].end) {
        violations += 1;
      }
    }

    // (c) Time-critical tolerance: a pinned call moved beyond its allowed window.
    if (constraints.respectTimeCritical) {
      for (const { entry } of scheduled) {
        if (!entry.isTimeCritical) continue;
        const movedTo = overrides.time[entry.id];
        if (typeof movedTo === "number" && Math.abs(movedTo - entry.startMinutes) > tolerance) {
          violations += 1;
        }
      }
    }

    // (b) Per-worker daily hard limits (calls + minutes), when constraints are supplied.
    const limit = constraintsByWorker.get(workload.laneId);
    if (limit) {
      const callCount = workload.entries.length;
      const minuteTotal = workload.entries.reduce((sum, e) => sum + e.durationMinutes, 0);
      if (limit.maxCallsPerDay && callCount > limit.maxCallsPerDay) violations += 1;
      if (limit.maxMinutesPerDay && minuteTotal > limit.maxMinutesPerDay) violations += 1;
    }
  }

  return violations;
};

const calculateResultMetrics = (
  originalLanes: GanttLane[],
  workloads: LaneWorkload[],
  originalAssignments: Map<string, string>,
  overrides: { time: Record<string, number>; lane: Record<string, string> },
  constraints: OptimizationConstraints,
  recommendedTimes?: RecommendedCallTime[],
  workerConstraints?: WorkerConstraint[]
): OptimizationResultMetrics => {
  // Calculate travel reduction.
  // When geocoded coordinates are available on the entries, measure the real change in
  // estimated driving time (Haversine + detour factor) between the original and optimised
  // schedules. When no coordinates exist, fall back to the idle-gap proxy so the metric
  // still reflects tighter sequencing rather than collapsing to zero.
  const coordLookup = buildCoordLookup(workloads);
  let totalTravelReduction: number;
  if (coordLookup.size >= 2) {
    const originalTravel = calculateScheduledTravel(
      originalLanes.map((lane) => ({
        entries: lane.entries.map((e) => ({ id: e.id, startMinutes: e.startMinutes })),
      })),
      coordLookup
    );
    const optimizedTravel = calculateScheduledTravel(
      workloads.map((w) => ({
        entries: w.entries.map((e) => ({ id: e.id, startMinutes: overrides.time[e.id] ?? e.startMinutes })),
      })),
      coordLookup
    );
    totalTravelReduction = Math.max(0, originalTravel - optimizedTravel);
  } else {
    const originalTotalGaps = calculateTotalGaps(originalLanes);
    const optimizedTotalGaps = calculateTotalGapsFromWorkloads(workloads, overrides.time);
    totalTravelReduction = Math.max(0, originalTotalGaps - optimizedTotalGaps);
  }

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

  // Count constraint violations.
  // Per docs/Rostering.md §5.4–5.6 and §6 step 5, this must cover the no-overlap rule,
  // per-worker hour caps, and time-critical tolerance — not merely whether a call moved.
  const constraintViolations = countConstraintViolations(
    workloads,
    overrides,
    constraints,
    workerConstraints
  );

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
    breakViolations: countBreakViolations(workloads, overrides.time),
    travelFeasibilityViolations: countTravelFeasibilityViolations(workloads, overrides.time),
    avgWorkloadMinutes: workloadMinutes.length > 0
      ? Math.round(workloadMinutes.reduce((a, b) => a + b, 0) / workloadMinutes.length)
      : 0,
    overloadedWorkers: workloadMinutes.filter((m) => m > 8 * 60).length,
    underutilisedWorkers: workloadMinutes.filter((m) => m > 0 && m < 4 * 60).length,
  };
};

/**
 * Count workers who have a continuous stretch of ≥ 5 hours without a ≥ 20-minute break.
 * Each worker counts at most once even if they have multiple such stretches.
 */
const countBreakViolations = (
  workloads: LaneWorkload[],
  timeOverrides: Record<string, number>
): number => {
  let violations = 0;
  for (const workload of workloads) {
    const entries = [...workload.entries]
      .map((e) => ({
        start: timeOverrides[e.id] ?? e.startMinutes,
        end: (timeOverrides[e.id] ?? e.startMinutes) + e.durationMinutes,
      }))
      .sort((a, b) => a.start - b.start);

    if (entries.length === 0) continue;

    let stretchStart = entries[0].start;
    let stretchEnd = entries[0].end;
    let workerHasViolation = false;

    for (let i = 1; i < entries.length; i++) {
      const gap = entries[i].start - stretchEnd;
      if (gap >= 20) {
        // A real break — reset stretch
        stretchStart = entries[i].start;
        stretchEnd = entries[i].end;
      } else {
        // Extend stretch
        stretchEnd = Math.max(stretchEnd, entries[i].end);
        if (stretchEnd - stretchStart > 5 * 60) {
          workerHasViolation = true;
          break;
        }
      }
    }

    if (workerHasViolation) violations++;
  }
  return violations;
};

/**
 * Count consecutive call pairs where the gap between them is shorter than the minimum
 * travel buffer (5 minutes when no location data, Haversine estimate when available).
 */
const countTravelFeasibilityViolations = (
  workloads: LaneWorkload[],
  timeOverrides: Record<string, number>
): number => {
  let violations = 0;
  const MIN_BUFFER = 5;

  for (const workload of workloads) {
    const entries = [...workload.entries]
      .map((e) => ({
        start: timeOverrides[e.id] ?? e.startMinutes,
        end: (timeOverrides[e.id] ?? e.startMinutes) + e.durationMinutes,
        lat: e.lat,
        lon: e.lon,
      }))
      .sort((a, b) => a.start - b.start);

    for (let i = 1; i < entries.length; i++) {
      const prev = entries[i - 1];
      const curr = entries[i];
      const gap = Math.max(0, curr.start - prev.end);

      let requiredMinutes = MIN_BUFFER;
      if (prev.lat != null && prev.lon != null && curr.lat != null && curr.lon != null) {
        const distKm = haversineDistance(prev.lat, prev.lon, curr.lat, curr.lon);
        requiredMinutes = estimateTravelMinutes(distKm);
      }

      if (gap < requiredMinutes) violations++;
    }
  }

  return violations;
};

/**
 * Build a lookup of entry id -> geocoded coordinate from the working workloads.
 * Entries carry lat/lon when the caller supplied geocoded points.
 */
const buildCoordLookup = (
  workloads: LaneWorkload[]
): Map<string, { lat: number; lon: number }> => {
  const map = new Map<string, { lat: number; lon: number }>();
  for (const workload of workloads) {
    for (const entry of workload.entries) {
      if (entry.lat != null && entry.lon != null) {
        map.set(entry.id, { lat: entry.lat, lon: entry.lon });
      }
    }
  }
  return map;
};

/**
 * Estimate total driving minutes for a set of lanes. Within each lane, visits are ordered
 * by start time and consecutive geocoded pairs contribute Haversine-based travel estimates.
 * Pairs without coordinates contribute nothing.
 */
const calculateScheduledTravel = (
  lanes: Array<{ entries: Array<{ id: string; startMinutes: number }> }>,
  coordLookup: Map<string, { lat: number; lon: number }>
): number => {
  let total = 0;
  for (const lane of lanes) {
    const sorted = [...lane.entries].sort((a, b) => a.startMinutes - b.startMinutes);
    for (let i = 1; i < sorted.length; i += 1) {
      const from = coordLookup.get(sorted[i - 1].id);
      const to = coordLookup.get(sorted[i].id);
      if (!from || !to) continue;
      total += estimateTravelMinutes(haversineDistance(from.lat, from.lon, to.lat, to.lon));
    }
  }
  return total;
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
