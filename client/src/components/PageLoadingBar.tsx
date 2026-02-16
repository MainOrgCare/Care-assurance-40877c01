import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

/**
 * A thin progress bar at the top of the viewport that animates on route changes,
 * similar to NProgress / YouTube's loading bar. Provides visual feedback during
 * Suspense-based lazy-load transitions.
 */
export function PageLoadingBar() {
  const [location] = useLocation();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevLocation = useRef(location);

  useEffect(() => {
    if (location === prevLocation.current) return;
    prevLocation.current = location;

    // Clear any pending timers
    if (timerRef.current) clearInterval(timerRef.current);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);

    // Start progress animation
    setProgress(15);
    setVisible(true);

    // Incrementally advance the bar (slowing down as it approaches 90%)
    timerRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) {
          if (timerRef.current) clearInterval(timerRef.current);
          return prev;
        }
        // Slow down as we get higher
        const increment = prev < 50 ? 8 : prev < 70 ? 4 : 2;
        return Math.min(prev + increment, 90);
      });
    }, 200);

    // Complete and hide after a brief delay (content should be loaded by then)
    hideTimerRef.current = setTimeout(() => {
      if (timerRef.current) clearInterval(timerRef.current);
      setProgress(100);
      setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 300);
    }, 600);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [location]);

  if (!visible && progress === 0) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] h-[2px] pointer-events-none"
      role="progressbar"
      aria-valuenow={progress}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Page loading"
    >
      <div
        className={cn(
          "h-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.4)] transition-all ease-out",
          progress === 100 ? "duration-200 opacity-0" : "duration-300 opacity-100"
        )}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
