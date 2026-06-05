/**
 * activityTools.js — Activity log search, filter & CSV export (v0.9.1)
 *
 * Pure helpers (filterActivityEntries, buildActivityCsv) have no DOM/chrome
 * dependency and are unit-tested directly. createActivityController wires a
 * small stateful filter on top of the existing renderActivityLog renderer so
 * the Logs tab can search and narrow activity without touching storage.
 */

const TONE_ALIASES = { warn: "warn", warning: "warn" };

/** Normalize a requested tone filter value. */
function normalizeTone(tone) {
  const t = String(tone || "all").toLowerCase();
  if (t === "all") return "all";
  return TONE_ALIASES[t] || t;
}

/**
 * Filter activity entries by free-text query and tone (pure).
 * @param {Array} entries activity entries [{ type, tone, label, detail, at }]
 * @param {{ query?: string, tone?: string }} [opts]
 * @returns {Array} filtered entries (original order preserved)
 */
export function filterActivityEntries(entries, opts = {}) {
  const list = Array.isArray(entries) ? entries : [];
  const query = String(opts.query || "").trim().toLowerCase();
  const tone = normalizeTone(opts.tone);

  return list.filter((entry) => {
    if (!entry) return false;
    if (tone !== "all") {
      const entryTone = normalizeTone(entry.tone || "normal");
      if (entryTone !== tone) return false;
    }
    if (query) {
      const haystack = [entry.label, entry.detail, entry.type, entry.tone]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

/** Escape one CSV field per RFC 4180. */
function csvField(value) {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Serialize activity entries to CSV (pure). Always emits a header row.
 * @param {Array} entries
 * @returns {string}
 */
export function buildActivityCsv(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const header = ["timestamp", "type", "tone", "label", "detail"];
  const rows = list.map((e) =>
    [e?.at || "", e?.type || "", e?.tone || "", e?.label || "", e?.detail || ""]
      .map(csvField)
      .join(",")
  );
  return [header.join(","), ...rows].join("\r\n");
}

/**
 * Build a stateful controller around an injected `render(entries)` function.
 * Holds the full entry set plus the active filter and re-renders the filtered
 * view whenever either changes.
 */
export function createActivityController({ render } = {}) {
  let entries = [];
  let filter = { query: "", tone: "all" };
  const doRender = typeof render === "function" ? render : () => {};

  function apply() {
    const isActive = Boolean(filter.query) || filter.tone !== "all";
    doRender(isActive ? filterActivityEntries(entries, filter) : entries);
  }

  return {
    setEntries(next) {
      entries = Array.isArray(next) ? next : [];
      apply();
    },
    setFilter(partial) {
      filter = { ...filter, ...(partial || {}) };
      apply();
    },
    getFilter() {
      return { ...filter };
    },
    getEntries() {
      return entries.slice();
    },
    getFiltered() {
      return filterActivityEntries(entries, filter);
    },
    refresh() {
      apply();
    },
  };
}
