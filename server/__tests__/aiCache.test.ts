import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  clearCache,
  generateCacheKey,
  getCachedResponse,
  getCacheStats,
  setCachedResponse,
} from "../services/aiCache.ts";

beforeEach(() => {
  clearCache();
});

test("generateCacheKey is stable and varies by model and feature", () => {
  const messages = [{ role: "user", content: "Assess mobility risk" }];

  const baseKey = generateCacheKey(messages, "gpt-4.1-mini", "risk_assessment");

  assert.equal(baseKey, generateCacheKey(messages, "gpt-4.1-mini", "risk_assessment"));
  assert.notEqual(baseKey, generateCacheKey(messages, "gpt-4.1", "risk_assessment"));
  assert.notEqual(baseKey, generateCacheKey(messages, "gpt-4.1-mini", "care_plan"));
  assert.equal(baseKey.length, 32);
});

test("cache returns stored entries and tracks hit and miss statistics", () => {
  const key = generateCacheKey([{ role: "user", content: "same prompt" }], "gpt-4.1-mini", "plan_enhancer");

  assert.equal(getCachedResponse(key), null);

  setCachedResponse(key, { result: "cached" }, "plan_enhancer", 321);

  const cached = getCachedResponse(key);
  assert.deepStrictEqual(cached?.result, { result: "cached" });

  const stats = getCacheStats();
  assert.equal(stats.hits, 1);
  assert.equal(stats.misses, 1);
  assert.equal(stats.tokensSaved, 321);
});

test("cache expires entries after the configured ttl", async () => {
  const key = generateCacheKey([{ role: "user", content: "short lived" }], "gpt-4.1-mini", "risk_assessment");
  setCachedResponse(key, { expired: true }, "risk_assessment", 12, 1);

  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(getCachedResponse(key), null);
});

test("cache evicts the least recently used entry when it reaches capacity", () => {
  const keys: string[] = [];

  for (let index = 0; index < 500; index += 1) {
    const key = `risk-cache-${index}`;
    keys.push(key);
    setCachedResponse(key, { index }, "risk_assessment", 1);
  }

  assert.equal(getCacheStats().size, 500);

  assert.ok(getCachedResponse(keys[0]));
  setCachedResponse("risk-cache-overflow", { overflow: true }, "risk_assessment", 1);

  assert.ok(getCachedResponse(keys[0]), "recently accessed entry should be retained");
  assert.equal(getCachedResponse(keys[1]), null, "least recently used entry should be evicted");
  assert.equal(getCacheStats().size, 500);
});