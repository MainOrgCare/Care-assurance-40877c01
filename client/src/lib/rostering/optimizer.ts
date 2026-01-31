/**
 * Smart Optimization Engine for Rostering Studio
 * 
 * Provides multi-objective optimization for care worker schedules,
 * balancing travel time, workload distribution, and care continuity.
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
}

interface EntryWithLocation extends TimelineEntry {
  lat?: number | null;
  lon?: number | null;
  originalLaneId: string;
  serviceUserKey?: string | null;
}

interface LaneWorkload {
  laneId: string;
  label: string;
  totalMinutes: number;
  entries: EntryWithLocation[];
}

// ============================================================================
// Constants
// ============================================================================

const ROSTER_DAY_START_MINUTES = 6 * 60;  // 6:00 AM
const ROSTER_DAY_HARD_END_MINUTES = 23 * 60;  // 11:00 PM

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
  geocodedPoints?: Map<string, { lat: number; lon: number }>
): OptimizationResult => {
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

  // Phase 1: Travel optimization (if weight > 0)
  if (normalizedWeights.travel > 0) {
    const travelResult = optimizeForTravel(workloads, constraints);
    mergeOverrides(resultOverrides, travelResult);
    applyOverridesToWorkloads(workloads, travelResult);
  }

  // Phase 2: Workload balancing (if weight > 0 and cross-worker moves allowed)
  if (normalizedWeights.balance > 0 && constraints.allowCrossWorkerMoves) {
    const balanceResult = optimizeForBalance(workloads, constraints, normalizedWeights.balance);
    mergeOverrides(resultOverrides, balanceResult);
    applyOverridesToWorkloads(workloads, balanceResult);
  }

  // Phase 3: Continuity optimization (if weight > 0)
  if (normalizedWeights.continuity > 0) {
    const continuityResult = optimizeForContinuity(
      workloads,
      originalAssignments,
      constraints,
      normalizedWeights.continuity
    );
    mergeOverrides(resultOverrides, continuityResult);
  }

  // Phase 4: Final packing pass
  const packingResult = packAllLanes(workloads, constraints.minBufferMinutes, constraints.respectTimeCritical);
  mergeOverrides(resultOverrides, packingResult);

  // Calculate result metrics
  const metrics = calculateResultMetrics(
    lanes,
    workloads,
    originalAssignments,
    resultOverrides,
    constraints
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
    let cursor = allEntriesSorted[0]?.startMinutes ?? ROSTER_DAY_START_MINUTES;

    // Build a combined schedule
    const flexibleOrdered = orderedIds
      .map((id) => flexible.find((e) => e.id === id))
      .filter((e): e is EntryWithLocation => e !== undefined);

    let flexIdx = 0;
    for (const original of allEntriesSorted) {
      if (timeCritical.some((tc) => tc.id === original.id)) {
        // Time-critical: keep original time
        timeOverrides[original.id] = original.startMinutes;
        cursor = Math.max(cursor, original.startMinutes + original.durationMinutes + 5);
      } else if (flexIdx < flexibleOrdered.length) {
        const entry = flexibleOrdered[flexIdx];
        const newStart = Math.max(cursor, ROSTER_DAY_START_MINUTES);
        timeOverrides[entry.id] = newStart;
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
  balanceWeight: number
): { time: Record<string, number>; lane: Record<string, string> } => {
  const laneOverrides: Record<string, string> = {};
  const timeOverrides: Record<string, number> = {};

  if (workloads.length < 2) return { time: timeOverrides, lane: laneOverrides };

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
      .sort((a, b) => b.durationMinutes - a.durationMinutes)[0];

    if (!moveable) break;

    // Move entry
    overloaded.entries = overloaded.entries.filter((e) => e.id !== moveable.id);
    overloaded.totalMinutes -= moveable.durationMinutes;
    underloaded.entries.push(moveable);
    underloaded.totalMinutes += moveable.durationMinutes;
    
    laneOverrides[moveable.id] = underloaded.laneId;
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
  respectTimeCritical: boolean
): { time: Record<string, number>; lane: Record<string, string> } => {
  const timeOverrides: Record<string, number> = {};

  for (const workload of workloads) {
    const sorted = [...workload.entries].sort((a, b) => a.startMinutes - b.startMinutes);
    let cursor = ROSTER_DAY_START_MINUTES;

    for (const entry of sorted) {
      if (entry.isTimeCritical && respectTimeCritical) {
        // Keep time-critical at original time
        timeOverrides[entry.id] = entry.startMinutes;
        cursor = Math.max(cursor, entry.startMinutes + entry.durationMinutes + bufferMinutes);
      } else {
        const newStart = Math.max(cursor, ROSTER_DAY_START_MINUTES);
        const clampedStart = Math.min(newStart, ROSTER_DAY_HARD_END_MINUTES - entry.durationMinutes);
        timeOverrides[entry.id] = Math.max(clampedStart, ROSTER_DAY_START_MINUTES);
        cursor = timeOverrides[entry.id] + entry.durationMinutes + bufferMinutes;
      }
    }
  }

  return { time: timeOverrides, lane: {} };
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
  constraints: OptimizationConstraints
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

  return {
    totalTravelReduction,
    workloadVariance,
    continuityScore,
    constraintViolations,
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
