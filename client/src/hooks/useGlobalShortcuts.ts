import { useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";

/**
 * Two-key "go-to" navigation shortcuts (e.g., G then D → Dashboard).
 * Only fires outside text inputs / content-editable areas.
 */
const GO_ROUTES: Record<string, string> = {
  d: "/dashboard",
  m: "/messages",
  e: "/email-assistant",
  c: "/compliance",
  s: "/settings",
  u: "/service-users/upload",
  p: "/service-users/plan-enhancer",
  r: "/service-users/risk-assessment",
  w: "/care-workers/list",
};

interface UseGlobalShortcutsOptions {
  /** Callback to toggle the command palette */
  onToggleCommandPalette?: () => void;
  /** Callback to toggle the chat assistant */
  onToggleChatAssistant?: () => void;
  /** Callback to toggle sidebar (or mobile nav) */
  onToggleSidebar?: () => void;
  /** Callback to open the keyboard shortcuts reference */
  onOpenKeyboardShortcuts?: () => void;
}

export function useGlobalShortcuts({
  onToggleCommandPalette,
  onToggleChatAssistant,
  onToggleSidebar,
  onOpenKeyboardShortcuts,
}: UseGlobalShortcutsOptions = {}) {
  const [, setLocation] = useLocation();
  const pendingGoRef = useRef(false);
  const goTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearGoState = useCallback(() => {
    pendingGoRef.current = false;
    if (goTimerRef.current) {
      clearTimeout(goTimerRef.current);
      goTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tagName = target?.tagName;
      const isTypingContext =
        target?.isContentEditable ||
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT";

      // Ctrl/Cmd+K → command palette (works even in inputs)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onToggleCommandPalette?.();
        clearGoState();
        return;
      }

      // All shortcuts below require NOT being in a typing context
      if (isTypingContext) return;

      // Ctrl/Cmd+/ → chat assistant
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        onToggleChatAssistant?.();
        clearGoState();
        return;
      }

      // Ctrl/Cmd+B → sidebar / nav toggle
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        onToggleSidebar?.();
        clearGoState();
        return;
      }

      // Two-key "go" navigation: press G, then a letter
      if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        const key = e.key.toLowerCase();

        if (pendingGoRef.current) {
          clearGoState();
          const dest = GO_ROUTES[key];
          if (dest) {
            e.preventDefault();
            setLocation(dest);
          }
          return;
        }

        if (key === "g") {
          pendingGoRef.current = true;
          goTimerRef.current = setTimeout(clearGoState, 800);
          return;
        }

        // Single-key shortcuts
        if (key === "?") {
          e.preventDefault();
          onOpenKeyboardShortcuts?.();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      clearGoState();
    };
  }, [setLocation, onToggleCommandPalette, onToggleChatAssistant, onToggleSidebar, onOpenKeyboardShortcuts, clearGoState]);
}
