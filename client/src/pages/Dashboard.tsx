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
  { id: "activity_feed", label: "Activity Feed", icon: Clock },
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
        <button {...attributes} {...listeners} aria-label={`Drag to reorder ${widget.label}`} className="cursor-grab active:cursor-grabbing p-1.5 rounded-lg hover:bg-background/80 text-muted-foreground transition-colors">
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

const QUICK_ACTIONS: { icon: LucideIcon; label: string; description: string; href: string; panelTone: string; iconTone: string }[] = [
  {
    icon: Upload,
    label: "EMAR Audit",
    description: "Upload and analyze medication records",
    href: "/care-workers/emar-audit",
    panelTone: "bg-primary/[0.03] border-primary/20",
    iconTone: "bg-primary/12 text-primary",
  },
  {
    icon: FileText,
    label: "Care Plan",
    description: "Generate AI-powered care plans",
    href: "/service-users/upload",
    panelTone: "bg-sky-500/[0.03] border-sky-500/20",
    iconTone: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  },
  {
    icon: Shield,
    label: "Risk Assessment",
    description: "Create comprehensive risk assessments",
    href: "/service-users/risk-assessment",
    panelTone: "bg-slate-500/[0.03] border-slate-500/20",
    iconTone: "bg-slate-600/12 text-slate-700 dark:text-slate-200",
  },
  {
    icon: Brain,
    label: "Plan Enhancer",
    description: "Enhance existing care plans with AI",
    href: "/service-users/plan-enhancer",
    panelTone: "bg-emerald-500/[0.03] border-emerald-500/20",
    iconTone: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  },
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
    refetchInterval: 120000,
    refetchIntervalInBackground: false,
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

  interface ActivityItem {
    id: string;
    type: "audit" | "alert" | "care_plan" | "system";
    title: string;
    description: string;
    timestamp: string;
    severity?: "info" | "warning" | "critical";
    actor?: string;
  }

  const { data: activityData } = useQuery<ActivityItem[]>({
    queryKey: ["/api/dashboard/activity"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/activity?limit=15", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch activity");
      return res.json();
    },
    refetchInterval: 120000,
    staleTime: 30000,
    enabled: activeWidgets.includes("activity_feed"),
  });

  useEffect(() => {
    if (widgetPrefs?.widgets && widgetPrefs.widgets.length > 0) {
      const savedWidgets = widgetPrefs.widgets;
      const visibleIds = savedWidgets.filter((w: string) => !w.startsWith("hidden:"));
      savedWidgets.filter((w: string) => w.startsWith("hidden:")).map((w: string) => w.replace("hidden:", ""));
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

  
  const sortedActiveWidgets = useMemo(() => widgetOrder.filter(id => activeWidgets.includes(id)), [widgetOrder, activeWidgets]);
  const smallWidgets = useMemo(() => sortedActiveWidgets.filter(id => !["compliance_data", "recent_alerts", "activity_feed"].includes(id)), [sortedActiveWidgets]);
  const largeWidgets = useMemo(() => sortedActiveWidgets.filter(id => ["compliance_data", "recent_alerts", "activity_feed"].includes(id)), [sortedActiveWidgets]);

  const renderSmallWidget = (widgetId: string) => {
    switch (widgetId) {
      case "compliance_score":
        return (
          <Card key={widgetId} className="group" data-testid="widget-compliance-score">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Compliance Score</CardTitle>
              <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-success/10">
                <CheckCircle2 className="h-4 w-4 text-success" />
              </div>
            </CardHeader>
            <CardContent className="pt-1">
              <div className="text-3xl font-bold tracking-tight text-foreground tabular-nums" data-testid="text-compliance-score">
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : stats?.auditsCompleted ? "100%" : "-"}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
                {stats?.auditsCompleted ? "Based on completed audits" : "No data yet"}
              </p>
            </CardContent>
          </Card>
        );
      case "audits_completed":
        return (
          <Card key={widgetId} className="group" data-testid="widget-audits-completed">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Audits Completed</CardTitle>
              <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-primary/10">
                <FileText className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent className="pt-1">
              <div className="text-3xl font-bold tracking-tight text-foreground tabular-nums" data-testid="text-audits-completed">
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : stats?.auditsCompleted ?? 0}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">Last 24 hours activity</p>
            </CardContent>
          </Card>
        );
      case "active_alerts":
        return (
          <Card key={widgetId} className="group" data-testid="widget-active-alerts">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Active Alerts</CardTitle>
              <div className={cn(
                "h-9 w-9 rounded-lg flex items-center justify-center",
                stats?.activeAlerts ? "bg-destructive/10" : "bg-muted"
              )}>
                <AlertCircle className={cn("h-4 w-4", stats?.activeAlerts ? "text-destructive" : "text-muted-foreground")} />
              </div>
            </CardHeader>
            <CardContent className="pt-1">
              <div className={cn("text-3xl font-bold tracking-tight tabular-nums", stats?.activeAlerts ? "text-destructive" : "text-foreground")} data-testid="text-active-alerts">
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : stats?.activeAlerts ?? 0}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                {stats?.activeAlerts ? "Immediate attention required" : "All systems normal"}
              </p>
            </CardContent>
          </Card>
        );
      case "plans_updated":
        return (
          <Card key={widgetId} className="group" data-testid="widget-plans-updated">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Plans Updated</CardTitle>
              <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-violet-500/10">
                <Activity className="h-4 w-4 text-violet-600" />
              </div>
            </CardHeader>
            <CardContent className="pt-1">
              <div className="text-3xl font-bold tracking-tight text-foreground tabular-nums" data-testid="text-plans-updated">
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : stats?.plansUpdated ?? 0}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">Recently synchronized plans</p>
            </CardContent>
          </Card>
        );
      case "medication_audits":
        return (
          <Card key={widgetId} className="group" data-testid="widget-medication-audits">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Medication Audits</CardTitle>
              <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-blue-500/10">
                <Pill className="h-4 w-4 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent className="pt-1">
              <div className="text-3xl font-bold tracking-tight text-foreground tabular-nums" data-testid="text-medication-audits-widget">
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : stats?.medicationAudits ?? 0}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">Last 24 hours activity</p>
            </CardContent>
          </Card>
        );
      case "care_plan_reviews":
        return (
          <Card key={widgetId} className="group" data-testid="widget-care-plan-reviews">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Care Plan Reviews</CardTitle>
              <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-cyan-500/10">
                <FileText className="h-4 w-4 text-cyan-600" />
              </div>
            </CardHeader>
            <CardContent className="pt-1">
              <div className="text-3xl font-bold tracking-tight text-foreground tabular-nums" data-testid="text-care-plan-reviews-widget">
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : stats?.carePlanReviews ?? 0}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">Last 24 hours activity</p>
            </CardContent>
          </Card>
        );
      case "risk_assessments":
        return (
          <Card key={widgetId} className="group" data-testid="widget-risk-assessments">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Risk Assessments</CardTitle>
              <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-amber-500/10">
                <Shield className="h-4 w-4 text-amber-600" />
              </div>
            </CardHeader>
            <CardContent className="pt-1">
              <div className="text-3xl font-bold tracking-tight text-foreground tabular-nums" data-testid="text-risk-assessments-widget">
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : stats?.riskAssessments ?? 0}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">Last 24 hours activity</p>
            </CardContent>
          </Card>
        );
      case "staff_checks":
        return (
          <Card key={widgetId} className="group" data-testid="widget-staff-checks">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Staff Checks</CardTitle>
              <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-indigo-500/10">
                <Users className="h-4 w-4 text-indigo-600" />
              </div>
            </CardHeader>
            <CardContent className="pt-1">
              <div className="text-3xl font-bold tracking-tight text-foreground tabular-nums" data-testid="text-staff-checks-widget">0</div>
              <p className="text-[11px] text-muted-foreground mt-1.5">Last 24 hours activity</p>
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
        <Card className="bg-primary/5 border-primary/20 animate-fade-in" data-testid="demo-mode-banner">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/15 flex items-center justify-center">
                  <Play className="h-5 w-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-foreground">Demo Mode Active</h2>
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

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 animate-slide-up stagger-1">
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-primary/70 tracking-wide uppercase px-0.5">
            Welcome back, {user?.firstName || user?.username || 'there'}
          </p>
          <h1 className="page-title leading-tight" data-testid="text-dashboard-title">Operations Dashboard</h1>
          <p className="page-subtitle">Unified operations overview &mdash; last 24 hours.</p>
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
      <div className="space-y-3.5 animate-slide-up stagger-2">
        <div className="flex items-center gap-2.5 px-0.5">
          <div className="h-7 w-7 rounded-lg flex items-center justify-center bg-amber-500/8 border border-amber-500/15 dark:bg-amber-500/10 dark:border-amber-400/20">
            <Zap className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight text-foreground">Launch Center</h2>
            <p className="text-[11px] text-muted-foreground/70">Accelerated workflows for care teams</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {QUICK_ACTIONS.map((action, index) => (
            <Link key={index} href={action.href}>
              <Card className="group h-full" data-testid={`card-quick-action-${index}`}>
                <CardContent className={`p-4 relative border ${action.panelTone} rounded-xl transition-colors duration-200`}>
                  <div className={`relative h-9 w-9 rounded-lg ${action.iconTone} flex items-center justify-center mb-3`}>
                    <action.icon className="h-4.5 w-4.5" />
                  </div>
                  
                  <h3 className="font-bold text-[0.8125rem] mb-1 group-hover:text-primary transition-colors duration-200 text-foreground tracking-tight">{action.label}</h3>
                  <p className="text-[11px] leading-relaxed text-muted-foreground/80">{action.description}</p>
                  
                  <div className="flex items-center gap-1.5 mt-3 text-[10px] font-semibold text-primary opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150">
                    <span>Open</span>
                    <ArrowRight className="h-3 w-3" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {smallWidgets.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 animate-slide-up stagger-3">
          {smallWidgets.map(widgetId => renderSmallWidget(widgetId))}
        </div>
      )}

      {largeWidgets.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7 animate-slide-up stagger-4">
          {largeWidgets.includes("compliance_data") && (
            <Card className={cn("shadow-sm", largeWidgets.includes("recent_alerts") ? "lg:col-span-4" : "lg:col-span-7")} data-testid="widget-compliance-data">
              <CardHeader className="border-b border-border/40 pb-4 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
                    <TrendingUp className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-semibold">Audit Performance</CardTitle>
                    <CardDescription className="text-xs">Current operational window.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                 <div className="grid grid-cols-2 gap-y-8 gap-x-6">
                    <div className="space-y-1 pl-3 border-l-2 border-blue-500/25">
                       <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Medication Audits</p>
                       <p className="text-3xl font-semibold tracking-tight text-foreground" data-testid="text-medication-audits">
                         {isLoading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : stats?.medicationAudits ?? 0}
                       </p>
                    </div>
                    <div className="space-y-1 pl-3 border-l-2 border-indigo-500/25">
                       <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Care Plan Reviews</p>
                       <p className="text-3xl font-semibold tracking-tight text-foreground" data-testid="text-care-plan-reviews">
                         {isLoading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : stats?.carePlanReviews ?? 0}
                       </p>
                    </div>
                    <div className="space-y-1 pl-3 border-l-2 border-amber-500/25">
                       <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Risk Assessments</p>
                       <p className="text-3xl font-semibold tracking-tight text-foreground" data-testid="text-risk-assessments">
                         {isLoading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : stats?.riskAssessments ?? 0}
                       </p>
                    </div>
                    <div className="space-y-1 pl-3 border-l-2 border-emerald-500/25">
                       <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Staff Checks</p>
                       <p className="text-3xl font-semibold tracking-tight text-foreground" data-testid="text-staff-checks">0</p>
                    </div>
                 </div>
              </CardContent>
            </Card>
          )}

          {largeWidgets.includes("recent_alerts") && (
            <Card className={cn("shadow-sm", largeWidgets.includes("compliance_data") ? "lg:col-span-3" : "lg:col-span-7")} data-testid="widget-recent-alerts">
              <CardHeader className="border-b border-border/40 pb-4 mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-md bg-destructive/10 flex items-center justify-center text-destructive">
                    <AlertCircle className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-semibold">Incident Feed</CardTitle>
                    <CardDescription className="text-xs">Security and compliance logs.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-3">
                {isLoading ? (
                  <div className="flex items-center justify-center h-48">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : recentAlerts.length > 0 ? (
                  <div className="space-y-2 overflow-y-auto max-h-[280px] pr-1">
                    {recentAlerts.map((alert) => (
                      <div key={alert.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/40 bg-muted/15 hover:bg-muted/25 transition-colors group">
                        <div className="h-8 w-8 rounded-md bg-background flex items-center justify-center border border-border/50 shrink-0">
                          <Activity className="h-4 w-4 text-destructive" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <p className="text-sm font-semibold truncate text-foreground">{alert.careWorkerName}</p>
                            <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">{formatTimeAgo(alert.createdAt)}</span>
                          </div>
                          <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">{alert.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-48 text-muted-foreground space-y-2">
                    <CheckCircle2 className="h-8 w-8 text-muted-foreground/50" />
                    <p className="text-sm">No alerts in the last 24 hours</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {largeWidgets.includes("activity_feed") && (
            <Card className="lg:col-span-full shadow-sm" data-testid="widget-activity-feed">
              <CardHeader className="border-b border-border/40 pb-4 mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-md bg-violet-500/10 flex items-center justify-center text-violet-600">
                    <Clock className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-semibold">Activity Feed</CardTitle>
                    <CardDescription className="text-xs">Live stream of system operations and events.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-3">
                {!activityData || activityData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-muted-foreground space-y-2">
                    <Clock className="h-8 w-8 text-muted-foreground/50" />
                    <p className="text-sm">No recent activity</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {activityData.map((item) => (
                      <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/40 bg-muted/15 hover:bg-muted/25 transition-colors">
                        <div className={cn(
                          "h-8 w-8 rounded-md flex items-center justify-center border border-border/50 shrink-0",
                          item.type === "alert" ? "bg-destructive/10" :
                          item.type === "audit" ? "bg-primary/10" :
                          "bg-muted"
                        )}>
                          {item.type === "alert" ? (
                            <AlertCircle className="h-4 w-4 text-destructive" />
                          ) : item.type === "audit" ? (
                            <FileText className="h-4 w-4 text-primary" />
                          ) : (
                            <Activity className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <p className="text-sm font-semibold truncate text-foreground">{item.title}</p>
                            <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">{formatTimeAgo(item.timestamp)}</span>
                          </div>
                          <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">{item.description}</p>
                          {item.actor && (
                            <p className="text-[10px] font-medium text-primary mt-1">{item.actor}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeWidgets.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-14">
            <Settings className="h-10 w-10 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-semibold text-foreground mb-1">Dashboard Empty</p>
            <p className="text-sm text-muted-foreground mb-6 text-center max-w-xs">Add widgets to customize your dashboard view.</p>
            <Button variant="outline" onClick={() => setSettingsOpen(true)} className="font-medium">
              <Settings className="h-4 w-4 mr-2" />
              Configure Dashboard
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Platform Benefits */}
      <Card className="overflow-hidden animate-slide-up stagger-5" data-testid="card-platform-benefits">
        <CardHeader className="pb-4 border-b border-border/40">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg flex items-center justify-center bg-blue-500/10 dark:bg-blue-400/10">
              <TrendingUp className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Performance Metrics</CardTitle>
              <CardDescription className="text-xs">Efficiency indicators across care delivery.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2.5 group p-5 rounded-xl bg-muted/15 hover:bg-muted/25 transition-all duration-200 border border-border/30 hover:border-border/50">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-background flex items-center justify-center border border-border/50 shadow-xs">
                  <Clock className="h-4 w-4 text-foreground/70" />
                </div>
                <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums">90%</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground mb-0.5">Time Recovery</p>
                <p className="text-xs leading-relaxed text-muted-foreground/80">Autonomous auditing recaptures hours for frontline care.</p>
              </div>
            </div>
            <div className="space-y-2.5 group p-5 rounded-xl bg-muted/15 hover:bg-muted/25 transition-all duration-200 border border-border/30 hover:border-border/50">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-background flex items-center justify-center border border-border/50 shadow-xs">
                  <CheckCircle2 className="h-4 w-4 text-foreground/70" />
                </div>
                <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums">3-Pass</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground mb-0.5">Deep Analysis</p>
                <p className="text-xs leading-relaxed text-muted-foreground/80">Layered review logic identifies discrepancies with precision.</p>
              </div>
            </div>
            <div className="space-y-2.5 group p-5 rounded-xl bg-muted/15 hover:bg-muted/25 transition-all duration-200 border border-border/30 hover:border-border/50">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-background flex items-center justify-center border border-border/50 shadow-xs">
                  <Shield className="h-4 w-4 text-foreground/70" />
                </div>
                <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums">Live</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground mb-0.5">Active Guard</p>
                <p className="text-xs leading-relaxed text-muted-foreground/80">Real-time telemetry of compliance and incident signals.</p>
              </div>
            </div>
            <div className="space-y-2.5 group p-5 rounded-xl bg-muted/15 hover:bg-muted/25 transition-all duration-200 border border-border/30 hover:border-border/50">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-background flex items-center justify-center border border-border/50 shadow-xs">
                  <Brain className="h-4 w-4 text-foreground/70" />
                </div>
                <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums">Expert</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground mb-0.5">Contextual AI</p>
                <p className="text-xs leading-relaxed text-muted-foreground/80">Neural processing of complex medical and care plan data.</p>
              </div>
            </div>
          </div>
          <div className="mt-6 pt-5 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-border/40">
            <p className="text-sm text-muted-foreground/80">
              Calculate your organization&apos;s potential ROI from autonomous compliance.
            </p>
            <Link href="/roi-calculator">
              <Button variant="outline" className="font-medium" data-testid="button-roi-calculator">
                <TrendingUp className="h-4 w-4 mr-2" />
                Savings Estimator
                <ArrowRight className="h-3.5 w-3.5 ml-2" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
