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
  Search,
  ArrowRightLeft,
  GraduationCap,
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
import { QuickNotes } from "@/components/QuickNotes";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { useScrollToTop } from "@/hooks/useScrollToTop";
import { useRecentPages } from "@/hooks/useRecentPages";
import { useSessionTimer } from "@/hooks/useSessionTimer";

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
    match: (path) => path === "/cqc-assessment",
    meta: {
      section: "Assurance",
      title: "CQC Self-Assessment",
      subtitle: "Rate your service against CQC Key Lines of Enquiry with evidence-based scoring.",
    },
  },
  {
    match: (path) => path === "/policy-acknowledgement",
    meta: {
      section: "Assurance",
      title: "Policy Acknowledgement",
      subtitle: "Read and electronically sign policy documents to maintain compliance records.",
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
      "flex items-center gap-2.5 rounded-md text-[0.8rem] font-medium tracking-[0.004em] transition-all duration-120 group cursor-pointer",
      isCollapsed ? "px-2.5 py-2 justify-center gap-0" : "px-3 py-[0.375rem]",
      isActive
        ? "bg-sidebar-primary/10 text-sidebar-primary font-semibold"
        : "text-sidebar-foreground/55 hover:text-sidebar-foreground/85 hover:bg-sidebar-foreground/[0.05]"
    ), [isCollapsed]);

  const subNavLinkClass = useCallback((isActive: boolean) =>
    cn(
      "flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[0.76rem] font-medium transition-all duration-120",
      isActive
        ? "bg-sidebar-primary/8 text-sidebar-primary"
        : "text-sidebar-foreground/45 hover:text-sidebar-foreground/75 hover:bg-sidebar-foreground/[0.04]"
    ), []);

  const labelClass = cn(
    "whitespace-nowrap transition-opacity duration-200",
    isCollapsed && "opacity-0 w-0 overflow-hidden"
  );

  return (
    <div className="flex h-full flex-col bg-sidebar">
      {/* Logo Section */}
      <div className={cn("px-5 pt-5 pb-3.5", isCollapsed && "px-3 pt-4 pb-3")}>
        <Link href="/">
          <div 
            onClick={handleSecretClick}
            className={cn("flex items-center gap-3 cursor-pointer group", isCollapsed && "justify-center")}
          >
            <div className="relative h-8 w-8 rounded-lg flex items-center justify-center bg-sidebar-primary/12 border border-sidebar-primary/15">
              <ShieldCheck className="h-4 w-4 text-sidebar-primary" />
            </div>
            {!isCollapsed && (
              <div className="flex flex-col">
              <h1 className="font-heading text-[14px] leading-none tracking-[-0.015em]">
                <span className="font-bold text-sidebar-foreground">Care</span><span className="font-normal text-sidebar-foreground/50">Assurance</span>
              </h1>
              <span className="text-[9px] mt-0.5 font-semibold uppercase tracking-[0.1em] text-sidebar-foreground/35">Operations Platform</span>
            </div>
            )}
          </div>
        </Link>
      </div>

      {/* Divider */}
      <div className={cn("mx-5 h-px bg-sidebar-border/50", isCollapsed && "mx-3")} />

      <nav aria-label="Main navigation" className={cn("flex-1 space-y-0.5 py-2.5 overflow-y-auto overscroll-contain", isCollapsed ? "px-2" : "px-3")}>
        
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
          <div className="px-3 pt-4 pb-1">
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-sidebar-foreground/25">Modules</span>
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
            "flex items-center justify-between w-full px-3 py-[0.4375rem] text-[0.82rem] font-medium rounded-lg transition-all group hover:bg-sidebar-foreground/[0.06]",
            isCollapsed && "justify-center px-2.5"
           )}>
            <div className={cn("flex items-center gap-3", isCollapsed && "gap-0")}>
              <Users size={16} className="text-sidebar-foreground/50" />
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
            "flex items-center justify-between w-full px-3 py-[0.4375rem] text-[0.82rem] font-medium rounded-lg transition-all group hover:bg-sidebar-foreground/[0.06]",
            isCollapsed && "justify-center px-2.5"
           )}>
            <div className={cn("flex items-center gap-3", isCollapsed && "gap-0")}>
              <UserCog size={16} className="text-sidebar-foreground/50" />
               <span className={labelClass}>Care Workers</span>
            </div>
            {!isCollapsed && (
              <ChevronDown size={13} className={cn("transition-transform duration-150 text-sidebar-foreground/40", openCareWorkers ? "rotate-180" : "")}/>
            )}
          </CollapsibleTrigger>
          {!isCollapsed && (
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
             <Link href="/care-workers/handovers" className={subNavLinkClass(location === "/care-workers/handovers")}>
                <ArrowRightLeft size={14} /> Shift Handovers
             </Link>
             <Link href="/care-workers/training" className={subNavLinkClass(location === "/care-workers/training")}>
                <GraduationCap size={14} /> Training
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
              "flex items-center justify-between w-full px-3 py-[0.4375rem] text-[0.82rem] font-medium rounded-lg transition-all group hover:bg-sidebar-foreground/[0.06]",
              isCollapsed && "justify-center px-2.5"
            )}>
              <div className={cn("flex items-center gap-3", isCollapsed && "gap-0")}>
                <Lock size={16} className="text-sidebar-foreground/50" />
                <span className={labelClass}>Admin</span>
              </div>
              {!isCollapsed && (
                <ChevronDown size={13} className={cn("transition-transform duration-150 text-sidebar-foreground/40", openAdmin ? "rotate-180" : "")} />
              )}
            </CollapsibleTrigger>
            {!isCollapsed && (
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
            )}
          </Collapsible>
        )}
      </nav>

      {/* Footer Actions */}
      <div className={cn("px-3 pb-4 space-y-0.5 mt-auto border-t border-sidebar-border/50 pt-3", isCollapsed && "px-2")}>
        <Link
          href="/settings"
          className={cn(
            "w-full flex items-center gap-3 rounded-lg text-[0.82rem] font-medium transition-all text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.06]",
            isCollapsed ? "justify-center px-2.5 py-2.5 gap-0" : "px-3 py-[0.4375rem]"
          )}
          data-testid="button-settings"
          title={isCollapsed ? "System Settings" : undefined}
        >
          <Settings size={16} />
          <span className={labelClass}>System Settings</span>
        </Link>
        <button
          className={cn(
            "w-full flex items-center gap-3 rounded-lg text-[0.82rem] font-medium transition-all text-red-400/70 hover:text-red-400 hover:bg-red-500/8",
            isCollapsed ? "justify-center px-2.5 py-2.5 gap-0" : "px-3 py-[0.4375rem]"
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
  const breadcrumbs = useMemo(() => {
    const crumbs: Array<{ label: string; href?: string }> = [];
    if (location === "/dashboard") {
      crumbs.push({ label: "Dashboard" });
    } else if (location === "/messages") {
      crumbs.push({ label: "Messages" });
    } else if (location === "/email-assistant") {
      crumbs.push({ label: "Email Assistant" });
    } else if (location === "/compliance") {
      crumbs.push({ label: "Compliance" });
    } else if (location === "/settings") {
      crumbs.push({ label: "Settings" });
    } else if (location.startsWith("/service-users")) {
      crumbs.push({ label: "Service Users", href: "/service-users/upload" });
      if (location === "/service-users/upload") crumbs.push({ label: "Data Upload" });
      else if (location === "/service-users/care-planning") crumbs.push({ label: "Care Planning" });
      else if (location === "/service-users/risk-assessment") crumbs.push({ label: "Risk Assessment" });
      else if (location === "/service-users/plan-enhancer") crumbs.push({ label: "Plan Enhancer" });
    } else if (location.startsWith("/care-workers")) {
      crumbs.push({ label: "Care Workers", href: "/care-workers/list" });
      if (location === "/care-workers/list") crumbs.push({ label: "Carers" });
      else if (location === "/care-workers/emar-audit") crumbs.push({ label: "EMAR Audit" });
      else if (location === "/care-workers/visit-audit") crumbs.push({ label: "Visit Audit" });
      else if (location === "/care-workers/performance") crumbs.push({ label: "Performance" });
    } else if (location.startsWith("/rostering")) {
      crumbs.push({ label: "Rostering Studio" });
    } else if (location === "/call-reconciliation") {
      crumbs.push({ label: "Call Reconciliation" });
    } else if (location === "/shadow-admin-portal") {
      crumbs.push({ label: "Admin", href: "/shadow-admin-portal" });
      crumbs.push({ label: "Administrator Controls" });
    } else if (location === "/system-logs") {
      crumbs.push({ label: "Admin", href: "/shadow-admin-portal" });
      crumbs.push({ label: "System Logs" });
    } else if (location === "/billing-tool") {
      crumbs.push({ label: "Admin", href: "/shadow-admin-portal" });
      crumbs.push({ label: "Billing Tool" });
    } else if (location === "/roi-calculator") {
      crumbs.push({ label: "Features & Benefits" });
    }
    return crumbs;
  }, [location]);

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
      if (isDisposed || document.visibilityState === "hidden") return;
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

    fetchUnreadCount();
    const interval = window.setInterval(fetchUnreadCount, 120000);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isDisposed = true;
      controller?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
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
      if (document.visibilityState === "hidden") return;
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
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      controller?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
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
    isFullBleed ? "px-0 py-0" : "px-3 sm:px-4 lg:px-5 pt-3 sm:pt-4 lg:pt-5 pb-4 sm:pb-5 lg:pb-6",
    isSingleScreenRoute && "h-full"
  );
  const cardClass = cn(
    "workspace-card rounded-xl border border-border/40 bg-card p-4 sm:p-5 lg:p-6 flex flex-col w-full flex-1 min-h-0 motion-safe:animate-[fade-in_120ms_ease-out]",
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
      className: "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300",
      iconClassName: "text-blue-600 dark:text-blue-400",
    },
    warning: {
      className: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      iconClassName: "text-amber-600 dark:text-amber-400",
    },
    critical: {
      className: "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300",
      iconClassName: "text-red-600 dark:text-red-400",
    },
  };

  return (
    <div className="workspace-root relative flex h-[100dvh] min-h-screen w-full overflow-hidden bg-background">
      {/* Skip Navigation Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground focus:shadow-lg focus:outline-none"
      >
        Skip to main content
      </a>

      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "workspace-sidebar hidden md:flex flex-shrink-0 flex-col z-20 border-r border-sidebar-border bg-sidebar transition-all duration-200",
          isSidebarCollapsed ? "w-[72px]" : "w-[260px]"
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
      </aside>

      {/* Main + Footer Column */}
      <div className="relative z-10 flex w-full min-h-0 flex-1 flex-col">
        {/* Main Content */}
        <main id="main-content" tabIndex={-1} data-scroll-region className={mainClass} aria-label={pageMeta.title || "Main content"} style={{ outline: "none" }}>
        {/* Header (hidden on full-bleed studio routes to maximize usable workspace) */}
        {!isFullBleed && (
          <header className="workspace-header sticky top-0 z-30 flex h-[3.25rem] items-center justify-between border-b border-border/30 bg-background/95 backdrop-blur-sm px-4 md:px-5 transition-[background-color,border-color] duration-200" role="banner" aria-label="Page header">
            <div className="flex items-center gap-3 min-w-0">
              {/* Mobile Menu Trigger */}
              <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="md:hidden hover:bg-muted/60 rounded-lg transition-colors h-8 w-8">
                    <Menu className="h-4.5 w-4.5 text-foreground" />
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
                className="hidden md:inline-flex hover:bg-muted/60 rounded-lg transition-colors h-8 w-8"
                onClick={() => {
                  autoCollapseRef.current = false;
                  setIsSidebarCollapsed((prev) => !prev);
                }}
              >
                {isSidebarCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
                <span className="sr-only">Toggle sidebar</span>
              </Button>

              <div className="hidden lg:flex items-center gap-2.5 min-w-0 ml-1">
                <div className="min-w-0">
                  <p className="text-[9px] uppercase tracking-[0.12em] font-bold text-primary/50">{pageMeta.section}</p>
                  <h2 className="text-[0.84rem] font-semibold tracking-[-0.01em] text-foreground truncate leading-tight">{pageMeta.title}</h2>
                </div>
                {breadcrumbs.length > 0 && (
                  <div className="hidden xl:block border-l border-border/40 pl-3 ml-1">
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

            <div className="flex items-center gap-1.5 rounded-lg border border-border/40 bg-card/60 px-1.5 py-0.5">
              {/* Command Palette Trigger */}
              <button
                onClick={() => setIsCommandPaletteOpen(true)}
                className="hidden md:flex items-center gap-2 rounded-md border border-border/50 bg-muted/35 px-2.5 py-1 text-[0.75rem] font-medium text-muted-foreground hover:bg-muted/55 hover:text-foreground transition-colors cursor-pointer"
                title="Command Palette (Ctrl+K)"
              >
                <Search className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">Search...</span>
                <kbd className="rounded border border-border/70 bg-background px-1.5 py-0.5 font-mono text-[9px] leading-none text-muted-foreground">⌘K</kbd>
              </button>

              {/* Notification Center (admin alerts) */}
              <NotificationCenter />

              {/* Messages Button */}
              <Link href="/messages">
                <button
                  className={cn(
                    "relative flex items-center justify-center h-8 w-8 rounded-lg transition-colors",
                    unreadMessageCount > 0
                      ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/18"
                      : "bg-muted/40 hover:bg-muted/60"
                  )}
                  title="Messages"
                  aria-label={unreadMessageCount > 0 ? `Messages (${unreadMessageCount} unread)` : "Messages"}
                >
                  <Inbox className={cn("h-4 w-4", unreadMessageCount > 0 ? "text-emerald-600" : "text-muted-foreground")} />
                  {unreadMessageCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-4.5 min-w-4.5 px-1 rounded-full bg-emerald-500 text-white text-[9px] font-bold flex items-center justify-center shadow-sm">
                      {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                    </span>
                  )}
                </button>
              </Link>
              
              {/* Compli-ee Help Button */}
              <div className="flex items-center gap-1.5">
                <ComplieeIdleButton onClick={openChatAssistant} />
                <div className="hidden xl:flex items-center gap-1 rounded-md border border-border/50 bg-muted/35 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                  <kbd className="font-mono text-[9px] text-muted-foreground">Ctrl /</kbd>
                </div>
              </div>
              
              <div className="group flex cursor-pointer items-center gap-2.5 rounded-lg border border-border/40 bg-muted/25 py-1.5 pl-3 pr-1.5 transition-colors duration-150 hover:border-primary/20 hover:bg-muted/40">
                <div className="text-right hidden sm:block">
                  <p className="text-[10.5px] font-semibold leading-tight text-foreground group-hover:text-primary transition-colors">
                    {displayName}
                  </p>
                  <div className="flex items-center justify-end gap-1 mt-0.5">
                    <span
                      title={isConnected ? "Online" : "Offline"}
                      className={cn("h-1.5 w-1.5 rounded-full transition-colors", isConnected ? "bg-emerald-500" : "bg-red-500")}
                    />
                    {user?.role === "admin" && (
                      <span className="inline-flex items-center rounded-full border border-border/50 bg-background/60 px-1.5 py-0 text-[7px] font-medium uppercase tracking-[0.04em] leading-[1.2] text-muted-foreground/85">
                        admin
                      </span>
                    )}
                  </div>
                </div>
                <div className="relative h-7 w-7 rounded-lg flex items-center justify-center font-bold uppercase text-[10px] bg-primary text-primary-foreground shadow-sm">
                  {user?.firstName ? user.firstName.substring(0, 1) : user?.username?.substring(0, 1) || "?"}
                  {user?.lastName ? user.lastName.substring(0, 1) : ""}
                  <div className={cn(
                    "absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background transition-colors",
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
                <PageTransition>
                  {children}
                </PageTransition>
              </Suspense>
            ) : (
              <>
                <div className="mb-5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="inline-block h-1 w-1 rounded-full bg-primary/50" />
                    <p className="text-[9px] uppercase tracking-[0.1em] font-bold text-primary/45">{pageMeta.section}</p>
                  </div>
                  <h1 className="text-lg sm:text-xl font-heading font-bold text-foreground tracking-[-0.015em] leading-tight">{pageMeta.title}</h1>
                  <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">{pageMeta.subtitle}</p>
                </div>
                <div className="h-px mb-4 bg-border/30" />
                <Suspense fallback={
                  <div className="flex-1 flex flex-col gap-4 animate-pulse">
                    <div className="h-8 w-48 bg-muted rounded-lg" />
                    <div className="h-4 w-full max-w-md bg-muted/60 rounded" />
                    <div className="h-4 w-full max-w-sm bg-muted/40 rounded" />
                    <div className="mt-6 h-32 w-full bg-muted/30 rounded-xl" />
                  </div>
                }>
                  <PageTransition>
                    {children}
                  </PageTransition>
                </Suspense>
              </>
            )}
          </div>
        </div>

        </main>

        {/* Footer */}
        {!isSingleScreenRoute && (
          <footer className="workspace-footer flex-shrink-0 border-t border-border/20 bg-background/80 px-4 py-2 transition-[background-color,border-color] duration-200">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-1 text-[11px] text-muted-foreground/70">
              <div className="flex items-center gap-2 font-medium">
                <span className="text-foreground/55">&copy; {new Date().getFullYear()} CareAssurance</span>
                <span className="hidden sm:inline text-muted-foreground/20">&middot;</span>
                <span className="hidden sm:inline text-muted-foreground/60 text-[10px]">Precision tools for high-trust care teams</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden md:flex items-center gap-1.5 text-[9px] text-muted-foreground/60 font-medium tabular-nums">
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-muted/40 transition-colors cursor-help">
                          <span className={cn(
                            "h-1.5 w-1.5 rounded-full transition-colors",
                            isConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"
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

      {/* Quick Notes widget */}
      <QuickNotes />

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
