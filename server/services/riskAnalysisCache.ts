export const DEFAULT_RISK_ANALYSIS_CACHE_TTL_MS = 10 * 60 * 1000;
export const DEFAULT_MAX_RISK_ANALYSIS_CACHE_ENTRIES = 40;

type RiskAnalysisCacheEntry<T> = {
  payload: T;
  createdAt: number;
};

export function createRiskAnalysisCache<T = unknown>(options?: {
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
}) {
  const ttlMs = options?.ttlMs ?? DEFAULT_RISK_ANALYSIS_CACHE_TTL_MS;
  const maxEntries = options?.maxEntries ?? DEFAULT_MAX_RISK_ANALYSIS_CACHE_ENTRIES;
  const now = options?.now ?? (() => Date.now());
  const cache = new Map<string, RiskAnalysisCacheEntry<T>>();

  return {
    get(key: string): T | null {
      const entry = cache.get(key);
      if (!entry) return null;
      if (now() - entry.createdAt > ttlMs) {
        cache.delete(key);
        return null;
      }
      return entry.payload;
    },

    set(key: string, payload: T) {
      cache.set(key, { payload, createdAt: now() });
      if (cache.size <= maxEntries) return;

      const entries = Array.from(cache.entries()).sort((a, b) => a[1].createdAt - b[1].createdAt);
      const overflow = entries.length - maxEntries;
      for (let index = 0; index < overflow; index += 1) {
        cache.delete(entries[index][0]);
      }
    },

    clear() {
      cache.clear();
    },

    size() {
      return cache.size;
    },
  };
}

const riskAnalysisCache = createRiskAnalysisCache();

export const getRiskAnalysisCache = (key: string) => riskAnalysisCache.get(key);
export const setRiskAnalysisCache = (key: string, payload: unknown) => riskAnalysisCache.set(key, payload);
export const clearRiskAnalysisCache = () => riskAnalysisCache.clear();