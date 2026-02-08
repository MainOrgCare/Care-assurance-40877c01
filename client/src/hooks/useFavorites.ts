import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "careassurance_favorite_pages";

let cachedFavorites: string[] = [];
const listeners = new Set<() => void>();

function loadFavorites(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as string[]) : [];
  } catch {
    return [];
  }
}

function saveFavorites(favorites: string[]) {
  cachedFavorites = favorites;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  } catch { /* quota exceeded — ignore */ }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot() {
  return cachedFavorites;
}

// Initialize
cachedFavorites = typeof window !== "undefined" ? loadFavorites() : [];

/**
 * Manages a list of favorite page paths (persisted to localStorage).
 */
export function useFavorites() {
  const favorites = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const toggleFavorite = useCallback((path: string) => {
    const current = loadFavorites();
    const next = current.includes(path)
      ? current.filter((p) => p !== path)
      : [...current, path];
    saveFavorites(next);
  }, []);

  const isFavorite = useCallback(
    (path: string) => favorites.includes(path),
    [favorites],
  );

  return { favorites, toggleFavorite, isFavorite };
}
