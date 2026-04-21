import test, { describe } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeDate,
  addDays,
  differenceInDays,
  startOfWeekMonday,
  parseDateInput,
  formatDate,
  parseInteger,
  normalizeTime,
  parseTimeToMinutes,
  parseDurationMinutes,
  formatDurationFromMinutes,
  getBillingDayIndex,
  getBillingDayKey,
  getWeekIndex,
  parseJsonFromModel,
  BILLING_DAY_KEYS,
} from "../utils/billingHelpers";

// ── Date helpers ─────────────────────────────────────────────────────────

describe("normalizeDate", () => {
  test("strips time component", () => {
    const d = normalizeDate(new Date(2026, 2, 15, 14, 30, 45));
    assert.equal(d.getHours(), 0);
    assert.equal(d.getMinutes(), 0);
    assert.equal(d.getSeconds(), 0);
    assert.equal(d.getDate(), 15);
  });
});

describe("addDays", () => {
  test("adds positive days", () => {
    const d = addDays(new Date(2026, 0, 1), 5);
    assert.equal(d.getDate(), 6);
    assert.equal(d.getMonth(), 0);
  });

  test("subtracts when negative", () => {
    const d = addDays(new Date(2026, 0, 10), -3);
    assert.equal(d.getDate(), 7);
  });
});

describe("differenceInDays", () => {
  test("returns correct difference", () => {
    const a = new Date(2026, 0, 1);
    const b = new Date(2026, 0, 11);
    assert.equal(differenceInDays(a, b), 10);
  });

  test("returns 0 for same date", () => {
    const d = new Date(2026, 5, 15);
    assert.equal(differenceInDays(d, d), 0);
  });
});

describe("startOfWeekMonday", () => {
  test("returns Monday for a Wednesday", () => {
    // 2026-03-25 is a Wednesday
    const wed = new Date(2026, 2, 25);
    const mon = startOfWeekMonday(wed);
    assert.equal(mon.getDay(), 1); // Monday
    assert.equal(mon.getDate(), 23);
  });

  test("returns same date when already Monday", () => {
    // 2026-03-23 is a Monday
    const mon = new Date(2026, 2, 23);
    const result = startOfWeekMonday(mon);
    assert.equal(result.getDate(), 23);
  });
});

describe("parseDateInput", () => {
  test("parses ISO format YYYY-MM-DD", () => {
    const d = parseDateInput("2026-03-15");
    assert.ok(d !== null);
    assert.equal(d!.getFullYear(), 2026);
    assert.equal(d!.getMonth(), 2); // 0-indexed
    assert.equal(d!.getDate(), 15);
  });

  test("returns null for empty/null input", () => {
    assert.equal(parseDateInput(null), null);
    assert.equal(parseDateInput(""), null);
    assert.equal(parseDateInput(undefined), null);
  });

  test("returns null for invalid date", () => {
    assert.equal(parseDateInput("not-a-date"), null);
  });
});

describe("formatDate", () => {
  test("formats as DD/MM/YYYY", () => {
    const result = formatDate(new Date(2026, 2, 5)); // March 5
    assert.equal(result, "05/03/2026");
  });
});

describe("parseInteger", () => {
  test("parses integers from strings", () => {
    assert.equal(parseInteger("42"), 42);
    assert.equal(parseInteger("-7"), -7);
  });

  test("returns 0 for null/undefined/invalid", () => {
    assert.equal(parseInteger(null), 0);
    assert.equal(parseInteger(undefined), 0);
    assert.equal(parseInteger("abc"), 0);
  });

  test("extracts leading digits from mixed strings", () => {
    assert.equal(parseInteger("123abc"), 123);
  });
});

// ── Time helpers ─────────────────────────────────────────────────────────

describe("normalizeTime", () => {
  test("normalizes HH:MM", () => {
    assert.equal(normalizeTime("9:05"), "09:05");
    assert.equal(normalizeTime("14:30"), "14:30");
  });

  test("converts 12-hour AM/PM to 24-hour format", () => {
    assert.equal(normalizeTime("12:00 AM"), "00:00"); // midnight
    assert.equal(normalizeTime("12:00 PM"), "12:00"); // noon
    assert.equal(normalizeTime("1:30 PM"), "13:30");
    assert.equal(normalizeTime("11:59 pm"), "23:59");
    assert.equal(normalizeTime("9:00 am"), "09:00");
    assert.equal(normalizeTime("12:30 am"), "00:30");
  });

  test("returns null for invalid input", () => {
    assert.equal(normalizeTime(null), null);
    assert.equal(normalizeTime(""), null);
    assert.equal(normalizeTime("25:00"), null);
  });
});

describe("parseTimeToMinutes", () => {
  test("converts time string to minutes", () => {
    assert.equal(parseTimeToMinutes("02:30"), 150);
    assert.equal(parseTimeToMinutes("0:00"), 0);
  });

  test("returns null for invalid", () => {
    assert.equal(parseTimeToMinutes(null), null);
    assert.equal(parseTimeToMinutes("bad"), null);
  });
});

describe("parseDurationMinutes", () => {
  test("returns null for empty", () => {
    assert.equal(parseDurationMinutes(null), null);
    assert.equal(parseDurationMinutes(""), null);
  });
});

describe("formatDurationFromMinutes", () => {
  test("formats minutes as HH:MM", () => {
    assert.equal(formatDurationFromMinutes(90), "01:30");
    assert.equal(formatDurationFromMinutes(0), "00:00");
    assert.equal(formatDurationFromMinutes(60), "01:00");
  });
});

// ── Billing-week helpers ─────────────────────────────────────────────────

describe("getBillingDayIndex / getBillingDayKey", () => {
  test("Monday is index 0", () => {
    // 2026-03-23 is Monday
    const mon = new Date(2026, 2, 23);
    assert.equal(getBillingDayIndex(mon), 0);
    assert.equal(getBillingDayKey(mon), "mon");
  });

  test("Sunday is index 6", () => {
    // 2026-03-29 is Sunday
    const sun = new Date(2026, 2, 29);
    assert.equal(getBillingDayIndex(sun), 6);
    assert.equal(getBillingDayKey(sun), "sun");
  });
});

describe("getWeekIndex", () => {
  test("same week returns 0", () => {
    const mon = new Date(2026, 2, 23);
    const wed = new Date(2026, 2, 25);
    assert.equal(getWeekIndex(mon, wed), 0);
  });

  test("next week returns 1", () => {
    const mon = new Date(2026, 2, 23);
    const nextMon = new Date(2026, 2, 30);
    assert.equal(getWeekIndex(mon, nextMon), 1);
  });
});

describe("BILLING_DAY_KEYS", () => {
  test("has 7 entries starting with mon", () => {
    assert.equal(BILLING_DAY_KEYS.length, 7);
    assert.equal(BILLING_DAY_KEYS[0], "mon");
    assert.equal(BILLING_DAY_KEYS[6], "sun");
  });
});

// ── JSON extraction ──────────────────────────────────────────────────────

describe("parseJsonFromModel", () => {
  test("parses plain JSON object", () => {
    const result = parseJsonFromModel('{"key": "value"}');
    assert.deepEqual(result, { key: "value" });
  });

  test("parses JSON from fenced code block", () => {
    const input = "Here is the result:\n```json\n{\"rows\": [1, 2]}\n```\nDone.";
    const result = parseJsonFromModel(input);
    assert.deepEqual(result, { rows: [1, 2] });
  });

  test("parses JSON array", () => {
    const result = parseJsonFromModel('[1, 2, 3]');
    assert.deepEqual(result, [1, 2, 3]);
  });

  test("recovers from trailing commas", () => {
    const result = parseJsonFromModel('{"a": 1, "b": 2,}');
    assert.deepEqual(result, { a: 1, b: 2 });
  });

  test("throws when no JSON found", () => {
    assert.throws(() => parseJsonFromModel("No JSON here"), /did not contain JSON/);
  });
});
