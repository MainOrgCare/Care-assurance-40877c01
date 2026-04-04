import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  FileText,
  Activity,
  CheckCircle,
  Settings,
  LogOut,
  Sparkles,
  Users,
  ShieldAlert,
  Mail,
  ShieldCheck,
  Menu,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Upload,
  UserCog,
  ClipboardList,
  BarChart,
  Lock,
  Calculator,
  FlaskConical,
  Terminal,
  ArrowUpRight,
  FileSpreadsheet,
  Inbox,
  AlertTriangle,
  Megaphone,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect, Suspense, memo, useCallback, useRef, useMemo, lazy, Fragment } from "react";
import { useAuth } from "@/context/AuthContext";
import { useSession } from "@/context/SessionContext";
import { useTemporaryDataTimer } from "@/context/TemporaryDataContext";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import ComplieeIdleButton from "@/components/ComplieeIdleButton";
import CommandPalette from "@/components/CommandPalette";
import KeyboardShortcutsDialog from "@/components/KeyboardShortcutsDialog";
import NotificationCenter from "@/components/NotificationCenter";
import { PageTransition } from "@/components/PageTransition";
import { ScrollToTopButton } from "@/components/ScrollToTopButton";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { SessionTimeoutWarning } from "@/components/SessionTimeoutWarning";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { useScrollToTop } from "@/hooks/useScrollToTop";
import { useRecentPages } from "@/hooks/useRecentPages";
import { useSessionTimer } from "@/hooks/useSessionTimer";
import { resolvePageMeta, buildBreadcrumbs, type PageMeta } from "@/config/navigation";

// Page metadata and breadcrumbs are now defined in @/config/navigation.ts

type PlatformBannerControls = {
  maintenanceMode: boolean;
  readOnlyMode: boolean;
  maintenanceActive?: boolean;
  readOnlyActive?: boolean;
  maintenanceMessage: string;
  maintenanceWindowStart: string | null;
  maintenanceWindowEnd: string | null;
  maintenanceWindowActive?: boolean;
  maintenanceWindowUpcoming?: boolean;
  announcementEnabled: boolean;
  announcementText: string;
  announcementSeverity: "info" | "warning" | "critical";
  updatedAt: string;
};

const formatBannerDate = (value: string | null | undefined): string => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const ChatAssistant = lazy(() => import("@/components/ChatAssistant"));
const ComplieeIntro = lazy(() => import("@/components/ComplieeIntro"));

function ContentFallback({ variant = "standard" }: { variant?: "standard" | "full" }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsVisible(true), 220);
    return () => window.clearTimeout(timer);
  }, []);

  if (!isVisible) return null;

  const wrapperClass =
    variant === "full"
      ? "flex-1 flex flex-col gap-4 p-6"
      : "flex-1 flex flex-col gap-4";

  return (
    <div className={wrapperClass} aria-busy="true" aria-live="polite">
      <div className="h-8 w-52 bg-muted/50 rounded-lg" />
      <div className="h-4 w-full max-w-md bg-muted/40 rounded" />
      <div className="h-4 w-full max-w-sm bg-muted/30 rounded" />
      <div className="mt-6 h-40 w-full bg-muted/20 rounded-xl" />
    </div>
  );
}

const SidebarContent = memo(function SidebarContent({
  location,
  handleSecretClick,
  logout,
  collapsed = false,
}: {
  location: string;
  handleSecretClick: (e: React.MouseEvent) => void;
  logout: () => void;
  collapsed?: boolean;
}) {
  const { user } = useAuth();
  const { timeLeft } = useTemporaryDataTimer();
  const isAdminUser = user?.role === "admin";
  const isCollapsed = Boolean(collapsed);
  
  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const [openServiceUsers, setOpenServiceUsers] = useState(location.startsWith("/service-users"));
  const [openCareWorkers, setOpenCareWorkers] = useState(location.startsWith("/care-workers"));
  const isAdminRoute =
    location.startsWith("/admin") ||
    location === "/shadow-admin-portal" ||
    location === "/testing-features" ||
    location === "/care-worker-rotas" ||
    location === "/rostering-unified" ||
    location === "/billing-tool" ||
    location === "/system-logs";
  const [openAdmin, setOpenAdmin] = useState(isAdminUser && isAdminRoute);

  useEffect(() => {
     if (location.startsWith("/service-users")) setOpenServiceUsers(true);
     if (location.startsWith("/care-workers")) setOpenCareWorkers(true);
      if (
        isAdminUser &&
        (location.startsWith("/admin") ||
          location === "/shadow-admin-portal" ||
          location === "/testing-features" ||
          location === "/care-worker-rotas" ||
          location === "/rostering-unified" ||
          location === "/billing-tool" ||
          location === "/system-logs")
      ) {
        setOpenAdmin(true);
      }
  }, [location, isAdminUser]);

  const navLinkClass = useCallback((isActive: boolean) =>
    cn(
      "flex items-center gap-2.5 rounded-xl text-[0.8rem] font-semibold tracking-[-0.01em] transition-all duration-150 group cursor-pointer",
      isCollapsed ? "px-2.5 py-2.75 justify-center gap-0" : "px-3.5 py-2.5",
      isActive
        ? "bg-sidebar-primary/16 text-sidebar-primary font-semibold shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-sidebar-primary)_18%,transparent),0_14px_30px_-26px_rgba(15,23,42,0.6)]"
        : "text-sidebar-foreground/72 hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.07]"
    ), [isCollapsed]);

  const subNavLinkClass = useCallback((isActive: boolean) =>
    cn(
      "flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-[0.76rem] font-medium transition-all duration-150",
      isActive
        ? "bg-sidebar-primary/10 text-sidebar-primary shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-sidebar-primary)_12%,transparent)]"
        : "text-sidebar-foreground/56 hover:text-sidebar-foreground/88 hover:bg-sidebar-foreground/[0.05]"
    ), []);

  const labelClass = cn(
    "whitespace-nowrap transition-opacity duration-200",
    isCollapsed && "opacity-0 w-0 overflow-hidden"
  );

  return (
    <div className="flex h-full flex-col bg-sidebar">
      {/* Logo Section */}
      <div className={cn("px-5 pt-5 pb-4", isCollapsed && "px-3 pt-4 pb-3")}>
        <Link href="/">
          <div 
            onClick={handleSecretClick}
            className={cn("flex items-center gap-3 cursor-pointer group", isCollapsed && "justify-center")}
          >
            <div className="relative h-10 w-10 rounded-xl flex items-center justify-center border border-sidebar-primary/22 bg-[linear-gradient(145deg,color-mix(in_oklab,var(--color-sidebar-primary)_26%,transparent),color-mix(in_oklab,var(--color-sidebar-primary)_8%,transparent))] shadow-[0_14px_30px_-24px_rgba(0,0,0,0.85)]">
              <ShieldCheck className="h-4 w-4 text-sidebar-primary" />
            </div>
            {!isCollapsed && (
              <div className="flex flex-col">
              <h1 className="font-heading text-[15px] leading-none tracking-[-0.03em]">
                <span className="font-bold text-sidebar-foreground">Care</span><span className="font-medium text-sidebar-foreground/58">Assurance</span>
              </h1>
              <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/42">Compliance Platform</span>
            </div>
            )}
          </div>
        </Link>
      </div>

      {/* Divider */}
      <div className={cn("mx-5 h-px bg-sidebar-border/65", isCollapsed && "mx-3")} />

      <nav aria-label="Main navigation" className={cn("flex-1 space-y-1 py-3 overflow-y-auto overscroll-contain", isCollapsed ? "px-2" : "px-3")}>
        
        {/* Dashboard */}
        <Link href="/dashboard" className={navLinkClass(location === "/dashboard")} title={isCollapsed ? "Dashboard" : undefined} aria-current={location === "/dashboard" ? "page" : undefined}>
            <LayoutDashboard size={16} />
            <span className={labelClass}>Dashboard</span>
            {!isCollapsed && location === "/dashboard" && <ArrowUpRight size={12} className="ml-auto opacity-50" />}
        </Link>

        {/* Messages */}
        <Link href="/messages" className={navLinkClass(location === "/messages")} title={isCollapsed ? "Messages" : undefined} aria-current={location === "/messages" ? "page" : undefined}>
          <Inbox size={16} />
          <span className={labelClass}>Messages</span>
        </Link>

        {/* Email Assistant */}
        <Link href="/email-assistant" className={navLinkClass(location === "/email-assistant")} title={isCollapsed ? "Email Assistant" : undefined} aria-current={location === "/email-assistant" ? "page" : undefined}>
          <Mail size={16} />
          <span className={labelClass}>Email Assistant</span>
        </Link>

        {/* Compliance */}
        <Link href="/compliance" className={navLinkClass(location === "/compliance")} title={isCollapsed ? "Compliance" : undefined} aria-current={location === "/compliance" ? "page" : undefined}>
          <CheckCircle size={16} />
          <span className={labelClass}>Compliance</span>
        </Link>

        {/* CQC Assessment */}
        <Link href="/cqc-assessment" className={navLinkClass(location === "/cqc-assessment")} title={isCollapsed ? "CQC Assessment" : undefined} aria-current={location === "/cqc-assessment" ? "page" : undefined}>
          <ShieldCheck size={16} />
          <span className={labelClass}>CQC Assessment</span>
        </Link>

        {/* Policy Acknowledgement */}
        <Link href="/policy-acknowledgement" className={navLinkClass(location === "/policy-acknowledgement")} title={isCollapsed ? "Policies" : undefined} aria-current={location === "/policy-acknowledgement" ? "page" : undefined}>
          <FileText size={16} />
          <span className={labelClass}>Policies</span>
        </Link>

        {/* Section Label */}
        {!isCollapsed && (
          <div className="px-3 pt-5 pb-1.5">
            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-sidebar-foreground/22">Modules</span>
          </div>
        )}

        {/* Service Users */}
        {isCollapsed ? (
          <Link
            href="/service-users/upload"
            title="Service Users"
            className={cn(
              "flex items-center justify-center w-full px-2.5 py-[0.4375rem] text-[0.82rem] font-medium rounded-lg transition-all duration-150 group hover:bg-sidebar-foreground/[0.06]"
            )}
          >
            <div className="flex items-center gap-0">
              <Users size={16} className="text-sidebar-foreground/50" />
              <span className={labelClass}>Service Users</span>
            </div>
          </Link>
        ) : (
          <Collapsible
            open={openServiceUsers}
            onOpenChange={setOpenServiceUsers}
            className="space-y-0.5"
          >
             <CollapsibleTrigger
              className="flex items-center justify-between w-full px-3 py-[0.4375rem] text-[0.82rem] font-medium rounded-lg transition-all duration-150 group hover:bg-sidebar-foreground/[0.06]"
            >
              <div className="flex items-center gap-3">
                <Users size={16} className="text-sidebar-foreground/50" />
                 <span className={labelClass}>Service Users</span>
              </div>
              <div className="flex items-center gap-2">
                {timeLeft !== null && (
                  <Badge variant="destructive" className="h-5 px-1.5 text-[9px] font-mono tabular-nums">
                    {formatTime(timeLeft)}
                  </Badge>
                )}
                <ChevronDown size={13} className={cn("transition-transform duration-150 text-sidebar-foreground/40", openServiceUsers ? "rotate-180" : "")} />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-0.5 pl-3 mt-0.5" role="group" aria-label="Service Users pages">
              <Link href="/service-users/upload" className={subNavLinkClass(location === "/service-users/upload")}>
                 <Upload size={14} /> Data Upload
              </Link>
              <Link href="/service-users/care-planning" className={subNavLinkClass(location === "/service-users/care-planning")}>
                 <FileText size={14} /> Care Planning
              </Link>
              <Link href="/service-users/risk-assessment" className={subNavLinkClass(location === "/service-users/risk-assessment")}>
                 <ShieldAlert size={14} /> Risk Assessment
              </Link>
              <Link href="/service-users/plan-enhancer" className={subNavLinkClass(location === "/service-users/plan-enhancer")}>
                 <Sparkles size={14} /> Plan Enhancer
              </Link>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Care Workers */}
        {isCollapsed ? (
          <Link
            href="/care-workers/list"
            title="Care Workers"
            className="flex items-center justify-center w-full px-2.5 py-[0.4375rem] text-[0.82rem] font-medium rounded-lg transition-all group hover:bg-sidebar-foreground/[0.06]"
          >
            <div className="flex items-center gap-0">
              <UserCog size={16} className="text-sidebar-foreground/50" />
              <span className={labelClass}>Care Workers</span>
            </div>
          </Link>
        ) : (
          <Collapsible
            open={openCareWorkers}
            onOpenChange={setOpenCareWorkers}
            className="space-y-0.5"
          >
             <CollapsibleTrigger
              className="flex items-center justify-between w-full px-3 py-[0.4375rem] text-[0.82rem] font-medium rounded-lg transition-all group hover:bg-sidebar-foreground/[0.06]"
            >
              <div className="flex items-center gap-3">
                <UserCog size={16} className="text-sidebar-foreground/50" />
                 <span className={labelClass}>Care Workers</span>
              </div>
              <ChevronDown size={13} className={cn("transition-transform duration-150 text-sidebar-foreground/40", openCareWorkers ? "rotate-180" : "")}/>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-0.5 pl-3 mt-0.5" role="group" aria-label="Care Workers pages">
              <Link href="/care-workers/list" className={subNavLinkClass(location === "/care-workers/list")}>
                 <Users size={14} /> Carers
              </Link>
              <Link href="/care-workers/emar-audit" className={subNavLinkClass(location === "/care-workers/emar-audit")}>
                 <Activity size={14} /> EMAR Audit
              </Link>
              <Link href="/care-workers/visit-audit" className={subNavLinkClass(location === "/care-workers/visit-audit")}>
                 <ClipboardList size={14} /> Visit Audit
              </Link>
              <Link href="/care-workers/performance" className={subNavLinkClass(location === "/care-workers/performance")}>
                 <BarChart size={14} /> Performance
              </Link>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Admin */}
        {isAdminUser && (
          isCollapsed ? (
            <Link
              href="/shadow-admin-portal"
              title="Admin"
              className="flex items-center justify-center w-full px-2.5 py-[0.4375rem] text-[0.82rem] font-medium rounded-lg transition-all group hover:bg-sidebar-foreground/[0.06]"
            >
              <div className="flex items-center gap-0">
                <Lock size={16} className="text-sidebar-foreground/50" />
                <span className={labelClass}>Admin</span>
              </div>
            </Link>
          ) : (
            <Collapsible
              open={openAdmin}
              onOpenChange={setOpenAdmin}
              className="space-y-0.5"
            >
              <CollapsibleTrigger
                className="flex items-center justify-between w-full px-3 py-[0.4375rem] text-[0.82rem] font-medium rounded-lg transition-all group hover:bg-sidebar-foreground/[0.06]"
              >
                <div className="flex items-center gap-3">
                  <Lock size={16} className="text-sidebar-foreground/50" />
                  <span className={labelClass}>Admin</span>
                </div>
                <ChevronDown size={13} className={cn("transition-transform duration-150 text-sidebar-foreground/40", openAdmin ? "rotate-180" : "")} />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-0.5 pl-3 mt-0.5" role="group" aria-label="Admin pages">
                <Link href="/shadow-admin-portal" className={subNavLinkClass(location === "/shadow-admin-portal")}>
                  <ShieldCheck size={14} /> Administrator Controls
                </Link>
                <Link href="/roi-calculator" className={subNavLinkClass(location === "/roi-calculator")} data-testid="link-roi-calculator">
                  <Calculator size={14} /> Features & Benefits
                </Link>
                <Link href="/testing-features" className={subNavLinkClass(location === "/testing-features")}>
                  <FlaskConical size={14} /> Testing Features
                </Link>
                <Link href="/system-logs" className={subNavLinkClass(location === "/system-logs")}>
                  <Terminal size={14} /> System Logs
                </Link>
                <Link
                  href="/rostering-unified"
                  className={subNavLinkClass(location === "/rostering-unified")}
                >
                  <ClipboardList size={14} /> Rostering Studio
                </Link>
                <Link href="/billing-tool" className={subNavLinkClass(location === "/billing-tool")} data-testid="link-billing-tool">
                  <FileSpreadsheet size={14} /> Billing Tool
                </Link>
              </CollapsibleContent>
            </Collapsible>
          )
        )}
      </nav>

      {/* Footer Actions */}
      <div className={cn("px-3 pb-4 space-y-0.5 mt-auto border-t border-sidebar-border/40 pt-3", isCollapsed && "px-2")}>
        <Link
          href="/settings"
          className={cn(
            "w-full flex items-center gap-3 rounded-xl text-[0.82rem] font-medium transition-all duration-150 text-sidebar-foreground/48 hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.06]",
            isCollapsed ? "justify-center px-2.5 py-2.75 gap-0" : "px-3.5 py-2.5"
          )}
          data-testid="button-settings"
          title={isCollapsed ? "System Settings" : undefined}
        >
          <Settings size={16} />
          <span className={labelClass}>System Settings</span>
        </Link>
        <button
          className={cn(
            "w-full flex items-center gap-3 rounded-xl text-[0.82rem] font-medium transition-all duration-150 text-destructive hover:bg-destructive/10 hover:text-destructive",
            isCollapsed ? "justify-center px-2.5 py-2.75 gap-0" : "px-3.5 py-2.5"
          )}
          onClick={logout}
          title={isCollapsed ? "Terminate Session" : undefined}
        >
          <LogOut size={16} />
          <span className={labelClass}>Terminate Session</span>
        </button>
      </div>
    </div>
  );
});

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const pageMeta = useMemo(() => resolvePageMeta(location), [location]);
  const isFullBleed = location === "/rostering-unified";
  const isSingleScreenRoute =
    location === "/rostering-unified" || location === "/care-worker-rotas";
  const shouldPollUnread = !isFullBleed && location !== "/messages";
  const [clickCount, setClickCount] = useState(0);
  const { user, logout, refetchUser } = useAuth();
  const { isConnected } = useSession();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [hasOpenedChat, setHasOpenedChat] = useState(false);
  const [showComplieeIntro, setShowComplieeIntro] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [platformControls, setPlatformControls] = useState<PlatformBannerControls | null>(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isKeyboardShortcutsOpen, setIsKeyboardShortcutsOpen] = useState(false);
  const autoCollapseRef = useRef(false);
  const authRecoveryInFlightRef = useRef(false);

  // Detect small screen size for chat layout
  useEffect(() => {
    const checkScreenSize = () => {
      setIsSmallScreen(window.innerWidth < 640);
    };
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  const handleUnauthorized = useCallback(() => {
    if (authRecoveryInFlightRef.current) return;
    authRecoveryInFlightRef.current = true;
    void refetchUser().finally(() => {
      authRecoveryInFlightRef.current = false;
    });
  }, [refetchUser]);

  // Scroll to top on route change
  useScrollToTop();

  // Track recently visited pages (persisted to localStorage)
  useRecentPages();

  // Session duration timer
  const sessionDuration = useSessionTimer();

  // Global keyboard shortcuts (G+D, G+M, Ctrl+K, etc.)
  useGlobalShortcuts({
    onToggleCommandPalette: useCallback(() => setIsCommandPaletteOpen((v) => !v), []),
    onToggleChatAssistant: useCallback(() => {
      setIsChatOpen((current) => {
        if (!current) setHasOpenedChat(true);
        return !current;
      });
    }, []),
    onOpenKeyboardShortcuts: useCallback(() => setIsKeyboardShortcutsOpen(true), []),
  });

  // Build breadcrumb trail from current route
  const breadcrumbs = useMemo(() => buildBreadcrumbs(location), [location]);

  const openChatAssistant = useCallback(() => {
    setHasOpenedChat(true);
    setIsChatOpen(true);
  }, []);

  const displayName = useMemo(() => {
    const full = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
    if (full) return full;
    const username = user?.username?.trim();
    if (!username) return "Account";
    return username.toLowerCase() === "admin" ? "Administrator" : username;
  }, [user?.firstName, user?.lastName, user?.username]);

  // Fetch unread message count (visibility-aware to reduce background work)
  useEffect(() => {
    if (!user || !shouldPollUnread) return;

    let isDisposed = false;
    let controller: AbortController | null = null;

    const fetchUnreadCount = async () => {
      if (isDisposed || document.visibilityState === "hidden" || !navigator.onLine) return;
      controller?.abort();
      controller = new AbortController();
      try {
        const res = await fetch('/api/messages/unread-count', {
          credentials: 'include',
          signal: controller.signal,
        });
        if (res.status === 401) {
          if (!isDisposed) {
            setUnreadMessageCount(0);
          }
          handleUnauthorized();
          return;
        }
        if (res.ok) {
          const data = await res.json();
          if (!isDisposed) {
            setUnreadMessageCount(data.count || 0);
          }
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.error('Failed to fetch unread message count:', error);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchUnreadCount();
      }
    };

    const handleOnline = () => {
      void fetchUnreadCount();
    };

    fetchUnreadCount();
    const interval = window.setInterval(fetchUnreadCount, 120000);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);

    return () => {
      isDisposed = true;
      controller?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
    };
  }, [user?.id, shouldPollUnread, handleUnauthorized]);

  // Ctrl+/ for chat assistant (kept separately since it needs typing-context check
  // and the global shortcuts hook doesn't handle Ctrl+/ to avoid conflict)
  useEffect(() => {
    if (!user) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      const isTypingContext =
        target?.isContentEditable ||
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT";

      if (isTypingContext) return;

      if ((event.ctrlKey || event.metaKey) && event.key === "/") {
        event.preventDefault();
        setIsChatOpen((current) => {
          const next = !current;
          if (next) {
            setHasOpenedChat(true);
          }
          return next;
        });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;

    let disposed = false;
    let controller: AbortController | null = null;

    const fetchPlatformControls = async () => {
      if (document.visibilityState === "hidden" || !navigator.onLine) return;
      controller?.abort();
      controller = new AbortController();
      try {
        const res = await fetch("/api/platform-controls", {
          credentials: "include",
          signal: controller.signal,
        });
        if (res.status === 401) {
          if (!disposed) {
            setPlatformControls(null);
          }
          handleUnauthorized();
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        if (!disposed) {
          setPlatformControls(data);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // Keep UI resilient if controls endpoint is unavailable.
      }
    };

    void fetchPlatformControls();
    // Poll every 60 seconds (increased from 20s to reduce server load while still being responsive)
    // Emergency announcements will still clear within 1 minute
    const interval = window.setInterval(fetchPlatformControls, 60000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchPlatformControls();
      }
    };
    const handleOnline = () => {
      void fetchPlatformControls();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);

    return () => {
      disposed = true;
      controller?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
    };
  }, [user?.id, handleUnauthorized]);

  useEffect(() => {
    if (user) return;
    setUnreadMessageCount(0);
    setPlatformControls(null);
  }, [user]);

  // Show Compli-ee intro after user has accepted terms
  useEffect(() => {
    if (user?.termsAcceptedAt && !localStorage.getItem('compliee_intro_seen')) {
      // Small delay so the page loads first
      const timer = setTimeout(() => setShowComplieeIntro(true), 500);
      return () => clearTimeout(timer);
    }
  }, [user?.termsAcceptedAt]);

  const contentWrapperClass = cn(
    "workspace-content-shell w-full flex-1 min-h-0",
    isFullBleed ? "px-0 py-0" : "px-3 sm:px-5 lg:px-7 pt-4 sm:pt-5 lg:pt-6 pb-5 sm:pb-6 lg:pb-7",
    isSingleScreenRoute && "h-full"
  );
  const contentInnerClass = cn(
    "w-full mx-auto",
    isFullBleed ? "max-w-none" : "max-w-[var(--content-max-width)]"
  );
  const cardClass = cn(
    "workspace-card rounded-[1.6rem] border border-border/75 bg-card/94 p-4 sm:p-5 lg:p-6 flex flex-col w-full flex-1 min-h-0 shadow-[var(--shadow-medium)] motion-safe:animate-[fade-in_120ms_ease-out] backdrop-blur-sm",
    isFullBleed ? "p-0 border-0 rounded-none shadow-none bg-transparent overflow-hidden" : ""
  );
  const mainClass = cn(
    "flex-1 min-h-0 flex flex-col w-full relative z-10 scroll-smooth transition-all duration-250",
    isSingleScreenRoute ? "overflow-hidden" : "overflow-y-auto overflow-x-hidden overscroll-y-contain scrollbar-gutter-stable",
    isChatOpen && !isSmallScreen ? "mr-[430px]" : ""
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 1279px)");

    const handleChange = (event?: MediaQueryListEvent) => {
      const isSmall = event ? event.matches : media.matches;
      if (isSmall) {
        autoCollapseRef.current = true;
        setIsSidebarCollapsed(true);
      } else {
        if (autoCollapseRef.current) {
          setIsSidebarCollapsed(false);
        }
        autoCollapseRef.current = false;
      }
    };

    handleChange();
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  const handleSecretClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (user?.role !== 'admin') return;

    setClickCount(prev => {
      const newCount = prev + 1;
      if (newCount === 3) {
        setLocation("/shadow-admin-portal");
        return 0;
      }
      return newCount;
    });

    setTimeout(() => setClickCount(0), 1000);
  };

  const globalBanners: Array<{
    id: string;
    text: string;
    tone: "info" | "warning" | "critical";
    icon: typeof Megaphone;
  }> = [];

  const maintenanceIsActive =
    Boolean(platformControls?.maintenanceActive) || Boolean(platformControls?.maintenanceMode);

  if (maintenanceIsActive) {
    const maintenanceWindowEnd = formatBannerDate(platformControls?.maintenanceWindowEnd);
    globalBanners.push({
      id: "maintenance",
      text:
        `${platformControls?.maintenanceMessage ||
          "Platform maintenance is in progress. Some actions may be restricted."}${
          maintenanceWindowEnd ? ` Scheduled end: ${maintenanceWindowEnd}.` : ""
        }`,
      tone: "warning",
      icon: AlertTriangle,
    });
  } else if (platformControls?.maintenanceWindowUpcoming) {
    const scheduledStart = formatBannerDate(platformControls.maintenanceWindowStart);
    if (scheduledStart) {
      globalBanners.push({
        id: "maintenance-upcoming",
        text: `Scheduled maintenance starts ${scheduledStart}.`,
        tone: "info",
        icon: AlertTriangle,
      });
    }
  }

  if (platformControls?.announcementEnabled && platformControls.announcementText?.trim()) {
    globalBanners.push({
      id: "announcement",
      text: platformControls.announcementText.trim(),
      tone: platformControls.announcementSeverity || "info",
      icon: Megaphone,
    });
  }

  const bannerStyles: Record<
    "info" | "warning" | "critical",
    { className: string; iconClassName: string }
  > = {
    info: {
      className: "border-primary/18 bg-primary/8 text-primary shadow-[0_10px_24px_-18px_rgba(15,23,42,0.28)]",
      iconClassName: "text-primary",
    },
    warning: {
      className: "border-warning/20 bg-warning/10 text-warning",
      iconClassName: "text-warning",
    },
    critical: {
      className: "border-destructive/20 bg-destructive/100/10 text-destructive dark:text-destructive shadow-[0_6px_16px_-14px_rgba(220,38,38,0.45)]",
      iconClassName: "text-destructive dark:text-destructive",
    },
  };

  const bannerToneLabel: Record<"info" | "warning" | "critical", string> = {
    info: "Info",
    warning: "Maintenance",
    critical: "Critical",
  };

  return (
    <div className="workspace-root relative flex h-[100dvh] min-h-screen w-full overflow-hidden bg-background">
      {/* Skip Navigation Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground focus:shadow-[var(--shadow-strong)] focus:outline-none"
      >
        Skip to main content
      </a>

      {/* Desktop Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: isSidebarCollapsed ? 80 : 260 }}
        transition={{ type: "spring", damping: 30, stiffness: 280 }}
        className={cn(
          "workspace-sidebar hidden md:flex flex-shrink-0 flex-col z-20 border-r border-sidebar-border bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-sidebar)_94%,black)_0%,color-mix(in_oklab,var(--color-sidebar)_98%,black)_100%)] transition-all duration-200",
          ""
        )}
        aria-label="Main navigation"
        role="navigation"
      >
        <SidebarContent
          location={location}
          handleSecretClick={handleSecretClick}
          logout={logout}
          collapsed={isSidebarCollapsed}
        />
      </motion.aside>

      {/* Main + Footer Column */}
      <div className="relative z-10 flex w-full min-h-0 flex-1 flex-col">
        {/* Main Content */}
        <main id="main-content" tabIndex={-1} data-scroll-region className={mainClass} aria-label={pageMeta.title || "Main content"}>
        {/* Header (hidden on full-bleed studio routes to maximize usable workspace) */}
        {!isFullBleed && (
          <header className={cn("workspace-header sticky top-0 z-30 flex h-16 items-center justify-between border-b transition-all duration-300 px-4 md:px-6 before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-primary/0 before:via-primary/12 before:to-primary/0", isScrolled ? "bg-card/94 shadow-[0_18px_32px_-30px_rgba(15,23,42,0.55)] border-border/75 backdrop-blur-xl" : "bg-card/72 shadow-none border-transparent backdrop-blur-md")} role="banner" aria-label="Page header" style={{ backdropFilter: isScrolled ? "blur(18px)" : "blur(10px)" }}>
            <div className="flex items-center gap-3 min-w-0">
              {/* Mobile Menu Trigger */}
              <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="md:hidden h-9 w-9 rounded-xl hover:bg-muted/65">
                    <Menu className="h-4 w-4 text-foreground" />
                    <span className="sr-only">Toggle menu</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[min(20rem,calc(100vw-1rem))] border-r border-border bg-sidebar p-0">
                  <SidebarContent
                    location={location}
                    handleSecretClick={handleSecretClick}
                    logout={() => {
                      setIsMobileOpen(false);
                      logout();
                    }}
                  />
                </SheetContent>
              </Sheet>

                  <Button
                 variant="ghost"
                 size="icon"
                 className="hidden md:inline-flex h-9 w-9 rounded-xl hover:bg-muted/65"
                onClick={() => {
                  autoCollapseRef.current = false;
                  setIsSidebarCollapsed((prev) => !prev);
                }}
              >
                {isSidebarCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
                <span className="sr-only">Toggle sidebar</span>
              </Button>

              <div className="hidden min-[480px]:flex items-center gap-3 min-w-0 ml-1">
                <div className="min-w-0">
                  <p className="text-[9px] uppercase tracking-[0.16em] font-bold text-primary/48">{pageMeta.section}</p>
                  <h2 className="text-[0.95rem] font-semibold tracking-[-0.02em] text-foreground truncate leading-tight">{pageMeta.title}</h2>
                </div>
                {breadcrumbs.length > 0 && (
                  <div className="hidden xl:block border-l border-border/30 pl-3 ml-1">
                    <Breadcrumb>
                      <BreadcrumbList>
                        {breadcrumbs.map((crumb, i) => (
                          <Fragment key={i}>
                            {i > 0 && <BreadcrumbSeparator />}
                            <BreadcrumbItem>
                              {i === breadcrumbs.length - 1 ? (
                                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                              ) : (
                                <BreadcrumbLink href={crumb.href || "#"}>{crumb.label}</BreadcrumbLink>
                              )}
                            </BreadcrumbItem>
                          </Fragment>
                        ))}
                      </BreadcrumbList>
                    </Breadcrumb>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 rounded-2xl border border-border/70 bg-card/82 backdrop-blur-md px-2 py-1.5 shadow-[var(--shadow-sm)]">
              {/* Command Palette Trigger */}
              <button
                onClick={() => setIsCommandPaletteOpen(true)}
                className="hidden md:flex items-center gap-2 rounded-xl border border-border/75 bg-background/70 px-3 py-1.5 text-[0.75rem] font-medium text-muted-foreground hover:bg-muted/72 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 transition-colors cursor-pointer"
                title="Command Palette (Ctrl+K)"
              >
                <Search className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">Search...</span>
                <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[9px] leading-none text-muted-foreground">⌘K</kbd>
              </button>

              {/* Notification Center (admin alerts) */}
              <NotificationCenter />

              {/* Messages Button */}
              <Link href="/messages">
                <button
                  className={cn(
                    "relative flex items-center justify-center h-8 w-8 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
                    unreadMessageCount > 0
                      ? "bg-success/10 text-success hover:bg-success/15"
                      : "bg-muted/48 hover:bg-muted/65"
                  )}
                  title="Messages"
                  aria-label={unreadMessageCount > 0 ? `Messages (${unreadMessageCount} unread)` : "Messages"}
                >
                  <Inbox className={cn("h-4 w-4", unreadMessageCount > 0 ? "text-success" : "text-muted-foreground")} />
                  {unreadMessageCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-4.5 min-w-4.5 px-1.5 rounded-full bg-success text-white text-[9px] font-bold flex items-center justify-center shadow-[var(--shadow-xs)] animate-in zoom-in-50">
                      {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                    </span>
                  )}
                </button>
              </Link>
              
              {/* Compli-ee Help Button */}
              <div className="flex items-center gap-1.5">
                <ComplieeIdleButton onClick={openChatAssistant} />
                <div className="hidden xl:flex items-center gap-1 rounded-lg border border-border/75 bg-background/60 px-1.5 py-1 text-[9px] font-medium text-muted-foreground">
                  <kbd className="font-mono text-[9px] text-muted-foreground">Ctrl /</kbd>
                </div>
              </div>
              
               <div className="group flex items-center gap-2.5 rounded-xl border border-border/75 bg-background/68 py-1.5 pl-3 pr-1.5 transition-all duration-150 hover:border-primary/20 hover:bg-background/92 hover:shadow-[var(--shadow-sm)]">
                <div className="text-right hidden sm:block">
                     <p className="text-[11px] font-semibold leading-tight text-foreground group-hover:text-primary transition-colors">
                    {displayName}
                  </p>
                  <div className="flex items-center justify-end gap-1 mt-0.5">
                    <span
                      title={isConnected ? "Online" : "Offline"}
                      className={cn("h-1.5 w-1.5 rounded-full transition-colors", isConnected ? "bg-success" : "bg-destructive")}
                    />
                    {user?.role === "admin" && (
                      <span className="inline-flex items-center rounded-full border border-border bg-background/80 px-1.5 py-0 text-[7px] font-medium uppercase tracking-[0.04em] leading-[1.2] text-muted-foreground">
                        admin
                      </span>
                    )}
                  </div>
                </div>
                 <div className="relative h-9 w-9 rounded-xl flex items-center justify-center font-bold uppercase text-[10px] bg-primary text-primary-foreground shadow-[0_10px_18px_-14px_rgba(15,23,42,0.55)] ring-2 ring-primary/14">
                  {user?.firstName ? user.firstName.substring(0, 1) : user?.username?.substring(0, 1) || "?"}
                  {user?.lastName ? user.lastName.substring(0, 1) : ""}
                  <div className={cn(
                    "absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card transition-colors",
                    isConnected ? "bg-success" : "bg-destructive"
                  )} />
                </div>
              </div>
            </div>
          </header>
        )}

        {/* Floating sidebar toggle for full-bleed routes */}
        {isFullBleed && (
          <div className="absolute top-2 left-2 z-40 flex items-center gap-2">
            {/* Mobile Menu Trigger */}
            <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="md:hidden h-8 w-8 rounded-lg bg-background/95 shadow-[var(--shadow-xs)]">
                  <Menu className="h-4 w-4 text-foreground" />
                  <span className="sr-only">Toggle menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[min(20rem,calc(100vw-1rem))] border-r border-border bg-sidebar p-0">
                <SidebarContent
                  location={location}
                  handleSecretClick={handleSecretClick}
                  logout={() => {
                    setIsMobileOpen(false);
                    logout();
                  }}
                />
              </SheetContent>
            </Sheet>

            {/* Desktop Sidebar Toggle */}
            <Button
              variant="outline"
              size="icon"
              className="hidden md:inline-flex h-8 w-8 rounded-lg bg-background/95 shadow-[var(--shadow-xs)]"
              onClick={() => {
                autoCollapseRef.current = false;
                setIsSidebarCollapsed((prev) => !prev);
              }}
            >
              {isSidebarCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
              <span className="sr-only">Toggle sidebar</span>
            </Button>

            {/* Compli-ee access for full-bleed studio routes */}
            <ComplieeIdleButton
              onClick={openChatAssistant}
              className="h-8 rounded-lg px-3 py-0 text-xs shadow-[var(--shadow-medium)] shadow-success/25"
            />
            <div className="hidden lg:flex items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground shadow-[var(--shadow-xs)]">
              <span>Open</span>
              <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] leading-none text-foreground">Ctrl + /</kbd>
            </div>
          </div>
        )}

        {globalBanners.length > 0 && (
          <div className="px-3 sm:px-4 lg:px-6 pt-3 space-y-2">
            {globalBanners.map((banner) => {
              const Icon = banner.icon;
              const style = bannerStyles[banner.tone];
              return (
                <div
                  key={banner.id}
                  role={banner.tone === "critical" ? "alert" : "status"}
                  aria-live={banner.tone === "critical" ? "assertive" : "polite"}
                    className={cn(
                      "rounded-2xl border px-3.5 py-3 text-sm font-medium flex items-start gap-2.5 backdrop-blur-sm shadow-[var(--shadow-sm)]",
                      style.className
                    )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", style.iconClassName)} />
                  <div className="min-w-0">
                    <span className="inline-flex items-center rounded-full border border-current/20 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-[0.04em] leading-[1.2] opacity-85">
                      {bannerToneLabel[banner.tone]}
                    </span>
                    <p className="mt-1 text-[13px] leading-relaxed">{banner.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Page Content Area */}
        <div className={contentWrapperClass}>
          <div className={contentInnerClass}>
          <div className={cardClass}>
            {isFullBleed ? (
              <Suspense fallback={<ContentFallback variant="full" />}>
                <PageTransition>
                  {children}
                </PageTransition>
              </Suspense>
            ) : (
              <>
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-block h-1 w-7 rounded-full bg-primary/45" />
                    <p className="text-[9px] uppercase tracking-[0.16em] font-bold text-primary/48">{pageMeta.section}</p>
                  </div>
                  <h1 className="text-[1.35rem] sm:text-[1.55rem] font-heading font-bold text-foreground tracking-[-0.03em] leading-tight">{pageMeta.title}</h1>
                  <p className="mt-2 max-w-2xl text-[0.875rem] leading-relaxed text-muted-foreground">{pageMeta.subtitle}</p>
                </div>
                <div className="mb-5 h-px bg-gradient-to-r from-border/65 via-border/35 to-transparent" />
                <Suspense fallback={<ContentFallback />}>
                  <PageTransition>
                    {children}
                  </PageTransition>
                </Suspense>
              </>
            )}
          </div>
          </div>
        </div>

        </main>

        {/* Footer */}
        {!isSingleScreenRoute && (
          <footer className="workspace-footer flex-shrink-0 border-t border-border bg-background/95 backdrop-blur-sm px-5 py-2.5 transition-[background-color,border-color] duration-200">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-1.5 text-[11px] text-muted-foreground">
              <div className="flex flex-wrap items-center justify-center gap-2.5 font-medium">
                <span className="text-foreground/60">&copy; {new Date().getFullYear()} CareAssurance</span>
                <span className="hidden sm:inline text-border">&middot;</span>
                <span className="hidden sm:inline text-muted-foreground text-[10px]">Precision tools for high-trust care teams</span>
                <span className="hidden md:inline text-border">&middot;</span>
                <span className="inline-flex items-center rounded-full border border-border/70 bg-card px-2 py-0.5 text-[10px] font-semibold text-foreground/70">
                  {pageMeta.section}
                </span>
                {user?.role && (
                  <span className="inline-flex items-center rounded-full border border-border/70 bg-card px-2 py-0.5 text-[10px] font-semibold capitalize text-foreground/70">
                    {user.role}
                  </span>
                )}
                <span className="hidden lg:inline-flex text-[10px] font-medium text-muted-foreground/60">v1.0</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden md:flex items-center gap-1.5 text-[9px] text-muted-foreground font-medium tabular-nums">
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-muted/40 transition-colors cursor-help">
                          <span className={cn(
                            "h-1.5 w-1.5 rounded-full transition-colors",
                            isConnected ? "bg-success animate-pulse" : "bg-destructive"
                          )} />
                          <span>{isConnected ? "Connected" : "Disconnected"}</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-[10px]">
                        <p className="font-semibold">{isConnected ? "WebSocket Connected" : "WebSocket Disconnected"}</p>
                        <p className="text-muted-foreground">Session: {sessionDuration}</p>
                        <p className="text-muted-foreground">Press ? for keyboard shortcuts</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <span className="mx-0.5 opacity-40">&middot;</span>
                  <span>{sessionDuration}</span>
                </div>
                <div className="hidden sm:block h-3 w-px bg-border/40" />
                <Link href="/terms" className="transition-colors hover:text-foreground text-[11px] font-medium underline-offset-2 hover:underline" data-testid="link-footer-terms">
                  Terms
                </Link>
                <Link href="/privacy" className="transition-colors hover:text-foreground text-[11px] font-medium underline-offset-2 hover:underline" data-testid="link-footer-privacy">
                  Privacy
                </Link>
              </div>
            </div>
          </footer>
        )}
      </div>

      {/* Offline indicator */}
      <OfflineIndicator />

      {/* Session timeout warning */}
      <SessionTimeoutWarning />

      {/* Scroll to top floating button */}
      {!isSingleScreenRoute && <ScrollToTopButton />}

      {/* Command Palette (Ctrl+K) */}
      <CommandPalette
        open={isCommandPaletteOpen}
        onOpenChange={setIsCommandPaletteOpen}
        onOpenKeyboardShortcuts={() => setIsKeyboardShortcutsOpen(true)}
      />

      {/* Keyboard Shortcuts Help */}
      <KeyboardShortcutsDialog
        open={isKeyboardShortcutsOpen}
        onOpenChange={setIsKeyboardShortcutsOpen}
      />

      {/* Compli-ee Chat Assistant */}
      {hasOpenedChat && (
        <Suspense fallback={null}>
          <ChatAssistant isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
        </Suspense>
      )}

      {/* Compli-ee Intro Animation (first time after accepting terms) */}
      {showComplieeIntro && (
        <Suspense fallback={null}>
          <ComplieeIntro
            onComplete={() => setShowComplieeIntro(false)}
            onAskHelp={() => {
              setShowComplieeIntro(false);
              openChatAssistant();
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
