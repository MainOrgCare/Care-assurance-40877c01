import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle } from "lucide-react";

interface SessionContextType {
  isForceLogoutPending: boolean;
  forceLogoutCountdown: number | null;
  forceLogoutMessage: string | null;
  isConnected: boolean;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

/** Max reconnection attempts before giving up */
const MAX_RECONNECT_ATTEMPTS = 10;
/** Base delay for exponential backoff (ms) */
const RECONNECT_BASE_DELAY = 1000;
/** Maximum backoff delay (ms) */
const RECONNECT_MAX_DELAY = 30_000;

export function SessionProvider({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [isForceLogoutPending, setIsForceLogoutPending] = useState(false);
  const [forceLogoutCountdown, setForceLogoutCountdown] = useState<number | null>(null);
  const [forceLogoutMessage, setForceLogoutMessage] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep stable references to callbacks used inside the WS effect
  const logoutRef = useRef(logout);
  logoutRef.current = logout;
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const getWsUrl = useCallback((userId: string) => {
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "");
    if (apiBaseUrl) {
      const wsProtocolUrl = apiBaseUrl.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
      return `${wsProtocolUrl}/ws?userId=${userId}`;
    }
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/ws?userId=${userId}`;
  }, []);

  useEffect(() => {
    if (!user) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      reconnectAttemptRef.current = 0;
      setIsConnected(false);
      return;
    }

    let isCancelled = false;

    const connect = () => {
      if (isCancelled) return;
      const wsUrl = getWsUrl(user.id);
      const socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        if (isCancelled) { socket.close(); return; }
        setIsConnected(true);
        reconnectAttemptRef.current = 0;
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "FORCE_LOGOUT_WARNING") {
            setIsForceLogoutPending(true);
            setForceLogoutMessage(data.message);
            setForceLogoutCountdown(data.seconds);

            toastRef.current({
              title: "Session Notice",
              description: data.message,
              variant: "destructive",
              duration: data.seconds * 1000,
            });
          }

          if (data.type === "FORCE_LOGOUT") {
            setIsForceLogoutPending(false);
            setForceLogoutCountdown(null);
            logoutRef.current();

            toastRef.current({
              title: "Session Ended",
              description: data.message,
              variant: "destructive",
            });
          }
        } catch (err) {
          console.error("WebSocket message parse error:", err);
        }
      };

      socket.onerror = (err) => {
        console.error("WebSocket error:", err);
      };

      socket.onclose = () => {
        if (isCancelled) return;
        setIsConnected(false);
        wsRef.current = null;

        // Attempt reconnection with exponential backoff
        if (reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(
            RECONNECT_BASE_DELAY * 2 ** reconnectAttemptRef.current,
            RECONNECT_MAX_DELAY,
          );
          reconnectAttemptRef.current += 1;
          reconnectTimerRef.current = setTimeout(connect, delay);
        } else {
          // All reconnection attempts exhausted — notify user
          toastRef.current({
            title: "Connection Lost",
            description: "Real-time session monitoring is offline. Please refresh the page.",
            variant: "destructive",
          });
        }
      };

      wsRef.current = socket;
    };

    connect();

    // Reconnect when tab becomes visible again (e.g. after device sleep)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && !wsRef.current && !isCancelled) {
        reconnectAttemptRef.current = 0; // Reset attempts on tab focus
        connect();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isCancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [user?.id, getWsUrl]);

  useEffect(() => {
    if (forceLogoutCountdown === null || forceLogoutCountdown <= 0) return;
    
    const timer = setInterval(() => {
      setForceLogoutCountdown(prev => (prev !== null && prev > 0) ? prev - 1 : null);
    }, 1000);
    
    return () => clearInterval(timer);
  }, [forceLogoutCountdown]);

  return (
    <SessionContext.Provider value={{ 
      isForceLogoutPending, 
      forceLogoutCountdown, 
      forceLogoutMessage,
      isConnected 
    }}>
      {children}
      {isForceLogoutPending && forceLogoutCountdown !== null && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 animate-in fade-in duration-300"
          role="alertdialog"
          aria-modal="true"
          aria-label="Session ending"
          aria-live="assertive"
        >
          <div className="bg-card border border-red-500/50 rounded-xl p-8 max-w-md mx-4 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-red-500/20 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-500" aria-hidden="true" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">Session Ending</h2>
            <p className="text-muted-foreground">{forceLogoutMessage}</p>
            <div className="text-4xl font-semibold text-red-500">
              {forceLogoutCountdown}
            </div>
            <p className="text-sm text-muted-foreground">seconds remaining</p>
          </div>
        </div>
      )}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
}
