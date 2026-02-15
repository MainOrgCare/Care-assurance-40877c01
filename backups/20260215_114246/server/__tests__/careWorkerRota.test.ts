import test from "node:test";
import assert from "node:assert/strict";
import {
  careWorkerRotaPayloadSchema,
  computeRotaSourceHash,
  normalizeRotaPayload,
  type CareWorkerRotaPayload,
} from "../services/careWorkerRota";

test("careWorkerRota: sourceHash is stable across ordering", () => {
  const base: CareWorkerRotaPayload = {
    workerName: "Alice Example",
    workerKey: "alice",
    templateWeek: "week1",
    templateDay: "Monday",
    workerStartMinutes: 480,
    workerEndMinutes: 1020,
    timeCriticalWindowEnforced: true,
    shiftBars: [
      { startMinutes: 900, endMinutes: 1020, durationMinutes: 120 },
      { startMinutes: 480, endMinutes: 600, durationMinutes: 120 },
    ],
    selectedGroupKeys: ["b", "a", "a"],
    optimizedRun: [
      {
        key: "k2",
        serviceUserName: "Sue",
        callTypeLabel: "AM",
        timeBandLabel: "AM",
        requirementStartMinutes: 540,
        scheduledStartMinutes: 545,
        scheduledEndMinutes: 575,
        durationMinutes: 30,
        shiftMinutes: 0,
        isTimeCritical: true,
        isDoubleUp: false,
        windowStartMinutes: 530,
        windowEndMinutes: 560,
        isOutsideWindow: false,
        hasWindowConflict: false,
        suggestedStartMinutes: 540,
      },
      {
        key: "k1",
        serviceUserName: "Bob",
        callTypeLabel: "Lunch",
        timeBandLabel: "Lunch",
        requirementStartMinutes: 720,
        scheduledStartMinutes: 715,
        scheduledEndMinutes: 745,
        durationMinutes: 30,
        shiftMinutes: 0,
        isTimeCritical: false,
        isDoubleUp: true,
        windowStartMinutes: null,
        windowEndMinutes: null,
        isOutsideWindow: false,
        hasWindowConflict: false,
        suggestedStartMinutes: null,
      },
    ],
    overrides: {
      z: { week1Days: ["Wednesday", "Monday"], week2Days: [], requirementStartMinutes: 555 },
      a: { week1Days: ["Tuesday"], week2Days: ["Monday"], requirementStartMinutes: null },
    },
  };

  const payload1 = careWorkerRotaPayloadSchema.parse(base);

  const payload2 = careWorkerRotaPayloadSchema.parse({
    ...base,
    // reorder arrays + override keys
    shiftBars: [...base.shiftBars].reverse(),
    selectedGroupKeys: ["a", "b"],
    optimizedRun: [...base.optimizedRun].reverse(),
    overrides: {
      a: { week1Days: ["Tuesday"], week2Days: ["Monday"], requirementStartMinutes: null },
      z: { week1Days: ["Monday", "Wednesday"], week2Days: [], requirementStartMinutes: 555 },
    },
  });

  const hash1 = computeRotaSourceHash(payload1);
  const hash2 = computeRotaSourceHash(payload2);
  assert.equal(hash1, hash2);

  const normalized1 = normalizeRotaPayload(payload1);
  const normalized2 = normalizeRotaPayload(payload2);
  assert.deepEqual(normalized1, normalized2);
});

test("careWorkerRota: rejects out-of-range minutes", () => {
  assert.throws(() => {
    careWorkerRotaPayloadSchema.parse({
      workerName: "Alice",
      workerKey: "alice",
      templateWeek: "week1",
      templateDay: "Monday",
      workerStartMinutes: 2000,
      optimizedRun: [],
    });
  });
});

test("careWorkerRota: rejects too many selectedGroupKeys", () => {
  assert.throws(() => {
    careWorkerRotaPayloadSchema.parse({
      workerName: "Alice",
      workerKey: "alice",
      templateWeek: "week1",
      templateDay: "Monday",
      optimizedRun: [],
      selectedGroupKeys: Array.from({ length: 501 }, (_, idx) => `k-${idx}`),
    });
  });
});

test("careWorkerRota: rejects overlapping calls", () => {
  assert.throws(() => {
    careWorkerRotaPayloadSchema.parse({
      workerName: "Alice",
      workerKey: "alice",
      templateWeek: "week1",
      templateDay: "Monday",
      optimizedRun: [
        {
          key: "k1",
          serviceUserName: "Sue",
          callTypeLabel: "AM",
          timeBandLabel: "AM",
          scheduledStartMinutes: 540,
          scheduledEndMinutes: 600,
          durationMinutes: 60,
        },
        {
          key: "k2",
          serviceUserName: "Bob",
          callTypeLabel: "AM",
          timeBandLabel: "AM",
          scheduledStartMinutes: 590,
          scheduledEndMinutes: 630,
          durationMinutes: 40,
        },
      ],
    });
  });
});
