/**
 * AI Response Cache
 * Reduces AI API calls by caching responses for identical inputs.
 * Uses content hash-based keys with configurable TTL.
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
 * Get a cached response if available
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
  
  cacheHits++;
  tokensSavedTotal += entry.response.tokensSaved;
  console.log(`[AI Cache] HIT - Feature: ${entry.response.feature}, Saved: ${entry.response.tokensSaved} tokens`);
  
  return entry.response;
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
  // Enforce max size by removing oldest entries
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  
  const entry: CacheEntry = {
    response: {
      result,
      timestamp: Date.now(),
      promptHash: cacheKey,
      feature,
      tokensSaved,
    },
    expiresAt: Date.now() + ttlMs,
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
  return {
    size: cache.size,
    hits: cacheHits,
    misses: cacheMisses,
    hitRate: cacheHits + cacheMisses > 0 
      ? ((cacheHits / (cacheHits + cacheMisses)) * 100).toFixed(1) + "%"
      : "N/A",
    tokensSaved: tokensSavedTotal,
    estimatedCostSaved: `$${((tokensSavedTotal / 1000000) * 0.15).toFixed(4)}`, // Rough GPT-4o-mini rate
  };
}

/**
 * Clear the entire cache
 */
export function clearCache(): void {
  cache.clear();
  console.log("[AI Cache] Cache cleared");
}

/**
 * Reset cache statistics (for monitoring)
 */
export function resetStats(): void {
  cacheHits = 0;
  cacheMisses = 0;
  tokensSavedTotal = 0;
}

// Clean cache every hour
setInterval(cleanCache, 60 * 60 * 1000);
