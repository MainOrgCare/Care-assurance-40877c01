import { createHash } from "node:crypto";
import { z } from "zod";

const MAX_WORKER_NAME_LENGTH = 120;
const MAX_WORKER_KEY_LENGTH = 120;
const MAX_GROUP_KEYS = 500;
const MAX_SHIFT_BARS = 40;
const MAX_OVERRIDES = 800;
const MAX_OPTIMIZED_RUN_ENTRIES = 5000;
const MAX_ENTRY_KEY_LENGTH = 240;
const MAX_LABEL_LENGTH = 120;

export const rotaWeekdayEnum = z.enum([
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
]);

const minuteValueSchema = z.number().int().min(0).max(1440);
const timeOfDayMinutesSchema = z.number().int().min(0).max(1439);

const nullableTimeOfDaySchema = timeOfDayMinutesSchema.nullable().optional();
const nullableMinuteValueSchema = minuteValueSchema.nullable().optional();

const boundedText = (max: number) => z.string().trim().min(1).max(max);
const nullableBoundedText = (max: number) => z.string().trim().max(max).nullable().optional();

const rotaEntrySchema = z.object({
  key: z.string().trim().min(1).max(MAX_ENTRY_KEY_LENGTH),
  serviceUserName: nullableBoundedText(MAX_LABEL_LENGTH),
  serviceUserArea: nullableBoundedText(MAX_LABEL_LENGTH),
  serviceUserAddress: nullableBoundedText(MAX_LABEL_LENGTH),
  callTypeLabel: nullableBoundedText(MAX_LABEL_LENGTH),
  timeBandLabel: nullableBoundedText(MAX_LABEL_LENGTH),
  requirementStartMinutes: nullableTimeOfDaySchema,
  scheduledStartMinutes: nullableTimeOfDaySchema,
  scheduledEndMinutes: nullableMinuteValueSchema,
  durationMinutes: nullableMinuteValueSchema,
  shiftMinutes: nullableMinuteValueSchema,
  recommendedStartMinutes: nullableTimeOfDaySchema,
  travelMinutesEstimated: nullableMinuteValueSchema,
  isTimeCritical: z.boolean().optional(),
  isDoubleUp: z.boolean().optional(),
  windowStartMinutes: nullableTimeOfDaySchema,
  windowEndMinutes: nullableMinuteValueSchema,
  isOutsideWindow: z.boolean().optional(),
  hasWindowConflict: z.boolean().optional(),
  suggestedStartMinutes: nullableTimeOfDaySchema,
});

const computeEntryRange = (entry: z.infer<typeof rotaEntrySchema>): { start: number; end: number } | null => {
  const start = typeof entry.scheduledStartMinutes === "number" ? entry.scheduledStartMinutes : null;
  if (typeof start !== "number") return null;
  let end: number | null = null;
  if (typeof entry.scheduledEndMinutes === "number") {
    end = entry.scheduledEndMinutes;
  } else if (typeof entry.durationMinutes === "number") {
    end = start + entry.durationMinutes;
  }
  if (typeof end !== "number") return null;
  if (end < start) end += 24 * 60;
  return { start, end };
};

const findFirstOverlap = (entries: z.infer<typeof rotaEntrySchema>[]) => {
  const ranges = entries
    .map((entry) => {
      const range = computeEntryRange(entry);
      if (!range) return null;
      return { entry, ...range };
    })
    .filter(Boolean) as Array<{ entry: z.infer<typeof rotaEntrySchema>; start: number; end: number }>;
  ranges.sort((a, b) => a.start - b.start);
  for (let i = 1; i < ranges.length; i++) {
    const prev = ranges[i - 1];
    const curr = ranges[i];
    if (curr.start < prev.end) {
      return { first: prev.entry, second: curr.entry };
    }
  }
  return null;
};

const rotaOverrideSchema = z.object({
  week1Days: z.array(rotaWeekdayEnum).max(7).default([]),
  week2Days: z.array(rotaWeekdayEnum).max(7).default([]),
  requirementStartMinutes: nullableTimeOfDaySchema,
});

const shiftBarSchema = z.object({
  startMinutes: nullableTimeOfDaySchema,
  endMinutes: nullableMinuteValueSchema,
  durationMinutes: nullableMinuteValueSchema,
});

const overridesSchema = z
  .record(z.string().trim().min(1).max(MAX_ENTRY_KEY_LENGTH), rotaOverrideSchema)
  .default({})
  .superRefine((value, ctx) => {
    const keyCount = Object.keys(value || {}).length;
    if (keyCount > MAX_OVERRIDES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Too many overrides (${keyCount}). Max is ${MAX_OVERRIDES}.`,
      });
    }
  });

export const careWorkerRotaPayloadSchema = z.object({
  workerName: boundedText(MAX_WORKER_NAME_LENGTH),
  workerKey: boundedText(MAX_WORKER_KEY_LENGTH),
  templateWeek: z.enum(["week1", "week2"]),
  templateDay: rotaWeekdayEnum,
  workerStartMinutes: nullableTimeOfDaySchema,
  workerEndMinutes: nullableMinuteValueSchema,
  timeCriticalWindowEnforced: z.boolean().default(false),
  shiftBars: z.array(shiftBarSchema).max(MAX_SHIFT_BARS).default([]),
  selectedGroupKeys: z.array(z.string().trim().min(1).max(MAX_ENTRY_KEY_LENGTH)).max(MAX_GROUP_KEYS).default([]),
  optimizedRun: z.array(rotaEntrySchema).max(MAX_OPTIMIZED_RUN_ENTRIES).default([]),
  overrides: overridesSchema,
}).superRefine((payload, ctx) => {
  const overlap = findFirstOverlap(payload.optimizedRun || []);
  if (overlap) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Overlapping calls detected (${overlap.first.key} overlaps ${overlap.second.key}).`,
      path: ["optimizedRun"],
    });
  }
});

export type CareWorkerRotaPayload = z.infer<typeof careWorkerRotaPayloadSchema>;

const sortKeysDeep = (value: any): any => {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, any>>((acc, key) => {
        acc[key] = sortKeysDeep(value[key]);
        return acc;
      }, {});
  }
  return value;
};

export const normalizeRotaPayload = (payload: CareWorkerRotaPayload) => {
  const overrides = Object.keys(payload.overrides)
    .sort()
    .reduce<Record<string, any>>((acc, key) => {
      const override = payload.overrides[key];
      acc[key] = {
        week1Days: [...override.week1Days].sort(),
        week2Days: [...override.week2Days].sort(),
        requirementStartMinutes:
          typeof override.requirementStartMinutes === "number" ? override.requirementStartMinutes : null,
      };
      return acc;
    }, {});

  const optimizedRun = [...payload.optimizedRun]
    .map((entry) => ({
      key: entry.key,
      serviceUserName: entry.serviceUserName ?? null,
      serviceUserArea: (entry as any).serviceUserArea ?? null,
      serviceUserAddress: (entry as any).serviceUserAddress ?? null,
      callTypeLabel: entry.callTypeLabel ?? null,
      timeBandLabel: entry.timeBandLabel ?? null,
      requirementStartMinutes: typeof entry.requirementStartMinutes === "number" ? entry.requirementStartMinutes : null,
      scheduledStartMinutes: typeof entry.scheduledStartMinutes === "number" ? entry.scheduledStartMinutes : null,
      scheduledEndMinutes: typeof entry.scheduledEndMinutes === "number" ? entry.scheduledEndMinutes : null,
      durationMinutes: typeof entry.durationMinutes === "number" ? entry.durationMinutes : null,
      shiftMinutes: typeof entry.shiftMinutes === "number" ? entry.shiftMinutes : null,
      recommendedStartMinutes:
        typeof (entry as any).recommendedStartMinutes === "number" ? (entry as any).recommendedStartMinutes : null,
      travelMinutesEstimated:
        typeof (entry as any).travelMinutesEstimated === "number" ? (entry as any).travelMinutesEstimated : null,
      isTimeCritical: Boolean(entry.isTimeCritical),
      isDoubleUp: Boolean(entry.isDoubleUp),
      windowStartMinutes: typeof entry.windowStartMinutes === "number" ? entry.windowStartMinutes : null,
      windowEndMinutes: typeof entry.windowEndMinutes === "number" ? entry.windowEndMinutes : null,
      isOutsideWindow: Boolean(entry.isOutsideWindow),
      hasWindowConflict: Boolean(entry.hasWindowConflict),
      suggestedStartMinutes: typeof (entry as any).suggestedStartMinutes === "number" ? (entry as any).suggestedStartMinutes : null,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));

  const shiftBars = [...payload.shiftBars]
    .map((bar) => ({
      startMinutes: typeof bar.startMinutes === "number" ? bar.startMinutes : null,
      endMinutes: typeof bar.endMinutes === "number" ? bar.endMinutes : null,
      durationMinutes: typeof bar.durationMinutes === "number" ? bar.durationMinutes : null,
    }))
    .sort((a, b) => {
      const aStart = typeof a.startMinutes === "number" ? a.startMinutes : -1;
      const bStart = typeof b.startMinutes === "number" ? b.startMinutes : -1;
      if (aStart !== bStart) return aStart - bStart;
      const aEnd = typeof a.endMinutes === "number" ? a.endMinutes : -1;
      const bEnd = typeof b.endMinutes === "number" ? b.endMinutes : -1;
      return aEnd - bEnd;
    });

  const selectedGroupKeys = Array.from(new Set(payload.selectedGroupKeys)).sort();

  return {
    workerKey: payload.workerKey,
    templateWeek: payload.templateWeek,
    templateDay: payload.templateDay,
    timeCriticalWindowEnforced: Boolean(payload.timeCriticalWindowEnforced),
    workerStartMinutes: typeof payload.workerStartMinutes === "number" ? payload.workerStartMinutes : null,
    workerEndMinutes: typeof payload.workerEndMinutes === "number" ? payload.workerEndMinutes : null,
    shiftBars,
    selectedGroupKeys,
    overrides,
    optimizedRun,
  };
};

export const computeRotaSourceHash = (payload: CareWorkerRotaPayload): string => {
  const normalized = normalizeRotaPayload(payload);
  return createHash("sha256").update(JSON.stringify(sortKeysDeep(normalized))).digest("hex");
};
