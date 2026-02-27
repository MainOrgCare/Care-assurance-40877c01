/**
 * AI Response Cache
 * Reduces AI API calls by caching responses for identical inputs.
 * Uses content hash-based keys with LRU eviction and configurable TTL.
 */

import crypto from "crypto";

export interface CachedAIResponse {
  result: any;
  timestamp: number;
  promptHash: string;
  feature: string;
  tokensSaved: number;
}

interface CacheEntry {
  response: CachedAIResponse;
  expiresAt: number;
  // lastAccessed removed — Map insertion order is used for O(1) LRU eviction
}

// Default TTL: 24 hours (responses are deterministic with temp=0)
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

// Maximum cache size to prevent memory issues
const MAX_CACHE_SIZE = 500;

// In-memory cache
const cache = new Map<string, CacheEntry>();

// Cache statistics
let cacheHits = 0;
let cacheMisses = 0;
let tokensSavedTotal = 0;
let evictionCount = 0;

/**
 * Generate a hash key for the AI request
 * Combines the prompt content + model for uniqueness
 */
export function generateCacheKey(
  messages: Array<{ role: string; content: string }>,
  model: string,
  feature: string
): string {
  const content = JSON.stringify({ messages, model, feature });
  return crypto.createHash("sha256").update(content).digest("hex").substring(0, 32);
}

/**
 * Get a cached response if available.
 *
 * LRU promotion is O(1): we delete the entry and re-insert it so it moves
 * to the tail of the Map's insertion-order sequence.
 */
export function getCachedResponse(cacheKey: string): CachedAIResponse | null {
  const entry = cache.get(cacheKey);

  if (!entry) {
    cacheMisses++;
    return null;
  }

  // Check expiration
  if (Date.now() > entry.expiresAt) {
    cache.delete(cacheKey);
    cacheMisses++;
    return null;
  }

  // LRU promotion: move to tail (most-recently-used) in O(1)
  cache.delete(cacheKey);
  cache.set(cacheKey, entry);

  cacheHits++;
  tokensSavedTotal += entry.response.tokensSaved;
  console.log(`[AI Cache] HIT - Feature: ${entry.response.feature}, Saved: ${entry.response.tokensSaved} tokens`);

  return entry.response;
}

/**
 * Evict the least-recently-used entry from cache.
 *
 * Because Map preserves insertion order and we re-insert on every access,
 * the first key in the Map is always the LRU entry — O(1) eviction.
 */
function evictLRU(): void {
  const firstKey = cache.keys().next().value as string | undefined;
  if (firstKey !== undefined) {
    cache.delete(firstKey);
    evictionCount++;
  }
}

/**
 * Store a response in the cache.
 *
 * If the key already exists it is deleted first so the new entry lands at
 * the tail (most-recently-used position).
 */
export function setCachedResponse(
  cacheKey: string,
  result: any,
  feature: string,
  tokensSaved: number,
  ttlMs: number = DEFAULT_TTL_MS
): void {
  // Remove existing entry so it is re-inserted at the tail
  if (cache.has(cacheKey)) {
    cache.delete(cacheKey);
  } else if (cache.size >= MAX_CACHE_SIZE) {
    // Only evict when adding a genuinely new key
    evictLRU();
  }

  const now = Date.now();
  const entry: CacheEntry = {
    response: {
      result,
      timestamp: now,
      promptHash: cacheKey,
      feature,
      tokensSaved,
    },
    expiresAt: now + ttlMs,
  };

  cache.set(cacheKey, entry);
  console.log(`[AI Cache] STORED - Feature: ${feature}, Key: ${cacheKey.substring(0, 8)}...`);
}

/**
 * Clear expired entries from cache
 */
export function cleanCache(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];

  for (const [key, entry] of cache) {
    if (now > entry.expiresAt) {
      keysToDelete.push(key);
    }
  }

  for (const key of keysToDelete) {
    cache.delete(key);
  }

  if (keysToDelete.length > 0) {
    console.log(`[AI Cache] Cleaned ${keysToDelete.length} expired entries`);
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  const totalRequests = cacheHits + cacheMisses;
  return {
    size: cache.size,
    maxSize: MAX_CACHE_SIZE,
    hits: cacheHits,
    misses: cacheMisses,
    hitRate: totalRequests > 0 
      ? ((cacheHits / totalRequests) * 100).toFixed(1) + "%"
      : "N/A",
    tokensSaved: tokensSavedTotal,
    evictions: evictionCount,
    // Estimate based on blended rate: ~60% input ($0.40/1M) + ~40% output ($1.60/1M) for gpt-4.1-mini
    estimatedCostSaved: `$${((tokensSavedTotal / 1_000_000) * 0.88).toFixed(4)}`,
  };
}

/**
 * Clear the entire cache and reset all statistics
 */
export function clearCache(): void {
  cache.clear();
  resetStats();
  console.log("[AI Cache] Cache cleared");
}

/**
 * Reset cache statistics (for monitoring)
 */
export function resetStats(): void {
  cacheHits = 0;
  cacheMisses = 0;
  tokensSavedTotal = 0;
  evictionCount = 0;
}

// Clean cache every hour. Use unref() so this timer does not prevent
// the Node.js process from exiting cleanly (e.g. in tests or shutdown).
const _cacheCleanupTimer = setInterval(cleanCache, 60 * 60 * 1000);
_cacheCleanupTimer.unref();
