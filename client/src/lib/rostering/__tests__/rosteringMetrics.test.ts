import { describe, it, expect } from "vitest";
import {
  countScheduleConflicts,
  computeTimelineStats,
  computeDataQuality,
  computeScheduleSnapshotMetrics,
  resolveServiceIdentity,
} from "../rosteringMetrics";
import type { GanttLane, TimelineEntry } from "../rosterModel";

const entry = (over: Partial<TimelineEntry> = {}): TimelineEntry => ({
  id: over.id ?? "e1",
  title: over.title ?? "Call",
  startMinutes: over.startMinutes ?? 540,
  durationMinutes: over.durationMinutes ?? 30,
  serviceUserName: over.serviceUserName,
  serviceUserKey: over.serviceUserKey,
  callTypeLabel: over.callTypeLabel,
  isTimeCritical: over.isTimeCritical,
  isDoubleUp: over.isDoubleUp,
  isTemplated: over.isTemplated,
  requiredStartMinutes: over.requiredStartMinutes,
  address: over.address,
  latitude: over.latitude,
  longitude: over.longitude,
});

const lane = (id: string, entries: TimelineEntry[]): GanttLane => ({
  id,
  label: id,
  entries,
});

describe("resolveServiceIdentity", () => {
  it("prefers key, then name, then title and lowercases", () => {
    expect(resolveServiceIdentity(entry({ serviceUserKey: "KEY", serviceUserName: "Name" }))).toBe("key");
    expect(resolveServiceIdentity(entry({ serviceUserName: "Jane Doe", serviceUserKey: undefined }))).toBe("jane doe");
    expect(resolveServiceIdentity(entry({ title: "AM Visit", serviceUserKey: undefined, serviceUserName: undefined }))).toBe("am visit");
  });

  it("returns null when nothing identifies the entry", () => {
    expect(resolveServiceIdentity(entry({ title: "  ", serviceUserKey: undefined, serviceUserName: undefined }))).toBeNull();
  });
});

describe("countScheduleConflicts", () => {
  it("counts overlapping consecutive calls per lane", () => {
    const lanes = [
      lane("w1", [
        entry({ id: "a", startMinutes: 540, durationMinutes: 60 }), // 09:00-10:00
        entry({ id: "b", startMinutes: 570, durationMinutes: 30 }), // 09:30 overlaps
      ]),
    ];
    expect(countScheduleConflicts(lanes)).toBe(1);
  });

  it("does not flag back-to-back non-overlapping calls", () => {
    const lanes = [
      lane("w1", [
        entry({ id: "a", startMinutes: 540, durationMinutes: 30 }), // 09:00-09:30
        entry({ id: "b", startMinutes: 570, durationMinutes: 30 }), // 09:30-10:00
      ]),
    ];
    expect(countScheduleConflicts(lanes)).toBe(0);
  });

  it("detects conflicts regardless of input order", () => {
    const lanes = [
      lane("w1", [
        entry({ id: "b", startMinutes: 570, durationMinutes: 30 }),
        entry({ id: "a", startMinutes: 540, durationMinutes: 60 }),
      ]),
    ];
    expect(countScheduleConflicts(lanes)).toBe(1);
  });

  it("returns 0 for empty or single-entry lanes", () => {
    expect(countScheduleConflicts([])).toBe(0);
    expect(countScheduleConflicts([lane("w1", [entry()])])).toBe(0);
  });
});

describe("computeTimelineStats", () => {
  it("aggregates unique service users, calls, hours and conflicts", () => {
    const lanes = [
      lane("w1", [
        entry({ id: "a", serviceUserKey: "su1", startMinutes: 540, durationMinutes: 60 }),
        entry({ id: "b", serviceUserKey: "su1", startMinutes: 570, durationMinutes: 30 }), // overlap, same user
      ]),
      lane("w2", [
        entry({ id: "c", serviceUserKey: "su2", startMinutes: 600, durationMinutes: 30 }),
      ]),
    ];
    const stats = computeTimelineStats(lanes);
    expect(stats.totalServiceUsersCount).toBe(2);
    expect(stats.totalCallsCount).toBe(3);
    expect(stats.totalHoursCount).toBe(2); // 120 minutes => 2.0h
    expect(stats.conflictsCount).toBe(1);
  });

  it("rounds hours to one decimal", () => {
    const lanes = [lane("w1", [entry({ durationMinutes: 25 })])];
    expect(computeTimelineStats(lanes).totalHoursCount).toBe(0.4);
  });
});

describe("computeDataQuality", () => {
  it("counts each category and excludes coordinates from totalIssues", () => {
    const lanes = [
      lane("w1", [
        entry({ id: "ok", serviceUserKey: "su1", requiredStartMinutes: 540, durationMinutes: 30, latitude: 1, longitude: 2 }),
        entry({ id: "noid", serviceUserKey: undefined, serviceUserName: undefined, title: "  ", requiredStartMinutes: 540, durationMinutes: 30, latitude: 1, longitude: 2 }),
        entry({ id: "nostart", serviceUserKey: "su2", requiredStartMinutes: null, durationMinutes: 30, latitude: 1, longitude: 2 }),
        entry({ id: "baddur", serviceUserKey: "su3", requiredStartMinutes: 540, durationMinutes: 0, latitude: 1, longitude: 2 }),
        entry({ id: "nocoord", serviceUserKey: "su4", requiredStartMinutes: 540, durationMinutes: 30, latitude: null, longitude: null }),
      ]),
    ];
    const q = computeDataQuality(lanes);
    expect(q.missingServiceIdentity).toBe(1);
    expect(q.missingRequiredStart).toBe(1);
    expect(q.invalidDuration).toBe(1);
    expect(q.missingCoordinates).toBe(1);
    expect(q.totalIssues).toBe(3);
  });

  it("flags durations beyond 24h as invalid", () => {
    const lanes = [lane("w1", [entry({ durationMinutes: 24 * 60 + 1 })])];
    expect(computeDataQuality(lanes).invalidDuration).toBe(1);
  });
});

describe("computeScheduleSnapshotMetrics", () => {
  it("reports conflicts and travel gaps", () => {
    const lanes = [
      lane("w1", [
        // Two far-apart calls with no time to travel between them.
        entry({ id: "a", startMinutes: 540, durationMinutes: 30, latitude: 51.5, longitude: -0.1 }),
        entry({ id: "b", startMinutes: 571, durationMinutes: 30, latitude: 52.5, longitude: -1.9 }),
      ]),
    ];
    const metrics = computeScheduleSnapshotMetrics(lanes);
    expect(metrics.conflicts).toBe(0);
    expect(metrics.travelGaps).toBeGreaterThan(0);
  });
});
