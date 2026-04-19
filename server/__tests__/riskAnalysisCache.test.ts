import assert from "node:assert/strict";
import test from "node:test";

import { createRiskAnalysisCache } from "../services/riskAnalysisCache";

test("risk analysis cache returns hits before TTL and expires entries after TTL", () => {
  let now = 1000;
  const cache = createRiskAnalysisCache<{ value: string }>({
    ttlMs: 100,
    maxEntries: 5,
    now: () => now,
  });

  cache.set("alpha", { value: "cached" });
  assert.deepEqual(cache.get("alpha"), { value: "cached" });

  now = 1101;
  assert.equal(cache.get("alpha"), null);
  assert.equal(cache.size(), 0);
});

test("risk analysis cache evicts oldest entries beyond max size", () => {
  let now = 1;
  const cache = createRiskAnalysisCache<string>({
    ttlMs: 1000,
    maxEntries: 2,
    now: () => now,
  });

  cache.set("first", "one");
  now = 2;
  cache.set("second", "two");
  now = 3;
  cache.set("third", "three");

  assert.equal(cache.size(), 2);
  assert.equal(cache.get("first"), null);
  assert.equal(cache.get("second"), "two");
  assert.equal(cache.get("third"), "three");
});

test("risk analysis cache can be cleared explicitly", () => {
  const cache = createRiskAnalysisCache<number>({ ttlMs: 1000, maxEntries: 2, now: () => 1 });
  cache.set("x", 1);
  cache.set("y", 2);
  assert.equal(cache.size(), 2);
  cache.clear();
  assert.equal(cache.size(), 0);
  assert.equal(cache.get("x"), null);
});