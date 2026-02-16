import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

/**
 * Scrolls the nearest overflow container back to top on route changes
 * and moves focus to the main content area for screen reader users.
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
      } else {
        // Fallback to window
        window.scrollTo({ top: 0, behavior: "instant" });
      }

      // Move focus to main content for screen reader accessibility
      const mainContent = document.getElementById("main-content");
      if (mainContent) {
        mainContent.focus({ preventScroll: true });
      }
    }
  }, [location]);
}
