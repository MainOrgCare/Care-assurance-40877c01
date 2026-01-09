import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { AlertCircle, CheckCircle2, FileText, Activity, RefreshCw, Loader2, Settings, GripVertical, Pill, ClipboardList, Shield, Users, Palette, Moon, Sun, Waves, Sparkles, ArrowRight, Upload, Brain, TrendingUp, Clock, Zap, Play, Info, type LucideIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTemporaryData } from "@/context/TemporaryDataContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useSettings, Theme } from "@/context/SettingsContext";
import { Link } from "wouter";

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

function SortableWidgetItem({ widget, isActive, onToggle }: { widget: WidgetConfig; isActive: boolean; onToggle: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center justify-between p-3 rounded-lg bg-muted">
      <div className="flex items-center gap-3">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted/80 rounded">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
        <widget.icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{widget.label}</span>
      </div>
      <Switch
        checked={isActive}
        onCheckedChange={onToggle}
        data-testid={`switch-widget-${widget.id}`}
      />
    </div>
  );
}

const THEMES: { id: Theme; label: string; icon: LucideIcon; description: string; colors: string }[] = [
  { id: "auto", label: "Auto", icon: Zap, description: "System & schedule", colors: "from-blue-500 to-purple-500" },
  { id: "dark", label: "Dark", icon: Moon, description: "Classic dark mode", colors: "from-slate-800 to-slate-900" },
  { id: "midnight", label: "Midnight", icon: Sparkles, description: "Deep purple theme", colors: "from-indigo-900 to-purple-900" },
  { id: "ocean", label: "Ocean", icon: Waves, description: "Teal sea theme", colors: "from-teal-900 to-cyan-900" },
  { id: "light", label: "Light", icon: Sun, description: "Clean light mode", colors: "from-gray-100 to-white" },
];

const QUICK_ACTIONS: { icon: LucideIcon; label: string; description: string; href: string; color: string }[] = [
  { icon: Upload, label: "EMAR Audit", description: "Upload and analyze medication records", href: "/care-workers/emar-audit", color: "from-blue-500 to-cyan-500" },
  { icon: FileText, label: "Care Plan", description: "Generate AI-powered care plans", href: "/service-users/upload", color: "from-violet-500 to-purple-500" },
  { icon: Shield, label: "Risk Assessment", description: "Create comprehensive risk assessments", href: "/service-users/risk-assessment", color: "from-amber-500 to-orange-500" },
  { icon: Brain, label: "Plan Enhancer", description: "Enhance existing care plans with AI", href: "/care-plan-enhancer", color: "from-emerald-500 to-teal-500" },
];

export default function Dashboard() {
  const { user } = useAuth();
  const { loadDemoData } = useTemporaryData();
  const queryClient = useQueryClient();
  const { theme, setTheme, actualTheme, isThemeTransitioning, themeSchedule, setThemeSchedule } = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeWidgets, setActiveWidgets] = useState<string[]>(DEFAULT_WIDGETS);
  const [widgetOrder, setWidgetOrder] = useState<string[]>(ALL_WIDGETS.map(w => w.id));

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
  const recentAlerts = data?.recentAlerts || [];

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  const isWidgetActive = (id: string) => activeWidgets.includes(id);
  
  const sortedActiveWidgets = widgetOrder.filter(id => activeWidgets.includes(id));
  const smallWidgets = sortedActiveWidgets.filter(id => !["compliance_data", "recent_alerts"].includes(id));
  const largeWidgets = sortedActiveWidgets.filter(id => ["compliance_data", "recent_alerts"].includes(id));

  const renderSmallWidget = (widgetId: string) => {
    switch (widgetId) {
      case "compliance_score":
        return (
          <Card key={widgetId} className="liquid-card matrix-bg transition-all duration-300 hover:bg-card/80 quantum-button group energy-border" data-testid="widget-compliance-score">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium group-hover:text-primary transition-colors cyber-text neon-text">Compliance Score</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors hologram-effect energy-border" />
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-2xl font-bold gradient-text neon-text" data-testid="text-compliance-score">
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : stats?.auditsCompleted ? "100%" : "-"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats?.auditsCompleted ? "Based on completed audits" : "No data yet"}
              </p>
            </CardContent>
          </Card>
        );
      case "audits_completed":
        return (
          <Card key={widgetId} className="glass-card transition-all duration-300 hover:bg-card/80 glow-on-hover group" data-testid="widget-audits-completed">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium group-hover:text-primary transition-colors">Audits Completed</CardTitle>
              <FileText className="h-4 w-4 text-primary group-hover:scale-110 transition-transform" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold gradient-text" data-testid="text-audits-completed">
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : stats?.auditsCompleted ?? 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Last 24 hours</p>
            </CardContent>
          </Card>
        );
      case "active_alerts":
        return (
          <Card key={widgetId} className="glass-card transition-all duration-300 hover:bg-card/80 glow-on-hover group" data-testid="widget-active-alerts">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium group-hover:text-primary transition-colors">Active Alerts</CardTitle>
              <AlertCircle className={`h-4 w-4 group-hover:scale-110 transition-transform ${stats?.activeAlerts ? "text-destructive animate-pulse" : "text-muted-foreground"}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold gradient-text" data-testid="text-active-alerts">
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : stats?.activeAlerts ?? 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats?.activeAlerts ? "Requires attention" : "No alerts"}
              </p>
            </CardContent>
          </Card>
        );
      case "plans_updated":
        return (
          <Card key={widgetId} className="glass-card transition-all duration-300 hover:bg-card/80" data-testid="widget-plans-updated">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Plans Updated</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-plans-updated">
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : stats?.plansUpdated ?? 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Last 24h</p>
            </CardContent>
          </Card>
        );
      case "medication_audits":
        return (
          <Card key={widgetId} className="glass-card transition-all duration-300 hover:bg-card/80" data-testid="widget-medication-audits">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Medication Audits</CardTitle>
              <Pill className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-medication-audits-widget">
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : stats?.medicationAudits ?? 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Last 24h</p>
            </CardContent>
          </Card>
        );
      case "care_plan_reviews":
        return (
          <Card key={widgetId} className="glass-card transition-all duration-300 hover:bg-card/80" data-testid="widget-care-plan-reviews">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Care Plan Reviews</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-care-plan-reviews-widget">
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : stats?.carePlanReviews ?? 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Last 24h</p>
            </CardContent>
          </Card>
        );
      case "risk_assessments":
        return (
          <Card key={widgetId} className="glass-card transition-all duration-300 hover:bg-card/80" data-testid="widget-risk-assessments">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Risk Assessments</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-risk-assessments-widget">
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : stats?.riskAssessments ?? 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Last 24h</p>
            </CardContent>
          </Card>
        );
      case "staff_checks":
        return (
          <Card key={widgetId} className="glass-card transition-all duration-300 hover:bg-card/80" data-testid="widget-staff-checks">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Staff Checks</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-staff-checks-widget">0</div>
              <p className="text-xs text-muted-foreground mt-1">Last 24h</p>
            </CardContent>
          </Card>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {user?.isDemo && (
        <Card className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 border-purple-500/30" data-testid="demo-mode-banner">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                  <Play className="h-5 w-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground">Demo Mode Active</h3>
                    <Badge variant="outline" className="border-purple-500/50 text-purple-300">Sample Data</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Explore CareAssurance with pre-loaded sample data. Changes won't be saved.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-purple-300">
                <Info className="h-4 w-4" />
                Read-only mode
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground mb-1">
            Hello, <span className="font-semibold text-foreground">{user?.firstName || user?.username || 'there'}</span>
          </p>
          <h2 className="text-3xl font-heading font-bold text-foreground" data-testid="text-dashboard-title">Dashboard</h2>
          <p className="text-muted-foreground mt-1">Last 24 hours overview of facility compliance and active care plans.</p>
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
          <Button data-testid="button-new-analysis">New Analysis</Button>
        </div>
      </div>

      {/* Theme Selector */}
      <Card className="glass-card glow-on-hover" data-testid="card-theme-selector">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Choose Your Theme</CardTitle>
            {isThemeTransitioning && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Switching...</span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {THEMES.map((t) => {
              const isSelected = theme === t.id;
              const isAutoSelected = t.id === "auto" && theme === "auto";

              return (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  disabled={isThemeTransitioning}
                  className={`relative p-4 rounded-lg border-2 transition-all duration-300 text-left group disabled:opacity-50 disabled:cursor-not-allowed ${
                    isSelected
                      ? "border-primary bg-primary/10 scale-105 shadow-lg"
                      : "border-border hover:border-primary/50 hover:bg-muted/50 hover:scale-102"
                  }`}
                  data-testid={`button-theme-${t.id}`}
                >
                  <div className={`h-8 w-full rounded-md bg-gradient-to-r ${t.colors} mb-3 group-hover:shadow-lg transition-shadow`} />
                  <div className="flex items-center gap-2 mb-1">
                    <t.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    <span className="font-medium text-sm group-hover:text-primary transition-colors">{t.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{t.description}</p>

                  {isAutoSelected && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                      <span>Currently: {actualTheme}</span>
                      {themeSchedule.enabled && <span>• Scheduled</span>}
                    </div>
                  )}

                  {isSelected && (
                    <div className="absolute top-2 right-2">
                      <CheckCircle2 className="h-4 w-4 text-primary animate-pulse" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-400" />
          <h3 className="text-lg font-semibold">Quick Actions</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {QUICK_ACTIONS.map((action, index) => (
            <Link key={index} href={action.href}>
              <Card className="liquid-card matrix-bg hover:bg-card/80 transition-all duration-300 cursor-pointer group h-full quantum-button energy-border" data-testid={`card-quick-action-${index}`}>
                <CardContent className="p-4 relative z-10">
                  <div className={`h-10 w-10 rounded-lg bg-gradient-to-r ${action.color} flex items-center justify-center mb-3 group-hover:scale-110 transition-all duration-300 shadow-lg hologram-effect energy-border`}>
                    <action.icon className="h-5 w-5 text-white" />
                  </div>
                  <h4 className="font-medium mb-1 group-hover:text-primary transition-colors cyber-text neon-text">{action.label}</h4>
                  <p className="text-xs text-muted-foreground">{action.description}</p>
                  <div className="flex items-center gap-1 mt-2 text-xs text-primary opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-0 group-hover:translate-x-1">
                    <span>Get started</span>
                    <ArrowRight className="h-3 w-3" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {smallWidgets.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {smallWidgets.map(widgetId => renderSmallWidget(widgetId))}
        </div>
      )}

      {largeWidgets.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          {largeWidgets.includes("compliance_data") && (
            <Card className={`${largeWidgets.includes("recent_alerts") ? "col-span-4" : "col-span-7"} glass-card`} data-testid="widget-compliance-data">
              <CardHeader>
                <CardTitle>Compliance Data</CardTitle>
                <CardDescription>Last 24 hours audit figures.</CardDescription>
              </CardHeader>
              <CardContent>
                 <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-1">
                       <p className="text-sm font-medium text-muted-foreground">Medication Audits</p>
                       <p className="text-3xl font-bold text-foreground" data-testid="text-medication-audits">
                         {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : stats?.medicationAudits ?? 0}
                       </p>
                    </div>
                    <div className="space-y-1">
                       <p className="text-sm font-medium text-muted-foreground">Care Plan Reviews</p>
                       <p className="text-3xl font-bold text-foreground" data-testid="text-care-plan-reviews">
                         {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : stats?.carePlanReviews ?? 0}
                       </p>
                    </div>
                    <div className="space-y-1">
                       <p className="text-sm font-medium text-muted-foreground">Risk Assessments</p>
                       <p className="text-3xl font-bold text-foreground" data-testid="text-risk-assessments">
                         {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : stats?.riskAssessments ?? 0}
                       </p>
                    </div>
                    <div className="space-y-1">
                       <p className="text-sm font-medium text-muted-foreground">Staff Checks</p>
                       <p className="text-3xl font-bold text-foreground" data-testid="text-staff-checks">0</p>
                    </div>
                 </div>
              </CardContent>
            </Card>
          )}

          {largeWidgets.includes("recent_alerts") && (
            <Card className={`${largeWidgets.includes("compliance_data") ? "col-span-3" : "col-span-7"} glass-card`} data-testid="widget-recent-alerts">
              <CardHeader>
                <CardTitle>Recent Alerts</CardTitle>
                <CardDescription>Last 24 hours incident reports.</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : recentAlerts.length > 0 ? (
                  <div className="space-y-3">
                    {recentAlerts.map((alert) => (
                      <div key={alert.id} className="flex items-start gap-3 p-2 rounded-lg bg-muted">
                        <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{alert.careWorkerName}</p>
                          <p className="text-xs text-muted-foreground truncate">{alert.message}</p>
                          <p className="text-xs text-muted-foreground mt-1">{formatTimeAgo(alert.createdAt)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-32 text-muted-foreground">
                    <p className="text-sm">No alerts in the last 24 hours</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeWidgets.length === 0 && (
        <Card className="glass-card">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Settings className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">No widgets selected</p>
            <p className="text-sm text-muted-foreground mb-4">Click "Customize" to add widgets to your dashboard</p>
            <Button variant="outline" onClick={() => setSettingsOpen(true)}>
              <Settings className="h-4 w-4 mr-2" />
              Customize Dashboard
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Platform Benefits */}
      <Card className="glass-morphism border-primary/20 magnetic-hover neural-network" data-testid="card-platform-benefits">
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary hologram-effect" />
            <CardTitle className="cyber-text">Platform Features</CardTitle>
          </div>
          <CardDescription>Tools designed to support your care facility workflows</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-2 group">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors hologram-effect">
                  <Clock className="h-4 w-4 text-blue-400" />
                </div>
                <span className="text-2xl font-bold text-foreground gradient-text">Minutes</span>
              </div>
              <p className="text-sm font-medium group-hover:text-primary transition-colors cyber-text">Faster Reviews</p>
              <p className="text-xs text-muted-foreground">AI-assisted analysis helps speed up record reviews</p>
            </div>
            <div className="space-y-2 group">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-emerald-500/20 flex items-center justify-center group-hover:bg-emerald-500/30 transition-colors hologram-effect">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                </div>
                <span className="text-2xl font-bold text-foreground gradient-text">Multi-Pass</span>
              </div>
              <p className="text-sm font-medium group-hover:text-primary transition-colors cyber-text">AI Analysis</p>
              <p className="text-xs text-muted-foreground">Multiple review passes help surface potential issues</p>
            </div>
            <div className="space-y-2 group">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-violet-500/20 flex items-center justify-center group-hover:bg-violet-500/30 transition-colors hologram-effect">
                  <Shield className="h-4 w-4 text-violet-400" />
                </div>
                <span className="text-2xl font-bold text-foreground gradient-text">24/7</span>
              </div>
              <p className="text-sm font-medium group-hover:text-primary transition-colors cyber-text">Access Anytime</p>
              <p className="text-xs text-muted-foreground">Available when you need it for compliance tracking</p>
            </div>
            <div className="space-y-2 group">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-amber-500/20 flex items-center justify-center group-hover:bg-amber-500/30 transition-colors hologram-effect">
                  <Brain className="h-4 w-4 text-amber-400" />
                </div>
                <span className="text-2xl font-bold text-foreground gradient-text">11</span>
              </div>
              <p className="text-sm font-medium group-hover:text-primary transition-colors cyber-text">Care Plan Sections</p>
              <p className="text-xs text-muted-foreground">AI-generated draft care plans for your review</p>
            </div>
          </div>
          <div className="mt-6 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Estimate potential time savings for your facility
            </p>
            <Link href="/roi-calculator">
              <Button variant="outline" className="gap-2 magnetic-hover" data-testid="button-roi-calculator">
                <TrendingUp className="h-4 w-4" />
                Savings Estimator
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
