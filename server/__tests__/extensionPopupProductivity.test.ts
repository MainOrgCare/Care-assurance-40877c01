import test from "node:test";
import assert from "node:assert/strict";

// Pure helpers from the extension popup's productivity modules. CHANGELOG.md
// describes all of these as "self-contained, unit-tested modules" and each file
// documents its pure helpers as testable under Node, but no tests existed. This
// suite provides that missing coverage.
import {
  DEFAULT_METRICS,
  normalizeMetrics,
  applyMetricEvent,
  formatMinutes,
  computeMetricsView,
  MINUTES_PER_FORM,
  MINUTES_PER_SIGNATURE,
  MINUTES_PER_DOCUMENT,
} from "../../extension/edge-acp-autofill/popup/metrics.js";
import {
  fuzzyScore,
  rankCommands,
  optionDomId,
} from "../../extension/edge-acp-autofill/popup/commandPalette.js";
import {
  filterActivityEntries,
  buildActivityCsv,
  createActivityController,
} from "../../extension/edge-acp-autofill/popup/activityTools.js";
import {
  BACKUP_APP_ID,
  BACKUP_KIND,
  buildSettingsExport,
  parseSettingsImport,
  settingsToStoragePatch,
} from "../../extension/edge-acp-autofill/popup/backup.js";
import { STORAGE_KEYS } from "../../extension/edge-acp-autofill/popup/state.js";

// ── metrics.js ──────────────────────────────────────────────────────────────

test("normalizeMetrics coerces malformed blobs to a clean shape", () => {
  assert.deepEqual(normalizeMetrics(null), { ...DEFAULT_METRICS });
  const cleaned = normalizeMetrics({ autofillsCompleted: "3", formsFilled: -2, junk: 9 });
  assert.equal(cleaned.autofillsCompleted, 3);
  assert.equal(cleaned.formsFilled, 0); // negatives floored to 0
  assert.equal(cleaned.sessions, 0);
});

test("applyMetricEvent is pure and updates the right counters", () => {
  const next = applyMetricEvent(DEFAULT_METRICS, "autofillBatchComplete", { forms: 3 });
  assert.equal(next.autofillsCompleted, 1);
  assert.equal(next.formsFilled, 3);
  assert.ok(next.firstSeenAt);
  assert.ok(next.lastActivityAt);
  // original (frozen default) is untouched
  assert.equal(DEFAULT_METRICS.autofillsCompleted, 0);
  assert.equal(DEFAULT_METRICS.formsFilled, 0);

  assert.equal(applyMetricEvent(DEFAULT_METRICS, "autofillBatchComplete").formsFilled, 1);
  assert.equal(applyMetricEvent(DEFAULT_METRICS, "signatureApplied").signaturesApplied, 1);
  assert.equal(applyMetricEvent(DEFAULT_METRICS, "documentsStaged", { documents: 2 }).documentsStaged, 2);
  assert.equal(applyMetricEvent(DEFAULT_METRICS, "documentsStaged").documentsStaged, 1);
  assert.equal(applyMetricEvent(DEFAULT_METRICS, "sessionStarted").sessions, 1);
});

test("applyMetricEvent treats unknown events as a no-op", () => {
  const next = applyMetricEvent(DEFAULT_METRICS, "nonsense");
  assert.equal(next.autofillsCompleted, 0);
  assert.equal(next.firstSeenAt, null);
  assert.equal(next.lastActivityAt, null);
});

test("formatMinutes renders compact human strings", () => {
  assert.equal(formatMinutes(0), "0m");
  assert.equal(formatMinutes(45), "45m");
  assert.equal(formatMinutes(60), "1h");
  assert.equal(formatMinutes(72), "1h 12m");
  assert.equal(formatMinutes(125), "2h 5m");
  assert.equal(formatMinutes(-10), "0m");
});

test("computeMetricsView derives time-saved and emptiness", () => {
  const empty = computeMetricsView(DEFAULT_METRICS);
  assert.equal(empty.isEmpty, true);
  assert.equal(empty.minutesSaved, 0);
  assert.equal(empty.timeSavedLabel, "0m");

  const view = computeMetricsView({
    formsFilled: 2,
    signaturesApplied: 3,
    documentsStaged: 1,
  });
  const expected = 2 * MINUTES_PER_FORM + 3 * MINUTES_PER_SIGNATURE + 1 * MINUTES_PER_DOCUMENT;
  assert.equal(view.minutesSaved, expected);
  assert.equal(view.timeSavedLabel, formatMinutes(expected));
  assert.equal(view.isEmpty, false);
});

// ── commandPalette.js ────────────────────────────────────────────────────────

test("fuzzyScore returns null for non-subsequences and 0 for an empty query", () => {
  assert.equal(fuzzyScore("", "anything"), 0);
  assert.equal(fuzzyScore("abc", ""), null);
  assert.equal(fuzzyScore("xyz", "abc"), null);
  assert.equal(typeof fuzzyScore("ap", "Autofill payload"), "number");
});

test("fuzzyScore rewards word-start matches over mid-word matches", () => {
  const wordStart = fuzzyScore("ca", "care assurance");
  const midWord = fuzzyScore("ca", "scalar");
  assert.ok(wordStart !== null && midWord !== null);
  assert.ok((wordStart as number) > (midWord as number));
});

test("rankCommands with an empty query returns enabled commands ordered by recency", () => {
  const commands = [
    { id: "a", title: "Alpha" },
    { id: "b", title: "Bravo" },
    { id: "c", title: "Charlie", enabled: false },
  ];
  const ranked = rankCommands(commands, "", ["b", "a"]);
  assert.deepEqual(ranked.map((c) => c.id), ["b", "a"]);
  // disabled commands are excluded entirely when there is no query
  assert.ok(!ranked.some((c) => c.id === "c"));
});

test("rankCommands matches title and keywords, ranking enabled above disabled", () => {
  const commands = [
    { id: "start", title: "Start Autofill", keywords: ["begin", "go"] },
    { id: "stop", title: "Stop Autofill", enabled: false },
    { id: "copy", title: "Copy Payload" },
  ];
  // keyword match
  assert.deepEqual(rankCommands(commands, "begin").map((c) => c.id), ["start"]);
  // no match
  assert.deepEqual(rankCommands(commands, "zzzzz"), []);
  // both match "autofill" but the enabled one ranks first
  const autofill = rankCommands(commands, "autofill").map((c) => c.id);
  assert.deepEqual(autofill, ["start", "stop"]);
});

test("optionDomId yields stable, unique ids for aria-activedescendant", () => {
  assert.equal(optionDomId(0), "command-palette-option-0");
  assert.equal(optionDomId(5), "command-palette-option-5");
  assert.notEqual(optionDomId(1), optionDomId(2));
});

// ── activityTools.js ─────────────────────────────────────────────────────────

const ACTIVITY = [
  { type: "autofill", tone: "success", label: "Filled mobility", detail: "5 fields", at: "2026-01-01T10:00:00Z" },
  { type: "error", tone: "warning", label: "Sync failed", detail: "timeout", at: "2026-01-01T10:05:00Z" },
  { type: "info", tone: "normal", label: "Connected", detail: "server reachable", at: "2026-01-01T10:10:00Z" },
];

test("filterActivityEntries filters by tone with warn/warning aliasing", () => {
  const warns = filterActivityEntries(ACTIVITY, { tone: "warning" });
  assert.deepEqual(warns.map((e) => e.label), ["Sync failed"]);
  // "warn" and "warning" are aliases
  assert.deepEqual(filterActivityEntries(ACTIVITY, { tone: "warn" }).map((e) => e.label), ["Sync failed"]);
  assert.equal(filterActivityEntries(ACTIVITY, { tone: "all" }).length, 3);
});

test("filterActivityEntries filters by case-insensitive free text and preserves order", () => {
  const result = filterActivityEntries(ACTIVITY, { query: "SYNC" });
  assert.deepEqual(result.map((e) => e.label), ["Sync failed"]);
  // "E" appears in all three (success / failed / Connected) — original order kept
  const multi = filterActivityEntries(ACTIVITY, { query: "E" });
  assert.deepEqual(multi.map((e) => e.label), ["Filled mobility", "Sync failed", "Connected"]);
});

test("filterActivityEntries drops falsy entries and handles non-arrays", () => {
  assert.deepEqual(filterActivityEntries([null, undefined] as unknown[], {}), []);
  assert.deepEqual(filterActivityEntries("nope" as unknown as unknown[], {}), []);
});

test("buildActivityCsv emits an RFC4180 header and escapes special chars", () => {
  assert.equal(buildActivityCsv([]), "timestamp,type,tone,label,detail");
  const csv = buildActivityCsv([
    { at: "t1", type: "x", tone: "success", label: "has,comma", detail: 'quote " and\nnewline' },
  ]);
  const lines = csv.split("\r\n");
  assert.equal(lines[0], "timestamp,type,tone,label,detail");
  assert.equal(lines[1], 't1,x,success,"has,comma","quote "" and\nnewline"');
});

test("createActivityController re-renders filtered views on state change", () => {
  const renders: unknown[][] = [];
  const controller = createActivityController({ render: (entries: unknown[]) => renders.push(entries) });

  controller.setEntries(ACTIVITY);
  // inactive filter renders the full set
  assert.equal((renders.at(-1) as unknown[]).length, 3);

  controller.setFilter({ tone: "warning" });
  assert.deepEqual((renders.at(-1) as Array<{ label: string }>).map((e) => e.label), ["Sync failed"]);
  assert.deepEqual(controller.getFiltered().map((e) => e.label), ["Sync failed"]);
  assert.deepEqual(controller.getFilter(), { query: "", tone: "warning" });
});

// ── backup.js ────────────────────────────────────────────────────────────────

test("buildSettingsExport only keeps whitelisted, valid fields", () => {
  const envelope = buildSettingsExport(
    {
      dryRun: true,
      autoSubmit: "nope", // invalid (not boolean) -> dropped
      interactionMode: "fast",
      appTheme: "neon", // invalid theme -> dropped
      serverUrl: "https://care-assurance.example",
      paletteRecent: ["load-care-plan"],
      secretToken: "should-never-appear", // not whitelisted -> dropped
    },
    { now: "2026-01-01T00:00:00Z", version: "0.9.1" },
  );

  assert.equal(envelope.app, BACKUP_APP_ID);
  assert.equal(envelope.kind, BACKUP_KIND);
  assert.equal(envelope.exportedAt, "2026-01-01T00:00:00Z");
  assert.equal(envelope.extensionVersion, "0.9.1");
  assert.deepEqual(envelope.settings, {
    dryRun: true,
    interactionMode: "fast",
    serverUrl: "https://care-assurance.example",
    paletteRecent: ["load-care-plan"],
  });
  assert.ok(!("secretToken" in envelope.settings));
  assert.ok(!("autoSubmit" in envelope.settings));
  assert.ok(!("appTheme" in envelope.settings));
});

test("parseSettingsImport rejects malformed and foreign files", () => {
  assert.equal(parseSettingsImport("{not json").ok, false);
  assert.equal(parseSettingsImport(JSON.stringify({ app: "other", kind: "x" })).ok, false);
  assert.equal(
    parseSettingsImport(JSON.stringify({ app: BACKUP_APP_ID, kind: BACKUP_KIND, settings: {} })).ok,
    false,
  );
});

test("parseSettingsImport accepts a valid envelope and drops invalid fields", () => {
  const result = parseSettingsImport(
    JSON.stringify({
      app: BACKUP_APP_ID,
      kind: BACKUP_KIND,
      settings: { dryRun: true, interactionMode: "bogus", appTheme: "dark" },
    }),
  );
  assert.equal(result.ok, true);
  assert.equal(result.count, 2);
  assert.deepEqual(result.settings, { dryRun: true, appTheme: "dark" });
});

test("settingsToStoragePatch maps preference names onto storage keys", () => {
  const patch = settingsToStoragePatch({ dryRun: true, appTheme: "ocean" });
  assert.deepEqual(patch, {
    [STORAGE_KEYS.dryRun]: true,
    [STORAGE_KEYS.appTheme]: "ocean",
  });
});

test("settings survive an export -> import round trip", () => {
  const settings = { dryRun: false, autoSubmit: true, interactionMode: "realistic", appTheme: "midnight" };
  const envelope = buildSettingsExport(settings);
  const parsed = parseSettingsImport(JSON.stringify(envelope));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.settings, settings);
});
