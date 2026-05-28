/**
 * rosteringMetrics.ts — Pure, testable schedule metric helpers.
 *
 * These functions were previously computed inline inside the large
 * RosteringStudioUnified component. They are extracted here so the metric
 * logic can be unit-tested and reused without duplication.
 */

import type { GanttLane, TimelineEntry } from "./rosterModel";
import { detectTravelFeasibilityViolations } from "./travelUtils";

const MAX_REASONABLE_DURATION_MINUTES = 24 * 60;

/** Sort a lane's entries chronologically without mutating the source array. */
const sortedByStart = (entries: TimelineEntry[]): TimelineEntry[] =>
  [...entries].sort((a, b) => a.startMinutes - b.startMinutes);

/** Resolve a stable service-user identity for de-duplication / quality checks. */
export const resolveServiceIdentity = (entry: TimelineEntry): string | null => {
  const identity =
    entry.serviceUserKey?.trim() ||
    entry.serviceUserName?.trim() ||
    entry.title?.trim() ||
    "";
  return identity ? identity.toLowerCase() : null;
};

/**
 * Count overlapping calls within each worker lane. Two consecutive calls
 * overlap when the previous call's end time runs past the next call's start.
 */
export const countScheduleConflicts = (lanes: GanttLane[]): number => {
  let conflicts = 0;
  for (const lane of lanes) {
    const sorted = sortedByStart(lane.entries);
    for (let i = 0; i < sorted.length - 1; i += 1) {
      const current = sorted[i];
      const next = sorted[i + 1];
      if (current.startMinutes + current.durationMinutes > next.startMinutes) {
        conflicts += 1;
      }
    }
  }
  return conflicts;
};

export interface TimelineStats {
  totalServiceUsersCount: number;
  totalCallsCount: number;
  totalHoursCount: number;
  conflictsCount: number;
}

/** Aggregate headline timeline statistics across all worker lanes. */
export const computeTimelineStats = (lanes: GanttLane[]): TimelineStats => {
  const identities = new Set<string>();
  let totalCalls = 0;
  let totalMinutes = 0;

  for (const lane of lanes) {
    totalCalls += lane.entries.length;
    for (const entry of lane.entries) {
      const identity = resolveServiceIdentity(entry);
      if (identity) {
        identities.add(identity);
      }
      totalMinutes += entry.durationMinutes;
    }
  }

  return {
    totalServiceUsersCount: identities.size,
    totalCallsCount: totalCalls,
    totalHoursCount: Math.round((totalMinutes / 60) * 10) / 10,
    conflictsCount: countScheduleConflicts(lanes),
  };
};

export interface DataQuality {
  missingServiceIdentity: number;
  missingRequiredStart: number;
  invalidDuration: number;
  missingCoordinates: number;
  /** Hard data errors that block reliable scheduling (excludes geocode gaps). */
  totalIssues: number;
}

/** Inspect every entry for data-quality problems that affect scheduling. */
export const computeDataQuality = (lanes: GanttLane[]): DataQuality => {
  let missingServiceIdentity = 0;
  let missingRequiredStart = 0;
  let invalidDuration = 0;
  let missingCoordinates = 0;

  for (const lane of lanes) {
    for (const entry of lane.entries) {
      if (!resolveServiceIdentity(entry)) {
        missingServiceIdentity += 1;
      }
      if (entry.requiredStartMinutes == null) {
        missingRequiredStart += 1;
      }
      if (
        !Number.isFinite(entry.durationMinutes) ||
        entry.durationMinutes <= 0 ||
        entry.durationMinutes > MAX_REASONABLE_DURATION_MINUTES
      ) {
        invalidDuration += 1;
      }
      if (entry.latitude == null || entry.longitude == null) {
        missingCoordinates += 1;
      }
    }
  }

  return {
    missingServiceIdentity,
    missingRequiredStart,
    invalidDuration,
    missingCoordinates,
    totalIssues: missingServiceIdentity + missingRequiredStart + invalidDuration,
  };
};

export interface ScheduleSnapshotMetrics {
  conflicts: number;
  travelGaps: number;
}

/**
 * Compute the headline metrics captured in a schedule snapshot. Travel gaps
 * reflect consecutive calls a worker cannot physically reach in time (the gap
 * between them is shorter than the estimated travel time).
 */
export const computeScheduleSnapshotMetrics = (
  lanes: GanttLane[]
): ScheduleSnapshotMetrics => ({
  conflicts: countScheduleConflicts(lanes),
  travelGaps: detectTravelFeasibilityViolations(lanes).length,
});
