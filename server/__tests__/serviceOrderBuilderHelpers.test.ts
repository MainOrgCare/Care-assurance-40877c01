import test, { describe } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeName,
  generateServiceUserKey,
  generateWorkerKey,
  generateCallHash,
  getCallTypeKey,
  getTimeBand,
  getTemplateWeek,
  getDayName,
  isAdminStaff,
  formatTime,
  formatServiceOrderSummary,
} from "../services/serviceOrderBuilder";

describe("normalizeName", () => {
  test("lowercases, trims and collapses whitespace", () => {
    assert.equal(normalizeName("  John   Smith  "), "john smith");
  });

  test("strips punctuation and special characters", () => {
    assert.equal(normalizeName("O'Brien-Jones!"), "obrienjones");
  });

  test("keeps digits", () => {
    assert.equal(normalizeName("Flat 2B"), "flat 2b");
  });
});

describe("generateServiceUserKey / generateWorkerKey", () => {
  test("service user key is prefixed and underscore-joined", () => {
    assert.equal(generateServiceUserKey("John Smith"), "su_john_smith");
  });

  test("worker key is prefixed and underscore-joined", () => {
    assert.equal(generateWorkerKey("L Barron"), "cw_l_barron");
  });

  test("keys are stable regardless of casing/whitespace/punctuation", () => {
    assert.equal(
      generateServiceUserKey("  john   SMITH "),
      generateServiceUserKey("John Smith!"),
    );
  });
});

describe("generateCallHash", () => {
  test("is deterministic and 32 hex chars", () => {
    const a = generateCallHash("su_a", "cw_b", "2026-01-01", "morning", 480);
    const b = generateCallHash("su_a", "cw_b", "2026-01-01", "morning", 480);
    assert.equal(a, b);
    assert.match(a, /^[0-9a-f]{32}$/);
  });

  test("differs when any component changes", () => {
    const base = generateCallHash("su_a", "cw_b", "2026-01-01", "morning", 480);
    assert.notEqual(base, generateCallHash("su_x", "cw_b", "2026-01-01", "morning", 480));
    assert.notEqual(base, generateCallHash("su_a", "cw_b", "2026-01-02", "morning", 480));
    assert.notEqual(base, generateCallHash("su_a", "cw_b", "2026-01-01", "bed", 480));
    assert.notEqual(base, generateCallHash("su_a", "cw_b", "2026-01-01", "morning", 481));
  });

  test("missing start time is distinct from a real start time", () => {
    const withTime = generateCallHash("su_a", "cw_b", "2026-01-01", "morning", 0);
    const noTime = generateCallHash("su_a", "cw_b", "2026-01-01", "morning");
    assert.notEqual(withTime, noTime);
  });
});

describe("getCallTypeKey", () => {
  test("maps morning synonyms", () => {
    assert.equal(getCallTypeKey("AM Visit"), "morning");
    assert.equal(getCallTypeKey("Morning Wash"), "morning");
    assert.equal(getCallTypeKey("Breakfast"), "morning");
  });

  test("maps lunch / tea / bed bands", () => {
    assert.equal(getCallTypeKey("Lunch Call"), "lunch");
    assert.equal(getCallTypeKey("Tea Time"), "tea");
    assert.equal(getCallTypeKey("PM"), "tea");
    assert.equal(getCallTypeKey("Night"), "bed");
    assert.equal(getCallTypeKey("Evening Visit"), "bed");
  });

  test("maps domestic / shopping / medication", () => {
    assert.equal(getCallTypeKey("Domestic"), "domestic");
    assert.equal(getCallTypeKey("Shopping Trip"), "shopping");
    assert.equal(getCallTypeKey("Shop"), "shopping");
    assert.equal(getCallTypeKey("Medication"), "medication");
    assert.equal(getCallTypeKey("Meds"), "medication");
  });

  test("morning takes precedence over later matches", () => {
    assert.equal(getCallTypeKey("AM Medication"), "morning");
  });

  test("falls back to other for unknown labels", () => {
    assert.equal(getCallTypeKey("Random Task"), "other");
  });

  test("matches on whole tokens, not substrings", () => {
    // "bedtime" is a single token and does not equal the token "bed"
    assert.equal(getCallTypeKey("Bedtime"), "other");
  });
});

describe("getTimeBand", () => {
  test("returns UNKNOWN for missing input", () => {
    assert.equal(getTimeBand(undefined), "UNKNOWN");
  });

  test("bands at boundaries", () => {
    assert.equal(getTimeBand(0), "EARLY");
    assert.equal(getTimeBand(359), "EARLY");
    assert.equal(getTimeBand(360), "AM");
    assert.equal(getTimeBand(719), "AM");
    assert.equal(getTimeBand(720), "LUNCH");
    assert.equal(getTimeBand(839), "LUNCH");
    assert.equal(getTimeBand(840), "PM");
    assert.equal(getTimeBand(1019), "PM");
    assert.equal(getTimeBand(1020), "EVE");
    assert.equal(getTimeBand(1199), "EVE");
    assert.equal(getTimeBand(1200), "LATE");
    assert.equal(getTimeBand(1439), "LATE");
  });
});

describe("getTemplateWeek", () => {
  test("default reference (Mon 3 Jan 2000) is week1", () => {
    assert.equal(getTemplateWeek("2000-01-03"), "week1");
  });

  test("alternates each week from the reference", () => {
    assert.equal(getTemplateWeek("2000-01-10"), "week2");
    assert.equal(getTemplateWeek("2000-01-17"), "week1");
    assert.equal(getTemplateWeek("2000-01-24"), "week2");
  });

  test("accepts DD/MM/YYYY input", () => {
    assert.equal(getTemplateWeek("10/01/2000"), "week2");
  });

  test("honours a custom reference date", () => {
    assert.equal(getTemplateWeek("2026-06-08", "2026-06-08"), "week1");
    assert.equal(getTemplateWeek("2026-06-15", "2026-06-08"), "week2");
  });

  test("falls back to week2 for unparseable dates", () => {
    assert.equal(getTemplateWeek("not-a-date"), "week2");
  });
});

describe("getDayName", () => {
  test("returns UTC weekday names", () => {
    assert.equal(getDayName("2000-01-01"), "Saturday");
    assert.equal(getDayName("2000-01-02"), "Sunday");
    assert.equal(getDayName("2000-01-03"), "Monday");
  });

  test("returns Unknown for invalid input", () => {
    assert.equal(getDayName("nonsense"), "Unknown");
  });
});

describe("isAdminStaff", () => {
  test("flags office/admin/management keywords", () => {
    assert.equal(isAdminStaff("Office"), true);
    assert.equal(isAdminStaff("Care Manager"), true);
    assert.equal(isAdminStaff("Coordinator"), true);
    assert.equal(isAdminStaff("TBC"), true);
    assert.equal(isAdminStaff("Unknown"), true);
  });

  test("does not flag anonymized care worker names", () => {
    assert.equal(isAdminStaff("L.Barron"), false);
  });
});

describe("formatTime", () => {
  test("formats minutes since midnight as zero-padded HH:MM", () => {
    assert.equal(formatTime(0), "00:00");
    assert.equal(formatTime(90), "01:30");
    assert.equal(formatTime(600), "10:00");
    assert.equal(formatTime(1439), "23:59");
  });
});

describe("formatServiceOrderSummary", () => {
  test("includes carer count when more than one carer", () => {
    assert.equal(
      formatServiceOrderSummary("AM", 7, 2, 30),
      "AM x7 days x2 carers, 30 mins",
    );
  });

  test("omits carer suffix for a single carer", () => {
    assert.equal(
      formatServiceOrderSummary("PM", 5, 1, 45),
      "PM x5 days, 45 mins",
    );
  });
});
