import { useEffect, useRef, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A floating toast that appears when the user loses internet connectivity
 * and automatically dismisses when they reconnect.
 *
 * Uses a ref to track the reconnection timer so it is properly cleaned up
 * if the component unmounts before the 3-second auto-dismiss fires.
 */
export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showReconnected, setShowReconnected] = useState(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearReconnectTimer = () => {
      if (reconnectTimer.current !== null) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
    };

    const handleOffline = () => {
      clearReconnectTimer();
      setIsOffline(true);
      setShowReconnected(false);
    };

    const handleOnline = () => {
      setIsOffline(false);
      setShowReconnected(true);
      clearReconnectTimer();
      reconnectTimer.current = setTimeout(() => {
        setShowReconnected(false);
        reconnectTimer.current = null;
      }, 3000);
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      clearReconnectTimer();
    };
  }, []);

  if (!isOffline && !showReconnected) return null;

  return (
    <div
      className={cn(
        "fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-normal shadow-[var(--shadow-strong)] backdrop-blur-sm transition-all duration-300",
        isOffline
          ? "border border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
          : "border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      )}
      role="status"
      aria-live="polite"
    >
      {isOffline ? (
        <>
          <WifiOff className="h-4 w-4" aria-hidden />
          <span>You are offline. Some features may be unavailable.</span>
        </>
      ) : (
        <>
          <Wifi className="h-4 w-4 text-emerald-500" aria-hidden />
          <span>Connection restored</span>
        </>
      )}
    </div>
  );
}
