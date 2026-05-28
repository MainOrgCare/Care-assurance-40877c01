import { describe, expect, it } from "vitest";
import { detectConflicts, generateAutoResolutions } from "../ConflictAlert";
import type { GanttLane } from "@/lib/rostering/rosterModel";

describe("rostering conflict detection", () => {
  it("flags overlapping visits as an overlap conflict", () => {
    const lanes: GanttLane[] = [
      {
        id: "w1",
        label: "A.Smith",
        entries: [
          { id: "v1", title: "Morning A", startMinutes: 8 * 60, durationMinutes: 60 },
          { id: "v2", title: "Morning B", startMinutes: 8 * 60 + 30, durationMinutes: 30 },
        ],
      },
    ];

    const conflicts = detectConflicts(lanes);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe("overlap");
    expect(conflicts[0].suggestedMove?.entryId).toBe("v2");
  });

  it("flags a travel-gap violation when the gap is shorter than estimated travel time", () => {
    // London (~51.51,-0.13) to ~12km away, with only a 5-minute gap between visits.
    const lanes: GanttLane[] = [
      {
        id: "w1",
        label: "A.Smith",
        entries: [
          { id: "v1", title: "Near", startMinutes: 8 * 60, durationMinutes: 30, latitude: 51.5074, longitude: -0.1278 },
          { id: "v2", title: "Far", startMinutes: 8 * 60 + 35, durationMinutes: 30, latitude: 51.61, longitude: -0.05 },
        ],
      },
    ];

    const conflicts = detectConflicts(lanes);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe("travel");
    // The suggested move pushes the next visit out far enough to cover the travel time.
    expect(conflicts[0].suggestedMove?.newStartMinutes).toBeGreaterThan(8 * 60 + 35);
  });

  it("does not flag a travel conflict when the gap comfortably covers the travel", () => {
    const lanes: GanttLane[] = [
      {
        id: "w1",
        label: "A.Smith",
        entries: [
          { id: "v1", title: "Near", startMinutes: 8 * 60, durationMinutes: 30, latitude: 51.5074, longitude: -0.1278 },
          { id: "v2", title: "Far", startMinutes: 11 * 60, durationMinutes: 30, latitude: 51.61, longitude: -0.05 },
        ],
      },
    ];

    expect(detectConflicts(lanes)).toHaveLength(0);
  });

  it("ignores travel checks when coordinates are missing", () => {
    const lanes: GanttLane[] = [
      {
        id: "w1",
        label: "A.Smith",
        entries: [
          { id: "v1", title: "A", startMinutes: 8 * 60, durationMinutes: 30 },
          { id: "v2", title: "B", startMinutes: 8 * 60 + 31, durationMinutes: 30 },
        ],
      },
    ];

    expect(detectConflicts(lanes)).toHaveLength(0);
  });

  it("flags unpaired double-up calls", () => {
    const lanes: GanttLane[] = [
      {
        id: "w1",
        label: "A.Smith",
        entries: [
          {
            id: "du-1",
            title: "Personal Care",
            serviceUserKey: "su-1",
            callTypeLabel: "Morning",
            isDoubleUp: true,
            startMinutes: 8 * 60,
            requiredStartMinutes: 8 * 60,
            durationMinutes: 30,
          },
        ],
      },
    ];

    const conflicts = detectConflicts(lanes);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe("double-up");
    expect(conflicts[0].entry1Id).toBe("du-1");
  });

  it("flags out-of-sync double-up timings across workers", () => {
    const lanes: GanttLane[] = [
      {
        id: "w1",
        label: "A.Smith",
        entries: [
          {
            id: "du-1",
            title: "Personal Care",
            serviceUserKey: "su-1",
            callTypeLabel: "Morning",
            isDoubleUp: true,
            startMinutes: 8 * 60,
            requiredStartMinutes: 8 * 60,
            durationMinutes: 30,
          },
        ],
      },
      {
        id: "w2",
        label: "B.Jones",
        entries: [
          {
            id: "du-2",
            title: "Personal Care",
            serviceUserKey: "su-1",
            callTypeLabel: "Morning",
            isDoubleUp: true,
            startMinutes: 8 * 60 + 20,
            requiredStartMinutes: 8 * 60,
            durationMinutes: 30,
          },
        ],
      },
    ];

    const conflicts = detectConflicts(lanes);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe("double-up");
    expect(conflicts[0].entry1Id).toBe("du-1");
    expect(conflicts[0].entry2Id).toBe("du-2");
    expect(conflicts[0].suggestedMove?.entryId).toBe("du-2");
    expect(conflicts[0].suggestedMove?.newStartMinutes).toBe(8 * 60);
  });

  it("does not flag double-up when both workers are aligned", () => {
    const lanes: GanttLane[] = [
      {
        id: "w1",
        label: "A.Smith",
        entries: [
          {
            id: "du-1",
            title: "Personal Care",
            serviceUserKey: "su-1",
            callTypeLabel: "Morning",
            isDoubleUp: true,
            startMinutes: 8 * 60,
            requiredStartMinutes: 8 * 60,
            durationMinutes: 30,
          },
        ],
      },
      {
        id: "w2",
        label: "B.Jones",
        entries: [
          {
            id: "du-2",
            title: "Personal Care",
            serviceUserKey: "su-1",
            callTypeLabel: "Morning",
            isDoubleUp: true,
            startMinutes: 8 * 60,
            requiredStartMinutes: 8 * 60,
            durationMinutes: 30,
          },
        ],
      },
    ];

    expect(detectConflicts(lanes)).toHaveLength(0);
  });
});

describe("rostering auto-resolutions", () => {
  it("uses estimated travel time as the buffer between geocoded visits", () => {
    // Overlap forces v2 to move; without travel awareness the gap would be a flat 5 min.
    // With ~12km between visits the buffer must be > 5 min so the travel conflict isn't left behind.
    const lanes: GanttLane[] = [
      {
        id: "w1",
        label: "A.Smith",
        entries: [
          { id: "v1", title: "A", startMinutes: 8 * 60, durationMinutes: 60, latitude: 51.5074, longitude: -0.1278 },
          { id: "v2", title: "B", startMinutes: 8 * 60 + 30, durationMinutes: 30, latitude: 51.61, longitude: -0.05 },
        ],
      },
    ];

    const moves = generateAutoResolutions(lanes);
    const newStart = moves["v2"];
    expect(newStart).toBeDefined();
    // v1 ends at 9:00 (540). Travel ~12km @ 30km/h * 1.4 detour ≈ 33 min, so v2 must start >= 9:33.
    expect(newStart!).toBeGreaterThan(9 * 60 + 5);

    // After applying the move, the schedule must have no remaining conflicts.
    const resolvedLanes: GanttLane[] = [
      {
        ...lanes[0],
        entries: lanes[0].entries.map((e) =>
          moves[e.id] != null ? { ...e, startMinutes: moves[e.id] } : e
        ),
      },
    ];
    expect(detectConflicts(resolvedLanes)).toHaveLength(0);
  });

  it("falls back to a 5-minute buffer when coordinates are missing", () => {
    const lanes: GanttLane[] = [
      {
        id: "w1",
        label: "A.Smith",
        entries: [
          { id: "v1", title: "A", startMinutes: 8 * 60, durationMinutes: 60 },
          { id: "v2", title: "B", startMinutes: 8 * 60 + 30, durationMinutes: 30 },
        ],
      },
    ];

    const moves = generateAutoResolutions(lanes);
    // v1 ends at 540; cursor = 545. v2 was at 510, < 545, so it moves to 545.
    expect(moves["v2"]).toBe(9 * 60 + 5);
  });

  it("does not move time-critical visits", () => {
    const lanes: GanttLane[] = [
      {
        id: "w1",
        label: "A.Smith",
        entries: [
          { id: "v1", title: "A", startMinutes: 8 * 60, durationMinutes: 60 },
          { id: "v2", title: "B", startMinutes: 8 * 60 + 30, durationMinutes: 30, isTimeCritical: true },
        ],
      },
    ];

    const moves = generateAutoResolutions(lanes);
    expect(moves["v2"]).toBeUndefined();
  });
});
