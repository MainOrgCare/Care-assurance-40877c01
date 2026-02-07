import { Link, useLocation } from "wouter";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect, Suspense, memo, useCallback, useRef, useMemo, lazy } from "react";
import { useAuth } from "@/context/AuthContext";
import { useSession } from "@/context/SessionContext";
import { useTemporaryDataTimer } from "@/context/TemporaryDataContext";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import ComplieeIdleButton from "@/components/ComplieeIdleButton";

type PageMeta = {
  section: string;
  title: string;
  subtitle: string;
};

const PAGE_META_RULES: Array<{ match: (path: string) => boolean; meta: PageMeta }> = [
  {
    match: (path) => path === "/dashboard",
    meta: {
      section: "Overview",
      title: "Operations Dashboard",
      subtitle: "Live visibility of compliance, workforce, and service delivery performance.",
    },
  },
  {
    match: (path) => path === "/messages",
    meta: {
      section: "Communication",
      title: "Team Messages",
      subtitle: "Track updates, handovers, and operational communications in one place.",
    },
  },
  {
    match: (path) => path === "/email-assistant",
    meta: {
      section: "Communication",
      title: "Email Assistant",
      subtitle: "Create structured, professional communications quickly with standardized workflows.",
    },
  },
  {
    match: (path) => path.startsWith("/service-users"),
    meta: {
      section: "Service Users",
      title: "Service User Management",
      subtitle: "Upload records, produce care planning outputs, and maintain person-centred documentation.",
    },
  },
  {
    match: (path) => path.startsWith("/care-workers"),
    meta: {
      section: "Care Workers",
      title: "Care Worker Operations",
      subtitle: "Review EMAR, visit audits, and workforce performance from a unified workspace.",
    },
  },
  {
    match: (path) => path.startsWith("/rostering"),
    meta: {
      section: "Rostering",
      title: "Rostering Studio",
      subtitle: "Plan, optimize, and compare schedules with clear workload and quality signals.",
    },
  },
  {
    match: (path) => path === "/call-reconciliation",
    meta: {
      section: "Assurance",
      title: "Call Reconciliation",
      subtitle: "Validate call evidence and reconcile completed visits against expected delivery.",
    },
  },
  {
    match: (path) => path === "/compliance",
    meta: {
      section: "Assurance",
      title: "Compliance Hub",
      subtitle: "Monitor regulatory posture and track outstanding compliance actions.",
    },
  },
  {
    match: (path) => path === "/settings",
    meta: {
      section: "Administration",
      title: "System Settings",
      subtitle: "Configure security, user preferences, and operating defaults.",
    },
  },
  {
    match: (path) => path.startsWith("/shadow-admin-portal") || path.startsWith("/system-logs") || path.startsWith("/testing-features") || path.startsWith("/billing-tool") || path.startsWith("/roi-calculator"),
    meta: {
      section: "Administration",
      title: "Administrative Controls",
      subtitle: "Platform configuration, diagnostics, and management controls for authorized users.",
    },
  },
];

const DEFAULT_PAGE_META: PageMeta = {
  section: "Workspace",
  title: "CareAssurance",
  subtitle: "Operational tooling for high-trust, compliant care delivery.",
};

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

const resolvePageMeta = (path: string): PageMeta => {
  const matched = PAGE_META_RULES.find((rule) => rule.match(path));
  return matched?.meta || DEFAULT_PAGE_META;
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
      "flex items-center gap-3 rounded-lg text-[13px] font-medium transition-all duration-150 group cursor-pointer",
      isCollapsed ? "px-2.5 py-2.5 justify-center gap-0" : "px-3 py-2",
      isActive
        ? "bg-white/10 text-white"
        : "text-sidebar-foreground/65 hover:text-sidebar-foreground hover:bg-white/[0.06]"
    ), [isCollapsed]);

  const subNavLinkClass = useCallback((isActive: boolean) =>
    cn(
      "flex items-center gap-3 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-150",
      isActive
        ? "bg-white/10 text-white"
        : "text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-white/[0.05]"
    ), []);

  const labelClass = cn(
    "whitespace-nowrap transition-opacity duration-200",
    isCollapsed && "opacity-0 w-0 overflow-hidden"
  );

  return (
    <div className="flex h-full flex-col bg-sidebar">
      {/* Logo Section */}
      <div className={cn("px-5 pt-6 pb-5", isCollapsed && "px-3 pt-5 pb-4")}>
        <Link href="/">
          <div 
            onClick={handleSecretClick}
            className={cn("flex items-center gap-3 cursor-pointer group", isCollapsed && "justify-center")}
          >
            <div className="relative h-9 w-9 rounded-lg flex items-center justify-center bg-white/10 border border-white/10">
              <ShieldCheck className="h-[18px] w-[18px] text-white" />
            </div>
            {!isCollapsed && (
              <div className="flex flex-col">
              <h1 className="font-heading text-[15px] leading-none tracking-tight">
                <span className="font-semibold text-white">Care</span><span className="font-normal text-white/60">Assurance</span>
              </h1>
              <span className="text-[10px] mt-1 font-medium uppercase tracking-[0.08em] text-white/40">Operations Platform</span>
            </div>
            )}
          </div>
        </Link>
      </div>

      {/* Divider */}
      <div className={cn("mx-5 h-px bg-white/8", isCollapsed && "mx-3")} />

      <nav className={cn("flex-1 space-y-0.5 py-3 overflow-y-auto overscroll-contain", isCollapsed ? "px-2" : "px-3")}>
        
        {/* Dashboard */}
        <Link href="/dashboard" className={navLinkClass(location === "/dashboard")} title={isCollapsed ? "Dashboard" : undefined}>
            <LayoutDashboard size={16} />
            <span className={labelClass}>Dashboard</span>
            {!isCollapsed && location === "/dashboard" && <ArrowUpRight size={12} className="ml-auto opacity-50" />}
        </Link>

        {/* Messages */}
        <Link href="/messages" className={navLinkClass(location === "/messages")} title={isCollapsed ? "Messages" : undefined}>
          <Inbox size={16} />
          <span className={labelClass}>Messages</span>
        </Link>

        {/* Email Assistant */}
        <Link href="/email-assistant" className={navLinkClass(location === "/email-assistant")} title={isCollapsed ? "Email Assistant" : undefined}>
          <Mail size={16} />
          <span className={labelClass}>Email Assistant</span>
        </Link>

        {/* Compliance */}
        <Link href="/compliance" className={navLinkClass(location === "/compliance")} title={isCollapsed ? "Compliance" : undefined}>
          <CheckCircle size={16} />
          <span className={labelClass}>Compliance</span>
        </Link>

        {/* Section Label */}
        {!isCollapsed && (
          <div className="px-3 pt-4 pb-1">
            <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-white/30">Modules</span>
          </div>
        )}

        {/* Service Users */}
        <Collapsible
          open={isCollapsed ? false : openServiceUsers}
          onOpenChange={setOpenServiceUsers}
          className="space-y-0.5"
          disabled={isCollapsed}
        >
           <CollapsibleTrigger
            title={isCollapsed ? "Service Users" : undefined}
            className={cn(
            "flex items-center justify-between w-full px-3 py-2 text-[13px] font-medium rounded-lg transition-all group hover:bg-white/[0.06]",
            isCollapsed && "justify-center px-2.5"
           )}>
            <div className={cn("flex items-center gap-3", isCollapsed && "gap-0")}>
              <Users size={16} className="text-sidebar-foreground/55" />
               <span className={labelClass}>Service Users</span>
            </div>
            {!isCollapsed && (
              <div className="flex items-center gap-2">
               {timeLeft !== null && (
                 <Badge variant="destructive" className="h-5 px-1.5 text-[9px] font-mono tabular-nums">
                   {formatTime(timeLeft)}
                 </Badge>
               )}
              <ChevronDown size={13} className={cn("transition-transform duration-150 text-sidebar-foreground/40", openServiceUsers ? "rotate-180" : "")} />
            </div>
            )}
          </CollapsibleTrigger>
          {!isCollapsed && (
            <CollapsibleContent className="space-y-0.5 pl-3 mt-0.5">
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
          )}
        </Collapsible>

        {/* Care Workers */}
        <Collapsible
          open={isCollapsed ? false : openCareWorkers}
          onOpenChange={setOpenCareWorkers}
          className="space-y-0.5"
          disabled={isCollapsed}
        >
           <CollapsibleTrigger
            title={isCollapsed ? "Care Workers" : undefined}
            className={cn(
            "flex items-center justify-between w-full px-3 py-2 text-[13px] font-medium rounded-lg transition-all group hover:bg-white/[0.06]",
            isCollapsed && "justify-center px-2.5"
           )}>
            <div className={cn("flex items-center gap-3", isCollapsed && "gap-0")}>
              <UserCog size={16} className="text-sidebar-foreground/55" />
               <span className={labelClass}>Care Workers</span>
            </div>
            {!isCollapsed && (
              <ChevronDown size={13} className={cn("transition-transform duration-150 text-sidebar-foreground/40", openCareWorkers ? "rotate-180" : "")}/>
            )}
          </CollapsibleTrigger>
          {!isCollapsed && (
            <CollapsibleContent className="space-y-0.5 pl-3 mt-0.5">
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
          )}
        </Collapsible>

        {/* Admin */}
        {isAdminUser && (
          <Collapsible
            open={isCollapsed ? false : openAdmin}
            onOpenChange={setOpenAdmin}
            className="space-y-0.5"
            disabled={isCollapsed}
          >
            <CollapsibleTrigger
              title={isCollapsed ? "Admin" : undefined}
              className={cn(
              "flex items-center justify-between w-full px-3 py-2 text-[13px] font-medium rounded-lg transition-all group hover:bg-white/[0.06]",
              isCollapsed && "justify-center px-2.5"
            )}>
              <div className={cn("flex items-center gap-3", isCollapsed && "gap-0")}>
                <Lock size={16} className="text-sidebar-foreground/55" />
                <span className={labelClass}>Admin</span>
              </div>
              {!isCollapsed && (
                <ChevronDown size={13} className={cn("transition-transform duration-150 text-sidebar-foreground/40", openAdmin ? "rotate-180" : "")} />
              )}
            </CollapsibleTrigger>
            {!isCollapsed && (
              <CollapsibleContent className="space-y-0.5 pl-3 mt-0.5">
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
            )}
          </Collapsible>
        )}
      </nav>

      {/* Footer Actions */}
      <div className={cn("px-3 pb-5 space-y-0.5 mt-auto border-t border-white/8 pt-3", isCollapsed && "px-2")}>
        <Link
          href="/settings"
          className={cn(
            "w-full flex items-center gap-3 rounded-lg text-[13px] font-medium transition-all text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-white/[0.06]",
            isCollapsed ? "justify-center px-2.5 py-2.5 gap-0" : "px-3 py-2"
          )}
          data-testid="button-settings"
          title={isCollapsed ? "System Settings" : undefined}
        >
          <Settings size={16} />
          <span className={labelClass}>System Settings</span>
        </Link>
        <button
          className={cn(
            "w-full flex items-center gap-3 rounded-lg text-[13px] font-medium transition-all text-red-400/80 hover:text-red-400 hover:bg-red-500/10",
            isCollapsed ? "justify-center px-2.5 py-2.5 gap-0" : "px-3 py-2"
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
  const { user, logout } = useAuth();
  const { isConnected } = useSession();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [hasOpenedChat, setHasOpenedChat] = useState(false);
  const [showComplieeIntro, setShowComplieeIntro] = useState(false);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [platformControls, setPlatformControls] = useState<PlatformBannerControls | null>(null);
  const autoCollapseRef = useRef(false);

  const openChatAssistant = useCallback(() => {
    setHasOpenedChat(true);
    setIsChatOpen(true);
  }, []);

  // Fetch unread message count (visibility-aware to reduce background work)
  useEffect(() => {
    if (!user || !shouldPollUnread) return;

    let isDisposed = false;
    let controller: AbortController | null = null;

    const fetchUnreadCount = async () => {
      if (isDisposed || document.visibilityState === "hidden") return;
      controller?.abort();
      controller = new AbortController();
      try {
        const res = await fetch('/api/messages/unread-count', {
          credentials: 'include',
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          if (!isDisposed) {
            setUnreadMessageCount(data.count || 0);
          }
        }
      } catch (error) {
        if ((error as any)?.name !== "AbortError") {
          console.error('Failed to fetch unread message count:', error);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchUnreadCount();
      }
    };

    fetchUnreadCount();
    const interval = window.setInterval(fetchUnreadCount, 120000);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isDisposed = true;
      controller?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [user?.id, shouldPollUnread]);

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
      if (document.visibilityState === "hidden") return;
      controller?.abort();
      controller = new AbortController();
      try {
        const res = await fetch("/api/platform-controls", {
          credentials: "include",
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!disposed) {
          setPlatformControls(data);
        }
      } catch (error) {
        if ((error as any)?.name === "AbortError") return;
        // Keep UI resilient if controls endpoint is unavailable.
      }
    };

    void fetchPlatformControls();
    // Poll more frequently so emergency admin announcement/maintenance changes clear quickly.
    const interval = window.setInterval(fetchPlatformControls, 20000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchPlatformControls();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      controller?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [user?.id]);

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
    isFullBleed ? "px-0 py-0" : "px-3 sm:px-4 lg:px-6 pt-4 sm:pt-5 lg:pt-6 pb-5 sm:pb-6 lg:pb-7",
    isSingleScreenRoute && "h-full"
  );
  const cardClass = cn(
    "workspace-card rounded-xl border border-border/50 bg-card p-4 sm:p-6 lg:p-7 flex flex-col shadow-sm w-full flex-1 min-h-0 motion-safe:animate-[fade-in_150ms_ease-out]",
    isFullBleed ? "p-0 border-0 rounded-none shadow-none bg-transparent overflow-hidden" : ""
  );
  const mainClass = cn(
    "flex-1 min-h-0 flex flex-col w-full relative z-10 scroll-smooth",
    isSingleScreenRoute ? "overflow-hidden" : "overflow-y-auto overflow-x-hidden overscroll-y-contain scrollbar-gutter-stable"
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
      className: "border-blue-200 bg-blue-50 text-blue-900",
      iconClassName: "text-blue-600",
    },
    warning: {
      className: "border-amber-200 bg-amber-50 text-amber-900",
      iconClassName: "text-amber-600",
    },
    critical: {
      className: "border-red-200 bg-red-50 text-red-900",
      iconClassName: "text-red-600",
    },
  };

  return (
    <div className="workspace-root relative flex h-[100dvh] min-h-screen w-full overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 -z-[1] overflow-hidden">
        <div className="absolute -top-44 -left-28 h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,rgba(30,64,175,0.04),rgba(30,64,175,0)_72%)] blur-lg" />
      </div>
      {/* Desktop Sidebar */}
      <aside className={cn(
        "workspace-sidebar hidden md:flex flex-shrink-0 flex-col z-20 border-r border-white/[0.06] bg-sidebar transition-all duration-200",
        isSidebarCollapsed ? "w-[72px]" : "w-[260px]"
      )}>
        <SidebarContent
          location={location}
          handleSecretClick={handleSecretClick}
          logout={logout}
          collapsed={isSidebarCollapsed}
        />
      </aside>

      {/* Main + Footer Column */}
      <div className="relative z-10 flex w-full min-h-0 flex-1 flex-col">
        {/* Main Content */}
        <main className={mainClass}>
        {/* Header (hidden on full-bleed studio routes to maximize usable workspace) */}
        {!isFullBleed && (
          <header className="workspace-header sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border/50 bg-background/95 px-4 backdrop-blur-sm md:px-6">
            <div className="flex items-center gap-3 min-w-0">
              {/* Mobile Menu Trigger */}
              <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="md:hidden hover:bg-muted/60 rounded-lg transition-colors">
                    <Menu className="h-5 w-5 text-foreground" />
                    <span className="sr-only">Toggle menu</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="p-0 w-[280px] border-r border-border/80 bg-sidebar">
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
                className="hidden md:inline-flex hover:bg-muted/60 rounded-lg transition-colors"
                onClick={() => {
                  autoCollapseRef.current = false;
                  setIsSidebarCollapsed((prev) => !prev);
                }}
              >
                {isSidebarCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
                <span className="sr-only">Toggle sidebar</span>
              </Button>

              <div className="hidden lg:block min-w-0 ml-2">
                <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground">{pageMeta.section}</p>
                <h2 className="text-sm font-semibold text-foreground truncate">{pageMeta.title}</h2>
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-xl border border-border/50 bg-card/90 px-2 py-1.5">
              {/* Messages Button */}
              <Link href="/messages">
                <button
                  className={cn(
                    "relative flex items-center justify-center h-9 w-9 rounded-xl transition-colors",
                    unreadMessageCount > 0
                      ? "bg-emerald-500/12 text-emerald-700 hover:bg-emerald-500/20"
                      : "bg-muted/50 hover:bg-muted"
                  )}
                  title="Messages"
                >
                  <Inbox className={cn("h-4 w-4", unreadMessageCount > 0 ? "text-emerald-700" : "text-muted-foreground")} />
                  {unreadMessageCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                    </span>
                  )}
                </button>
              </Link>
              
              {/* Compli-ee Help Button */}
              <div className="flex items-center gap-2">
                <ComplieeIdleButton onClick={openChatAssistant} />
                <div className="hidden xl:flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/40 px-2 py-1 text-[10px] font-medium text-muted-foreground">
                  <span>Open</span>
                  <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] leading-none text-foreground">Ctrl + /</kbd>
                </div>
              </div>
              
              <div className="group flex cursor-pointer items-center gap-2.5 rounded-lg border border-border/40 bg-muted/30 py-1 pl-3 pr-1 transition-all hover:border-border/60">
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-bold leading-tight text-foreground group-hover:text-primary transition-colors">
                    {user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.username}
                  </p>
                  <div className="flex items-center justify-end gap-1.5">
                    <span className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      isConnected ? "bg-emerald-500" : "bg-red-500"
                    )} />
                    <p className="text-[9px] font-black uppercase tracking-tighter leading-tight text-muted-foreground/60">
                      {user?.role} · {isConnected ? "online" : "offline"}
                    </p>
                  </div>
                </div>
                <div className="relative h-7 w-7 rounded-lg flex items-center justify-center font-bold uppercase text-[10px] bg-primary text-primary-foreground">
                  {user?.firstName ? user.firstName.substring(0, 1) : user?.username?.substring(0, 1) || "?"}
                  {user?.lastName ? user.lastName.substring(0, 1) : ""}
                  <div className={cn(
                    "absolute -top-1 -right-1 h-3 w-3 rounded-full border-2 border-background shadow-xs",
                    isConnected ? "bg-emerald-500" : "bg-red-500"
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
                <Button variant="outline" size="icon" className="md:hidden h-8 w-8 rounded-lg bg-background/95 shadow-sm">
                  <Menu className="h-4 w-4 text-foreground" />
                  <span className="sr-only">Toggle menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-[280px] border-r border-border/80 bg-sidebar">
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
              className="hidden md:inline-flex h-8 w-8 rounded-lg bg-background/95 shadow-sm"
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
              className="h-8 rounded-lg px-3 py-0 text-xs shadow-md shadow-emerald-500/30"
            />
            <div className="hidden lg:flex items-center gap-1.5 rounded-lg border border-border/70 bg-background/90 px-2 py-1 text-[10px] font-medium text-muted-foreground shadow-sm">
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
                  className={cn(
                    "rounded-xl border px-3 py-2 text-sm font-medium flex items-center gap-2",
                    style.className
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", style.iconClassName)} />
                  <span>{banner.text}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Page Content Area */}
        <div className={contentWrapperClass}>
          <div className={cardClass}>
            {isFullBleed ? (
              <Suspense fallback={
                <div className="flex-1 flex flex-col gap-4 animate-pulse">
                  <div className="h-8 w-48 bg-muted rounded-lg" />
                  <div className="h-4 w-full max-w-md bg-muted/60 rounded" />
                  <div className="h-4 w-full max-w-sm bg-muted/40 rounded" />
                  <div className="mt-6 h-32 w-full bg-muted/30 rounded-xl" />
                </div>
              }>
                <div className="flex-1 min-h-0 flex flex-col">
                  {children}
                </div>
              </Suspense>
            ) : (
              <>
                <div className="mb-5 sm:mb-6">
                  <p className="text-[11px] uppercase tracking-[0.12em] font-semibold text-muted-foreground">{pageMeta.section}</p>
                  <h1 className="text-2xl sm:text-3xl font-heading font-bold text-foreground mt-1">{pageMeta.title}</h1>
                  <p className="text-sm text-muted-foreground mt-2 max-w-3xl">{pageMeta.subtitle}</p>
                </div>
                <div className="h-px mb-4 sm:mb-5 bg-border/70" />
                <Suspense fallback={
                  <div className="flex-1 flex flex-col gap-4 animate-pulse">
                    <div className="h-8 w-48 bg-muted rounded-lg" />
                    <div className="h-4 w-full max-w-md bg-muted/60 rounded" />
                    <div className="h-4 w-full max-w-sm bg-muted/40 rounded" />
                    <div className="mt-6 h-32 w-full bg-muted/30 rounded-xl" />
                  </div>
                }>
                  <div className="flex-1 min-h-0 flex flex-col">
                    {children}
                  </div>
                </Suspense>
              </>
            )}
          </div>
        </div>

        </main>

        {/* Footer */}
        {!isSingleScreenRoute && (
          <footer className="workspace-footer flex-shrink-0 border-t border-border/40 bg-background/95 px-4 py-2.5">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5 font-medium">
                <span>{new Date().getFullYear()} CareAssurance</span>
                <span className="hidden sm:inline text-muted-foreground">·</span>
                <span className="hidden sm:inline">Precision tools for high-trust care teams</span>
              </div>
              <div className="flex items-center gap-4">
                <Link href="/terms" className="transition-colors hover:text-foreground" data-testid="link-footer-terms">
                  Terms & Conditions
                </Link>
                <Link href="/privacy" className="transition-colors hover:text-foreground" data-testid="link-footer-privacy">
                  Privacy Policy
                </Link>
              </div>
            </div>
          </footer>
        )}
      </div>

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
