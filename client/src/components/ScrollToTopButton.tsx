import { useEffect, useRef, useState, useCallback } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A floating button that appears when the user scrolls down
 * and smoothly scrolls back to the top of the main content area.
 *
 * Uses a throttled scroll handler and a data-attribute selector
 * (data-scroll-region) which is more resilient than class-based lookup.
 */
export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);
  const ticking = useRef(false);

  const getScrollRegion = useCallback((): Element | null =>
    document.querySelector("[data-scroll-region]") ??
    document.querySelector("main.overflow-y-auto"),
  []);

  useEffect(() => {
    const main = getScrollRegion();
    if (!main) return;

    const handleScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        setVisible(main.scrollTop > 400);
        ticking.current = false;
      });
    };

    main.addEventListener("scroll", handleScroll, { passive: true });
    return () => main.removeEventListener("scroll", handleScroll);
  }, [getScrollRegion]);

  const scrollToTop = () => {
    const main = getScrollRegion();
    main?.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={scrollToTop}
      className={cn(
        "fixed bottom-20 right-6 z-50 h-10 w-10 rounded-full shadow-lg border-border/80 bg-background/95 backdrop-blur-sm transition-all duration-300",
        visible
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 translate-y-4 pointer-events-none"
      )}
      aria-label="Scroll to top"
    >
      <ArrowUp className="h-4 w-4" />
    </Button>
  );
}
