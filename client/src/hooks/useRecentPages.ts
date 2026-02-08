import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useLocation } from "wouter";

interface RecentPage {
  path: string;
  label: string;
  visitedAt: number;
}

const STORAGE_KEY = "careassurance_recent_pages";
const MAX_RECENT = 6;

/** Labels for known routes */
const ROUTE_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/messages": "Messages",
  "/email-assistant": "Email Assistant",
  "/compliance": "Compliance Hub",
  "/settings": "Settings",
  "/service-users/upload": "Data Upload",
  "/service-users/care-planning": "Care Planning",
  "/service-users/risk-assessment": "Risk Assessment",
  "/service-users/plan-enhancer": "Plan Enhancer",
  "/care-workers/list": "Carers",
  "/care-workers/emar-audit": "EMAR Audit",
  "/care-workers/visit-audit": "Visit Audit",
  "/care-workers/performance": "Performance",
  "/shadow-admin-portal": "Administrator Controls",
  "/roi-calculator": "Features & Benefits",
  "/testing-features": "Testing Features",
  "/system-logs": "System Logs",
  "/rostering-unified": "Rostering Studio",
  "/billing-tool": "Billing Tool",
  "/call-reconciliation": "Call Reconciliation",
};

// Simple in-memory store for SSR safety
let cachedRecent: RecentPage[] = [];
const listeners = new Set<() => void>();

function loadRecent(): RecentPage[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as RecentPage[]) : [];
  } catch {
    return [];
  }
}

function saveRecent(pages: RecentPage[]) {
  cachedRecent = pages;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
  } catch { /* quota exceeded — ignore */ }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot() {
  return cachedRecent;
}

// Initialize cache
cachedRecent = typeof window !== "undefined" ? loadRecent() : [];

/**
 * Tracks recently visited pages and persists to localStorage.
 * Returns the list of recent pages (most recent first).
 */
export function useRecentPages(): RecentPage[] {
  const [location] = useLocation();
  const lastTracked = useRef("");

  const recentPages = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const trackPage = useCallback((path: string) => {
    const label = ROUTE_LABELS[path];
    if (!label) return; // Skip unknown routes (login, terms, etc.)

    const existing = loadRecent();
    const filtered = existing.filter((p) => p.path !== path);
    const updated: RecentPage[] = [
      { path, label, visitedAt: Date.now() },
      ...filtered,
    ].slice(0, MAX_RECENT);

    saveRecent(updated);
  }, []);

  useEffect(() => {
    if (location !== lastTracked.current) {
      lastTracked.current = location;
      trackPage(location);
    }
  }, [location, trackPage]);

  return recentPages;
}
