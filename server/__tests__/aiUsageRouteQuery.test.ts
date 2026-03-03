import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAiUsageQueryOptionsFromQuery,
  parseDateParam,
  parsePositiveIntParam,
} from "../routes/aiUsage";

test("parsePositiveIntParam returns fallback for non-string/invalid/less-than-1 and parses valid numbers", () => {
  assert.equal(parsePositiveIntParam(undefined, 7), 7);
  assert.equal(parsePositiveIntParam(null, 7), 7);
  assert.equal(parsePositiveIntParam("", 7), 7);
  assert.equal(parsePositiveIntParam("abc", 7), 7);
  assert.equal(parsePositiveIntParam("0", 7), 7);
  assert.equal(parsePositiveIntParam("-10", 7), 7);

  assert.equal(parsePositiveIntParam("1", 7), 1);
  assert.equal(parsePositiveIntParam("42", 7), 42);
});

test("parseDateParam returns undefined for invalid/empty and Date for valid ISO input", () => {
  assert.equal(parseDateParam(undefined), undefined);
  assert.equal(parseDateParam(""), undefined);
  assert.equal(parseDateParam("   "), undefined);
  assert.equal(parseDateParam("not-a-date"), undefined);

  const parsed = parseDateParam("2026-03-03T12:34:56.000Z");
  assert.ok(parsed instanceof Date);
  assert.equal(parsed?.toISOString(), "2026-03-03T12:34:56.000Z");
});

test("buildAiUsageQueryOptionsFromQuery applies defaults", () => {
  const options = buildAiUsageQueryOptionsFromQuery({});

  assert.equal(options.page, 1);
  assert.equal(options.limit, 25);
  assert.equal(options.retryState, "all");
});

test("buildAiUsageQueryOptionsFromQuery clamps limit and maps only supported retryState values", () => {
  const withRetries = buildAiUsageQueryOptionsFromQuery({
    limit: "999",
    retryState: "with_retries",
  });
  assert.equal(withRetries.limit, 200);
  assert.equal(withRetries.retryState, "with_retries");

  const noRetries = buildAiUsageQueryOptionsFromQuery({
    retryState: "no_retries",
  });
  assert.equal(noRetries.retryState, "no_retries");

  const invalidRetryState = buildAiUsageQueryOptionsFromQuery({
    retryState: "other",
  });
  assert.equal(invalidRetryState.retryState, "all");
});

test("buildAiUsageQueryOptionsFromQuery maps optional string filters and date params", () => {
  const options = buildAiUsageQueryOptionsFromQuery({
    page: "3",
    limit: "50",
    search: "token overflow",
    user: "alice",
    endpoint: "/api/admin/ai-logs",
    provider: "openai",
    feature: "compliance-check",
    startDate: "2026-01-01T00:00:00.000Z",
    endDate: "2026-01-31T23:59:59.000Z",
  });

  assert.equal(options.page, 3);
  assert.equal(options.limit, 50);
  assert.equal(options.searchQuery, "token overflow");
  assert.equal(options.username, "alice");
  assert.equal(options.endpoint, "/api/admin/ai-logs");
  assert.equal(options.provider, "openai");
  assert.equal(options.featureName, "compliance-check");
  assert.equal(options.startDate?.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(options.endDate?.toISOString(), "2026-01-31T23:59:59.000Z");
});

test("buildAiUsageQueryOptionsFromQuery trims optional string values and drops empty strings", () => {
  const options = buildAiUsageQueryOptionsFromQuery({
    search: "  retry spike  ",
    user: "   ",
    endpoint: "  /api/prn  ",
    provider: "  local  ",
    feature: "   ",
  });

  assert.equal(options.searchQuery, "retry spike");
  assert.equal(options.username, undefined);
  assert.equal(options.endpoint, "/api/prn");
  assert.equal(options.provider, "local");
  assert.equal(options.featureName, undefined);
});

test("buildAiUsageQueryOptionsFromQuery normalizes inverted date ranges", () => {
  const options = buildAiUsageQueryOptionsFromQuery({
    startDate: "2026-03-31T23:59:59.000Z",
    endDate: "2026-03-01T00:00:00.000Z",
  });

  assert.equal(options.startDate?.toISOString(), "2026-03-01T00:00:00.000Z");
  assert.equal(options.endDate?.toISOString(), "2026-03-31T23:59:59.000Z");
});
