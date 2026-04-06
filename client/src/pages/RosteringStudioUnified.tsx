/**
 * RosteringStudioUnified - A consolidated single-window view for all rostering features.
 * 
 * This component provides:
 * - Top menu bar with File, Edit, View, Optimize, Help dropdowns
 * - Stats bar showing key metrics
 * - Collapsible panels for all rostering features
 * - Resizable sidebar for worker list
 */

import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useReducer, useState } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, parseApiResponse } from "@/lib/queryClient";

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
  ArrowLeft,
  BarChart3,
  CheckCircle2,
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
import { CallTypeChip } from "@/components/rostering/CallTypeChip";
import { WorkerAvatar } from "@/components/rostering/WorkerAvatar";
import { CallTimeEditor, type RecommendedCallTime } from "@/components/rostering/CallTimeEditor";
import { WorkloadHeatmap } from "@/components/rostering/WorkloadHeatmap";
import { WorkerConstraintsEditor, type WorkerConstraint as WorkerConstraintUI } from "@/components/rostering/WorkerConstraintsEditor";
import { buildAllWorkerLanes, buildWorkerSummaries, type TimelineEntry, type GanttLane } from "@/lib/rostering/rosterModel";
import { useRosteringKeyboardShortcuts, buildRosteringShortcuts, type KeyboardShortcut } from "@/hooks/useRosteringKeyboardShortcuts";
import {
  rosterHistoryReducer,
  createInitialHistoryState,
  applyOverridesToLanes,
  canUndo,
  canRedo,
} from "@/lib/rostering/rosterReducer";
import {
  OptimizationSettings,
  type OptimizationWeights,
  type OptimizationConstraints,
  defaultWeights,
  defaultConstraints,
} from "@/components/rostering/OptimizationSettings";
import { runFullOptimization, type OptimizationResult } from "@/lib/rostering/optimizer";
import "./rostering-studio-redesign.css";

// ===== CONSTANTS =====
const ROSTER_DAY_START_MINUTES = 6 * 60;
const ROSTER_DAY_HARD_END_MINUTES = 22 * 60;
const TIMELINE_ZOOM_LEVELS = [70, 85, 100, 115, 130] as const;
const BASE_TIMELINE_ROW_HEIGHT = 72;
const ROSTERING_QUERY_OPTIONS = {
  refetchOnWindowFocus: false as const,
  refetchOnReconnect: false as const,
};

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
const ROSTERING_PREFERENCES_KEY = "rstd.preferences.v1";

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
  rows?: RowAnalysis[];
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
  sourceHash?: string;
  totalRows: number;
  careWorkerCount: number;
  serviceUserCount: number;
  callGroupCount: number;
  rowAnalysis?: RowAnalysis[];
  callGroups?: WorkerCallGroup[];
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

interface ScheduleSnapshot {
  workers: Array<{ name: string; calls: number; minutes: number }>;
  conflicts: number;
  travelGaps: number;
  timestamp?: string;
}

interface ComparisonData {
  before: ScheduleSnapshot;
  after: ScheduleSnapshot;
  changes: {
    timeShifts: number;
    reassignments: number;
    deletions: number;
  };
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

const BOTTOM_PANEL_KEYS = [
  "map",
  "callTimes",
  "constraints",
  "workload",
  "optimization",
  "database",
  "aiAnalysis",
  "comparison",
  "costs",
  "templates",
] as const;
type BottomPanelKey = (typeof BOTTOM_PANEL_KEYS)[number];

const RouteMapViewLazy = lazy(async () => {
  const module = await import("@/components/rostering/RouteMapView");
  return { default: module.RouteMapView };
});
const AdminDatabasePanelLazy = lazy(() => import("@/components/rostering/AdminDatabasePanel"));
const ScheduleAnalysisDashboardLazy = lazy(() => import("@/components/rostering/ScheduleAnalysisDashboard"));
const ScheduleComparisonLazy = lazy(() => import("@/components/rostering/ScheduleComparison"));
const CostAnalysisDashboardLazy = lazy(() => import("@/components/rostering/CostAnalysisDashboard"));
const ScheduleTemplateLibraryLazy = lazy(() => import("@/components/rostering/ScheduleTemplateLibrary"));

function PanelLoading({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[140px] items-center justify-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin text-primary" />
      Loading {label}...
    </div>
  );
}

// ===== MAIN COMPONENT =====
export default function RosteringStudioUnified({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const { toast } = useToast();
  usePageTitle("Rostering Studio");
  const queryClient = useQueryClient();

  // Warm optional heavy chunks in idle time so first panel-open feels instant.
  useEffect(() => {
    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    const shouldLimitPreload =
      connection?.saveData ||
      connection?.effectiveType === "slow-2g" ||
      connection?.effectiveType === "2g";
    if (shouldLimitPreload) return;

    const preload = () => {
      void import("@/components/rostering/RouteMapView");
      void import("@/components/rostering/AdminDatabasePanel");
      void import("@/components/rostering/ScheduleAnalysisDashboard");
      void import("@/components/rostering/ScheduleComparison");
      void import("@/components/rostering/CostAnalysisDashboard");
      void import("@/components/rostering/ScheduleTemplateLibrary");
      void import("@/lib/rostering/excelExport");
    };

    const win = window as Window & {
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (typeof win.requestIdleCallback === "function") {
      const idleId = win.requestIdleCallback(preload, { timeout: 3500 });
      return () => win.cancelIdleCallback?.(idleId);
    }

    const timeoutId = setTimeout(preload, 1800);
    return () => clearTimeout(timeoutId);
  }, []);

  // Panel visibility state
  const [panelVisibility, setPanelVisibility] = useState<PanelVisibility>(defaultPanelVisibility);
  const togglePanel = useCallback((panel: keyof PanelVisibility) => {
    setPanelVisibility((prev) => ({ ...prev, [panel]: !prev[panel] }));
  }, []);

  // Core state
  const [selectedWorkbookId, setSelectedWorkbookId] = useState<string | null>(null);
  const [selectedCareWorkerKey, setSelectedCareWorkerKey] = useState<string>("");
  const [careWorkerSearch, setCareWorkerSearch] = useState("");
  const deferredCareWorkerSearch = useDeferredValue(careWorkerSearch);

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

  const buildScheduleSnapshot = useCallback((lanes: GanttLane[]): ScheduleSnapshot => {
    const workers = lanes.map((lane) => ({
      name: lane.label,
      calls: lane.entries.length,
      minutes: lane.entries.reduce((sum, entry) => sum + entry.durationMinutes, 0),
    }));
    let conflicts = 0;
    for (const lane of lanes) {
      const sorted = [...lane.entries].sort((a, b) => a.startMinutes - b.startMinutes);
      for (let i = 0; i < sorted.length - 1; i += 1) {
        const current = sorted[i];
        const next = sorted[i + 1];
        if (current.startMinutes + current.durationMinutes > next.startMinutes) {
          conflicts += 1;
        }
      }
    }
    return {
      workers,
      conflicts,
      travelGaps: 0,
      timestamp: new Date().toISOString(),
    };
  }, []);

  const [savedComparisonData, setSavedComparisonData] = useState<ComparisonData | null>(null);

  const timelineZoom = TIMELINE_ZOOM_LEVELS[timelineZoomIndex] ?? 100;
  const timelineRowHeight = useMemo(
    () => Math.round(BASE_TIMELINE_ROW_HEIGHT * (timelineZoom / 100)),
    [timelineZoom]
  );

  const templateSelectionKey = computeTemplateSelectionKey(selectedTemplateWeek, selectedTemplateDay);
  const rosterOverrides = useMemo(
    () => ({
      timeOverrides: rosterState.present.timeOverrides,
      laneOverrides: rosterState.present.laneOverrides,
    }),
    [rosterState.present.timeOverrides, rosterState.present.laneOverrides]
  );

  // ===== DATA QUERIES =====
  const { data: workbooksList = [], isLoading: workbooksLoading } = useQuery<WorkbookSummary[]>({
    queryKey: ["/api/admin/rostering/workbook-uploads"],
    staleTime: 5 * 60 * 1000,
    ...ROSTERING_QUERY_OPTIONS,
  });

  const activeWorkbookId = selectedWorkbookId || workbooksList[0]?.id || null;

  const activeWorkbookLabel = useMemo(() => {
    if (!activeWorkbookId) return "No workbook";
    return workbooksList.find((wb: WorkbookSummary) => wb.id === activeWorkbookId)?.name || "Workbook";
  }, [activeWorkbookId, workbooksList]);

  const requireActiveWorkbookId = useCallback(() => {
    if (!activeWorkbookId) {
      throw new Error("Select a workbook first.");
    }
    return activeWorkbookId;
  }, [activeWorkbookId]);

  const { data: workbookData, isLoading: workbookLoading } = useQuery<WorkbookFull>({
    queryKey: ["/api/admin/rostering/workbook-uploads", activeWorkbookId],
    enabled: !!activeWorkbookId,
    staleTime: 2 * 60 * 1000,
    ...ROSTERING_QUERY_OPTIONS,
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
    staleTime: 60 * 1000,
    ...ROSTERING_QUERY_OPTIONS,
  });
  const callTimesForEditor = useMemo(() => callTimesRaw, [callTimesRaw]);

  // Constraints
  const { data: constraintsRaw = [] } = useQuery<WorkerConstraintUI[]>({
    queryKey: ["/api/admin/rostering/workbooks", activeWorkbookId, "worker-constraints"],
    enabled: !!activeWorkbookId,
    staleTime: 60 * 1000,
    ...ROSTERING_QUERY_OPTIONS,
  });
  const constraintsForEditor = useMemo(() => constraintsRaw, [constraintsRaw]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(ROSTERING_PREFERENCES_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<{
        panelVisibility: Partial<PanelVisibility>;
        showAllWorkers: boolean;
        showOnlyTemplated: boolean;
        showHalfHourTicks: boolean;
        workerFilter: "all" | "over" | "under";
        snapMinutes: number;
        timelineZoomIndex: number;
        selectedTemplateWeek: TemplateWeekKey;
        selectedTemplateDay: WeekdayLabel;
      }>;
      if (parsed.panelVisibility) {
        setPanelVisibility({ ...defaultPanelVisibility, ...parsed.panelVisibility });
      }
      if (typeof parsed.showAllWorkers === "boolean") setShowAllWorkers(parsed.showAllWorkers);
      if (typeof parsed.showOnlyTemplated === "boolean") setShowOnlyTemplated(parsed.showOnlyTemplated);
      if (typeof parsed.showHalfHourTicks === "boolean") setShowHalfHourTicks(parsed.showHalfHourTicks);
      if (parsed.workerFilter) setWorkerFilter(parsed.workerFilter);
      if (typeof parsed.snapMinutes === "number") setSnapMinutes(parsed.snapMinutes);
      if (typeof parsed.timelineZoomIndex === "number") setTimelineZoomIndex(parsed.timelineZoomIndex);
      if (parsed.selectedTemplateWeek) setSelectedTemplateWeek(parsed.selectedTemplateWeek);
      if (parsed.selectedTemplateDay) setSelectedTemplateDay(parsed.selectedTemplateDay);
    } catch {
      // Ignore invalid preference payloads.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const payload = {
      panelVisibility,
      showAllWorkers,
      showOnlyTemplated,
      showHalfHourTicks,
      workerFilter,
      snapMinutes,
      timelineZoomIndex,
      selectedTemplateWeek,
      selectedTemplateDay,
    };
    window.localStorage.setItem(ROSTERING_PREFERENCES_KEY, JSON.stringify(payload));
  }, [panelVisibility, showAllWorkers, showOnlyTemplated, showHalfHourTicks, workerFilter, snapMinutes, timelineZoomIndex, selectedTemplateWeek, selectedTemplateDay]);

  // Saved states
  const { data: savedStates = [] } = useQuery<SavedRosterStateSummary[]>({
    queryKey: ["/api/admin/rostering/workbooks", activeWorkbookId, "saved-states"],
    enabled: !!activeWorkbookId,
    staleTime: 60 * 1000,
    ...ROSTERING_QUERY_OPTIONS,
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
    const term = deferredCareWorkerSearch.toLowerCase().trim();
    return careWorkerRosters.filter((worker: CareWorkerRoster) => {
      if (term && !worker.workerName.toLowerCase().includes(term)) return false;
      if (workerFilter === "all") return true;
      const summary = workerSummaryByKey.get(worker.key);
      const minutes = summary?.totalDurationMinutes ?? 0;
      if (workerFilter === "over") return minutes >= WORKLOAD_OVER_MINUTES;
      if (workerFilter === "under") return minutes > 0 && minutes <= WORKLOAD_UNDER_MINUTES;
      return true;
    });
  }, [careWorkerRosters, deferredCareWorkerSearch, workerFilter, workerSummaryByKey]);

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
  const baseTimelineLanes = useMemo(() => {
    if (!careWorkerRosters.length) return [];
    // Only filter by template key if showOnlyTemplated is enabled
    const filterKey = showOnlyTemplated ? templateSelectionKey : undefined;
    return buildAllWorkerLanes(careWorkerRosters, filterKey);
  }, [careWorkerRosters, templateSelectionKey, showOnlyTemplated]);

  const timelineLanes = useMemo(() => {
    const lanesWithOverrides = applyOverridesToLanes(baseTimelineLanes, rosterOverrides);
    if (!showOnlyTemplated) {
      return lanesWithOverrides;
    }
    const templatedLanes = lanesWithOverrides.map((lane) => ({
      ...lane,
      entries: lane.entries.filter((entry) => entry.isTemplated),
    }));
    const slotStats = new Map<string, { count: number; hasDoubleUp: boolean }>();
    const buildSlotKey = (entry: TimelineEntry) => {
      const serviceKey = entry.serviceUserKey || entry.serviceUserName || entry.title;
      return `${serviceKey}|${entry.startMinutes}|${entry.durationMinutes}|${entry.callTypeLabel ?? ""}`;
    };
    for (const lane of templatedLanes) {
      for (const entry of lane.entries) {
        const key = buildSlotKey(entry);
        const prev = slotStats.get(key);
        if (prev) {
          prev.count += 1;
          prev.hasDoubleUp = prev.hasDoubleUp || Boolean(entry.isDoubleUp);
        } else {
          slotStats.set(key, { count: 1, hasDoubleUp: Boolean(entry.isDoubleUp) });
        }
      }
    }
    const seenNonDoubleSlot = new Set<string>();
    return templatedLanes.map((lane) => ({
      ...lane,
      entries: lane.entries.filter((entry) => {
        const key = buildSlotKey(entry);
        const stats = slotStats.get(key);
        if (!stats || stats.count <= 1 || stats.hasDoubleUp) {
          return true;
        }
        if (seenNonDoubleSlot.has(key)) {
          return false;
        }
        seenNonDoubleSlot.add(key);
        return true;
      }),
    }));
  }, [baseTimelineLanes, rosterOverrides, showOnlyTemplated]);

  const timelineEntryIndex = useMemo(() => {
    const entryById = new Map<string, TimelineEntry>();
    const laneIdByEntryId = new Map<string, string>();
    for (const lane of timelineLanes) {
      for (const entry of lane.entries) {
        if (!entryById.has(entry.id)) {
          entryById.set(entry.id, entry);
          laneIdByEntryId.set(entry.id, lane.id);
        }
      }
    }
    return { entryById, laneIdByEntryId };
  }, [timelineLanes]);

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
    return timelineEntryIndex.entryById.get(selectedTimelineEntryId) ?? null;
  }, [selectedTimelineEntryId, timelineEntryIndex]);

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
  const timelineStats = useMemo(() => {
    const keys = new Set<string>();
    let totalCalls = 0;
    let totalMinutes = 0;
    let conflicts = 0;
    for (const lane of timelineLanes) {
      totalCalls += lane.entries.length;
      for (const entry of lane.entries) {
        if (entry.serviceUserKey) keys.add(entry.serviceUserKey);
        totalMinutes += entry.durationMinutes;
      }
      const sorted = [...lane.entries].sort((a, b) => a.startMinutes - b.startMinutes);
      for (let i = 0; i < sorted.length - 1; i++) {
        const curr = sorted[i];
        const next = sorted[i + 1];
        if (curr.startMinutes + curr.durationMinutes > next.startMinutes) {
          conflicts++;
        }
      }
    }
    return {
      totalServiceUsersCount: keys.size,
      totalCallsCount: totalCalls,
      totalHoursCount: Math.round((totalMinutes / 60) * 10) / 10,
      conflictsCount: conflicts,
    };
  }, [timelineLanes]);
  const totalServiceUsersCount = timelineStats.totalServiceUsersCount;
  const totalCallsCount = timelineStats.totalCallsCount;
  const totalHoursCount = timelineStats.totalHoursCount;
  const conflictsCount = timelineStats.conflictsCount;

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
  const callTimeLookup = useMemo(() => {
    const map = new Map<string, RecommendedCallTime>();
    for (const callTime of callTimesForEditor) {
      const key = `${callTime.serviceUserKey}::${(callTime.callTypeLabel || "").toLowerCase()}`;
      map.set(key, callTime);
    }
    return map;
  }, [callTimesForEditor]);

  // ===== MUTATIONS =====
  const saveCallTimeMutation = useMutation({
    mutationFn: async (callTime: RecommendedCallTime) => {
      const workbookId = requireActiveWorkbookId();
      const res = await apiRequest("POST", `/api/admin/rostering/workbooks/${workbookId}/call-times`, callTime);
      return parseApiResponse<RecommendedCallTime>(res);
    },
    onSuccess: () => {
      if (activeWorkbookId) {
        queryClient.invalidateQueries({
          queryKey: ["/api/admin/rostering/workbooks", activeWorkbookId, "call-times"],
        });
      }
      toast({ title: "Call time saved" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save call time", description: error.message, variant: "destructive" });
    },
  });

  const deleteCallTimeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/rostering/call-times/${id}`);
    },
    onSuccess: () => {
      if (activeWorkbookId) {
        queryClient.invalidateQueries({
          queryKey: ["/api/admin/rostering/workbooks", activeWorkbookId, "call-times"],
        });
      }
      toast({ title: "Call time deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete call time", description: error.message, variant: "destructive" });
    },
  });

  const saveConstraintMutation = useMutation({
    mutationFn: async (constraint: WorkerConstraintUI) => {
      const workbookId = requireActiveWorkbookId();
      const res = await apiRequest("POST", `/api/admin/rostering/workbooks/${workbookId}/worker-constraints`, constraint);
      return parseApiResponse<WorkerConstraintUI>(res);
    },
    onSuccess: () => {
      if (activeWorkbookId) {
        queryClient.invalidateQueries({
          queryKey: ["/api/admin/rostering/workbooks", activeWorkbookId, "worker-constraints"],
        });
      }
      toast({ title: "Constraint saved" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save constraint", description: error.message, variant: "destructive" });
    },
  });

  const deleteConstraintMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/rostering/worker-constraints/${id}`);
    },
    onSuccess: () => {
      if (activeWorkbookId) {
        queryClient.invalidateQueries({
          queryKey: ["/api/admin/rostering/workbooks", activeWorkbookId, "worker-constraints"],
        });
      }
      toast({ title: "Constraint deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete constraint", description: error.message, variant: "destructive" });
    },
  });

  const saveRosterStateMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const workbookId = requireActiveWorkbookId();
      const res = await apiRequest("POST", `/api/admin/rostering/workbooks/${workbookId}/saved-states`, {
        ...data,
        templateWeek: selectedTemplateWeek,
        templateDay: selectedTemplateDay,
        timeOverrides: rosterState.present.timeOverrides,
        laneOverrides: rosterState.present.laneOverrides,
      });
      return parseApiResponse<SavedRosterStateSummary>(res);
    },
    onSuccess: () => {
      if (activeWorkbookId) {
        queryClient.invalidateQueries({
          queryKey: ["/api/admin/rostering/workbooks", activeWorkbookId, "saved-states"],
        });
      }
      toast({ title: "Schedule saved" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save schedule", description: error.message, variant: "destructive" });
    },
  });

  const loadRosterStateMutation = useMutation({
    mutationFn: async (id: string) => {
      const state = savedStates.find((entry: SavedRosterStateSummary) => entry.id === id);
      if (!state) {
        throw new Error("Saved schedule not found.");
      }
      return state;
    },
    onSuccess: (data: SavedRosterStateSummary) => {
      dispatchRoster({
        type: "APPLY_OPTIMIZATION",
        timeOverrides: data.timeOverrides,
        laneOverrides: data.laneOverrides,
      });
      toast({ title: "Schedule loaded" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to load schedule", description: error.message, variant: "destructive" });
    },
  });

  const deleteRosterStateMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/rostering/saved-states/${id}`);
    },
    onSuccess: () => {
      if (activeWorkbookId) {
        queryClient.invalidateQueries({
          queryKey: ["/api/admin/rostering/workbooks", activeWorkbookId, "saved-states"],
        });
      }
      toast({ title: "Schedule deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete schedule", description: error.message, variant: "destructive" });
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
    const laneId = timelineEntryIndex.laneIdByEntryId.get(entry.id);
    if (laneId) {
      setSelectedCareWorkerKey(laneId);
    }
  }, [timelineEntryIndex]);

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


  const handleClearSelection = useCallback(() => {
    dispatchRoster({ type: "CLEAR_SELECTION" });
  }, []);

  const handleResetState = useCallback(() => {
    dispatchRoster({ type: "RESET" });
    toast({ title: "Schedule reset" });
  }, [toast]);

  const handleShowAllPanels = useCallback(() => {
    setPanelVisibility({
      timeline: true,
      map: true,
      workers: true,
      details: true,
      callTimes: true,
      constraints: true,
      workload: true,
      optimization: true,
      database: true,
      aiAnalysis: true,
      comparison: true,
      costs: true,
      templates: true,
    });
  }, []);

  const handleResetPanels = useCallback(() => {
    setPanelVisibility(defaultPanelVisibility);
  }, []);

  const handleCaptureBaseline = useCallback(() => {
    const snapshot = buildScheduleSnapshot(timelineLanes);
    setSavedComparisonData({
      before: snapshot,
      after: snapshot,
      changes: {
        timeShifts: 0,
        reassignments: 0,
        deletions: 0,
      },
    });
    setPanelVisibility((prev) => ({ ...prev, comparison: true }));
    toast({ title: "Baseline captured" });
  }, [buildScheduleSnapshot, timelineLanes, toast]);

  const handleClearComparison = useCallback(() => {
    setSavedComparisonData(null);
    setPanelVisibility((prev) => ({ ...prev, comparison: false }));
  }, []);

  const handleRunOptimization = useCallback(async () => {
    setIsOptimizing(true);
    try {
      const beforeSnapshot = buildScheduleSnapshot(timelineLanes);
      const result: OptimizationResult = runFullOptimization(
        timelineLanes,
        optimizationWeights,
        optimizationConstraints,
        undefined, // geocodedPoints
        {
          recommendedCallTimes: callTimesForEditor,
        }
      );
      const mergedTimeOverrides = {
        ...rosterState.present.timeOverrides,
        ...result.timeOverrides,
      };
      const mergedLaneOverrides = {
        ...rosterState.present.laneOverrides,
        ...result.laneOverrides,
      };
      const afterLanes = applyOverridesToLanes(baseTimelineLanes, {
        timeOverrides: mergedTimeOverrides,
        laneOverrides: mergedLaneOverrides,
      });
      setSavedComparisonData({
        before: beforeSnapshot,
        after: buildScheduleSnapshot(afterLanes),
        changes: {
          timeShifts: Object.keys(result.timeOverrides).length,
          reassignments: Object.keys(result.laneOverrides).length,
          deletions: 0,
        },
      });
      setPanelVisibility((prev) => ({ ...prev, comparison: true }));
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
  }, [buildScheduleSnapshot, timelineLanes, optimizationWeights, optimizationConstraints, callTimesForEditor, rosterState.present.timeOverrides, rosterState.present.laneOverrides, baseTimelineLanes, toast]);

  const handleApplyRecommendedTimes = useCallback(() => {
    let applied = 0;
    const timeOverrides: Record<string, number> = {};
    for (const lane of timelineLanes) {
      for (const entry of lane.entries) {
        const key = `${entry.serviceUserKey || ""}::${(entry.callTypeLabel || "").toLowerCase()}`;
        const rec = callTimeLookup.get(key);
        if (rec) {
          timeOverrides[entry.id] = rec.recommendedStartMinutes;
          applied++;
        }
      }
    }
    if (applied > 0) {
      const beforeSnapshot = buildScheduleSnapshot(timelineLanes);
      const mergedTimeOverrides = {
        ...rosterState.present.timeOverrides,
        ...timeOverrides,
      };
      const afterLanes = applyOverridesToLanes(baseTimelineLanes, {
        timeOverrides: mergedTimeOverrides,
        laneOverrides: rosterState.present.laneOverrides,
      });
      setSavedComparisonData({
        before: beforeSnapshot,
        after: buildScheduleSnapshot(afterLanes),
        changes: {
          timeShifts: applied,
          reassignments: 0,
          deletions: 0,
        },
      });
      setPanelVisibility((prev) => ({ ...prev, comparison: true }));
      dispatchRoster({
        type: "APPLY_OPTIMIZATION",
        timeOverrides,
      });
    }
    toast({ title: `Applied ${applied} recommended times` });
  }, [buildScheduleSnapshot, timelineLanes, callTimeLookup, baseTimelineLanes, rosterState.present.timeOverrides, rosterState.present.laneOverrides, toast]);

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

  const handleExportPDF = useCallback(async () => {
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
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
    } catch {
      toast({ title: "PDF export failed", variant: "destructive" });
    }
  }, [timelineLanes, selectedTemplateWeek, selectedTemplateDay, toast]);

  const handleExportExcel = useCallback(async () => {
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

    try {
      const { exportRosterToExcel } = await import("@/lib/rostering/excelExport");
      exportRosterToExcel(
        exportData,
        `roster-${selectedTemplateWeek}-${selectedTemplateDay}.xlsx`
      );
      toast({ title: "Excel file exported" });
    } catch {
      toast({ title: "Excel export failed", variant: "destructive" });
    }
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
  const mainPanelDefaultSize = panelVisibility.workers
    ? panelVisibility.details
      ? 63
      : 88
    : panelVisibility.details
      ? 75
      : 100;
  const hasComparisonPanel = Boolean(panelVisibility.comparison && savedComparisonData);
  const hasAdditionalBottomPanel =
    panelVisibility.callTimes ||
    panelVisibility.constraints ||
    panelVisibility.workload ||
    panelVisibility.optimization ||
    panelVisibility.database ||
    panelVisibility.aiAnalysis ||
    hasComparisonPanel ||
    panelVisibility.costs ||
    panelVisibility.templates;
  const hasBottomPanels = Boolean(
    panelVisibility.map ||
      panelVisibility.callTimes ||
      panelVisibility.constraints ||
      panelVisibility.workload ||
      panelVisibility.optimization ||
      panelVisibility.database ||
      panelVisibility.aiAnalysis ||
      hasComparisonPanel ||
      panelVisibility.costs ||
      panelVisibility.templates
  );
  const timelineDefaultSize = hasBottomPanels ? 55 : 100;
  const bottomDefaultSize = panelVisibility.timeline ? 45 : 100;
  const bottomPanelWeights: Record<BottomPanelKey, number> = {
    map: hasAdditionalBottomPanel ? 38 : 100,
    callTimes: 20,
    constraints: 20,
    workload: 18,
    optimization: 20,
    database: 20,
    aiAnalysis: 22,
    comparison: 20,
    costs: 18,
    templates: 20,
  };
  const bottomVisiblePanelKeys = useMemo(
    () =>
      BOTTOM_PANEL_KEYS.filter((key) => {
        if (key === "comparison") return hasComparisonPanel;
        return Boolean(panelVisibility[key]);
      }),
    [hasComparisonPanel, panelVisibility],
  );
  const bottomPanelDefaultSizes = useMemo(() => {
    const sizes: Record<string, number> = {};
    const totalWeight = bottomVisiblePanelKeys.reduce((sum, panelKey) => sum + bottomPanelWeights[panelKey], 0);
    let used = 0;
    for (let index = 0; index < bottomVisiblePanelKeys.length; index += 1) {
      const key = bottomVisiblePanelKeys[index];
      const isLast = index === bottomVisiblePanelKeys.length - 1;
      const nextSize = isLast
        ? Math.max(0, 100 - used)
        : Math.round((bottomPanelWeights[key] / Math.max(totalWeight, 1)) * 1000) / 10;
      sizes[key] = nextSize;
      used += nextSize;
    }
    return sizes;
  }, [bottomVisiblePanelKeys, bottomPanelWeights]);

  if (isLoading) {
    return (
      <div className="rstd-loading">
        <div className="rstd-loading-orb">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
        <p className="rstd-loading-text">Loading Rostering Studio</p>
      </div>
    );
  }

  if (!workbooksList.length) {
    return (
      <div className="rstd-empty">
        <div className="rstd-loading-orb">
          <Database className="h-8 w-8 text-primary" />
        </div>
        <div className="space-y-2 text-center">
          <p className="rstd-loading-text">No roster data loaded</p>
          <p className="text-xs text-muted-foreground">
            Upload workbook data in Testing Features, then return here to plan and optimize the roster.
          </p>
        </div>
        <Button asChild size="sm" className="gap-2">
          <Link href="/testing-features">
            <ArrowLeft className="h-4 w-4" />
            Open Workbook Uploads
          </Link>
        </Button>
      </div>
    );
  }

  // ===== RENDER =====
  return (
    <TooltipProvider>
      <div className={embedded ? "flex h-full min-h-0 flex-1 flex-col" : "page-shell max-w-none"}>
        {/* IMPORTANT: Use `h-full` (not `h-screen`) because Layout already owns the viewport height. */}
        <div className={`rostering-studio-redesign flex ${embedded ? "h-full min-h-0" : "min-h-[72vh] flex-1"} flex-col overflow-hidden`}>
        {/* TOP MENU BAR */}
        <div className="rstd-topbar flex min-h-14 flex-wrap items-start gap-3 px-3 py-2 flex-shrink-0">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <div className="rstd-brand">
              <span className="rstd-brand-mark">RS</span>
              <div className="rstd-brand-copy">
                <p className="rstd-brand-title">Rostering Studio</p>
                <p className="rstd-brand-subtitle">Operational Command Deck</p>
              </div>
            </div>
            <Badge variant="secondary" className="max-w-[16rem] truncate text-[10px] px-2">
              {activeWorkbookLabel}
            </Badge>
            {!embedded && (
              <Button variant="ghost" size="sm" asChild className="mr-1 h-7 w-7 p-0">
                <Link href="/dashboard">
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
                <DropdownMenuItem onClick={handleShowAllPanels}>
                  <Eye className="mr-2 h-4 w-4" />
                  Show All Panels
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleResetPanels}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Reset Panel Layout
                </DropdownMenuItem>
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
                <DropdownMenuItem onClick={handleCaptureBaseline}>
                  <GitCompare className="mr-2 h-4 w-4" />
                  Capture Baseline
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleClearComparison}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear Comparison
                </DropdownMenuItem>
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
          <div className="flex w-full flex-wrap items-center justify-start gap-1 sm:ml-auto sm:w-auto sm:justify-end">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:bg-primary/20 transition-colors"
              onClick={() => setSelectedTemplateWeek((p) => (p === "week1" ? "week2" : "week1"))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Badge variant="secondary" className="text-[11px] font-semibold px-3 py-1 shadow-[var(--shadow-xs)] bg-primary/90 text-primary-foreground">
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
        <div className="rstd-stats flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-[11px] flex-shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="rstd-stat-chip">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-semibold">{totalWorkersCount}</span>
              <span className="text-muted-foreground">Workers</span>
            </div>
            <div className="rstd-stat-chip">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-semibold">{totalServiceUsersCount}</span>
              <span className="text-muted-foreground">Service Users</span>
            </div>
            <div className="rstd-stat-chip">
              <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-semibold">{totalCallsCount}</span>
              <span className="text-muted-foreground">Calls</span>
            </div>
            <div className="rstd-stat-chip">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-semibold">{totalHoursCount}</span>
              <span className="text-muted-foreground">Hours</span>
            </div>
            <div className="rstd-stat-chip">
              {conflictsCount > 0 ? (
                <AlertTriangle className="h-3 w-3 text-destructive" />
              ) : (
                <CheckCircle2 className="h-3 w-3 text-success" />
              )}
              <span className={`font-semibold ${conflictsCount > 0 ? "text-destructive" : "text-success"}`}>
                {conflictsCount}
              </span>
              <span className="text-muted-foreground">Conflicts</span>
            </div>
            <div className="rstd-stat-chip">
              <Users className="h-3 w-3 text-muted-foreground" />
              <span className="font-semibold">{doubleUpsCount}</span>
              <span className="text-muted-foreground">2-ups</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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

        {/* PANEL DOCK - quick toggles so every tool is reachable without hunting menus */}
        <div className="rstd-dock flex min-h-10 flex-wrap items-start gap-1.5 px-2 py-1.5 text-[11px] flex-shrink-0">
          {(
            [
              { key: "workers", label: "Workers", icon: Users },
              { key: "timeline", label: "Timeline", icon: Timer },
              { key: "details", label: "Details", icon: Eye },
              { key: "map", label: "Map", icon: MapIcon },
              { key: "callTimes", label: "Call Times", icon: Clock },
              { key: "constraints", label: "Constraints", icon: UserCog },
              { key: "workload", label: "Workload", icon: BarChart3 },
              { key: "optimization", label: "Optimize", icon: Sliders },
              { key: "database", label: "Database", icon: Database },
              { key: "aiAnalysis", label: "AI", icon: Brain },
              { key: "comparison", label: "Compare", icon: GitCompare },
              { key: "costs", label: "Costs", icon: Calculator },
              { key: "templates", label: "Templates", icon: BookTemplate },
            ] as Array<{
              key: keyof PanelVisibility;
              label: string;
              icon: any;
            }>
          ).map((item) => {
            const Icon = item.icon;
            const isOn = panelVisibility[item.key];
            return (
              <Button
                key={item.key}
                type="button"
                size="sm"
                variant={isOn ? "default" : "outline"}
                className="h-6 px-2 text-[10px] shrink-0"
                onClick={() => togglePanel(item.key)}
                title={item.label}
              >
                <Icon className="h-3.5 w-3.5 mr-1" />
                {item.label}
              </Button>
            );
          })}
          <div className="flex w-full items-center gap-1 shrink-0 sm:ml-auto sm:w-auto sm:justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[10px]"
              onClick={handleCaptureBaseline}
            >
              Baseline
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[10px]"
              onClick={handleClearComparison}
              disabled={!savedComparisonData}
            >
              Clear
            </Button>
            <Badge variant="secondary" className="text-[10px]">
              Snap: {snapMinutes}m
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              Buffer: {optimizationConstraints.minBufferMinutes ?? defaultConstraints.minBufferMinutes}m
            </Badge>
          </div>
        </div>

        {/* MAIN WORKSPACE - Grid Layout */}
        <div className="rstd-main flex min-h-0 flex-1 overflow-hidden">
          <ResizablePanelGroup direction="horizontal" className="h-full">
            {/* LEFT SIDEBAR - Workers */}
            {panelVisibility.workers && (
              <>
                <ResizablePanel
                  id="rstd-left-workers"
                  order={1}
                  defaultSize={12}
                  minSize={8}
                  maxSize={18}
                  className="min-h-0"
                >
                  <div className="rstd-panel rstd-panel-workers flex h-full min-h-0 flex-col border-r">
                    <div className="rstd-panel-head flex items-center justify-between px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-primary" />
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-foreground">Workers</span>
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0.5 h-5 font-semibold bg-primary/10 text-primary border-primary/20">
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
                    <ScrollArea className="rstd-scroll-area flex-1 min-h-0">
                      <div className="px-1.5 pb-2">
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
                                  ? "bg-gradient-to-r from-primary/20 to-primary/10 border border-primary/30 shadow-[var(--shadow-xs)]" 
                                  : "hover:bg-muted/60 hover:shadow-[var(--shadow-xs)]"
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
                      </div>
                    </ScrollArea>
                  </div>
                </ResizablePanel>
                <ResizableHandle withHandle />
              </>
            )}

            {/* MAIN CONTENT - Resizable Layout */}
                <ResizablePanel id="rstd-main" order={2} defaultSize={mainPanelDefaultSize} className="min-h-0">
              <ResizablePanelGroup direction="vertical" className="h-full">
                {/* Top Row: Timeline */}
                {panelVisibility.timeline && (
                  <ResizablePanel
                    id="rstd-main-timeline"
                    order={1}
                    defaultSize={timelineDefaultSize}
                    minSize={30}
                    maxSize={80}
                    className="overflow-hidden"
                  >
                  <div className="h-full flex flex-col overflow-hidden">
                    <div className="rstd-panel-head flex items-center justify-between px-3 py-2 shrink-0">
                      <div className="flex items-center gap-2">
                        <Timer className="h-4 w-4 text-primary" />
                        <span className="text-[11px] font-semibold uppercase tracking-wide">Timeline</span>
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
                    <div className="rstd-scroll-native flex-1 min-h-0 p-0.5">
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
                        showHeader={false}
                      />
                    </div>
                  </div>
                  </ResizablePanel>
                )}
                
                {panelVisibility.timeline && hasBottomPanels && (
                  <ResizableHandle withHandle />
                )}

                {/* Bottom Row: Horizontal panels */}
                {hasBottomPanels && (
                  <ResizablePanel
                    id="rstd-main-bottom"
                    order={2}
                    defaultSize={bottomDefaultSize}
                    minSize={20}
                    maxSize={70}
                    className="overflow-hidden"
                  >
                <ResizablePanelGroup direction="horizontal" className="h-full">
                  {/* Map Panel */}
                  {panelVisibility.map && (
                    <ResizablePanel
                      id="rstd-bottom-map"
                      order={1}
                      defaultSize={bottomPanelDefaultSizes.map}
                      minSize={12}
                      className="min-h-0"
                    >
                    <div className="h-full min-w-0 min-h-0 flex flex-col">
                      <div className="rstd-panel-head rstd-panel-head-map flex items-center gap-2 px-3 py-2">
                        <MapIcon className="h-4 w-4 text-primary" />
                        <span className="text-[11px] font-semibold uppercase tracking-wide">Map</span>
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0.5 font-semibold bg-primary/10 text-primary border-primary/20">
                          {routeEntriesSorted.length}
                        </Badge>
                      </div>
                      <div className="flex-1 min-h-0 overflow-hidden">
                        <Suspense fallback={<PanelLoading label="map" />}>
                          <RouteMapViewLazy entries={routeEntriesSorted} />
                        </Suspense>
                      </div>
                    </div>
                    </ResizablePanel>
                  )}
                  
                  {panelVisibility.map && (panelVisibility.callTimes || panelVisibility.constraints || panelVisibility.workload || panelVisibility.optimization || panelVisibility.database || panelVisibility.aiAnalysis || hasComparisonPanel || panelVisibility.costs || panelVisibility.templates) && (
                    <ResizableHandle withHandle />
                  )}

                  {/* Call Times Panel */}
                  {panelVisibility.callTimes && (
                    <ResizablePanel
                      id="rstd-bottom-call-times"
                      order={2}
                      defaultSize={bottomPanelDefaultSizes.callTimes}
                      minSize={8}
                      className="min-h-0"
                    >
                    <div className="h-full min-w-0 min-h-0 border-r flex flex-col">
                      <div className="rstd-panel-head rstd-panel-head-call-times flex items-center gap-2 px-3 py-2">
                        <Clock className="h-4 w-4 text-secondary" />
                        <span className="text-[11px] font-semibold uppercase tracking-wide">Call Times</span>
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0.5 font-semibold bg-secondary/10 text-secondary border-secondary/20">
                          {callTimesForEditor.length}
                        </Badge>
                      </div>
                      <ScrollArea className="rstd-scroll-area flex-1 min-h-0">
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
                    </ResizablePanel>
                  )}
                  
                  {panelVisibility.callTimes && (panelVisibility.constraints || panelVisibility.workload || panelVisibility.optimization || panelVisibility.database || panelVisibility.aiAnalysis || hasComparisonPanel || panelVisibility.costs || panelVisibility.templates) && (
                    <ResizableHandle withHandle />
                  )}

                  {/* Constraints Panel */}
                  {panelVisibility.constraints && (
                    <ResizablePanel
                      id="rstd-bottom-constraints"
                      order={3}
                      defaultSize={bottomPanelDefaultSizes.constraints}
                      minSize={8}
                      className="min-h-0"
                    >
                    <div className="h-full min-w-0 min-h-0 border-r flex flex-col">
                      <div className="rstd-panel-head rstd-panel-head-constraints flex items-center gap-2 px-3 py-2">
                        <UserCog className="h-4 w-4 text-warning" />
                        <span className="text-[11px] font-semibold uppercase tracking-wide">Constraints</span>
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0.5 font-semibold bg-warning/100/10 text-warning border-warning/20">
                          {constraintsForEditor.length}
                        </Badge>
                      </div>
                      <ScrollArea className="rstd-scroll-area flex-1 min-h-0">
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
                    </ResizablePanel>
                  )}
                  
                  {panelVisibility.constraints && (panelVisibility.workload || panelVisibility.optimization || panelVisibility.database || panelVisibility.aiAnalysis || hasComparisonPanel || panelVisibility.costs || panelVisibility.templates) && (
                    <ResizableHandle withHandle />
                  )}

                  {/* Workload Heatmap */}
                  {panelVisibility.workload && (
                    <ResizablePanel
                      id="rstd-bottom-workload"
                      order={4}
                      defaultSize={bottomPanelDefaultSizes.workload}
                      minSize={8}
                      className="min-h-0"
                    >
                    <div className="h-full min-w-0 min-h-0 border-r flex flex-col">
                      <div className="rstd-panel-head rstd-panel-head-workload flex items-center gap-2 px-3 py-2">
                        <BarChart3 className="h-4 w-4 text-success" />
                        <span className="text-[11px] font-semibold uppercase tracking-wide">Workload</span>
                      </div>
                      <div className="rstd-scroll-native flex-1 min-h-0 p-0.5">
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
                    </ResizablePanel>
                  )}
                  
                  {panelVisibility.workload && (panelVisibility.optimization || panelVisibility.database || panelVisibility.aiAnalysis || hasComparisonPanel || panelVisibility.costs || panelVisibility.templates) && (
                    <ResizableHandle withHandle />
                  )}

                  {/* Optimization Panel */}
                  {panelVisibility.optimization && (
                    <ResizablePanel
                      id="rstd-bottom-optimization"
                      order={5}
                      defaultSize={bottomPanelDefaultSizes.optimization}
                      minSize={8}
                      className="min-h-0"
                    >
                    <div className="h-full min-w-0 min-h-0 border-r flex flex-col">
                      <div className="rstd-panel-head rstd-panel-head-optimization flex items-center gap-2 px-3 py-2">
                        <Sliders className="h-4 w-4 text-warning" />
                        <span className="text-[11px] font-semibold uppercase tracking-wide">Optimization</span>
                      </div>
                      <ScrollArea className="rstd-scroll-area flex-1 min-h-0">
                        <div className="h-full p-0.5">
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
                    </ResizablePanel>
                  )}
                  
                  {panelVisibility.optimization && (panelVisibility.database || panelVisibility.aiAnalysis || hasComparisonPanel || panelVisibility.costs || panelVisibility.templates) && (
                    <ResizableHandle withHandle />
                  )}

                  {/* Database Panel */}
                  {panelVisibility.database && (
                    <ResizablePanel
                      id="rstd-bottom-database"
                      order={6}
                      defaultSize={bottomPanelDefaultSizes.database}
                      minSize={8}
                      className="min-h-0"
                    >
                    <div className="h-full min-w-0 min-h-0 flex flex-col">
                      <div className="rstd-panel-head flex items-center gap-2 px-3 py-2">
                        <Database className="h-4 w-4 text-muted-foreground" />
                        <span className="text-[11px] font-semibold uppercase tracking-wide">Database</span>
                      </div>
                      <ScrollArea className="rstd-scroll-area flex-1 min-h-0">
                        <div className="p-0.5">
                          <Suspense fallback={<PanelLoading label="database tools" />}>
                            <AdminDatabasePanelLazy />
                          </Suspense>
                        </div>
                      </ScrollArea>
                    </div>
                    </ResizablePanel>
                  )}
                  
                  {panelVisibility.database && (panelVisibility.aiAnalysis || hasComparisonPanel || panelVisibility.costs || panelVisibility.templates) && (
                    <ResizableHandle withHandle />
                  )}

                  {/* AI Analysis Panel */}
                  {panelVisibility.aiAnalysis && (
                    <ResizablePanel
                      id="rstd-bottom-ai-analysis"
                      order={7}
                      defaultSize={bottomPanelDefaultSizes.aiAnalysis}
                      minSize={8}
                      className="min-h-0"
                    >
                    <div className="h-full min-w-0 min-h-0 flex flex-col">
                      <div className="rstd-panel-head rstd-panel-head-ai flex items-center gap-2 px-3 py-2">
                        <Brain className="h-4 w-4 text-primary" />
                        <span className="text-[11px] font-semibold uppercase tracking-wide">AI Schedule Analysis</span>
                      </div>
                      <ScrollArea className="rstd-scroll-area flex-1 min-h-0">
                        <div className="p-0.5">
                          {activeWorkbookId && (
                            <Suspense fallback={<PanelLoading label="AI analysis" />}>
                              <ScheduleAnalysisDashboardLazy
                                workbookId={activeWorkbookId}
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
                            </Suspense>
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                    </ResizablePanel>
                  )}
                  
                  {panelVisibility.aiAnalysis && (hasComparisonPanel || panelVisibility.costs || panelVisibility.templates) && (
                    <ResizableHandle withHandle />
                  )}

                  {/* Schedule Comparison Panel */}
                  {panelVisibility.comparison && savedComparisonData && (
                    <ResizablePanel
                      id="rstd-bottom-comparison"
                      order={8}
                      defaultSize={bottomPanelDefaultSizes.comparison}
                      minSize={8}
                      className="min-h-0"
                    >
                    <div className="h-full min-w-0 min-h-0 flex flex-col">
                      <div className="rstd-panel-head rstd-panel-head-comparison flex items-center gap-2 px-3 py-2">
                        <GitCompare className="h-4 w-4 text-secondary" />
                        <span className="text-[11px] font-semibold uppercase tracking-wide">Schedule Comparison</span>
                      </div>
                      <ScrollArea className="rstd-scroll-area flex-1 min-h-0">
                        <div className="p-0.5">
                          {activeWorkbookId && (
                            <Suspense fallback={<PanelLoading label="comparison" />}>
                              <ScheduleComparisonLazy
                                workbookId={activeWorkbookId}
                                beforeSchedule={savedComparisonData.before}
                                afterSchedule={savedComparisonData.after}
                                changes={savedComparisonData.changes}
                              />
                            </Suspense>
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                    </ResizablePanel>
                  )}
                  
                  {panelVisibility.comparison && savedComparisonData && (panelVisibility.costs || panelVisibility.templates) && (
                    <ResizableHandle withHandle />
                  )}

                  {/* Cost Analysis Panel */}
                  {panelVisibility.costs && (
                    <ResizablePanel
                      id="rstd-bottom-costs"
                      order={9}
                      defaultSize={bottomPanelDefaultSizes.costs}
                      minSize={8}
                      className="min-h-0"
                    >
                    <div className="h-full min-w-0 min-h-0 flex flex-col">
                      <div className="rstd-panel-head rstd-panel-head-costs flex items-center gap-2 px-3 py-2">
                        <Calculator className="h-4 w-4 text-success" />
                        <span className="text-[11px] font-semibold uppercase tracking-wide">Cost Analysis</span>
                      </div>
                      <ScrollArea className="rstd-scroll-area flex-1 min-h-0">
                        <div className="p-0.5">
                          <Suspense fallback={<PanelLoading label="cost analysis" />}>
                            <CostAnalysisDashboardLazy
                              workers={workerSummaries.map(ws => ({
                                name: ws.workerName,
                                totalMinutes: ws.totalDurationMinutes,
                                travelDistanceMeters: 0, // Calculate from route data if available
                              }))}
                            />
                          </Suspense>
                        </div>
                      </ScrollArea>
                    </div>
                    </ResizablePanel>
                  )}
                  
                  {panelVisibility.costs && panelVisibility.templates && (
                    <ResizableHandle withHandle />
                  )}

                  {/* Template Library Panel */}
                  {panelVisibility.templates && (
                    <ResizablePanel
                      id="rstd-bottom-templates"
                      order={10}
                      defaultSize={bottomPanelDefaultSizes.templates}
                      minSize={8}
                      className="min-h-0"
                    >
                    <div className="h-full min-w-0 min-h-0 flex flex-col">
                      <div className="rstd-panel-head rstd-panel-head-templates flex items-center gap-2 px-3 py-2">
                        <BookTemplate className="h-4 w-4 text-destructive" />
                        <span className="text-[11px] font-semibold uppercase tracking-wide">Template Library</span>
                      </div>
                      <ScrollArea className="rstd-scroll-area flex-1 min-h-0">
                        <div className="p-0.5">
                          {activeWorkbookId && (
                            <Suspense fallback={<PanelLoading label="templates" />}>
                              <ScheduleTemplateLibraryLazy
                                workbookId={activeWorkbookId}
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
                            </Suspense>
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                    </ResizablePanel>
                  )}

                  {/* Placeholder when no bottom panels visible */}
                  {!panelVisibility.map && !panelVisibility.callTimes && !panelVisibility.constraints && 
                   !panelVisibility.workload && !panelVisibility.optimization && !panelVisibility.database &&
                   !panelVisibility.aiAnalysis && !hasComparisonPanel && !panelVisibility.costs && !panelVisibility.templates && (
                    <ResizablePanel id="rstd-bottom-empty" order={11} defaultSize={100} className="min-h-0">
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-xs gap-3">
                      <Layers className="h-12 w-12 text-muted-foreground/50" />
                      <div className="text-center space-y-1">
                        <p className="font-medium text-sm">No panels visible</p>
                        <p className="text-[10px]">Use <kbd className="px-1.5 py-0.5 bg-muted rounded text-[9px] font-mono">View</kbd> menu to show panels</p>
                      </div>
                    </div>
                    </ResizablePanel>
                  )}
                </ResizablePanelGroup>
                  </ResizablePanel>
                )}
              </ResizablePanelGroup>
            </ResizablePanel>

            {/* RIGHT SIDEBAR - Details */}
            {panelVisibility.details && (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel
                  id="rstd-right-details"
                  order={3}
                  defaultSize={25}
                  minSize={15}
                  maxSize={35}
                  className="min-h-0"
                >
                  <div className="rstd-panel rstd-panel-details flex h-full min-h-0 flex-col border-l">
                    <div className="rstd-panel-head px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <Eye className="h-3.5 w-3.5  text-primary" />
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-foreground">Details</span>
                      </div>
                    </div>
                    <ScrollArea className="rstd-scroll-area flex-1 min-h-0">
                      <div className="p-2 space-y-2.5">
                        {/* Selected Visit Details */}
                        <div className="rounded-lg border bg-gradient-to-br from-primary/5 to-transparent p-2 shadow-[var(--shadow-xs)]">
                          <p className="text-[9px] uppercase tracking-wide text-primary/70 font-semibold mb-1.5 flex items-center gap-1">
                            <Clock4 className="h-3 w-3" />
                            Selected Visit
                          </p>
                          {selectedTimelineEntry ? (
                            <div className="space-y-1.5">
                              <p className="text-[12px] font-semibold leading-tight">{selectedTimelineEntry.title}</p>
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
      </div>
    </TooltipProvider>
  );
}
