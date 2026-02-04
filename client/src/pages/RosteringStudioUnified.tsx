/**
 * RosteringStudioUnified - A consolidated single-window view for all rostering features.
 * 
 * This component provides:
 * - Top menu bar with File, Edit, View, Optimize, Help dropdowns
 * - Stats bar showing key metrics
 * - Collapsible panels for all rostering features
 * - Resizable sidebar for worker list
 */

import { useCallback, useMemo, useReducer, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// UI Components
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

// Icons
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Clock4,
  Database,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  Keyboard,
  Layers,
  Loader2,
  Map as MapIcon,
  MapPin,
  Maximize2,
  Redo2,
  RefreshCw,
  Route,
  Save,
  Sliders,
  Table2,
  Timer,
  Trash2,
  Undo2,
  UserCog,
  Users,
  Zap,
  ZoomIn,
  ZoomOut,
  ArrowDownUp,
  AlertTriangle,
  Brain,
  Calculator,
  FileSpreadsheet,
  BookTemplate,
  GitCompare,
} from "lucide-react";

// Rostering Components
import { GanttTimeline } from "@/components/rostering/GanttTimeline";
import { RouteMapView } from "@/components/rostering/RouteMapView";
import { CallTypeChip } from "@/components/rostering/CallTypeChip";
import { WorkerAvatar } from "@/components/rostering/WorkerAvatar";
import { CallTimeEditor, type RecommendedCallTime } from "@/components/rostering/CallTimeEditor";
import { WorkloadHeatmap } from "@/components/rostering/WorkloadHeatmap";
import { WorkerConstraintsEditor, type WorkerConstraint as WorkerConstraintUI } from "@/components/rostering/WorkerConstraintsEditor";
import ScheduleAnalysisDashboard from "@/components/rostering/ScheduleAnalysisDashboard";
import ScheduleComparison from "@/components/rostering/ScheduleComparison";
import CostAnalysisDashboard from "@/components/rostering/CostAnalysisDashboard";
import ScheduleTemplateLibrary from "@/components/rostering/ScheduleTemplateLibrary";
import { buildAllWorkerLanes, buildWorkerSummaries, type TimelineEntry, type GanttLane } from "@/lib/rostering/rosterModel";
import { exportRosterToExcel, exportWorkerScheduleToExcel } from "@/lib/rostering/excelExport";
import { useRosteringKeyboardShortcuts, buildRosteringShortcuts, type KeyboardShortcut } from "@/hooks/useRosteringKeyboardShortcuts";
import {
  rosterHistoryReducer,
  createInitialHistoryState,
  applyOverridesToLanes,
  canUndo,
  canRedo,
  type RosterHistoryState,
} from "@/lib/rostering/rosterReducer";
import {
  OptimizationSettings,
  type OptimizationWeights,
  type OptimizationConstraints,
  defaultWeights,
  defaultConstraints,
} from "@/components/rostering/OptimizationSettings";
import AdminDatabasePanel from "@/components/rostering/AdminDatabasePanel";
import { runFullOptimization, type OptimizationResult } from "@/lib/rostering/optimizer";

// ===== CONSTANTS =====
const ROSTER_DAY_START_MINUTES = 6 * 60;
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
const DEFAULT_TEMPLATE_DAY: WeekdayLabel = "Monday";

// ===== TYPES =====
interface RowAnalysis {
  rowNumber: number;
  status: "clean" | "attention";
  data: Record<string, unknown>;
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
  callGroups: WorkerCallGroup[];
  careWorkerRosters: CareWorkerRoster[];
  doubleUpSlots: Record<string, string[]>;
  createdBy: string | null;
  createdByUsername: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SavedRosterStateSummary {
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

const formatTimeOfDay = (minutes: number | null | undefined): string => {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return "--:--";
  const normalized = Math.max(0, Math.min(24 * 60 - 1, minutes));
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const formatMinutesToTime = (minutes: number): string => {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const computeTemplateSelectionKey = (week: TemplateWeekKey, day: WeekdayLabel) => {
  return `${week}|${day}`;
};

const getTemplateWeekLabel = (week: TemplateWeekKey): string => {
  return week === "week1" ? "Week 1" : "Week 2";
};

// ===== PANEL VISIBILITY STATE =====
interface PanelVisibility {
  timeline: boolean;
  map: boolean;
  workers: boolean;
  details: boolean;
  callTimes: boolean;
  constraints: boolean;
  workload: boolean;
  optimization: boolean;
  database: boolean;
  aiAnalysis: boolean;
  comparison: boolean;
  costs: boolean;
  templates: boolean;
}

const defaultPanelVisibility: PanelVisibility = {
  timeline: true,
  map: true,
  workers: true,
  details: true,
  callTimes: false,
  constraints: false,
  workload: false,
  optimization: false,
  database: false,
  aiAnalysis: false,
  comparison: false,
  costs: false,
  templates: false,
};

// ===== MAIN COMPONENT =====
export default function RosteringStudioUnified({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Panel visibility state
  const [panelVisibility, setPanelVisibility] = useState<PanelVisibility>(defaultPanelVisibility);
  const togglePanel = useCallback((panel: keyof PanelVisibility) => {
    setPanelVisibility((prev) => ({ ...prev, [panel]: !prev[panel] }));
  }, []);

  // Core state
  const [selectedWorkbookId, setSelectedWorkbookId] = useState<string | null>(null);
  const [selectedCareWorkerKey, setSelectedCareWorkerKey] = useState<string>("");
  const [careWorkerSearch, setCareWorkerSearch] = useState("");

  // Template selection
  const [selectedTemplateWeek, setSelectedTemplateWeek] = useState<TemplateWeekKey>(DEFAULT_TEMPLATE_WEEK);
  const [selectedTemplateDay, setSelectedTemplateDay] = useState<WeekdayLabel>(DEFAULT_TEMPLATE_DAY);

  // Roster state with undo/redo
  const [rosterState, dispatchRoster] = useReducer(rosterHistoryReducer, undefined, createInitialHistoryState);

  // Timeline settings
  const [snapMinutes, setSnapMinutes] = useState(10);
  const [showHalfHourTicks, setShowHalfHourTicks] = useState(true);
  const [timelineZoomIndex, setTimelineZoomIndex] = useState(2);
  const [selectedTimelineEntryId, setSelectedTimelineEntryId] = useState<string | null>(null);
  const [showAllWorkers, setShowAllWorkers] = useState(true);
  const [showOnlyTemplated, setShowOnlyTemplated] = useState(false); // Show all calls by default
  const [workerFilter, setWorkerFilter] = useState<"all" | "over" | "under">("all");

  const WORKLOAD_OVER_MINUTES = 8 * 60;
  const WORKLOAD_UNDER_MINUTES = 4 * 60;

  // Optimization settings
  const [optimizationWeights, setOptimizationWeights] = useState<OptimizationWeights>(defaultWeights);
  const [optimizationConstraints, setOptimizationConstraints] = useState<OptimizationConstraints>(defaultConstraints);
  const [isOptimizing, setIsOptimizing] = useState(false);

  // Dialogs
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveScheduleName, setSaveScheduleName] = useState("");
  const [saveScheduleDescription, setSaveScheduleDescription] = useState("");
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);

  // Comparison data for before/after analysis
  const [savedComparisonData, setSavedComparisonData] = useState<any>(null);

  const timelineZoom = TIMELINE_ZOOM_LEVELS[timelineZoomIndex] ?? 100;
  const timelineRowHeight = useMemo(
    () => Math.round(BASE_TIMELINE_ROW_HEIGHT * (timelineZoom / 100)),
    [timelineZoom]
  );

  const templateSelectionKey = computeTemplateSelectionKey(selectedTemplateWeek, selectedTemplateDay);

  // ===== DATA QUERIES =====
  const { data: workbooksList = [], isLoading: workbooksLoading } = useQuery<WorkbookSummary[]>({
    queryKey: ["/api/admin/rostering/workbook-uploads"],
  });

  const activeWorkbookId = selectedWorkbookId || workbooksList[0]?.id || null;

  const { data: workbookData, isLoading: workbookLoading } = useQuery<WorkbookFull>({
    queryKey: ["/api/admin/rostering/workbook-uploads", activeWorkbookId],
    enabled: !!activeWorkbookId,
  });

  // Convert arrays to Sets for templatedWeekdayKeys and doubleUpWeekdayKeys
  const careWorkerRosters = useMemo<CareWorkerRoster[]>(() => {
    if (!workbookData?.careWorkerRosters) return [];
    // Reconstruct Sets from arrays (JSON doesn't preserve Sets)
    return workbookData.careWorkerRosters.map((roster: CareWorkerRoster) => ({
      ...roster,
      callGroups: roster.callGroups?.map((group: WorkerCallGroup & { templatedWeekdayKeys?: string[] | Set<string>; doubleUpWeekdayKeys?: string[] | Set<string> }) => ({
        ...group,
        templatedWeekdayKeys: new Set<string>(Array.isArray(group.templatedWeekdayKeys) ? group.templatedWeekdayKeys : []),
        doubleUpWeekdayKeys: new Set<string>(Array.isArray(group.doubleUpWeekdayKeys) ? group.doubleUpWeekdayKeys : []),
      })) || [],
    }));
  }, [workbookData]);

  const doubleUpSlots = useMemo((): Map<string, string[]> => {
    const entries: [string, string[]][] = Object.entries(workbookData?.doubleUpSlots ?? {});
    return new Map(entries);
  }, [workbookData]);

  // Call times
  const { data: callTimesRaw = [] } = useQuery<RecommendedCallTime[]>({
    queryKey: ["/api/admin/rostering/workbooks", activeWorkbookId, "call-times"],
    enabled: !!activeWorkbookId,
  });
  const callTimesForEditor = useMemo(() => callTimesRaw, [callTimesRaw]);

  // Constraints
  const { data: constraintsRaw = [] } = useQuery<WorkerConstraintUI[]>({
    queryKey: ["/api/admin/rostering/workbooks", activeWorkbookId, "worker-constraints"],
    enabled: !!activeWorkbookId,
  });
  const constraintsForEditor = useMemo(() => constraintsRaw, [constraintsRaw]);

  // Saved states
  const { data: savedStates = [] } = useQuery<SavedRosterStateSummary[]>({
    queryKey: ["/api/admin/rostering/workbooks", activeWorkbookId, "saved-states"],
    enabled: !!activeWorkbookId,
  });

  // ===== COMPUTED DATA =====
  const workerSummaries = useMemo(() => {
    if (!careWorkerRosters.length) return [];
    return buildWorkerSummaries(careWorkerRosters);
  }, [careWorkerRosters]);

  const workerSummaryByKey = useMemo(() => {
    type WS = (typeof workerSummaries)[number];
    const map: Map<string, WS> = new Map();
    for (const ws of workerSummaries) {
      map.set(ws.key, ws);
    }
    return map;
  }, [workerSummaries]);

  const filteredWorkers = useMemo((): CareWorkerRoster[] => {
    const term = careWorkerSearch.toLowerCase().trim();
    return careWorkerRosters.filter((worker: CareWorkerRoster) => {
      if (term && !worker.workerName.toLowerCase().includes(term)) return false;
      if (workerFilter === "all") return true;
      const summary = workerSummaryByKey.get(worker.key);
      const minutes = summary?.totalDurationMinutes ?? 0;
      if (workerFilter === "over") return minutes >= WORKLOAD_OVER_MINUTES;
      if (workerFilter === "under") return minutes > 0 && minutes <= WORKLOAD_UNDER_MINUTES;
      return true;
    });
  }, [careWorkerRosters, careWorkerSearch, workerFilter, workerSummaryByKey]);

  const workerFilterCounts = useMemo(() => {
    const counts = { all: careWorkerRosters.length, over: 0, under: 0 };
    for (const worker of careWorkerRosters) {
      const summary = workerSummaryByKey.get(worker.key);
      const minutes = summary?.totalDurationMinutes ?? 0;
      if (minutes >= WORKLOAD_OVER_MINUTES) counts.over += 1;
      if (minutes > 0 && minutes <= WORKLOAD_UNDER_MINUTES) counts.under += 1;
    }
    return counts;
  }, [careWorkerRosters, workerSummaryByKey]);

  // Build timeline lanes
  const timelineLanes = useMemo(() => {
    if (!careWorkerRosters.length) return [];
    // Only filter by template key if showOnlyTemplated is enabled
    const filterKey = showOnlyTemplated ? templateSelectionKey : undefined;
    const baseLanes = buildAllWorkerLanes(careWorkerRosters, filterKey);
    return applyOverridesToLanes(baseLanes, rosterState.present);
  }, [careWorkerRosters, templateSelectionKey, showOnlyTemplated, rosterState.present]);

  // Selected worker's lanes
  const selectedWorkerLanes = useMemo(() => {
    if (showAllWorkers) return timelineLanes;
    if (!selectedCareWorkerKey) return [];
    return timelineLanes.filter((lane) => lane.id === selectedCareWorkerKey);
  }, [timelineLanes, selectedCareWorkerKey, showAllWorkers]);

  const timelineVisibleLanes = showAllWorkers ? timelineLanes : selectedWorkerLanes;

  const timelineWindow = useMemo(() => {
    const defaultStart = ROSTER_DAY_START_MINUTES;
    const defaultEnd = ROSTER_DAY_HARD_END_MINUTES;
    if (showAllWorkers || timelineVisibleLanes.length === 0) {
      return { start: defaultStart, end: defaultEnd };
    }
    const entries = timelineVisibleLanes.flatMap((lane) => lane.entries);
    if (entries.length === 0) return { start: defaultStart, end: defaultEnd };
    let minStart = defaultEnd;
    let maxEnd = defaultStart;
    for (const entry of entries) {
      minStart = Math.min(minStart, entry.startMinutes);
      maxEnd = Math.max(maxEnd, entry.startMinutes + entry.durationMinutes);
    }
    const pad = 30;
    const start = Math.max(defaultStart, minStart - pad);
    const end = Math.min(defaultEnd, maxEnd + pad);
    return { start, end: Math.max(start + 60, end) };
  }, [showAllWorkers, timelineVisibleLanes]);

  // Selected entry
  const selectedTimelineEntry = useMemo(() => {
    if (!selectedTimelineEntryId) return null;
    for (const lane of timelineLanes) {
      const entry = lane.entries.find((e) => e.id === selectedTimelineEntryId);
      if (entry) return entry;
    }
    return null;
  }, [selectedTimelineEntryId, timelineLanes]);

  // Route entries for map
  const routeEntriesSorted = useMemo(() => {
    const lanes = selectedCareWorkerKey
      ? timelineLanes.filter((l) => l.id === selectedCareWorkerKey)
      : timelineLanes;
    const allEntries = lanes.flatMap((l) => l.entries);
    return allEntries.sort((a, b) => a.startMinutes - b.startMinutes);
  }, [timelineLanes, selectedCareWorkerKey]);

  // Stats calculations
  const totalWorkersCount = careWorkerRosters.length;
  const totalServiceUsersCount = useMemo(() => {
    const keys = new Set<string>();
    for (const lane of timelineLanes) {
      for (const entry of lane.entries) {
        if (entry.serviceUserKey) keys.add(entry.serviceUserKey);
      }
    }
    return keys.size;
  }, [timelineLanes]);

  const totalCallsCount = useMemo(() => {
    return timelineLanes.reduce((sum, lane) => sum + lane.entries.length, 0);
  }, [timelineLanes]);

  const totalHoursCount = useMemo(() => {
    const totalMinutes = timelineLanes.reduce(
      (sum, lane) => sum + lane.entries.reduce((s, e) => s + e.durationMinutes, 0),
      0
    );
    return Math.round(totalMinutes / 60 * 10) / 10;
  }, [timelineLanes]);

  const conflictsCount = useMemo(() => {
    let conflicts = 0;
    for (const lane of timelineLanes) {
      const sorted = [...lane.entries].sort((a, b) => a.startMinutes - b.startMinutes);
      for (let i = 0; i < sorted.length - 1; i++) {
        const curr = sorted[i];
        const next = sorted[i + 1];
        if (curr.startMinutes + curr.durationMinutes > next.startMinutes) {
          conflicts++;
        }
      }
    }
    return conflicts;
  }, [timelineLanes]);

  const doubleUpsCount = doubleUpSlots.size;

  // Heatmap data
  const heatmapSummaries = useMemo(() => {
    return workerSummaries.map((ws) => ({
      workerKey: ws.key,
      workerName: ws.workerName,
      totalMinutes: ws.totalDurationMinutes,
      callCount: ws.totalCalls,
      uniqueServiceUsers: ws.uniqueServiceUsers,
    }));
  }, [workerSummaries]);

  const weeklyTotals = useMemo((): Map<string, { calls: number; minutes: number }> => {
    type WeeklyTotal = { calls: number; minutes: number };
    const map: Map<string, WeeklyTotal> = new Map();
    for (const ws of workerSummaries) {
      map.set(ws.key, {
        minutes: ws.totalDurationMinutes * 5, // Approximate weekly
        calls: ws.totalCalls * 5,
      });
    }
    return map;
  }, [workerSummaries]);

  // Unique data for editors
  const uniqueServiceUsers = useMemo((): { key: string; name: string }[] => {
    type ServiceUser = { key: string; name: string };
    const map: Map<string, ServiceUser> = new Map();
    for (const roster of careWorkerRosters) {
      for (const cg of roster.callGroups) {
        if (cg.normalizedServiceUserKey && cg.serviceUserName) {
          map.set(cg.normalizedServiceUserKey, {
            key: cg.normalizedServiceUserKey,
            name: cg.serviceUserName,
          });
        }
      }
    }
    return Array.from(map.values());
  }, [careWorkerRosters]);

  const uniqueCallTypes = useMemo(() => {
    const set = new Set<string>();
    for (const roster of careWorkerRosters) {
      for (const cg of roster.callGroups) {
        if (cg.callTypeLabel) set.add(cg.callTypeLabel);
      }
    }
    return Array.from(set).sort();
  }, [careWorkerRosters]);

  // ===== MUTATIONS =====
  const saveCallTimeMutation = useMutation({
    mutationFn: async (callTime: RecommendedCallTime) => {
      const res = await fetch("/api/rostering/call-times", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(callTime),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json() as Promise<RecommendedCallTime>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rostering/call-times"] });
      toast({ title: "Call time saved" });
    },
  });

  const deleteCallTimeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/rostering/call-times/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rostering/call-times"] });
      toast({ title: "Call time deleted" });
    },
  });

  const saveConstraintMutation = useMutation({
    mutationFn: async (constraint: WorkerConstraintUI) => {
      const res = await fetch("/api/rostering/worker-constraints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(constraint),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json() as Promise<WorkerConstraintUI>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rostering/worker-constraints"] });
      toast({ title: "Constraint saved" });
    },
  });

  const deleteConstraintMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/rostering/worker-constraints/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rostering/worker-constraints"] });
      toast({ title: "Constraint deleted" });
    },
  });

  const saveRosterStateMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const res = await fetch("/api/rostering/saved-states", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          templateWeek: selectedTemplateWeek,
          templateDay: selectedTemplateDay,
          timeOverrides: rosterState.present.timeOverrides,
          laneOverrides: rosterState.present.laneOverrides,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json() as Promise<SavedRosterStateSummary>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rostering/saved-states"] });
      toast({ title: "Schedule saved" });
    },
  });

  const loadRosterStateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/rostering/saved-states/${id}`);
      if (!res.ok) throw new Error("Failed to load");
      return res.json() as Promise<SavedRosterStateSummary>;
    },
    onSuccess: (data: SavedRosterStateSummary) => {
      dispatchRoster({
        type: "APPLY_OPTIMIZATION",
        timeOverrides: data.timeOverrides,
        laneOverrides: data.laneOverrides,
      });
      toast({ title: "Schedule loaded" });
    },
  });

  const deleteRosterStateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/rostering/saved-states/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rostering/saved-states"] });
      toast({ title: "Schedule deleted" });
    },
  });

  // ===== HANDLERS =====
  const handleUndo = useCallback(() => {
    if (canUndo(rosterState)) {
      dispatchRoster({ type: "UNDO" });
    }
  }, [rosterState]);

  const handleRedo = useCallback(() => {
    if (canRedo(rosterState)) {
      dispatchRoster({ type: "REDO" });
    }
  }, [rosterState]);

  const handleSelectEntry = useCallback((entry: TimelineEntry, _event?: React.MouseEvent) => {
    setSelectedTimelineEntryId(entry.id);
    // Find which lane this entry belongs to
    for (const lane of timelineLanes) {
      if (lane.entries.some(e => e.id === entry.id)) {
        setSelectedCareWorkerKey(lane.id);
        break;
      }
    }
  }, [timelineLanes]);

  const handleEntryMove = useCallback(
    (entryId: string, newStartMinutes: number) => {
      dispatchRoster({
        type: "MOVE_ENTRY",
        entryId,
        startMinutes: newStartMinutes,
      });
    },
    []
  );

  const handleReassignEntry = useCallback(
    (entryId: string, targetLaneId: string) => {
      dispatchRoster({
        type: "REASSIGN_ENTRY",
        entryId,
        targetLaneId,
      });
      toast({ title: "Visit reassigned" });
    },
    [toast]
  );

  const handleBulkReassign = useCallback(
    (targetLaneId: string) => {
      const entryIds = Array.from(rosterState.present.selectedEntryIds);
      if (entryIds.length === 0) return;
      const reassignments = entryIds.map(entryId => ({ entryId, targetLaneId }));
      dispatchRoster({
        type: "BULK_REASSIGN_ENTRIES",
        reassignments,
      });
      toast({ title: `${entryIds.length} visits reassigned` });
    },
    [rosterState.present.selectedEntryIds, toast]
  );

  const handleBulkDelete = useCallback(() => {
    const entryIds = Array.from(rosterState.present.selectedEntryIds);
    if (entryIds.length === 0) return;
    dispatchRoster({
      type: "BULK_DELETE_ENTRIES",
      entryIds,
    });
    toast({ title: `${entryIds.length} visits removed` });
  }, [rosterState.present.selectedEntryIds, toast]);

  const handleClearSelection = useCallback(() => {
    dispatchRoster({ type: "CLEAR_SELECTION" });
  }, []);

  const handleResetState = useCallback(() => {
    dispatchRoster({ type: "RESET" });
    toast({ title: "Schedule reset" });
  }, [toast]);

  const handleRunOptimization = useCallback(async () => {
    setIsOptimizing(true);
    try {
      const result: OptimizationResult = runFullOptimization(
        timelineLanes,
        optimizationWeights,
        optimizationConstraints,
        undefined, // geocodedPoints
        {
          recommendedCallTimes: callTimesForEditor,
        }
      );
      dispatchRoster({
        type: "APPLY_OPTIMIZATION",
        timeOverrides: result.timeOverrides,
        laneOverrides: result.laneOverrides,
      });
      toast({
        title: "Optimization complete",
        description: `Adjusted ${Object.keys(result.timeOverrides).length} visits`,
      });
    } catch (err) {
      toast({
        title: "Optimization failed",
        variant: "destructive",
      });
    } finally {
      setIsOptimizing(false);
    }
  }, [timelineLanes, optimizationWeights, optimizationConstraints, callTimesForEditor, toast]);

  const handleApplyRecommendedTimes = useCallback(() => {
    let applied = 0;
    const timeOverrides: Record<string, number> = {};
    for (const lane of timelineLanes) {
      for (const entry of lane.entries) {
        const rec = callTimesForEditor.find(
          (ct: RecommendedCallTime) =>
            ct.serviceUserKey === entry.serviceUserKey &&
            ct.callTypeLabel?.toLowerCase() === entry.callTypeLabel?.toLowerCase()
        );
        if (rec) {
          timeOverrides[entry.id] = rec.recommendedStartMinutes;
          applied++;
        }
      }
    }
    if (applied > 0) {
      dispatchRoster({
        type: "APPLY_OPTIMIZATION",
        timeOverrides,
      });
    }
    toast({ title: `Applied ${applied} recommended times` });
  }, [timelineLanes, callTimesForEditor, toast]);

  const handleAutoBalance = useCallback(() => {
    // Open optimization settings panel with workload balance focus
    setPanelVisibility((prev) => ({ ...prev, optimization: true, workload: true }));
    toast({ 
      title: "Workload Balancing",
      description: "Use the Optimization Settings and Workload Heatmap panels to analyze and balance worker schedules."
    });
  }, [toast]);

  const handleOptimizeTravel = useCallback(() => {
    // Open map and optimization panels
    setPanelVisibility((prev) => ({ ...prev, optimization: true, map: true }));
    toast({ 
      title: "Travel Optimization",
      description: "Use the Route Map and Optimization Settings to minimize travel between calls."
    });
  }, [toast]);

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

  const handleExportPDF = useCallback(() => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text(`Roster - ${selectedTemplateWeek} ${selectedTemplateDay}`, 14, 20);

    const tableData = timelineLanes.flatMap((lane) =>
      lane.entries.map((e) => [
        lane.label,
        e.title,
        formatTimeOfDay(e.startMinutes),
        formatMinutesDisplay(e.durationMinutes),
        e.callTypeLabel || "-",
      ])
    );

    autoTable(doc, {
      startY: 30,
      head: [["Worker", "Service User", "Time", "Duration", "Call Type"]],
      body: tableData,
    });

    doc.save(`roster-${selectedTemplateWeek}-${selectedTemplateDay}.pdf`);
    toast({ title: "PDF exported" });
  }, [timelineLanes, selectedTemplateWeek, selectedTemplateDay, toast]);

  const handleExportExcel = useCallback(() => {
    const exportData = {
      weekNumber: selectedTemplateWeek,
      weekDay: selectedTemplateDay,
      workers: timelineLanes.map(lane => ({
        name: lane.label,
        calls: lane.entries.map(e => ({
          id: e.id,
          serviceUserName: e.title,
          startTime: formatTimeOfDay(e.startMinutes),
          endTime: formatTimeOfDay(e.startMinutes + e.durationMinutes),
          duration: e.durationMinutes,
          isDoubleUp: e.isDoubleUp || false,
          isTimeCritical: e.isTimeCritical || false,
          callType: e.callTypeLabel || "Regular",
          address: e.address || "",
        })),
        totalCalls: lane.entries.length,
        totalMinutes: lane.entries.reduce((sum, e) => sum + e.durationMinutes, 0),
        totalServiceUsers: new Set(lane.entries.map(e => e.title)).size,
        startTime: lane.entries.length > 0 ? formatTimeOfDay(Math.min(...lane.entries.map(e => e.startMinutes))) : "",
        endTime: lane.entries.length > 0 ? formatTimeOfDay(Math.max(...lane.entries.map(e => e.startMinutes + e.durationMinutes))) : "",
      })),
      metrics: {
        totalCalls: timelineLanes.reduce((sum, lane) => sum + lane.entries.length, 0),
        totalHours: timelineLanes.reduce((sum, lane) => sum + lane.entries.reduce((s, e) => s + e.durationMinutes, 0), 0) / 60,
        totalWorkers: timelineLanes.length,
        conflicts: 0, // Could calculate from overlaps
        avgCallsPerWorker: timelineLanes.length > 0 ? timelineLanes.reduce((sum, lane) => sum + lane.entries.length, 0) / timelineLanes.length : 0,
        avgHoursPerWorker: timelineLanes.length > 0 ? timelineLanes.reduce((sum, lane) => sum + lane.entries.reduce((s, e) => s + e.durationMinutes, 0), 0) / timelineLanes.length / 60 : 0,
      },
      optimizationScore: 0, // Calculate if available
    };

    exportRosterToExcel(
      exportData,
      `roster-${selectedTemplateWeek}-${selectedTemplateDay}.xlsx`
    );
    toast({ title: "Excel file exported" });
  }, [timelineLanes, selectedTemplateWeek, selectedTemplateDay, toast]);

  const openWorkerTools = useCallback((workerKey: string) => {
    setSelectedCareWorkerKey(workerKey);
    setShowAllWorkers(false);
  }, []);

  const hasRosterChanges = useMemo(() => {
    return (
      Object.keys(rosterState.present.timeOverrides).length > 0 ||
      Object.keys(rosterState.present.laneOverrides).length > 0
    );
  }, [rosterState.present]);

  // ===== KEYBOARD SHORTCUTS =====
  const shortcuts: KeyboardShortcut[] = useMemo(
    () => buildRosteringShortcuts({
      onUndo: handleUndo,
      onRedo: handleRedo,
      onSave: () => {
        if (hasRosterChanges) {
          setShowSaveDialog(true);
        }
      },
      onZoomIn: handleTimelineZoomIn,
      onZoomOut: handleTimelineZoomOut,
      onClearSelection: handleClearSelection,
    }),
    [
      handleUndo,
      handleRedo,
      hasRosterChanges,
      handleTimelineZoomIn,
      handleTimelineZoomOut,
      handleClearSelection,
    ]
  );

  useRosteringKeyboardShortcuts(shortcuts);

  // Loading states
  const isLoading = workbooksLoading || workbookLoading;

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ===== RENDER =====
  return (
    <TooltipProvider>
      <div className="flex h-full flex-col bg-background">
        {/* TOP MENU BAR */}
        <div className="flex h-9 items-center justify-between border-b bg-gradient-to-r from-muted/50 via-muted/30 to-muted/50 px-3 shadow-sm">
          <div className="flex items-center gap-0.5">
            {!embedded && (
              <Button variant="ghost" size="sm" asChild className="mr-1 h-7 w-7 p-0">
                <Link href="/testing-features">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
            )}

            {/* File Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-3 text-sm font-medium hover:bg-primary/10 transition-colors">
                  File
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>Workbook</DropdownMenuLabel>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Database className="mr-2 h-4 w-4" />
                    Select Workbook
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {workbooksList.map((wb: WorkbookSummary) => (
                      <DropdownMenuItem
                        key={wb.id}
                        onClick={() => setSelectedWorkbookId(wb.id)}
                      >
                        {wb.name}
                        {wb.id === activeWorkbookId && (
                          <CheckCircle2 className="ml-auto h-4 w-4 text-primary" />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => hasRosterChanges && setShowSaveDialog(true)} disabled={!hasRosterChanges}>
                  <Save className="mr-2 h-4 w-4" />
                  Save Schedule
                  <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <FolderOpen className="mr-2 h-4 w-4" />
                    Load Schedule
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {savedStates.length === 0 ? (
                      <DropdownMenuItem disabled>No saved schedules</DropdownMenuItem>
                    ) : (
                      savedStates.map((state: SavedRosterStateSummary) => (
                        <DropdownMenuItem
                          key={state.id}
                          onClick={() => loadRosterStateMutation.mutate(state.id)}
                        >
                          {state.name}
                          {state.isActive && (
                            <Badge variant="outline" className="ml-2 text-[10px]">Active</Badge>
                          )}
                        </DropdownMenuItem>
                      ))
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleExportPDF}>
                  <Download className="mr-2 h-4 w-4" />
                  Export PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportExcel}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Export Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Edit Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-3 text-sm font-medium hover:bg-primary/10 transition-colors">
                  Edit
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuItem onClick={handleUndo} disabled={!canUndo(rosterState)}>
                  <Undo2 className="mr-2 h-4 w-4" />
                  Undo
                  <DropdownMenuShortcut>⌘Z</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleRedo} disabled={!canRedo(rosterState)}>
                  <Redo2 className="mr-2 h-4 w-4" />
                  Redo
                  <DropdownMenuShortcut>⌘⇧Z</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleClearSelection} disabled={rosterState.present.selectedEntryIds.size === 0}>
                  Clear Selection
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleResetState}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Reset All Changes
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* View Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-2.5 text-sm font-medium">
                  View
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>Panels</DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={panelVisibility.timeline}
                  onCheckedChange={() => togglePanel("timeline")}
                >
                  <Timer className="mr-2 h-4 w-4" />
                  Timeline
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={panelVisibility.map}
                  onCheckedChange={() => togglePanel("map")}
                >
                  <MapIcon className="mr-2 h-4 w-4" />
                  Route Map
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={panelVisibility.workers}
                  onCheckedChange={() => togglePanel("workers")}
                >
                  <Users className="mr-2 h-4 w-4" />
                  Workers List
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={panelVisibility.details}
                  onCheckedChange={() => togglePanel("details")}
                >
                  Details Panel
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Tools</DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={panelVisibility.callTimes}
                  onCheckedChange={() => togglePanel("callTimes")}
                >
                  <Clock className="mr-2 h-4 w-4" />
                  Call Times Editor
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={panelVisibility.constraints}
                  onCheckedChange={() => togglePanel("constraints")}
                >
                  <UserCog className="mr-2 h-4 w-4" />
                  Worker Constraints
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={panelVisibility.workload}
                  onCheckedChange={() => togglePanel("workload")}
                >
                  <BarChart3 className="mr-2 h-4 w-4" />
                  Workload Heatmap
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={panelVisibility.optimization}
                  onCheckedChange={() => togglePanel("optimization")}
                >
                  <Sliders className="mr-2 h-4 w-4" />
                  Optimization Settings
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={panelVisibility.database}
                  onCheckedChange={() => togglePanel("database")}
                >
                  <Database className="mr-2 h-4 w-4" />
                  Database Admin
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Advanced Tools</DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={panelVisibility.aiAnalysis}
                  onCheckedChange={() => togglePanel("aiAnalysis")}
                >
                  <Brain className="mr-2 h-4 w-4" />
                  AI Schedule Analysis
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={panelVisibility.comparison}
                  onCheckedChange={() => togglePanel("comparison")}
                >
                  <GitCompare className="mr-2 h-4 w-4" />
                  Schedule Comparison
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={panelVisibility.costs}
                  onCheckedChange={() => togglePanel("costs")}
                >
                  <Calculator className="mr-2 h-4 w-4" />
                  Cost Analysis
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={panelVisibility.templates}
                  onCheckedChange={() => togglePanel("templates")}
                >
                  <BookTemplate className="mr-2 h-4 w-4" />
                  Template Library
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Timeline</DropdownMenuLabel>
                <DropdownMenuItem onClick={handleTimelineZoomIn}>
                  <ZoomIn className="mr-2 h-4 w-4" />
                  Zoom In
                  <DropdownMenuShortcut>⌘+</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleTimelineZoomOut}>
                  <ZoomOut className="mr-2 h-4 w-4" />
                  Zoom Out
                  <DropdownMenuShortcut>⌘-</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleTimelineZoomReset}>
                  <Maximize2 className="mr-2 h-4 w-4" />
                  Reset Zoom ({timelineZoom}%)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={showAllWorkers}
                  onCheckedChange={() => setShowAllWorkers(!showAllWorkers)}
                >
                  <Layers className="mr-2 h-4 w-4" />
                  Show All Workers
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={showOnlyTemplated}
                  onCheckedChange={() => setShowOnlyTemplated(!showOnlyTemplated)}
                >
                  <ClipboardList className="mr-2 h-4 w-4" />
                  Only Templated Calls
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={showHalfHourTicks}
                  onCheckedChange={() => setShowHalfHourTicks(!showHalfHourTicks)}
                >
                  <Table2 className="mr-2 h-4 w-4" />
                  Half-Hour Ticks
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Optimize Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-2.5 text-sm font-medium">
                  Optimize
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem onClick={handleRunOptimization} disabled={isOptimizing}>
                  <Zap className="mr-2 h-4 w-4" />
                  {isOptimizing ? "Optimizing..." : "Run Full Optimization"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleApplyRecommendedTimes} disabled={callTimesForEditor.length === 0}>
                  <Clock4 className="mr-2 h-4 w-4" />
                  Apply Recommended Times
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleAutoBalance}>
                  <ArrowDownUp className="mr-2 h-4 w-4" />
                  Auto-Balance Workload
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleOptimizeTravel}>
                  <Route className="mr-2 h-4 w-4" />
                  Optimize Travel Gaps
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Snap Interval</DropdownMenuLabel>
                {[5, 10, 15, 30].map((mins) => (
                  <DropdownMenuCheckboxItem
                    key={mins}
                    checked={snapMinutes === mins}
                    onCheckedChange={() => setSnapMinutes(mins)}
                  >
                    {mins} minutes
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Help Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-2.5 text-sm font-medium">
                  Help
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuItem onClick={() => setShowKeyboardShortcuts(true)}>
                  <Keyboard className="mr-2 h-4 w-4" />
                  Keyboard Shortcuts
                  <DropdownMenuShortcut>?</DropdownMenuShortcut>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Quick date selector in menu bar */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:bg-primary/20 transition-colors"
              onClick={() => setSelectedTemplateWeek((p) => (p === "week1" ? "week2" : "week1"))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Badge variant="secondary" className="text-[11px] font-bold px-3 py-1 shadow-sm bg-primary/90 text-primary-foreground">
              {getTemplateWeekLabel(selectedTemplateWeek)} • {selectedTemplateDay}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:bg-primary/20 transition-colors"
              onClick={() => setSelectedTemplateWeek((p) => (p === "week1" ? "week2" : "week1"))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Select
              value={selectedTemplateDay}
              onValueChange={(v: string) => setSelectedTemplateDay(v as WeekdayLabel)}
            >
              <SelectTrigger className="h-7 w-[100px] text-xs">
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
        </div>

        {/* STATS BAR */}
        <div className="flex h-7 items-center justify-between border-b bg-gradient-to-r from-background via-muted/10 to-background px-3 text-[10px] shadow-sm">
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20">
              <Users className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <span className="font-bold text-blue-700 dark:text-blue-300">{totalWorkersCount}</span>
              <span className="text-blue-600/70 dark:text-blue-400/70 text-[9px] font-medium">Workers</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20">
              <MapPin className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
              <span className="font-bold text-purple-700 dark:text-purple-300">{totalServiceUsersCount}</span>
              <span className="text-purple-600/70 dark:text-purple-400/70 text-[9px] font-medium">SUs</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-green-500/10 border border-green-500/20">
              <ClipboardList className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
              <span className="font-bold text-green-700 dark:text-green-300">{totalCallsCount}</span>
              <span className="text-green-600/70 dark:text-green-400/70 text-[9px] font-medium">Calls</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20">
              <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              <span className="font-bold text-amber-700 dark:text-amber-300">{totalHoursCount}</span>
              <span className="text-amber-600/70 dark:text-amber-400/70 text-[9px] font-medium">Hrs</span>
            </div>
            <div className="flex items-center gap-1">
              {conflictsCount > 0 ? (
                <AlertTriangle className="h-3 w-3 text-destructive" />
              ) : (
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              )}
              <span className={`font-semibold ${conflictsCount > 0 ? "text-destructive" : "text-emerald-600"}`}>
                {conflictsCount}
              </span>
              <span className="text-muted-foreground">Conflicts</span>
            </div>
            <div className="flex items-center gap-1">
              <Users className="h-3 w-3 text-muted-foreground" />
              <span className="font-semibold">{doubleUpsCount}</span>
              <span className="text-muted-foreground">2-ups</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasRosterChanges && (
              <Badge variant="outline" className="text-[10px]">
                Unsaved changes
              </Badge>
            )}
            <Badge variant="secondary" className="text-[10px]">
              Zoom: {timelineZoom}%
            </Badge>
          </div>
        </div>

        {/* MAIN WORKSPACE - Grid Layout */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <ResizablePanelGroup direction="horizontal" className="min-h-0">
            {/* LEFT SIDEBAR - Workers */}
            {panelVisibility.workers && (
              <>
                <ResizablePanel defaultSize={12} minSize={8} maxSize={18} className="min-h-0">
                  <div className="flex h-full min-h-0 flex-col border-r bg-gradient-to-b from-muted/20 to-background">
                    <div className="flex items-center justify-between border-b bg-gradient-to-r from-primary/5 to-transparent px-3 py-1.5 shadow-sm">
                      <div className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-primary" />
                        <span className="text-[10px] font-bold uppercase tracking-wide text-foreground">Workers</span>
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0.5 h-5 font-bold bg-primary/10 text-primary border-primary/20">
                          {filteredWorkers.length}/{careWorkerRosters.length}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4"
                        onClick={() => setShowAllWorkers(!showAllWorkers)}
                      >
                        {showAllWorkers ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                      </Button>
                    </div>
                    <div className="px-2 py-1.5 space-y-1.5">
                      <Input
                        placeholder="🔍 Search workers..."
                        value={careWorkerSearch}
                        onChange={(e) => setCareWorkerSearch(e.target.value)}
                        className="h-7 text-[10px] border-primary/20 focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
                      />
                      <div className="flex items-center gap-1">
                        {[
                          { key: "all", label: "All", count: workerFilterCounts.all },
                          { key: "over", label: ">8h", count: workerFilterCounts.over },
                          { key: "under", label: "<4h", count: workerFilterCounts.under },
                        ].map((filter) => (
                          <Button
                            key={filter.key}
                            type="button"
                            size="sm"
                            variant={workerFilter === filter.key ? "default" : "outline"}
                            className="h-5 px-2 text-[9px]"
                            onClick={() => setWorkerFilter(filter.key as typeof workerFilter)}
                          >
                            {filter.label} {filter.count}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div className="px-1.5 pb-2">
                      <ScrollArea className="max-h-[288px]">
                        <div className="divide-y">
                        {filteredWorkers.map((worker: CareWorkerRoster) => {
                          const summary = workerSummaryByKey.get(worker.key);
                          const isSelected = worker.key === selectedCareWorkerKey;
                          return (
                            <button
                              key={worker.key}
                              type="button"
                              onClick={(e) => {
                                (e.target as HTMLElement).blur(); // Prevent aria-hidden focus issue
                                openWorkerTools(worker.key);
                              }}
                              className={`w-full h-10 px-2 py-1.5 text-left transition-all duration-200 rounded-md mx-1 ${
                                isSelected 
                                  ? "bg-gradient-to-r from-primary/20 to-primary/10 border border-primary/30 shadow-sm" 
                                  : "hover:bg-muted/60 hover:shadow-sm"
                              }`}
                            >
                              <div className="flex items-center gap-1">
                                <WorkerAvatar name={worker.workerName} size="sm" />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[11px] font-medium leading-tight">{worker.workerName}</p>
                                  <p className="text-[9px] text-muted-foreground leading-tight">
                                    {summary
                                      ? `${summary.totalCalls} calls · ${(summary.totalDurationMinutes / 60).toFixed(1)}h`
                                      : "—"}
                                  </p>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>
                </ResizablePanel>
                <ResizableHandle withHandle />
              </>
            )}

            {/* MAIN CONTENT - Fixed Grid Layout */}
                <ResizablePanel defaultSize={panelVisibility.workers ? 63 : 78} className="min-h-0">
              <div className="flex h-full min-h-0 flex-col">
                {/* Top Row: Timeline (takes most space) */}
                {panelVisibility.timeline && (
                  <div className="flex-[2] min-h-[260px] border-b flex flex-col overflow-hidden">
                    <div className="flex items-center justify-between bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-3 py-1 border-b shrink-0 shadow-sm">
                      <div className="flex items-center gap-2">
                        <Timer className="h-4 w-4 text-primary" />
                        <span className="text-[11px] font-bold uppercase tracking-wide">Timeline</span>
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0.5 font-semibold bg-primary/10 text-primary border-primary/20">
                          {showAllWorkers ? `${timelineLanes.length}` : selectedCareWorkerKey ? "1" : "—"}
                        </Badge>
                        {conflictsCount > 0 && (
                          <Badge variant="destructive" className="text-[8px] px-1 py-0 h-4">
                            {conflictsCount}
                          </Badge>
                        )}
                      </div>
                      {rosterState.present.selectedEntryIds.size > 1 && (
                        <div className="flex items-center gap-1">
                          <Badge variant="default" className="text-[9px]">{rosterState.present.selectedEntryIds.size} selected</Badge>
                          <Select onValueChange={handleBulkReassign}>
                            <SelectTrigger className="h-6 w-[120px] text-[10px]">
                              <SelectValue placeholder="Move to..." />
                            </SelectTrigger>
                            <SelectContent>
                              {timelineLanes.map((lane: GanttLane) => (
                                <SelectItem key={lane.id} value={lane.id} className="text-xs">
                                  {lane.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={handleClearSelection}>
                            Clear
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/10 px-2 py-1 border-b">
                      <div className="flex flex-wrap items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant={showAllWorkers ? "default" : "outline"}
                          className="h-6 px-2 text-[10px]"
                          onClick={() => setShowAllWorkers(true)}
                        >
                          All workers
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={!showAllWorkers ? "default" : "outline"}
                          className="h-6 px-2 text-[10px]"
                          onClick={() => setShowAllWorkers(false)}
                          disabled={!selectedCareWorkerKey}
                        >
                          Focus
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={showOnlyTemplated ? "default" : "outline"}
                          className="h-6 px-2 text-[10px]"
                          onClick={() => setShowOnlyTemplated((prev) => !prev)}
                        >
                          Templated
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={showHalfHourTicks ? "default" : "outline"}
                          className="h-6 px-2 text-[10px]"
                          onClick={() => setShowHalfHourTicks((prev) => !prev)}
                        >
                          30m ticks
                        </Button>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <Select
                          value={String(snapMinutes)}
                          onValueChange={(value: string) => setSnapMinutes(Number(value))}
                        >
                          <SelectTrigger className="h-6 w-[90px] text-[10px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[5, 10, 15, 30].map((value) => (
                              <SelectItem key={value} value={String(value)} className="text-xs">
                                Snap {value}m
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-6 w-6"
                          onClick={handleTimelineZoomOut}
                          disabled={timelineZoomIndex === 0}
                        >
                          <ZoomOut className="h-3 w-3" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[10px]"
                          onClick={handleTimelineZoomReset}
                        >
                          {timelineZoom}%
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-6 w-6"
                          onClick={handleTimelineZoomIn}
                          disabled={timelineZoomIndex === TIMELINE_ZOOM_LEVELS.length - 1}
                        >
                          <ZoomIn className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-0.5">
                      <GanttTimeline
                        lanes={timelineVisibleLanes}
                        startMinutes={timelineWindow.start}
                        endMinutes={timelineWindow.end}
                        snapMinutes={snapMinutes}
                        showHalfHourTicks={showHalfHourTicks}
                        rowHeight={timelineRowHeight}
                        horizontalZoom={timelineZoom}
                        selectedEntryId={selectedTimelineEntryId}
                        selectedEntryIds={rosterState.present.selectedEntryIds}
                        focusedEntryId={rosterState.present.focusedEntryId}
                        onSelectEntry={handleSelectEntry}
                        onEntryMove={handleEntryMove}
                        recommendedTimes={callTimesForEditor}
                        fitHeight
                        lockToContainer
                      />
                    </div>
                  </div>
                )}

                {/* Bottom Row: Horizontal panels */}
                <div className="flex-1 min-h-[220px] flex border-t overflow-hidden">
                  {/* Map Panel */}
                  {panelVisibility.map && (
                    <div className="flex-1 min-w-0 min-h-0 border-r flex flex-col">
                      <div className="flex items-center gap-2 bg-gradient-to-r from-blue-500/10 to-transparent px-3 py-1 border-b shadow-sm">
                        <MapIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        <span className="text-[11px] font-bold uppercase tracking-wide">Map</span>
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0.5 font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20">
                          {routeEntriesSorted.length}
                        </Badge>
                      </div>
                      <div className="flex-1 min-h-0 p-0.5 overflow-hidden">
                        <RouteMapView entries={routeEntriesSorted} />
                      </div>
                    </div>
                  )}

                  {/* Call Times Panel */}
                  {panelVisibility.callTimes && (
                    <div className="flex-1 min-w-0 min-h-0 border-r flex flex-col">
                      <div className="flex items-center gap-2 bg-gradient-to-r from-purple-500/10 to-transparent px-3 py-1 border-b shadow-sm">
                        <Clock className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                        <span className="text-[11px] font-bold uppercase tracking-wide">Call Times</span>
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0.5 font-semibold bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20">
                          {callTimesForEditor.length}
                        </Badge>
                      </div>
                      <ScrollArea className="flex-1 min-h-0">
                        <div className="p-0.5">
                          <CallTimeEditor
                            serviceUsers={uniqueServiceUsers}
                            callTypes={uniqueCallTypes}
                            callTimes={callTimesForEditor}
                            onSave={(ct: RecommendedCallTime) => saveCallTimeMutation.mutate(ct)}
                            onDelete={(id: string) => deleteCallTimeMutation.mutate(id)}
                            isSaving={saveCallTimeMutation.isPending}
                          />
                        </div>
                      </ScrollArea>
                    </div>
                  )}

                  {/* Constraints Panel */}
                  {panelVisibility.constraints && (
                    <div className="flex-1 min-w-0 min-h-0 border-r flex flex-col">
                      <div className="flex items-center gap-2 bg-gradient-to-r from-amber-500/10 to-transparent px-3 py-1 border-b shadow-sm">
                        <UserCog className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        <span className="text-[11px] font-bold uppercase tracking-wide">Constraints</span>
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0.5 font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20">
                          {constraintsForEditor.length}
                        </Badge>
                      </div>
                      <ScrollArea className="flex-1 min-h-0">
                        <div className="p-0.5">
                          <WorkerConstraintsEditor
                            workers={careWorkerRosters.map((r: CareWorkerRoster) => ({
                              key: r.key,
                              name: r.workerName,
                            }))}
                            constraints={constraintsForEditor}
                            workerSummaries={heatmapSummaries}
                            weeklyTotals={weeklyTotals}
                            onSave={(c: WorkerConstraintUI) => saveConstraintMutation.mutate(c)}
                            onDelete={(id: string) => deleteConstraintMutation.mutate(id)}
                            isSaving={saveConstraintMutation.isPending}
                          />
                        </div>
                      </ScrollArea>
                    </div>
                  )}

                  {/* Workload Heatmap */}
                  {panelVisibility.workload && (
                    <div className="flex-1 min-w-0 min-h-0 border-r flex flex-col">
                      <div className="flex items-center gap-2 bg-gradient-to-r from-green-500/10 to-transparent px-3 py-1 border-b shadow-sm">
                        <BarChart3 className="h-4 w-4 text-green-600 dark:text-green-400" />
                        <span className="text-[11px] font-bold uppercase tracking-wide">Workload</span>
                      </div>
                      <div className="flex-1 min-h-0 p-0.5 overflow-auto">
                        <WorkloadHeatmap
                          workers={heatmapSummaries}
                          constraints={constraintsForEditor}
                          weeklyTotals={weeklyTotals}
                          selectedWorkerKey={selectedCareWorkerKey}
                          onWorkerClick={(key: string) => {
                            setSelectedCareWorkerKey(key);
                            setShowAllWorkers(false);
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Optimization Panel */}
                  {panelVisibility.optimization && (
                    <div className="flex-1 min-w-0 min-h-0 border-r flex flex-col">
                      <div className="flex items-center gap-2 bg-gradient-to-r from-orange-500/10 to-transparent px-3 py-1 border-b shadow-sm">
                        <Sliders className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                        <span className="text-[11px] font-bold uppercase tracking-wide">Optimization</span>
                      </div>
                      <ScrollArea className="flex-1 min-h-0">
                        <div className="p-0.5">
                          <OptimizationSettings
                            weights={optimizationWeights}
                            constraints={optimizationConstraints}
                            onWeightsChange={setOptimizationWeights}
                            onConstraintsChange={setOptimizationConstraints}
                            onRunOptimization={handleRunOptimization}
                            isOptimizing={isOptimizing}
                          />
                        </div>
                      </ScrollArea>
                    </div>
                  )}

                  {/* Database Panel */}
                  {panelVisibility.database && (
                    <div className="flex-1 min-w-0 min-h-0 flex flex-col">
                      <div className="flex items-center gap-2 bg-gradient-to-r from-slate-500/10 to-transparent px-3 py-1 border-b shadow-sm">
                        <Database className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                        <span className="text-[11px] font-bold uppercase tracking-wide">Database</span>
                      </div>
                      <ScrollArea className="flex-1 min-h-0">
                        <div className="p-0.5">
                          <AdminDatabasePanel />
                        </div>
                      </ScrollArea>
                    </div>
                  )}

                  {/* AI Analysis Panel */}
                  {panelVisibility.aiAnalysis && (
                    <div className="flex-1 min-w-0 min-h-0 flex flex-col">
                      <div className="flex items-center gap-2 bg-gradient-to-r from-violet-500/10 via-purple-500/5 to-transparent px-3 py-1 border-b shadow-sm">
                        <Brain className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                        <span className="text-[11px] font-bold uppercase tracking-wide">AI Schedule Analysis</span>
                      </div>
                      <ScrollArea className="flex-1 min-h-0">
                        <div className="p-0.5">
                          {activeWorkbookId && (
                            <ScheduleAnalysisDashboard
                              workbookId={parseInt(activeWorkbookId)}
                              workers={workerSummaries.map(ws => ({
                                key: ws.key,
                                name: ws.workerName,
                                calls: ws.totalCalls,
                                minutes: ws.totalDurationMinutes,
                                serviceUsers: ws.uniqueServiceUsers,
                              }))}
                              conflicts={0}
                              travelGaps={0}
                              utilizationStats={{
                                avgCalls: workerSummaries.length > 0 ? workerSummaries.reduce((sum, w) => sum + w.totalCalls, 0) / workerSummaries.length : 0,
                                avgHours: workerSummaries.length > 0 ? workerSummaries.reduce((sum, w) => sum + w.totalDurationMinutes, 0) / workerSummaries.length / 60 : 0,
                                workersOverLimit: workerFilterCounts.over,
                                workersUnderUtilized: workerFilterCounts.under,
                              }}
                              constraintViolations={[]}
                              weekDay={selectedTemplateDay}
                              weekNumber={selectedTemplateWeek}
                            />
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  )}

                  {/* Schedule Comparison Panel */}
                  {panelVisibility.comparison && savedComparisonData && (
                    <div className="flex-1 min-w-0 min-h-0 flex flex-col">
                      <div className="flex items-center gap-2 bg-gradient-to-r from-cyan-500/10 to-transparent px-3 py-1 border-b shadow-sm">
                        <GitCompare className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                        <span className="text-[11px] font-bold uppercase tracking-wide">Schedule Comparison</span>
                      </div>
                      <ScrollArea className="flex-1 min-h-0">
                        <div className="p-0.5">
                          {activeWorkbookId && (
                            <ScheduleComparison
                              workbookId={parseInt(activeWorkbookId)}
                              beforeSchedule={savedComparisonData.before}
                              afterSchedule={savedComparisonData.after}
                              changes={savedComparisonData.changes}
                            />
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  )}

                  {/* Cost Analysis Panel */}
                  {panelVisibility.costs && (
                    <div className="flex-1 min-w-0 min-h-0 flex flex-col">
                      <div className="flex items-center gap-2 bg-gradient-to-r from-emerald-500/10 to-transparent px-3 py-1 border-b shadow-sm">
                        <Calculator className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-[11px] font-bold uppercase tracking-wide">Cost Analysis</span>
                      </div>
                      <ScrollArea className="flex-1 min-h-0">
                        <div className="p-0.5">
                          <CostAnalysisDashboard
                            workers={workerSummaries.map(ws => ({
                              name: ws.workerName,
                              totalMinutes: ws.totalDurationMinutes,
                              travelDistanceMeters: 0, // Calculate from route data if available
                            }))}
                          />
                        </div>
                      </ScrollArea>
                    </div>
                  )}

                  {/* Template Library Panel */}
                  {panelVisibility.templates && (
                    <div className="flex-1 min-w-0 min-h-0 flex flex-col">
                      <div className="flex items-center gap-2 bg-gradient-to-r from-rose-500/10 to-transparent px-3 py-1 border-b shadow-sm">
                        <BookTemplate className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                        <span className="text-[11px] font-bold uppercase tracking-wide">Template Library</span>
                      </div>
                      <ScrollArea className="flex-1 min-h-0">
                        <div className="p-0.5">
                          {activeWorkbookId && (
                            <ScheduleTemplateLibrary
                              workbookId={parseInt(activeWorkbookId)}
                              currentWeekDay={selectedTemplateDay}
                              currentWeekNumber={selectedTemplateWeek}
                              currentScheduleState={{
                                timeOverrides: rosterState.present.timeOverrides,
                                laneOverrides: rosterState.present.laneOverrides,
                              }}
                              onLoadTemplate={(state) => {
                                // Apply loaded state as optimization result
                                if (state.timeOverrides || state.laneOverrides) {
                                  dispatchRoster({
                                    type: "APPLY_OPTIMIZATION",
                                    timeOverrides: state.timeOverrides as Record<string, number> || {},
                                    laneOverrides: state.laneOverrides as Record<string, string> || {},
                                  });
                                }
                              }}
                            />
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  )}

                  {/* Placeholder when no bottom panels visible */}
                  {!panelVisibility.map && !panelVisibility.callTimes && !panelVisibility.constraints && 
                   !panelVisibility.workload && !panelVisibility.optimization && !panelVisibility.database &&
                   !panelVisibility.aiAnalysis && !panelVisibility.comparison && !panelVisibility.costs && !panelVisibility.templates && (
                    <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-xs gap-3">
                      <Layers className="h-12 w-12 text-muted-foreground/30" />
                      <div className="text-center space-y-1">
                        <p className="font-medium text-sm">No panels visible</p>
                        <p className="text-[10px]">Use <kbd className="px-1.5 py-0.5 bg-muted rounded text-[9px] font-mono">View</kbd> menu to show panels</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </ResizablePanel>

            {/* RIGHT SIDEBAR - Details */}
            {panelVisibility.details && (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={25} minSize={15} maxSize={35} className="min-h-0">
                  <div className="flex h-full min-h-0 flex-col border-l bg-gradient-to-b from-muted/10 to-background">
                    <div className="border-b bg-gradient-to-r from-primary/5 to-transparent px-3 py-1.5 shadow-sm">
                      <div className="flex items-center gap-1.5">
                        <Eye className="h-3.5 w-3.5  text-primary" />
                        <span className="text-[10px] font-bold uppercase tracking-wide text-foreground">Details</span>
                      </div>
                    </div>
                    <ScrollArea className="flex-1 min-h-0">
                      <div className="p-2 space-y-2.5">
                        {/* Selected Visit Details */}
                        <div className="rounded-lg border bg-gradient-to-br from-primary/5 to-transparent p-2 shadow-sm">
                          <p className="text-[9px] uppercase tracking-wide text-primary/70 font-bold mb-1.5 flex items-center gap-1">
                            <Clock4 className="h-3 w-3" />
                            Selected Visit
                          </p>
                          {selectedTimelineEntry ? (
                            <div className="space-y-1.5">
                              <p className="text-[12px] font-bold leading-tight">{selectedTimelineEntry.title}</p>
                              <div className="flex items-center gap-1.5 text-[9px]">
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0.5 h-5 font-semibold border-primary/30 bg-primary/5">
                                  {formatMinutesToTime(selectedTimelineEntry.startMinutes)}
                                </Badge>
                                <span className="text-muted-foreground">
                                  {formatMinutesDisplay(selectedTimelineEntry.durationMinutes)}
                                </span>
                              </div>
                              {selectedTimelineEntry.callTypeLabel && (
                                <CallTypeChip callType={selectedTimelineEntry.callTypeLabel} size="sm" />
                              )}
                              {selectedTimelineEntry.address && (
                                <p className="text-[10px] text-muted-foreground border-l-2 border-primary/30 pl-1.5">
                                  {selectedTimelineEntry.address}
                                </p>
                              )}
                              <div className="pt-2 border-t">
                                <p className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">
                                  Reassign to
                                </p>
                                <Select
                                  onValueChange={(laneId: string) =>
                                    handleReassignEntry(selectedTimelineEntry.id, laneId)
                                  }
                                >
                                  <SelectTrigger className="h-6 text-[10px]">
                                    <SelectValue placeholder="Select worker..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {timelineLanes.map((lane: GanttLane) => (
                                      <SelectItem key={lane.id} value={lane.id} className="text-xs">
                                        {lane.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full h-7 text-[10px] mt-1 hover:bg-primary/10"
                                onClick={() => setSelectedTimelineEntryId(null)}
                              >
                                Clear selection
                              </Button>
                            </div>
                          ) : (
                            <p className="text-[10px] text-muted-foreground py-2 text-center">
                              👆 Click a visit on the timeline
                            </p>
                          )}
                        </div>

                        {/* Quick Actions */}
                        <div className="rounded-lg border p-1.5">
                          <p className="text-[8px] uppercase tracking-wide text-muted-foreground mb-1">
                            Quick Actions
                          </p>
                          <div className="space-y-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full justify-start h-6 text-[10px]"
                              onClick={handleRunOptimization}
                              disabled={isOptimizing}
                            >
                              <Zap className="mr-1.5 h-3 w-3" />
                              {isOptimizing ? "Optimizing..." : "Optimize"}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full justify-start h-6 text-[10px]"
                              onClick={handleApplyRecommendedTimes}
                              disabled={callTimesForEditor.length === 0}
                            >
                              <Clock4 className="mr-1.5 h-3 w-3" />
                              Apply Times
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full justify-start h-6 text-[10px]"
                              onClick={handleAutoBalance}
                            >
                              <ArrowDownUp className="mr-1.5 h-3 w-3" />
                              Balance
                            </Button>
                          </div>
                        </div>

                        {/* Saved Schedules */}
                        <div className="rounded-lg border p-1.5">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-[8px] uppercase tracking-wide text-muted-foreground">
                              Saved Schedules
                            </p>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => {
                                setSaveScheduleName(`${selectedTemplateDay} ${getTemplateWeekLabel(selectedTemplateWeek)}`);
                                setSaveScheduleDescription("");
                                setShowSaveDialog(true);
                              }}
                              disabled={!hasRosterChanges}
                            >
                              <Save className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          {savedStates.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No saved schedules</p>
                          ) : (
                            <div className="space-y-2">
                              {savedStates.slice(0, 5).map((state: SavedRosterStateSummary) => (
                                <div
                                  key={state.id}
                                  className="flex items-center justify-between rounded border p-2 text-xs"
                                >
                                  <span className="truncate">{state.name}</span>
                                  <div className="flex gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6"
                                      onClick={() => loadRosterStateMutation.mutate(state.id)}
                                    >
                                      <FolderOpen className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-destructive"
                                      onClick={() => deleteRosterStateMutation.mutate(state.id)}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </ScrollArea>
                  </div>
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        </div>

        {/* SAVE DIALOG */}
        <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save Schedule</DialogTitle>
              <DialogDescription>
                Save your current roster adjustments for {selectedTemplateDay} {getTemplateWeekLabel(selectedTemplateWeek)}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <Input
                  value={saveScheduleName}
                  onChange={(e) => setSaveScheduleName(e.target.value)}
                  placeholder="Schedule name..."
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
            </div>
            <DialogFooter>
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
                <Save className="mr-2 h-4 w-4" />
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* KEYBOARD SHORTCUTS DIALOG */}
        <Dialog open={showKeyboardShortcuts} onOpenChange={setShowKeyboardShortcuts}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Keyboard Shortcuts</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-4">
              {[
                { key: "⌘Z", action: "Undo" },
                { key: "⌘⇧Z", action: "Redo" },
                { key: "⌘S", action: "Save schedule" },
                { key: "⌘+", action: "Zoom in" },
                { key: "⌘-", action: "Zoom out" },
                { key: "⌘0", action: "Reset zoom" },
                { key: "A", action: "Toggle all workers" },
                { key: "Escape", action: "Clear selection" },
                { key: "?", action: "Show shortcuts" },
              ].map((s) => (
                <div key={s.key} className="flex items-center justify-between text-sm">
                  <span>{s.action}</span>
                  <kbd className="rounded bg-muted px-2 py-1 text-xs font-mono">{s.key}</kbd>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
