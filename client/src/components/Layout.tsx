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

  const navLinkClass = (isActive: boolean) => cn(
    "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group cursor-pointer",
    isActive 
      ? "text-white shadow-md" 
      : "hover:bg-gray-100"
  );

  const navLinkStyle = (isActive: boolean) => isActive 
    ? { backgroundColor: '#3b82f6', color: '#ffffff' } 
    : { color: '#334155' };

  const subNavLinkClass = (isActive: boolean) => cn(
    "flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-all",
    isActive ? "" : "hover:bg-gray-50"
  );

  const subNavLinkStyle = (isActive: boolean) => isActive 
    ? { backgroundColor: '#f1f5f9', color: '#0f172a' } 
    : { color: '#64748b' };

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: '#ffffff' }}>
      {/* Logo Section */}
      <div className="p-5 pb-4">
        <Link href="/">
          <div 
            onClick={handleSecretClick}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="relative h-10 w-10 rounded-xl flex items-center justify-center shadow-md transition-all duration-300" style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-heading text-lg leading-none" style={{ color: '#0f172a' }}>
                <span className="font-bold">Care</span><span className="font-normal" style={{ color: '#64748b' }}>Assurance</span>
              </h1>
              <p className="text-[10px] mt-0.5 uppercase tracking-[0.15em]" style={{ color: '#94a3b8' }}>Operations Platform</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Divider */}
      <div className="mx-4 h-px" style={{ background: 'linear-gradient(to right, transparent, #e2e8f0, transparent)' }} />

      <nav className="flex-1 px-3 space-y-1 py-4 overflow-y-auto">
        
        {/* Dashboard */}
        <Link href="/dashboard" className={navLinkClass(location === "/dashboard")} style={navLinkStyle(location === "/dashboard")}>
            <LayoutDashboard size={18} />
            Dashboard
            {location === "/dashboard" && <ArrowUpRight size={14} className="ml-auto opacity-60" />}
        </Link>

        {/* Email Assistant */}
        <Link href="/email-assistant" className={navLinkClass(location === "/email-assistant")} style={navLinkStyle(location === "/email-assistant")}>
          <Mail size={18} />
          Email Assistant
        </Link>

        {/* Compliance */}
        <Link href="/compliance" className={navLinkClass(location === "/compliance")} style={navLinkStyle(location === "/compliance")}>
          <CheckCircle size={18} />
          Compliance
        </Link>

        {/* Section Label */}
        <div className="pt-4 pb-2 px-4">
          <span className="text-[10px] uppercase tracking-[0.2em] font-medium" style={{ color: '#94a3b8' }}>Modules</span>
        </div>

        {/* Service Users */}
        <Collapsible open={openServiceUsers} onOpenChange={setOpenServiceUsers} className="space-y-0.5">
          <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-2.5 text-sm font-medium rounded-xl transition-all group hover:bg-gray-100" style={{ color: '#334155' }}>
            <div className="flex items-center gap-3">
               <Users size={18} style={{ color: '#64748b' }} />
               Service Users
            </div>
            <div className="flex items-center gap-2">
               {timeLeft !== null && (
                 <Badge variant="destructive" className="h-5 px-1.5 text-[9px] animate-pulse">
                   {formatTime(timeLeft)}
                 </Badge>
               )}
               <ChevronDown size={14} className={cn("transition-transform duration-200", openServiceUsers ? "rotate-180" : "")} style={{ color: '#94a3b8' }} />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-0.5 pl-3">
             <Link href="/service-users/upload" className={subNavLinkClass(location === "/service-users/upload")} style={subNavLinkStyle(location === "/service-users/upload")}>
                <Upload size={15} /> Data Upload
             </Link>
             <Link href="/service-users/care-planning" className={subNavLinkClass(location === "/service-users/care-planning")} style={subNavLinkStyle(location === "/service-users/care-planning")}>
                <FileText size={15} /> Care Planning
             </Link>
             <Link href="/service-users/risk-assessment" className={subNavLinkClass(location === "/service-users/risk-assessment")} style={subNavLinkStyle(location === "/service-users/risk-assessment")}>
                <ShieldAlert size={15} /> Risk Assessment
             </Link>
             <Link href="/service-users/plan-enhancer" className={subNavLinkClass(location === "/service-users/plan-enhancer")} style={subNavLinkStyle(location === "/service-users/plan-enhancer")}>
                <Sparkles size={15} /> Plan Enhancer
             </Link>
          </CollapsibleContent>
        </Collapsible>

        {/* Care Workers */}
        <Collapsible open={openCareWorkers} onOpenChange={setOpenCareWorkers} className="space-y-0.5">
          <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-2.5 text-sm font-medium rounded-xl transition-all group hover:bg-gray-100" style={{ color: '#334155' }}>
            <div className="flex items-center gap-3">
               <UserCog size={18} style={{ color: '#64748b' }} />
               Care Workers
            </div>
            <ChevronDown size={14} className={cn("transition-transform duration-200", openCareWorkers ? "rotate-180" : "")} style={{ color: '#94a3b8' }} />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-0.5 pl-3">
             <Link href="/care-workers/list" className={subNavLinkClass(location === "/care-workers/list")} style={subNavLinkStyle(location === "/care-workers/list")}>
                <Users size={15} /> Carers
             </Link>
             <Link href="/care-workers/emar-audit" className={subNavLinkClass(location === "/care-workers/emar-audit")} style={subNavLinkStyle(location === "/care-workers/emar-audit")}>
                <Activity size={15} /> EMAR Audit
             </Link>
             <Link href="/care-workers/visit-audit" className={subNavLinkClass(location === "/care-workers/visit-audit")} style={subNavLinkStyle(location === "/care-workers/visit-audit")}>
                <ClipboardList size={15} /> Visit Audit
             </Link>
             <Link href="/care-workers/performance" className={subNavLinkClass(location === "/care-workers/performance")} style={subNavLinkStyle(location === "/care-workers/performance")}>
                <BarChart size={15} /> Performance
             </Link>
          </CollapsibleContent>
        </Collapsible>

        {/* Admin */}
        {isAdminUser && (
          <Collapsible open={openAdmin} onOpenChange={setOpenAdmin} className="space-y-0.5">
            <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-2.5 text-sm font-medium rounded-xl transition-all group hover:bg-gray-100" style={{ color: '#334155' }}>
              <div className="flex items-center gap-3">
                <Lock size={18} style={{ color: '#64748b' }} />
                Admin
              </div>
              <ChevronDown size={14} className={cn("transition-transform duration-200", openAdmin ? "rotate-180" : "")} style={{ color: '#94a3b8' }} />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-0.5 pl-3">
              <Link href="/shadow-admin-portal" className={subNavLinkClass(location === "/shadow-admin-portal")} style={subNavLinkStyle(location === "/shadow-admin-portal")}>
                <ShieldCheck size={15} /> Administrator Controls
              </Link>
              <Link href="/roi-calculator" className={subNavLinkClass(location === "/roi-calculator")} style={subNavLinkStyle(location === "/roi-calculator")} data-testid="link-roi-calculator">
                <Calculator size={15} /> Features & Benefits
              </Link>
              <Link href="/testing-features" className={subNavLinkClass(location === "/testing-features")} style={subNavLinkStyle(location === "/testing-features")}>
                <FlaskConical size={15} /> Testing Features
              </Link>
              <Link href="/care-worker-rotas" className={subNavLinkClass(location === "/care-worker-rotas")} style={subNavLinkStyle(location === "/care-worker-rotas")}>
                <ClipboardList size={15} /> Care Worker Rotas
              </Link>
            </CollapsibleContent>
          </Collapsible>
        )}
      </nav>

      {/* Footer Actions */}
      <div className="p-3 space-y-1 mt-auto" style={{ borderTop: '1px solid #e2e8f0' }}>
        <Link 
          href="/settings"
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-gray-100"
          style={{ color: '#334155' }}
          data-testid="button-settings"
        >
          <Settings size={18} style={{ color: '#64748b' }} />
          Settings
        </Link>
        <button 
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-red-50" 
          style={{ color: '#ef4444' }}
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
    <div className="relative flex h-screen w-full overflow-hidden" style={{ backgroundColor: '#f8fafc' }}>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-[260px] flex-shrink-0 flex-col z-10" style={{ backgroundColor: '#ffffff', borderRight: '1px solid #e2e8f0' }}>
        <SidebarContent location={location} handleSecretClick={handleSecretClick} logout={logout} />
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto flex flex-col w-full relative z-10">
        {/* Header */}
        <header className="h-14 px-4 md:px-6 flex items-center justify-between sticky top-0 z-20" style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0' }}>
          <div className="flex items-center gap-3">
            {/* Mobile Menu Trigger */}
            <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden mr-2 -ml-2">
                  <Menu className="h-5 w-5" style={{ color: '#334155' }} />
                  <span className="sr-only">Toggle menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-[260px]" style={{ backgroundColor: '#ffffff', borderRight: '1px solid #e2e8f0' }}>
                <SidebarContent location={location} handleSecretClick={handleSecretClick} logout={() => { setIsMobileOpen(false); logout(); }} />
              </SheetContent>
            </Sheet>

            <div className="hidden md:flex flex-col">
              <span className="text-[9px] uppercase tracking-[0.25em] font-medium" style={{ color: '#94a3b8' }}>
                Operations Console
              </span>
              <span className="text-sm font-heading" style={{ color: '#0f172a' }}>
                Orchestrate confident care decisions
              </span>
            </div>
            <div className="md:hidden text-[9px] uppercase tracking-[0.2em] font-medium" style={{ color: '#94a3b8' }}>
              Ops Console
            </div>
          </div>

          <div className="flex items-center gap-3">
             <Badge variant="outline" className="hidden sm:inline-flex uppercase tracking-[0.15em] text-[9px] font-medium" style={{ backgroundColor: 'rgba(59, 130, 246, 0.08)', color: '#3b82f6', borderColor: 'rgba(59, 130, 246, 0.2)' }}>
               Secure Workspace
             </Badge>
             <div className="flex items-center gap-2.5">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium leading-tight" style={{ color: '#0f172a' }}>
                    {user?.firstName && user?.lastName 
                      ? `${user.firstName} ${user.lastName}` 
                      : user?.username}
                  </p>
                  <p className="text-[10px] capitalize leading-tight" style={{ color: '#64748b' }}>{user?.role}</p>
                </div>
                <div className="relative h-8 w-8 rounded-full flex items-center justify-center font-semibold uppercase text-xs" style={{ background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(59, 130, 246, 0.1))', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.25)' }}>
                  {user?.firstName ? user.firstName.substring(0,1) : user?.username?.substring(0,1) || '?'}
                  {user?.lastName ? user.lastName.substring(0,1) : ''}
                  <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#22c55e', border: '2px solid #ffffff' }} />
                </div>
             </div>
          </div>
        </header>

        {/* Page Content Area */}
        <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full flex-1 space-y-5">
          <div className="rounded-2xl p-5 md:p-7 shadow-lg" style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}>
            {/* Page Header */}
            <div className="flex flex-wrap items-center gap-3 justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center font-bold text-sm" style={{ background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(59, 130, 246, 0.1))', border: '1px solid rgba(59, 130, 246, 0.2)', color: '#3b82f6' }}>
                  CA
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] font-medium" style={{ color: '#64748b' }}>Care Assurance</p>
                  <p className="text-base font-heading" style={{ color: '#0f172a' }}>Operational Intelligence</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium" style={{ backgroundColor: 'rgba(34, 197, 94, 0.15)', color: '#16a34a', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#22c55e' }} />
                  Live
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.15)' }}>
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#3b82f6' }} />
                  Secure
                </span>
              </div>
            </div>
            <div className="h-px mb-5" style={{ background: 'linear-gradient(to right, transparent, #e2e8f0, transparent)' }} />
            {children}
          </div>
        </div>
        
        {/* Footer */}
        <footer className="px-4 py-3 mt-auto" style={{ backgroundColor: '#ffffff', borderTop: '1px solid #e2e8f0' }}>
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px]" style={{ color: '#64748b' }}>
            <div className="flex items-center gap-1.5 font-medium">
              <span>&copy; {new Date().getFullYear()} CareAssurance</span>
              <span className="hidden sm:inline" style={{ color: '#94a3b8' }}>·</span>
              <span className="hidden sm:inline">Precision tools for high-trust care teams</span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/terms" className="transition-colors hover:text-gray-900" data-testid="link-footer-terms">
                Terms & Conditions
              </Link>
              <Link href="/privacy" className="transition-colors hover:text-gray-900" data-testid="link-footer-privacy">
                Privacy Policy
              </Link>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
