import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Link } from "wouter";
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
  CardFooter,
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
  Keyboard,
  Zap,
  Undo2,
  Redo2,
  Settings2,
  AlertTriangle,
  Save,
  FolderOpen,
  Trash2,
  History,
  ClipboardList,
} from "lucide-react";
import { GanttTimeline } from "@/components/rostering/GanttTimeline";
import { MultiWorkerDashboard } from "@/components/rostering/MultiWorkerDashboard";
import { RouteMapView } from "@/components/rostering/RouteMapView";
import { OptimizationScore } from "@/components/rostering/OptimizationScore";
import { ConflictSummary } from "@/components/rostering/ConflictAlert";
import { CallTypeChip } from "@/components/rostering/CallTypeChip";
import { TravelTimeIndicator } from "@/components/rostering/TravelTimeIndicator";
import { CallTimeEditor, type RecommendedCallTime } from "@/components/rostering/CallTimeEditor";
import { WorkloadHeatmap } from "@/components/rostering/WorkloadHeatmap";
import { WorkerConstraintsEditor, type WorkerConstraint as WorkerConstraintUI } from "@/components/rostering/WorkerConstraintsEditor";
import { buildAllWorkerLanes, buildWorkerLane, buildWorkerSummaries, type TimelineEntry } from "@/lib/rostering/rosterModel";
import { calculateTravelSegments, calculateOptimizationMetrics, type TravelCategory } from "@/lib/rostering/travelUtils";
import { useRosteringKeyboardShortcuts, buildRosteringShortcuts, formatShortcutKey } from "@/hooks/useRosteringKeyboardShortcuts";
import {
  rosterHistoryReducer,
  createInitialHistoryState,
  applyOverridesToLanes,
  canUndo,
  canRedo,
  type RosterAction,
} from "@/lib/rostering/rosterReducer";
import {
  OptimizationSettings,
  type OptimizationWeights,
  type OptimizationConstraints,
  defaultWeights,
  defaultConstraints,
} from "@/components/rostering/OptimizationSettings";
import AdminDatabasePanel from "@/components/rostering/AdminDatabasePanel";
import { runFullOptimization } from "@/lib/rostering/optimizer";

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
  rows?: RowAnalysis[];
  callRows?: RowAnalysis[];
  rowCount?: number;
  callRowsCount?: number;
  shiftBars: ShiftBar[];
  shiftBarsCount: number;
  isAdminStaff: boolean;
  usesTemplateAssignments: boolean;
  uniqueServiceUsers: number;
  uniqueDays: number;
  callGroups: WorkerCallGroup[];
  missingRequirementTimes: number;
}

interface CareWorkerRotaSummary {
  id: string;
  workerName: string;
  workerKey: string;
  templateWeek: "week1" | "week2";
  templateDay: string;
  createdAt: string;
  updatedAt: string;
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

export default function RosteringStudio({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Local state
  const [selectedWorkbookId, setSelectedWorkbookId] = useState<string | null>(null);
  const [rosteringFullscreen, setRosteringFullscreen] = useState(false);
  const [selectedCareWorkerKey, setSelectedCareWorkerKey] = useState<string>("");
  const [selectedWorkerCallKeys, setSelectedWorkerCallKeys] = useState<string[]>([]);
  const [careWorkerSearch, setCareWorkerSearch] = useState("");
  const [rosterCallSearch, setRosterCallSearch] = useState("");
  
  // Roster state with undo/redo via reducer
  const [rosterState, dispatchRoster] = useReducer(rosterHistoryReducer, undefined, createInitialHistoryState);
  
  const [showAllWorkers, setShowAllWorkers] = useState(false);
  const [snapMinutes, setSnapMinutes] = useState(10);
  const [showHalfHourTicks, setShowHalfHourTicks] = useState(true);
  const [selectedTimelineEntryId, setSelectedTimelineEntryId] = useState<string | null>(null);
  const [reassignWorkerKey, setReassignWorkerKey] = useState<string>("");
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveScheduleName, setSaveScheduleName] = useState("");
  const [saveScheduleDescription, setSaveScheduleDescription] = useState("");
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  
  // Template selection
  const [selectedTemplateWeek, setSelectedTemplateWeek] = useState<TemplateWeekKey>(DEFAULT_TEMPLATE_WEEK);
  const [selectedTemplateDay, setSelectedTemplateDay] = useState<WeekdayLabel>(DEFAULT_TEMPLATE_DAY);
  
  // Optimization settings
  const [optimizationWeights, setOptimizationWeights] = useState<OptimizationWeights>(defaultWeights);
  const [optimizationConstraints, setOptimizationConstraints] = useState<OptimizationConstraints>(defaultConstraints);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [selectedRotaId, setSelectedRotaId] = useState<string | null>(null);
  
  // Roster controls
  const [packCallsBackToBack, setPackCallsBackToBack] = useState(true);
  const [useObservedAverages, setUseObservedAverages] = useState(false);
  const [enforceTimeCriticalWindow, setEnforceTimeCriticalWindow] = useState(true);

  // Fetch available workbooks
  const { data: workbooks = [], isLoading: workbooksLoading, refetch: refetchWorkbooks } = useQuery<WorkbookSummary[]>({
    queryKey: ["/api/admin/rostering/workbook-uploads"],
    queryFn: async () => {
      const res = await fetch("/api/admin/rostering/workbook-uploads", { credentials: "include" });
      if (!res.ok) {
        throw new Error("Failed to fetch workbooks");
      }
      return res.json();
    },
    enabled: !!user && user.role === "admin",
  });

  // Auto-select the latest workbook when workbooks are loaded
  useEffect(() => {
    if (workbooks.length > 0 && !selectedWorkbookId) {
      // Select the most recently created workbook (last in array, or sort by date if available)
      const latestWorkbook = workbooks[workbooks.length - 1];
      setSelectedWorkbookId(latestWorkbook.id);
    }
  }, [workbooks, selectedWorkbookId]);

  // Fetch care worker rota library summaries
  const { data: rotas = [], isLoading: rotasLoading } = useQuery<CareWorkerRotaSummary[]>({
    queryKey: ["/api/admin/care-worker-rotas"],
    queryFn: async () => {
      const res = await fetch("/api/admin/care-worker-rotas", { credentials: "include" });
      if (!res.ok) {
        throw new Error("Failed to fetch rota library");
      }
      return res.json();
    },
    enabled: !!user && user.role === "admin",
  });

  useEffect(() => {
    if (rotas.length > 0 && !selectedRotaId) {
      setSelectedRotaId(rotas[0].id);
    }
  }, [rotas, selectedRotaId]);

  // Fetch selected workbook full data
  const { data: workbook, isLoading: workbookLoading, refetch: refetchWorkbook } = useQuery<WorkbookFull>({
    queryKey: ["/api/admin/rostering/workbook-uploads", selectedWorkbookId],
    queryFn: async () => {
      if (!selectedWorkbookId) throw new Error("No workbook selected");
      const res = await fetch(`/api/admin/rostering/workbook-uploads/${selectedWorkbookId}`, { credentials: "include" });
      if (!res.ok) {
        throw new Error("Failed to fetch workbook");
      }
      return res.json();
    },
    enabled: !!selectedWorkbookId && !!user && user.role === "admin",
  });

  // Fetch rostering recommended call times
  const { data: recommendedCallTimes = [] } = useQuery<{
    serviceUserKey: string;
    callTypeLabel: string;
    recommendedStartMinutes: number;
    toleranceMinutes: number;
    priority: number;
  }[]>({
    queryKey: ["/api/admin/rostering/workbooks", selectedWorkbookId, "call-times"],
    queryFn: async () => {
      if (!selectedWorkbookId) return [];
      const res = await fetch(`/api/admin/rostering/workbooks/${selectedWorkbookId}/call-times`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedWorkbookId && !!user && user.role === "admin",
  });

  // Fetch worker templates (who visits whom)
  const { data: workerTemplates = [] } = useQuery<{
    workerKey: string;
    serviceUserKey: string;
    callTypeLabels: string[];
    isPrimary: boolean;
    priority: number;
  }[]>({
    queryKey: ["/api/admin/rostering/workbooks", selectedWorkbookId, "worker-templates"],
    queryFn: async () => {
      if (!selectedWorkbookId) return [];
      const res = await fetch(`/api/admin/rostering/workbooks/${selectedWorkbookId}/worker-templates`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedWorkbookId && !!user && user.role === "admin",
  });

  // Fetch worker constraints (max calls per day)
  const { data: workerConstraints = [] } = useQuery<{
    workerKey: string;
    workerName: string;
    maxCallsPerDay?: number;
    maxMinutesPerDay?: number;
  }[]>({
    queryKey: ["/api/admin/rostering/workbooks", selectedWorkbookId, "worker-constraints"],
    queryFn: async () => {
      if (!selectedWorkbookId) return [];
      const res = await fetch(`/api/admin/rostering/workbooks/${selectedWorkbookId}/worker-constraints`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedWorkbookId && !!user && user.role === "admin",
  });

  // Fetch saved roster states
  const { data: savedStates = [] } = useQuery<{
    id: string;
    name: string;
    description?: string;
    templateWeek: string;
    templateDay: string;
    timeOverrides: Record<string, number>;
    laneOverrides: Record<string, string>;
    metrics?: Record<string, number>;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    createdByUsername?: string;
  }[]>({
    queryKey: ["/api/admin/rostering/workbooks", selectedWorkbookId, "saved-states"],
    queryFn: async () => {
      if (!selectedWorkbookId) return [];
      const res = await fetch(`/api/admin/rostering/workbooks/${selectedWorkbookId}/saved-states`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedWorkbookId && !!user && user.role === "admin",
  });

  // Call time mutations
  const saveCallTimeMutation = useMutation({
    mutationFn: async (callTime: { serviceUserKey: string; serviceUserName: string; callTypeLabel: string; recommendedStartMinutes: number; toleranceMinutes: number; priority: number; notes?: string }) => {
      const res = await fetch(`/api/admin/rostering/workbooks/${selectedWorkbookId}/call-times`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(callTime),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to save call time");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Call time saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rostering/workbooks", selectedWorkbookId, "call-times"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save call time", description: error.message, variant: "destructive" });
    },
  });

  const deleteCallTimeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/rostering/call-times/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Call time deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rostering/workbooks", selectedWorkbookId, "call-times"] });
    },
  });

  // Constraint mutations
  const saveConstraintMutation = useMutation({
    mutationFn: async (constraint: { workerKey: string; workerName: string; maxCallsPerDay?: number; maxMinutesPerDay?: number; notes?: string }) => {
      const res = await fetch(`/api/admin/rostering/workbooks/${selectedWorkbookId}/worker-constraints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(constraint),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to save constraint");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Worker constraint saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rostering/workbooks", selectedWorkbookId, "worker-constraints"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save constraint", description: error.message, variant: "destructive" });
    },
  });

  const deleteConstraintMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/rostering/worker-constraints/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Constraint deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rostering/workbooks", selectedWorkbookId, "worker-constraints"] });
    },
  });

  // Save roster state mutations
  const saveRosterStateMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const res = await fetch(`/api/admin/rostering/workbooks/${selectedWorkbookId}/saved-states`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          description: data.description,
          templateWeek: selectedTemplateWeek,
          templateDay: selectedTemplateDay,
          timeOverrides: rosterState.present.timeOverrides,
          laneOverrides: rosterState.present.laneOverrides,
          isActive: false,
        }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to save roster state");
      return res.json();
    },
    onSuccess: (data: { name: string }) => {
      toast({ title: "Schedule saved", description: `Saved as "${data.name}"` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rostering/workbooks", selectedWorkbookId, "saved-states"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save schedule", description: error.message, variant: "destructive" });
    },
  });

  const loadRosterStateMutation = useMutation({
    mutationFn: async (stateId: string) => {
      const res = await fetch(`/api/admin/rostering/saved-states/${stateId}/activate`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load roster state");
      return res.json();
    },
    onSuccess: (data: { name: string; timeOverrides?: Record<string, number>; laneOverrides?: Record<string, string> }) => {
      // Apply the loaded overrides to the reducer state
      dispatchRoster({
        type: "APPLY_OPTIMIZATION",
        timeOverrides: (data.timeOverrides || {}) as Record<string, number>,
        laneOverrides: (data.laneOverrides || {}) as Record<string, string>,
      });
      toast({ title: "Schedule loaded", description: `Loaded "${data.name}"` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rostering/workbooks", selectedWorkbookId, "saved-states"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to load schedule", description: error.message, variant: "destructive" });
    },
  });

  const deleteRosterStateMutation = useMutation({
    mutationFn: async (stateId: string) => {
      const res = await fetch(`/api/admin/rostering/saved-states/${stateId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Schedule deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rostering/workbooks", selectedWorkbookId, "saved-states"] });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/rostering/workbook-uploads/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete workbook");
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Upload deleted",
        description: "The upload has been removed from the library.",
      });
      setSelectedWorkbookId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rostering/workbook-uploads"] });
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
    return workbook.careWorkerRosters.map((roster: CareWorkerRoster) => ({
      ...roster,
      callGroups: roster.callGroups?.map((group: WorkerCallGroup & { templatedWeekdayKeys?: string[] | Set<string>; doubleUpWeekdayKeys?: string[] | Set<string> }) => ({
        ...group,
        templatedWeekdayKeys: new Set<string>(Array.isArray(group.templatedWeekdayKeys) ? group.templatedWeekdayKeys : []),
        doubleUpWeekdayKeys: new Set<string>(Array.isArray(group.doubleUpWeekdayKeys) ? group.doubleUpWeekdayKeys : []),
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

  const workerSummaries = useMemo(() => buildWorkerSummaries(careWorkerRosters), [careWorkerRosters]);

  // Extract unique service users and call types from workbook data for editors
  const uniqueServiceUsers = useMemo(() => {
    const serviceUserMap = new Map<string, { key: string; name: string }>();
    careWorkerRosters.forEach((roster) => {
      roster.callGroups?.forEach((group: any) => {
        if (group.serviceUserKey && group.serviceUserName) {
          serviceUserMap.set(group.serviceUserKey, {
            key: group.serviceUserKey,
            name: group.serviceUserName,
          });
        }
      });
    });
    return Array.from(serviceUserMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [careWorkerRosters]);

  const uniqueCallTypes = useMemo(() => {
    const callTypeSet = new Set<string>();
    careWorkerRosters.forEach((roster) => {
      roster.callGroups?.forEach((group: any) => {
        if (group.callTypeLabel) {
          callTypeSet.add(group.callTypeLabel);
        }
      });
    });
    return Array.from(callTypeSet).sort();
  }, [careWorkerRosters]);

  // Transform recommendedCallTimes data for CallTimeEditor
  const callTimesForEditor = useMemo<RecommendedCallTime[]>(() => {
    if (!recommendedCallTimes) return [];
    return recommendedCallTimes.map((ct: any) => ({
      id: ct.id,
      serviceUserKey: ct.serviceUserKey,
      serviceUserName: ct.serviceUserName,
      callTypeLabel: ct.callTypeLabel,
      recommendedStartMinutes: ct.recommendedStartMinutes,
      toleranceMinutes: ct.toleranceMinutes,
      priority: ct.priority,
      notes: ct.notes,
    }));
  }, [recommendedCallTimes]);

  // Transform workerConstraints data for WorkerConstraintsEditor
  const constraintsForEditor = useMemo<WorkerConstraintUI[]>(() => {
    if (!workerConstraints) return [];
    return workerConstraints.map((wc: any) => ({
      id: wc.id,
      workerKey: wc.workerKey,
      workerName: wc.workerName,
      maxCallsPerDay: wc.maxCallsPerDay,
      maxMinutesPerDay: wc.maxMinutesPerDay,
      notes: wc.notes,
    }));
  }, [workerConstraints]);

  // Transform workerSummaries for WorkloadHeatmap
  const heatmapSummaries = useMemo(() => {
    return careWorkerRosters.map((roster) => ({
      workerKey: roster.key,
      workerName: roster.workerName,
      totalMinutes: roster.callGroups?.reduce((sum: number, g: any) => sum + (g.durationMinutes || 0), 0) || 0,
      callCount: roster.callGroups?.length || 0,
      uniqueServiceUsers: new Set(roster.callGroups?.map((g: any) => g.serviceUserKey) || []).size,
    }));
  }, [careWorkerRosters]);

  // Compute constraint violations for visual indicators
  const constraintViolations = useMemo(() => {
    const violations = new Map<string, { overCalls: boolean; overMinutes: boolean }>();
    if (!workerConstraints || workerConstraints.length === 0) return violations;

    careWorkerRosters.forEach((roster) => {
      const constraint = workerConstraints.find((c: any) => c.workerKey === roster.key);
      if (!constraint) return;

      const callCount = roster.callGroups?.length || 0;
      const totalMinutes = roster.callGroups?.reduce((sum: number, g: any) => sum + (g.durationMinutes || 0), 0) || 0;

      const overCalls = constraint.maxCallsPerDay && callCount > constraint.maxCallsPerDay;
      const overMinutes = constraint.maxMinutesPerDay && totalMinutes > constraint.maxMinutesPerDay;

      if (overCalls || overMinutes) {
        violations.set(roster.key, { overCalls: !!overCalls, overMinutes: !!overMinutes });
      }
    });

    return violations;
  }, [careWorkerRosters, workerConstraints]);

  // Compute aggregate utilization stats
  const utilizationStats = useMemo(() => {
    const workersWithCalls = heatmapSummaries.filter((w) => w.callCount > 0);
    const totalWorkers = workersWithCalls.length;
    
    if (totalWorkers === 0) {
      return {
        avgCalls: 0,
        avgHours: 0,
        workersOverLimit: 0,
        workersUnderUtilized: 0,
        totalCalls: 0,
        totalHours: 0,
      };
    }

    const totalCalls = workersWithCalls.reduce((sum, w) => sum + w.callCount, 0);
    const totalMinutes = workersWithCalls.reduce((sum, w) => sum + w.totalMinutes, 0);
    const avgCalls = Math.round(totalCalls / totalWorkers);
    const avgHours = parseFloat((totalMinutes / totalWorkers / 60).toFixed(1));
    
    // Workers over limit (from constraint violations)
    const workersOverLimit = constraintViolations.size;
    
    // Workers under-utilized (< 50% of average)
    const workersUnderUtilized = workersWithCalls.filter((w) => w.callCount < avgCalls * 0.5).length;

    return {
      avgCalls,
      avgHours,
      workersOverLimit,
      workersUnderUtilized,
      totalCalls,
      totalHours: parseFloat((totalMinutes / 60).toFixed(1)),
    };
  }, [heatmapSummaries, constraintViolations]);

  const selectedWorkerLane = useMemo(() => buildWorkerLane(selectedCareWorker, templateSelectionKey), [selectedCareWorker, templateSelectionKey]);
  const allWorkerLanes = useMemo(() => buildAllWorkerLanes(visibleCareWorkerRosters, templateSelectionKey), [visibleCareWorkerRosters, templateSelectionKey]);

  // Apply overrides from reducer state to lanes
  const timelineLanes = useMemo(() => {
    const baseLanes = showAllWorkers ? allWorkerLanes : selectedWorkerLane ? [selectedWorkerLane] : [];
    return applyOverridesToLanes(baseLanes, rosterState.present);
  }, [allWorkerLanes, rosterState.present, selectedWorkerLane, showAllWorkers]);

  const mapEntries = useMemo(
    () => timelineLanes.flatMap((lane) => lane.entries),
    [timelineLanes]
  );

  const selectedTimelineEntry = useMemo<TimelineEntry | null>(() => {
    if (!selectedTimelineEntryId) return null;
    return mapEntries.find((entry) => entry.id === selectedTimelineEntryId) ?? null;
  }, [mapEntries, selectedTimelineEntryId]);

  const selectedEntryLaneKey = useMemo(() => {
    if (!selectedTimelineEntryId) return null;
    return (
      rosterState.present.laneOverrides[selectedTimelineEntryId] ||
      timelineLanes.find((lane) => lane.entries.some((entry) => entry.id === selectedTimelineEntryId))?.id ||
      null
    );
  }, [rosterState.present.laneOverrides, selectedTimelineEntryId, timelineLanes]);

  const timelineConflictCount = useMemo(() => {
    let conflicts = 0;
    timelineLanes.forEach((lane) => {
      const sorted = [...lane.entries]
        .filter((entry) => Number.isFinite(entry.startMinutes))
        .sort((a, b) => a.startMinutes - b.startMinutes);
      for (let i = 1; i < sorted.length; i += 1) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        const prevEnd = prev.startMinutes + prev.durationMinutes;
        if (curr.startMinutes < prevEnd) {
          conflicts += 1;
        }
      }
    });
    return conflicts;
  }, [timelineLanes]);

  const applyOverrides = useCallback((updates: Record<string, number>, laneUpdates?: Record<string, string>) => {
    dispatchRoster({
      type: "APPLY_OPTIMIZATION",
      timeOverrides: updates,
      laneOverrides: laneUpdates,
    });
  }, []);

  const buildPackedOverrides = useCallback(
    (entries: TimelineEntry[], bufferMinutes: number) => {
      const sorted = [...entries].sort((a, b) => a.startMinutes - b.startMinutes);
      const updates: Record<string, number> = {};
      let cursor = ROSTER_DAY_START_MINUTES;
      sorted.forEach((entry) => {
        const baseStart = entry.startMinutes;
        const isTimeCritical = Boolean(entry.isTimeCritical);
        let nextStart = isTimeCritical ? baseStart : Math.max(cursor, baseStart);
        if (nextStart < ROSTER_DAY_START_MINUTES) nextStart = ROSTER_DAY_START_MINUTES;
        if (nextStart > ROSTER_DAY_HARD_END_MINUTES - entry.durationMinutes) {
          nextStart = Math.max(ROSTER_DAY_START_MINUTES, ROSTER_DAY_HARD_END_MINUTES - entry.durationMinutes);
        }
        updates[entry.id] = nextStart;
        cursor = nextStart + entry.durationMinutes + bufferMinutes;
      });
      return updates;
    },
    []
  );

  const buildLaneDurationMap = useCallback((lanes: Array<{ id: string; entries: TimelineEntry[] }>) => {
    return lanes.reduce<Record<string, number>>((acc, lane) => {
      const total = lane.entries.reduce((sum, entry) => sum + entry.durationMinutes, 0);
      acc[lane.id] = total;
      return acc;
    }, {});
  }, []);

  const handleReassignEntry = useCallback(
    (entryId: string, targetLaneId: string) => {
      dispatchRoster({ type: "REASSIGN_ENTRY", entryId, targetLaneId });
      toast({
        title: "Entry reassigned",
        description: "The visit was moved to the selected worker lane.",
      });
    },
    [toast]
  );

  const handleUndo = useCallback(() => {
    if (canUndo(rosterState)) {
      dispatchRoster({ type: "UNDO" });
      toast({ title: "Undone", description: "Last action reverted." });
    }
  }, [rosterState, toast]);

  const handleRedo = useCallback(() => {
    if (canRedo(rosterState)) {
      dispatchRoster({ type: "REDO" });
      toast({ title: "Redone", description: "Action restored." });
    }
  }, [rosterState, toast]);

  const handleEntryMove = useCallback(
    (entryId: string, newStartMinutes: number, newLaneId?: string) => {
      if (newLaneId) {
        dispatchRoster({
          type: "MOVE_AND_REASSIGN_ENTRY",
          entryId,
          startMinutes: newStartMinutes,
          targetLaneId: newLaneId,
        });
      } else {
        dispatchRoster({
          type: "MOVE_ENTRY",
          entryId,
          startMinutes: newStartMinutes,
        });
      }
    },
    []
  );

  // Build ordered list of all entry IDs for range selection (sorted by time within each lane)
  const allEntryIdsOrdered = useMemo(() => {
    const ids: string[] = [];
    timelineLanes.forEach((lane) => {
      const sorted = [...lane.entries].sort((a, b) => a.startMinutes - b.startMinutes);
      sorted.forEach((entry) => ids.push(entry.id));
    });
    return ids;
  }, [timelineLanes]);

  // Handle entry selection with Shift+Click (range) and Ctrl+Click (toggle)
  const handleSelectEntry = useCallback(
    (entry: TimelineEntry, event?: React.MouseEvent) => {
      if (event?.shiftKey && rosterState.present.focusedEntryId) {
        // Shift+Click: select range
        dispatchRoster({
          type: "SELECT_RANGE",
          fromEntryId: rosterState.present.focusedEntryId,
          toEntryId: entry.id,
          orderedEntryIds: allEntryIdsOrdered,
        });
      } else if (event?.ctrlKey || event?.metaKey) {
        // Ctrl/Cmd+Click: toggle selection
        dispatchRoster({ type: "TOGGLE_ENTRY_SELECTION", entryId: entry.id });
      } else {
        // Normal click: single select
        setSelectedTimelineEntryId(entry.id);
        dispatchRoster({ type: "SELECT_ENTRY", entryId: entry.id });
      }
    },
    [allEntryIdsOrdered, rosterState.present.focusedEntryId]
  );

  // Handle bulk delete of selected entries
  const handleBulkDelete = useCallback(() => {
    const selectedIds = Array.from(rosterState.present.selectedEntryIds);
    if (selectedIds.length === 0) return;
    
    dispatchRoster({ type: "BULK_DELETE_ENTRIES", entryIds: selectedIds });
    toast({
      title: "Entries removed",
      description: `${selectedIds.length} visit(s) removed from schedule.`,
    });
  }, [rosterState.present.selectedEntryIds, toast]);

  // Handle bulk reassign of selected entries to a worker
  const handleBulkReassign = useCallback(
    (targetLaneId: string) => {
      const selectedIds = Array.from(rosterState.present.selectedEntryIds);
      if (selectedIds.length === 0) return;

      dispatchRoster({
        type: "BULK_REASSIGN_ENTRIES",
        reassignments: selectedIds.map((entryId) => ({ entryId, targetLaneId })),
      });
      dispatchRoster({ type: "CLEAR_SELECTION" });
      toast({
        title: "Entries reassigned",
        description: `${selectedIds.length} visit(s) moved to new worker.`,
      });
    },
    [rosterState.present.selectedEntryIds, toast]
  );

  const handleClearSelection = useCallback(() => {
    dispatchRoster({ type: "CLEAR_SELECTION" });
    setSelectedTimelineEntryId(null);
  }, []);

  const handleRunOptimization = useCallback(() => {
    setIsOptimizing(true);
    
    // Run optimization in a timeout to allow UI to update
    setTimeout(() => {
      try {
        const result = runFullOptimization(
          timelineLanes,
          optimizationWeights,
          optimizationConstraints,
          undefined, // geocodedPoints
          {
            recommendedCallTimes,
            workerTemplates,
            workerConstraints,
          }
        );
        
        applyOverrides(result.timeOverrides, result.laneOverrides);
        
        const recommendedMsg = result.metrics.recommendedTimeScore < 100
          ? ` Call time accuracy: ${result.metrics.recommendedTimeScore}%`
          : "";
        
        toast({
          title: "Optimization complete",
          description: `Reduced travel gaps by ~${result.metrics.totalTravelReduction}m. Continuity: ${result.metrics.continuityScore}%${recommendedMsg}`,
        });
      } catch (error) {
        toast({
          title: "Optimization failed",
          description: error instanceof Error ? error.message : "An error occurred",
          variant: "destructive",
        });
      } finally {
        setIsOptimizing(false);
      }
    }, 100);
  }, [timelineLanes, optimizationWeights, optimizationConstraints, recommendedCallTimes, workerTemplates, workerConstraints, applyOverrides, toast]);

  const handleAutoBalance = useCallback(() => {
    const updates: Record<string, number> = {};
    const laneOverrides: Record<string, string> = {};
    const lanesCopy = timelineLanes.map((lane) => ({
      id: lane.id,
      entries: [...lane.entries],
    }));

    const durationMap = buildLaneDurationMap(lanesCopy);
    const maxIterations = 20;
    for (let i = 0; i < maxIterations; i += 1) {
      const entriesByLoad = [...lanesCopy].sort(
        (a, b) => (durationMap[b.id] ?? 0) - (durationMap[a.id] ?? 0)
      );
      const mostLoaded = entriesByLoad[0];
      const leastLoaded = entriesByLoad[entriesByLoad.length - 1];
      if (!mostLoaded || !leastLoaded) break;
      const gap = (durationMap[mostLoaded.id] ?? 0) - (durationMap[leastLoaded.id] ?? 0);
      if (gap < 30) break;

      const entryToMove = [...mostLoaded.entries].sort((a, b) => b.durationMinutes - a.durationMinutes)[0];
      if (!entryToMove) break;

      mostLoaded.entries = mostLoaded.entries.filter((entry) => entry.id !== entryToMove.id);
      leastLoaded.entries = [...leastLoaded.entries, entryToMove];
      durationMap[mostLoaded.id] = (durationMap[mostLoaded.id] ?? 0) - entryToMove.durationMinutes;
      durationMap[leastLoaded.id] = (durationMap[leastLoaded.id] ?? 0) + entryToMove.durationMinutes;
      laneOverrides[entryToMove.id] = leastLoaded.id;
    }

    lanesCopy.forEach((lane) => {
      Object.assign(updates, buildPackedOverrides(lane.entries, 5));
    });

    applyOverrides(updates, laneOverrides);
    toast({
      title: "Workload balanced",
      description: "Visits were redistributed to balance workload and reduce gaps.",
    });
  }, [applyOverrides, buildLaneDurationMap, buildPackedOverrides, timelineLanes, toast]);

  const handleOptimizeTravel = useCallback(() => {
    const updates: Record<string, number> = {};
    timelineLanes.forEach((lane) => {
      Object.assign(updates, buildPackedOverrides(lane.entries, 10));
    });
    applyOverrides(updates);
    toast({
      title: "Travel gaps optimized",
      description: "Inserted buffer between visits to improve travel flow.",
    });
  }, [applyOverrides, buildPackedOverrides, timelineLanes, toast]);

  const handleApplyRecommendedTimes = useCallback(() => {
    const updates: Record<string, number> = {};
    timelineLanes.forEach((lane) => {
      lane.entries.forEach((entry) => {
        updates[entry.id] = entry.startMinutes;
      });
    });
    applyOverrides(updates);
    toast({
      title: "Recommended times applied",
      description: "Timeline reset to recommended start times.",
    });
  }, [applyOverrides, timelineLanes, toast]);

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

  // Calculate optimization metrics
  const optimizationMetrics = useMemo(() => {
    const allEntries = mapEntries.map((entry) => ({
      id: entry.id,
      startMinutes: entry.startMinutes,
      durationMinutes: entry.durationMinutes,
      lat: null as number | null,
      lon: null as number | null,
    }));
    const segments = calculateTravelSegments(allEntries);
    return calculateOptimizationMetrics(segments, timelineConflictCount);
  }, [mapEntries, timelineConflictCount]);

  // Conflict summary for UI
  const conflictSummaryData = useMemo(() => {
    return [
      { type: "overlap" as const, count: timelineConflictCount },
    ];
  }, [timelineConflictCount]);

  // Keyboard shortcuts
  const keyboardShortcuts = useMemo(() => buildRosteringShortcuts({
    onClearSelection: () => setSelectedTimelineEntryId(null),
    onOptimize: handleOptimizeTravel,
    onZoomIn: () => setSnapMinutes((prev) => Math.max(5, prev - 5)),
    onZoomOut: () => setSnapMinutes((prev) => Math.min(30, prev + 5)),
    onUndo: handleUndo,
    onRedo: handleRedo,
  }), [handleOptimizeTravel, handleUndo, handleRedo]);

  useRosteringKeyboardShortcuts(keyboardShortcuts, !!workbook);

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

  const containerClass = embedded
    ? "space-y-6"
    : "min-h-screen py-8 px-4 lg:px-10 max-w-[1600px] mx-auto relative";

  return (
    <div className={containerClass}>
      {!embedded && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-32 right-0 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute top-40 left-0 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(148,163,184,0.08),transparent_55%)]" />
        </div>
      )}
      {/* Header */}
      <div className={embedded ? "mb-4" : "mb-8"}>
        {!embedded && (
          <div className="flex items-center gap-2 mb-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/testing-features">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Testing Features
              </Link>
            </Button>
          </div>
        )}
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
        {/* Studio sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="h-4 w-4" />
                Rota Library
              </CardTitle>
              <CardDescription>
                Manage saved rotas in the same screen as the studio.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {rotasLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 text-muted-foreground" />
                </div>
              ) : rotas.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>No saved rotas</AlertTitle>
                  <AlertDescription>
                    Save a rota to see it here.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-2">
                  <Select value={selectedRotaId ?? undefined} onValueChange={setSelectedRotaId}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Select saved rota" />
                    </SelectTrigger>
                    <SelectContent>
                      {rotas.map((rota) => (
                        <SelectItem key={rota.id} value={rota.id} className="text-xs">
                          {rota.workerName} • {rota.templateWeek} • {rota.templateDay}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedRotaId && (
                    <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                      {(() => {
                        const selected = rotas.find((r) => r.id === selectedRotaId);
                        return selected ? (
                          <div className="space-y-1">
                            <div className="font-medium text-foreground">{selected.workerName}</div>
                            <div>{selected.templateWeek} • {selected.templateDay}</div>
                            <div>Updated {new Date(selected.updatedAt).toLocaleDateString()}</div>
                          </div>
                        ) : null;
                      })()}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {selectedWorkbookId && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Data Management</CardTitle>
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
                    <Loader2 className="h-4 w-4 mr-2" />
                  ) : null}
                  Delete Upload
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Overloaded Workers Warning */}
          {workerConstraints.length > 0 && (
            <Card className="border-amber-500/50 bg-amber-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-amber-600">
                  <AlertCircle className="h-4 w-4" />
                  Workers With Workload Limits
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {workerConstraints.map((c) => (
                    <div key={c.workerKey} className="flex items-center justify-between text-xs">
                      <span className="text-foreground">{c.workerName}</span>
                      <div className="flex gap-2">
                        {c.maxCallsPerDay && (
                          <Badge variant="outline" className="text-[9px]">
                            Max {c.maxCallsPerDay} calls/day
                          </Badge>
                        )}
                        {c.maxMinutesPerDay && (
                          <Badge variant="outline" className="text-[9px]">
                            Max {Math.round(c.maxMinutesPerDay / 60)}h/day
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  The optimizer will respect these limits when balancing workload.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Worker Templates Summary */}
          {workerTemplates.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Worker Templates
                </CardTitle>
                <CardDescription className="text-xs">
                  {workerTemplates.length} worker-service user assignments learned
                </CardDescription>
              </CardHeader>
            </Card>
          )}

          {/* Recommended Call Times Summary */}
          {recommendedCallTimes.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Recommended Call Times
                </CardTitle>
                <CardDescription className="text-xs">
                  {recommendedCallTimes.length} call time preferences stored
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>

        {/* Main content */}
        <div className="space-y-6">
          {!selectedWorkbookId ? (
            <Card className="p-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold">No data available</h3>
              <p className="text-muted-foreground mt-2">
                Upload data in Testing Features to generate rostering schedules.
              </p>
              <Button variant="outline" className="mt-4" asChild>
                <Link href="/testing-features">Go to Testing Features</Link>
              </Button>
            </Card>
          ) : workbookLoading ? (
            <Card className="p-12 text-center">
              <Loader2 className="h-8 w-8 text-muted-foreground mx-auto mb-4" />
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
                <Card className="border-border/60 bg-background/70 shadow-soft hover-elevate shimmer">
                  <CardContent className="pt-4">
                    <p className="text-xs uppercase text-muted-foreground">Total Rows</p>
                    <p className="text-2xl font-bold">{workbook.totalRows.toLocaleString()}</p>
                  </CardContent>
                </Card>
                <Card className="border-border/60 bg-background/70 shadow-soft hover-elevate shimmer">
                  <CardContent className="pt-4">
                    <p className="text-xs uppercase text-muted-foreground">Care Workers</p>
                    <p className="text-2xl font-bold">{workbook.careWorkerCount}</p>
                  </CardContent>
                </Card>
                <Card className="border-border/60 bg-background/70 shadow-soft hover-elevate shimmer">
                  <CardContent className="pt-4">
                    <p className="text-xs uppercase text-muted-foreground">Service Users</p>
                    <p className="text-2xl font-bold">{workbook.serviceUserCount}</p>
                  </CardContent>
                </Card>
                <Card className="border-border/60 bg-background/70 shadow-soft hover-elevate shimmer">
                  <CardContent className="pt-4">
                    <p className="text-xs uppercase text-muted-foreground">Call Groups</p>
                    <p className="text-2xl font-bold">{workbook.callGroupCount}</p>
                  </CardContent>
                </Card>
                <Card className="border-border/60 bg-background/70 shadow-soft hover-elevate shimmer">
                  <CardContent className="pt-4">
                    <p className="text-xs uppercase text-muted-foreground">Avg Calls/Worker</p>
                    <p className="text-2xl font-bold">{utilizationStats.avgCalls}</p>
                    <p className="text-[10px] text-muted-foreground">{utilizationStats.avgHours}h avg · {utilizationStats.totalHours}h total</p>
                  </CardContent>
                </Card>
              </div>

              {/* Workload Alerts */}
              {(utilizationStats.workersOverLimit > 0 || utilizationStats.workersUnderUtilized > 0) && (
                <div className="flex items-center gap-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                  <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Workload Imbalance Detected</p>
                    <p className="text-xs text-muted-foreground">
                      {utilizationStats.workersOverLimit > 0 && (
                        <span className="text-red-600 dark:text-red-400">{utilizationStats.workersOverLimit} workers over limit</span>
                      )}
                      {utilizationStats.workersOverLimit > 0 && utilizationStats.workersUnderUtilized > 0 && " • "}
                      {utilizationStats.workersUnderUtilized > 0 && (
                        <span>{utilizationStats.workersUnderUtilized} workers under-utilized</span>
                      )}
                    </p>
                  </div>
                </div>
              )}

              {/* Optimization Score & Conflicts */}
              <div className="grid gap-4 lg:grid-cols-[1fr,300px]">
                <OptimizationScore metrics={optimizationMetrics} showDetails={true} />
                <Card className="border-border/60 bg-background/70">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Zap className="h-4 w-4 text-primary" />
                      Schedule Status
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ConflictSummary conflicts={conflictSummaryData} />
                    <div className="flex items-center gap-2 pt-2 border-t">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleUndo}
                        disabled={!canUndo(rosterState)}
                        className="flex-1"
                      >
                        <Undo2 className="h-3.5 w-3.5 mr-1" />
                        Undo
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleRedo}
                        disabled={!canRedo(rosterState)}
                        className="flex-1"
                      >
                        <Redo2 className="h-3.5 w-3.5 mr-1" />
                        Redo
                      </Button>
                    </div>
                    <div className="pt-2 border-t">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Keyboard shortcuts</p>
                      <div className="grid grid-cols-2 gap-1 text-[10px]">
                        <span className="text-muted-foreground">Escape</span>
                        <span>Clear selection</span>
                        <span className="text-muted-foreground">Ctrl+O</span>
                        <span>Optimize</span>
                        <span className="text-muted-foreground">Ctrl+Z</span>
                        <span>Undo</span>
                        <span className="text-muted-foreground">Ctrl+Y</span>
                        <span>Redo</span>
                        <span className="text-muted-foreground">+/-</span>
                        <span>Zoom</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <MultiWorkerDashboard
                workers={workerSummaries}
                selectedWorkerKey={selectedCareWorkerKey}
                onSelectWorker={(workerKey) => setSelectedCareWorkerKey(workerKey)}
              />

              <Card className="border-border/60 bg-background/70 shadow-medium">
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-base">Route Planner</CardTitle>
                    <CardDescription>Timeline scheduling with optional map view.</CardDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Switch
                        id="toggle-all-workers"
                        checked={showAllWorkers}
                        onCheckedChange={setShowAllWorkers}
                      />
                      <label htmlFor="toggle-all-workers" className="text-xs font-medium">
                        Show all workers
                      </label>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {showAllWorkers ? "All workers" : selectedCareWorker?.workerName || "No worker selected"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-xl border border-border/60 bg-background/60 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Snap interval</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {[5, 10, 15, 30].map((value) => (
                          <Button
                            key={value}
                            type="button"
                            size="sm"
                            variant={snapMinutes === value ? "default" : "outline"}
                            onClick={() => setSnapMinutes(value)}
                          >
                            {value} mins
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-background/60 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Timeline grid</p>
                      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <Switch
                          id="toggle-half-hour"
                          checked={showHalfHourTicks}
                          onCheckedChange={setShowHalfHourTicks}
                        />
                        <label htmlFor="toggle-half-hour" className="text-xs font-medium">
                          Show 30‑minute ticks
                        </label>
                      </div>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-background/60 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Planner tips</p>
                      <p className="text-xs text-muted-foreground mt-2">Drag blocks to reschedule. Use the snap interval for precision.</p>
                    </div>
                  </div>
                  <Tabs defaultValue="timeline">
                    <TabsList className="mb-4">
                      <TabsTrigger value="timeline">Timeline</TabsTrigger>
                      <TabsTrigger value="map">Map</TabsTrigger>
                      <TabsTrigger value="call-times">Call Times</TabsTrigger>
                      <TabsTrigger value="constraints">Constraints</TabsTrigger>
                      <TabsTrigger value="workload">Workload</TabsTrigger>
                      <TabsTrigger value="schedules">Schedules</TabsTrigger>
                    </TabsList>
                    <TabsContent value="timeline">
                      {timelineConflictCount > 0 && (
                        <Alert className="mb-4">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>Schedule conflicts detected</AlertTitle>
                          <AlertDescription>
                            {timelineConflictCount} overlaps found in the current timeline. Drag visits to resolve conflicts.
                          </AlertDescription>
                        </Alert>
                      )}
                      <GanttTimeline
                        lanes={timelineLanes}
                        startMinutes={ROSTER_DAY_START_MINUTES}
                        endMinutes={ROSTER_DAY_HARD_END_MINUTES}
                        snapMinutes={snapMinutes}
                        showHalfHourTicks={showHalfHourTicks}
                        selectedEntryId={selectedTimelineEntryId}
                        selectedEntryIds={rosterState.present.selectedEntryIds}
                        focusedEntryId={rosterState.present.focusedEntryId}
                        onSelectEntry={handleSelectEntry}
                        onEntryMove={handleEntryMove}
                        recommendedTimes={callTimesForEditor}
                      />
                      
                      {/* Bulk Selection Toolbar */}
                      {rosterState.present.selectedEntryIds.size > 1 && (
                        <div className="mt-3 flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm">
                              {rosterState.present.selectedEntryIds.size}
                            </div>
                            <div>
                              <p className="text-sm font-semibold">Entries selected</p>
                              <p className="text-xs text-muted-foreground">
                                Shift+Click to select range · Ctrl+Click to toggle
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Select
                              onValueChange={handleBulkReassign}
                            >
                              <SelectTrigger className="w-[180px] h-8 text-xs">
                                <SelectValue placeholder="Move all to worker..." />
                              </SelectTrigger>
                              <SelectContent>
                                {timelineLanes.map((lane) => (
                                  <SelectItem key={lane.id} value={lane.id} className="text-xs">
                                    {lane.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              onClick={handleBulkDelete}
                              className="h-8 text-xs"
                            >
                              Remove
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={handleClearSelection}
                              className="h-8 text-xs"
                            >
                              Clear
                            </Button>
                          </div>
                        </div>
                      )}
                    </TabsContent>
                    <TabsContent value="map">
                      <RouteMapView entries={mapEntries} />
                    </TabsContent>
                    <TabsContent value="call-times">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-sm font-semibold">Recommended Call Times</h3>
                            <p className="text-xs text-muted-foreground">
                              Set preferred visit times for service users. The optimizer will prioritize these when scheduling.
                            </p>
                          </div>
                        </div>
                        <CallTimeEditor
                          serviceUsers={uniqueServiceUsers}
                          callTypes={uniqueCallTypes}
                          callTimes={callTimesForEditor}
                          onSave={(callTime) => {
                            saveCallTimeMutation.mutate(callTime);
                          }}
                          onDelete={(id) => {
                            deleteCallTimeMutation.mutate(id);
                          }}
                          isSaving={saveCallTimeMutation.isPending}
                        />
                      </div>
                    </TabsContent>
                    <TabsContent value="constraints">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-sm font-semibold">Worker Constraints</h3>
                            <p className="text-xs text-muted-foreground">
                              Set maximum calls and hours per day for each care worker. Workers exceeding limits will be highlighted.
                            </p>
                          </div>
                        </div>
                        <WorkerConstraintsEditor
                          workers={careWorkerRosters.map((r) => ({
                            key: r.key,
                            name: r.workerName,
                          }))}
                          constraints={constraintsForEditor}
                          workerSummaries={heatmapSummaries}
                          onSave={(constraint) => {
                            saveConstraintMutation.mutate(constraint);
                          }}
                          onDelete={(id) => {
                            deleteConstraintMutation.mutate(id);
                          }}
                          isSaving={saveConstraintMutation.isPending}
                        />
                      </div>
                    </TabsContent>
                    <TabsContent value="workload">
                      <div className="space-y-4">
                        <div>
                          <h3 className="text-sm font-semibold">Workload Distribution</h3>
                          <p className="text-xs text-muted-foreground">
                            Visual overview of how work is distributed across care workers.
                          </p>
                        </div>
                        <WorkloadHeatmap
                          workers={heatmapSummaries}
                          constraints={constraintsForEditor}
                        />
                      </div>
                    </TabsContent>
                    <TabsContent value="schedules">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-sm font-semibold">Saved Schedules</h3>
                            <p className="text-xs text-muted-foreground">
                              Save and restore optimized schedules for different days and weeks.
                            </p>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => {
                              setSaveScheduleName(`${selectedTemplateDay} ${selectedTemplateWeek === "week1" ? "Week 1" : selectedTemplateWeek === "week2" ? "Week 2" : selectedTemplateWeek} - ${new Date().toLocaleDateString()}`);
                              setSaveScheduleDescription("");
                              setShowSaveDialog(true);
                            }}
                            disabled={Object.keys(rosterState.present.timeOverrides).length === 0}
                          >
                            <Save className="h-4 w-4 mr-2" />
                            Save Current
                          </Button>
                        </div>

                        {savedStates.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-border/60 p-8 text-center">
                            <History className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                            <p className="text-sm text-muted-foreground">No saved schedules yet</p>
                            <p className="text-xs text-muted-foreground mt-1">Save your optimized roster to reuse later</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {savedStates.map((state) => (
                              <div
                                key={state.id}
                                className={`flex items-center justify-between rounded-xl border p-3 transition-colors ${
                                  state.isActive
                                    ? "border-primary/50 bg-primary/5"
                                    : "border-border/60 bg-background/60 hover:bg-muted/30"
                                }`}
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-semibold truncate">{state.name}</p>
                                    {state.isActive && (
                                      <Badge variant="outline" className="text-[10px] border-primary/50 text-primary">
                                        Active
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {state.templateDay} {state.templateWeek === "week_a" ? "Week A" : state.templateWeek === "week_b" ? "Week B" : state.templateWeek}
                                    {state.description && ` • ${state.description}`}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    {Object.keys(state.timeOverrides || {}).length} time adjustments
                                    {state.createdByUsername && ` • ${state.createdByUsername}`}
                                    {" • "}
                                    {new Date(state.updatedAt).toLocaleDateString()}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1 ml-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => loadRosterStateMutation.mutate(state.id)}
                                    disabled={loadRosterStateMutation.isPending}
                                    className="h-8"
                                  >
                                    <FolderOpen className="h-3.5 w-3.5 mr-1" />
                                    Load
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                    onClick={() => deleteRosterStateMutation.mutate(state.id)}
                                    disabled={deleteRosterStateMutation.isPending}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Save Dialog */}
                        {showSaveDialog && (
                          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                            <Card className="w-[400px] max-w-[90vw]">
                              <CardHeader>
                                <CardTitle className="text-base">Save Schedule</CardTitle>
                                <CardDescription>Save your current roster adjustments</CardDescription>
                              </CardHeader>
                              <CardContent className="space-y-4">
                                <div className="space-y-2">
                                  <label className="text-sm font-medium">Name</label>
                                  <Input
                                    value={saveScheduleName}
                                    onChange={(e) => setSaveScheduleName(e.target.value)}
                                    placeholder="e.g., Monday Week A - Optimized"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <label className="text-sm font-medium">Description (optional)</label>
                                  <Input
                                    value={saveScheduleDescription}
                                    onChange={(e) => setSaveScheduleDescription(e.target.value)}
                                    placeholder="Notes about this schedule..."
                                  />
                                </div>
                              </CardContent>
                              <CardFooter className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
                                  Cancel
                                </Button>
                                <Button
                                  onClick={() => {
                                    saveRosterStateMutation.mutate({
                                      name: saveScheduleName || "Unnamed Schedule",
                                      description: saveScheduleDescription || undefined,
                                    });
                                    setShowSaveDialog(false);
                                  }}
                                  disabled={saveRosterStateMutation.isPending}
                                >
                                  <Save className="h-4 w-4 mr-2" />
                                  Save
                                </Button>
                              </CardFooter>
                            </Card>
                          </div>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>

                  <div className="mt-6 grid gap-4 md:grid-cols-[1.2fr,0.8fr]">
                    <Card className="border-border/60 bg-background/70">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Selected Visit</CardTitle>
                        <CardDescription>Click a block on the timeline to view details.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {selectedTimelineEntry ? (
                          <div className="space-y-3 text-sm">
                            <div className="flex items-center justify-between">
                              <p className="font-semibold">{selectedTimelineEntry.title}</p>
                              <Badge variant="outline" className="text-xs">
                                {formatMinutesToTime(selectedTimelineEntry.startMinutes)}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              {selectedTimelineEntry.callTypeLabel && (
                                <CallTypeChip callType={selectedTimelineEntry.callTypeLabel} size="sm" />
                              )}
                              <span className="text-xs text-muted-foreground">
                                {formatMinutesDisplay(selectedTimelineEntry.durationMinutes)}
                              </span>
                              {selectedTimelineEntry.isTimeCritical && (
                                <Badge variant="secondary" className="text-[10px]">
                                  ⚡ Time critical
                                </Badge>
                              )}
                            </div>
                            {selectedTimelineEntry.address && (
                              <p className="text-xs text-muted-foreground border-l-2 border-primary/30 pl-2">
                                {selectedTimelineEntry.address}
                              </p>
                            )}
                            <div className="pt-2 border-t space-y-2">
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Assigned worker</p>
                              <div className="flex items-center gap-2">
                                <Select
                                  value={reassignWorkerKey || selectedEntryLaneKey || ""}
                                  onValueChange={setReassignWorkerKey}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Select worker" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {workerSummaries.map((worker) => (
                                      <SelectItem key={worker.key} value={worker.key}>
                                        {worker.workerName}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    const target = reassignWorkerKey || selectedEntryLaneKey;
                                    if (!target) return;
                                    handleReassignEntry(selectedTimelineEntry.id, target);
                                  }}
                                >
                                  Reassign
                                </Button>
                              </div>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedTimelineEntryId(null)}
                            >
                              Clear selection
                            </Button>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">No visit selected.</p>
                        )}
                      </CardContent>
                    </Card>
                    <Card className="border-border/60 bg-background/70">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Planner Actions</CardTitle>
                        <CardDescription>Quick tools to refine the schedule.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={handleAutoBalance}
                        >
                          Auto-balance workload
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={handleOptimizeTravel}
                        >
                          Optimize travel gaps
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={handleApplyRecommendedTimes}
                        >
                          Apply recommended times
                        </Button>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Smart Optimization Panel */}
                  <div className="mt-6">
                    <OptimizationSettings
                      weights={optimizationWeights}
                      constraints={optimizationConstraints}
                      onWeightsChange={setOptimizationWeights}
                      onConstraintsChange={setOptimizationConstraints}
                      onRunOptimization={handleRunOptimization}
                      isOptimizing={isOptimizing}
                    />
                  </div>

                  <div className="mt-6">
                    <AdminDatabasePanel />
                  </div>
                </CardContent>
              </Card>

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
                            const violation = constraintViolations.get(roster.key);
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
                                    : violation
                                      ? "border-amber-500/50 bg-amber-500/5 hover:bg-amber-500/10"
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
                                    {violation && (
                                      <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10">
                                        {violation.overCalls && violation.overMinutes
                                          ? "Over limit"
                                          : violation.overCalls
                                            ? "Too many calls"
                                            : "Too many hours"}
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {roster.uniqueServiceUsers} SUs •{" "}
                                    {roster.callRows?.length ?? roster.callRowsCount ?? 0} calls
                                    {roster.shiftBarsCount > 0 && ` • ${roster.shiftBarsCount} shifts`}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1">
                                  {violation && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                                  {isSelected && <CheckCircle2 className="h-4 w-4 text-primary" />}
                                </div>
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
                                {selectedCareWorker.callRows?.length ?? selectedCareWorker.callRowsCount ?? 0} calls •{" "}
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
