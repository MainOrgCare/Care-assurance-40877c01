/**
 * Billing & Date Helpers
 *
 * Pure utility functions used across billing, call reconciliation,
 * and scheduling routes.  Extracted from routes.ts to keep the
 * route file focused on HTTP handling.
 *
 * @module server/utils/billingHelpers
 */

// ── Day-of-week constants ────────────────────────────────────────────────
export const BILLING_DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type BillingDayKey = typeof BILLING_DAY_KEYS[number];
export type BillingDayCounts = Record<BillingDayKey, number>;

// ── Date helpers ─────────────────────────────────────────────────────────
export const normalizeDate = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const addDays = (date: Date, amount: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return normalizeDate(next);
};

export const differenceInDays = (start: Date, end: Date): number => {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((normalizeDate(end).getTime() - normalizeDate(start).getTime()) / msPerDay);
};

export const startOfWeekMonday = (date: Date): Date => {
  const day = date.getDay();
  const diff = (day + 6) % 7;
  return addDays(normalizeDate(date), -diff);
};

export const parseDateInput = (value?: string | null): Date | null => {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return normalizeDate(date);
    }
    return null;
  }

  const match = trimmed.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += 2000;

  const date = new Date(year, month - 1, day);
  if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
    return normalizeDate(date);
  }
  return null;
};

export const formatDate = (date: Date): string => {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${day}/${month}/${year}`;
};

export const parseInteger = (value: any): number => {
  if (value === null || value === undefined) return 0;
  const match = String(value).match(/-?\d+/);
  if (!match) return 0;
  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

// ── Time helpers ─────────────────────────────────────────────────────────
export const normalizeTime = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = String(value).trim();
  const match = trimmed.match(/(\d{1,2})[:.](\d{2})(?:\s*(am|pm))?/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const mins = Number(match[2]);
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === "pm" && hours !== 12) hours += 12;
  else if (meridiem === "am" && hours === 12) hours = 0;
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null;
  if (hours < 0 || hours > 23 || mins < 0 || mins > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};

export const parseTimeToMinutes = (value?: string | null): number | null => {
  const normalized = normalizeTime(value);
  if (!normalized) return null;
  const [hours, mins] = normalized.split(":").map((v) => Number.parseInt(v, 10));
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null;
  return hours * 60 + mins;
};

export const parseDurationMinutes = (value?: string | null): number | null => {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const timeMatch = trimmed.match(/(\d{1,2})[:.](\d{2})/);
  if (timeMatch) {
    const hours = Number(timeMatch[1]);
    const mins = Number(timeMatch[2]);
    if (Number.isFinite(hours) && Number.isFinite(mins)) {
      return hours * 60 + mins;
    }
  }

  const hourMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*h/i);
  if (hourMatch) {
    const hours = Number(hourMatch[1]);
    if (Number.isFinite(hours)) return Math.round(hours * 60);
  }

  const minMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*m/i);
  if (minMatch) {
    const mins = Number(minMatch[1]);
    if (Number.isFinite(mins)) return Math.round(mins);
  }

  return null;
};

export const formatDurationFromMinutes = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};

// ── Billing-week helpers ─────────────────────────────────────────────────
export const getBillingDayIndex = (date: Date): number => (date.getDay() + 6) % 7;

export const getBillingDayKey = (date: Date): BillingDayKey => BILLING_DAY_KEYS[getBillingDayIndex(date)];

export const getWeekIndex = (start: Date, date: Date): number => {
  const startWeek = startOfWeekMonday(start);
  const dateWeek = startOfWeekMonday(date);
  const diffDays = differenceInDays(startWeek, dateWeek);
  return Math.floor(diffDays / 7);
};

// ── JSON extraction from AI model responses ──────────────────────────────
export const parseJsonFromModel = (content: string): any => {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const startCandidates = [candidate.indexOf("{"), candidate.indexOf("[")].filter((idx) => idx >= 0);
  const endIndex = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
  if (startCandidates.length === 0 || endIndex < 0) {
    throw new Error("Model response did not contain JSON");
  }
  const startIndex = Math.min(...startCandidates);
  const jsonText = candidate.slice(startIndex, endIndex + 1);
  try {
    return JSON.parse(jsonText);
  } catch (e: any) {
    // Attempt recovery: strip trailing commas before closing braces/brackets
    const cleaned = jsonText
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/'/g, '"');
    try {
      return JSON.parse(cleaned);
    } catch {
      throw new Error(`Failed to parse model JSON response: ${e.message}`);
    }
  }
};
