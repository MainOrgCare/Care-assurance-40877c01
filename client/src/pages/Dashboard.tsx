import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { AlertCircle, CheckCircle2, FileText, Activity, RefreshCw, Loader2, Settings, GripVertical, Pill, ClipboardList, Shield, Users, ArrowRight, Upload, Brain, TrendingUp, Clock, Zap, Play, Info, ChevronDown, Sparkles, type LucideIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTemporaryData } from "@/context/TemporaryDataContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

interface DashboardStats {
  auditsCompleted: number;
  activeAlerts: number;
  plansUpdated: number;
  medicationAudits: number;
  carePlanReviews: number;
  riskAssessments: number;
}

interface AdminAlert {
  id: string;
  careWorkerName: string;
  message: string;
  discrepancyType: string;
  createdAt: string;
}

interface DashboardResponse {
  stats: DashboardStats;
  recentAlerts: AdminAlert[];
}

interface WidgetConfig {
  id: string;
  label: string;
  icon: LucideIcon;
}

const ALL_WIDGETS: WidgetConfig[] = [
  { id: "compliance_score", label: "Compliance Score", icon: CheckCircle2 },
  { id: "audits_completed", label: "Audits Completed", icon: FileText },
  { id: "active_alerts", label: "Active Alerts", icon: AlertCircle },
  { id: "plans_updated", label: "Plans Updated", icon: Activity },
  { id: "medication_audits", label: "Medication Audits", icon: Pill },
  { id: "care_plan_reviews", label: "Care Plan Reviews", icon: FileText },
  { id: "risk_assessments", label: "Risk Assessments", icon: Shield },
  { id: "staff_checks", label: "Staff Checks", icon: Users },
  { id: "compliance_data", label: "Compliance Data", icon: ClipboardList },
  { id: "recent_alerts", label: "Recent Alerts", icon: AlertCircle },
];

const DEFAULT_WIDGETS = ["compliance_score", "audits_completed", "active_alerts", "plans_updated", "compliance_data", "recent_alerts"];

function SortableWidgetItemBase({ widget, isActive, onToggle }: { widget: WidgetConfig; isActive: boolean; onToggle: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id });
  
  const style = useMemo(() => ({
    transform: CSS.Transform.toString(transform),
    transition,
  }), [transform, transition]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center justify-between p-3 rounded-xl border border-border/50 transition-all",
        isDragging ? "opacity-50 scale-95 z-50 bg-accent" : "bg-muted/30 hover:bg-muted/50"
      )}
    >
      <div className="flex items-center gap-3">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1.5 rounded-lg hover:bg-background/80 text-muted-foreground transition-colors">
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="p-2 rounded-lg bg-background/50 text-primary shadow-xs">
          <widget.icon className="h-4 w-4" />
        </div>
        <span className="text-sm font-semibold text-foreground tracking-tight">{widget.label}</span>
      </div>
      <Switch
        checked={isActive}
        onCheckedChange={onToggle}
        data-testid={`switch-widget-${widget.id}`}
      />
    </div>
  );
}

const SortableWidgetItem = memo(SortableWidgetItemBase);

const QUICK_ACTIONS: { icon: LucideIcon; label: string; description: string; href: string; color: string; glow: string }[] = [
  { icon: Upload, label: "EMAR Audit", description: "Upload and analyze medication records", href: "/care-workers/emar-audit", color: "from-blue-500 to-cyan-500", glow: "shadow-blue-500/25" },
  { icon: FileText, label: "Care Plan", description: "Generate AI-powered care plans", href: "/service-users/upload", color: "from-indigo-500 to-blue-600", glow: "shadow-indigo-500/25" },
  { icon: Shield, label: "Risk Assessment", description: "Create comprehensive risk assessments", href: "/service-users/risk-assessment", color: "from-amber-500 to-orange-500", glow: "shadow-amber-500/25" },
  { icon: Brain, label: "Plan Enhancer", description: "Enhance existing care plans with AI", href: "/service-users/plan-enhancer", color: "from-emerald-500 to-teal-500", glow: "shadow-emerald-500/25" },
];

export default function Dashboard() {
  const { user } = useAuth();
  const { loadDemoData } = useTemporaryData();
  const queryClient = useQueryClient();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeWidgets, setActiveWidgets] = useState<string[]>(DEFAULT_WIDGETS);
  const [widgetOrder, setWidgetOrder] = useState<string[]>(ALL_WIDGETS.map(w => w.id));
  const [, navigate] = useLocation();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (user?.isDemo) {
      loadDemoData();
    }
  }, [user?.isDemo, loadDemoData]);

  const { data, isLoading, refetch, isRefetching } = useQuery<DashboardResponse>({
    queryKey: ["/api/dashboard/stats"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/stats", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch dashboard stats");
      return res.json();
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const { data: widgetPrefs } = useQuery<{ widgets: string[] | null }>({
    queryKey: ["/api/dashboard/widgets"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/widgets", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch widget preferences");
      return res.json();
    },
  });

  const saveWidgetsMutation = useMutation({
    mutationFn: async (widgets: string[]) => {
      const res = await fetch("/api/dashboard/widgets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ widgets }),
      });
      if (!res.ok) throw new Error("Failed to save preferences");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/widgets"] });
    },
  });

  useEffect(() => {
    if (widgetPrefs?.widgets && widgetPrefs.widgets.length > 0) {
      const savedWidgets = widgetPrefs.widgets;
      const visibleIds = savedWidgets.filter((w: string) => !w.startsWith("hidden:"));
      const hiddenIds = savedWidgets.filter((w: string) => w.startsWith("hidden:")).map((w: string) => w.replace("hidden:", ""));
      const orderedIds = savedWidgets.map((w: string) => w.replace("hidden:", ""));
      const missingWidgets = ALL_WIDGETS.map(w => w.id).filter(id => !orderedIds.includes(id));
      setActiveWidgets(visibleIds);
      setWidgetOrder([...orderedIds, ...missingWidgets]);
    }
  }, [widgetPrefs]);

  const savePreferences = (order: string[], active: string[]) => {
    const widgetsToSave = order.map(id => active.includes(id) ? id : `hidden:${id}`);
    saveWidgetsMutation.mutate(widgetsToSave);
  };

  const toggleWidget = (widgetId: string) => {
    const newWidgets = activeWidgets.includes(widgetId)
      ? activeWidgets.filter(w => w !== widgetId)
      : [...activeWidgets, widgetId];
    setActiveWidgets(newWidgets);
    savePreferences(widgetOrder, newWidgets);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = widgetOrder.indexOf(active.id as string);
      const newIndex = widgetOrder.indexOf(over.id as string);
      const newOrder = arrayMove(widgetOrder, oldIndex, newIndex);
      setWidgetOrder(newOrder);
      savePreferences(newOrder, activeWidgets);
    }
  };

  const stats = data?.stats;
  const recentAlerts: AdminAlert[] = data?.recentAlerts ?? [];

  const formatTimeAgo = useCallback((dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  }, []);

  const isWidgetActive = useCallback((id: string) => activeWidgets.includes(id), [activeWidgets]);
  
  const sortedActiveWidgets = useMemo(() => widgetOrder.filter(id => activeWidgets.includes(id)), [widgetOrder, activeWidgets]);
  const smallWidgets = useMemo(() => sortedActiveWidgets.filter(id => !["compliance_data", "recent_alerts"].includes(id)), [sortedActiveWidgets]);
  const largeWidgets = useMemo(() => sortedActiveWidgets.filter(id => ["compliance_data", "recent_alerts"].includes(id)), [sortedActiveWidgets]);

  const renderSmallWidget = (widgetId: string) => {
    switch (widgetId) {
      case "compliance_score":
        return (
          <Card key={widgetId} className="glass-card group overflow-hidden" data-testid="widget-compliance-score">
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br from-success/10 to-transparent" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Compliance Score</CardTitle>
              <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-success/15 shadow-sm group-hover:scale-110 transition-transform">
                <CheckCircle2 className="h-5 w-5 text-success" />
              </div>
            </CardHeader>
            <CardContent className="relative pt-2">
              <div className="text-4xl font-black tracking-tighter text-foreground" data-testid="text-compliance-score">
                {isLoading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : stats?.auditsCompleted ? "100%" : "-"}
              </div>
              <p className="text-[10px] font-medium text-muted-foreground mt-2 flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                {stats?.auditsCompleted ? "Based on completed audits" : "No data yet"}
              </p>
            </CardContent>
          </Card>
        );
      case "audits_completed":
        return (
          <Card key={widgetId} className="glass-card group overflow-hidden" data-testid="widget-audits-completed">
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br from-primary/10 to-transparent" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Audits Completed</CardTitle>
              <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-primary/15 shadow-sm group-hover:scale-110 transition-transform">
                <FileText className="h-5 w-5 text-primary" />
              </div>
            </CardHeader>
            <CardContent className="relative pt-2">
              <div className="text-4xl font-black tracking-tighter text-foreground" data-testid="text-audits-completed">
                {isLoading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : stats?.auditsCompleted ?? 0}
              </div>
              <p className="text-[10px] font-medium text-muted-foreground mt-2">Last 24 hours activity</p>
            </CardContent>
          </Card>
        );
      case "active_alerts":
        return (
          <Card key={widgetId} className="glass-card group overflow-hidden" data-testid="widget-active-alerts">
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br from-destructive/10 to-transparent" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Active Alerts</CardTitle>
              <div className={cn(
                "h-10 w-10 rounded-xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform",
                stats?.activeAlerts ? "bg-destructive/20" : "bg-muted"
              )}>
                <AlertCircle className={cn("h-5 w-5", stats?.activeAlerts ? "text-destructive animate-pulse" : "text-muted-foreground")} />
              </div>
            </CardHeader>
            <CardContent className="relative pt-2">
              <div className={cn("text-4xl font-black tracking-tighter", stats?.activeAlerts ? "text-destructive" : "text-foreground")} data-testid="text-active-alerts">
                {isLoading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : stats?.activeAlerts ?? 0}
              </div>
              <p className="text-[10px] font-medium text-muted-foreground mt-2">
                {stats?.activeAlerts ? "Immediate attention required" : "All systems normal"}
              </p>
            </CardContent>
          </Card>
        );
      case "plans_updated":
        return (
          <Card key={widgetId} className="glass-card group overflow-hidden" data-testid="widget-plans-updated">
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br from-violet-500/10 to-transparent" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Plans Updated</CardTitle>
              <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-violet-500/15 shadow-sm group-hover:scale-110 transition-transform">
                <Activity className="h-5 w-5 text-violet-500" />
              </div>
            </CardHeader>
            <CardContent className="relative pt-2">
              <div className="text-4xl font-black tracking-tighter text-foreground" data-testid="text-plans-updated">
                {isLoading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : stats?.plansUpdated ?? 0}
              </div>
              <p className="text-[10px] font-medium text-muted-foreground mt-2">Recently synchronized plans</p>
            </CardContent>
          </Card>
        );
      case "medication_audits":
        return (
          <Card key={widgetId} className="glass-card group overflow-hidden" data-testid="widget-medication-audits">
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br from-blue-500/10 to-transparent" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Medication Audits</CardTitle>
              <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-blue-500/15 shadow-sm group-hover:scale-110 transition-transform">
                <Pill className="h-5 w-5 text-blue-500" />
              </div>
            </CardHeader>
            <CardContent className="relative pt-2">
              <div className="text-4xl font-black tracking-tighter text-foreground" data-testid="text-medication-audits-widget">
                {isLoading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : stats?.medicationAudits ?? 0}
              </div>
              <p className="text-[10px] font-medium text-muted-foreground mt-2">Last 24 hours activity</p>
            </CardContent>
          </Card>
        );
      case "care_plan_reviews":
        return (
          <Card key={widgetId} className="glass-card group overflow-hidden" data-testid="widget-care-plan-reviews">
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br from-cyan-500/10 to-transparent" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Care Plan Reviews</CardTitle>
              <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-cyan-500/15 shadow-sm group-hover:scale-110 transition-transform">
                <FileText className="h-5 w-5 text-cyan-500" />
              </div>
            </CardHeader>
            <CardContent className="relative pt-2">
              <div className="text-4xl font-black tracking-tighter text-foreground" data-testid="text-care-plan-reviews-widget">
                {isLoading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : stats?.carePlanReviews ?? 0}
              </div>
              <p className="text-[10px] font-medium text-muted-foreground mt-2">Last 24 hours activity</p>
            </CardContent>
          </Card>
        );
      case "risk_assessments":
        return (
          <Card key={widgetId} className="glass-card group overflow-hidden" data-testid="widget-risk-assessments">
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br from-amber-500/10 to-transparent" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Risk Assessments</CardTitle>
              <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-amber-500/15 shadow-sm group-hover:scale-110 transition-transform">
                <Shield className="h-5 w-5 text-amber-500" />
              </div>
            </CardHeader>
            <CardContent className="relative pt-2">
              <div className="text-4xl font-black tracking-tighter text-foreground" data-testid="text-risk-assessments-widget">
                {isLoading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : stats?.riskAssessments ?? 0}
              </div>
              <p className="text-[10px] font-medium text-muted-foreground mt-2">Last 24 hours activity</p>
            </CardContent>
          </Card>
        );
      case "staff_checks":
        return (
          <Card key={widgetId} className="glass-card group overflow-hidden" data-testid="widget-staff-checks">
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br from-indigo-500/10 to-transparent" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Staff Checks</CardTitle>
              <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-indigo-500/15 shadow-sm group-hover:scale-110 transition-transform">
                <Users className="h-5 w-5 text-indigo-500" />
              </div>
            </CardHeader>
            <CardContent className="relative pt-2">
              <div className="text-4xl font-black tracking-tighter text-foreground" data-testid="text-staff-checks-widget">0</div>
              <p className="text-[10px] font-medium text-muted-foreground mt-2">Last 24 hours activity</p>
            </CardContent>
          </Card>
        );
      default:
        return null;
    }
  };

  return (
    <div className="page-shell">
      {user?.isDemo && (
        <Card className="bg-gradient-to-r from-blue-600/10 via-cyan-600/10 to-emerald-600/10 border-primary/25 shadow-lg animate-fade-in" data-testid="demo-mode-banner">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                  <Play className="h-5 w-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground">Demo Mode Active</h3>
                    <Badge variant="outline" className="border-primary/35 text-primary">Sample Data</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Explore CareAssurance with pre-loaded sample data. Changes won't be saved.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-primary">
                <Info className="h-4 w-4" />
                Read-only mode
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 animate-slide-up stagger-1">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-primary tracking-tight px-1">
            Welcome, {user?.firstName || user?.username || 'there'}
          </p>
          <h1 className="page-title leading-tight" data-testid="text-dashboard-title">Operations Dashboard</h1>
          <p className="page-subtitle">Unified operations overview for the last 24 hours.</p>
        </div>
        <div className="flex gap-3">
          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-customize-dashboard">
                <Settings className="h-4 w-4 mr-2" />
                Customize
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Customize Dashboard</DialogTitle>
                <DialogDescription>
                  Drag widgets to reorder them and toggle visibility.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <p className="text-sm text-muted-foreground">Drag to reorder, toggle to show/hide widgets.</p>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={widgetOrder} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {widgetOrder.map((widgetId) => {
                        const widget = ALL_WIDGETS.find(w => w.id === widgetId);
                        if (!widget) return null;
                        return (
                          <SortableWidgetItem
                            key={widget.id}
                            widget={widget}
                            isActive={activeWidgets.includes(widget.id)}
                            onToggle={() => toggleWidget(widget.id)}
                          />
                        );
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            </DialogContent>
          </Dialog>
          <Button 
            variant="outline" 
            onClick={() => refetch()}
            disabled={isRefetching}
            data-testid="button-refresh-dashboard"
          >
            {isRefetching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Refresh
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button data-testid="button-new-analysis">
                <Brain className="h-4 w-4 mr-2" />
                New Analysis
                <ChevronDown className="h-4 w-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Start New Analysis</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/care-workers/emar-audit")} className="cursor-pointer">
                <Pill className="h-4 w-4 mr-2 text-blue-500" />
                <div className="flex flex-col">
                  <span>EMAR Audit</span>
                  <span className="text-xs text-muted-foreground">Analyze medication records</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/service-users/upload")} className="cursor-pointer">
                <FileText className="h-4 w-4 mr-2 text-indigo-500" />
                <div className="flex flex-col">
                  <span>Care Plan</span>
                  <span className="text-xs text-muted-foreground">Generate AI care plans</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/service-users/risk-assessment")} className="cursor-pointer">
                <Shield className="h-4 w-4 mr-2 text-amber-500" />
                <div className="flex flex-col">
                  <span>Risk Assessment</span>
                  <span className="text-xs text-muted-foreground">Create risk assessments</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/service-users/plan-enhancer")} className="cursor-pointer">
                <Sparkles className="h-4 w-4 mr-2 text-emerald-500" />
                <div className="flex flex-col">
                  <span>Plan Enhancer</span>
                  <span className="text-xs text-muted-foreground">Enhance existing plans</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/care-workers/visit-audit")} className="cursor-pointer">
                <ClipboardList className="h-4 w-4 mr-2 text-cyan-500" />
                <div className="flex flex-col">
                  <span>Visit Audit</span>
                  <span className="text-xs text-muted-foreground">Audit care visits</span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="space-y-4 animate-slide-up stagger-2">
        <div className="flex items-center gap-3 px-1">
          <div className="h-9 w-9 rounded-xl flex items-center justify-center bg-amber-500/15 shadow-xs">
            <Zap className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <h3 className="text-lg font-bold tracking-tight text-foreground">Launch Center</h3>
            <p className="text-xs font-medium text-muted-foreground">Accelerated workflows for care teams</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {QUICK_ACTIONS.map((action, index) => (
            <Link key={index} href={action.href}>
              <Card className="glass-card-interactive group h-full overflow-hidden" data-testid={`card-quick-action-${index}`}>
                <CardContent className="p-6 relative">
                  <div className={`absolute inset-0 bg-gradient-to-br ${action.color} opacity-0 group-hover:opacity-[0.05] transition-opacity duration-500`} />
                  
                  <div className={`relative h-12 w-12 rounded-2xl bg-gradient-to-br ${action.color} flex items-center justify-center mb-5 shadow-lg ${action.glow} group-hover:scale-110 group-hover:-rotate-3 transition-all duration-500`}>
                    <action.icon className="h-6 w-6 text-white" />
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-black/20 to-white/20" />
                  </div>
                  
                  <h4 className="font-bold text-base mb-2 group-hover:text-primary transition-colors text-foreground">{action.label}</h4>
                  <p className="text-xs leading-relaxed text-muted-foreground font-medium">{action.description}</p>
                  
                  <div className="flex items-center gap-2 mt-4 text-xs font-bold text-primary opacity-0 group-hover:opacity-100 transition-all duration-500 transform translate-y-2 group-hover:translate-y-0">
                    <span>OPEN WORKFLOW</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {smallWidgets.length > 0 && (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4 animate-slide-up stagger-3">
          {smallWidgets.map(widgetId => renderSmallWidget(widgetId))}
        </div>
      )}

      {largeWidgets.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7 animate-slide-up stagger-4">
          {largeWidgets.includes("compliance_data") && (
            <Card className={cn("glass-card shadow-medium", largeWidgets.includes("recent_alerts") ? "lg:col-span-4" : "lg:col-span-7")} data-testid="widget-compliance-data">
              <CardHeader className="border-b border-border/40 pb-6 mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <TrendingUp className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Audit Performance</CardTitle>
                    <CardDescription>Live telemetry for the current operational window.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                 <div className="grid grid-cols-2 gap-y-10 gap-x-8">
                    <div className="space-y-1.5 px-2 border-l-2 border-blue-500/30">
                       <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Medication Audits</p>
                       <p className="text-4xl font-black tracking-tight text-foreground" data-testid="text-medication-audits">
                         {isLoading ? <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /> : stats?.medicationAudits ?? 0}
                       </p>
                    </div>
                    <div className="space-y-1.5 px-2 border-l-2 border-indigo-500/30">
                       <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Care Plan Reviews</p>
                       <p className="text-4xl font-black tracking-tight text-foreground" data-testid="text-care-plan-reviews">
                         {isLoading ? <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /> : stats?.carePlanReviews ?? 0}
                       </p>
                    </div>
                    <div className="space-y-1.5 px-2 border-l-2 border-amber-500/30">
                       <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Risk Assessments</p>
                       <p className="text-4xl font-black tracking-tight text-foreground" data-testid="text-risk-assessments">
                         {isLoading ? <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /> : stats?.riskAssessments ?? 0}
                       </p>
                    </div>
                    <div className="space-y-1.5 px-2 border-l-2 border-emerald-500/30">
                       <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Staff Checks</p>
                       <p className="text-4xl font-black tracking-tight text-foreground" data-testid="text-staff-checks">0</p>
                    </div>
                 </div>
              </CardContent>
            </Card>
          )}

          {largeWidgets.includes("recent_alerts") && (
            <Card className={cn("glass-card shadow-medium", largeWidgets.includes("compliance_data") ? "lg:col-span-3" : "lg:col-span-7")} data-testid="widget-recent-alerts">
              <CardHeader className="border-b border-border/40 pb-6 mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center text-destructive">
                    <AlertCircle className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Incident Feed</CardTitle>
                    <CardDescription>Real-time security and compliance logs.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-2">
                {isLoading ? (
                  <div className="flex items-center justify-center h-48">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : recentAlerts.length > 0 ? (
                  <div className="space-y-2 overflow-y-auto max-h-[300px] pr-2">
                    {recentAlerts.map((alert) => (
                      <div key={alert.id} className="flex items-start gap-4 p-4 rounded-2xl border border-border/40 bg-muted/20 hover:bg-muted/30 transition-colors group">
                        <div className="h-10 w-10 rounded-xl bg-background flex items-center justify-center border border-border/50 shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                          <Activity className="h-5 w-5 text-destructive" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <p className="text-sm font-bold truncate text-foreground">{alert.careWorkerName}</p>
                            <span className="text-[10px] font-bold text-muted-foreground whitespace-nowrap bg-muted px-2 py-0.5 rounded-full uppercase tracking-tighter">{formatTimeAgo(alert.createdAt)}</span>
                          </div>
                          <p className="text-xs leading-relaxed text-muted-foreground font-medium line-clamp-2">{alert.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-48 text-muted-foreground space-y-3">
                    <div className="h-12 w-12 rounded-full bg-muted/30 flex items-center justify-center">
                      <CheckCircle2 className="h-6 w-6 text-muted-foreground/40" />
                    </div>
                    <p className="text-sm font-medium">No alerts in the last 24 hours</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeWidgets.length === 0 && (
        <Card className="glass-card">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="h-16 w-16 rounded-full bg-muted/30 flex items-center justify-center mb-6">
              <Settings className="h-8 w-8 text-muted-foreground/40" />
            </div>
            <p className="text-xl font-bold text-foreground mb-2">Workspace Empty</p>
            <p className="text-sm text-muted-foreground mb-8 text-center max-w-xs font-medium">Configure your mission control by adding widgets to the dashboard.</p>
            <Button variant="outline" size="lg" onClick={() => setSettingsOpen(true)} className="rounded-xl border-border/60 font-bold tracking-tight">
              <Settings className="h-4 w-4 mr-2" />
              Configure Dashboard
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Platform Benefits */}
      <Card className="glass-card overflow-hidden animate-slide-up stagger-5" data-testid="card-platform-benefits">
        <CardHeader className="pb-6 border-b border-border/40">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center bg-blue-500/15 shadow-xs">
              <TrendingUp className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <CardTitle className="text-lg">Performance Metrics</CardTitle>
              <CardDescription className="text-xs font-medium">Propelling efficiency across care delivery.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-3 group p-6 rounded-2xl bg-muted/20 hover:bg-muted/30 transition-all border border-border/40 hover:border-border hover:shadow-soft">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-background flex items-center justify-center border border-border/60 shadow-xs group-hover:scale-110 group-hover:text-primary transition-all">
                  <Clock className="h-5 w-5" />
                </div>
                <span className="text-3xl font-black tracking-tighter text-foreground">90%</span>
              </div>
              <div>
                <p className="text-sm font-bold text-foreground mb-1">Time Recovery</p>
                <p className="text-xs leading-relaxed text-muted-foreground font-medium">Autonomous auditing recaptures hours for frontline care.</p>
              </div>
            </div>
            <div className="space-y-3 group p-6 rounded-2xl bg-muted/20 hover:bg-muted/30 transition-all border border-border/40 hover:border-border hover:shadow-soft">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-background flex items-center justify-center border border-border/60 shadow-xs group-hover:scale-110 group-hover:text-success transition-all">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <span className="text-3xl font-black tracking-tighter text-foreground">3-Pass</span>
              </div>
              <div>
                <p className="text-sm font-bold text-foreground mb-1">Deep Analysis</p>
                <p className="text-xs leading-relaxed text-muted-foreground font-medium">Layered review logic identifies discrepancies with precision.</p>
              </div>
            </div>
            <div className="space-y-3 group p-6 rounded-2xl bg-muted/20 hover:bg-muted/30 transition-all border border-border/40 hover:border-border hover:shadow-soft">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-background flex items-center justify-center border border-border/60 shadow-xs group-hover:scale-110 group-hover:text-indigo-500 transition-all">
                  <Shield className="h-5 w-5" />
                </div>
                <span className="text-3xl font-black tracking-tighter text-foreground">Live</span>
              </div>
              <div>
                <p className="text-sm font-bold text-foreground mb-1">Active Guard</p>
                <p className="text-xs leading-relaxed text-muted-foreground font-medium">Real-time telemetry of compliance and incident signals.</p>
              </div>
            </div>
            <div className="space-y-3 group p-6 rounded-2xl bg-muted/20 hover:bg-muted/30 transition-all border border-border/40 hover:border-border hover:shadow-soft">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-background flex items-center justify-center border border-border/60 shadow-xs group-hover:scale-110 group-hover:text-amber-500 transition-all">
                  <Brain className="h-5 w-5" />
                </div>
                <span className="text-3xl font-black tracking-tighter text-foreground">Expert</span>
              </div>
              <div>
                <p className="text-sm font-bold text-foreground mb-1">Contextual AI</p>
                <p className="text-xs leading-relaxed text-muted-foreground font-medium">Neural processing of complex medical and care plan data.</p>
              </div>
            </div>
          </div>
          <div className="mt-8 pt-6 flex flex-col sm:flex-row items-center justify-between gap-6 border-t border-border/40">
            <p className="text-sm font-semibold text-muted-foreground">
              Calculate your organization's potential ROI from autonomous compliance.
            </p>
            <Link href="/roi-calculator">
              <Button variant="outline" size="lg" className="rounded-xl border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary font-bold tracking-tight shadow-glow group" data-testid="button-roi-calculator">
                <TrendingUp className="h-4.5 w-4.5 mr-2.5" />
                Savings Estimator
                <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
