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
  ArrowUpRight,
  FileSpreadsheet,
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
    location === "/care-worker-rotas" ||
    location === "/billing-tool";
  const [openAdmin, setOpenAdmin] = useState(isAdminUser && isAdminRoute);

  useEffect(() => {
     if (location.startsWith("/service-users")) setOpenServiceUsers(true);
     if (location.startsWith("/care-workers")) setOpenCareWorkers(true);
      if (
        isAdminUser &&
        (location.startsWith("/admin") || location === "/shadow-admin-portal" || location === "/testing-features" || location === "/care-worker-rotas" || location === "/billing-tool")
      ) {
        setOpenAdmin(true);
      }
  }, [location]);

  const navLinkClass = (isActive: boolean) =>
    cn(
      "flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group cursor-pointer",
      isActive ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground hover:bg-muted"
    );

  const subNavLinkClass = (isActive: boolean) =>
    cn(
      "flex items-center gap-3 px-3.5 py-2 rounded-lg text-sm transition-all",
      isActive ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/80"
    );

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Logo Section */}
      <div className="px-4 pt-4 pb-3">
        <Link href="/">
          <div 
            onClick={handleSecretClick}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="relative h-10 w-10 rounded-xl flex items-center justify-center shadow-md transition-all duration-300 bg-primary text-primary-foreground">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-heading text-lg leading-none text-foreground">
                <span className="font-bold">Care</span><span className="font-normal" style={{ color: '#64748b' }}>Assurance</span>
              </h1>
              <p className="text-[10px] mt-0.5 uppercase tracking-[0.15em] text-muted-foreground">Operations Platform</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Divider */}
      <div className="mx-4 h-px bg-border/60" />

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
              <Link href="/care-worker-rotas" className={subNavLinkClass(location === "/care-worker-rotas")}>
                <ClipboardList size={15} /> Care Worker Rotas
              </Link>
              <Link href="/billing-tool" className={subNavLinkClass(location === "/billing-tool")} data-testid="link-billing-tool">
                <FileSpreadsheet size={15} /> Billing Tool
              </Link>
            </CollapsibleContent>
          </Collapsible>
        )}
      </nav>

      {/* Footer Actions */}
      <div className="p-3 space-y-1 mt-auto border-t border-border/70">
        <Link
          href="/settings"
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-muted"
          data-testid="button-settings"
        >
          <Settings size={18} className="text-muted-foreground" />
          Settings
        </Link>
        <button
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all text-red-500 hover:bg-red-50"
          onClick={logout}
        >
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
    <div className="relative flex h-screen w-full overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-[250px] flex-shrink-0 flex-col z-10 border-r border-border/80 bg-white/95 backdrop-blur">
        <SidebarContent location={location} handleSecretClick={handleSecretClick} logout={logout} />
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto flex flex-col w-full relative z-10">
        {/* Header */}
        <header className="h-14 px-4 md:px-6 flex items-center justify-between sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-border/80">
          <div className="flex items-center gap-3">
            {/* Mobile Menu Trigger */}
            <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden mr-2 -ml-2">
                  <Menu className="h-5 w-5 text-foreground" />
                  <span className="sr-only">Toggle menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-[260px] border-r border-border/80 bg-white/95">
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

            <div className="flex items-center">
              <span className="text-sm font-heading font-semibold text-foreground">CareAssurance</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium leading-tight text-foreground">
                  {user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.username}
                </p>
                <p className="text-[10px] capitalize leading-tight text-muted-foreground">{user?.role}</p>
              </div>
              <div className="relative h-9 w-9 rounded-full flex items-center justify-center font-semibold uppercase text-xs bg-primary/10 text-primary border border-primary/20">
                {user?.firstName ? user.firstName.substring(0, 1) : user?.username?.substring(0, 1) || "?"}
                {user?.lastName ? user.lastName.substring(0, 1) : ""}
                <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-white" />
              </div>
            </div>
          </div>
        </header>

        {/* Page Content Area */}
        <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 max-w-7xl mx-auto w-full flex-1 space-y-4">
          <div className="rounded-2xl p-4 sm:p-6 lg:p-7 shadow-sm bg-white border border-border/70">
            {/* Page Header */}
            <div className="flex flex-wrap items-center gap-3 justify-between mb-4 sm:mb-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center font-bold text-sm bg-primary/10 text-primary border border-primary/20">
                  CA
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] font-medium text-muted-foreground">Care Assurance</p>
                  <p className="text-base font-heading text-foreground">Operational Intelligence</p>
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
            {children}
          </div>
        </div>

        {/* Footer */}
        <footer className="px-4 py-3 border-t border-border/80 bg-white/90 backdrop-blur">
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
