import { describe, it, expect } from "vitest";
import {
  buildWorkerTimelineEntries,
  buildWorkerSummaries,
  buildWorkerLane,
  buildAllWorkerLanes,
} from "../rosterModel";

const group = (over: Record<string, unknown> = {}) => ({
  key: "g1",
  serviceUserName: "Jane Doe",
  serviceUserKey: "su1",
  serviceUserAddress: "1 High St",
  serviceUserLatitude: 51.5,
  serviceUserLongitude: -0.12,
  callTypeLabel: "AM",
  requirementStartMinutes: 540,
  durationMinutes: 30,
  totalCalls: 1,
  isTimeCritical: false,
  ...over,
});

const roster = (over: Record<string, unknown> = {}) => ({
  key: "w1",
  workerName: "L.Barron",
  uniqueServiceUsers: 1,
  shiftBarsCount: 0,
  callGroups: [group()],
  ...over,
});

describe("buildWorkerTimelineEntries", () => {
  it("returns [] for null roster", () => {
    expect(buildWorkerTimelineEntries(null)).toEqual([]);
  });

  it("maps call groups into timeline entries with prefixed unique ids", () => {
    const entries = buildWorkerTimelineEntries(roster() as any);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe("w1::g1");
    expect(entries[0].title).toBe("Jane Doe");
    expect(entries[0].startMinutes).toBe(540);
    expect(entries[0].durationMinutes).toBe(30);
    expect(entries[0].address).toBe("1 High St");
  });

  it("falls back to call type label when no service user name", () => {
    const entries = buildWorkerTimelineEntries(
      roster({ callGroups: [group({ serviceUserName: null, callTypeLabel: "Tea" })] }) as any
    );
    expect(entries[0].title).toBe("Tea");
  });

  it("uses fallback duration of 30 when duration is null", () => {
    const entries = buildWorkerTimelineEntries(
      roster({ callGroups: [group({ durationMinutes: null })] }) as any
    );
    expect(entries[0].durationMinutes).toBe(30);
  });

  it("excludes groups with no requirement start time", () => {
    const entries = buildWorkerTimelineEntries(
      roster({ callGroups: [group({ requirementStartMinutes: null })] }) as any
    );
    expect(entries).toHaveLength(0);
  });

  it("filters by selectedCallKeys when provided", () => {
    const r = roster({
      callGroups: [group({ key: "g1" }), group({ key: "g2", serviceUserName: "John" })],
    });
    const entries = buildWorkerTimelineEntries(r as any, undefined, new Set(["g2"]));
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe("John");
  });

  it("filters by template selection key and marks templated/double-up", () => {
    const r = roster({
      callGroups: [
        group({
          key: "g1",
          templatedWeekdayKeys: new Set(["week1::Monday"]),
          doubleUpWeekdayKeys: new Set(["week1::Monday"]),
        }),
        group({ key: "g2", templatedWeekdayKeys: new Set(["week2::Tuesday"]) }),
      ],
    });
    const entries = buildWorkerTimelineEntries(r as any, "week1::Monday");
    expect(entries).toHaveLength(1);
    expect(entries[0].isTemplated).toBe(true);
    expect(entries[0].isDoubleUp).toBe(true);
  });

  it("generates distinct ids for duplicated group keys", () => {
    const r = roster({ callGroups: [group({ key: "dup" }), group({ key: "dup", serviceUserName: "John" })] });
    const entries = buildWorkerTimelineEntries(r as any);
    expect(entries.map((e) => e.id)).toEqual(["w1::dup", "w1::dup::dup2"]);
  });
});

describe("buildWorkerSummaries", () => {
  it("aggregates totals across call groups", () => {
    const r = roster({
      callGroups: [
        group({ totalCalls: 2, durationMinutes: 30, isTimeCritical: true }),
        group({ key: "g2", totalCalls: 1, durationMinutes: 45, isTimeCritical: false }),
      ],
      uniqueServiceUsers: 2,
      shiftBarsCount: 3,
    });
    const [summary] = buildWorkerSummaries([r] as any);
    expect(summary.workerName).toBe("L.Barron");
    expect(summary.totalCalls).toBe(3);
    expect(summary.totalDurationMinutes).toBe(75);
    expect(summary.timeCriticalCalls).toBe(2);
    expect(summary.uniqueServiceUsers).toBe(2);
    expect(summary.shiftBarsCount).toBe(3);
  });
});

describe("buildWorkerLane / buildAllWorkerLanes", () => {
  it("buildWorkerLane returns null for null roster", () => {
    expect(buildWorkerLane(null)).toBeNull();
  });

  it("buildWorkerLane wraps entries with worker label", () => {
    const laneResult = buildWorkerLane(roster() as any);
    expect(laneResult?.id).toBe("w1");
    expect(laneResult?.label).toBe("L.Barron");
    expect(laneResult?.entries).toHaveLength(1);
  });

  it("buildAllWorkerLanes maps every roster", () => {
    const lanes = buildAllWorkerLanes([roster(), roster({ key: "w2", workerName: "M.Smith" })] as any);
    expect(lanes).toHaveLength(2);
    expect(lanes[1].label).toBe("M.Smith");
  });
});
