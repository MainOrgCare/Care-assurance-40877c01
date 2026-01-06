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
  Calculator
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
  
  // Format timer
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const [openServiceUsers, setOpenServiceUsers] = useState(location.startsWith("/service-users"));
  const [openCareWorkers, setOpenCareWorkers] = useState(location.startsWith("/care-workers"));
  const [openAdmin, setOpenAdmin] = useState(location.startsWith("/admin"));

  // Auto-open accordion based on route
  useEffect(() => {
     if (location.startsWith("/service-users")) setOpenServiceUsers(true);
     if (location.startsWith("/care-workers")) setOpenCareWorkers(true);
     if (location.startsWith("/admin") || location === "/shadow-admin-portal") setOpenAdmin(true);
  }, [location]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-6">
        <Link href="/">
          <div 
            onClick={handleSecretClick}
            className="flex items-center gap-2 cursor-pointer"
          >
            <div className="h-8 w-8 rounded-md bg-gradient-to-br from-primary to-secondary flex items-center justify-center ring-1 ring-border/50">
              <ShieldCheck className="h-5 w-5 text-primary-foreground" />
            </div>
            <h1 className="font-heading text-xl text-sidebar-foreground leading-none">
              <span className="font-bold">Care</span><span className="font-normal">Assurance</span>
            </h1>
          </div>
        </Link>
      </div>

      <nav className="flex-1 px-4 space-y-2 py-4 overflow-y-auto">
        
        {/* Dashboard - Top Level */}
        <Link href="/dashboard" className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 group cursor-pointer",
          location === "/dashboard" 
            ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md" 
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        )}>
            <LayoutDashboard size={18} className={cn("transition-colors", location === "/dashboard" ? "text-white" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground")} />
            Dashboard
        </Link>

        {/* Dropdown 1: Service Users */}
        <Collapsible open={openServiceUsers} onOpenChange={setOpenServiceUsers} className="space-y-1">
          <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground rounded-lg transition-all group">
            <div className="flex items-center gap-3">
               <Users size={18} className="text-sidebar-foreground/50 group-hover:text-sidebar-foreground" />
               Service Users
            </div>
            <div className="flex items-center gap-2">
               {timeLeft !== null && (
                 <Badge variant="destructive" className="h-5 px-1.5 text-[10px] animate-pulse">
                   {formatTime(timeLeft)}
                 </Badge>
               )}
               <ChevronDown size={16} className={cn("transition-transform duration-200", openServiceUsers ? "rotate-180" : "")} />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1 pl-4">
             <Link href="/service-users/upload" className={cn("flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-all", location === "/service-users/upload" ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/60 hover:text-sidebar-foreground")}>
                <Upload size={16} /> Data Upload
             </Link>
             <Link href="/service-users/care-planning" className={cn("flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-all", location === "/service-users/care-planning" ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/60 hover:text-sidebar-foreground")}>
                <FileText size={16} /> Care Planning
             </Link>
             <Link href="/service-users/risk-assessment" className={cn("flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-all", location === "/service-users/risk-assessment" ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/60 hover:text-sidebar-foreground")}>
                <ShieldAlert size={16} /> Risk Assessment
             </Link>
             <Link href="/service-users/plan-enhancer" className={cn("flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-all", location === "/service-users/plan-enhancer" ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/60 hover:text-sidebar-foreground")}>
                <Sparkles size={16} /> Plan Enhancer
             </Link>
          </CollapsibleContent>
        </Collapsible>

        {/* Dropdown 2: Care Workers */}
        <Collapsible open={openCareWorkers} onOpenChange={setOpenCareWorkers} className="space-y-1">
          <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground rounded-lg transition-all group">
            <div className="flex items-center gap-3">
               <UserCog size={18} className="text-sidebar-foreground/50 group-hover:text-sidebar-foreground" />
               Care Workers
            </div>
            <ChevronDown size={16} className={cn("transition-transform duration-200", openCareWorkers ? "rotate-180" : "")} />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1 pl-4">
             <Link href="/care-workers/list" className={cn("flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-all", location === "/care-workers/list" ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/60 hover:text-sidebar-foreground")}>
                <Users size={16} /> Carers
             </Link>
             <Link href="/care-workers/emar-audit" className={cn("flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-all", location === "/care-workers/emar-audit" ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/60 hover:text-sidebar-foreground")}>
                <Activity size={16} /> EMAR Audit
             </Link>
             <Link href="/care-workers/visit-audit" className={cn("flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-all", location === "/care-workers/visit-audit" ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/60 hover:text-sidebar-foreground")}>
                <ClipboardList size={16} /> Visit Audit
             </Link>
             <Link href="/care-workers/performance" className={cn("flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-all", location === "/care-workers/performance" ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/60 hover:text-sidebar-foreground")}>
                <BarChart size={16} /> Performance
             </Link>
          </CollapsibleContent>
        </Collapsible>

        {/* Dropdown 3: Admin */}
        <Collapsible open={openAdmin} onOpenChange={setOpenAdmin} className="space-y-1">
          <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground rounded-lg transition-all group">
            <div className="flex items-center gap-3">
               <Lock size={18} className="text-sidebar-foreground/50 group-hover:text-sidebar-foreground" />
               Admin
            </div>
            <ChevronDown size={16} className={cn("transition-transform duration-200", openAdmin ? "rotate-180" : "")} />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1 pl-4">
             {/* Only accessible via secret click or direct link if admin */}
             {user?.role === 'admin' && (
               <Link href="/shadow-admin-portal" className={cn("flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-all", location === "/shadow-admin-portal" ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/60 hover:text-sidebar-foreground")}>
                  <ShieldCheck size={16} /> Administrator Controls
               </Link>
             )}
             <Link href="/email-assistant" className={cn("flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-all", location === "/email-assistant" ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/60 hover:text-sidebar-foreground")}>
                <Mail size={16} /> Email Assistant
             </Link>
             <Link href="/compliance" className={cn("flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-all", location === "/compliance" ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/60 hover:text-sidebar-foreground")}>
                <CheckCircle size={16} /> Compliance
             </Link>
             {user?.role === 'admin' && (
               <Link href="/roi-calculator" className={cn("flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-all", location === "/roi-calculator" ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/60 hover:text-sidebar-foreground")} data-testid="link-roi-calculator">
                  <Calculator size={16} /> Features & Benefits
               </Link>
             )}
          </CollapsibleContent>
        </Collapsible>
      </nav>

      <div className="p-4 border-t border-sidebar-border space-y-2 mt-auto">
        <Link 
          href="/settings"
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all"
          data-testid="button-settings"
        >
          <Settings size={18} className="text-sidebar-foreground/50" />
          Settings
        </Link>
        <button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-destructive/80 hover:bg-destructive/10 hover:text-destructive transition-all" onClick={logout}>
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
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-shrink-0 bg-sidebar/80 backdrop-blur-xl border-r border-sidebar-border flex-col z-10">
        <SidebarContent location={location} handleSecretClick={handleSecretClick} logout={logout} />
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto flex flex-col w-full relative z-10">
        <header className="h-16 border-b border-border/50 bg-card/40 backdrop-blur-md px-4 md:px-8 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-2">
            {/* Mobile Menu Trigger */}
            <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden mr-2 -ml-2">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Toggle menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-64 bg-sidebar border-r border-sidebar-border">
                <SidebarContent location={location} handleSecretClick={handleSecretClick} logout={() => { setIsMobileOpen(false); logout(); }} />
              </SheetContent>
            </Sheet>

            <div className="flex items-center gap-2 text-muted-foreground text-sm">
            </div>
          </div>

          <div className="flex items-center gap-4">
             <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium">
                    {user?.firstName && user?.lastName 
                      ? `${user.firstName} ${user.lastName}` 
                      : user?.username}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
                </div>
                <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold uppercase text-sm">
                  {user?.firstName ? user.firstName.substring(0,1) : user?.username?.substring(0,1) || '?'}
                  {user?.lastName ? user.lastName.substring(0,1) : ''}
                </div>
             </div>
          </div>
        </header>
        <div className="p-4 md:p-8 max-w-7xl mx-auto w-full flex-1">
          {children}
        </div>
        
        {/* Persistent Footer with Legal Links */}
        <footer className="border-t border-border/50 bg-card/30 backdrop-blur-sm px-4 py-3 mt-auto">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <span>&copy; {new Date().getFullYear()} CareAssurance.</span>
              <span className="hidden sm:inline">All rights reserved.</span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/terms" className="hover:text-foreground transition-colors" data-testid="link-footer-terms">
                Terms & Conditions
              </Link>
              <Link href="/privacy" className="hover:text-foreground transition-colors" data-testid="link-footer-privacy">
                Privacy Policy
              </Link>
            </div>
          </div>
        </footer>
      </main>

      </div>
  );
}
