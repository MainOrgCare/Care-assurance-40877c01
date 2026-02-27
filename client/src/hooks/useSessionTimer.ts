import { useEffect, useRef, useState } from "react";

/**
 * Tracks active (visible) elapsed time since the component mounted.
 *
 * - Returns a formatted string: "2h 14m", "45m", or "<1m".
 * - Pauses accumulation while the browser tab is hidden so the displayed
 *   time reflects actual active session time rather than wall-clock time.
 * - Uses the Page Visibility API where available; falls back to wall-clock
 *   time in environments that don't support it (e.g. SSR, older browsers).
 */
export function useSessionTimer() {
  // Total active milliseconds accumulated so far
  const accumulatedMs = useRef(0);
  // Timestamp when the tab last became visible (null = currently hidden)
  const visibleSince = useRef<number | null>(Date.now());

  const [elapsed, setElapsed] = useState("<1m");

  const formatElapsed = (totalMs: number): string => {
    const totalMinutes = Math.floor(totalMs / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m`;
    return "<1m";
  };

  const tick = () => {
    const now = Date.now();
    const sinceVisible = visibleSince.current !== null ? now - visibleSince.current : 0;
    setElapsed(formatElapsed(accumulatedMs.current + sinceVisible));
  };

  useEffect(() => {
    // Initialise visibility tracking
    if (typeof document !== "undefined" && document.hidden) {
      visibleSince.current = null;
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab became hidden — freeze the accumulator
        if (visibleSince.current !== null) {
          accumulatedMs.current += Date.now() - visibleSince.current;
          visibleSince.current = null;
        }
      } else {
        // Tab became visible — resume counting
        visibleSince.current = Date.now();
        tick();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Tick immediately, then every minute
    tick();
    const interval = setInterval(tick, 60_000);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return elapsed;
}
