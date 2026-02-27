# Improvement TODO

## Performance & Correctness Fixes

- [x] `server/services/aiCache.ts` — Replace O(n) LRU eviction with O(1) Map-insertion-order approach
- [x] `server/storage.ts` — Replace in-memory JS aggregation in `getAiUsageStats()` with SQL `GROUP BY`
- [x] `server/storage.ts` — Parallelise `getDashboardStats24h()` sequential queries with `Promise.all`
- [x] `client/src/hooks/useSessionTimer.ts` — Pause elapsed-time accumulation when tab is hidden (Page Visibility API)
- [x] `client/src/components/ErrorBoundary.tsx` — Fix pre-existing TS error: `componentStack` null → undefined coercion
