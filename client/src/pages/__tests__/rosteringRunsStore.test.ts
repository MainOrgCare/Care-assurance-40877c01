import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getSharedAllSlots,
  getSharedRecommendations,
  getSharedRecommendationDecisions,
  setSharedAllSlots,
  setSharedRecommendations,
  setSharedRecommendationDecisions,
  subscribeSharedRecommendationDecisions,
  subscribeSharedRosteringData,
  type SharedCallSlot,
  type SharedCareCallRecommendation,
} from "@/pages/rosteringRunsStore";

/**
 * Minimal re-implementation of React's useSyncExternalStore re-render contract:
 * it subscribes, reads a snapshot, and only "re-renders" when the snapshot
 * reference changes (Object.is bail-out). We use this to prove the Rostering
 * Runs view re-renders exactly when new ECM data is analysed — and not on
 * unrelated updates.
 */
function createStoreConsumer<T>(subscribe: (cb: () => void) => () => void, getSnapshot: () => T) {
  let snapshot = getSnapshot();
  let renderCount = 0;
  const unsubscribe = subscribe(() => {
    const next = getSnapshot();
    if (!Object.is(next, snapshot)) {
      snapshot = next;
      renderCount += 1;
    }
  });
  return {
    get snapshot() {
      return snapshot;
    },
    get renderCount() {
      return renderCount;
    },
    unsubscribe,
  };
}

function makeSlot(key: string, hasRecommendation: boolean): SharedCallSlot {
  return {
    key,
    serviceUserKey: `su-${key}`,
    serviceUserName: `Service User ${key}`,
    serviceUserArea: null,
    serviceUserAddress: null,
    timeBandLabel: "Morning",
    callTypeLabel: "Personal Care",
    totalCalls: 5,
    callsWithTimes: 5,
    callsWithDurations: 5,
    averageStartOffsetMinutes: 10,
    averageActualStartMinutes: 480,
    averagePlannedStartMinutes: 470,
    averageDurationPercent: 95,
    averagePlannedDurationMinutes: 30,
    averageActualDurationMinutes: 28,
    suggestedPlannedTimeLabel: "08:00",
    suggestedPlannedDurationMinutes: 30,
    advice: hasRecommendation ? ["Shift planned start later"] : [],
    offsetConsistency: 0.8,
    hasRecommendation,
  };
}

function makeRecommendation(key: string): SharedCareCallRecommendation {
  return {
    key,
    serviceUserKey: `su-${key}`,
    serviceUserName: `Service User ${key}`,
    serviceUserArea: null,
    serviceUserAddress: null,
    timeBandLabel: "Morning",
    callTypeLabel: "Personal Care",
    totalCalls: 5,
    callsWithTimes: 5,
    callsWithDurations: 5,
    averageStartOffsetMinutes: 10,
    averageActualStartMinutes: 480,
    averagePlannedStartMinutes: 470,
    averageDurationPercent: 95,
    suggestedPlannedTimeLabel: "08:00",
    suggestedPlannedDurationMinutes: 30,
    advice: ["Shift planned start later"],
    offsetConsistency: 0.8,
  };
}

describe("rosteringRunsStore reactive data", () => {
  beforeEach(() => {
    setSharedAllSlots([]);
    setSharedRecommendations([]);
  });

  it("notifies subscribers when new analysed slots are set", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSharedRosteringData(listener);

    setSharedAllSlots([makeSlot("a", true), makeSlot("b", false)]);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getSharedAllSlots()).toHaveLength(2);
    expect(getSharedAllSlots().filter((s) => s.hasRecommendation)).toHaveLength(1);

    unsubscribe();
  });

  it("notifies subscribers when recommendations are set", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSharedRosteringData(listener);

    setSharedRecommendations([makeRecommendation("a")]);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getSharedRecommendations()).toHaveLength(1);

    unsubscribe();
  });

  it("reflects the latest analysis when a new ECM export replaces the previous one", () => {
    const snapshots: number[] = [];
    const unsubscribe = subscribeSharedRosteringData(() => {
      snapshots.push(getSharedAllSlots().length);
    });

    // First ECM export analysed.
    setSharedAllSlots([makeSlot("a", true)]);
    // A new ECM export is uploaded and analysed, replacing the dataset.
    setSharedAllSlots([makeSlot("x", true), makeSlot("y", true), makeSlot("z", false)]);

    expect(snapshots).toEqual([1, 3]);
    expect(getSharedAllSlots().map((s) => s.key)).toEqual(["x", "y", "z"]);

    unsubscribe();
  });

  it("stops notifying after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSharedRosteringData(listener);
    unsubscribe();

    setSharedAllSlots([makeSlot("a", true)]);

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("rosteringRunsStore useSyncExternalStore contract", () => {
  beforeEach(() => {
    setSharedAllSlots([]);
    setSharedRecommendations([]);
    setSharedRecommendationDecisions({});
  });

  it("re-renders the Runs view exactly when new ECM data is analysed", () => {
    const consumer = createStoreConsumer(subscribeSharedRosteringData, getSharedAllSlots);

    expect(consumer.renderCount).toBe(0);
    expect(consumer.snapshot).toHaveLength(0);

    // ECM export #1 analysed.
    setSharedAllSlots([makeSlot("a", true)]);
    expect(consumer.renderCount).toBe(1);
    expect(consumer.snapshot.map((s) => s.key)).toEqual(["a"]);

    // ECM export #2 analysed, replacing the dataset.
    setSharedAllSlots([makeSlot("b", true), makeSlot("c", false)]);
    expect(consumer.renderCount).toBe(2);
    expect(consumer.snapshot.map((s) => s.key)).toEqual(["b", "c"]);

    consumer.unsubscribe();
  });

  it("returns a stable snapshot reference between updates (no re-render loop)", () => {
    setSharedAllSlots([makeSlot("a", true)]);

    const first = getSharedAllSlots();
    const second = getSharedAllSlots();

    // Same reference until a setter runs — this is what lets
    // useSyncExternalStore bail out and avoid an infinite render loop.
    expect(Object.is(first, second)).toBe(true);

    setSharedAllSlots([makeSlot("b", true)]);
    const third = getSharedAllSlots();
    expect(Object.is(first, third)).toBe(false);
  });

  it("does not re-render the data view when only recommendation decisions change", () => {
    const dataConsumer = createStoreConsumer(subscribeSharedRosteringData, getSharedAllSlots);
    const decisionConsumer = createStoreConsumer(
      subscribeSharedRecommendationDecisions,
      getSharedRecommendationDecisions,
    );

    setSharedRecommendationDecisions({ "su-a": "implemented" });

    // Decision channel updates...
    expect(decisionConsumer.renderCount).toBe(1);
    // ...but the analysed-data channel stays put.
    expect(dataConsumer.renderCount).toBe(0);

    dataConsumer.unsubscribe();
    decisionConsumer.unsubscribe();
  });

  it("does not fire decision listeners when analysed data changes", () => {
    const decisionListener = vi.fn();
    const unsubscribe = subscribeSharedRecommendationDecisions(decisionListener);

    setSharedAllSlots([makeSlot("a", true)]);
    setSharedRecommendations([makeRecommendation("a")]);

    expect(decisionListener).not.toHaveBeenCalled();
    unsubscribe();
  });
});
