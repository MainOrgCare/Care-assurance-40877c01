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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect, Suspense, memo, useCallback, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTemporaryData } from "@/context/TemporaryDataContext";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";

const SidebarContent = memo(function SidebarContent({ location, handleSecretClick, logout }: { location: string, handleSecretClick: (e: React.MouseEvent) => void, logout: () => void }) {
  const { user } = useAuth();
  const { timeLeft } = useTemporaryData();
  const isAdminUser = user?.role === "admin";
  
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
    location === "/rostering-hub" ||
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
          location === "/rostering-hub" ||
          location === "/billing-tool" ||
          location === "/system-logs")
      ) {
        setOpenAdmin(true);
      }
  }, [location, isAdminUser]);

  const navLinkClass = useCallback((isActive: boolean) =>
    cn(
      "flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 group cursor-pointer relative overflow-hidden",
      isActive
        ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 scale-[1.02]"
        : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
    ), []);

  const subNavLinkClass = useCallback((isActive: boolean) =>
    cn(
      "flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200",
      isActive
        ? "bg-primary/10 text-primary border-l-2 border-primary"
        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
    ), []);

  return (
    <div className="flex flex-col h-full bg-sidebar">
      {/* Logo Section */}
      <div className="px-6 pt-8 pb-6">
        <Link href="/">
          <div 
            onClick={handleSecretClick}
            className="flex items-center gap-4 cursor-pointer group"
          >
            <div className="relative h-11 w-11 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-500 bg-gradient-to-br from-primary to-primary/80 group-hover:rotate-6 group-hover:scale-110">
              <ShieldCheck className="h-6 w-6 text-white" />
              <div className="absolute inset-0 rounded-2xl bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="flex flex-col">
              <h1 className="font-heading text-xl leading-none tracking-tighter">
                <span className="font-black text-foreground">Care</span><span className="font-medium text-muted-foreground/80">Assurance</span>
              </h1>
              <span className="text-[9px] mt-1 font-bold uppercase tracking-[0.25em] text-primary/70">OPERATIONS OS</span>
            </div>
          </div>
        </Link>
      </div>

      {/* Divider */}
      <div className="mx-6 h-px bg-border/40" />

      <nav className="flex-1 px-3 space-y-1 py-3 overflow-y-auto">
        
        {/* Dashboard */}
        <Link href="/dashboard" className={navLinkClass(location === "/dashboard")}>
            <LayoutDashboard size={18} />
            Dashboard
            {location === "/dashboard" && <ArrowUpRight size={14} className="ml-auto opacity-60" />}
        </Link>

        {/* Email Assistant */}
        <Link href="/email-assistant" className={navLinkClass(location === "/email-assistant")}>
          <Mail size={18} />
          Email Assistant
        </Link>

        {/* Compliance */}
        <Link href="/compliance" className={navLinkClass(location === "/compliance")}>
          <CheckCircle size={18} />
          Compliance
        </Link>

        {/* Section Label */}
        <div className="pt-3 pb-1.5 px-4">
          <span className="text-[10px] uppercase tracking-[0.2em] font-medium text-muted-foreground">Modules</span>
        </div>

        {/* Service Users */}
        <Collapsible open={openServiceUsers} onOpenChange={setOpenServiceUsers} className="space-y-0.5">
           <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-2.5 text-sm font-medium rounded-xl transition-all group hover:bg-muted">
            <div className="flex items-center gap-3">
              <Users size={18} className="text-muted-foreground" />
               Service Users
            </div>
            <div className="flex items-center gap-2">
               {timeLeft !== null && (
                 <Badge variant="destructive" className="h-5 px-1.5 text-[9px] animate-pulse">
                   {formatTime(timeLeft)}
                 </Badge>
               )}
              <ChevronDown size={14} className={cn("transition-transform duration-200 text-muted-foreground", openServiceUsers ? "rotate-180" : "")} />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-0.5 pl-3">
             <Link href="/service-users/upload" className={subNavLinkClass(location === "/service-users/upload")}>
                <Upload size={15} /> Data Upload
             </Link>
             <Link href="/service-users/care-planning" className={subNavLinkClass(location === "/service-users/care-planning")}>
                <FileText size={15} /> Care Planning
             </Link>
             <Link href="/service-users/risk-assessment" className={subNavLinkClass(location === "/service-users/risk-assessment")}>
                <ShieldAlert size={15} /> Risk Assessment
             </Link>
             <Link href="/service-users/plan-enhancer" className={subNavLinkClass(location === "/service-users/plan-enhancer")}>
                <Sparkles size={15} /> Plan Enhancer
             </Link>
          </CollapsibleContent>
        </Collapsible>

        {/* Care Workers */}
        <Collapsible open={openCareWorkers} onOpenChange={setOpenCareWorkers} className="space-y-0.5">
           <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-2.5 text-sm font-medium rounded-xl transition-all group hover:bg-muted">
            <div className="flex items-center gap-3">
              <UserCog size={18} className="text-muted-foreground" />
               Care Workers
            </div>
            <ChevronDown size={14} className={cn("transition-transform duration-200 text-muted-foreground", openCareWorkers ? "rotate-180" : "")}/>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-0.5 pl-3">
             <Link href="/care-workers/list" className={subNavLinkClass(location === "/care-workers/list")}>
                <Users size={15} /> Carers
             </Link>
             <Link href="/care-workers/emar-audit" className={subNavLinkClass(location === "/care-workers/emar-audit")}>
                <Activity size={15} /> EMAR Audit
             </Link>
             <Link href="/care-workers/visit-audit" className={subNavLinkClass(location === "/care-workers/visit-audit")}>
                <ClipboardList size={15} /> Visit Audit
             </Link>
             <Link href="/care-workers/performance" className={subNavLinkClass(location === "/care-workers/performance")}>
                <BarChart size={15} /> Performance
             </Link>
          </CollapsibleContent>
        </Collapsible>

        {/* Admin */}
        {isAdminUser && (
          <Collapsible open={openAdmin} onOpenChange={setOpenAdmin} className="space-y-0.5">
            <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-2.5 text-sm font-medium rounded-xl transition-all group hover:bg-muted">
              <div className="flex items-center gap-3">
                <Lock size={18} className="text-muted-foreground" />
                Admin
              </div>
              <ChevronDown size={14} className={cn("transition-transform duration-200 text-muted-foreground", openAdmin ? "rotate-180" : "")} />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-0.5 pl-3">
              <Link href="/shadow-admin-portal" className={subNavLinkClass(location === "/shadow-admin-portal")}>
                <ShieldCheck size={15} /> Administrator Controls
              </Link>
              <Link href="/roi-calculator" className={subNavLinkClass(location === "/roi-calculator")} data-testid="link-roi-calculator">
                <Calculator size={15} /> Features & Benefits
              </Link>
              <Link href="/testing-features" className={subNavLinkClass(location === "/testing-features")}>
                <FlaskConical size={15} /> Testing Features
              </Link>
              <Link href="/system-logs" className={subNavLinkClass(location === "/system-logs")}>
                <Terminal size={15} /> System Logs
              </Link>
              <Link
                href="/rostering-hub"
                className={subNavLinkClass(location === "/rostering-hub")}
              >
                <ClipboardList size={15} /> Rostering Hub
              </Link>
              <Link href="/billing-tool" className={subNavLinkClass(location === "/billing-tool")} data-testid="link-billing-tool">
                <FileSpreadsheet size={15} /> Billing Tool
              </Link>
            </CollapsibleContent>
          </Collapsible>
        )}
      </nav>

      {/* Footer Actions */}
      <div className="px-3 pb-6 space-y-1 mt-auto border-t border-border/40 pt-4">
        <Link
          href="/settings"
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all hover:bg-muted text-muted-foreground hover:text-foreground"
          data-testid="button-settings"
        >
          <Settings size={18} />
          System Settings
        </Link>
        <button
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all text-destructive hover:bg-destructive/10"
          onClick={logout}
        >
          <LogOut size={18} />
          Terminate Session
        </button>
      </div>
    </div>
  );
});

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const isFullBleed = location === "/rostering-hub";
  const [clickCount, setClickCount] = useState(0);
  const { user, logout } = useAuth();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const contentWrapperClass = cn(
    "px-3 sm:px-4 lg:px-5 py-4 sm:py-5 lg:py-6 w-full flex-1 min-h-0",
    isFullBleed && "px-0 py-0"
  );
  const cardClass = cn(
    "glass-card rounded-lg border border-border/70 p-4 sm:p-6 lg:p-8 flex-1 min-h-0 flex flex-col shadow-md animate-fade-in w-full",
    isFullBleed && "p-0 border-0 rounded-none shadow-none bg-transparent"
  );

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

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-[280px] flex-shrink-0 flex-col z-20 border-r border-border/50 bg-sidebar">
        <SidebarContent location={location} handleSecretClick={handleSecretClick} logout={logout} />
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto flex flex-col w-full relative z-10 scroll-smooth">
        {/* Header */}
        <header className="h-16 px-6 md:px-8 flex items-center justify-between sticky top-0 z-30 bg-background/95 border-b border-border/40">
          <div className="flex items-center gap-4">
            {/* Mobile Menu Trigger */}
            <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden hover:bg-muted/80 rounded-xl transition-all">
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

            <div className="flex items-center gap-2 px-1">
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Network Operational</span>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <div className="flex items-center gap-3 bg-muted/30 pl-4 pr-1.5 py-1.5 rounded-2xl border border-border/40 hover:border-border/80 transition-all cursor-pointer group">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold leading-tight text-foreground group-hover:text-primary transition-colors">
                  {user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.username}
                </p>
                <p className="text-[9px] font-black uppercase tracking-tighter leading-tight text-muted-foreground/60">{user?.role}</p>
              </div>
              <div className="relative h-8 w-8 rounded-xl flex items-center justify-center font-black uppercase text-[10px] bg-primary text-primary-foreground shadow-sm shadow-primary/20 group-hover:scale-105 transition-transform">
                {user?.firstName ? user.firstName.substring(0, 1) : user?.username?.substring(0, 1) || "?"}
                {user?.lastName ? user.lastName.substring(0, 1) : ""}
                <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-success border-2 border-background shadow-xs" />
              </div>
            </div>
          </div>
        </header>

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
                {/* Internal Page Brand Header */}
                <div className="flex flex-wrap items-center gap-4 justify-between mb-8 sm:mb-10">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl flex items-center justify-center font-black text-xs bg-muted border border-border/60 shadow-xs text-primary group-hover:bg-primary transition-all">
                      CA
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10px] uppercase font-black tracking-[0.3em] text-muted-foreground/50">Enterprise Intelligence</p>
                      <p className="text-lg font-heading font-black tracking-tight text-foreground">Module Pipeline</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border border-emerald-200 text-emerald-700 bg-emerald-50">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      Live
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border border-primary/30 text-primary bg-primary/10">
                      <span className="h-2 w-2 rounded-full bg-primary" />
                      Secure
                    </span>
                  </div>
                </div>
                <div className="h-px mb-4 sm:mb-5 bg-border/80" />
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

        {/* Footer */}
        <footer className="px-4 py-3 border-t border-border/80 bg-background">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-muted-foreground">
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
      </main>
    </div>
  );
}
