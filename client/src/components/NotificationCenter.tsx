import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Bell, Check, CheckCheck, AlertTriangle, FileText, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/queryClient";

interface AdminAlert {
  id: string;
  careWorkerId: string;
  careWorkerName: string;
  message: string;
  discrepancyType: string;
  discrepancyCount: number;
  isRead: boolean;
  createdAt: string;
}

const MAX_VISIBLE_ALERTS = 20;

/** Notification Center — bell icon popover displaying admin alerts with mark-read actions. */
export default function NotificationCenter() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [markingIds, setMarkingIds] = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchControllerRef = useRef<AbortController | null>(null);

  const isAdmin = user?.role === "admin";

  const fetchAlerts = useCallback(async (options?: { silent?: boolean }) => {
    if (!isAdmin) return;
    if (document.visibilityState === "hidden" || !navigator.onLine) return;
    fetchControllerRef.current?.abort();
    const controller = new AbortController();
    fetchControllerRef.current = controller;
    if (!options?.silent) setLoading(true);
    try {
      const res = await fetch("/api/admin-alerts", {
        credentials: "include",
        signal: controller.signal,
      });
      if (res.ok) {
        const data = await res.json();
        setAlerts(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return;
      // Silently fail — will retry on next poll
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [isAdmin]);

  // Poll every 60s + fetch on mount and when popover opens
  useEffect(() => {
    if (!isAdmin) return;
    const poll = () => {
      void fetchAlerts({ silent: true });
    };
    void fetchAlerts();
    pollRef.current = setInterval(poll, 60_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchAlerts({ silent: true });
      }
    };
    const onOnline = () => {
      void fetchAlerts({ silent: true });
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      fetchControllerRef.current?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
    };
  }, [isAdmin, fetchAlerts]);

  useEffect(() => {
    if (open) {
      void fetchAlerts();
    }
  }, [open, fetchAlerts]);

  const markRead = useCallback(async (id: string) => {
    setMarkingIds((prev) => new Set(prev).add(id));
    try {
      await apiRequest("PATCH", `/api/admin-alerts/${id}/read`);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch {
      // ignore
    } finally {
      setMarkingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setMarkingAll(true);
    try {
      await apiRequest("POST", "/api/admin-alerts/mark-all-read");
      setAlerts([]);
    } catch {
      // ignore
    } finally {
      setMarkingAll(false);
    }
  }, []);

  if (!isAdmin) return null;

  const sortedAlerts = useMemo(
    () => [...alerts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [alerts],
  );
  const visibleAlerts = useMemo(() => sortedAlerts.slice(0, MAX_VISIBLE_ALERTS), [sortedAlerts]);

  const unreadCount = alerts.length;

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60_000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const typeIcon = (type: string) => {
    if (type.toLowerCase().includes("emar")) return <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />;
    return <FileText className="h-3.5 w-3.5 text-primary shrink-0" />;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "relative flex items-center justify-center h-8 w-8 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
            unreadCount > 0
              ? "bg-warning/10 text-warning hover:bg-warning/15"
              : "bg-muted/40 hover:bg-muted/60"
          )}
          title={unreadCount > 0 ? `${unreadCount} unread alert${unreadCount !== 1 ? "s" : ""}` : "Notifications"}
          aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"}
        >
          <Bell className={cn("h-4 w-4", unreadCount > 0 ? "text-warning" : "text-muted-foreground")} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-4.5 min-w-4.5 px-1 rounded-full bg-warning text-white text-[9px] font-bold flex items-center justify-center shadow-[var(--shadow-xs)] animate-in zoom-in-50">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                {unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={markAllRead}
              disabled={markingAll}
            >
              {markingAll ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <CheckCheck className="h-3 w-3 mr-1" />
              )}
              Mark all read
            </Button>
          )}
        </div>

        {/* Alert list */}
        <div className="max-h-72 overflow-y-auto">
          {loading && alerts.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span className="text-sm">Loading...</span>
            </div>
          ) : unreadCount === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <CheckCheck className="h-8 w-8 mb-2 opacity-40" />
              <span className="text-sm font-medium">All caught up</span>
              <span className="text-xs mt-0.5">No unread notifications</span>
            </div>
          ) : (
            visibleAlerts.map((alert) => (
              <div
                key={alert.id}
                className="group flex items-start gap-2.5 px-3 py-2.5 border-b border-border/30 last:border-b-0 hover:bg-muted/30 transition-colors"
              >
                <div className="mt-0.5">{typeIcon(alert.discrepancyType)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-foreground leading-snug">
                    {alert.careWorkerName}
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">
                    {alert.message}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={cn(
                      "inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                      alert.discrepancyType.toLowerCase().includes("emar")
                        ? "bg-warning/10 text-warning"
                        : "bg-primary/10 text-primary"
                    )}>
                      {alert.discrepancyType}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatTime(alert.createdAt)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => markRead(alert.id)}
                  disabled={markingIds.has(alert.id)}
                  className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 mt-0.5 flex items-center justify-center h-6 w-6 rounded-md hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-all text-muted-foreground hover:text-foreground"
                  title="Mark as read"
                  aria-label={`Dismiss alert for ${alert.careWorkerName}`}
                >
                  {markingIds.has(alert.id) ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {unreadCount > 0 && (
          <div className="border-t border-border/50 px-3 py-2 text-center">
            <span className="text-[10px] text-muted-foreground">
              Showing {Math.min(unreadCount, MAX_VISIBLE_ALERTS)} of {unreadCount} alert{unreadCount !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
