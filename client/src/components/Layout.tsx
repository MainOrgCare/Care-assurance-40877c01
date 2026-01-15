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
  ArrowUpRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTemporaryData } from "@/context/TemporaryDataContext";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";

const SidebarContent = ({ location, handleSecretClick, logout }: { location: string, handleSecretClick: (e: React.MouseEvent) => void, logout: () => void }) => {
  const { user } = useAuth();
  const { timeLeft } = useTemporaryData();
  const isAdminUser = user?.role === "admin";
  
  // Format timer
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const [openServiceUsers, setOpenServiceUsers] = useState(location.startsWith("/service-users"));
  const [openCareWorkers, setOpenCareWorkers] = useState(location.startsWith("/care-workers"));
  const isAdminRoute =
    location.startsWith("/admin") ||
    location === "/shadow-admin-portal" ||
    location === "/testing-features" ||
    location === "/care-worker-rotas";
  const [openAdmin, setOpenAdmin] = useState(isAdminUser && isAdminRoute);

  // Auto-open accordion based on route
  useEffect(() => {
     if (location.startsWith("/service-users")) setOpenServiceUsers(true);
     if (location.startsWith("/care-workers")) setOpenCareWorkers(true);
      if (
        isAdminUser &&
        (location.startsWith("/admin") || location === "/shadow-admin-portal" || location === "/testing-features" || location === "/care-worker-rotas")
      ) {
        setOpenAdmin(true);
      }
  }, [location]);

  return (
    <div className="flex flex-col h-full">
      {/* Logo Section */}
      <div className="p-5 pb-4">
        <Link href="/">
          <div 
            onClick={handleSecretClick}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="relative h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-[0_4px_12px_rgba(59,180,200,0.25)] ring-1 ring-white/10 group-hover:shadow-[0_6px_20px_rgba(59,180,200,0.35)] transition-all duration-300">
              <ShieldCheck className="h-5 w-5 text-white" />
              <div className="absolute inset-0 rounded-xl bg-gradient-to-t from-transparent to-white/10" />
            </div>
            <div>
              <h1 className="font-heading text-lg text-sidebar-foreground leading-none">
                <span className="font-bold">Care</span><span className="font-normal text-sidebar-foreground/80">Assurance</span>
              </h1>
              <p className="text-[10px] text-sidebar-foreground/50 mt-0.5 uppercase tracking-[0.15em]">Operations Platform</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Divider */}
      <div className="mx-4 h-px bg-gradient-to-r from-transparent via-sidebar-border to-transparent" />

      <nav className="flex-1 px-3 space-y-1 py-4 overflow-y-auto">
        
        {/* Dashboard - Top Level */}
        <Link href="/dashboard" className={cn(
          "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group cursor-pointer",
          location === "/dashboard" 
            ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-[0_2px_12px_rgba(59,180,200,0.3)] ring-1 ring-white/10" 
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        )}>
            <LayoutDashboard size={18} className={cn("transition-colors", location === "/dashboard" ? "text-white" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground")} />
            Dashboard
            {location === "/dashboard" && <ArrowUpRight size={14} className="ml-auto opacity-60" />}
        </Link>

        {/* Tools - Top Level */}
        <Link href="/email-assistant" className={cn(
          "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group cursor-pointer",
          location === "/email-assistant"
            ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-[0_2px_12px_rgba(59,180,200,0.3)] ring-1 ring-white/10"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        )}>
          <Mail size={18} className={cn("transition-colors", location === "/email-assistant" ? "text-white" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground")} />
          Email Assistant
        </Link>

        <Link href="/compliance" className={cn(
          "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group cursor-pointer",
          location === "/compliance"
            ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-[0_2px_12px_rgba(59,180,200,0.3)] ring-1 ring-white/10"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        )}>
          <CheckCircle size={18} className={cn("transition-colors", location === "/compliance" ? "text-white" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground")} />
          Compliance
        </Link>

        {/* Section Label */}
        <div className="pt-4 pb-2 px-4">
          <span className="text-[10px] uppercase tracking-[0.2em] text-sidebar-foreground/40 font-medium">Modules</span>
        </div>

        {/* Dropdown 1: Service Users */}
        <Collapsible open={openServiceUsers} onOpenChange={setOpenServiceUsers} className="space-y-0.5">
          <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-2.5 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground rounded-xl transition-all group">
            <div className="flex items-center gap-3">
               <Users size={18} className="text-sidebar-foreground/50 group-hover:text-sidebar-foreground" />
               Service Users
            </div>
            <div className="flex items-center gap-2">
               {timeLeft !== null && (
                 <Badge variant="destructive" className="h-5 px-1.5 text-[9px] animate-pulse">
                   {formatTime(timeLeft)}
                 </Badge>
               )}
               <ChevronDown size={14} className={cn("transition-transform duration-200 text-sidebar-foreground/40", openServiceUsers ? "rotate-180" : "")} />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-0.5 pl-3">
             <Link href="/service-users/upload" className={cn("flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-all", location === "/service-users/upload" ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-sidebar-accent/50")}>
                <Upload size={15} /> Data Upload
             </Link>
             <Link href="/service-users/care-planning" className={cn("flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-all", location === "/service-users/care-planning" ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-sidebar-accent/50")}>
                <FileText size={15} /> Care Planning
             </Link>
             <Link href="/service-users/risk-assessment" className={cn("flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-all", location === "/service-users/risk-assessment" ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-sidebar-accent/50")}>
                <ShieldAlert size={15} /> Risk Assessment
             </Link>
             <Link href="/service-users/plan-enhancer" className={cn("flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-all", location === "/service-users/plan-enhancer" ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-sidebar-accent/50")}>
                <Sparkles size={15} /> Plan Enhancer
             </Link>
          </CollapsibleContent>
        </Collapsible>

        {/* Dropdown 2: Care Workers */}
        <Collapsible open={openCareWorkers} onOpenChange={setOpenCareWorkers} className="space-y-0.5">
          <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-2.5 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground rounded-xl transition-all group">
            <div className="flex items-center gap-3">
               <UserCog size={18} className="text-sidebar-foreground/50 group-hover:text-sidebar-foreground" />
               Care Workers
            </div>
            <ChevronDown size={14} className={cn("transition-transform duration-200 text-sidebar-foreground/40", openCareWorkers ? "rotate-180" : "")} />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-0.5 pl-3">
             <Link href="/care-workers/list" className={cn("flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-all", location === "/care-workers/list" ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-sidebar-accent/50")}>
                <Users size={15} /> Carers
             </Link>
             <Link href="/care-workers/emar-audit" className={cn("flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-all", location === "/care-workers/emar-audit" ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-sidebar-accent/50")}>
                <Activity size={15} /> EMAR Audit
             </Link>
             <Link href="/care-workers/visit-audit" className={cn("flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-all", location === "/care-workers/visit-audit" ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-sidebar-accent/50")}>
                <ClipboardList size={15} /> Visit Audit
             </Link>
             <Link href="/care-workers/performance" className={cn("flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-all", location === "/care-workers/performance" ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-sidebar-accent/50")}>
                <BarChart size={15} /> Performance
             </Link>
          </CollapsibleContent>
        </Collapsible>

        {/* Dropdown 3: Admin (admin-only) */}
        {isAdminUser && (
          <Collapsible open={openAdmin} onOpenChange={setOpenAdmin} className="space-y-0.5">
            <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-2.5 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground rounded-xl transition-all group">
              <div className="flex items-center gap-3">
                <Lock size={18} className="text-sidebar-foreground/50 group-hover:text-sidebar-foreground" />
                Admin
              </div>
              <ChevronDown size={14} className={cn("transition-transform duration-200 text-sidebar-foreground/40", openAdmin ? "rotate-180" : "")} />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-0.5 pl-3">
              <Link
                href="/shadow-admin-portal"
                className={cn(
                  "flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-all",
                  location === "/shadow-admin-portal"
                    ? "bg-sidebar-accent text-sidebar-foreground"
                    : "text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                )}
              >
                <ShieldCheck size={15} /> Administrator Controls
              </Link>
              <Link
                href="/roi-calculator"
                className={cn(
                  "flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-all",
                  location === "/roi-calculator"
                    ? "bg-sidebar-accent text-sidebar-foreground"
                    : "text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                )}
                data-testid="link-roi-calculator"
              >
                <Calculator size={15} /> Features & Benefits
              </Link>
              <Link
                href="/testing-features"
                className={cn(
                  "flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-all",
                  location === "/testing-features"
                    ? "bg-sidebar-accent text-sidebar-foreground"
                    : "text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                )}
              >
                <FlaskConical size={15} /> Testing Features
              </Link>
              <Link
                href="/care-worker-rotas"
                className={cn(
                  "flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-all",
                  location === "/care-worker-rotas"
                    ? "bg-sidebar-accent text-sidebar-foreground"
                    : "text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                )}
              >
                <ClipboardList size={15} /> Care Worker Rotas
              </Link>
            </CollapsibleContent>
          </Collapsible>
        )}
      </nav>

      {/* Footer Actions */}
      <div className="p-3 border-t border-sidebar-border/50 space-y-1 mt-auto">
        <Link 
          href="/settings"
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all"
          data-testid="button-settings"
        >
          <Settings size={18} className="text-sidebar-foreground/50" />
          Settings
        </Link>
        <button className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-rose-400/80 hover:bg-rose-500/10 hover:text-rose-400 transition-all" onClick={logout}>
          <LogOut size={18} />
          Sign Out
        </button>
      </div>
    </div>
  );
};

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [clickCount, setClickCount] = useState(0);
  const { user, logout } = useAuth();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Secret Admin Trigger Logic
  const handleSecretClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Only allow admin to access secret portal
    if (user?.role !== 'admin') return;

    setClickCount(prev => {
      const newCount = prev + 1;
      if (newCount === 3) {
        setLocation("/shadow-admin-portal");
        return 0;
      }
      return newCount;
    });

    // Reset count if not clicked quickly enough
    setTimeout(() => setClickCount(0), 1000);
  };

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-background">
      {/* Ambient Background Effects */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-muted/30 to-background" />
        <div className="absolute -top-40 left-[8%] h-80 w-80 rounded-full bg-secondary/8 blur-[100px]" />
        <div className="absolute bottom-[-20%] right-[10%] h-[30rem] w-[30rem] rounded-full bg-primary/8 blur-[120px]" />
        <div className="absolute top-[40%] left-[50%] h-64 w-64 rounded-full bg-primary/5 blur-[80px]" />
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='0.5'%3E%3Ccircle cx='1' cy='1' r='1'/%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-[260px] flex-shrink-0 bg-sidebar/95 backdrop-blur-2xl border-r border-sidebar-border/60 flex-col z-10 shadow-[inset_-1px_0_0_rgba(255,255,255,0.03),0_0_60px_rgba(0,0,0,0.4)]">
        <SidebarContent location={location} handleSecretClick={handleSecretClick} logout={logout} />
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto flex flex-col w-full relative z-10">
        {/* Header */}
        <header className="h-14 border-b border-border/40 bg-background/80 backdrop-blur-2xl px-4 md:px-6 flex items-center justify-between sticky top-0 z-20 shadow-[0_1px_0_rgba(255,255,255,0.03)]">
          <div className="flex items-center gap-3">
            {/* Mobile Menu Trigger */}
            <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden mr-2 -ml-2 hover:bg-white/5">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Toggle menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-[260px] bg-sidebar border-r border-sidebar-border">
                <SidebarContent location={location} handleSecretClick={handleSecretClick} logout={() => { setIsMobileOpen(false); logout(); }} />
              </SheetContent>
            </Sheet>

            <div className="hidden md:flex flex-col">
              <span className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground/60 font-medium">
                Operations Console
              </span>
              <span className="text-sm font-heading text-foreground/90">
                Orchestrate confident care decisions
              </span>
            </div>
            <div className="md:hidden text-[9px] uppercase tracking-[0.2em] text-muted-foreground/60 font-medium">
              Ops Console
            </div>
          </div>

          <div className="flex items-center gap-3">
             <Badge variant="outline" className="hidden sm:inline-flex bg-primary/8 text-primary/90 border-primary/20 uppercase tracking-[0.15em] text-[9px] font-medium">
               Secure Workspace
             </Badge>
             <div className="flex items-center gap-2.5">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-foreground/90 leading-tight">
                    {user?.firstName && user?.lastName 
                      ? `${user.firstName} ${user.lastName}` 
                      : user?.username}
                  </p>
                  <p className="text-[10px] text-muted-foreground/70 capitalize leading-tight">{user?.role}</p>
                </div>
                <div className="relative h-8 w-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 text-primary flex items-center justify-center font-semibold uppercase text-xs ring-1 ring-primary/25 shadow-[0_2px_8px_rgba(59,180,200,0.15)]">
                  {user?.firstName ? user.firstName.substring(0,1) : user?.username?.substring(0,1) || '?'}
                  {user?.lastName ? user.lastName.substring(0,1) : ''}
                  <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
                </div>
             </div>
          </div>
        </header>

        {/* Page Content Area */}
        <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full flex-1 space-y-5">
          <div className="glass-card rounded-2xl p-5 md:p-7 shadow-xl ring-1 ring-white/[0.03]">
            {/* Page Header */}
            <div className="flex flex-wrap items-center gap-3 justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-sm shadow-[0_2px_8px_rgba(59,180,200,0.12)]">
                  CA
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground/60 uppercase tracking-[0.2em] font-medium">Care Assurance</p>
                  <p className="text-base font-heading text-foreground/90">Operational Intelligence</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20">
                  <span className="status-dot bg-emerald-500" />
                  Live
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium bg-primary/10 text-primary/80 ring-1 ring-primary/15">
                  <span className="status-dot bg-primary" />
                  Secure
                </span>
              </div>
            </div>
            <div className="h-px bg-gradient-to-r from-transparent via-border/50 to-transparent mb-5" />
            {children}
          </div>
        </div>
        
        {/* Footer */}
        <footer className="border-t border-border/30 bg-background/60 backdrop-blur-xl px-4 py-3 mt-auto">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-muted-foreground/60">
            <div className="flex items-center gap-1.5 font-medium">
              <span>&copy; {new Date().getFullYear()} CareAssurance</span>
              <span className="hidden sm:inline text-muted-foreground/40">·</span>
              <span className="hidden sm:inline">Precision tools for high-trust care teams</span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/terms" className="hover:text-foreground/80 transition-colors" data-testid="link-footer-terms">
                Terms & Conditions
              </Link>
              <Link href="/privacy" className="hover:text-foreground/80 transition-colors" data-testid="link-footer-privacy">
                Privacy Policy
              </Link>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
