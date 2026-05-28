import { describe, it, expect } from "vitest";
import {
  haversineDistance,
  estimateTravelMinutes,
  parsePostcodeOutcode,
  categorizeTravelTime,
  getTravelCategoryColor,
  getTravelCategoryLabel,
  calculateTravelSegments,
  orderByNearestNeighbor,
  calculateOptimizationMetrics,
  detectTravelFeasibilityViolations,
  computeWorkerFatigue,
  computeAllWorkerFatigue,
} from "../travelUtils";

describe("haversineDistance", () => {
  it("returns 0 for identical points", () => {
    expect(haversineDistance(51.5, -0.12, 51.5, -0.12)).toBe(0);
  });

  it("approximates a known distance (London → Birmingham ~163km)", () => {
    const d = haversineDistance(51.5074, -0.1278, 52.4862, -1.8904);
    expect(d).toBeGreaterThan(150);
    expect(d).toBeLessThan(180);
  });
});

describe("estimateTravelMinutes", () => {
  it("applies detour factor and speed", () => {
    // 30km crow-flies * 1.4 detour = 42km at 30km/h = 1.4h = 84min
    expect(estimateTravelMinutes(30)).toBe(84);
  });

  it("ceils to whole minutes", () => {
    expect(estimateTravelMinutes(1)).toBe(Math.ceil((1 * 1.4) / 30 * 60));
  });

  it("respects custom speed", () => {
    expect(estimateTravelMinutes(30, 60)).toBe(42);
  });
});

describe("parsePostcodeOutcode", () => {
  it("extracts outcode from full postcode", () => {
    expect(parsePostcodeOutcode("SW1A 2AA")).toBe("SW1A");
    expect(parsePostcodeOutcode("m1 1ae")).toBe("M1");
  });

  it("accepts outcode-only input", () => {
    expect(parsePostcodeOutcode("EC1")).toBe("EC1");
  });

  it("returns null for invalid / empty input", () => {
    expect(parsePostcodeOutcode("")).toBeNull();
    expect(parsePostcodeOutcode(null)).toBeNull();
    expect(parsePostcodeOutcode("not a postcode")).toBeNull();
  });
});

describe("categorizeTravelTime", () => {
  it("buckets minutes into categories", () => {
    expect(categorizeTravelTime(5)).toBe("short");
    expect(categorizeTravelTime(10)).toBe("short");
    expect(categorizeTravelTime(15)).toBe("medium");
    expect(categorizeTravelTime(25)).toBe("long");
    expect(categorizeTravelTime(45)).toBe("very-long");
  });

  it("has a color and label for every category", () => {
    for (const cat of ["short", "medium", "long", "very-long"] as const) {
      expect(getTravelCategoryColor(cat)).toMatch(/^#/);
      expect(getTravelCategoryLabel(cat).length).toBeGreaterThan(0);
    }
  });
});

describe("calculateTravelSegments", () => {
  it("computes gaps and travel between time-ordered visits", () => {
    const segments = calculateTravelSegments([
      { id: "a", startMinutes: 540, durationMinutes: 30, lat: 51.5, lon: -0.12 },
      { id: "b", startMinutes: 600, durationMinutes: 30, lat: 51.51, lon: -0.13 },
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0].fromId).toBe("a");
    expect(segments[0].toId).toBe("b");
    expect(segments[0].gapMinutes).toBe(30); // 600 - (540+30)
    expect(segments[0].distanceKm).toBeGreaterThan(0);
  });

  it("uses zero distance when locations are missing", () => {
    const segments = calculateTravelSegments([
      { id: "a", startMinutes: 540, durationMinutes: 30 },
      { id: "b", startMinutes: 600, durationMinutes: 30 },
    ]);
    expect(segments[0].distanceKm).toBe(0);
    expect(segments[0].travelMinutes).toBe(0);
  });
});

describe("orderByNearestNeighbor", () => {
  it("returns single/empty input unchanged", () => {
    expect(orderByNearestNeighbor([])).toEqual([]);
    expect(orderByNearestNeighbor([{ id: "a", startMinutes: 0, durationMinutes: 30 }])).toEqual(["a"]);
  });

  it("orders by nearest neighbor starting from the earliest visit", () => {
    const order = orderByNearestNeighbor([
      { id: "start", startMinutes: 540, durationMinutes: 30, lat: 51.5, lon: -0.12 },
      { id: "far", startMinutes: 560, durationMinutes: 30, lat: 53.0, lon: -2.0 },
      { id: "near", startMinutes: 580, durationMinutes: 30, lat: 51.51, lon: -0.13 },
    ]);
    expect(order[0]).toBe("start");
    expect(order[1]).toBe("near");
    expect(order[2]).toBe("far");
  });
});

describe("calculateOptimizationMetrics", () => {
  it("grades an efficient schedule highly", () => {
    const metrics = calculateOptimizationMetrics(
      [
        { fromId: "a", toId: "b", distanceKm: 1, travelMinutes: 5, category: "short", gapMinutes: 5 },
      ],
      0
    );
    expect(metrics.grade).toBe("A");
    expect(metrics.efficiency).toBeGreaterThanOrEqual(90);
    expect(metrics.visitCount).toBe(2);
  });

  it("penalizes conflicts heavily", () => {
    const metrics = calculateOptimizationMetrics(
      [{ fromId: "a", toId: "b", distanceKm: 1, travelMinutes: 5, category: "short", gapMinutes: 5 }],
      5
    );
    expect(metrics.efficiency).toBeLessThan(40);
    expect(metrics.grade).toBe("F");
  });
});

describe("detectTravelFeasibilityViolations", () => {
  it("flags consecutive calls a worker cannot reach in time", () => {
    const violations = detectTravelFeasibilityViolations([
      {
        id: "w1",
        label: "L.Barron",
        entries: [
          { id: "a", title: "AM", startMinutes: 540, durationMinutes: 30, latitude: 51.5, longitude: -0.12 },
          { id: "b", title: "Late AM", startMinutes: 575, durationMinutes: 30, latitude: 52.5, longitude: -1.9 },
        ],
      },
    ]);
    expect(violations).toHaveLength(1);
    expect(violations[0].shortfallMinutes).toBeGreaterThan(0);
    expect(violations[0].fromEntryId).toBe("a");
    expect(violations[0].toEntryId).toBe("b");
  });

  it("uses the minimum buffer when coordinates are missing", () => {
    const violations = detectTravelFeasibilityViolations(
      [
        {
          id: "w1",
          label: "L.Barron",
          entries: [
            { id: "a", title: "AM", startMinutes: 540, durationMinutes: 30 },
            { id: "b", title: "AM2", startMinutes: 572, durationMinutes: 30 }, // 2-min gap < 5-min buffer
          ],
        },
      ],
      5
    );
    expect(violations).toHaveLength(1);
  });

  it("ignores lanes with fewer than two entries", () => {
    expect(
      detectTravelFeasibilityViolations([
        { id: "w1", label: "x", entries: [{ id: "a", title: "AM", startMinutes: 540, durationMinutes: 30 }] },
      ])
    ).toHaveLength(0);
  });
});

describe("computeWorkerFatigue", () => {
  it("returns low/zero for an empty lane", () => {
    const r = computeWorkerFatigue({ id: "w1", label: "x", entries: [] });
    expect(r.score).toBe(0);
    expect(r.level).toBe("low");
    expect(r.totalCalls).toBe(0);
  });

  it("scores back-to-back calls as moderate-to-high fatigue", () => {
    const entries = Array.from({ length: 5 }).map((_, i) => ({
      id: `e${i}`,
      title: "Call",
      startMinutes: 540 + i * 30,
      durationMinutes: 30,
    }));
    const r = computeWorkerFatigue({ id: "w1", label: "L.Barron", entries });
    expect(r.backToBackCount).toBe(4);
    expect(r.score).toBeGreaterThan(0);
    expect(["moderate", "high"]).toContain(r.level);
  });

  it("flags break violations for a long unbroken stretch", () => {
    // 6 contiguous hours of calls with no 20-min break.
    const entries = Array.from({ length: 12 }).map((_, i) => ({
      id: `e${i}`,
      title: "Call",
      startMinutes: 540 + i * 30,
      durationMinutes: 30,
    }));
    const r = computeWorkerFatigue({ id: "w1", label: "L.Barron", entries });
    expect(r.breakViolations).toBeGreaterThanOrEqual(1);
    expect(r.longestStretchMinutes).toBeGreaterThan(5 * 60);
  });

  it("computeAllWorkerFatigue maps every lane", () => {
    const results = computeAllWorkerFatigue([
      { id: "w1", label: "a", entries: [] },
      { id: "w2", label: "b", entries: [] },
    ]);
    expect(results).toHaveLength(2);
  });
});
