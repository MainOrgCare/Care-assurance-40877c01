import { useEffect, useRef, useState, useCallback } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

const SESSION_MAX_MS = 30 * 60 * 1000; // 30 minutes (matches server cookie maxAge)
const WARNING_BEFORE_MS = 5 * 60 * 1000; // Warn 5 minutes before expiry
const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "scroll"] as const;
const DEBOUNCE_MS = 60_000; // Only track activity once per minute

/**
 * Tracks user activity and shows a warning banner 5 minutes before the session
 * is expected to expire (30-minute inactivity timeout). Allows the user to
 * extend the session by making a keep-alive request.
 */
export function SessionTimeoutWarning() {
  const { user } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [extending, setExtending] = useState(false);
  const [minutesLeft, setMinutesLeft] = useState(5);
  const lastActivityRef = useRef(Date.now());
  const warningCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track user activity (debounced)
  useEffect(() => {
    if (!user) return;

    let lastTracked = 0;
    const trackActivity = () => {
      const now = Date.now();
      if (now - lastTracked < DEBOUNCE_MS) return;
      lastTracked = now;
      lastActivityRef.current = now;
      setShowWarning(false);
    };

    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, trackActivity, { passive: true })
    );

    return () => {
      ACTIVITY_EVENTS.forEach((event) =>
        window.removeEventListener(event, trackActivity)
      );
    };
  }, [user]);

  // Periodically check if we should show the warning
  useEffect(() => {
    if (!user) return;

    warningCheckRef.current = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current;
      const timeUntilExpiry = SESSION_MAX_MS - idle;

      if (timeUntilExpiry <= 0) {
        // Session likely expired — the server will reject the next request
        setShowWarning(false);
        return;
      }

      if (timeUntilExpiry <= WARNING_BEFORE_MS) {
        setMinutesLeft(Math.max(1, Math.ceil(timeUntilExpiry / 60_000)));
        setShowWarning(true);
      } else {
        setShowWarning(false);
      }
    }, 30_000); // Check every 30 seconds

    return () => {
      if (warningCheckRef.current) clearInterval(warningCheckRef.current);
    };
  }, [user]);

  const extendSession = useCallback(async () => {
    setExtending(true);
    try {
      // A simple authenticated request refreshes the session cookie
      const res = await fetch("/api/user", { credentials: "include" });
      if (res.ok) {
        lastActivityRef.current = Date.now();
        setShowWarning(false);
      }
    } catch {
      // ignore
    } finally {
      setExtending(false);
    }
  }, []);

  if (!showWarning || !user) return null;

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-[100] max-w-sm rounded-xl border border-amber-500/30 bg-amber-50 dark:bg-amber-950/80 p-4 shadow-lg backdrop-blur-sm",
        "animate-in slide-in-from-bottom-4 fade-in duration-300"
      )}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
          <AlertTriangle className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
            Session Expiring Soon
          </p>
          <p className="text-xs text-amber-700/80 dark:text-amber-300/70 mt-0.5">
            Your session will expire in {minutesLeft} minute{minutesLeft !== 1 ? "s" : ""} due to inactivity.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-2.5 h-7 text-xs font-medium border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
            onClick={extendSession}
            disabled={extending}
          >
            {extending ? (
              <RefreshCw className="h-3 w-3 animate-spin mr-1.5" />
            ) : (
              <RefreshCw className="h-3 w-3 mr-1.5" />
            )}
            Extend Session
          </Button>
        </div>
      </div>
    </div>
  );
}
