import { useState, useEffect, useMemo, useCallback, memo, useRef } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Activity,
  RefreshCw,
  Loader2,
  Settings,
  GripVertical,
  Pill,
  ClipboardList,
  Shield,
  Users,
  ArrowRight,
  ArrowUpRight,
  Upload,
  Brain,
  TrendingUp,
  Clock,
  Zap,
  Play,
  Info,
  ChevronDown,
  Sparkles,
  Download,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTemporaryData } from "@/context/TemporaryDataContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, parseApiResponse } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { canAccessAppPath } from "@shared/roles";

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
        "flex items-center justify-between p-3 rounded-xl border border-border transition-all",
        isDragging ? "opacity-50 scale-95 z-50 bg-accent" : "bg-muted/50 hover:bg-muted"
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

const QUICK_ACTIONS: {
  icon: LucideIcon;
  label: string;
  description: string;
  href: string;
  panelTone: string;
  iconTone: string;
  badge: string;
}[] = [
  {
    icon: Upload,
    label: "EMAR Audit",
    description: "Upload and analyze medication records",
    href: "/care-workers/emar-audit",
    panelTone: "bg-primary/[0.03] border-primary/20",
    iconTone: "bg-primary/12 text-primary",
    badge: "Medication",
  },
  {
    icon: FileText,
    label: "Care Plan",
    description: "Generate AI-powered care plans",
    href: "/service-users/upload",
    panelTone: "bg-secondary/[0.03] border-secondary/20",
    iconTone: "bg-secondary/12 text-secondary",
    badge: "Planning",
  },
  {
    icon: Shield,
    label: "Risk Assessment",
    description: "Create comprehensive risk assessments",
    href: "/service-users/risk-assessment",
    panelTone: "bg-muted/50 border-border",
    iconTone: "bg-muted text-muted-foreground",
    badge: "Safety",
  },
  {
    icon: Brain,
    label: "Plan Enhancer",
    description: "Enhance existing care plans with AI",
    href: "/service-users/plan-enhancer",
    panelTone: "bg-success/[0.03] border-success/20",
    iconTone: "bg-success/12 text-success",
    badge: "AI",
  },
];

const PRIMARY_ANALYSIS_ACTIONS: Array<{
  path: string;
  label: string;
  description: string;
  icon: LucideIcon;
  iconClassName: string;
}> = [
  {
    path: "/care-workers/emar-audit",
    label: "EMAR Audit",
    description: "Analyze medication records",
    icon: Pill,
    iconClassName: "text-primary",
  },
  {
    path: "/service-users/upload",
    label: "Care Plan",
    description: "Generate AI care plans",
    icon: FileText,
    iconClassName: "text-secondary",
  },
  {
    path: "/service-users/risk-assessment",
    label: "Risk Assessment",
    description: "Create risk assessments",
    icon: Shield,
    iconClassName: "text-warning",
  },
  {
    path: "/service-users/plan-enhancer",
    label: "Plan Enhancer",
    description: "Enhance existing plans",
    icon: Sparkles,
    iconClassName: "text-success",
  },
];

const SECONDARY_ANALYSIS_ACTIONS: Array<{
  path: string;
  label: string;
  description: string;
  icon: LucideIcon;
  iconClassName: string;
}> = [
  {
    path: "/care-workers/visit-audit",
    label: "Visit Audit",
    description: "Audit care visits",
    icon: ClipboardList,
    iconClassName: "text-muted-foreground",
  },
];

export default function Dashboard() {
  const { user } = useAuth();
  usePageTitle("Dashboard");
  const { loadDemoData } = useTemporaryData();
  const queryClient = useQueryClient();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeWidgets, setActiveWidgets] = useState<string[]>(DEFAULT_WIDGETS);
  const [widgetOrder, setWidgetOrder] = useState<string[]>(ALL_WIDGETS.map(w => w.id));
  const [, navigate] = useLocation();
  const availableQuickActions = useMemo(
    () => QUICK_ACTIONS.filter((action) => canAccessAppPath(user?.role, action.href)),
    [user?.role],
  );
  const availablePrimaryAnalysisActions = useMemo(
    () => PRIMARY_ANALYSIS_ACTIONS.filter((action) => canAccessAppPath(user?.role, action.path)),
    [user?.role],
  );
  const availableSecondaryAnalysisActions = useMemo(
    () => SECONDARY_ANALYSIS_ACTIONS.filter((action) => canAccessAppPath(user?.role, action.path)),
    [user?.role],
  );

  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 5 } });
  const keyboardSensor = useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates });
  const sensors = useSensors(pointerSensor, keyboardSensor);

  useEffect(() => {
    if (user?.isDemo) {
      loadDemoData();
    }
  }, [user?.isDemo, loadDemoData]);

  const { data, isLoading, isError, error: fetchError, refetch, isRefetching, dataUpdatedAt } = useQuery<DashboardResponse>({
    queryKey: queryKeys.dashboard.stats(),
    queryFn: async () => {
      const res = await fetch("/api/dashboard/stats", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch dashboard stats");
      return parseApiResponse<DashboardResponse>(res);
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
      return parseApiResponse<{ widgets: string[] | null }>(res);
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
      return parseApiResponse<ActivityItem[]>(res);
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
  const operationsSummary = useMemo(
    () => [
      {
        label: "Workspace mode",
        value: user?.isDemo ? "Demo" : "Live",
        description: user?.isDemo ? "Sample records for walkthroughs" : "Operational workspace for daily assurance",
        icon: CheckCircle2,
        accentClass: user?.isDemo ? "bg-warning/10 text-warning border-warning/20" : "bg-success/10 text-success border-success/20",
      },
      {
        label: "Priority queue",
        value: `${recentAlerts.length}`,
        description: recentAlerts.length > 0 ? "Compliance items require follow-up" : "No active issues highlighted right now",
        icon: AlertCircle,
        accentClass: recentAlerts.length > 0 ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-success/10 text-success border-success/20",
      },
      {
        label: "Assurance throughput",
        value: `${(stats?.medicationAudits ?? 0) + (stats?.carePlanReviews ?? 0) + (stats?.riskAssessments ?? 0)}`,
        description: "Medication, care planning, and risk workflows in the current window",
        icon: ClipboardList,
        accentClass: "bg-primary/10 text-primary border-primary/20",
      },
      {
        label: "Configured widgets",
        value: `${activeWidgets.length}`,
        description: "Dashboard layout tailored to your admin workflow",
        icon: LayoutDashboard,
        accentClass: "bg-secondary/10 text-secondary border-secondary/20",
      },
    ],
    [activeWidgets.length, recentAlerts.length, stats?.carePlanReviews, stats?.medicationAudits, stats?.riskAssessments, user?.isDemo],
  );

  const topStatusChips = useMemo(
    () => [
      {
        label: isError ? "Sync paused" : isRefetching ? "Syncing" : "Live sync",
        toneClass: isError
          ? "border-destructive/25 bg-destructive/8 text-destructive"
          : isRefetching
            ? "border-warning/25 bg-warning/8 text-warning"
            : "border-success/25 bg-success/10 text-success",
      },
      {
        label: dataUpdatedAt
          ? `Updated ${new Date(dataUpdatedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}`
          : "Awaiting first sync",
        toneClass: "border-border/65 bg-background/80 text-muted-foreground",
      },
      {
        label: `${activeWidgets.length} widgets active`,
        toneClass: "border-primary/20 bg-primary/8 text-primary",
      },
      {
        label: recentAlerts.length > 0 ? `${recentAlerts.length} alerts pending` : "No active alerts",
        toneClass:
          recentAlerts.length > 0
            ? "border-destructive/25 bg-destructive/8 text-destructive"
            : "border-success/25 bg-success/10 text-success",
      },
    ],
    [activeWidgets.length, dataUpdatedAt, isError, isRefetching, recentAlerts.length],
  );

  const auditDistribution = useMemo(() => {
    const entries = [
      {
        id: "medication",
        label: "Medication",
        value: stats?.medicationAudits ?? 0,
        barClass: "bg-primary",
      },
      {
        id: "care-plans",
        label: "Care plans",
        value: stats?.carePlanReviews ?? 0,
        barClass: "bg-secondary",
      },
      {
        id: "risk",
        label: "Risk",
        value: stats?.riskAssessments ?? 0,
        barClass: "bg-warning",
      },
    ];
    const total = entries.reduce((sum, entry) => sum + entry.value, 0);
    return entries.map((entry) => ({
      ...entry,
      percentage: total > 0 ? Math.max(4, Math.round((entry.value / total) * 100)) : 0,
    }));
  }, [stats?.carePlanReviews, stats?.medicationAudits, stats?.riskAssessments]);

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

  const formatDiscrepancyType = useCallback((value: string) => {
    if (!value) {
      return "General";
    }
    return value
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase());
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
              <div className="h-8 w-8 rounded-md flex items-center justify-center bg-secondary/8">
                <Activity className="h-3.5 w-3.5 text-secondary" />
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
              <div className="h-8 w-8 rounded-md flex items-center justify-center bg-primary/8">
                <Pill className="h-3.5 w-3.5 text-primary" />
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
              <div className="h-8 w-8 rounded-md flex items-center justify-center bg-secondary/[0.07]">
                <FileText className="h-3.5 w-3.5 text-secondary" />
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
              <div className="h-8 w-8 rounded-md flex items-center justify-center bg-warning/8">
                <Shield className="h-3.5 w-3.5 text-warning" />
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
                  <Play className="h-5 w-5 text-primary" />
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
            Overview &middot; Last 24 hours
          </p>
          <h1 className="page-title leading-tight" data-testid="text-dashboard-title">Welcome back, {user?.firstName || user?.username || 'there'}</h1>
          <p className="page-subtitle max-w-lg">Here&rsquo;s your operations overview for the last 24 hours.</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {topStatusChips.map((chip) => (
                  <span
                    key={chip.label}
                    className={cn(
                      "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-[0.02em]",
                      chip.toneClass,
                    )}
                  >
                    {chip.label}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="flex flex-wrap justify-start sm:justify-end gap-2">
          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="min-w-[8.25rem]" data-testid="button-customize-dashboard">
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
            className="min-w-[7.75rem]"
            onClick={() => refetch()}
            disabled={isRefetching}
            data-testid="button-refresh-dashboard"
          >
            {isRefetching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Refresh
          </Button>
          {(availablePrimaryAnalysisActions.length > 0 || availableSecondaryAnalysisActions.length > 0) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="min-w-[9.5rem] justify-between" data-testid="button-new-analysis">
                <Brain className="h-4 w-4 mr-2" />
                New Analysis
                <ChevronDown className="h-4 w-4 ml-2 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Start New Analysis</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {availablePrimaryAnalysisActions.map((action) => (
                <DropdownMenuItem key={action.path} onClick={() => navigate(action.path)} className="cursor-pointer">
                  <action.icon className={`h-4 w-4 mr-2 ${action.iconClassName}`} />
                  <div className="flex flex-col">
                    <span>{action.label}</span>
                    <span className="text-xs text-muted-foreground">{action.description}</span>
                  </div>
                </DropdownMenuItem>
              ))}
              {availablePrimaryAnalysisActions.length > 0 && availableSecondaryAnalysisActions.length > 0 && <DropdownMenuSeparator />}
              {availableSecondaryAnalysisActions.map((action) => (
                <DropdownMenuItem key={action.path} onClick={() => navigate(action.path)} className="cursor-pointer">
                  <action.icon className={`h-4 w-4 mr-2 ${action.iconClassName}`} />
                  <div className="flex flex-col">
                    <span>{action.label}</span>
                    <span className="text-xs text-muted-foreground">{action.description}</span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 animate-slide-up stagger-2">
        {operationsSummary.map((item) => (
          <Card key={item.label} className="overflow-hidden border-border/60 bg-card/92">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/80">{item.label}</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{item.value}</p>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
                </div>
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl border", item.accentClass)}>
                  <item.icon className="h-4 w-4" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
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
      {availableQuickActions.length > 0 && (
      <div className="space-y-3.5 animate-slide-up stagger-3">
        <div className="flex items-center gap-2.5 px-0.5">
          <div className="h-7 w-7 rounded-lg flex items-center justify-center bg-warning/10 border border-warning/15 shadow-[var(--shadow-xs)]">
            <Zap className="h-3.5 w-3.5 text-warning" />
          </div>
          <div>
            <h2 className="text-[0.8125rem] font-semibold tracking-[-0.01em] text-foreground">Launch Center</h2>
            <p className="text-[10px] text-muted-foreground/75">Quick access to key workflows</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {availableQuickActions.map((action, index) => (
            <Link key={action.href} href={action.href}>
              <div className="h-full transition-transform duration-200 ease-out hover:-translate-y-1 active:scale-[0.98]">
              <Card className=" group h-full cursor-pointer" data-testid={`card-quick-action-${index}`}>
                <CardContent className={`relative overflow-hidden p-4 border ${action.panelTone} rounded-xl transition-all duration-200 group-hover:shadow-[var(--shadow-medium)]`}>
                  <div
                    className="pointer-events-none absolute inset-0 opacity-70"
                    aria-hidden="true"
                    style={{
                      background:
                        "radial-gradient(120% 80% at 16% -12%, color-mix(in oklab, var(--color-primary) 12%, transparent), transparent 68%)",
                    }}
                  />
                  <div className="relative z-10 mb-3 flex items-start justify-between gap-2">
                    <div className={`h-9 w-9 rounded-lg ${action.iconTone} flex items-center justify-center shadow-[var(--shadow-xs)]`}>
                    <action.icon className="h-4 w-4" />
                    </div>
                    <span className="inline-flex items-center rounded-full border border-border/55 bg-background/78 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      {action.badge}
                    </span>
                  </div>
                  
                  <h3 className="relative z-10 font-semibold text-[13px] mb-0.5 group-hover:text-primary transition-colors duration-150 text-foreground tracking-[-0.01em]">{action.label}</h3>
                  <p className="relative z-10 text-[11px] leading-relaxed text-muted-foreground/65">{action.description}</p>
                  
                  <div className="relative z-10 mt-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 text-[10px] font-semibold text-primary/60 opacity-100 transition-all duration-200 sm:opacity-0 sm:group-hover:translate-x-0.5 sm:group-hover:opacity-100">
                    <span>Open</span>
                    <ArrowRight className="h-3 w-3" />
                    </div>
                    <div className="flex h-6 w-6 items-center justify-center rounded-full border border-primary/22 bg-primary/8 text-primary/80 transition-transform duration-200 group-hover:translate-x-0.5">
                      <ArrowUpRight className="h-3 w-3" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              </div>
            </Link>
          ))}
        </div>
      </div>
      )}

      {isLoading && !stats ? (
        <>
          {/* Skeleton stat cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 animate-slide-up stagger-4">
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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7 animate-slide-up stagger-5">
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
                <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
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
         <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 animate-slide-up stagger-4">
          {smallWidgets.map(widgetId => renderSmallWidget(widgetId))}
        </div>
      )}

      {largeWidgets.length > 0 && (
         <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7 animate-slide-up stagger-5">
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
                 <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
                    <div className="space-y-1 pl-2.5 border-l-2 border-primary/25">
                       <p className="text-[9px] uppercase tracking-widest font-semibold text-muted-foreground/70">Medication Audits</p>
                       <p className="text-2xl font-semibold tracking-tight text-foreground tabular-nums" data-testid="text-medication-audits">
                         {isLoading ? <Skeleton className="h-7 w-10" /> : stats?.medicationAudits ?? 0}
                       </p>
                    </div>
                    <div className="space-y-1 pl-2.5 border-l-2 border-secondary/25">
                       <p className="text-[9px] uppercase tracking-widest font-semibold text-muted-foreground/70">Care Plan Reviews</p>
                       <p className="text-2xl font-semibold tracking-tight text-foreground tabular-nums" data-testid="text-care-plan-reviews">
                         {isLoading ? <Skeleton className="h-7 w-10" /> : stats?.carePlanReviews ?? 0}
                       </p>
                    </div>
                    <div className="space-y-1 pl-2.5 border-l-2 border-warning/25">
                       <p className="text-[9px] uppercase tracking-widest font-semibold text-muted-foreground/70">Risk Assessments</p>
                       <p className="text-2xl font-semibold tracking-tight text-foreground tabular-nums" data-testid="text-risk-assessments">
                         {isLoading ? <Skeleton className="h-7 w-10" /> : stats?.riskAssessments ?? 0}
                       </p>
                    </div>
                 </div>
                 <div className="mt-5 border-t border-border/35 pt-4">
                   <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/78">Workflow Distribution</p>
                   <div className="mt-2.5 space-y-2.5">
                     {auditDistribution.map((entry) => (
                       <div key={entry.id} className="space-y-1.5">
                         <div className="flex items-center justify-between gap-2 text-[11px]">
                           <span className="font-medium text-muted-foreground">{entry.label}</span>
                           <span className="font-semibold text-foreground tabular-nums">{entry.value}</span>
                         </div>
                         <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                           <div
                             className={cn("h-full rounded-full transition-all duration-300", entry.barClass)}
                             style={{ width: `${entry.percentage}%` }}
                           />
                         </div>
                       </div>
                     ))}
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
                        <div className="h-8 w-8 rounded-md bg-background flex items-center justify-center border border-border shrink-0">
                          <Activity className="h-4 w-4 text-destructive" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <p className="text-sm font-semibold truncate text-foreground">{alert.careWorkerName}</p>
                            <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">{formatTimeAgo(alert.createdAt)}</span>
                          </div>
                          <div className="mb-1">
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-border/60 bg-background/70">
                              {formatDiscrepancyType(alert.discrepancyType)}
                            </Badge>
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
                  <div className="h-6 w-6 rounded-md bg-primary/8 flex items-center justify-center text-primary">
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
                          "h-8 w-8 rounded-md flex items-center justify-center border border-border shrink-0",
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
            <p className="text-lg font-semibold text-foreground mb-1">Your Dashboard is Ready</p>
            <p className="text-sm text-muted-foreground mb-6 text-center max-w-xs">Select widgets to build your personalized compliance overview. Drag to reorder.</p>
            <Button variant="outline" onClick={() => setSettingsOpen(true)} className="font-medium">
              <Settings className="h-4 w-4 mr-2" />
              Configure Dashboard
            </Button>
          </CardContent>
        </Card>
      )}
      </>
      )}

      {/* Operational Summary & Data Export — admin only */}
      {user?.role === "admin" && (
      <Card className=" overflow-hidden animate-slide-up stagger-5" data-testid="card-operational-summary">
        <CardHeader className="pb-3 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg flex items-center justify-center bg-primary/10 border border-primary/12 shadow-[var(--shadow-xs)]">
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
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
          <div className="grid grid-cols-1 min-[400px]:grid-cols-2 md:grid-cols-4 gap-4">
            {(() => {
              const totalWork = (stats?.auditsCompleted ?? 0) + (stats?.carePlanReviews ?? 0) + (stats?.riskAssessments ?? 0) + (stats?.medicationAudits ?? 0);
              const summaryItems = [
                { label: "Total Operations", value: totalWork, icon: Activity, color: "text-primary", bg: "bg-primary/10", border: "border-primary/15" },
                { label: "Active Alerts", value: stats?.activeAlerts ?? 0, icon: AlertCircle, color: (stats?.activeAlerts ?? 0) > 0 ? "text-destructive" : "text-success", bg: (stats?.activeAlerts ?? 0) > 0 ? "bg-destructive/10" : "bg-success/10", border: (stats?.activeAlerts ?? 0) > 0 ? "border-destructive/15" : "border-success/15" },
                { label: "Plans Updated", value: stats?.plansUpdated ?? 0, icon: FileText, color: "text-secondary", bg: "bg-secondary/10", border: "border-secondary/15" },
                { label: "Risk Checks", value: stats?.riskAssessments ?? 0, icon: Shield, color: "text-warning", bg: "bg-warning/10", border: "border-warning/15" },
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
                  <p className="text-[10px] font-semibold text-muted-foreground/80 mt-0.5 tracking-wide">{item.label}</p>
                </div>
              ));
            })()}
          </div>
          <div className="mt-5 pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-border/30">
            <p className="text-[10px] text-muted-foreground/70">
              Last refreshed {data ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'} &middot; Auto-refresh every 2 min &middot; System {isError ? 'degraded' : 'healthy'}
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
      )}
    </div>
  );
}
