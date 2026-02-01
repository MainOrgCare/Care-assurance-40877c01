import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { useToast } from "@/hooks/use-toast";

interface SessionContextType {
  isForceLogoutPending: boolean;
  forceLogoutCountdown: number | null;
  forceLogoutMessage: string | null;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [isForceLogoutPending, setIsForceLogoutPending] = useState(false);
  const [forceLogoutCountdown, setForceLogoutCountdown] = useState<number | null>(null);
  const [forceLogoutMessage, setForceLogoutMessage] = useState<string | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);

  useEffect(() => {
    if (!user) {
      if (ws) {
        ws.close();
        setWs(null);
      }
      return;
    }

    const getWsUrl = () => {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "");
      if (apiBaseUrl) {
        // Replace https:// or http:// with wss:// or ws://
        const wsProtocolUrl = apiBaseUrl.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
        return `${wsProtocolUrl}/ws?userId=${user.id}`;
      }
      // Fallback to same origin (local dev or no API base URL)
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      return `${protocol}//${window.location.host}/ws?userId=${user.id}`;
    };

    const wsUrl = getWsUrl();
    
    const socket = new WebSocket(wsUrl);
    
    socket.onopen = () => {
      console.log("Session WebSocket connected");
    };
    
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === "FORCE_LOGOUT_WARNING") {
          setIsForceLogoutPending(true);
          setForceLogoutMessage(data.message);
          setForceLogoutCountdown(data.seconds);
          
          toast({
            title: "Session Notice",
            description: data.message,
            variant: "destructive",
            duration: data.seconds * 1000,
          });
        }
        
        if (data.type === "FORCE_LOGOUT") {
          setIsForceLogoutPending(false);
          setForceLogoutCountdown(null);
          logout();
          
          toast({
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
      console.log("Session WebSocket disconnected");
    };
    
    setWs(socket);
    
    return () => {
      socket.close();
    };
  }, [user?.id]);

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
      forceLogoutMessage 
    }}>
      {children}
      {isForceLogoutPending && forceLogoutCountdown !== null && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 animate-in fade-in duration-300">
          <div className="bg-card border border-red-500/50 rounded-xl p-8 max-w-md mx-4 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-red-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-foreground">Session Ending</h2>
            <p className="text-muted-foreground">{forceLogoutMessage}</p>
            <div className="text-4xl font-bold text-red-500">
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
