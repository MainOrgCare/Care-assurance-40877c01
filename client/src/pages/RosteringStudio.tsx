import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
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
  ChevronLeft,
  ChevronRight,
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
  Clock,
  Calendar,
  Keyboard,
  Zap,
  Undo2,
  Redo2,
  AlertTriangle,
  Save,
  FolderOpen,
  Trash2,
  History,
  ClipboardList,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { GanttTimeline } from "@/components/rostering/GanttTimeline";
import { MultiWorkerDashboard } from "@/components/rostering/MultiWorkerDashboard";
import { RouteMapView } from "@/components/rostering/RouteMapView";
import { OptimizationScore } from "@/components/rostering/OptimizationScore";
import { ConflictSummary } from "@/components/rostering/ConflictAlert";
import { CallTypeChip } from "@/components/rostering/CallTypeChip";
import { TravelTimeIndicator } from "@/components/rostering/TravelTimeIndicator";
import { WorkerAvatar } from "@/components/rostering/WorkerAvatar";
import { CallTimeEditor, type RecommendedCallTime } from "@/components/rostering/CallTimeEditor";
import { WorkloadHeatmap } from "@/components/rostering/WorkloadHeatmap";
import { WorkerConstraintsEditor, type WorkerConstraint as WorkerConstraintUI } from "@/components/rostering/WorkerConstraintsEditor";
import { buildAllWorkerLanes, buildWorkerLane, buildWorkerSummaries, type TimelineEntry, type GanttLane } from "@/lib/rostering/rosterModel";
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
const ROSTER_DAY_HARD_END_MINUTES = 22 * 60;
const TIMELINE_ZOOM_LEVELS = [70, 85, 100, 115, 130] as const;
const BASE_TIMELINE_ROW_HEIGHT = 72;

const TEMPLATE_WEEK_OPTIONS = [
  { key: "week1", label: "Week 1" },
  { key: "week2", label: "Week 2" },
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
const TEMPLATE_WEEK_1_START_DAY_NUMBER = Math.floor(Date.UTC(2000, 0, 3) / 86400000);

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
  serviceRequirementEndTimeMinutes?: number | null;
  serviceRequirementEndTimeLabel?: string | null;
  plannedEndTimeMinutes?: number | null;
  actualEndTimeMinutes?: number | null;
  plannedDateLabel?: string | null;
  plannedDateKey?: string | null;
  serviceUserName?: string | null;
  serviceUserArea?: string | null;
  serviceUserAddress?: string | null;
  serviceLocationBranch?: string | null;
  serviceLocationType?: string | null;
  templateWeek?: TemplateWeekKey | null;
  templateDay?: WeekdayLabel | null;
  normalizedServiceUserKey?: string | null;
  isDuplicateSlotRow?: boolean;
  excludeFromMetrics?: boolean;
  callTypeLabel?: string | null;
}

interface WorkerCallGroup {
  key: string;
  serviceUserKey?: string | null;
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

type WorkerConstraintSummary = {
  workerKey: string;
  workerName: string;
  maxCallsPerDay?: number;
  maxMinutesPerDay?: number;
  maxCallsPerWeek?: number;
  maxMinutesPerWeek?: number;
};

type SavedRosterStateSummary = {
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
};

type DayTemplateStats = {
  dateKey: string;
  day: WeekdayLabel;
  dateLabel: string;
  total: number;
  templated: number;
  nonTemplated: number;
  rostered: number;
  unrostered: number;
  rosteredTemplated: number;
  rosteredNonTemplated: number;
  unrosteredTemplated: number;
  unrosteredNonTemplated: number;
};

// ===== HELPER FUNCTIONS =====
const formatMinutesDisplay = (minutes: number | null | undefined): string => {
  if (minutes === null || minutes === undefined) return "—";
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.abs(minutes) % 60;
  const sign = minutes < 0 ? "-" : "";
  if (h > 0) return `${sign}${h}h ${m}m`;
  return `${sign}${m} mins`;
};

const formatTimeOfDay = (minutes: number | null | undefined): string => {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return "--:--";
  const normalized = Math.max(0, Math.min(24 * 60 - 1, minutes));
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const formatDeltaLabel = (deltaMinutes: number): string => {
  if (deltaMinutes === 0) return "On target";
  const abs = Math.abs(deltaMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const formatted = h > 0 ? `${h}h ${m}m` : `${m} mins`;
  return deltaMinutes > 0 ? `${formatted} late` : `${formatted} early`;
};

const sanitizeFileName = (value: string): string => {
  return value.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "");
};

const buildRecommendationKey = (serviceUserKey: string, callTypeLabel: string): string => {
  return `${serviceUserKey}|${callTypeLabel.trim().toLowerCase()}`;
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

const parseDateKeyToLocalDate = (key: string | null | undefined): Date | null => {
  if (!key) return null;
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

const getDateDayNumber = (date: Date): number => {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
};

const deriveTemplateWeekKey = (date: Date, referenceDayNumber = TEMPLATE_WEEK_1_START_DAY_NUMBER): TemplateWeekKey => {
  const diffDays = getDateDayNumber(date) - referenceDayNumber;
  const weekOffset = Math.floor(diffDays / 7);
  const parity = ((weekOffset % 2) + 2) % 2;
  return parity === 0 ? "week1" : "week2";
};

const deriveWeekdayLabel = (date: Date): WeekdayLabel => {
  const dayIndex = date.getDay();
  return WEEKDAY_OPTIONS[(dayIndex + 6) % 7];
};

const getTemplateWeekLabel = (week: TemplateWeekKey, _referenceDayNumber: number | null): string => {
  return week === "week1" ? "Week 1" : "Week 2";
};

const computeTemplateSelectionKey = (week: TemplateWeekKey, day: WeekdayLabel) => {
  return `${week}|${day}`;
};

export default function RosteringStudio({
  embedded = false,
  mode = "studio",
}: {
  embedded?: boolean;
  mode?: "studio" | "hub";
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();

  // Local state
  const [selectedWorkbookId, setSelectedWorkbookId] = useState<string | null>(null);
  const [rosteringFullscreen, setRosteringFullscreen] = useState(false);
  const [studioTab, setStudioTab] = useState<
    "timeline" | "map" | "call-times" | "constraints" | "workload" | "schedules"
  >("timeline");
  const [selectedCareWorkerKey, setSelectedCareWorkerKey] = useState<string>("");
  const [selectedServiceUserKey, setSelectedServiceUserKey] = useState<string | null>(null);
  const [selectedWorkerCallKeys, setSelectedWorkerCallKeys] = useState<string[]>([]);
  const [careWorkerSearch, setCareWorkerSearch] = useState("");
  const [rosterCallSearch, setRosterCallSearch] = useState("");
  const [hubTab, setHubTab] = useState<"rostering" | "service-user" | "employee" | "search" | "optimize">("rostering");
  const [hubMemberView, setHubMemberView] = useState<"service-users" | "employees">("service-users");
  const [isHubSidebarCollapsed, setIsHubSidebarCollapsed] = useState(false);
  const [serviceUserSearch, setServiceUserSearch] = useState("");
  const [serviceUserAreaFilter, setServiceUserAreaFilter] = useState("all");
  const [callTypeFilter, setCallTypeFilter] = useState("all");
  
  // Roster state with undo/redo via reducer
  const [rosterState, dispatchRoster] = useReducer(rosterHistoryReducer, undefined, createInitialHistoryState);
  
  const [showAllWorkers, setShowAllWorkers] = useState(false);
  const [snapMinutes, setSnapMinutes] = useState(10);
  const [showHalfHourTicks, setShowHalfHourTicks] = useState(true);
  const [timelineZoomIndex, setTimelineZoomIndex] = useState(2);
  const [selectedTimelineEntryId, setSelectedTimelineEntryId] = useState<string | null>(null);
  const [reassignWorkerKey, setReassignWorkerKey] = useState<string>("");
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveScheduleName, setSaveScheduleName] = useState("");
  const [saveScheduleDescription, setSaveScheduleDescription] = useState("");
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  
  // Template selection
  const [selectedTemplateWeek, setSelectedTemplateWeek] = useState<TemplateWeekKey>(DEFAULT_TEMPLATE_WEEK);
  const [selectedTemplateDay, setSelectedTemplateDay] = useState<WeekdayLabel>(DEFAULT_TEMPLATE_DAY);
  const focusWorkerRef = useRef<string | null>(null);

  const { focusWorkerKey, focusWeek, focusDay, focusTab } = useMemo(() => {
    const params = new URLSearchParams(location.split("?")[1] ?? "");
    const worker = params.get("worker") ?? "";
    const week = params.get("week");
    const day = params.get("day");
    const tab = params.get("tab") ?? params.get("view");
    return { focusWorkerKey: worker, focusWeek: week, focusDay: day, focusTab: tab };
  }, [location]);

  const routePlannerRef = useRef<HTMLDivElement | null>(null);

  const timelineZoom = TIMELINE_ZOOM_LEVELS[timelineZoomIndex] ?? 100;
  const timelineRowHeight = useMemo(
    () => Math.round(BASE_TIMELINE_ROW_HEIGHT * (timelineZoom / 100)),
    [timelineZoom]
  );
  const handleTimelineZoomIn = useCallback(() => {
    setTimelineZoomIndex((prev) => Math.min(prev + 1, TIMELINE_ZOOM_LEVELS.length - 1));
  }, []);
  const handleTimelineZoomOut = useCallback(() => {
    setTimelineZoomIndex((prev) => Math.max(prev - 1, 0));
  }, []);
  const handleTimelineZoomReset = useCallback(() => {
    const defaultIndex = TIMELINE_ZOOM_LEVELS.indexOf(100);
    setTimelineZoomIndex(defaultIndex === -1 ? 0 : defaultIndex);
  }, []);
  
  // Optimization settings
  const [optimizationWeights, setOptimizationWeights] = useState<OptimizationWeights>(defaultWeights);
  const [optimizationConstraints, setOptimizationConstraints] = useState<OptimizationConstraints>(defaultConstraints);
  const [isOptimizing, setIsOptimizing] = useState(false);
  
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
    if (workbooks.length === 0) return;
    // Always use the most recent upload to keep templates current.
    const latestWorkbook = workbooks[workbooks.length - 1];
    if (selectedWorkbookId !== latestWorkbook.id) {
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

  // Rota library is displayed in studio context without selection UI

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
  const { data: workerConstraints = [] } = useQuery<WorkerConstraintSummary[]>({
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
  const { data: savedStates = [] } = useQuery<SavedRosterStateSummary[]>({
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
    mutationFn: async (constraint: { workerKey: string; workerName: string; maxCallsPerDay?: number; maxMinutesPerDay?: number; maxCallsPerWeek?: number; maxMinutesPerWeek?: number; notes?: string }) => {
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

  const templateWeekReferenceDayNumber = useMemo(() => {
    const isTemplateWeekKey = (value: unknown): value is TemplateWeekKey =>
      value === "week1" || value === "week2";
    let latest: { date: Date; templateWeek?: TemplateWeekKey | null } | null = null;
    careWorkerRosters.forEach((roster) => {
      const rows = roster.callRows ?? roster.rows ?? [];
      rows.forEach((row) => {
        if (!row.plannedDateKey) return;
        const date = parseDateKeyToLocalDate(row.plannedDateKey);
        if (!date) return;
        if (!latest || date > latest.date) {
          latest = { date, templateWeek: row.templateWeek ?? null };
        }
      });
    });
    if (!latest) return null;
    const latestEntry = latest as { date: Date; templateWeek?: TemplateWeekKey | null };
    const pivotWeek = isTemplateWeekKey(latestEntry.templateWeek)
      ? latestEntry.templateWeek
      : deriveTemplateWeekKey(latestEntry.date, TEMPLATE_WEEK_1_START_DAY_NUMBER);
    const pivotDay = deriveWeekdayLabel(latestEntry.date);
    const dayOffset = WEEKDAY_OPTIONS.indexOf(pivotDay);
    if (dayOffset < 0) return null;
    const weekOffset = pivotWeek === "week2" ? 7 : 0;
    return getDateDayNumber(latestEntry.date) - weekOffset - dayOffset;
  }, [careWorkerRosters]);

  const templateWeekReferenceDayNumberForCalc =
    templateWeekReferenceDayNumber ?? TEMPLATE_WEEK_1_START_DAY_NUMBER;

  const doubleUpSlots = useMemo<Map<string, Set<string>>>(() => {
    if (!workbook?.doubleUpSlots) return new Map();
    const map = new Map<string, Set<string>>();
    for (const [key, workers] of Object.entries(workbook.doubleUpSlots) as [string, string[]][]) {
      map.set(key, new Set(workers));
    }
    return map;
  }, [workbook]);

  const templateSelectionKey = useMemo(
    () => computeTemplateSelectionKey(selectedTemplateWeek, selectedTemplateDay),
    [selectedTemplateWeek, selectedTemplateDay]
  );

  const openWorkerTools = useCallback(
    (workerKey: string) => {
      if (!workerKey) return;
      const params = new URLSearchParams();
      params.set("worker", workerKey);
      params.set("week", selectedTemplateWeek);
      params.set("day", selectedTemplateDay);
      params.set("tab", "map");
      setLocation(`/rostering-studio?${params.toString()}`);
    },
    [selectedTemplateDay, selectedTemplateWeek, setLocation]
  );

  const selectedWeekDateKeys = useMemo(() => {
    return new Set(
      WEEKDAY_OPTIONS.map((day) =>
        getDateRelativeToTemplateStart(selectedTemplateWeek, day, templateWeekReferenceDayNumberForCalc).dateKey
      )
    );
  }, [selectedTemplateWeek, templateWeekReferenceDayNumberForCalc]);

  const selectedTemplateDate = useMemo(
    () =>
      getDateRelativeToTemplateStart(
        selectedTemplateWeek,
        selectedTemplateDay,
        templateWeekReferenceDayNumberForCalc
      ),
    [selectedTemplateWeek, selectedTemplateDay, templateWeekReferenceDayNumberForCalc]
  );

  const selectedTemplateWeekLabel = useMemo(() => {
    return getTemplateWeekLabel(selectedTemplateWeek, templateWeekReferenceDayNumber);
  }, [selectedTemplateWeek, templateWeekReferenceDayNumber]);

  const templateWeekDays = useMemo(() => {
    return WEEKDAY_OPTIONS.map((day) => ({
      day,
      ...getDateRelativeToTemplateStart(selectedTemplateWeek, day, templateWeekReferenceDayNumberForCalc),
    }));
  }, [selectedTemplateWeek, templateWeekReferenceDayNumberForCalc]);

  const dailyMetrics = useMemo(() => {
    const totals = new Map<string, { allocated: number; unallocated: number; totalMinutes: number }>();
    templateWeekDays.forEach((day) => {
      totals.set(day.dateKey, { allocated: 0, unallocated: 0, totalMinutes: 0 });
    });

    careWorkerRosters.forEach((roster) => {
      const rows = roster.callRows ?? roster.rows ?? [];
      rows.forEach((row) => {
        if (row.isShiftBar) return;
        if (!row.plannedDateKey) return;
        const bucket = totals.get(row.plannedDateKey);
        if (!bucket) return;
        const duration =
          row.actualDurationMinutes ?? row.plannedDurationMinutes ?? row.serviceRequirementTimeMinutes ?? null;
        if (typeof duration === "number") {
          bucket.totalMinutes += duration;
        }
        const hasTime =
          typeof row.plannedTimeMinutes === "number" ||
          typeof row.actualTimeMinutes === "number" ||
          typeof row.serviceRequirementTimeMinutes === "number";
        if (hasTime) {
          bucket.allocated += 1;
        } else {
          bucket.unallocated += 1;
        }
      });
    });

    return totals;
  }, [careWorkerRosters, templateWeekDays]);

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
    if (focusWorkerKey) return;
    if (careWorkerRosters.length > 0 && !selectedCareWorkerKey) {
      setSelectedCareWorkerKey(careWorkerRosters[0].key);
      setSelectedServiceUserKey(null);
    }
  }, [careWorkerRosters, focusWorkerKey, selectedCareWorkerKey]);

  useEffect(() => {
    if (mode !== "studio") return;
    if (!focusWorkerKey) {
      focusWorkerRef.current = null;
      return;
    }
    if (!careWorkerRosters.length) return;
    if (focusWorkerRef.current === focusWorkerKey) return;
    const match = careWorkerRosters.find((worker) => worker.key === focusWorkerKey);
    if (!match) return;
    setSelectedCareWorkerKey(focusWorkerKey);
    setSelectedServiceUserKey(null);
    setSelectedWorkerCallKeys([]);
    setShowAllWorkers(false);
    if (focusWeek === "week1" || focusWeek === "week2") {
      setSelectedTemplateWeek(focusWeek);
    }
    if (focusDay && WEEKDAY_OPTIONS.includes(focusDay as WeekdayLabel)) {
      setSelectedTemplateDay(focusDay as WeekdayLabel);
    }
    if (focusTab) {
      const allowedTabs = new Set(["timeline", "map", "call-times", "constraints", "workload", "schedules"]);
      if (allowedTabs.has(focusTab)) {
        setStudioTab(focusTab as typeof studioTab);
      }
    }
    focusWorkerRef.current = focusWorkerKey;
  }, [careWorkerRosters, focusDay, focusTab, focusWeek, focusWorkerKey, mode]);

  // Call groups for selected worker
  const selectedWorkerCallGroups = useMemo<WorkerCallGroup[]>(() => {
    return selectedCareWorker?.callGroups || [];
  }, [selectedCareWorker]);

  const selectedWorkerCallKeySet = useMemo(() => new Set(selectedWorkerCallKeys), [selectedWorkerCallKeys]);

  const workerSummaries = useMemo(() => buildWorkerSummaries(careWorkerRosters), [careWorkerRosters]);
  const workerSummaryByKey = useMemo(() => {
    return new Map(workerSummaries.map((summary) => [summary.key, summary]));
  }, [workerSummaries]);

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

  const serviceUserAreaOptions = useMemo(() => {
    const areaSet = new Set<string>();
    careWorkerRosters.forEach((roster) => {
      roster.callGroups?.forEach((group: any) => {
        if (group.serviceUserArea) {
          areaSet.add(group.serviceUserArea);
        }
      });
    });
    return Array.from(areaSet).sort();
  }, [careWorkerRosters]);

  const serviceUserAreaByKey = useMemo(() => {
    const map = new Map<string, string>();
    careWorkerRosters.forEach((roster) => {
      roster.callGroups?.forEach((group: any) => {
        const key = group.serviceUserKey || group.normalizedServiceUserKey || group.serviceUserName;
        if (!key || !group.serviceUserArea || map.has(key)) return;
        map.set(key, group.serviceUserArea);
      });
    });
    return map;
  }, [careWorkerRosters]);

  const serviceUserNameByKey = useMemo(() => {
    const map = new Map<string, string>();
    careWorkerRosters.forEach((roster) => {
      roster.callGroups?.forEach((group: any) => {
        if (!group.serviceUserKey || !group.serviceUserName || map.has(group.serviceUserKey)) return;
        map.set(group.serviceUserKey, group.serviceUserName);
      });
    });
    return map;
  }, [careWorkerRosters]);

  // Transform recommendedCallTimes data for CallTimeEditor
  const callTimesForEditor = useMemo<RecommendedCallTime[]>(() => {
    if (!recommendedCallTimes) return [];
    return recommendedCallTimes.map((ct: any) => ({
      id: ct.id,
      serviceUserKey: ct.serviceUserKey,
      serviceUserName: ct.serviceUserName || serviceUserNameByKey.get(ct.serviceUserKey) || "Unknown",
      callTypeLabel: ct.callTypeLabel,
      recommendedStartMinutes: ct.recommendedStartMinutes,
      toleranceMinutes: ct.toleranceMinutes,
      priority: ct.priority,
      notes: ct.notes,
    }));
  }, [recommendedCallTimes, serviceUserNameByKey]);

  const recommendedTimeLookup = useMemo(() => {
    const map = new Map<string, RecommendedCallTime>();
    callTimesForEditor.forEach((ct) => {
      if (!ct.serviceUserKey || !ct.callTypeLabel) return;
      map.set(buildRecommendationKey(ct.serviceUserKey, ct.callTypeLabel), ct);
    });
    return map;
  }, [callTimesForEditor]);

  // Transform workerConstraints data for WorkerConstraintsEditor
  const constraintsForEditor = useMemo<WorkerConstraintUI[]>(() => {
    if (!workerConstraints) return [];
    return workerConstraints.map((wc: any) => ({
      id: wc.id,
      workerKey: wc.workerKey,
      workerName: wc.workerName,
      maxCallsPerDay: wc.maxCallsPerDay,
      maxMinutesPerDay: wc.maxMinutesPerDay,
      maxCallsPerWeek: wc.maxCallsPerWeek,
      maxMinutesPerWeek: wc.maxMinutesPerWeek,
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

  const weeklyTotals = useMemo(() => {
    const totals = new Map<string, { calls: number; minutes: number }>();
    careWorkerRosters.forEach((roster) => {
      const rows = roster.callRows ?? roster.rows ?? [];
      let calls = 0;
      let minutes = 0;
      rows.forEach((row) => {
        if (row.isShiftBar) return;
        if (!row.plannedDateKey || !selectedWeekDateKeys.has(row.plannedDateKey)) return;
        calls += 1;
        const duration = row.actualDurationMinutes ?? row.plannedDurationMinutes ?? row.serviceRequirementTimeMinutes ?? null;
        if (typeof duration === "number") {
          minutes += duration;
        }
      });
      totals.set(roster.key, { calls, minutes });
    });
    return totals;
  }, [careWorkerRosters, selectedWeekDateKeys]);

  // Compute constraint violations for visual indicators
  const constraintViolations = useMemo(() => {
    const violations = new Map<string, { overCalls: boolean; overMinutes: boolean; overWeeklyCalls: boolean; overWeeklyMinutes: boolean }>();
    if (!workerConstraints || workerConstraints.length === 0) return violations;

    careWorkerRosters.forEach((roster) => {
      const constraint = workerConstraints.find((c: any) => c.workerKey === roster.key);
      if (!constraint) return;

      const callCount = roster.callGroups?.length || 0;
      const totalMinutes = roster.callGroups?.reduce((sum: number, g: any) => sum + (g.durationMinutes || 0), 0) || 0;
      const weekly = weeklyTotals.get(roster.key);

      const overCalls = constraint.maxCallsPerDay && callCount > constraint.maxCallsPerDay;
      const overMinutes = constraint.maxMinutesPerDay && totalMinutes > constraint.maxMinutesPerDay;
      const overWeeklyCalls = constraint.maxCallsPerWeek && (weekly?.calls ?? 0) > constraint.maxCallsPerWeek;
      const overWeeklyMinutes = constraint.maxMinutesPerWeek && (weekly?.minutes ?? 0) > constraint.maxMinutesPerWeek;

      if (overCalls || overMinutes || overWeeklyCalls || overWeeklyMinutes) {
        violations.set(roster.key, {
          overCalls: !!overCalls,
          overMinutes: !!overMinutes,
          overWeeklyCalls: !!overWeeklyCalls,
          overWeeklyMinutes: !!overWeeklyMinutes,
        });
      }
    });

    return violations;
  }, [careWorkerRosters, workerConstraints, weeklyTotals]);

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


  const overviewStats = useMemo(() => {
    const totalWorkers = careWorkerRosters.length;
    const totalCalls = heatmapSummaries.reduce((sum, w) => sum + w.callCount, 0);
    const totalMinutes = heatmapSummaries.reduce((sum, w) => sum + w.totalMinutes, 0);
    const totalServiceUsers = uniqueServiceUsers.length;
    const totalCallGroups = careWorkerRosters.reduce((sum, roster) => sum + (roster.callGroups?.length || 0), 0);

    return {
      totalWorkers,
      totalCalls,
      totalMinutes,
      totalHours: parseFloat((totalMinutes / 60).toFixed(1)),
      totalServiceUsers,
      totalCallGroups,
    };
  }, [careWorkerRosters, heatmapSummaries, uniqueServiceUsers]);

  const selectedDayMetrics = useMemo(() => {
    return (
      dailyMetrics.get(selectedTemplateDate.dateKey) ?? {
        allocated: 0,
        unallocated: 0,
        totalMinutes: 0,
      }
    );
  }, [dailyMetrics, selectedTemplateDate]);

  const weeklyTemplateStats = useMemo(() => {
    const initWeek = (week: TemplateWeekKey) => {
      const map = new Map<string, DayTemplateStats>();
      WEEKDAY_OPTIONS.forEach((day) => {
        const dateInfo = getDateRelativeToTemplateStart(week, day, templateWeekReferenceDayNumberForCalc);
        map.set(dateInfo.dateKey, {
          dateKey: dateInfo.dateKey,
          day,
          dateLabel: dateInfo.dateLabel,
          total: 0,
          templated: 0,
          nonTemplated: 0,
          rostered: 0,
          unrostered: 0,
          rosteredTemplated: 0,
          rosteredNonTemplated: 0,
          unrosteredTemplated: 0,
          unrosteredNonTemplated: 0,
        });
      });
      return map;
    };

    const stats = {
      week1: initWeek("week1"),
      week2: initWeek("week2"),
    };

    const isTemplateWeek = (value: any): value is TemplateWeekKey => value === "week1" || value === "week2";
    const isTemplateDay = (value: any): value is WeekdayLabel => WEEKDAY_OPTIONS.includes(value as WeekdayLabel);

    careWorkerRosters.forEach((roster) => {
      const rows = roster.callRows ?? roster.rows ?? [];
      rows.forEach((row) => {
        if (row.isShiftBar) return;
        const date = parseDateKeyToLocalDate(row.plannedDateKey);
        const derivedWeek = date ? deriveTemplateWeekKey(date, templateWeekReferenceDayNumberForCalc) : null;
        const derivedDay = date ? deriveWeekdayLabel(date) : null;
        const week = isTemplateWeek(row.templateWeek) ? row.templateWeek : derivedWeek;
        const day = isTemplateDay(row.templateDay) ? row.templateDay : derivedDay;
        if (!week || !day) return;

        const dateInfo = getDateRelativeToTemplateStart(week, day, templateWeekReferenceDayNumberForCalc);
        const bucket = stats[week].get(dateInfo.dateKey);
        if (!bucket) return;

        const isTemplated = Boolean(row.templateWeek || row.templateDay);
        const hasTime =
          typeof row.plannedTimeMinutes === "number" ||
          typeof row.actualTimeMinutes === "number" ||
          typeof row.serviceRequirementTimeMinutes === "number";

        bucket.total += 1;
        if (isTemplated) {
          bucket.templated += 1;
        } else {
          bucket.nonTemplated += 1;
        }

        if (hasTime) {
          bucket.rostered += 1;
          if (isTemplated) {
            bucket.rosteredTemplated += 1;
          } else {
            bucket.rosteredNonTemplated += 1;
          }
        } else {
          bucket.unrostered += 1;
          if (isTemplated) {
            bucket.unrosteredTemplated += 1;
          } else {
            bucket.unrosteredNonTemplated += 1;
          }
        }
      });
    });

    return stats;
  }, [careWorkerRosters, templateWeekReferenceDayNumberForCalc]);

  const selectedDayTemplateStats = useMemo(() => {
    const weekStats = weeklyTemplateStats[selectedTemplateWeek];
    return weekStats.get(selectedTemplateDate.dateKey) ?? null;
  }, [selectedTemplateDate.dateKey, selectedTemplateWeek, weeklyTemplateStats]);

  const weeklyOverviewRows = useMemo(() => {
    const buildRows = (week: TemplateWeekKey) =>
      WEEKDAY_OPTIONS.map((day) => {
        const dateInfo = getDateRelativeToTemplateStart(week, day, templateWeekReferenceDayNumberForCalc);
        return (
          weeklyTemplateStats[week].get(dateInfo.dateKey) ?? {
            dateKey: dateInfo.dateKey,
            day,
            dateLabel: dateInfo.dateLabel,
            total: 0,
            templated: 0,
            nonTemplated: 0,
            rostered: 0,
            unrostered: 0,
            rosteredTemplated: 0,
            rosteredNonTemplated: 0,
            unrosteredTemplated: 0,
            unrosteredNonTemplated: 0,
          }
        );
      });
    return {
      week1: buildRows("week1"),
      week2: buildRows("week2"),
    };
  }, [templateWeekReferenceDayNumberForCalc, weeklyTemplateStats]);

  const selectedWorkerLane = useMemo(
    () => buildWorkerLane(selectedCareWorker, templateSelectionKey, selectedWorkerCallKeySet),
    [selectedCareWorker, selectedWorkerCallKeySet, templateSelectionKey]
  );
  const allWorkerLanes = useMemo(
    () => buildAllWorkerLanes(visibleCareWorkerRosters, templateSelectionKey),
    [visibleCareWorkerRosters, templateSelectionKey]
  );

  // Apply overrides from reducer state to lanes
  const timelineLanes = useMemo(() => {
    const baseLanes = showAllWorkers ? allWorkerLanes : selectedWorkerLane ? [selectedWorkerLane] : [];
    return applyOverridesToLanes(baseLanes, rosterState.present);
  }, [allWorkerLanes, rosterState.present, selectedWorkerLane, showAllWorkers]);

  const serviceUserBaseLanes = useMemo<GanttLane[]>(() => {
    if (careWorkerRosters.length === 0) return [];
    const laneMap = new Map<string, GanttLane>();
    const seenEntries = new Set<string>();

    careWorkerRosters.forEach((roster) => {
      roster.callGroups?.forEach((group: any) => {
        if (group.requirementStartMinutes === null || group.requirementStartMinutes === undefined) return;
        if (templateSelectionKey && group.templatedWeekdayKeys && !group.templatedWeekdayKeys.has(templateSelectionKey)) {
          return;
        }
        const entryId = group.key;
        if (!entryId || seenEntries.has(entryId)) return;
        seenEntries.add(entryId);

        const serviceUserKey =
          group.serviceUserKey || group.normalizedServiceUserKey || group.serviceUserName || entryId;
        const lane: GanttLane = laneMap.get(serviceUserKey) ?? {
          id: serviceUserKey,
          label: group.serviceUserName || "Unknown service user",
          entries: [],
        };

        lane.entries.push({
          id: entryId,
          title: group.callTypeLabel || group.serviceUserName || "Visit",
          startMinutes: group.requirementStartMinutes as number,
          durationMinutes: group.durationMinutes ?? DEFAULT_ROUTE_DURATION_MINUTES,
          serviceUserName: group.serviceUserName,
          serviceUserKey,
          callTypeLabel: group.callTypeLabel,
          isTimeCritical: group.isTimeCritical,
          isDoubleUp: templateSelectionKey ? Boolean(group.doubleUpWeekdayKeys?.has(templateSelectionKey)) : false,
          isTemplated: templateSelectionKey ? Boolean(group.templatedWeekdayKeys?.has(templateSelectionKey)) : false,
          requiredStartMinutes: group.requirementStartMinutes ?? null,
          address: group.serviceUserAddress ?? null,
        });

        laneMap.set(serviceUserKey, lane);
      });
    });

    return Array.from(laneMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [careWorkerRosters, templateSelectionKey]);

  const serviceUserLanesWithOverrides = useMemo(() => {
    if (serviceUserBaseLanes.length === 0) return [];
    const overrides = rosterState.present.timeOverrides;
    return serviceUserBaseLanes
      .map((lane) => ({
        ...lane,
        entries: lane.entries
          .map((entry) => {
            const override = overrides[entry.id];
            return typeof override === "number" ? { ...entry, startMinutes: override } : entry;
          })
          .filter((entry) => entry.startMinutes >= 0),
      }))
      .filter((lane) => lane.entries.length > 0);
  }, [serviceUserBaseLanes, rosterState.present.timeOverrides]);

  const filteredServiceUserLanes = useMemo(() => {
    const term = serviceUserSearch.toLowerCase().trim();
    const normalizedCallType = callTypeFilter.toLowerCase();

    return serviceUserLanesWithOverrides
      .map((lane) => {
        const area = serviceUserAreaByKey.get(lane.id);
        if (serviceUserAreaFilter !== "all" && area !== serviceUserAreaFilter) {
          return null;
        }

        let entries = lane.entries;
        if (callTypeFilter !== "all") {
          entries = entries.filter(
            (entry) => entry.callTypeLabel?.toLowerCase() === normalizedCallType
          );
        }
        if (term) {
          const laneMatches = lane.label.toLowerCase().includes(term);
          if (!laneMatches) {
            entries = entries.filter(
              (entry) =>
                entry.serviceUserName?.toLowerCase().includes(term) ||
                entry.callTypeLabel?.toLowerCase().includes(term)
            );
          }
        }
        if (entries.length === 0) return null;
        return { ...lane, entries };
      })
      .filter((lane): lane is GanttLane => Boolean(lane));
  }, [callTypeFilter, serviceUserAreaByKey, serviceUserAreaFilter, serviceUserLanesWithOverrides, serviceUserSearch]);

  const hubTimelineLanes = useMemo(() => {
    if (callTypeFilter === "all") return timelineLanes;
    const normalized = callTypeFilter.toLowerCase();
    return timelineLanes
      .map((lane) => ({
        ...lane,
        entries: lane.entries.filter(
          (entry) => entry.callTypeLabel?.toLowerCase() === normalized
        ),
      }))
      .filter((lane) => lane.entries.length > 0);
  }, [callTypeFilter, timelineLanes]);

  const entryLookup = useMemo(() => {
    const map = new Map<string, TimelineEntry>();
    timelineLanes.forEach((lane) => {
      lane.entries.forEach((entry) => {
        map.set(entry.id, entry);
      });
    });
    return map;
  }, [timelineLanes]);

  const mapEntries = useMemo(
    () => timelineLanes.flatMap((lane) => lane.entries),
    [timelineLanes]
  );

  const routeEntriesForSelection = useMemo(() => {
    if (!selectedServiceUserKey) return mapEntries;
    const serviceUserName = serviceUserNameByKey.get(selectedServiceUserKey);
    return allWorkerLanes
      .flatMap((lane) => lane.entries)
      .filter(
        (entry) =>
          entry.serviceUserKey === selectedServiceUserKey ||
          (serviceUserName && entry.serviceUserName === serviceUserName)
      );
  }, [allWorkerLanes, mapEntries, selectedServiceUserKey, serviceUserNameByKey]);

  const routeEntriesSorted = useMemo(() => {
    return [...routeEntriesForSelection]
      .filter((entry) => entry.startMinutes >= 0)
      .sort((a, b) => a.startMinutes - b.startMinutes);
  }, [routeEntriesForSelection]);

  const routeFocusLabel = useMemo(() => {
    if (selectedServiceUserKey) {
      return serviceUserNameByKey.get(selectedServiceUserKey) || "Selected service user";
    }
    if (showAllWorkers) return "All workers";
    return selectedCareWorker?.workerName || "No worker selected";
  }, [selectedCareWorker?.workerName, selectedServiceUserKey, serviceUserNameByKey, showAllWorkers]);

  const routeFocusSummary = useMemo(() => {
    const templatedCount = routeEntriesSorted.filter((entry) => entry.isTemplated).length;
    const timeCriticalCount = routeEntriesSorted.filter((entry) => entry.isTimeCritical).length;
    const recommendedCount = routeEntriesSorted.filter((entry) => {
      if (!entry.serviceUserKey || !entry.callTypeLabel) return false;
      return recommendedTimeLookup.has(
        buildRecommendationKey(entry.serviceUserKey, entry.callTypeLabel)
      );
    }).length;
    return {
      totalCalls: routeEntriesSorted.length,
      templatedCount,
      timeCriticalCount,
      recommendedCount,
    };
  }, [recommendedTimeLookup, routeEntriesSorted]);

  const selectedTimelineEntry = useMemo<TimelineEntry | null>(() => {
    if (!selectedTimelineEntryId) return null;
    return mapEntries.find((entry) => entry.id === selectedTimelineEntryId) ?? null;
  }, [mapEntries, selectedTimelineEntryId]);

  const selectedEntryRecommendedTime = useMemo(() => {
    if (!selectedTimelineEntry?.serviceUserKey || !selectedTimelineEntry?.callTypeLabel) return null;
    return (
      recommendedTimeLookup.get(
        buildRecommendationKey(selectedTimelineEntry.serviceUserKey, selectedTimelineEntry.callTypeLabel)
      ) ??
      null
    );
  }, [recommendedTimeLookup, selectedTimelineEntry]);

  const selectedEntryDeltaMinutes = useMemo(() => {
    if (!selectedTimelineEntry || !selectedEntryRecommendedTime) return null;
    return selectedTimelineEntry.startMinutes - selectedEntryRecommendedTime.recommendedStartMinutes;
  }, [selectedEntryRecommendedTime, selectedTimelineEntry]);

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

  const scheduleChangeStats = useMemo(() => {
    const overrideValues = Object.values(rosterState.present.timeOverrides);
    const deletedCount = overrideValues.filter((value) => value <= -9000).length;
    const timeShiftCount = Math.max(0, overrideValues.length - deletedCount);
    const laneOverrideCount = Object.keys(rosterState.present.laneOverrides).length;
    const totalChanges = timeShiftCount + laneOverrideCount + deletedCount;
    return {
      timeShiftCount,
      laneOverrideCount,
      deletedCount,
      totalChanges,
    };
  }, [rosterState.present.laneOverrides, rosterState.present.timeOverrides]);

  const hasRosterChanges = scheduleChangeStats.totalChanges > 0;

  const focusRoutePlanner = useCallback((tab: typeof studioTab = "map") => {
    setStudioTab(tab);
    requestAnimationFrame(() => {
      routePlannerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const applyOverrides = useCallback((updates: Record<string, number>, laneUpdates?: Record<string, string>) => {
    dispatchRoster({
      type: "APPLY_OPTIMIZATION",
      timeOverrides: updates,
      laneOverrides: laneUpdates,
    });
  }, []);

  const applyLockedOverrides = useCallback(
    (
      updates: Record<string, number>,
      laneUpdates?: Record<string, string>
    ): { timeOverrides: Record<string, number>; laneOverrides?: Record<string, string> } => {
      const timeOverrides = { ...updates };
      const laneOverrides = laneUpdates ? { ...laneUpdates } : undefined;
      const entryById = new Map(mapEntries.map((entry) => [entry.id, entry]));

      entryById.forEach((entry) => {
        if (!entry.isTemplated) return;
        if (timeOverrides[entry.id] !== undefined) {
          const baseStart =
            typeof entry.requiredStartMinutes === "number" ? entry.requiredStartMinutes : entry.startMinutes;
          if (timeOverrides[entry.id] !== baseStart) {
            delete timeOverrides[entry.id];
          }
        }
        if (laneOverrides && laneOverrides[entry.id]) {
          delete laneOverrides[entry.id];
        }
      });

      const doubleUpGroups = new Map<string, string[]>();
      entryById.forEach((entry) => {
        if (!entry.serviceUserKey) return;
        const baseStart =
          typeof entry.requiredStartMinutes === "number" ? entry.requiredStartMinutes : entry.startMinutes;
        if (!Number.isFinite(baseStart)) return;
        const slotKey = `${entry.serviceUserKey}|${selectedTemplateDate.dateKey}|${Math.round(baseStart)}`;
        if (!doubleUpSlots.has(slotKey)) return;
        const existing = doubleUpGroups.get(slotKey) ?? [];
        existing.push(entry.id);
        doubleUpGroups.set(slotKey, existing);
      });

      doubleUpGroups.forEach((entryIds) => {
        const entry = entryById.get(entryIds[0]);
        if (!entry) return;
        const lockedStart =
          typeof entry.requiredStartMinutes === "number" ? entry.requiredStartMinutes : entry.startMinutes;
        entryIds.forEach((entryId) => {
          timeOverrides[entryId] = lockedStart;
        });
      });

      return { timeOverrides, laneOverrides };
    },
    [doubleUpSlots, mapEntries, selectedTemplateDate.dateKey]
  );

  const buildPackedOverrides = useCallback(
    (entries: TimelineEntry[], bufferMinutes: number) => {
      const sorted = [...entries]
        .filter((entry) => Number.isFinite(entry.startMinutes))
        .filter((entry) => entry.startMinutes > -9000)
        .sort((a, b) => a.startMinutes - b.startMinutes);
      const updates: Record<string, number> = {};
      let cursor = ROSTER_DAY_START_MINUTES;
      sorted.forEach((entry) => {
        const baseStart = entry.startMinutes;
        const duration = Math.max(0, entry.durationMinutes);
        const isTimeCritical = Boolean(entry.isTimeCritical);
        let nextStart = isTimeCritical ? baseStart : Math.max(cursor, baseStart);
        if (nextStart < ROSTER_DAY_START_MINUTES) nextStart = ROSTER_DAY_START_MINUTES;
        if (nextStart > ROSTER_DAY_HARD_END_MINUTES - duration) {
          nextStart = Math.max(ROSTER_DAY_START_MINUTES, ROSTER_DAY_HARD_END_MINUTES - duration);
        }
        if (nextStart !== entry.startMinutes) {
          updates[entry.id] = nextStart;
        }
        cursor = Math.max(cursor, nextStart + duration + bufferMinutes);
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
      const entry = entryLookup.get(entryId);
      if (entry?.isTemplated) {
        toast({
          title: "Templated call locked",
          description: "Templated calls cannot be reassigned to another worker.",
          variant: "destructive",
        });
        return;
      }
      dispatchRoster({ type: "REASSIGN_ENTRY", entryId, targetLaneId });
      toast({
        title: "Entry reassigned",
        description: "The visit was moved to the selected worker lane.",
      });
    },
    [entryLookup, toast]
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
      const entry = entryLookup.get(entryId);
      const tolerance = TIME_CRITICAL_WINDOW_MINUTES;
      let adjustedStart = newStartMinutes;
      if (
        enforceTimeCriticalWindow &&
        entry?.isTimeCritical &&
        typeof entry.requiredStartMinutes === "number"
      ) {
        adjustedStart = Math.min(
          entry.requiredStartMinutes + tolerance,
          Math.max(entry.requiredStartMinutes - tolerance, newStartMinutes)
        );
      }
      const shouldReassign = newLaneId && !entry?.isTemplated;

      if (shouldReassign) {
        dispatchRoster({
          type: "MOVE_AND_REASSIGN_ENTRY",
          entryId,
          startMinutes: adjustedStart,
          targetLaneId: newLaneId,
        });
      } else {
        dispatchRoster({
          type: "MOVE_ENTRY",
          entryId,
          startMinutes: adjustedStart,
        });
      }
    },
    [entryLookup, enforceTimeCriticalWindow]
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
        setSelectedServiceUserKey(entry.serviceUserKey || null);
        if (mode !== "hub") {
          focusRoutePlanner("map");
        }
      }
    },
    [allEntryIdsOrdered, focusRoutePlanner, mode, rosterState.present.focusedEntryId]
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

      const movableIds = selectedIds.filter((entryId) => !entryLookup.get(entryId)?.isTemplated);
      const skipped = selectedIds.length - movableIds.length;
      if (movableIds.length === 0) {
        toast({
          title: "Templated calls locked",
          description: "Selected calls are templated and cannot be reassigned.",
          variant: "destructive",
        });
        return;
      }

      dispatchRoster({
        type: "BULK_REASSIGN_ENTRIES",
        reassignments: movableIds.map((entryId) => ({ entryId, targetLaneId })),
      });
      dispatchRoster({ type: "CLEAR_SELECTION" });
      toast({
        title: "Entries reassigned",
        description: skipped
          ? `${movableIds.length} visit(s) moved. ${skipped} templated call(s) stayed locked.`
          : `${movableIds.length} visit(s) moved to new worker.`,
      });
    },
    [entryLookup, rosterState.present.selectedEntryIds, toast]
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
            weeklyTotals,
          }
        );
        
        const lockedOverrides = applyLockedOverrides(result.timeOverrides, result.laneOverrides);
        applyOverrides(lockedOverrides.timeOverrides, lockedOverrides.laneOverrides);
        
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
  }, [timelineLanes, optimizationWeights, optimizationConstraints, recommendedCallTimes, workerTemplates, workerConstraints, weeklyTotals, applyLockedOverrides, applyOverrides, toast]);

  const handleAutoBalance = useCallback(() => {
    const updates: Record<string, number> = {};
    const laneOverrides: Record<string, string> = {};
    const lanesCopy = timelineLanes.map((lane) => ({
      id: lane.id,
      entries: [...lane.entries],
    }));
    const packingBufferMinutes = packCallsBackToBack ? 0 : 5;

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
      const entries = enforceTimeCriticalWindow
        ? lane.entries
        : lane.entries.map((entry) => ({ ...entry, isTimeCritical: false }));
      Object.assign(updates, buildPackedOverrides(entries, packingBufferMinutes));
    });

    const lockedOverrides = applyLockedOverrides(updates, laneOverrides);
    applyOverrides(lockedOverrides.timeOverrides, lockedOverrides.laneOverrides);
    toast({
      title: "Workload balanced",
      description: "Visits were redistributed to balance workload and reduce gaps.",
    });
  }, [applyLockedOverrides, applyOverrides, buildLaneDurationMap, buildPackedOverrides, enforceTimeCriticalWindow, packCallsBackToBack, timelineLanes, toast]);

  const handleOptimizeTravel = useCallback(() => {
    const updates: Record<string, number> = {};
    const bufferMinutes = packCallsBackToBack ? 0 : 10;
    timelineLanes.forEach((lane) => {
      const entries = enforceTimeCriticalWindow
        ? lane.entries
        : lane.entries.map((entry) => ({ ...entry, isTimeCritical: false }));
      Object.assign(updates, buildPackedOverrides(entries, bufferMinutes));
    });
    const lockedOverrides = applyLockedOverrides(updates);
    applyOverrides(lockedOverrides.timeOverrides, lockedOverrides.laneOverrides);
    toast({
      title: "Travel gaps optimized",
      description: packCallsBackToBack
        ? "Packed visits back-to-back to minimize gaps."
        : "Inserted buffer between visits to improve travel flow.",
    });
  }, [applyLockedOverrides, applyOverrides, buildPackedOverrides, enforceTimeCriticalWindow, packCallsBackToBack, timelineLanes, toast]);

  const handleApplyRecommendedTimes = useCallback(() => {
    const updates: Record<string, number> = {};
    let applied = 0;
    let skipped = 0;
    timelineLanes.forEach((lane) => {
      lane.entries.forEach((entry) => {
        if (!entry.serviceUserKey || !entry.callTypeLabel) {
          skipped += 1;
          return;
        }
        const recommended = recommendedTimeLookup.get(
          buildRecommendationKey(entry.serviceUserKey, entry.callTypeLabel)
        );
        if (!recommended) {
          skipped += 1;
          return;
        }
        let nextStart = recommended.recommendedStartMinutes;
        if (
          enforceTimeCriticalWindow &&
          entry.isTimeCritical &&
          typeof entry.requiredStartMinutes === "number"
        ) {
          const tolerance = TIME_CRITICAL_WINDOW_MINUTES;
          nextStart = Math.min(
            entry.requiredStartMinutes + tolerance,
            Math.max(entry.requiredStartMinutes - tolerance, nextStart)
          );
        }
        updates[entry.id] = nextStart;
        applied += 1;
      });
    });
    if (applied === 0) {
      toast({
        title: "No recommended times applied",
        description: "No matching recommended times were found for the current view.",
      });
      return;
    }
    const lockedOverrides = applyLockedOverrides(updates);
    applyOverrides(lockedOverrides.timeOverrides, lockedOverrides.laneOverrides);
    toast({
      title: "Recommended times applied",
      description: skipped
        ? `Updated ${applied} visit(s). ${skipped} visit(s) had no matching recommendation.`
        : `Updated ${applied} visit(s) to recommended start times.`,
    });
  }, [applyLockedOverrides, applyOverrides, enforceTimeCriticalWindow, recommendedTimeLookup, timelineLanes, toast]);

  // Available template groups (those that have rows on the selected template day)
  const availableTemplateGroups = useMemo(() => {
    return selectedWorkerCallGroups.filter((g) => g.templatedWeekdayKeys.has(templateSelectionKey));
  }, [selectedWorkerCallGroups, templateSelectionKey]);

  useEffect(() => {
    if (!selectedCareWorker) {
      setSelectedWorkerCallKeys([]);
      return;
    }
    setSelectedWorkerCallKeys(availableTemplateGroups.map((group) => group.key));
  }, [availableTemplateGroups, selectedCareWorker]);

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

  const handleResetScheduleChanges = useCallback(() => {
    if (!hasRosterChanges) return;
    const confirmed = window.confirm(
      "Reset all schedule changes? This will clear time adjustments, reassignments, and deletions."
    );
    if (!confirmed) return;
    dispatchRoster({ type: "RESET" });
    setSelectedTimelineEntryId(null);
    toast({
      title: "Schedule reset",
      description: "All schedule overrides have been cleared.",
    });
  }, [dispatchRoster, hasRosterChanges, toast]);

  const handleExportPdf = useCallback(() => {
    if (timelineLanes.length === 0) {
      toast({
        title: "Nothing to export",
        description: "Load a workbook to export the schedule.",
      });
      return;
    }

    const rows: Array<string[]> = [];
    timelineLanes.forEach((lane) => {
      const orderedEntries = [...lane.entries]
        .filter((entry) => entry.startMinutes >= ROSTER_DAY_START_MINUTES)
        .filter((entry) => entry.startMinutes <= ROSTER_DAY_HARD_END_MINUTES)
        .sort((a, b) => a.startMinutes - b.startMinutes);

      orderedEntries.forEach((entry) => {
        rows.push([
          lane.label,
          entry.serviceUserName || entry.title || "Unknown",
          entry.callTypeLabel || "-",
          formatMinutesToTime(entry.startMinutes),
          formatMinutesDisplay(entry.durationMinutes),
          entry.isTimeCritical ? "Yes" : "No",
          entry.isDoubleUp ? "Yes" : "No",
          entry.address || "",
        ]);
      });
    });

    if (rows.length === 0) {
      toast({
        title: "No visible visits",
        description: "There are no scheduled visits in the current view.",
      });
      return;
    }

    const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFontSize(18);
    doc.text("Rostering Schedule", pageWidth / 2, 40, { align: "center" });
    doc.setFontSize(10);
    doc.setTextColor(90);
    doc.text(
      `${selectedTemplateWeekLabel} • ${selectedTemplateDay} (${selectedTemplateDate.dateLabel})`,
      pageWidth / 2,
      58,
      { align: "center" }
    );
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, 72, { align: "center" });
    doc.setTextColor(0);

    autoTable(doc, {
      startY: 90,
      head: [["Worker", "Service User", "Call Type", "Start", "Duration", "Time Critical", "Double-Up", "Address"]],
      body: rows,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [15, 23, 42], textColor: 255 },
      margin: { left: 30, right: 30 },
      columnStyles: {
        0: { cellWidth: 120 },
        1: { cellWidth: 140 },
        2: { cellWidth: 110 },
        3: { cellWidth: 55 },
        4: { cellWidth: 70 },
        5: { cellWidth: 70 },
        6: { cellWidth: 60 },
      },
    });

    const dateStamp = new Date().toISOString().slice(0, 10);
    const fileName = sanitizeFileName(
      `roster-${selectedTemplateDay}-${selectedTemplateWeekLabel}-${selectedTemplateDate.dateLabel}-${dateStamp}`
    );
    doc.save(`${fileName}.pdf`);
    toast({
      title: "Schedule exported",
      description: "The PDF report has been downloaded.",
    });
  }, [selectedTemplateDate.dateLabel, selectedTemplateDay, selectedTemplateWeekLabel, timelineLanes, toast]);

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
      { type: "workload" as const, count: constraintViolations.size },
    ];
  }, [timelineConflictCount, constraintViolations]);

  // Keyboard shortcuts
  const keyboardShortcuts = useMemo(() => buildRosteringShortcuts({
    onClearSelection: () => setSelectedTimelineEntryId(null),
    onOptimize: handleOptimizeTravel,
    onZoomIn: handleTimelineZoomIn,
    onZoomOut: handleTimelineZoomOut,
    onUndo: handleUndo,
    onRedo: handleRedo,
  }), [handleOptimizeTravel, handleTimelineZoomIn, handleTimelineZoomOut, handleUndo, handleRedo]);

  const shortcutHelp = useMemo(() => {
    const grouped = new Map<string, string[]>();
    keyboardShortcuts.forEach((shortcut) => {
      if (!shortcut.description) return;
      const label = formatShortcutKey(shortcut).replace("ESCAPE", "ESC");
      const existing = grouped.get(shortcut.description) ?? [];
      if (!existing.includes(label)) {
        existing.push(label);
        grouped.set(shortcut.description, existing);
      }
    });
    return Array.from(grouped.entries()).map(([description, keys]) => ({
      description,
      keys: keys.join(" / "),
    }));
  }, [keyboardShortcuts]);

  useRosteringKeyboardShortcuts(keyboardShortcuts, !!workbook);

  const HUB_EMPLOYEE_ROW_HEIGHT = 52;

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

  const hubFilters = (
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {hubTab === "rostering" && (
          <>
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Week</p>
              <Select value={selectedTemplateWeek} onValueChange={(value) => setSelectedTemplateWeek(value as TemplateWeekKey)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATE_WEEK_OPTIONS.map((week) => (
                    <SelectItem key={week.key} value={week.key}>
                      {getTemplateWeekLabel(week.key, templateWeekReferenceDayNumber)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Day</p>
              <Select value={selectedTemplateDay} onValueChange={(value) => setSelectedTemplateDay(value as WeekdayLabel)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAY_OPTIONS.map((day) => (
                    <SelectItem key={day} value={day}>
                      {day}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Call type</p>
              <Select value={callTypeFilter} onValueChange={setCallTypeFilter}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {uniqueCallTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Service user</p>
              <Input
                value={serviceUserSearch}
                onChange={(event) => setServiceUserSearch(event.target.value)}
                placeholder="Search service users..."
                className="h-8 text-xs"
              />
            </div>
          </>
        )}

        {hubTab === "service-user" && (
          <>
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Area</p>
              <Select value={serviceUserAreaFilter} onValueChange={setServiceUserAreaFilter}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {serviceUserAreaOptions.map((area) => (
                    <SelectItem key={area} value={area}>
                      {area}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Call type</p>
              <Select value={callTypeFilter} onValueChange={setCallTypeFilter}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {uniqueCallTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Search</p>
              <Input
                value={serviceUserSearch}
                onChange={(event) => setServiceUserSearch(event.target.value)}
                placeholder="Search by name or call type..."
                className="h-8 text-xs"
              />
            </div>
          </>
        )}

        {hubTab === "employee" && (
          <>
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Type</p>
              <Select value="all" onValueChange={() => {}}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Role</p>
              <Select value="all" onValueChange={() => {}}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Agency</p>
              <Select value="all" onValueChange={() => {}}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Name</p>
              <Input
                value={careWorkerSearch}
                onChange={(event) => setCareWorkerSearch(event.target.value)}
                placeholder="Search employees..."
                className="h-8 text-xs"
              />
            </div>
          </>
        )}

        {hubTab === "search" && (
          <div className="space-y-1 md:col-span-2 xl:col-span-4">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Search</p>
            <Input
              value={serviceUserSearch}
              onChange={(event) => setServiceUserSearch(event.target.value)}
              placeholder="Search service users, employees, or call types..."
              className="h-8 text-xs"
            />
          </div>
        )}

        {hubTab === "optimize" && (
          <div className="space-y-1 md:col-span-2 xl:col-span-4">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Optimization controls</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="default"
                onClick={handleRunOptimization}
                disabled={isOptimizing}
              >
                <Zap className="h-3.5 w-3.5 mr-1.5" />
                Optimize rota
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={handleOptimizeTravel}>
                Optimize travel
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={handleAutoBalance}>
                Balance workload
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleApplyRecommendedTimes}
                disabled={callTimesForEditor.length === 0}
              >
                Apply recommendations
              </Button>
            </div>
          </div>
        )}
      </div>
    );

  const hubToolbar = (
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide">Snap</span>
          <Select value={String(snapMinutes)} onValueChange={(value) => setSnapMinutes(Number(value))}>
            <SelectTrigger className="h-8 w-[90px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[5, 10, 15, 30].map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {value} mins
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="hub-half-hour"
            checked={showHalfHourTicks}
            onCheckedChange={setShowHalfHourTicks}
          />
          <label htmlFor="hub-half-hour" className="text-xs font-medium">
            30‑minute ticks
          </label>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide">Zoom</span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={handleTimelineZoomOut}
              disabled={timelineZoomIndex === 0}
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleTimelineZoomReset}
              className="h-8 px-2 text-[11px]"
            >
              {timelineZoom}%
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={handleTimelineZoomIn}
              disabled={timelineZoomIndex === TIMELINE_ZOOM_LEVELS.length - 1}
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={handleUndo} disabled={!canUndo(rosterState)}>
            <Undo2 className="h-3.5 w-3.5 mr-1" />
            Undo
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={handleRedo} disabled={!canRedo(rosterState)}>
            <Redo2 className="h-3.5 w-3.5 mr-1" />
            Redo
          </Button>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            refetchWorkbooks();
            refetchWorkbook();
          }}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          Refresh
        </Button>
      </div>
    );

  const hubHeader = (
      <div className="rounded-xl border border-border/60 bg-background">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 bg-muted/20 px-4 py-1.5">
          <Tabs value={hubTab} onValueChange={(value) => setHubTab(value as typeof hubTab)}>
            <TabsList className="bg-transparent p-0 flex flex-wrap gap-1">
              <TabsTrigger value="rostering">Rostering</TabsTrigger>
              <TabsTrigger value="service-user">Service User</TabsTrigger>
              <TabsTrigger value="employee">Employee</TabsTrigger>
              <TabsTrigger value="search">Search</TabsTrigger>
              <TabsTrigger value="optimize">Optimize</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Member</span>
              <Select value={hubMemberView} onValueChange={(value) => setHubMemberView(value as typeof hubMemberView)}>
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="service-users">Service users</SelectItem>
                  <SelectItem value="employees">Employees</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Badge variant="outline" className="text-[10px]">
                {selectedTemplateWeekLabel}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {selectedTemplateDay}
              </Badge>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => setIsHubSidebarCollapsed((prev) => !prev)}
            >
              {isHubSidebarCollapsed ? (
                <>
                  <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                  Show panel
                </>
              ) : (
                <>
                  <ChevronRight className="h-3.5 w-3.5 mr-1" />
                  Hide panel
                </>
              )}
            </Button>
          </div>
        </div>
        <div className="px-4 py-2">{hubFilters}</div>
        <div className="border-t border-border/50 px-4 py-1.5">{hubToolbar}</div>
      </div>
    );

  const showServiceUsers = hubMemberView === "service-users";
  const showEmployees = hubMemberView === "employees";

  const hubMain =
      !selectedWorkbookId ? (
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <Card className="p-10 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold">No data available</h3>
            <p className="text-muted-foreground mt-2">
              Upload data in Testing Features to generate rostering schedules.
            </p>
            <Button variant="outline" className="mt-4" asChild>
              <Link href="/testing-features">Go to Testing Features</Link>
            </Button>
          </Card>
        </div>
      ) : workbookLoading ? (
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <Card className="p-10 text-center">
            <Loader2 className="h-8 w-8 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Loading workbook data...</p>
          </Card>
        </div>
      ) : !workbook ? (
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <Card className="p-10 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h3 className="text-lg font-semibold">Workbook Not Found</h3>
            <p className="text-muted-foreground mt-2">
              The selected workbook could not be loaded.
            </p>
          </Card>
        </div>
      ) : careWorkerRosters.length === 0 ? (
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <Card className="p-10 text-center">
            <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold">No Care Worker Data</h3>
            <p className="text-muted-foreground mt-2">
              This workbook does not contain any care worker roster data.
            </p>
          </Card>
        </div>
      ) : (
        <div
          className={`flex-1 min-h-0 grid gap-3 ${
            isHubSidebarCollapsed
              ? "grid-cols-1"
              : "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]"
          }`}
        >
          <div className={`grid min-h-0 gap-3 ${showServiceUsers && showEmployees ? "grid-rows-[minmax(0,1.2fr)_minmax(0,0.9fr)]" : "grid-rows-1"}`}>
            {showServiceUsers && (
              <div className="flex min-h-0 flex-col rounded-xl border border-border/60 bg-background">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 bg-muted/20 px-3 py-2">
                  <div className="text-xs font-semibold">Service Users</div>
                  <div className="text-[11px] text-muted-foreground">
                    {selectedTemplateDay} {selectedTemplateDate.dateLabel} · Total {selectedDayMetrics.allocated + selectedDayMetrics.unallocated} visits · {formatMinutesDisplay(selectedDayMetrics.totalMinutes)}
                  </div>
                </div>
                <div className="flex-1 min-h-0">
                  <GanttTimeline
                    lanes={filteredServiceUserLanes}
                    startMinutes={ROSTER_DAY_START_MINUTES}
                    endMinutes={ROSTER_DAY_HARD_END_MINUTES}
                    snapMinutes={snapMinutes}
                    showHalfHourTicks={showHalfHourTicks}
                    rowHeight={timelineRowHeight}
                    fitHeight
                    showHeader={false}
                    selectedEntryId={selectedTimelineEntryId}
                    selectedEntryIds={rosterState.present.selectedEntryIds}
                    focusedEntryId={rosterState.present.focusedEntryId}
                    onSelectEntry={handleSelectEntry}
                    enableDrag={false}
                    recommendedTimes={callTimesForEditor}
                  />
                </div>
              </div>
            )}
            {showEmployees && (
              <div className="flex min-h-0 flex-col rounded-xl border border-border/60 bg-background">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 bg-muted/20 px-3 py-2">
                  <div className="text-xs font-semibold">Employees</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch
                      id="hub-show-all"
                      checked={showAllWorkers}
                      onCheckedChange={setShowAllWorkers}
                    />
                    <label htmlFor="hub-show-all" className="text-xs font-medium">
                      Show all workers
                    </label>
                  </div>
                </div>
                <div className="flex-1 min-h-0">
                  <GanttTimeline
                    lanes={hubTimelineLanes}
                    startMinutes={ROSTER_DAY_START_MINUTES}
                    endMinutes={ROSTER_DAY_HARD_END_MINUTES}
                    snapMinutes={snapMinutes}
                    showHalfHourTicks={showHalfHourTicks}
                    rowHeight={timelineRowHeight}
                    fitHeight
                    showHeader={false}
                    selectedEntryId={selectedTimelineEntryId}
                    selectedEntryIds={rosterState.present.selectedEntryIds}
                    focusedEntryId={rosterState.present.focusedEntryId}
                    onSelectEntry={handleSelectEntry}
                    onEntryMove={handleEntryMove}
                    recommendedTimes={callTimesForEditor}
                  />
                </div>
              </div>
            )}
          </div>
          {!isHubSidebarCollapsed && (
            <div className="flex min-h-0 flex-col gap-3">
              <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border/60 bg-background">
                <div className="border-b border-border/50 bg-muted/20 px-3 py-2 text-xs font-semibold">Week overview</div>
                <ScrollArea className="min-h-0 flex-1">
                  <div className="p-3 space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() =>
                                setSelectedTemplateWeek((prev) => (prev === "week1" ? "week2" : "week1"))
                              }
                              aria-label="Previous week"
                            >
                              <ChevronLeft className="h-3.5 w-3.5" />
                            </Button>
                          <span className="font-semibold">
                            {getTemplateWeekLabel(selectedTemplateWeek, templateWeekReferenceDayNumber)}
                          </span>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() =>
                                setSelectedTemplateWeek((prev) => (prev === "week1" ? "week2" : "week1"))
                              }
                              aria-label="Next week"
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                        <Badge variant="secondary" className="text-[10px]">
                          Selected
                        </Badge>
                      </div>
                      <div className="grid grid-cols-4 text-[10px] uppercase tracking-wide text-muted-foreground">
                        <span>Day</span>
                        <span className="text-center">Total</span>
                        <span className="text-center">Templated</span>
                        <span className="text-center">Not templated</span>
                      </div>
                      <div className="rounded-lg border border-border/60 overflow-hidden">
                        <div className="divide-y divide-border/50">
                          {weeklyOverviewRows[selectedTemplateWeek].map((day) => {
                            const isSelected = selectedTemplateDay === day.day;
                            return (
                              <button
                                key={`${selectedTemplateWeek}-${day.dateKey}`}
                                type="button"
                                onClick={() => {
                                  setSelectedTemplateWeek(selectedTemplateWeek);
                                  setSelectedTemplateDay(day.day);
                                }}
                                className={`grid w-full grid-cols-4 px-2 py-1 text-[11px] transition ${
                                  isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted/30 text-foreground"
                                }`}
                              >
                                <span className="text-left">{day.day.slice(0, 3)}</span>
                                <span className="text-center">{day.total}</span>
                                <span className="text-center text-emerald-600">{day.templated}</span>
                                <span className="text-center text-rose-600">{day.nonTemplated}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </div>
              <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border/60 bg-background">
                <div className="border-b border-border/50 bg-muted/20 px-3 py-2 text-xs font-semibold">Employees</div>
                <div className="p-3 grid gap-2">
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Type</p>
                    <Select value="all" onValueChange={() => {}}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Name</p>
                    <Input
                      value={careWorkerSearch}
                      onChange={(event) => setCareWorkerSearch(event.target.value)}
                      placeholder="Search for name..."
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
                <div className="min-h-0 flex-1">
                  <ScrollArea className="h-full w-full">
                    <div className="divide-y divide-border/50">
                      {visibleCareWorkerRosters.map((worker) => {
                        const summary = workerSummaryByKey.get(worker.key);
                        return (
                          <button
                            key={worker.key}
                            type="button"
                            style={{ height: HUB_EMPLOYEE_ROW_HEIGHT }}
                            onClick={() => {
                              openWorkerTools(worker.key);
                            }}
                            title="Open worker tools"
                            className={`w-full flex items-start gap-3 px-3 py-2 text-left transition ${
                              worker.key === selectedCareWorkerKey ? "bg-primary/10" : "hover:bg-muted/30"
                            }`}
                          >
                            <WorkerAvatar name={worker.workerName} size="sm" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold truncate">{worker.workerName}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {summary ? `${summary.totalCalls} calls · ${formatMinutesDisplay(summary.totalDurationMinutes)}` : "No rota data"}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Rostered vs unrostered</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-md border border-border/60 bg-background/80 p-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Rostered</p>
                      <div className="mt-1 flex items-center justify-between">
                        <span>Templated</span>
                        <span className="font-semibold">{selectedDayTemplateStats?.rosteredTemplated ?? 0}</span>
                      </div>
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>Not templated</span>
                        <span className="font-semibold">{selectedDayTemplateStats?.rosteredNonTemplated ?? 0}</span>
                      </div>
                    </div>
                    <div className="rounded-md border border-border/60 bg-background/80 p-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Unrostered</p>
                      <div className="mt-1 flex items-center justify-between">
                        <span>Templated</span>
                        <span className="font-semibold">{selectedDayTemplateStats?.unrosteredTemplated ?? 0}</span>
                      </div>
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>Not templated</span>
                        <span className="font-semibold">{selectedDayTemplateStats?.unrosteredNonTemplated ?? 0}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      );

  const hubSection = (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      {hubHeader}
      {hubMain}
    </div>
  );

  const containerClass = embedded
    ? "flex min-h-0 flex-col gap-6"
    : "relative flex w-full flex-1 min-h-0 flex-col px-4 py-6 lg:px-10";

  return (
    <div className={containerClass}>
      <div className={`flex min-h-0 flex-1 flex-col ${embedded ? "gap-4" : "gap-6"}`}>
        <div className="flex min-h-0 flex-[0.9] flex-col">
          {hubSection}
        </div>
        <div className="flex min-h-0 flex-[1.1] flex-col overflow-hidden rounded-2xl border border-border/60 bg-background/70 shadow-soft">
          <div className="px-4 pt-4 lg:px-6 lg:pt-6">
            {/* Header */}
            <div className={`${embedded ? "mb-4" : "mb-6"} ${embedded ? "" : "flex-shrink-0"}`}>
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
                    Rostering <span className="text-foreground">Studio</span>
                  </h1>
                  <p className="text-muted-foreground mt-2 max-w-2xl">
                    Use saved rostering analysis data to build optimized care worker schedules with time-critical safeguards and double-up call synchronization.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      refetchWorkbooks();
                      refetchWorkbook();
                    }}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportPdf}
                    disabled={!workbook || timelineLanes.length === 0}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export PDF
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 px-4 pb-4 lg:px-6 lg:pb-6">
            <div className={`${embedded ? "" : "flex-1 min-h-0"}`}>
              <div className="grid gap-6 lg:grid-cols-[320px,1fr] h-full">
          {/* Studio sidebar */}
          <ScrollArea className="h-full pr-2">
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
              ) : (
                <div className="text-xs text-muted-foreground">
                  {rotas.length} saved rotas available.
                </div>
              )}
            </CardContent>
          </Card>

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
                  {workerConstraints.map((c: WorkerConstraintSummary) => (
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
                        {c.maxCallsPerWeek && (
                          <Badge variant="outline" className="text-[9px]">
                            Max {c.maxCallsPerWeek} calls/week
                          </Badge>
                        )}
                        {c.maxMinutesPerWeek && (
                          <Badge variant="outline" className="text-[9px]">
                            Max {Math.round(c.maxMinutesPerWeek / 60)}h/week
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  The optimizer will respect these limits for the selected template week.
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
          </ScrollArea>

          {/* Main content */}
          <ScrollArea className="h-full pr-2">
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
              {/* Rostering overview */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <Card className="border-border/60 bg-background/70 shadow-soft">
                  <CardContent className="pt-4">
                    <p className="text-xs uppercase text-muted-foreground">Care Workers</p>
                    <p className="text-2xl font-bold">{overviewStats.totalWorkers}</p>
                  </CardContent>
                </Card>
                <Card className="border-border/60 bg-background/70 shadow-soft">
                  <CardContent className="pt-4">
                    <p className="text-xs uppercase text-muted-foreground">Service Users</p>
                    <p className="text-2xl font-bold">{overviewStats.totalServiceUsers}</p>
                  </CardContent>
                </Card>
                <Card className="border-border/60 bg-background/70 shadow-soft">
                  <CardContent className="pt-4">
                    <p className="text-xs uppercase text-muted-foreground">Call Groups</p>
                    <p className="text-2xl font-bold">{overviewStats.totalCallGroups}</p>
                  </CardContent>
                </Card>
                <Card className="border-border/60 bg-background/70 shadow-soft">
                  <CardContent className="pt-4">
                    <p className="text-xs uppercase text-muted-foreground">Total Calls</p>
                    <p className="text-2xl font-bold">{overviewStats.totalCalls}</p>
                  </CardContent>
                </Card>
                <Card className="border-border/60 bg-background/70 shadow-soft">
                  <CardContent className="pt-4">
                    <p className="text-xs uppercase text-muted-foreground">Total Hours</p>
                    <p className="text-2xl font-bold">{overviewStats.totalHours}</p>
                    <p className="text-[10px] text-muted-foreground">{utilizationStats.avgHours}h avg · {utilizationStats.avgCalls} calls avg</p>
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
                    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold">Schedule changes</p>
                        {hasRosterChanges ? (
                          <Badge variant="secondary" className="text-[10px]">
                            {scheduleChangeStats.totalChanges}
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">None</span>
                        )}
                      </div>
                      {hasRosterChanges && (
                        <div className="mt-2 grid grid-cols-2 gap-1 text-[10px]">
                          <span className="text-muted-foreground">Time shifts</span>
                          <span>{scheduleChangeStats.timeShiftCount}</span>
                          <span className="text-muted-foreground">Reassignments</span>
                          <span>{scheduleChangeStats.laneOverrideCount}</span>
                          {scheduleChangeStats.deletedCount > 0 && (
                            <>
                              <span className="text-muted-foreground">Removed</span>
                              <span>{scheduleChangeStats.deletedCount}</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="pt-2 border-t space-y-2">
                      <div className="flex items-center gap-2">
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
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={handleResetScheduleChanges}
                        disabled={!hasRosterChanges}
                        className="w-full"
                      >
                        Reset schedule changes
                      </Button>
                    </div>
                    <div className="pt-2 border-t">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
                        <Keyboard className="h-3 w-3" />
                        Keyboard shortcuts
                      </p>
                      <div className="grid grid-cols-2 gap-1 text-[10px]">
                        {shortcutHelp.slice(0, 6).map((item) => (
                          <div key={item.description} className="contents">
                            <span className="text-muted-foreground">{item.keys}</span>
                            <span>{item.description}</span>
                          </div>
                        ))}
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

              <Card ref={routePlannerRef} className="border-border/60 bg-background/70 shadow-medium">
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
                      <div className="mt-3 flex items-center gap-2">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          onClick={handleTimelineZoomOut}
                          disabled={timelineZoomIndex === 0}
                        >
                          <ZoomOut className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={handleTimelineZoomReset}
                          className="h-8 px-2 text-[11px]"
                        >
                          {timelineZoom}%
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          onClick={handleTimelineZoomIn}
                          disabled={timelineZoomIndex === TIMELINE_ZOOM_LEVELS.length - 1}
                        >
                          <ZoomIn className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-background/60 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Planner tips</p>
                      <p className="text-xs text-muted-foreground mt-2">Drag blocks to reschedule. Use the snap interval for precision.</p>
                    </div>
                  </div>
                  <Tabs value={studioTab} onValueChange={(value) => setStudioTab(value as typeof studioTab)}>
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
                        rowHeight={timelineRowHeight}
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
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold">Route focus</p>
                              <p className="text-xs text-muted-foreground">
                                {routeFocusLabel} • {routeFocusSummary.totalCalls} calls •{" "}
                                {routeFocusSummary.templatedCount} templated
                              </p>
                            </div>
                            {selectedServiceUserKey && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setSelectedServiceUserKey(null);
                                }}
                              >
                                Clear focus
                              </Button>
                            )}
                          </div>
                          <RouteMapView entries={routeEntriesSorted} />
                        </div>
                        <div className="flex min-h-0 flex-col rounded-2xl border border-border/60 bg-background/70">
                          <div className="border-b border-border/50 bg-muted/20 px-3 py-2">
                            <p className="text-xs font-semibold">Rota for day</p>
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              {selectedTemplateWeekLabel} • {selectedTemplateDay} • {selectedTemplateDate.dateLabel}
                            </p>
                          </div>
                          <div className="flex-1 min-h-0">
                            <ScrollArea className="h-full">
                              <div className="divide-y divide-border/50">
                                {routeEntriesSorted.length === 0 ? (
                                  <div className="px-3 py-6 text-xs text-muted-foreground">
                                    No calls in this view.
                                  </div>
                                ) : (
                                  routeEntriesSorted.map((entry) => (
                                    <div key={entry.id} className="px-3 py-2 text-xs">
                                      <div className="flex items-center justify-between">
                                        <span className="font-semibold">{formatTimeOfDay(entry.startMinutes)}</span>
                                        {entry.isTemplated ? (
                                          <Badge variant="secondary" className="text-[10px]">Templated</Badge>
                                        ) : (
                                          <Badge variant="outline" className="text-[10px]">Not templated</Badge>
                                        )}
                                      </div>
                                      <p className="mt-1 text-[11px] font-semibold">
                                        {entry.serviceUserName || entry.title}
                                      </p>
                                      <p className="text-[10px] text-muted-foreground">
                                        {entry.callTypeLabel || "Call"} • {formatMinutesDisplay(entry.durationMinutes)}
                                      </p>
                                    </div>
                                  ))
                                )}
                              </div>
                            </ScrollArea>
                          </div>
                          <div className="border-t border-border/50 px-3 py-3 space-y-2">
                            <div className="text-[10px] text-muted-foreground">
                              Recommendations available: {routeFocusSummary.recommendedCount}
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="default"
                              className="w-full"
                              onClick={handleRunOptimization}
                              disabled={isOptimizing}
                            >
                              <Zap className="h-3.5 w-3.5 mr-2" />
                              Optimize day route
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="w-full"
                              onClick={handleApplyRecommendedTimes}
                              disabled={callTimesForEditor.length === 0}
                            >
                              Apply recommendations
                            </Button>
                          </div>
                        </div>
                      </div>
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
                              Set maximum calls and hours per day or week for each care worker. Workers exceeding limits will be highlighted.
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
                          weeklyTotals={weeklyTotals}
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
                          weeklyTotals={weeklyTotals}
                          selectedWorkerKey={selectedCareWorkerKey}
                          onWorkerClick={(workerKey) => {
                            setSelectedCareWorkerKey(workerKey);
                            setShowAllWorkers(false);
                          }}
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
                            disabled={!hasRosterChanges}
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
                            {savedStates.map((state: SavedRosterStateSummary) => (
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
                            {selectedEntryRecommendedTime && (
                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <Clock4 className="h-3.5 w-3.5" />
                                <span>
                                  Recommended {formatMinutesToTime(selectedEntryRecommendedTime.recommendedStartMinutes)}
                                </span>
                                {selectedEntryRecommendedTime.toleranceMinutes ? (
                                  <Badge variant="outline" className="text-[10px]">
                                    +/-{selectedEntryRecommendedTime.toleranceMinutes}m
                                  </Badge>
                                ) : null}
                                {selectedEntryDeltaMinutes !== null && (
                                  <span className={selectedEntryDeltaMinutes === 0 ? "text-emerald-600" : ""}>
                                    {formatDeltaLabel(selectedEntryDeltaMinutes)}
                                  </span>
                                )}
                              </div>
                            )}
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
                          disabled={callTimesForEditor.length === 0}
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
                                  setSelectedServiceUserKey(null);
                                  focusRoutePlanner("map");
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
                                        {violation.overWeeklyCalls || violation.overWeeklyMinutes
                                          ? (violation.overCalls || violation.overMinutes
                                            ? "Over daily & weekly"
                                            : "Over weekly limit")
                                          : violation.overCalls && violation.overMinutes
                                            ? "Over daily limit"
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
                      <div className="rounded-xl border border-border/60 bg-background/60">
                        <div className="border-b border-border/50 bg-muted/20 px-3 py-2 text-xs font-semibold">
                          Service users (day view)
                        </div>
                        <div className="p-2">
                          <ScrollArea className="h-48">
                            <div className="space-y-1">
                              {filteredServiceUserLanes.length === 0 ? (
                                <div className="px-2 py-3 text-xs text-muted-foreground">
                                  No service users available for this day.
                                </div>
                              ) : (
                                filteredServiceUserLanes.map((lane) => {
                                  const laneKey = lane.entries.find((entry) => entry.serviceUserKey)?.serviceUserKey || null;
                                  return (
                                    <button
                                      key={lane.id}
                                      type="button"
                                      onClick={() => {
                                        setSelectedServiceUserKey(laneKey);
                                        focusRoutePlanner("map");
                                      }}
                                      className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-muted/30"
                                    >
                                      <span className="truncate font-medium">{lane.label}</span>
                                      <span className="text-[10px] text-muted-foreground">{lane.entries.length}</span>
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          </ScrollArea>
                        </div>
                      </div>
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
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Calendar className="h-3.5 w-3.5" />
                                <span>{selectedTemplateDate.dateLabel}</span>
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
                                    {getTemplateWeekLabel(option.key, templateWeekReferenceDayNumber)}
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
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            const key = group.serviceUserKey || group.normalizedServiceUserKey || null;
                                            setSelectedServiceUserKey(key);
                                            focusRoutePlanner("map");
                                          }}
                                          className="text-sm font-semibold text-left hover:text-primary transition-colors"
                                        >
                                          {group.serviceUserName || "Unknown service user"}
                                        </button>
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
          </ScrollArea>
        </div>
      </div>
    </div>
  </div>
</div>
</div>
  );
}
