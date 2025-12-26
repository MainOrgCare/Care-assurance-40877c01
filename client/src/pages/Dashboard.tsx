import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AlertCircle, CheckCircle2, FileText, Activity, RefreshCw, Loader2, Settings, GripVertical, Pill, ClipboardList, Shield, Users } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
  icon: any;
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

export default function Dashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeWidgets, setActiveWidgets] = useState<string[]>(DEFAULT_WIDGETS);
  const [widgetOrder, setWidgetOrder] = useState<string[]>(ALL_WIDGETS.map(w => w.id));

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

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
          <Card key={widgetId} className="glass-card transition-all duration-300 hover:bg-card/80" data-testid="widget-compliance-score">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Compliance Score</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-compliance-score">
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
          <Card key={widgetId} className="glass-card transition-all duration-300 hover:bg-card/80" data-testid="widget-audits-completed">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Audits Completed</CardTitle>
              <FileText className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-audits-completed">
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : stats?.auditsCompleted ?? 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Last 24 hours</p>
            </CardContent>
          </Card>
        );
      case "active_alerts":
        return (
          <Card key={widgetId} className="glass-card transition-all duration-300 hover:bg-card/80" data-testid="widget-active-alerts">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
              <AlertCircle className={`h-4 w-4 ${stats?.activeAlerts ? "text-destructive" : "text-muted-foreground"}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-active-alerts">
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
    </div>
  );
}
