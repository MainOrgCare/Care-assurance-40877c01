import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock4,
  Download,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  Route,
  Search,
  SlidersHorizontal,
  Users,
  Library,
  Clock,
  Calendar,
} from "lucide-react";

// ===== ROSTERING CONSTANTS =====
const DURATION_SHORTFALL_THRESHOLD_PERCENT = 80;
const DURATION_OVERRUN_THRESHOLD_PERCENT = 120;
const DEFAULT_ROUTE_DURATION_MINUTES = 30;
const TYPICAL_DAY_MIN_OCCURRENCES = 2;
const TIME_CRITICAL_WINDOW_MINUTES = 15;
const SHIFT_BAR_DURATION_MINUTES = 8 * 60;
const ROSTER_DAY_START_MINUTES = 6 * 60;
const ROSTER_DAY_SOFT_END_MINUTES = 22 * 60;
const ROSTER_DAY_HARD_END_MINUTES = 23 * 60;

const TEMPLATE_WEEK_OPTIONS = [
  { key: "week1", label: "Week 1 (starts 05/01/26)" },
  { key: "week2", label: "Week 2 (starts 12/01/26)" },
] as const;
const WEEKDAY_OPTIONS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

type TemplateWeekKey = (typeof TEMPLATE_WEEK_OPTIONS)[number]["key"];
type WeekdayLabel = (typeof WEEKDAY_OPTIONS)[number];
const DEFAULT_TEMPLATE_WEEK: TemplateWeekKey = "week1";
const DEFAULT_TEMPLATE_DAY: WeekdayLabel = WEEKDAY_OPTIONS[0];
const TEMPLATE_WEEK_1_START_DAY_NUMBER = Math.floor(Date.UTC(2026, 0, 5) / 86400000);

// ===== TYPES =====
interface RowAnalysis {
  rowNumber: number;
  status: "clean" | "attention";
  data: Record<string, any>;
  emptyFields: string[];
  numericWarnings: string[];
  textWarnings: string[];
  issues: string[];
  scheduleDeltaMinutes: number | null;
  durationMatchPercent: number | null;
  scheduleFlag: boolean;
  durationFlag: boolean;
  durationOverrunFlag: boolean;
  workersMatch: boolean | null;
  plannedWorker?: string | null;
  actualWorker?: string | null;
  templateWorker?: string | null;
  payrollRunDescription?: string | null;
  serviceTypeDescription?: string | null;
  isAdminStaffRow?: boolean;
  isShiftBar?: boolean;
  serviceDutyClassType?: string | null;
  isExcludedServiceDutyClass?: boolean;
  isAdhocCall?: boolean;
  isTimeCritical?: boolean;
  plannedTimeLabel?: string | null;
  actualTimeLabel?: string | null;
  plannedDurationMinutes?: number | null;
  actualDurationMinutes?: number | null;
  plannedTimeMinutes?: number | null;
  actualTimeMinutes?: number | null;
  serviceRequirementTimeMinutes?: number | null;
  serviceRequirementTimeLabel?: string | null;
  plannedDateLabel?: string | null;
  plannedDateKey?: string | null;
  serviceUserName?: string | null;
  serviceUserArea?: string | null;
  serviceUserAddress?: string | null;
  normalizedServiceUserKey?: string | null;
  isDuplicateSlotRow?: boolean;
  excludeFromMetrics?: boolean;
  callTypeLabel?: string | null;
}

interface WorkerCallGroup {
  key: string;
  serviceUserName: string | null;
  serviceUserArea: string | null;
  serviceUserAddress: string | null;
  normalizedServiceUserKey: string | null;
  callTypeLabel: string;
  callTypeKey: string;
  timeBandLabel: string;
  requirementStartMinutes: number | null;
  requirementStartLabel: string | null;
  durationMinutes: number | null;
  totalCalls: number;
  uniqueDays: number;
  templatedWeekdayKeys: Set<string>;
  doubleUpWeekdayKeys: Set<string>;
  templatedRows: number;
  isTimeCritical: boolean;
  rows: RowAnalysis[];
}

interface ShiftBar {
  key: string;
  templateKey: string | null;
  templateWeek: TemplateWeekKey | null;
  templateDay: WeekdayLabel | null;
  startMinutes: number | null;
  endMinutes: number | null;
  durationMinutes: number;
  startLabel: string | null;
  endLabel: string | null;
  plannedDateLabel: string | null;
}

interface CareWorkerRoster {
  key: string;
  workerName: string;
  workerNameNormalized: string;
  rows: RowAnalysis[];
  callRows: RowAnalysis[];
  shiftBars: ShiftBar[];
  shiftBarsCount: number;
  isAdminStaff: boolean;
  usesTemplateAssignments: boolean;
  uniqueServiceUsers: number;
  uniqueDays: number;
  callGroups: WorkerCallGroup[];
  missingRequirementTimes: number;
}

interface WorkbookSummary {
  id: string;
  name: string;
  fileName: string;
  totalRows: number;
  careWorkerCount: number;
  serviceUserCount: number;
  callGroupCount: number;
  createdBy: string | null;
  createdByUsername: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WorkbookFull {
  id: string;
  name: string;
  fileName: string;
  sourceHash: string;
  totalRows: number;
  careWorkerCount: number;
  serviceUserCount: number;
  callGroupCount: number;
  rowAnalysis: RowAnalysis[];
  callGroups: any[];
  careWorkerRosters: CareWorkerRoster[];
  doubleUpSlots: Record<string, string[]>;
  createdBy: string | null;
  createdByUsername: string | null;
  createdAt: string;
  updatedAt: string;
}

// ===== HELPER FUNCTIONS =====
const formatMinutesDisplay = (minutes: number | null | undefined): string => {
  if (minutes === null || minutes === undefined) return "—";
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.abs(minutes) % 60;
  const sign = minutes < 0 ? "-" : "";
  if (h > 0) return `${sign}${h}h ${m}m`;
  return `${sign}${m} mins`;
};

const formatMinutesToTime = (minutes: number): string => {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const parseMinutesFromTimeLabel = (label: string | null | undefined): number | null => {
  if (!label) return null;
  const match = label.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
};

const getDateRelativeToTemplateStart = (
  templateWeek: TemplateWeekKey,
  templateDay: WeekdayLabel,
  startDayNumber = TEMPLATE_WEEK_1_START_DAY_NUMBER
): { dateKey: string; dateLabel: string } => {
  const weekOffset = templateWeek === "week2" ? 7 : 0;
  const dayOffset = WEEKDAY_OPTIONS.indexOf(templateDay);
  const totalOffset = weekOffset + dayOffset;
  const targetDayNumber = startDayNumber + totalOffset;
  const targetDate = new Date(targetDayNumber * 86400000);
  const dd = String(targetDate.getUTCDate()).padStart(2, "0");
  const mm = String(targetDate.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = targetDate.getUTCFullYear();
  return {
    dateKey: `${yyyy}-${mm}-${dd}`,
    dateLabel: `${dd}/${mm}/${yyyy}`,
  };
};

const computeTemplateSelectionKey = (week: TemplateWeekKey, day: WeekdayLabel) => {
  const { dateKey } = getDateRelativeToTemplateStart(week, day);
  return dateKey;
};

export default function RosteringStudio() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  // Local state
  const [selectedWorkbookId, setSelectedWorkbookId] = useState<string | null>(null);
  const [rosteringFullscreen, setRosteringFullscreen] = useState(false);
  const [selectedCareWorkerKey, setSelectedCareWorkerKey] = useState<string>("");
  const [selectedWorkerCallKeys, setSelectedWorkerCallKeys] = useState<string[]>([]);
  const [careWorkerSearch, setCareWorkerSearch] = useState("");
  const [rosterCallSearch, setRosterCallSearch] = useState("");
  
  // Template selection
  const [selectedTemplateWeek, setSelectedTemplateWeek] = useState<TemplateWeekKey>(DEFAULT_TEMPLATE_WEEK);
  const [selectedTemplateDay, setSelectedTemplateDay] = useState<WeekdayLabel>(DEFAULT_TEMPLATE_DAY);
  
  // Roster controls
  const [packCallsBackToBack, setPackCallsBackToBack] = useState(true);
  const [useObservedAverages, setUseObservedAverages] = useState(false);
  const [enforceTimeCriticalWindow, setEnforceTimeCriticalWindow] = useState(true);

  // Fetch available workbooks
  const { data: workbooks = [], isLoading: workbooksLoading, refetch: refetchWorkbooks } = useQuery<WorkbookSummary[]>({
    queryKey: ["/api/admin/testing-features/workbooks"],
    queryFn: async () => {
      const res = await fetch("/api/admin/testing-features/workbooks", { credentials: "include" });
      if (!res.ok) {
        throw new Error("Failed to fetch workbooks");
      }
      return res.json();
    },
    enabled: !!user && user.role === "admin",
  });

  // Fetch selected workbook full data
  const { data: workbook, isLoading: workbookLoading, refetch: refetchWorkbook } = useQuery<WorkbookFull>({
    queryKey: ["/api/admin/testing-features/workbooks", selectedWorkbookId],
    queryFn: async () => {
      if (!selectedWorkbookId) throw new Error("No workbook selected");
      const res = await fetch(`/api/admin/testing-features/workbooks/${selectedWorkbookId}`, { credentials: "include" });
      if (!res.ok) {
        throw new Error("Failed to fetch workbook");
      }
      return res.json();
    },
    enabled: !!selectedWorkbookId && !!user && user.role === "admin",
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/testing-features/workbooks/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete workbook");
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Workbook deleted",
        description: "The workbook has been removed from the library.",
      });
      setSelectedWorkbookId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/testing-features/workbooks"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Derived data
  const careWorkerRosters = useMemo<CareWorkerRoster[]>(() => {
    if (!workbook?.careWorkerRosters) return [];
    // Reconstruct Sets from arrays (JSON doesn't preserve Sets)
    return workbook.careWorkerRosters.map((roster) => ({
      ...roster,
      callGroups: roster.callGroups?.map((group: any) => ({
        ...group,
        templatedWeekdayKeys: new Set(group.templatedWeekdayKeys || []),
        doubleUpWeekdayKeys: new Set(group.doubleUpWeekdayKeys || []),
      })) || [],
    }));
  }, [workbook]);

  const doubleUpSlots = useMemo<Map<string, Set<string>>>(() => {
    if (!workbook?.doubleUpSlots) return new Map();
    const map = new Map<string, Set<string>>();
    for (const [key, workers] of Object.entries(workbook.doubleUpSlots)) {
      map.set(key, new Set(workers));
    }
    return map;
  }, [workbook]);

  const templateSelectionKey = useMemo(
    () => computeTemplateSelectionKey(selectedTemplateWeek, selectedTemplateDay),
    [selectedTemplateWeek, selectedTemplateDay]
  );

  const selectedTemplateWeekLabel = useMemo(() => {
    return TEMPLATE_WEEK_OPTIONS.find((o) => o.key === selectedTemplateWeek)?.label || "Unknown";
  }, [selectedTemplateWeek]);

  // Filter care workers by search
  const visibleCareWorkerRosters = useMemo(() => {
    const term = careWorkerSearch.toLowerCase().trim();
    if (!term) return careWorkerRosters;
    return careWorkerRosters.filter((r) => r.workerName.toLowerCase().includes(term));
  }, [careWorkerRosters, careWorkerSearch]);

  // Selected care worker
  const selectedCareWorker = useMemo(() => {
    return careWorkerRosters.find((r) => r.key === selectedCareWorkerKey) || null;
  }, [careWorkerRosters, selectedCareWorkerKey]);

  // Auto-select first worker when workbook changes
  useEffect(() => {
    if (careWorkerRosters.length > 0 && !selectedCareWorkerKey) {
      setSelectedCareWorkerKey(careWorkerRosters[0].key);
    }
  }, [careWorkerRosters, selectedCareWorkerKey]);

  // Call groups for selected worker
  const selectedWorkerCallGroups = useMemo<WorkerCallGroup[]>(() => {
    return selectedCareWorker?.callGroups || [];
  }, [selectedCareWorker]);

  // Available template groups (those that have rows on the selected template day)
  const availableTemplateGroups = useMemo(() => {
    return selectedWorkerCallGroups.filter((g) => g.templatedWeekdayKeys.has(templateSelectionKey));
  }, [selectedWorkerCallGroups, templateSelectionKey]);

  // Filter call groups by search
  const filteredCallGroups = useMemo(() => {
    const term = rosterCallSearch.toLowerCase().trim();
    if (!term) return selectedWorkerCallGroups;
    return selectedWorkerCallGroups.filter(
      (g) =>
        (g.serviceUserName?.toLowerCase().includes(term) ?? false) ||
        g.callTypeLabel.toLowerCase().includes(term) ||
        (g.serviceUserArea?.toLowerCase().includes(term) ?? false)
    );
  }, [selectedWorkerCallGroups, rosterCallSearch]);

  // ===== HANDLERS =====
  const handleResetStudio = useCallback(() => {
    setSelectedWorkerCallKeys([]);
    setRosterCallSearch("");
    setPackCallsBackToBack(true);
    setUseObservedAverages(false);
    setEnforceTimeCriticalWindow(true);
    toast({
      title: "Studio reset",
      description: "Selections and filters have been cleared.",
    });
  }, [toast]);

  const handleDeleteWorkbook = useCallback(() => {
    if (!selectedWorkbookId) return;
    if (!confirm("Are you sure you want to delete this workbook?")) return;
    deleteMutation.mutate(selectedWorkbookId);
  }, [selectedWorkbookId, deleteMutation]);

  // Access check
  if (user?.role !== "admin") {
    return (
      <div className="min-h-screen py-24 px-4 lg:px-10 max-w-7xl mx-auto">
        <Card className="p-8 text-center">
          <CardHeader>
            <CardTitle>Access Restricted</CardTitle>
            <CardDescription>Administrator access is required for Rostering Studio.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/dashboard">Return to Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4 lg:px-10 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/testing-features">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Testing Features
            </Link>
          </Button>
        </div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-3 rounded-full border border-primary/20 bg-primary/10 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary mb-3">
              <Route className="h-3 w-3" />
              Rostering Studio
              <Badge variant="secondary" className="ml-2 text-[10px] uppercase tracking-wide">
                Beta
              </Badge>
            </div>
            <h1 className="text-3xl font-heading font-bold text-foreground">
              Rostering <span className="bg-gradient-to-r from-primary to-sky-500 bg-clip-text text-transparent">Studio</span>
            </h1>
            <p className="text-muted-foreground mt-2 max-w-2xl">
              Load saved workbook analysis data and build optimized care worker schedules with time-critical safeguards and double-up call synchronization.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => refetchWorkbooks()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/care-worker-rotas">
                <Library className="h-4 w-4 mr-2" />
                Rota Library
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
        {/* Workbook selector sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Saved Workbooks
              </CardTitle>
              <CardDescription>
                Select a workbook from your library to begin rostering.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {workbooksLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : workbooks.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>No saved workbooks</AlertTitle>
                  <AlertDescription>
                    Upload and save a workbook in Testing Features to use the Rostering Studio.
                  </AlertDescription>
                </Alert>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2">
                    {workbooks.map((wb) => {
                      const isSelected = wb.id === selectedWorkbookId;
                      return (
                        <button
                          key={wb.id}
                          type="button"
                          onClick={() => setSelectedWorkbookId(wb.id)}
                          className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                            isSelected
                              ? "border-primary/50 bg-primary/10"
                              : "border-border/60 bg-background/60 hover:bg-muted/40"
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-sm font-semibold text-foreground">{wb.name}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {wb.fileName}
                              </p>
                            </div>
                            {isSelected && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            <Badge variant="outline" className="text-[10px]">
                              {wb.totalRows.toLocaleString()} rows
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              {wb.careWorkerCount} workers
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              {wb.serviceUserCount} SUs
                            </Badge>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-2">
                            Saved {new Date(wb.createdAt).toLocaleDateString()}
                            {wb.createdByUsername && ` by ${wb.createdByUsername}`}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          {selectedWorkbookId && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Workbook Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full"
                  onClick={handleDeleteWorkbook}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  Delete Workbook
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Main content */}
        <div className="space-y-6">
          {!selectedWorkbookId ? (
            <Card className="p-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold">Select a Workbook</h3>
              <p className="text-muted-foreground mt-2">
                Choose a saved workbook from the sidebar to start building optimized schedules.
              </p>
              <Button variant="outline" className="mt-4" asChild>
                <Link href="/testing-features">Go to Testing Features</Link>
              </Button>
            </Card>
          ) : workbookLoading ? (
            <Card className="p-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Loading workbook data...</p>
            </Card>
          ) : !workbook ? (
            <Card className="p-12 text-center">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h3 className="text-lg font-semibold">Workbook Not Found</h3>
              <p className="text-muted-foreground mt-2">
                The selected workbook could not be loaded.
              </p>
            </Card>
          ) : careWorkerRosters.length === 0 ? (
            <Card className="p-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold">No Care Worker Data</h3>
              <p className="text-muted-foreground mt-2">
                This workbook does not contain any care worker roster data.
              </p>
            </Card>
          ) : (
            <>
              {/* Workbook summary */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs uppercase text-muted-foreground">Total Rows</p>
                    <p className="text-2xl font-bold">{workbook.totalRows.toLocaleString()}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs uppercase text-muted-foreground">Care Workers</p>
                    <p className="text-2xl font-bold">{workbook.careWorkerCount}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs uppercase text-muted-foreground">Service Users</p>
                    <p className="text-2xl font-bold">{workbook.serviceUserCount}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs uppercase text-muted-foreground">Call Groups</p>
                    <p className="text-2xl font-bold">{workbook.callGroupCount}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Studio content - similar layout to TestingFeatures but with loaded data */}
              <Card>
                <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Route className="h-5 w-5 text-primary" />
                      Build Schedule
                    </CardTitle>
                    <CardDescription>
                      Select a care worker and configure their daily route from available call groups.
                    </CardDescription>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="outline" className="text-[10px] font-semibold">
                        {careWorkerRosters.length} workers
                      </Badge>
                      <Badge variant="outline" className="text-[10px] font-semibold">
                        {doubleUpSlots.size} double-up slots
                      </Badge>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="text-xs font-semibold">
                      <CalendarDays className="mr-1 h-3.5 w-3.5" />
                      {selectedTemplateWeekLabel} • {selectedTemplateDay}
                    </Badge>
                    <Button size="sm" variant="ghost" onClick={handleResetStudio}>
                      Reset
                    </Button>
                    <Button
                      size="sm"
                      variant={rosteringFullscreen ? "secondary" : "outline"}
                      onClick={() => setRosteringFullscreen(!rosteringFullscreen)}
                    >
                      {rosteringFullscreen ? (
                        <>
                          <Minimize2 className="h-4 w-4 mr-2" />
                          Exit fullscreen
                        </>
                      ) : (
                        <>
                          <Maximize2 className="h-4 w-4 mr-2" />
                          Fullscreen
                        </>
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 xl:grid-cols-[260px,1fr]">
                    {/* Care worker list */}
                    <div className="space-y-3">
                      <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          value={careWorkerSearch}
                          onChange={(e) => setCareWorkerSearch(e.target.value)}
                          placeholder="Search care worker"
                          className="pl-9"
                        />
                      </div>
                      <ScrollArea className="h-[360px] rounded-md border">
                        <div className="space-y-2 p-2">
                          {visibleCareWorkerRosters.map((roster) => {
                            const isSelected = roster.key === selectedCareWorkerKey;
                            return (
                              <button
                                key={roster.key}
                                type="button"
                                onClick={() => {
                                  setSelectedCareWorkerKey(roster.key);
                                  setSelectedWorkerCallKeys([]);
                                }}
                                className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition ${
                                  isSelected
                                    ? "border-primary/50 bg-primary/10"
                                    : "border-border/60 bg-background/60 hover:bg-muted/40"
                                }`}
                              >
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-semibold text-foreground">{roster.workerName}</p>
                                    {roster.isAdminStaff && (
                                      <Badge variant="outline" className="text-[10px]">
                                        Office
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {roster.uniqueServiceUsers} SUs • {roster.callRows.length} calls
                                    {roster.shiftBarsCount > 0 && ` • ${roster.shiftBarsCount} shifts`}
                                  </p>
                                </div>
                                {isSelected && <CheckCircle2 className="h-4 w-4 text-primary" />}
                              </button>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    </div>

                    {/* Call groups and controls */}
                    <div className="space-y-4">
                      {!selectedCareWorker ? (
                        <Alert>
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>Select a care worker</AlertTitle>
                          <AlertDescription>
                            Choose a care worker from the list to view their call library and build a route.
                          </AlertDescription>
                        </Alert>
                      ) : (
                        <>
                          {/* Worker header */}
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold">{selectedCareWorker.workerName}</p>
                                {selectedCareWorker.isAdminStaff && (
                                  <Badge variant="outline" className="text-xs">Office staff</Badge>
                                )}
                                {selectedCareWorker.shiftBarsCount > 0 && (
                                  <Badge variant="secondary" className="text-xs">
                                    {selectedCareWorker.shiftBarsCount} shift bars
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {selectedCareWorker.uniqueServiceUsers} service users •{" "}
                                {selectedCareWorker.callGroups.length} call types •{" "}
                                {selectedCareWorker.callRows.length} calls •{" "}
                                {selectedCareWorker.uniqueDays} days
                              </p>
                            </div>
                          </div>

                          {/* Template and controls */}
                          <div className="grid gap-4 lg:grid-cols-2">
                            <div className="rounded-2xl border bg-muted/30 p-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  Template schedule
                                </p>
                                <Badge variant="secondary" className="text-[10px]">
                                  {selectedTemplateWeekLabel} • {selectedTemplateDay}
                                </Badge>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {TEMPLATE_WEEK_OPTIONS.map((option) => (
                                  <Button
                                    key={option.key}
                                    type="button"
                                    size="sm"
                                    variant={selectedTemplateWeek === option.key ? "secondary" : "outline"}
                                    onClick={() => setSelectedTemplateWeek(option.key)}
                                  >
                                    {option.label}
                                  </Button>
                                ))}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {WEEKDAY_OPTIONS.map((day) => (
                                  <Button
                                    key={day}
                                    type="button"
                                    size="sm"
                                    variant={selectedTemplateDay === day ? "secondary" : "outline"}
                                    onClick={() => setSelectedTemplateDay(day)}
                                  >
                                    {day}
                                  </Button>
                                ))}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {availableTemplateGroups.length} templated calls available for this day.
                              </p>
                            </div>

                            <div className="rounded-2xl border bg-background/60 p-4 space-y-3">
                              <div className="flex items-center gap-2">
                                <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                                <p className="text-sm font-semibold">Roster controls</p>
                              </div>
                              <div className="space-y-2 text-xs">
                                <div className="flex items-center justify-between">
                                  <label className="font-medium">Pack calls back-to-back</label>
                                  <Switch
                                    checked={packCallsBackToBack}
                                    onCheckedChange={setPackCallsBackToBack}
                                  />
                                </div>
                                <div className="flex items-center justify-between">
                                  <label className="font-medium">Use observed averages</label>
                                  <Switch
                                    checked={useObservedAverages}
                                    onCheckedChange={setUseObservedAverages}
                                  />
                                </div>
                                <div className="flex items-center justify-between">
                                  <label className="font-medium">Enforce time-critical window</label>
                                  <Switch
                                    checked={enforceTimeCriticalWindow}
                                    onCheckedChange={setEnforceTimeCriticalWindow}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Call library */}
                          <div className="rounded-2xl border bg-card/50 p-4 space-y-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-sm font-semibold">Call library</p>
                                <p className="text-xs text-muted-foreground">
                                  {selectedWorkerCallKeys.length} selected •{" "}
                                  {availableTemplateGroups.length} templated calls for {selectedTemplateDay}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => {
                                    const typicalKeys = availableTemplateGroups
                                      .filter((g) => g.uniqueDays >= TYPICAL_DAY_MIN_OCCURRENCES)
                                      .map((g) => g.key);
                                    setSelectedWorkerCallKeys(typicalKeys);
                                  }}
                                >
                                  Select typical day
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedWorkerCallKeys(availableTemplateGroups.map((g) => g.key));
                                  }}
                                >
                                  Select all
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setSelectedWorkerCallKeys([])}
                                >
                                  Clear
                                </Button>
                              </div>
                            </div>

                            <div className="relative w-full sm:w-72">
                              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                              <Input
                                value={rosterCallSearch}
                                onChange={(e) => setRosterCallSearch(e.target.value)}
                                placeholder="Search calls"
                                className="pl-9"
                              />
                            </div>

                            {filteredCallGroups.length === 0 ? (
                              <Alert>
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>No call groups found</AlertTitle>
                                <AlertDescription>
                                  {rosterCallSearch
                                    ? "No call groups match your search."
                                    : "This worker has no call groups available."}
                                </AlertDescription>
                              </Alert>
                            ) : (
                              <div className="space-y-2">
                                {filteredCallGroups.map((group) => {
                                  const isTemplated = group.templatedWeekdayKeys.has(templateSelectionKey);
                                  const isSelected = selectedWorkerCallKeys.includes(group.key);
                                  const hasRequirementTime = typeof group.requirementStartMinutes === "number";
                                  const isDoubleUp = doubleUpSlots.has(group.key);

                                  return (
                                    <div
                                      key={group.key}
                                      onClick={() => {
                                        if (!hasRequirementTime) return;
                                        setSelectedWorkerCallKeys((prev) =>
                                          prev.includes(group.key)
                                            ? prev.filter((k) => k !== group.key)
                                            : [...prev, group.key]
                                        );
                                      }}
                                      className={`flex flex-col gap-2 rounded-xl border px-4 py-3 cursor-pointer transition ${
                                        hasRequirementTime
                                          ? isSelected
                                            ? "border-primary/50 bg-primary/10 hover:bg-primary/15"
                                            : "border-border/60 bg-background/60 hover:bg-muted/20"
                                          : "border-border/40 bg-muted/30 opacity-75 cursor-not-allowed"
                                      }`}
                                    >
                                      <div>
                                        <p className="text-sm font-semibold">
                                          {group.serviceUserName || "Unknown service user"}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          {group.callTypeLabel} • {group.timeBandLabel} •{" "}
                                          {group.requirementStartLabel || "No requirement time"}
                                        </p>
                                      </div>
                                      <div className="flex flex-wrap gap-1.5">
                                        <Badge variant="outline" className="text-[10px]">
                                          {group.totalCalls} calls
                                        </Badge>
                                        {!isTemplated && (
                                          <Badge variant="secondary" className="text-[10px]">
                                            Not templated
                                          </Badge>
                                        )}
                                        {!hasRequirementTime && (
                                          <Badge variant="outline" className="text-[10px]">
                                            Missing time
                                          </Badge>
                                        )}
                                        {group.isTimeCritical && (
                                          <Badge variant="outline" className="text-[10px]">
                                            Time critical
                                          </Badge>
                                        )}
                                        {isDoubleUp && (
                                          <Badge variant="outline" className="text-[10px]">
                                            Double-up (linked)
                                          </Badge>
                                        )}
                                        {group.durationMinutes !== null && (
                                          <Badge variant="secondary" className="text-[10px]">
                                            {formatMinutesDisplay(group.durationMinutes)}
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
