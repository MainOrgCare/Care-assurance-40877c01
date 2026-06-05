/**
 * metrics.js — Operator productivity metrics (v0.9.0)
 *
 * Tracks lifetime + per-session counters in chrome.storage.local under
 * STORAGE_KEYS.productivityMetrics and renders a compact dashboard card in the
 * Ops tab plus a header chip. All write sites funnel through recordMetric().
 *
 * Pure helpers (DEFAULT_METRICS, normalizeMetrics, applyMetricEvent,
 * computeMetricsView, formatMinutes) are exported with no DOM/chrome
 * dependency so they can be unit-tested directly under Node.
 */

import { STORAGE_KEYS, loadStorage, setStorage } from "./state.js";

// Rough manual-entry time displaced per artifact, used for the "time saved"
// headline. Deliberately conservative so the figure reads as credible.
export const MINUTES_PER_FORM = 12;
export const MINUTES_PER_SIGNATURE = 1;
export const MINUTES_PER_DOCUMENT = 4;

export const DEFAULT_METRICS = Object.freeze({
  version: 1,
  autofillsCompleted: 0,
  formsFilled: 0,
  signaturesApplied: 0,
  documentsStaged: 0,
  sessions: 0,
  firstSeenAt: null,
  lastActivityAt: null,
});

const COUNTER_KEYS = [
  "autofillsCompleted",
  "formsFilled",
  "signaturesApplied",
  "documentsStaged",
  "sessions",
];

/** Coerce any stored blob into a well-formed metrics object. */
export function normalizeMetrics(raw) {
  const base = { ...DEFAULT_METRICS };
  if (!raw || typeof raw !== "object") return base;
  for (const key of COUNTER_KEYS) {
    const value = Number(raw[key]);
    base[key] = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }
  base.firstSeenAt = typeof raw.firstSeenAt === "string" ? raw.firstSeenAt : base.firstSeenAt;
  base.lastActivityAt = typeof raw.lastActivityAt === "string" ? raw.lastActivityAt : base.lastActivityAt;
  return base;
}

/**
 * Apply a single metric event, returning a NEW metrics object (pure).
 * @param {object} metrics current normalized metrics
 * @param {string} event one of: autofillBatchComplete | signatureApplied |
 *   documentsStaged | sessionStarted
 * @param {object} [payload] optional { forms, documents, at }
 */
export function applyMetricEvent(metrics, event, payload = {}) {
  const next = normalizeMetrics(metrics);
  const at = typeof payload.at === "string" ? payload.at : new Date().toISOString();
  const forms = Number.isFinite(Number(payload.forms)) ? Math.max(0, Math.floor(Number(payload.forms))) : 0;
  const documents = Number.isFinite(Number(payload.documents)) ? Math.max(0, Math.floor(Number(payload.documents))) : 0;

  switch (event) {
    case "autofillBatchComplete":
      next.autofillsCompleted += 1;
      next.formsFilled += forms || 1;
      break;
    case "signatureApplied":
      next.signaturesApplied += 1;
      break;
    case "documentsStaged":
      next.documentsStaged += documents || 1;
      break;
    case "sessionStarted":
      next.sessions += 1;
      break;
    default:
      return next; // unknown event is a no-op
  }

  if (!next.firstSeenAt) next.firstSeenAt = at;
  next.lastActivityAt = at;
  return next;
}

/** Format a minute count into a short human string ("3h 12m", "45m", "0m"). */
export function formatMinutes(totalMinutes) {
  const minutes = Math.max(0, Math.round(Number(totalMinutes) || 0));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`;
}

/** Derive display values (estimated time saved, etc.) from metrics (pure). */
export function computeMetricsView(metrics) {
  const m = normalizeMetrics(metrics);
  const minutesSaved =
    m.formsFilled * MINUTES_PER_FORM +
    m.signaturesApplied * MINUTES_PER_SIGNATURE +
    m.documentsStaged * MINUTES_PER_DOCUMENT;
  return {
    autofillsCompleted: m.autofillsCompleted,
    formsFilled: m.formsFilled,
    signaturesApplied: m.signaturesApplied,
    documentsStaged: m.documentsStaged,
    sessions: m.sessions,
    minutesSaved,
    timeSavedLabel: formatMinutes(minutesSaved),
    lastActivityAt: m.lastActivityAt,
    isEmpty:
      m.autofillsCompleted === 0 &&
      m.formsFilled === 0 &&
      m.signaturesApplied === 0 &&
      m.documentsStaged === 0,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Storage + DOM integration (guarded; safe to call without chrome present)
// ───────────────────────────────────────────────────────────────────────────

export async function loadMetrics() {
  try {
    const data = await loadStorage([STORAGE_KEYS.productivityMetrics]);
    return normalizeMetrics(data?.[STORAGE_KEYS.productivityMetrics]);
  } catch {
    return { ...DEFAULT_METRICS };
  }
}

/** Record a metric event to storage and refresh the card. Best-effort. */
export async function recordMetric(event, payload = {}) {
  try {
    const current = await loadMetrics();
    const next = applyMetricEvent(current, event, payload);
    await setStorage({ [STORAGE_KEYS.productivityMetrics]: next });
    renderMetricsCard(computeMetricsView(next));
    return next;
  } catch (error) {
    console.warn("[CA Extension] recordMetric failed:", error);
    return null;
  }
}

const METRIC_TILES = [
  { key: "timeSavedLabel", label: "Est. time saved", tone: "accent" },
  { key: "autofillsCompleted", label: "Autofills" },
  { key: "formsFilled", label: "Forms filled" },
  { key: "signaturesApplied", label: "Signatures" },
  { key: "documentsStaged", label: "Documents" },
  { key: "sessions", label: "Sessions" },
];

/** Render the metrics card + header chip from a computed view. */
export function renderMetricsCard(view) {
  if (typeof document === "undefined") return;
  const grid = document.getElementById("productivity-grid");
  if (grid) {
    grid.replaceChildren();
    for (const tile of METRIC_TILES) {
      const cell = document.createElement("div");
      cell.className = "productivity-tile";
      if (tile.tone) cell.dataset.tone = tile.tone;

      const value = document.createElement("strong");
      value.className = "productivity-value";
      value.textContent = String(view?.[tile.key] ?? 0);
      cell.appendChild(value);

      const label = document.createElement("span");
      label.className = "productivity-label";
      label.textContent = tile.label;
      cell.appendChild(label);

      grid.appendChild(cell);
    }
  }

  const summary = document.getElementById("productivity-summary");
  if (summary) {
    summary.textContent = view?.isEmpty
      ? "No activity recorded yet"
      : `${view.timeSavedLabel} saved`;
  }

  const chip = document.getElementById("productivity-chip");
  const chipValue = document.getElementById("productivity-chip-value");
  if (chip && chipValue) {
    chipValue.textContent = view?.timeSavedLabel ?? "0m";
    chip.hidden = Boolean(view?.isEmpty);
  }
}

export async function refreshMetricsCard() {
  const metrics = await loadMetrics();
  renderMetricsCard(computeMetricsView(metrics));
}

/** Reset all counters (wired to the card's Reset button). */
export async function resetMetrics() {
  try {
    await setStorage({ [STORAGE_KEYS.productivityMetrics]: { ...DEFAULT_METRICS } });
    renderMetricsCard(computeMetricsView(DEFAULT_METRICS));
  } catch (error) {
    console.warn("[CA Extension] resetMetrics failed:", error);
  }
}

/** Bootstrap: count the session, wire the reset button, render the card. */
export async function initMetrics() {
  try {
    const resetBtn = document.getElementById("productivity-reset");
    if (resetBtn && !resetBtn.dataset.bound) {
      resetBtn.dataset.bound = "1";
      resetBtn.addEventListener("click", () => { void resetMetrics(); });
    }
    await recordMetric("sessionStarted");
  } catch (error) {
    console.warn("[CA Extension] initMetrics failed:", error);
    void refreshMetricsCard();
  }
}
