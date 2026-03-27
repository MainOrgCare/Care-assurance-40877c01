import { useState, useEffect, useMemo, useCallback, memo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, CheckCircle2, FileText, Activity, RefreshCw, Loader2, Settings, GripVertical, Pill, ClipboardList, Shield, Users, ArrowRight, Upload, Brain, TrendingUp, Clock, Zap, Play, Info, ChevronDown, Sparkles, Download, type LucideIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTemporaryData } from "@/context/TemporaryDataContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";
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
  { id: "compliance_data", label: "Compliance Data", icon: ClipboardList },
  { id: "recent_alerts", label: "Recent Alerts", icon: AlertCircle },
  { id: "activity_feed", label: "Activity Feed", icon: Clock },
];

const DEFAULT_WIDGETS = ["compliance_score", "audits_completed", "active_alerts", "plans_updated", "compliance_data", "recent_alerts"];
const LARGE_WIDGET_IDS = new Set(["compliance_data", "recent_alerts", "activity_feed"]);
const WIDGETS_BY_ID = new Map(ALL_WIDGETS.map((widget) => [widget.id, widget] as const));

function SortableWidgetItemBase({ widget, isActive, onToggle }: { widget: WidgetConfig; isActive: boolean; onToggle: (widgetId: string) => void }) {
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
      <div className="flex items-center gap-4">
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
        onCheckedChange={() => onToggle(widget.id)}
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

  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 5 } });
  const keyboardSensor = useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates });
  const sensors = useSensors(pointerSensor, keyboardSensor);

  useEffect(() => {
    if (user?.isDemo) {
      loadDemoData();
    }
  }, [user?.isDemo, loadDemoData]);

  const { data, isLoading, isError, error: fetchError, refetch, isRefetching } = useQuery<DashboardResponse>({
    queryKey: queryKeys.dashboard.stats(),
    queryFn: async () => {
      const res = await fetch("/api/dashboard/stats", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch dashboard stats");
      return res.json();
    },
    refetchInterval: 120000,
    refetchIntervalInBackground: false,
    staleTime: 30000,
    retry: 2,
  });

  const { data: widgetPrefs } = useQuery<{ widgets: string[] | null }>({
    queryKey: queryKeys.dashboard.widgets(),
    queryFn: async () => {
      const res = await fetch("/api/dashboard/widgets", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch widget preferences");
      return res.json();
    },
  });

  const saveWidgetsMutation = useMutation({
    mutationFn: async (widgets: string[]) => {
      const res = await apiRequest("PUT", "/api/dashboard/widgets", { widgets });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.widgets() });
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
    queryKey: queryKeys.dashboard.activity(),
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
      const orderedIds = savedWidgets.map((w: string) => w.replace("hidden:", ""));
      const missingWidgets = ALL_WIDGETS.map(w => w.id).filter(id => !orderedIds.includes(id));
      setActiveWidgets(visibleIds);
      setWidgetOrder([...orderedIds, ...missingWidgets]);
    }
  }, [widgetPrefs]);

  const activeWidgetSet = useMemo(() => new Set(activeWidgets), [activeWidgets]);

  const savePreferences = useCallback((order: string[], active: string[]) => {
    const widgetsToSave = order.map(id => active.includes(id) ? id : `hidden:${id}`);
    saveWidgetsMutation.mutate(widgetsToSave);
  }, [saveWidgetsMutation]);

  const toggleWidget = useCallback((widgetId: string) => {
    const newWidgets = activeWidgets.includes(widgetId)
      ? activeWidgets.filter(w => w !== widgetId)
      : [...activeWidgets, widgetId];
    setActiveWidgets(newWidgets);
    savePreferences(widgetOrder, newWidgets);
  }, [activeWidgets, widgetOrder, savePreferences]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = widgetOrder.indexOf(active.id as string);
      const newIndex = widgetOrder.indexOf(over.id as string);
      const newOrder = arrayMove(widgetOrder, oldIndex, newIndex);
      setWidgetOrder(newOrder);
      savePreferences(newOrder, activeWidgets);
    }
  }, [widgetOrder, activeWidgets, savePreferences]);

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

  
  const sortedActiveWidgets = useMemo(() => widgetOrder.filter(id => activeWidgetSet.has(id)), [widgetOrder, activeWidgetSet]);
  const smallWidgets = useMemo(() => sortedActiveWidgets.filter(id => !LARGE_WIDGET_IDS.has(id)), [sortedActiveWidgets]);
  const largeWidgets = useMemo(() => sortedActiveWidgets.filter(id => LARGE_WIDGET_IDS.has(id)), [sortedActiveWidgets]);

  const orderedWidgets = useMemo(
    () => widgetOrder.map((widgetId) => WIDGETS_BY_ID.get(widgetId)).filter((widget): widget is WidgetConfig => Boolean(widget)),
    [widgetOrder],
  );

  const renderSmallWidget = (widgetId: string) => {
    switch (widgetId) {
      case "compliance_score":
        return (
          <Card key={widgetId} className="group" data-testid="widget-compliance-score">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
              <CardTitle className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Compliance Score</CardTitle>
              <div className="h-8 w-8 rounded-md flex items-center justify-center bg-success/8">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              </div>
            </CardHeader>
            <CardContent className="pt-0.5">
              <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums" data-testid="text-compliance-score">
                {isLoading ? <Skeleton className="h-7 w-14" /> : stats?.auditsCompleted ? "100%" : "-"}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                <span className="inline-block h-1 w-1 rounded-full bg-success" />
                {isLoading ? <Skeleton className="h-3 w-28 inline-block" /> : stats?.auditsCompleted ? "Based on completed audits" : "No data yet"}
              </p>
            </CardContent>
          </Card>
        );
      case "audits_completed":
        return (
          <Card key={widgetId} className="group" data-testid="widget-audits-completed">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
              <CardTitle className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Audits Completed</CardTitle>
              <div className="h-8 w-8 rounded-md flex items-center justify-center bg-primary/8">
                <FileText className="h-3.5 w-3.5 text-primary" />
              </div>
            </CardHeader>
            <CardContent className="pt-0.5">
              <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums" data-testid="text-audits-completed">
                {isLoading ? <Skeleton className="h-7 w-10" /> : stats?.auditsCompleted ?? 0}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Last 24 hours</p>
            </CardContent>
          </Card>
        );
      case "active_alerts":
        return (
          <Card key={widgetId} className="group" data-testid="widget-active-alerts">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
              <CardTitle className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Active Alerts</CardTitle>
              <div className={cn(
                "h-8 w-8 rounded-md flex items-center justify-center",
                stats?.activeAlerts ? "bg-destructive/8" : "bg-muted"
              )}>
                <AlertCircle className={cn("h-3.5 w-3.5", stats?.activeAlerts ? "text-destructive" : "text-muted-foreground")} />
              </div>
            </CardHeader>
            <CardContent className="pt-0.5">
              <div className={cn("text-2xl font-bold tracking-tight tabular-nums", stats?.activeAlerts ? "text-destructive" : "text-foreground")} data-testid="text-active-alerts">
                {isLoading ? <Skeleton className="h-7 w-10" /> : stats?.activeAlerts ?? 0}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {isLoading ? <Skeleton className="h-3 w-20 inline-block" /> : stats?.activeAlerts ? "Attention required" : "All clear"}
              </p>
            </CardContent>
          </Card>
        );
      case "plans_updated":
        return (
          <Card key={widgetId} className="group" data-testid="widget-plans-updated">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
              <CardTitle className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Plans Updated</CardTitle>
              <div className="h-8 w-8 rounded-md flex items-center justify-center bg-violet-500/8">
                <Activity className="h-3.5 w-3.5 text-violet-600" />
              </div>
            </CardHeader>
            <CardContent className="pt-0.5">
              <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums" data-testid="text-plans-updated">
                {isLoading ? <Skeleton className="h-7 w-10" /> : stats?.plansUpdated ?? 0}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Recently synchronized</p>
            </CardContent>
          </Card>
        );
      case "medication_audits":
        return (
          <Card key={widgetId} className="group" data-testid="widget-medication-audits">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
              <CardTitle className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Medication Audits</CardTitle>
              <div className="h-8 w-8 rounded-md flex items-center justify-center bg-blue-500/8">
                <Pill className="h-3.5 w-3.5 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent className="pt-0.5">
              <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums" data-testid="text-medication-audits-widget">
                {isLoading ? <Skeleton className="h-7 w-10" /> : stats?.medicationAudits ?? 0}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Last 24 hours</p>
            </CardContent>
          </Card>
        );
      case "care_plan_reviews":
        return (
          <Card key={widgetId} className="group" data-testid="widget-care-plan-reviews">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
              <CardTitle className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Care Plan Reviews</CardTitle>
              <div className="h-8 w-8 rounded-md flex items-center justify-center bg-cyan-500/8">
                <FileText className="h-3.5 w-3.5 text-cyan-600" />
              </div>
            </CardHeader>
            <CardContent className="pt-0.5">
              <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums" data-testid="text-care-plan-reviews-widget">
                {isLoading ? <Skeleton className="h-7 w-10" /> : stats?.carePlanReviews ?? 0}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Last 24 hours</p>
            </CardContent>
          </Card>
        );
      case "risk_assessments":
        return (
          <Card key={widgetId} className="group" data-testid="widget-risk-assessments">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
              <CardTitle className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Risk Assessments</CardTitle>
              <div className="h-8 w-8 rounded-md flex items-center justify-center bg-amber-500/8">
                <Shield className="h-3.5 w-3.5 text-amber-600" />
              </div>
            </CardHeader>
            <CardContent className="pt-0.5">
              <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums" data-testid="text-risk-assessments-widget">
                {isLoading ? <Skeleton className="h-7 w-10" /> : stats?.riskAssessments ?? 0}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Last 24 hours</p>
            </CardContent>
          </Card>
        );
      default:
        return null;
    }
  };

  return (
    <div className="page-shell page-shell-compact">
      {user?.isDemo && (
        <Card className=" bg-primary/5 border-primary/20 animate-fade-in" data-testid="demo-mode-banner">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
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
          {isLoading && !stats ? (
            <>
              <Skeleton className="h-3 w-32 mb-2" />
              <Skeleton className="h-7 w-56 mb-1" />
              <Skeleton className="h-4 w-44" />
            </>
          ) : (
            <>
          <p className="text-[10px] font-bold text-primary/55 tracking-[0.12em] uppercase">
            Welcome back, {user?.firstName || user?.username || 'there'}
          </p>
          <h1 className="page-title leading-tight" data-testid="text-dashboard-title">Operations Dashboard</h1>
          <p className="page-subtitle max-w-lg">Unified operations overview &mdash; last 24 hours.</p>
            </>
          )}
        </div>
        <div className="flex gap-2">
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
                      {orderedWidgets.map((widget) => (
                        <SortableWidgetItem
                          key={widget.id}
                          widget={widget}
                          isActive={activeWidgetSet.has(widget.id)}
                          onToggle={toggleWidget}
                        />
                      ))}
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

      {/* Error Banner */}
      {isError && (
        <Card className=" bg-destructive/5 border-destructive/20 animate-fade-in">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-destructive/15 flex items-center justify-center">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground text-sm">Unable to load dashboard data</h2>
                  <p className="text-xs text-muted-foreground">
                    {fetchError instanceof Error ? fetchError.message : "An unexpected error occurred. Statistics may be out of date."}
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching} className="gap-2">
                {isRefetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <div className="space-y-3.5 animate-slide-up stagger-2">
        <div className="flex items-center gap-2.5 px-0.5">
          <div className="h-7 w-7 rounded-lg flex items-center justify-center bg-amber-500/10 border border-amber-500/15 shadow-[var(--shadow-xs)]">
            <Zap className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h2 className="text-[0.8125rem] font-semibold tracking-[-0.01em] text-foreground">Launch Center</h2>
            <p className="text-[10px] text-muted-foreground/60">Quick access to key workflows</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {QUICK_ACTIONS.map((action, index) => (
            <Link key={index} href={action.href}>
              <Card className=" group h-full cursor-pointer" data-testid={`card-quick-action-${index}`}>
                <CardContent className={`p-4 relative border ${action.panelTone} rounded-xl transition-all duration-200 group-hover:shadow-[var(--shadow-medium)]`}>
                  <div className={`relative h-9 w-9 rounded-lg ${action.iconTone} flex items-center justify-center mb-3 shadow-[var(--shadow-xs)]`}>
                    <action.icon className="h-4 w-4" />
                  </div>
                  
                  <h3 className="font-semibold text-[13px] mb-0.5 group-hover:text-primary transition-colors duration-150 text-foreground tracking-[-0.01em]">{action.label}</h3>
                  <p className="text-[11px] leading-relaxed text-muted-foreground/65">{action.description}</p>
                  
                  <div className="flex items-center gap-1 mt-3 text-[10px] font-semibold text-primary/60 opacity-0 group-hover:opacity-100 translate-x-0 group-hover:translate-x-0.5 transition-all duration-200">
                    <span>Open</span>
                    <ArrowRight className="h-3 w-3" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {isLoading && !stats ? (
        <>
          {/* Skeleton stat cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 animate-slide-up stagger-3">
            {[1, 2, 3, 4].map(i => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-8 w-8 rounded-md" />
                </CardHeader>
                <CardContent className="pt-0.5">
                  <Skeleton className="h-7 w-16 mb-2" />
                  <Skeleton className="h-2.5 w-28" />
                </CardContent>
              </Card>
            ))}
          </div>
          {/* Skeleton large panels */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7 animate-slide-up stagger-4">
            <Card className=" lg:col-span-4">
              <CardHeader className="border-b border-border/30 pb-3 mb-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-6 w-6 rounded-md" />
                  <div>
                    <Skeleton className="h-4 w-32 mb-1" />
                    <Skeleton className="h-3 w-44" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-6">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="space-y-2 pl-2.5 border-l-2 border-border/20">
                      <Skeleton className="h-2.5 w-20" />
                      <Skeleton className="h-6 w-10" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card className=" lg:col-span-3">
              <CardHeader className="border-b border-border/30 pb-3 mb-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-6 w-6 rounded-md" />
                  <Skeleton className="h-4 w-28" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex items-start gap-4 p-3 rounded-lg border border-border/30">
                      <Skeleton className="h-8 w-8 rounded-md flex-shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3 w-40" />
                        <Skeleton className="h-2.5 w-56" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
      <>
      {smallWidgets.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 animate-slide-up stagger-3">
          {smallWidgets.map(widgetId => renderSmallWidget(widgetId))}
        </div>
      )}

      {largeWidgets.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7 animate-slide-up stagger-4">
          {largeWidgets.includes("compliance_data") && (
            <Card className={cn("", largeWidgets.includes("recent_alerts") ? "lg:col-span-4" : "lg:col-span-7")} data-testid="widget-compliance-data">
              <CardHeader className="border-b border-border/30 pb-3 mb-3">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-md bg-primary/8 flex items-center justify-center">
                    <TrendingUp className="h-3 w-3 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-xs font-semibold">Audit Performance</CardTitle>
                    <CardDescription className="text-[10px]">Current operational window.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                 <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-1 pl-2.5 border-l-2 border-blue-500/20">
                       <p className="text-[9px] uppercase tracking-widest font-semibold text-muted-foreground/70">Medication Audits</p>
                       <p className="text-2xl font-semibold tracking-tight text-foreground tabular-nums" data-testid="text-medication-audits">
                         {isLoading ? <Skeleton className="h-7 w-10" /> : stats?.medicationAudits ?? 0}
                       </p>
                    </div>
                    <div className="space-y-1 pl-2.5 border-l-2 border-indigo-500/20">
                       <p className="text-[9px] uppercase tracking-widest font-semibold text-muted-foreground/70">Care Plan Reviews</p>
                       <p className="text-2xl font-semibold tracking-tight text-foreground tabular-nums" data-testid="text-care-plan-reviews">
                         {isLoading ? <Skeleton className="h-7 w-10" /> : stats?.carePlanReviews ?? 0}
                       </p>
                    </div>
                    <div className="space-y-1 pl-2.5 border-l-2 border-amber-500/20">
                       <p className="text-[9px] uppercase tracking-widest font-semibold text-muted-foreground/70">Risk Assessments</p>
                       <p className="text-2xl font-semibold tracking-tight text-foreground tabular-nums" data-testid="text-risk-assessments">
                         {isLoading ? <Skeleton className="h-7 w-10" /> : stats?.riskAssessments ?? 0}
                       </p>
                    </div>
                 </div>
              </CardContent>
            </Card>
          )}

          {largeWidgets.includes("recent_alerts") && (
            <Card className={cn("", largeWidgets.includes("compliance_data") ? "lg:col-span-3" : "lg:col-span-7")} data-testid="widget-recent-alerts">
              <CardHeader className="border-b border-border/30 pb-3 mb-2">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-md bg-destructive/8 flex items-center justify-center text-destructive">
                    <AlertCircle className="h-3 w-3" />
                  </div>
                  <div>
                    <CardTitle className="text-xs font-semibold">Incident Feed</CardTitle>
                    <CardDescription className="text-[10px]">Security and compliance logs.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-3">
                {isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }, (_, i) => (
                      <div key={i} className="flex items-start gap-4 p-3 rounded-lg border border-border/40">
                        <Skeleton className="h-8 w-8 rounded-md flex-shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-3 w-40" />
                          <Skeleton className="h-2.5 w-56" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : recentAlerts.length > 0 ? (
                  <div className="space-y-2 overflow-y-auto max-h-[280px] pr-1">
                    {recentAlerts.map((alert) => (
                      <div key={alert.id} className="flex items-start gap-4 p-3 rounded-lg border border-border/40 bg-muted/15 hover:bg-muted/25 transition-colors group">
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
            <Card className=" lg:col-span-full" data-testid="widget-activity-feed">
              <CardHeader className="border-b border-border/30 pb-3 mb-2">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-md bg-violet-500/8 flex items-center justify-center text-violet-600">
                    <Clock className="h-3 w-3" />
                  </div>
                  <div>
                    <CardTitle className="text-xs font-semibold">Activity Feed</CardTitle>
                    <CardDescription className="text-[10px]">Live stream of system operations and events.</CardDescription>
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
                    {activityData.map((item: ActivityItem) => (
                      <div key={item.id} className="flex items-start gap-4 p-3 rounded-lg border border-border/40 bg-muted/15 hover:bg-muted/25 transition-colors">
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
        <Card className="">
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
      </>
      )}

      {/* Operational Summary & Data Export */}
      <Card className=" overflow-hidden animate-slide-up stagger-5" data-testid="card-operational-summary">
        <CardHeader className="pb-3 border-b border-border/25">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg flex items-center justify-center bg-blue-500/10 border border-blue-500/12 shadow-[var(--shadow-xs)]">
                <TrendingUp className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-[13px] font-semibold tracking-[-0.01em]">Operational Summary</CardTitle>
                <CardDescription className="text-[10px]">Real-time overview of today&apos;s operations.</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span className={cn("h-1.5 w-1.5 rounded-full", isRefetching ? "bg-warning animate-pulse" : isError ? "bg-destructive" : "bg-success")} />
                      <span>{isRefetching ? "Refreshing..." : isError ? "Offline" : "Live"}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <p className="text-xs">
                      {isRefetching ? "Fetching latest data..." : isError ? "Unable to reach server" : "Data refreshes every 2 minutes"}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(() => {
              const totalWork = (stats?.auditsCompleted ?? 0) + (stats?.carePlanReviews ?? 0) + (stats?.riskAssessments ?? 0) + (stats?.medicationAudits ?? 0);
              const summaryItems = [
                { label: "Total Operations", value: totalWork, icon: Activity, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/15" },
                { label: "Active Alerts", value: stats?.activeAlerts ?? 0, icon: AlertCircle, color: (stats?.activeAlerts ?? 0) > 0 ? "text-destructive" : "text-success", bg: (stats?.activeAlerts ?? 0) > 0 ? "bg-destructive/10" : "bg-success/10", border: (stats?.activeAlerts ?? 0) > 0 ? "border-destructive/15" : "border-success/15" },
                { label: "Plans Updated", value: stats?.plansUpdated ?? 0, icon: FileText, color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/15" },
                { label: "Risk Checks", value: stats?.riskAssessments ?? 0, icon: Shield, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/15" },
              ];
              return summaryItems.map((item) => (
                <div key={item.label} className={cn("p-4 rounded-xl border transition-all duration-200 hover:shadow-[var(--shadow-medium)] hover:-translate-y-px", item.border, "bg-background")}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shadow-[var(--shadow-xs)]", item.bg)}>
                      <item.icon className={cn("h-3.5 w-3.5", item.color)} />
                    </div>
                  </div>
                  <p className="text-[1.625rem] font-bold tracking-tight text-foreground tabular-nums">
                    {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : item.value}
                  </p>
                  <p className="text-[10px] font-semibold text-muted-foreground/70 mt-0.5 tracking-wide">{item.label}</p>
                </div>
              ));
            })()}
          </div>
          <div className="mt-5 pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-border/30">
            <p className="text-[10px] text-muted-foreground/70">
              Last refreshed {data ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'} &middot; Auto-refresh every 2 min
            </p>
            <div className="flex items-center gap-2">
              {user?.role === 'admin' && (
                <Link href="/roi-calculator">
                  <Button variant="ghost" size="sm" className="text-xs h-8 font-medium text-muted-foreground hover:text-foreground" data-testid="button-roi-calculator">
                    <TrendingUp className="h-3 w-3 mr-1.5" />
                    ROI Calculator
                  </Button>
                </Link>
              )}
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-8 font-medium"
                data-testid="button-export-dashboard"
                disabled={isLoading || !stats}
                onClick={() => {
                  if (!stats) return;
                  const rows = [
                    ["Metric", "Value", "Period"],
                    ["Audits Completed", String(stats.auditsCompleted), "Last 24h"],
                    ["Active Alerts", String(stats.activeAlerts), "Current"],
                    ["Plans Updated", String(stats.plansUpdated), "Last 24h"],
                    ["Medication Audits", String(stats.medicationAudits), "Last 24h"],
                    ["Care Plan Reviews", String(stats.carePlanReviews), "Last 24h"],
                    ["Risk Assessments", String(stats.riskAssessments), "Last 24h"],
                  ];
                  const csv = rows.map(r => r.join(",")).join("\n");
                  const blob = new Blob([csv], { type: "text/csv" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `dashboard-export-${new Date().toISOString().slice(0, 10)}.csv`;
                  a.click();
                  URL.revokeObjectURL(a.href);
                }}
              >
                <Download className="h-3 w-3 mr-1.5" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
