import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

/**
 * Scrolls the nearest overflow container back to top on route changes.
 * Works with the `.workspace-content-shell` parent or falls back to window.
 */
export function useScrollToTop() {
  const [location] = useLocation();
  const previousLocation = useRef(location);

  useEffect(() => {
    if (previousLocation.current !== location) {
      previousLocation.current = location;

      // Try the main scrollable container first (body of the workspace)
      const mainScroll = document.querySelector("main.overflow-y-auto");
      if (mainScroll) {
        mainScroll.scrollTo({ top: 0, behavior: "instant" });
        return;
      }

      // Fallback to window
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [location]);
}
