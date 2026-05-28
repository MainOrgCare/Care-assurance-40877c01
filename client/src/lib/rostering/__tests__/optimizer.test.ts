import { describe, expect, it } from "vitest";
import { runFullOptimization, optimizeForContinuity, countConstraintViolations } from "../optimizer";
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

describe("rostering optimizer constraint violations", () => {
  it("does not report violations for a clean, non-overlapping schedule", () => {
    const result = runFullOptimization(buildLanes(), weights, constraints);
    expect(result.metrics.constraintViolations).toBe(0);
  });

  it("counts per-worker daily hour-cap breaches", () => {
    const lanes: GanttLane[] = [
      {
        id: "worker-a",
        label: "A.Smith",
        entries: [
          { id: "c1", title: "Morning", startMinutes: 8 * 60, durationMinutes: 60, serviceUserName: "U1", callTypeLabel: "Morning" },
          { id: "c2", title: "Lunch", startMinutes: 12 * 60, durationMinutes: 60, serviceUserName: "U2", callTypeLabel: "Lunch" },
          { id: "c3", title: "Tea", startMinutes: 15 * 60, durationMinutes: 60, serviceUserName: "U3", callTypeLabel: "Tea" },
        ],
      },
    ];

    // Cap the worker at 2 calls/day — the 3-call schedule must register a violation.
    const result = runFullOptimization(lanes, weights, constraints, undefined, {
      workerConstraints: [{ workerKey: "worker-a", maxCallsPerDay: 2 }],
    });

    expect(result.metrics.constraintViolations).toBeGreaterThanOrEqual(1);
  });

  it("counts time-critical calls pushed beyond their tolerance window", () => {
    const workloads = [
      {
        laneId: "worker-a",
        label: "A.Smith",
        totalMinutes: 30,
        entries: [
          {
            id: "tc1",
            title: "Critical med",
            startMinutes: 8 * 60,
            durationMinutes: 30,
            serviceUserName: "U1",
            callTypeLabel: "Morning",
            isTimeCritical: true,
            originalLaneId: "worker-a",
            serviceUserKey: "u1",
            isTemplated: false,
          },
        ],
      },
    ];

    // Move the time-critical call 60 minutes — well beyond the ±15 default tolerance.
    const overrides = { time: { tc1: 9 * 60 }, lane: {} };
    const violations = countConstraintViolations(workloads, overrides, constraints);
    expect(violations).toBe(1);

    // A move inside tolerance is not a violation.
    const within = countConstraintViolations(workloads, { time: { tc1: 8 * 60 + 10 }, lane: {} }, constraints);
    expect(within).toBe(0);
  });
});

describe("rostering optimizer travel reduction", () => {
  it("reports a non-negative travel reduction when coordinates are supplied", () => {
    // Two visits on one worker, deliberately ordered far-apart-first so nearest-neighbour
    // sequencing within the travel pass can reduce estimated driving time.
    const lanes: GanttLane[] = [
      {
        id: "worker-a",
        label: "A.Smith",
        entries: [
          { id: "g1", title: "Morning A", startMinutes: 8 * 60, durationMinutes: 30, serviceUserName: "Near", callTypeLabel: "Morning" },
          { id: "g2", title: "Morning B", startMinutes: 9 * 60, durationMinutes: 30, serviceUserName: "Far", callTypeLabel: "Morning" },
          { id: "g3", title: "Morning C", startMinutes: 10 * 60, durationMinutes: 30, serviceUserName: "Mid", callTypeLabel: "Morning" },
        ],
      },
    ];

    const geocoded = new Map<string, { lat: number; lon: number }>([
      ["g1", { lat: 51.5074, lon: -0.1278 }],
      ["g2", { lat: 51.6, lon: -0.05 }],
      ["g3", { lat: 51.52, lon: -0.12 }],
    ]);

    const result = runFullOptimization(lanes, weights, constraints, geocoded);
    expect(result.metrics.totalTravelReduction).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(result.metrics.totalTravelReduction)).toBe(true);
  });

  it("falls back to the idle-gap proxy when no coordinates are supplied", () => {
    const result = runFullOptimization(buildLanes(), weights, constraints);
    expect(result.metrics.totalTravelReduction).toBeGreaterThanOrEqual(0);
  });
});


