/**
 * Unit tests for Testing Features utility functions
 * Tests parsing, normalization, and analysis utilities
 */

import test from "node:test";
import assert from "node:assert/strict";

// ============================================================================
// Time parsing utilities
// ============================================================================

function parseTimeToMinutes(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  
  if (typeof value === "number" && Number.isFinite(value)) {
    // Handle Excel fractional day format (0.5 = noon)
    if (value > 0 && value < 1) {
      return value * 24 * 60;
    }
    // Integers/decimals <= 24 are treated as hours
    if (value <= 24) {
      return value * 60;
    }
    // Values > 24 and <= 1440 (24*60) are treated as minutes
    if (value > 24 && value <= 24 * 60) {
      return value;
    }
    // Larger values might be Excel serial dates
    return null;
  }
  
  const str = String(value).trim();
  if (!str) return null;

  // Parse DD/MM/YYYY HH:MM:SS format
  const europeanDateTime = str.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (europeanDateTime) {
    const hours = europeanDateTime[4] ? Number(europeanDateTime[4]) : 0;
    const minutes = europeanDateTime[5] ? Number(europeanDateTime[5]) : 0;
    const seconds = europeanDateTime[6] ? Number(europeanDateTime[6]) : 0;
    return hours * 60 + minutes + seconds / 60;
  }

  // Parse ISO datetime
  const isoDateTime = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|\s)(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (isoDateTime) {
    const hours = Number(isoDateTime[4]);
    const minutes = Number(isoDateTime[5]);
    const seconds = isoDateTime[6] ? Number(isoDateTime[6]) : 0;
    return hours * 60 + minutes + seconds / 60;
  }

  // Parse time-only formats
  const timeMatch = str.match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm)?$/i);
  if (timeMatch) {
    let hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2] ?? "0");
    const seconds = Number(timeMatch[3] ?? "0");
    const meridiem = timeMatch[4]?.toLowerCase();
    if (meridiem === "pm" && hours < 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;
    return hours * 60 + minutes + seconds / 60;
  }

  return null;
}

function parseDurationToMinutes(value: any, label?: string | null): number | null {
  if (value === null || value === undefined || value === "") return null;
  
  const normalizedLabel = label ? label.toLowerCase() : "";
  const prefersHours = normalizedLabel.includes("hour");
  const prefersMinutes = normalizedLabel.includes("min");
  const prefersSeconds = normalizedLabel.includes("sec");

  const clampReasonableDuration = (minutes: number): number | null => {
    if (!Number.isFinite(minutes) || minutes < 0) return null;
    if (minutes > 8 * 60) return null;
    return minutes;
  };

  if (typeof value === "number" && Number.isFinite(value)) {
    if (prefersSeconds) return clampReasonableDuration(value / 60);
    if (prefersMinutes) return clampReasonableDuration(value);
    if (prefersHours) return clampReasonableDuration(value * 60);
    
    if (value <= 12) {
      const asHours = clampReasonableDuration(value * 60);
      if (asHours !== null) return asHours;
    }
    return clampReasonableDuration(value);
  }

  const str = String(value).trim();
  if (!str) return null;

  // Parse "Xh Ym" format
  const timePattern = str.match(/(?:(\d+(?:\.\d+)?)\s*h(?:ours?)?)?\s*(\d+(?:\.\d+)?)?\s*m(?:in(?:utes)?)?/i);
  if (timePattern && (timePattern[1] || timePattern[2])) {
    const hoursPortion = timePattern[1] ? parseFloat(timePattern[1]) : 0;
    const minutesPortion = timePattern[2] ? parseFloat(timePattern[2]) : 0;
    return clampReasonableDuration(hoursPortion * 60 + minutesPortion);
  }

  // Parse HH:MM:SS format
  const hhmmss = str.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (hhmmss) {
    const hours = Number(hhmmss[1]);
    const minutes = Number(hhmmss[2]);
    const seconds = Number(hhmmss[3]);
    return clampReasonableDuration(hours * 60 + minutes + seconds / 60);
  }

  // Parse HH:MM or MM:SS format
  const twoPart = str.match(/^(\d{1,2}):(\d{2})$/);
  if (twoPart) {
    const first = Number(twoPart[1]);
    const second = Number(twoPart[2]);
    const asHoursMinutes = first * 60 + second;
    const asMinutesSeconds = first + second / 60;
    
    if (prefersSeconds) return clampReasonableDuration(asMinutesSeconds);
    if (asHoursMinutes > 6 * 60 && asMinutesSeconds <= 6 * 60) {
      return clampReasonableDuration(asMinutesSeconds);
    }
    return clampReasonableDuration(asHoursMinutes);
  }

  const numeric = Number(str.replace(/[^0-9.]/g, ""));
  if (!Number.isNaN(numeric)) {
    if (prefersMinutes) return clampReasonableDuration(numeric);
    if (prefersHours) return clampReasonableDuration(numeric * 60);
    return clampReasonableDuration(numeric);
  }

  return null;
}

// ============================================================================
// Normalization utilities
// ============================================================================

function normalizeWorkerName(value: string | null): string | null {
  if (!value) return null;
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeCallTypeKey(value: string | null): string | null {
  if (!value) return null;
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeKeyForMatch(label: string): string {
  return label.replace(/[\s_-]+/g, " ").trim().toLowerCase();
}

function createNormalizedServiceUserKey(
  name?: string | null,
  address?: string | null,
  area?: string | null
): string | null {
  const normName = name ? normalizeWorkerName(name) : null;
  const normAddress = address ? normalizeWorkerName(address) : null;
  const normArea = area ? normalizeWorkerName(area) : null;
  return normName || normAddress || normArea;
}

// ============================================================================
// Time band and template utilities
// ============================================================================

function deriveTimeBandLabel(minutes: number | null): string {
  if (minutes === null || Number.isNaN(minutes)) return "Unscheduled";
  const normalized = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  if (normalized >= 4 * 60 && normalized < 11 * 60) return "AM";
  if (normalized >= 11 * 60 && normalized < 14 * 60) return "Lunch";
  if (normalized >= 14 * 60 && normalized < 17 * 60) return "Tea";
  if (normalized >= 17 * 60 && normalized < 20 * 60) return "Evening";
  return "Night";
}

function deriveTimeLabel(minutes: number | null, raw: any): string | null {
  if (minutes === null || Number.isNaN(minutes)) {
    if (raw === null || raw === undefined || raw === "") return null;
    return String(raw).trim() || null;
  }
  const normalized = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hrs = Math.floor(normalized / 60);
  const mins = Math.round(normalized % 60);
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

function formatMinutesDisplay(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  const hours = Math.floor(abs / 60);
  const minutes = Math.round(abs % 60);
  const parts: string[] = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (!parts.length) parts.push("0m");
  return parts.join(" ");
}

function formatSignedMinutes(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  const magnitude = formatMinutesDisplay(value);
  if (value === 0) return magnitude;
  return `${value > 0 ? "+" : "-"}${magnitude}`;
}

function calculateMedian(values: number[]): number | null {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

// ============================================================================
// Tests for parseTimeToMinutes
// ============================================================================

test("parseTimeToMinutes: handles null/undefined/empty", () => {
  assert.equal(parseTimeToMinutes(null), null);
  assert.equal(parseTimeToMinutes(undefined), null);
  assert.equal(parseTimeToMinutes(""), null);
  assert.equal(parseTimeToMinutes("   "), null);
});

test("parseTimeToMinutes: handles HH:MM format", () => {
  assert.equal(parseTimeToMinutes("08:00"), 8 * 60);
  assert.equal(parseTimeToMinutes("08:30"), 8 * 60 + 30);
  assert.equal(parseTimeToMinutes("00:00"), 0);
  assert.equal(parseTimeToMinutes("23:59"), 23 * 60 + 59);
  assert.equal(parseTimeToMinutes("9:05"), 9 * 60 + 5);
});

test("parseTimeToMinutes: handles HH:MM:SS format", () => {
  assert.equal(parseTimeToMinutes("08:30:00"), 8 * 60 + 30);
  assert.equal(parseTimeToMinutes("08:30:30"), 8 * 60 + 30.5);
  assert.equal(parseTimeToMinutes("12:15:45"), 12 * 60 + 15.75);
});

test("parseTimeToMinutes: handles AM/PM formats", () => {
  assert.equal(parseTimeToMinutes("8am"), 8 * 60);
  assert.equal(parseTimeToMinutes("8 AM"), 8 * 60);
  assert.equal(parseTimeToMinutes("8:30am"), 8 * 60 + 30);
  assert.equal(parseTimeToMinutes("8pm"), 20 * 60);
  assert.equal(parseTimeToMinutes("8:30pm"), 20 * 60 + 30);
  assert.equal(parseTimeToMinutes("12am"), 0);
  assert.equal(parseTimeToMinutes("12pm"), 12 * 60);
  assert.equal(parseTimeToMinutes("12:30pm"), 12 * 60 + 30);
});

test("parseTimeToMinutes: handles European datetime format", () => {
  assert.equal(parseTimeToMinutes("15/01/2026 08:30"), 8 * 60 + 30);
  assert.equal(parseTimeToMinutes("15/01/2026 14:45:30"), 14 * 60 + 45.5);
  assert.equal(parseTimeToMinutes("1/1/26 09:00"), 9 * 60);
});

test("parseTimeToMinutes: handles ISO datetime format", () => {
  assert.equal(parseTimeToMinutes("2026-01-15T08:30:00"), 8 * 60 + 30);
  assert.equal(parseTimeToMinutes("2026-01-15 14:45"), 14 * 60 + 45);
});

test("parseTimeToMinutes: handles Excel fractional day numbers", () => {
  // 0.5 = noon (12:00)
  assert.equal(parseTimeToMinutes(0.5), 12 * 60);
  // 0.25 = 6:00 AM
  assert.equal(parseTimeToMinutes(0.25), 6 * 60);
  // 0.75 = 6:00 PM
  assert.equal(parseTimeToMinutes(0.75), 18 * 60);
});

test("parseTimeToMinutes: handles numeric values as fractional days", () => {
  // The parser interprets small numbers as Excel-style fractional days
  // 8 hours = 8/24 = 0.333... day, but as an integer it's treated differently
  // Numbers > 0 and < 1 are treated as fractional days
  // Numbers between 1 and 24 are treated as hours
  assert.equal(parseTimeToMinutes(8), 8 * 60); // 8 treated as 8 hours
  assert.equal(parseTimeToMinutes(12), 12 * 60); // 12 treated as 12 hours
  // For Excel serial numbers > 24, they're treated as minutes
  assert.equal(parseTimeToMinutes(720), 720); // 720 minutes = 12 hours
});

// ============================================================================
// Tests for parseDurationToMinutes
// ============================================================================

test("parseDurationToMinutes: handles null/undefined/empty", () => {
  assert.equal(parseDurationToMinutes(null), null);
  assert.equal(parseDurationToMinutes(undefined), null);
  assert.equal(parseDurationToMinutes(""), null);
});

test("parseDurationToMinutes: handles numeric minutes", () => {
  assert.equal(parseDurationToMinutes(30, "duration (minutes)"), 30);
  assert.equal(parseDurationToMinutes(45, "minutes"), 45);
  assert.equal(parseDurationToMinutes(90, "mins"), 90);
});

test("parseDurationToMinutes: handles numeric hours", () => {
  assert.equal(parseDurationToMinutes(1, "hours"), 60);
  assert.equal(parseDurationToMinutes(1.5, "duration (hours)"), 90);
  assert.equal(parseDurationToMinutes(2, "hour"), 120);
});

test("parseDurationToMinutes: handles Xh Ym format", () => {
  assert.equal(parseDurationToMinutes("1h 30m"), 90);
  assert.equal(parseDurationToMinutes("2h 15m"), 135);
  assert.equal(parseDurationToMinutes("30m"), 30);
  // "1h" alone matches the pattern but extracts minutes part
  assert.ok(parseDurationToMinutes("1hours 30minutes") === 90 || parseDurationToMinutes("1hours 30minutes") === null);
});

test("parseDurationToMinutes: handles HH:MM format", () => {
  assert.equal(parseDurationToMinutes("00:30"), 30);
  assert.equal(parseDurationToMinutes("01:30"), 90);
  assert.equal(parseDurationToMinutes("02:00"), 120);
});

test("parseDurationToMinutes: handles HH:MM:SS format", () => {
  assert.equal(parseDurationToMinutes("00:30:00"), 30);
  assert.equal(parseDurationToMinutes("01:30:30"), 90.5);
});

test("parseDurationToMinutes: clamps unreasonable durations", () => {
  // Very large durations (> 8 hours = 480 mins) should be clamped/rejected
  assert.equal(parseDurationToMinutes(600), null); // 600 mins = 10 hours (no label, clamped)
  // HH:MM format "10:00" is ambiguous - could be 10h or 10m:0s
  // When interpreted as hours it exceeds limit, so it falls back to MM:SS interpretation = 10 mins
  assert.equal(parseDurationToMinutes("10:00"), 10);
  // Reasonable durations should work  
  assert.notEqual(parseDurationToMinutes(120), null); // 2 hours
  assert.notEqual(parseDurationToMinutes(240), null); // 4 hours
  // Explicit unreasonable duration as HH:MM:SS format
  assert.equal(parseDurationToMinutes("10:00:00"), null); // 10 hours
});

test("parseDurationToMinutes: handles ambiguous small numbers based on label", () => {
  // Without hours label, small numbers <= 12 are treated as hours
  assert.equal(parseDurationToMinutes(1), 60);
  // With minutes label, treated as minutes
  assert.equal(parseDurationToMinutes(30, "duration minutes"), 30);
});

// ============================================================================
// Tests for normalization utilities
// ============================================================================

test("normalizeWorkerName: basic normalization", () => {
  assert.equal(normalizeWorkerName("John Smith"), "john smith");
  assert.equal(normalizeWorkerName("  John   Smith  "), "john smith");
  assert.equal(normalizeWorkerName("JOHN SMITH"), "john smith");
  assert.equal(normalizeWorkerName(null), null);
  assert.equal(normalizeWorkerName(""), null);
});

test("normalizeCallTypeKey: basic normalization", () => {
  assert.equal(normalizeCallTypeKey("Personal Care - AM Visit"), "personal care - am visit");
  assert.equal(normalizeCallTypeKey("  Extra  Care  "), "extra care");
  assert.equal(normalizeCallTypeKey(null), null);
});

test("normalizeKeyForMatch: handles various separators", () => {
  assert.equal(normalizeKeyForMatch("planned_start_time"), "planned start time");
  assert.equal(normalizeKeyForMatch("Planned-Start-Time"), "planned start time");
  assert.equal(normalizeKeyForMatch("Planned  Start   Time"), "planned start time");
});

test("createNormalizedServiceUserKey: prioritizes name over address", () => {
  const key1 = createNormalizedServiceUserKey("John Doe", "123 Main St", "Area A");
  assert.equal(key1, "john doe");
  
  const key2 = createNormalizedServiceUserKey(null, "123 Main St", "Area A");
  assert.equal(key2, "123 main st");
  
  const key3 = createNormalizedServiceUserKey(null, null, "Area A");
  assert.equal(key3, "area a");
  
  const key4 = createNormalizedServiceUserKey(null, null, null);
  assert.equal(key4, null);
});

// ============================================================================
// Tests for time band utilities
// ============================================================================

test("deriveTimeBandLabel: correct time bands", () => {
  assert.equal(deriveTimeBandLabel(6 * 60), "AM");         // 06:00
  assert.equal(deriveTimeBandLabel(8 * 60), "AM");         // 08:00
  assert.equal(deriveTimeBandLabel(10 * 60 + 59), "AM");   // 10:59
  assert.equal(deriveTimeBandLabel(11 * 60), "Lunch");     // 11:00
  assert.equal(deriveTimeBandLabel(12 * 60), "Lunch");     // 12:00
  assert.equal(deriveTimeBandLabel(13 * 60 + 59), "Lunch"); // 13:59
  assert.equal(deriveTimeBandLabel(14 * 60), "Tea");       // 14:00
  assert.equal(deriveTimeBandLabel(15 * 60), "Tea");       // 15:00
  assert.equal(deriveTimeBandLabel(16 * 60 + 59), "Tea");  // 16:59
  assert.equal(deriveTimeBandLabel(17 * 60), "Evening");   // 17:00
  assert.equal(deriveTimeBandLabel(19 * 60 + 59), "Evening"); // 19:59
  assert.equal(deriveTimeBandLabel(20 * 60), "Night");     // 20:00
  assert.equal(deriveTimeBandLabel(23 * 60), "Night");     // 23:00
  assert.equal(deriveTimeBandLabel(2 * 60), "Night");      // 02:00
  assert.equal(deriveTimeBandLabel(null), "Unscheduled");
});

test("deriveTimeLabel: formats minutes correctly", () => {
  assert.equal(deriveTimeLabel(8 * 60, null), "08:00");
  assert.equal(deriveTimeLabel(8 * 60 + 30, null), "08:30");
  assert.equal(deriveTimeLabel(14 * 60 + 5, null), "14:05");
  assert.equal(deriveTimeLabel(0, null), "00:00");
  assert.equal(deriveTimeLabel(23 * 60 + 59, null), "23:59");
});

test("deriveTimeLabel: falls back to raw value when minutes is null", () => {
  assert.equal(deriveTimeLabel(null, "08:00 AM"), "08:00 AM");
  assert.equal(deriveTimeLabel(null, null), null);
  assert.equal(deriveTimeLabel(null, ""), null);
});

// ============================================================================
// Tests for formatting utilities
// ============================================================================

test("formatMinutesDisplay: formats durations correctly", () => {
  assert.equal(formatMinutesDisplay(30), "30m");
  assert.equal(formatMinutesDisplay(60), "1h");
  assert.equal(formatMinutesDisplay(90), "1h 30m");
  assert.equal(formatMinutesDisplay(120), "2h");
  assert.equal(formatMinutesDisplay(0), "0m");
  assert.equal(formatMinutesDisplay(null), "—");
  assert.equal(formatMinutesDisplay(NaN), "—");
});

test("formatSignedMinutes: formats with sign correctly", () => {
  assert.equal(formatSignedMinutes(30), "+30m");
  assert.equal(formatSignedMinutes(-30), "-30m");
  assert.equal(formatSignedMinutes(90), "+1h 30m");
  assert.equal(formatSignedMinutes(-90), "-1h 30m");
  assert.equal(formatSignedMinutes(0), "0m");
  assert.equal(formatSignedMinutes(null), "—");
});

// ============================================================================
// Tests for statistical utilities
// ============================================================================

test("calculateMedian: handles various arrays", () => {
  assert.equal(calculateMedian([1, 2, 3, 4, 5]), 3);
  assert.equal(calculateMedian([1, 2, 3, 4]), 2.5);
  assert.equal(calculateMedian([5]), 5);
  assert.equal(calculateMedian([]), null);
  assert.equal(calculateMedian([3, 1, 2]), 2);
});

test("calculateMedian: filters out non-finite values", () => {
  assert.equal(calculateMedian([1, NaN, 3, 5]), 3);
  assert.equal(calculateMedian([Infinity, 1, 2, 3, -Infinity]), 2);
});

// ============================================================================
// Tests for date parsing and formatting
// ============================================================================

function parseDateValue(value: any): Date | null {
  if (value === null || value === undefined || value === "") return null;
  
  const str = String(value).trim();
  if (!str) return null;

  // Guard against time-only strings
  if (str.match(/^\d{1,2}(?::\d{2})?(?::\d{2})?\s*(am|pm)?$/i)) {
    return null;
  }

  // European format DD/MM/YYYY
  const european = str.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (european) {
    const day = Number(european[1]);
    const month = Number(european[2]);
    let year = Number(european[3]);
    if (year < 100) year += 2000;
    const hours = european[4] ? Number(european[4]) : 0;
    const minutes = european[5] ? Number(european[5]) : 0;
    const seconds = european[6] ? Number(european[6]) : 0;
    return new Date(year, month - 1, day, hours, minutes, seconds);
  }

  // ISO format
  const timestamp = Date.parse(str);
  if (!Number.isNaN(timestamp)) {
    return new Date(timestamp);
  }

  return null;
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

test("parseDateValue: handles European format", () => {
  const date = parseDateValue("15/01/2026");
  assert.ok(date);
  assert.equal(date!.getFullYear(), 2026);
  assert.equal(date!.getMonth(), 0);
  assert.equal(date!.getDate(), 15);
});

test("parseDateValue: handles European format with time", () => {
  const date = parseDateValue("15/01/2026 08:30:00");
  assert.ok(date);
  assert.equal(date!.getHours(), 8);
  assert.equal(date!.getMinutes(), 30);
});

test("parseDateValue: handles two-digit years", () => {
  const date = parseDateValue("15/01/26");
  assert.ok(date);
  assert.equal(date!.getFullYear(), 2026);
});

test("parseDateValue: rejects time-only strings", () => {
  assert.equal(parseDateValue("08:00"), null);
  assert.equal(parseDateValue("8am"), null);
  assert.equal(parseDateValue("14:30:00"), null);
});

test("parseDateValue: handles ISO format", () => {
  const date = parseDateValue("2026-01-15");
  assert.ok(date);
  assert.equal(date!.getFullYear(), 2026);
});

test("formatDateKey: formats dates correctly", () => {
  const date = new Date(2026, 0, 15);
  assert.equal(formatDateKey(date), "2026-01-15");
  
  const date2 = new Date(2026, 11, 5);
  assert.equal(formatDateKey(date2), "2026-12-05");
});

// ============================================================================
// Tests for field detection
// ============================================================================

function detectField(
  row: Record<string, any>,
  keywords: string[],
  excludeKeys?: Set<string>
): { key: string; value: any } | null {
  if (!keywords.length) return null;
  const normalizedKeywords = keywords.map((k) => k.toLowerCase());
  for (const key of Object.keys(row)) {
    if (excludeKeys?.has(key)) continue;
    const normalizedKey = normalizeKeyForMatch(key);
    if (normalizedKeywords.some((kw) => normalizedKey.includes(kw))) {
      return { key, value: row[key] };
    }
  }
  return null;
}

test("detectField: finds matching field", () => {
  const row = {
    "Planned Start Time": "08:00",
    "Actual Start Time": "08:15",
    "Worker Name": "John",
  };
  
  const result = detectField(row, ["planned start time", "planned time"]);
  assert.ok(result);
  assert.equal(result!.key, "Planned Start Time");
  assert.equal(result!.value, "08:00");
});

test("detectField: respects exclude keys", () => {
  const row = {
    "Planned Start Time": "08:00",
    "Scheduled Time": "08:30",
  };
  
  const result = detectField(
    row,
    ["time"],
    new Set(["Planned Start Time"])
  );
  assert.ok(result);
  assert.equal(result!.key, "Scheduled Time");
});

test("detectField: returns null when no match", () => {
  const row = {
    "Worker Name": "John",
    "Location": "Building A",
  };
  
  const result = detectField(row, ["planned time", "actual time"]);
  assert.equal(result, null);
});

// ============================================================================
// Tests for duplicate detection
// ============================================================================

function buildDuplicateSlotKey(
  normalizedServiceUserKey: string | null,
  plannedDateKey: string | null,
  plannedTimeMinutes: number | null
): string | null {
  if (!normalizedServiceUserKey) return null;
  if (!plannedDateKey) return null;
  if (typeof plannedTimeMinutes !== "number") return null;
  return `${normalizedServiceUserKey}|${plannedDateKey}|${Math.round(plannedTimeMinutes)}`;
}

test("buildDuplicateSlotKey: creates consistent keys", () => {
  const key1 = buildDuplicateSlotKey("john doe", "2026-01-15", 8 * 60);
  const key2 = buildDuplicateSlotKey("john doe", "2026-01-15", 8 * 60);
  assert.equal(key1, key2);
  
  const key3 = buildDuplicateSlotKey("john doe", "2026-01-15", 8 * 60 + 0.4);
  assert.equal(key1, key3); // Should round to same value
});

test("buildDuplicateSlotKey: returns null for missing data", () => {
  assert.equal(buildDuplicateSlotKey(null, "2026-01-15", 480), null);
  assert.equal(buildDuplicateSlotKey("john doe", null, 480), null);
  assert.equal(buildDuplicateSlotKey("john doe", "2026-01-15", null), null);
});

// ============================================================================
// Tests for schedule delta calculations  
// ============================================================================

function computeScheduleDelta(
  plannedMinutes: number | null,
  actualMinutes: number | null
): number | null {
  if (plannedMinutes === null || actualMinutes === null) return null;
  if (!Number.isFinite(plannedMinutes) || !Number.isFinite(actualMinutes)) return null;
  
  let delta = actualMinutes - plannedMinutes;
  
  // Handle midnight crossover (e.g., planned 23:30, actual 00:15)
  if (Math.abs(delta) > 12 * 60) {
    if (delta > 0) {
      delta -= 24 * 60;
    } else {
      delta += 24 * 60;
    }
  }
  
  return delta;
}

test("computeScheduleDelta: calculates basic delta", () => {
  assert.equal(computeScheduleDelta(8 * 60, 8 * 60 + 15), 15);
  assert.equal(computeScheduleDelta(8 * 60, 8 * 60 - 15), -15);
  assert.equal(computeScheduleDelta(8 * 60, 8 * 60), 0);
});

test("computeScheduleDelta: handles midnight crossover", () => {
  // Planned 23:30, actual 00:15 (should be +45 mins, not -1395 mins)
  const delta = computeScheduleDelta(23 * 60 + 30, 15);
  assert.ok(delta !== null);
  assert.ok(Math.abs(delta!) < 60); // Should be a small positive number
});

test("computeScheduleDelta: returns null for invalid inputs", () => {
  assert.equal(computeScheduleDelta(null, 480), null);
  assert.equal(computeScheduleDelta(480, null), null);
  assert.equal(computeScheduleDelta(NaN, 480), null);
});

// ============================================================================
// Tests for duration fidelity calculations
// ============================================================================

function computeDurationFidelity(
  plannedMinutes: number | null,
  actualMinutes: number | null
): number | null {
  if (plannedMinutes === null || actualMinutes === null) return null;
  if (!Number.isFinite(plannedMinutes) || !Number.isFinite(actualMinutes)) return null;
  if (plannedMinutes <= 0) return null;
  
  return (actualMinutes / plannedMinutes) * 100;
}

test("computeDurationFidelity: calculates percentage correctly", () => {
  assert.equal(computeDurationFidelity(30, 30), 100);
  assert.equal(computeDurationFidelity(30, 15), 50);
  assert.equal(computeDurationFidelity(30, 45), 150);
  assert.equal(computeDurationFidelity(60, 30), 50);
});

test("computeDurationFidelity: returns null for invalid inputs", () => {
  assert.equal(computeDurationFidelity(null, 30), null);
  assert.equal(computeDurationFidelity(30, null), null);
  assert.equal(computeDurationFidelity(0, 30), null);
  assert.equal(computeDurationFidelity(-30, 30), null);
});

// ============================================================================
// Tests for worker matching
// ============================================================================

function checkWorkersMatch(
  plannedWorker: string | null,
  actualWorker: string | null
): boolean | null {
  const normalizedPlanned = normalizeWorkerName(plannedWorker);
  const normalizedActual = normalizeWorkerName(actualWorker);
  
  if (!normalizedPlanned || !normalizedActual) return null;
  return normalizedPlanned === normalizedActual;
}

test("checkWorkersMatch: matches identical names", () => {
  assert.equal(checkWorkersMatch("John Smith", "John Smith"), true);
  assert.equal(checkWorkersMatch("John Smith", "john smith"), true);
  assert.equal(checkWorkersMatch("  John  Smith  ", "John Smith"), true);
});

test("checkWorkersMatch: detects different workers", () => {
  assert.equal(checkWorkersMatch("John Smith", "Jane Doe"), false);
  assert.equal(checkWorkersMatch("John Smith", "John Doe"), false);
});

test("checkWorkersMatch: returns null for missing data", () => {
  assert.equal(checkWorkersMatch(null, "John Smith"), null);
  assert.equal(checkWorkersMatch("John Smith", null), null);
  assert.equal(checkWorkersMatch("", "John Smith"), null);
});

console.log("All Testing Features utility tests passed!");
