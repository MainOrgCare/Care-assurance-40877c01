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
  lastAccessed: number;
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
 * Get a cached response if available (LRU: updates last-accessed time)
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
  
  // LRU: update last-accessed timestamp
  entry.lastAccessed = Date.now();
  
  cacheHits++;
  tokensSavedTotal += entry.response.tokensSaved;
  console.log(`[AI Cache] HIT - Feature: ${entry.response.feature}, Saved: ${entry.response.tokensSaved} tokens`);
  
  return entry.response;
}

/**
 * Evict least-recently-used entry from cache
 */
function evictLRU(): void {
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  
  for (const [key, entry] of cache.entries()) {
    if (entry.lastAccessed < oldestTime) {
      oldestTime = entry.lastAccessed;
      oldestKey = key;
    }
  }
  
  if (oldestKey) {
    cache.delete(oldestKey);
    evictionCount++;
  }
}

/**
 * Store a response in the cache
 */
export function setCachedResponse(
  cacheKey: string,
  result: any,
  feature: string,
  tokensSaved: number,
  ttlMs: number = DEFAULT_TTL_MS
): void {
  // Enforce max size by evicting least-recently-used entry
  if (cache.size >= MAX_CACHE_SIZE) {
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
    lastAccessed: now,
  };
  
  cache.set(cacheKey, entry);
  console.log(`[AI Cache] STORED - Feature: ${feature}, Key: ${cacheKey.substring(0, 8)}...`);
}

/**
 * Clear expired entries from cache
 */
export function cleanCache(): void {
  const now = Date.now();
  let removed = 0;
  
  for (const [key, entry] of Array.from(cache.entries())) {
    if (now > entry.expiresAt) {
      cache.delete(key);
      removed++;
    }
  }
  
  if (removed > 0) {
    console.log(`[AI Cache] Cleaned ${removed} expired entries`);
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
 * Clear the entire cache
 */
export function clearCache(): void {
  cache.clear();
  evictionCount = 0;
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

// Clean cache every hour
setInterval(cleanCache, 60 * 60 * 1000);
