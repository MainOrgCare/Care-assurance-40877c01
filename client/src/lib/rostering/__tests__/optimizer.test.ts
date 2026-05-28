import { describe, expect, it } from "vitest";
import { runFullOptimization, optimizeForContinuity } from "../optimizer";
import type { GanttLane } from "../rosterModel";
import type {
  OptimizationConstraints,
  OptimizationWeights,
} from "@/components/rostering/OptimizationSettings";

const weights: OptimizationWeights = { travel: 50, balance: 30, continuity: 20 };

const constraints: OptimizationConstraints = {
  respectTimeCritical: true,
  keepDoubleUpsTogether: true,
  allowCrossWorkerMoves: true,
  maxTravelMinutes: 30,
  minBufferMinutes: 5,
  lockTemplatedCalls: false,
  timeCriticalToleranceMinutes: 15,
  workingHoursStart: 6 * 60,
  workingHoursEnd: 22 * 60,
};

const buildLanes = (): GanttLane[] => [
  {
    id: "worker-a",
    label: "A.Smith",
    entries: [
      { id: "v1", title: "Morning - Mrs Jones", startMinutes: 8 * 60, durationMinutes: 45, serviceUserName: "Mrs Jones", callTypeLabel: "Morning" },
      { id: "v2", title: "Lunch - Mr Patel", startMinutes: 12 * 60 + 30, durationMinutes: 30, serviceUserName: "Mr Patel", callTypeLabel: "Lunch" },
      { id: "v3", title: "Tea - Mrs Owen", startMinutes: 15 * 60, durationMinutes: 30, serviceUserName: "Mrs Owen", callTypeLabel: "Tea" },
    ],
  },
  {
    id: "worker-b",
    label: "B.Khan",
    entries: [
      { id: "v4", title: "Morning - Mr Patel", startMinutes: 9 * 60, durationMinutes: 30, serviceUserName: "Mr Patel", callTypeLabel: "Morning" },
      { id: "v5", title: "Bed - Mrs Jones", startMinutes: 19 * 60, durationMinutes: 30, serviceUserName: "Mrs Jones", callTypeLabel: "Bed" },
    ],
  },
];

describe("rostering optimizer determinism", () => {
  it("produces identical output across repeated runs with the same inputs", () => {
    const first = runFullOptimization(buildLanes(), weights, constraints);
    const second = runFullOptimization(buildLanes(), weights, constraints);
    const third = runFullOptimization(buildLanes(), weights, constraints);

    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });

  it("continuity pass is deterministic and proportional to the continuity weight", () => {
    // worker-a holds Mr Patel (v2) and Mrs Owen (v3); worker-b holds Mr Patel (v4) and Mrs Jones (v5).
    // Preferred (first-seen) lane for Mr Patel is worker-a, for Mrs Jones is worker-a.
    const workloads = buildLanes().map((lane) => ({
      laneId: lane.id,
      label: lane.label,
      totalMinutes: lane.entries.reduce((sum, e) => sum + e.durationMinutes, 0),
      entries: lane.entries.map((entry) => ({
        ...entry,
        originalLaneId: lane.id,
        serviceUserKey: entry.serviceUserName?.toLowerCase().replace(/\s+/g, "_") ?? null,
        isTemplated: false,
      })),
    }));

    const original = new Map<string, string>();
    for (const lane of buildLanes()) {
      for (const entry of lane.entries) {
        const key = entry.serviceUserName?.toLowerCase().replace(/\s+/g, "_");
        if (key && !original.has(key)) original.set(key, lane.id);
      }
    }

    // Weight 0 restores nothing.
    const none = optimizeForContinuity(structuredClone(workloads), original, constraints, 0);
    expect(Object.keys(none.lane)).toHaveLength(0);

    // Weight 1 restores all eligible candidates and is stable across runs.
    const allA = optimizeForContinuity(structuredClone(workloads), original, constraints, 1);
    const allB = optimizeForContinuity(structuredClone(workloads), original, constraints, 1);
    expect(allA).toEqual(allB);
    expect(Object.keys(allA.lane).length).toBeGreaterThan(0);
  });
});
