import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type * as React from "react";
import { SafeXLSX, RawXLSX, type WorkBook } from "@/lib/safe-xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/use-debounce";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createHash } from "@/lib/utils";
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
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock4,
  Copy,
  FileText,
  Download,
  FileSpreadsheet,
  Filter,
  FlaskConical,
  Library,
  Loader2,
  Maximize2,
  Minimize2,
  Route,
  Save,
  Search,
  Shield,
  SlidersHorizontal,
  Timer,
  TrendingUp,
  UploadCloud,
  Users,
  Zap,
} from "lucide-react";

const ROW_BATCH_SIZE = 250;
const INITIAL_VISIBLE_ROWS = 75;

const TREND_MIN_CALLS = 4;
const TREND_CONSISTENCY = 0.7;
const TREND_MIN_AVG_OFFSET_MINUTES = 30;
const TREND_BUCKET_MINUTES = 15;

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
const COMPANY_OPTIONS = ["Dalecare", "Perfect Care"] as const;
const BRANCH_OPTIONS = [
  "Newcastle/North Tyneside",
  "Durham",
  "Gateshead",
  "South Tyneside",
] as const;
type TemplateWeekKey = (typeof TEMPLATE_WEEK_OPTIONS)[number]["key"];
type WeekdayLabel = (typeof WEEKDAY_OPTIONS)[number];
const DEFAULT_TEMPLATE_WEEK: TemplateWeekKey = "week1";
const DEFAULT_TEMPLATE_DAY: WeekdayLabel = WEEKDAY_OPTIONS[0];
const TEMPLATE_WEEK_1_START_DAY_NUMBER = Math.floor(Date.UTC(2000, 0, 3) / 86400000);

const PLANNED_TIME_KEYWORDS = [
  "planned start date and time",
  "planned start time",
  "planned start",
  "planned time",
  "scheduled time",
  "plan time",
  "expected time",
  "appointment time",
];

const ACTUAL_TIME_KEYWORDS = [
  "actual start date and time",
  "actual start time",
  "actual time",
  "delivered time",
  "visit time",
  "call time",
  "arrival time",
  "check-in time",
];

const PLANNED_END_TIME_KEYWORDS = [
  "planned end date and time",
  "planned end time",
  "scheduled end date and time",
  "scheduled end time",
  "planned finish",
  "scheduled finish",
  "plan end",
  "end time (planned)",
];

const ACTUAL_END_TIME_KEYWORDS = [
  "actual end date and time",
  "actual end time",
  "delivered end time",
  "visit end time",
  "call end time",
  "check-out time",
  "checkout time",
  "departure time",
  "left time",
  "end time (actual)",
];

const SERVICE_REQUIREMENT_TIME_KEYWORDS = [
  "service requirement start date and time",
  "service requirement start time",
  "service requirement time",
  "requirement start time",
];
const SERVICE_REQUIREMENT_END_TIME_KEYWORDS = [
  "service requirement end date and time",
  "service requirement end time",
  "service requirement finish time",
  "requirement end time",
];

const PLANNED_DATE_KEYWORDS = [
  "planned date",
  "planned start date",
  "scheduled date",
  "scheduled start date",
  "service requirement date",
  "visit date",
  "call date",
];

const PLANNED_DURATION_KEYWORDS = [
  "planned duration",
  "scheduled duration",
  "expected duration",
  "plan duration",
];

const ACTUAL_DURATION_KEYWORDS = [
  "actual duration",
  "recorded duration",
  "delivered duration",
  "actual call duration",
  "actual visit duration",
  "call duration",
  "visit duration",
];

const GENERIC_DURATION_KEYWORDS = ["duration", "mins", "minutes"];

const PLANNED_WORKER_KEYWORDS = [
  "planned employee",
  "planned worker",
  "scheduled worker",
  "scheduled employee",
  "assigned worker",
  "assigned employee",
  "planned carer",
  "assigned carer",
];

const ACTUAL_WORKER_KEYWORDS = [
  "actual employee",
  "actual worker",
  "actual carer",
  "delivered worker",
  "delivered employee",
  "attending worker",
  "attending employee",
  "visiting carer",
];

const GENERIC_WORKER_KEYWORDS = [
  "care worker",
  "carer",
  "staff",
  "worker",
  "caregiver",
  "employee name",
];
const TEMPLATE_WORKER_KEYWORDS = [
  "template employee name",
  "template employee",
  "template worker",
  "template carer",
  "template care worker",
  "templated employee name",
  "templated employee",
  "templated worker",
  "templated carer",
  "template staff",
];
const PAYROLL_RUN_DESCRIPTION_KEYWORDS = [
  "payroll run description",
  "payrollrundescription",
];
const SERVICE_TYPE_DESCRIPTION_KEYWORDS = [
  "planned service type description",
  "service type description",
  "service type",
];
const SERVICE_DUTY_CLASS_TYPE_KEYWORDS = [
  "servicetypecustom servicedutyclasstype",
  "service duty class type",
  "service duty class",
  "duty class type",
  "servicedutyclasstype",
];
const ADHOC_KEYWORDS = ["adhoc", "ad hoc", "ad-hoc"];
const TIME_CRITICAL_KEYWORDS = [
  "time critical",
  "time-critical",
  "critical time",
  "is time critical",
  "time critical visit",
  "time critical call",
];

const SERVICE_USER_NAME_KEYWORDS = [
  "service user",
  "service user name",
  "customer name",
  "client",
  "client name",
  "client full name",
  "service location name",
  "service location",
  "resident",
  "person",
  "individual",
  "patient",
  "su name",
  "people we support",
  "participant",
  "customer",
];

const SERVICE_USER_AREA_KEYWORDS = [
  "region",
  "zone",
  "patch",
  "team",
  "borough",
  "customer area",
  "service user area",
  "service location area",
  "service user branch",
  "service location branch",
  "customer branch",
];
const SERVICE_LOCATION_BRANCH_KEYWORDS = [
  "service location branch",
  "service user branch",
  "customer branch",
];
const SERVICE_LOCATION_TYPE_KEYWORDS = [
  "service location type",
  "location type",
  "service user type",
  "customer type",
  "client type",
  "service location category",
];

const SERVICE_USER_ADDRESS_KEYWORDS = [
  "street",
  "road",
  "postcode",
  "post code",
  "zip",
  "city",
  "town",
  "service location address",
  "customer address",
];

const SERVICE_REQUIREMENT_TYPE_KEYWORDS = [
  "service requirement type description",
  "service requirement description",
  "service requirement type",
];
const SERVICE_REQUIREMENT_SERVICE_TYPE_KEYWORDS = [
  "service requirement service type description",
  "service requirement service description",
];

type RowStatus = "clean" | "attention";

interface RowAnalysis {
  rowNumber: number;
  status: RowStatus;
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
  serviceRequirementServiceTypeDescription?: string | null;
  serviceRequirementTypeDescription?: string | null;
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
  normalizedServiceUserKey?: string | null;
  isDuplicateSlotRow?: boolean;
  isDoubleUpSlot?: boolean;
  doubleUpWorkers?: string[];
  doubleUpSlotKey?: string | null;
  excludeFromMetrics?: boolean;
  callTypeLabel?: string | null;
  templateWeek?: "week1" | "week2" | null;
  templateDay?: string | null;
}

interface FileMeta {
  name: string;
  size: number;
  type: string;
  totalRows: number;
}

type DetectedField = {
  key: string;
  value: any;
} | null;

interface CallGroup {
  key: string;
  serviceUserName: string | null;
  serviceUserArea: string | null;
  serviceUserAddress: string | null;
  plannedTimeLabel: string | null;
  plannedTimeMinutes: number | null;
  normalizedServiceUserKey: string | null;
  rows: RowAnalysis[];
}

interface ServiceUserStack {
  key: string;
  normalizedServiceUserKey: string | null;
  serviceUserName: string | null;
  serviceUserArea: string | null;
  serviceUserAddress: string | null;
  rows: RowAnalysis[];
}

interface DuplicateCluster {
  key: string;
  serviceUserName: string | null;
  serviceUserArea: string | null;
  serviceUserAddress: string | null;
  plannedDateLabel: string | null;
  plannedTimeLabel: string | null;
  rows: RowAnalysis[];
}

interface SlotTrendSummary {
  key: string;
  serviceUserName: string | null;
  serviceUserArea: string | null;
  serviceUserAddress: string | null;
  callTypeLabel: string;
  totalCalls: number;
  callsWithTimes: number;
  averageStartOffsetMinutes: number | null;
  offsetConsistency: number | null;
  averageActualStartMinutes: number | null;
  averagePlannedStartMinutes: number | null;
  suggestedPlannedTimeLabel: string | null;
  callsWithDurations: number;
  averageDurationPercent: number | null;
  suggestedPlannedDurationMinutes: number | null;
  advice: string[];
  tone: InsightTone;
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

interface TemplateOverride {
  week1Days: WeekdayLabel[];
  week2Days: WeekdayLabel[];
  requirementStartMinutes: number | null;
}

interface ResolvedWorkerCallGroup extends WorkerCallGroup {
  overrideKey: string;
  effectiveTemplateWeekdayKeys: Set<string>;
  effectiveRequirementStartMinutes: number | null;
  effectiveRequirementStartLabel: string | null;
  effectiveTimeBandLabel: string;
  overrideWeek1Days: WeekdayLabel[];
  overrideWeek2Days: WeekdayLabel[];
  hasTemplateOverride: boolean;
  isDoubleUpForSelection: boolean;
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

interface ShiftBarEntry {
  startMinutes: number | null;
  endMinutes: number | null;
  durationMinutes: number;
}

interface OptimizedRouteEntry {
  key: string;
  serviceUserName: string | null;
  serviceUserArea: string | null;
  serviceUserAddress: string | null;
  callTypeLabel: string;
  timeBandLabel: string;
  requirementStartMinutes: number | null;
  scheduledStartMinutes: number | null;
  scheduledEndMinutes: number | null;
  durationMinutes: number | null;
  shiftMinutes: number | null;
  recommendedStartMinutes: number | null;
  travelMinutesEstimated: number | null;
  isTimeCritical: boolean;
  isDoubleUp: boolean;
  windowStartMinutes: number | null;
  windowEndMinutes: number | null;
  isOutsideWindow: boolean;
  hasWindowConflict: boolean;
  suggestedStartMinutes?: number | null;
}

interface CareWorkerRotaPayload {
  workerName: string;
  workerKey: string;
  templateWeek: TemplateWeekKey;
  templateDay: WeekdayLabel;
  timeCriticalWindowEnforced: boolean;
  shiftBars: ShiftBarEntry[];
  optimizedRun: OptimizedRouteEntry[];
}

export default function TestingFeatures() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";
  const [fileMeta, setFileMeta] = useState<FileMeta | null>(null);
  const [sourceHash, setSourceHash] = useState<string | null>(null);
  const [analysisResults, setAnalysisResults] = useState<RowAnalysis[]>([]);
  const [processingState, setProcessingState] = useState<
    "idle" | "parsing" | "analyzing" | "complete"
  >("idle");
  const [progress, setProgress] = useState(0);
  const [convertedBlob, setConvertedBlob] = useState<Blob | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<RowAnalysis | null>(null);
  const [filterStatus, setFilterStatus] = useState<RowStatus | "all">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 200);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_ROWS);
  const tableRef = useRef<HTMLDivElement | null>(null);
  const [tableScrollTop, setTableScrollTop] = useState(0);
  const [tableViewportHeight, setTableViewportHeight] = useState(480);
  const [showDuplicateRows, setShowDuplicateRows] = useState(false);
  // Filter presets state
  const [filterPresets, setFilterPresets] = useState<Array<{
    id: string;
    name: string;
    status: RowStatus | "all";
    searchTerm: string;
    showDuplicates: boolean;
    includeCancelled: boolean;
    includeMismatched: boolean;
  }>>([]);
  const [filterHistory, setFilterHistory] = useState<Array<{
    status: RowStatus | "all";
    searchTerm: string;
    timestamp: number;
  }>>([]);
  const [includeCancelledCalls, setIncludeCancelledCalls] = useState(false);
  const [includeMismatchedWorkers, setIncludeMismatchedWorkers] = useState(false);
  const [excludeOfficeStaffFromPdf, setExcludeOfficeStaffFromPdf] = useState(false);
  const [callGroupSearch, setCallGroupSearch] = useState("");
  const debouncedCallGroupSearch = useDebounce(callGroupSearch, 200);
  const [careWorkerSearch, setCareWorkerSearch] = useState("");
  const debouncedCareWorkerSearch = useDebounce(careWorkerSearch, 200);
  const [rosterCallSearch, setRosterCallSearch] = useState("");
  const debouncedRosterCallSearch = useDebounce(rosterCallSearch, 200);
  const [selectedTemplateWeek, setSelectedTemplateWeek] = useState<TemplateWeekKey>(DEFAULT_TEMPLATE_WEEK);
  const [selectedTemplateDay, setSelectedTemplateDay] = useState<WeekdayLabel>(DEFAULT_TEMPLATE_DAY);
  const [enforceTimeCriticalWindow, setEnforceTimeCriticalWindow] = useState(false);
  const [packCallsBackToBack, setPackCallsBackToBack] = useState(true);
  const [useObservedAverages, setUseObservedAverages] = useState(true);
  const [templateOverrides, setTemplateOverrides] = useState<Record<string, TemplateOverride>>({});
  const [expandedTemplateGroupKeys, setExpandedTemplateGroupKeys] = useState<string[]>([]);
  const [selectedCareWorkerKey, setSelectedCareWorkerKey] = useState<string | null>(null);
  const [selectedWorkerCallKeys, setSelectedWorkerCallKeys] = useState<string[]>([]);
  const [recommendedTemplates, setRecommendedTemplates] = useState<Record<string, string[]>>({});
  const [isSavingRota, setIsSavingRota] = useState(false);
  const [isSavingAllRotas, setIsSavingAllRotas] = useState(false);
  const [bulkSaveProgress, setBulkSaveProgress] = useState<{ saved: number; skipped: number; total: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [rosteringFullscreen, setRosteringFullscreen] = useState(false);
  const [isSavingWorkbook, setIsSavingWorkbook] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  // Comparison mode state
  const [comparisonSnapshot, setComparisonSnapshot] = useState<{
    fileMeta: FileMeta;
    summary: typeof summary;
    healthSummary: typeof healthSummary;
    primaryRowCount: number;
  } | null>(null);
  const [isComparisonMode, setIsComparisonMode] = useState(false);
  const analysisJobRef = useRef<number>(0);
  const dragCounterRef = useRef(0);
  const showGlobalProgress = processingState === "parsing" || processingState === "analyzing";
  const queryClient = useQueryClient();

  // Save workbook mutation
  const saveWorkbookMutation = useMutation({
    mutationFn: async (payload: {
      name: string;
      fileName: string;
      sourceHash: string;
      company: string;
      branch: string;
      totalRows: number;
      careWorkerCount: number;
      serviceUserCount: number;
      callGroupCount: number;
      rowAnalysis?: RowAnalysis[];
      callGroups?: any[];
      careWorkerRosters: any[];
      doubleUpSlots: Record<string, string[]>;
    }) => {
      const res = await fetch("/api/admin/rostering/workbook-uploads/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: payload.name,
          fileName: payload.fileName,
          sourceHash: payload.sourceHash,
          company: payload.company,
          branch: payload.branch,
          totalRows: payload.totalRows,
          careWorkerCount: payload.careWorkerCount,
          serviceUserCount: payload.serviceUserCount,
          callGroupCount: payload.callGroupCount,
          rowAnalysis: payload.rowAnalysis ?? [],
        }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to ingest workbook" }));
        throw new Error(error.message || "Failed to ingest workbook");
      }
      return res.json();
    },
    onSuccess: (data: { deduped?: boolean }) => {
      toast({
        title: data.deduped ? "Upload already exists" : "Workbook ingested",
        description: data.deduped
          ? "This upload already exists in the library."
          : "Your workbook analysis has been saved as extracted data.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rostering/workbook-uploads"] });
      setIsSavingWorkbook(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Save failed",
        description: error.message,
        variant: "destructive",
      });
      setIsSavingWorkbook(false);
    },
  });

  const scrollToAnchor = useCallback((anchorId: string) => {
    const target = document.getElementById(anchorId);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_ROWS);
  }, [filterStatus, searchTerm, fileMeta?.name]);

  useEffect(() => {
    const node = tableRef.current;
    if (!node) return;
    const update = () => setTableViewportHeight(node.clientHeight || 480);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setSelectedRow(null);
    setCallGroupSearch("");
  }, [fileMeta?.name]);

  useEffect(() => {
    setDownloadUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });

    if (!convertedBlob) {
      return;
    }

    const url = URL.createObjectURL(convertedBlob);
    setDownloadUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [convertedBlob]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      const isMeta = e.metaKey || e.ctrlKey;

      // Escape: Clear selection
      if (e.key === "Escape") {
        setSelectedRow(null);
        return;
      }

      // 1/2/3: Quick filter status
      if (e.key === "1" && !isMeta) {
        e.preventDefault();
        setFilterStatus("all");
        return;
      }
      if (e.key === "2" && !isMeta) {
        e.preventDefault();
        setFilterStatus("clean");
        return;
      }
      if (e.key === "3" && !isMeta) {
        e.preventDefault();
        setFilterStatus("attention");
        return;
      }

      // D: Toggle duplicate rows
      if (e.key === "d" && !isMeta) {
        e.preventDefault();
        setShowDuplicateRows((prev) => !prev);
        return;
      }

      // R: Reset filters
      if (e.key === "r" && !isMeta && e.shiftKey) {
        e.preventDefault();
        setFilterStatus("all");
        setSearchTerm("");
        setShowDuplicateRows(false);
        toast({ title: "Filters reset" });
        return;
      }

      // ?: Show keyboard shortcuts help
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        toast({
          title: "Keyboard Shortcuts",
          description: "1/2/3: Filter status | D: Toggle duplicates | Shift+R: Reset | Esc: Clear selection | ?: Help",
        });
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toast]);

  const normalizeColumnLabel = useCallback((label: string, index: number) => {
    if (!label || label.startsWith("__EMPTY")) {
      return `Column ${index + 1}`;
    }
    return label;
  }, []);

  const runRowAnalysis = useCallback(
    (row: Record<string, any>, index: number): RowAnalysis => {
      const entries = Object.entries(row);
      const emptyFields = entries
        .filter(([, value]) => value === null || value === undefined || value === "")
        .map(([key], columnIndex) => normalizeColumnLabel(key, columnIndex));
      const numericWarnings = entries
        .filter(([, value]) => value !== null && value !== "" && value !== undefined)
        .filter(([, value]) => !Number.isNaN(Number(value)))
        .filter(([, value]) => Number(value) < 0)
        .map(([key], columnIndex) => normalizeColumnLabel(key, columnIndex));
      const textWarnings = entries
        .filter(([, value]) => typeof value === "string" && value.length > 240)
        .map(([key], columnIndex) => normalizeColumnLabel(key, columnIndex));

      const issues: string[] = [];
      if (numericWarnings.length) {
        issues.push(`${numericWarnings.length} negative value${numericWarnings.length > 1 ? "s" : ""}`);
      }
      if (textWarnings.length) {
        issues.push(`${textWarnings.length} long text field${textWarnings.length > 1 ? "s" : ""}`);
      }

      const plannedTimeField = detectField(row, PLANNED_TIME_KEYWORDS);
      const serviceRequirementTimeField = detectField(
        row,
        SERVICE_REQUIREMENT_TIME_KEYWORDS,
        plannedTimeField ? new Set([plannedTimeField.key]) : undefined
      );
      const plannedTimeSource = serviceRequirementTimeField ?? plannedTimeField;
      const plannedDateField = detectDateField(
        row,
        PLANNED_DATE_KEYWORDS,
        (() => {
          const exclude = new Set<string>();
          if (plannedTimeField) exclude.add(plannedTimeField.key);
          if (serviceRequirementTimeField) exclude.add(serviceRequirementTimeField.key);
          return exclude.size ? exclude : undefined;
        })()
      );
      const actualTimeField = detectField(
        row,
        ACTUAL_TIME_KEYWORDS,
        (() => {
          const exclude = new Set<string>();
          if (plannedTimeField) exclude.add(plannedTimeField.key);
          if (serviceRequirementTimeField) exclude.add(serviceRequirementTimeField.key);
          return exclude.size ? exclude : undefined;
        })()
      );

      const plannedEndTimeField = detectField(
        row,
        PLANNED_END_TIME_KEYWORDS,
        (() => {
          const exclude = new Set<string>();
          if (plannedTimeField) exclude.add(plannedTimeField.key);
          if (serviceRequirementTimeField) exclude.add(serviceRequirementTimeField.key);
          return exclude.size ? exclude : undefined;
        })()
      );

      const actualEndTimeField = detectField(
        row,
        ACTUAL_END_TIME_KEYWORDS,
        (() => {
          const exclude = new Set<string>();
          if (plannedTimeField) exclude.add(plannedTimeField.key);
          if (serviceRequirementTimeField) exclude.add(serviceRequirementTimeField.key);
          if (actualTimeField) exclude.add(actualTimeField.key);
          return exclude.size ? exclude : undefined;
        })()
      );
      const serviceRequirementEndTimeField = detectField(
        row,
        SERVICE_REQUIREMENT_END_TIME_KEYWORDS,
        (() => {
          const exclude = new Set<string>();
          if (plannedTimeField) exclude.add(plannedTimeField.key);
          if (serviceRequirementTimeField) exclude.add(serviceRequirementTimeField.key);
          if (plannedEndTimeField) exclude.add(plannedEndTimeField.key);
          if (actualEndTimeField) exclude.add(actualEndTimeField.key);
          if (actualTimeField) exclude.add(actualTimeField.key);
          return exclude.size ? exclude : undefined;
        })()
      );

      const plannedDurationField = detectField(row, PLANNED_DURATION_KEYWORDS);
      const actualDurationField = detectField(
        row,
        ACTUAL_DURATION_KEYWORDS,
        plannedDurationField ? new Set([plannedDurationField.key]) : undefined
      );

      const templateWorkerField = detectField(row, TEMPLATE_WORKER_KEYWORDS);
      let plannedWorkerField = detectField(
        row,
        PLANNED_WORKER_KEYWORDS,
        templateWorkerField ? new Set([templateWorkerField.key]) : undefined
      );
      if (!plannedWorkerField) {
        plannedWorkerField = detectField(
          row,
          GENERIC_WORKER_KEYWORDS,
          templateWorkerField ? new Set([templateWorkerField.key]) : undefined
        );
      }
      const actualWorkerExclude = (() => {
        const exclude = new Set<string>();
        if (plannedWorkerField) exclude.add(plannedWorkerField.key);
        if (templateWorkerField) exclude.add(templateWorkerField.key);
        return exclude.size ? exclude : undefined;
      })();
      let actualWorkerField = detectField(row, ACTUAL_WORKER_KEYWORDS, actualWorkerExclude);
      if (!actualWorkerField) {
        actualWorkerField = detectField(row, GENERIC_WORKER_KEYWORDS, actualWorkerExclude);
      }

      const serviceDutyClassField = detectField(row, SERVICE_DUTY_CLASS_TYPE_KEYWORDS);
      const payrollRunDescriptionField = detectField(row, PAYROLL_RUN_DESCRIPTION_KEYWORDS);
      const serviceTypeDescriptionField = detectField(row, SERVICE_TYPE_DESCRIPTION_KEYWORDS);
      const adhocField = detectField(row, ADHOC_KEYWORDS);
      const timeCriticalField = detectField(row, TIME_CRITICAL_KEYWORDS);

      const plannedTimeMinutes = plannedTimeSource
        ? parseTimeToMinutes(plannedTimeSource.value)
        : null;
      const serviceRequirementTimeMinutes = serviceRequirementTimeField
        ? parseTimeToMinutes(serviceRequirementTimeField.value)
        : null;
      const serviceRequirementEndTimeMinutes = serviceRequirementEndTimeField
        ? parseTimeToMinutes(serviceRequirementEndTimeField.value)
        : null;
      const actualTimeMinutes = actualTimeField ? parseTimeToMinutes(actualTimeField.value) : null;
      const plannedEndTimeMinutes = plannedEndTimeField ? parseTimeToMinutes(plannedEndTimeField.value) : null;
      const actualEndTimeMinutes = actualEndTimeField ? parseTimeToMinutes(actualEndTimeField.value) : null;
      const scheduleDeltaMinutes =
        plannedTimeMinutes !== null && actualTimeMinutes !== null
          ? actualTimeMinutes - plannedTimeMinutes
          : null;
      // Prefer the date embedded in the planned start datetime when it exists.
      // (Avoids accidental fallbacks like Planned Start Date Year => 01/01/YYYY.)
      const plannedDateParts = (() => {
        const fromPlannedStart = deriveDateParts(plannedTimeSource?.value);
        if (fromPlannedStart.key) return fromPlannedStart;
        return deriveDateParts(plannedDateField?.value);
      })();

      const templateWorkerName = sanitizeStringValue(templateWorkerField?.value);
      const plannedWorkerName = sanitizeStringValue(plannedWorkerField?.value);
      const actualWorkerName = sanitizeStringValue(actualWorkerField?.value);
      const payrollRunDescription = sanitizeHumanReadable(payrollRunDescriptionField?.value);
      const payrollRunNormalized = payrollRunDescription
        ? normalizeKeyForMatch(payrollRunDescription).replace(/&/g, "and").replace(/\s+/g, " ").trim()
        : null;
      const isAdminStaffRow = payrollRunNormalized === "admin wages and overtime";
      const serviceTypeDescriptionRaw = sanitizeHumanReadable(serviceTypeDescriptionField?.value);
      const serviceTypeNormalizedRaw = serviceTypeDescriptionRaw ? normalizeKeyForMatch(serviceTypeDescriptionRaw) : null;
      const serviceDutyClassRaw = sanitizeStringValue(serviceDutyClassField?.value);
      const serviceDutyClassType = serviceDutyClassRaw ? serviceDutyClassRaw.trim().toUpperCase() : null;
      const serviceDutyClassPrefix = serviceDutyClassType ? serviceDutyClassType[0] : null;
      const isExcludedServiceDutyClass = serviceDutyClassPrefix === "A" || serviceDutyClassPrefix === "S";
      const adhocFallbackValue =
        adhocField?.value ??
        (Object.prototype.hasOwnProperty.call(row, "AA")
          ? (row as Record<string, any>)["AA"]
          : Object.prototype.hasOwnProperty.call(row, "aa")
          ? (row as Record<string, any>)["aa"]
          : null);
      const isAdhocCall = isTruthyValue(adhocFallbackValue);
      const isTimeCritical = isTruthyValue(timeCriticalField?.value);
      const normalizedPlannedWorker = normalizeWorkerName(plannedWorkerName);
      const normalizedActualWorker = normalizeWorkerName(actualWorkerName);
      const workersMatch =
        normalizedPlannedWorker && normalizedActualWorker
          ? normalizedPlannedWorker === normalizedActualWorker
          : null;

      const serviceRequirementDurationMinutesFromTimes = computeDurationFromTimes(
        serviceRequirementTimeMinutes,
        serviceRequirementEndTimeMinutes
      );
      const plannedDurationMinutesFromTimes = computeDurationFromTimes(plannedTimeMinutes, plannedEndTimeMinutes);
      const actualDurationMinutesFromTimes = computeDurationFromTimes(actualTimeMinutes, actualEndTimeMinutes);

      const plannedDurationMinutesFromField = plannedDurationField
        ? parseDurationToMinutes(plannedDurationField.value, plannedDurationField?.key)
        : null;
      const actualDurationMinutesFromField = actualDurationField
        ? parseDurationToMinutes(actualDurationField.value, actualDurationField?.key)
        : null;

      // Prefer time-derived durations (matches the requested definition), fallback to duration fields.
      const plannedDurationMinutes =
        serviceRequirementDurationMinutesFromTimes ?? plannedDurationMinutesFromTimes ?? plannedDurationMinutesFromField;
      const actualDurationMinutes = actualDurationMinutesFromTimes ?? actualDurationMinutesFromField;

      const hasDurationComparison =
        typeof plannedDurationMinutes === "number" && plannedDurationMinutes > 0 && typeof actualDurationMinutes === "number";
      const durationMatchPercent = hasDurationComparison
        ? (actualDurationMinutes / plannedDurationMinutes) * 100
        : null;

      const scheduleFlag =
        typeof scheduleDeltaMinutes === "number" &&
        Math.abs(scheduleDeltaMinutes) > 120 &&
        workersMatch === true;

      const durationFlag =
        durationMatchPercent !== null && durationMatchPercent < DURATION_SHORTFALL_THRESHOLD_PERCENT;
      const durationOverrunFlag =
        durationMatchPercent !== null && durationMatchPercent > DURATION_OVERRUN_THRESHOLD_PERCENT;

      const serviceUserNameField = detectField(row, SERVICE_USER_NAME_KEYWORDS);
      const serviceLocationNameField = detectField(
        row,
        ["service location name", "customer name"],
        serviceUserNameField ? new Set([serviceUserNameField.key]) : undefined
      );

      // Prefer explicit customer/service location fields; avoid employee/care worker columns.
      const serviceUserAreaField =
        detectFieldExcludingWorkerColumns(
          row,
          [
            "customer area",
            "service location area",
            "service user area",
            "customer branch",
            "service location branch",
            "service user branch",
          ],
          serviceUserNameField ? new Set([serviceUserNameField.key]) : undefined
        ) ??
        detectFieldExcludingWorkerColumns(
          row,
          ["area", "branch"],
          serviceUserNameField ? new Set([serviceUserNameField.key]) : undefined
        );

      const serviceUserAddressField =
        detectFieldExcludingWorkerColumns(
          row,
          ["service location address", "customer address"],
          serviceUserNameField ? new Set([serviceUserNameField.key]) : undefined
        ) ??
        detectFieldExcludingWorkerColumns(
          row,
          ["postcode", "post code", "address"],
          serviceUserNameField ? new Set([serviceUserNameField.key]) : undefined
        );
      const serviceLocationBranchField = detectFieldExcludingWorkerColumns(
        row,
        SERVICE_LOCATION_BRANCH_KEYWORDS,
        serviceUserNameField ? new Set([serviceUserNameField.key]) : undefined
      );
      const serviceLocationTypeField = detectFieldExcludingWorkerColumns(
        row,
        SERVICE_LOCATION_TYPE_KEYWORDS,
        serviceUserNameField ? new Set([serviceUserNameField.key]) : undefined
      );
      const serviceLocationAddressField = detectField(
        row,
        ["service location address", "customer address"],
        serviceUserAddressField ? new Set([serviceUserAddressField.key]) : undefined
      );

      const serviceRequirementTypeField = detectField(row, SERVICE_REQUIREMENT_TYPE_KEYWORDS);
      const serviceRequirementServiceTypeField = detectField(
        row,
        SERVICE_REQUIREMENT_SERVICE_TYPE_KEYWORDS,
        serviceRequirementTypeField ? new Set([serviceRequirementTypeField.key]) : undefined
      );
      const serviceRequirementFallbackField = detectField(
        row,
        ["planned service requirement type description", "planned service type description", "actual service requirement type description", "actual service type description"],
        (() => {
          const exclude = new Set<string>();
          if (serviceRequirementTypeField) exclude.add(serviceRequirementTypeField.key);
          if (serviceRequirementServiceTypeField) exclude.add(serviceRequirementServiceTypeField.key);
          return exclude.size ? exclude : undefined;
        })()
      );
      // Service requirement fields:
      // - "Service Requirement Service Type Description" is the broad category (e.g., Personal Care / Time Critical).
      // - "Service Requirement Type Description" is the roster call type (e.g., AM / Lunch / Tea / Bed).
      const serviceRequirementServiceTypeDescription = sanitizeHumanReadable(serviceRequirementServiceTypeField?.value);
      const serviceRequirementTypeDescription = sanitizeHumanReadable(serviceRequirementTypeField?.value);

      const callTypeLabel =
        serviceRequirementTypeDescription ??
        sanitizeHumanReadable(serviceRequirementFallbackField?.value) ??
        serviceRequirementServiceTypeDescription;
      const callTypeNormalized = callTypeLabel ? normalizeKeyForMatch(callTypeLabel) : null;
      const serviceTypeDescription =
        serviceRequirementServiceTypeDescription ?? serviceTypeDescriptionRaw ?? null;
      const serviceTypeNormalized =
        serviceTypeDescription ? normalizeKeyForMatch(serviceTypeDescription) : serviceTypeNormalizedRaw;
      const isShiftBar =
        (serviceTypeNormalized ? serviceTypeNormalized.includes("shift") : false) ||
        (callTypeNormalized ? callTypeNormalized.includes("shift") : false);

      const serviceUserName = sanitizeHumanReadable(serviceLocationNameField?.value ?? serviceUserNameField?.value);
      const serviceUserArea = sanitizeHumanReadable(serviceUserAreaField?.value);
      const serviceUserAddress = sanitizeHumanReadable(
        serviceLocationAddressField?.value ?? serviceUserAddressField?.value
      );
      const serviceLocationBranch = sanitizeHumanReadable(serviceLocationBranchField?.value);
      const serviceLocationType = sanitizeHumanReadable(serviceLocationTypeField?.value);
      const normalizedServiceUserKey = createNormalizedServiceUserKey(
        serviceUserName,
        serviceUserAddress,
        serviceUserArea
      );

      // Cancelled calls are indicated by a blank actual employee name; ignore them.
      const isCancelledCall = !actualWorkerName && !isShiftBar;
      const excludeFromMetrics = workersMatch === false || isCancelledCall || isShiftBar;
      if (workersMatch === false) {
        issues.push("Care worker mismatch");
      }
      if (isCancelledCall) {
        issues.push("Cancelled call (no actual carer)");
      }

      if (scheduleFlag) {
        issues.push("Same carer drifted from plan by > 2h");
      }
      if (durationFlag) {
        issues.push(`Actual duration under ${DURATION_SHORTFALL_THRESHOLD_PERCENT}% of plan`);
      }
      if (durationOverrunFlag) {
        issues.push(`Actual duration over ${DURATION_OVERRUN_THRESHOLD_PERCENT}% of plan`);
      }

      const status: RowStatus = issues.length ? "attention" : "clean";

      return {
        rowNumber: index + 1,
        status,
        data: row,
        emptyFields,
        numericWarnings,
        textWarnings,
        issues,
        scheduleDeltaMinutes,
        durationMatchPercent,
        scheduleFlag,
        durationFlag,
        durationOverrunFlag,
        workersMatch,
        plannedWorker: plannedWorkerName,
        actualWorker: actualWorkerName,
        templateWorker: templateWorkerName,
        payrollRunDescription,
        serviceTypeDescription,
        serviceRequirementServiceTypeDescription: serviceRequirementServiceTypeDescription ?? null,
        serviceRequirementTypeDescription: serviceRequirementTypeDescription ?? null,
        isAdminStaffRow,
        isShiftBar,
        serviceDutyClassType,
        isExcludedServiceDutyClass,
        isAdhocCall,
        isTimeCritical,
        plannedTimeLabel: deriveTimeLabel(plannedTimeMinutes, plannedTimeSource?.value),
        actualTimeLabel: deriveTimeLabel(actualTimeMinutes, actualTimeField?.value),
        plannedDurationMinutes,
        actualDurationMinutes,
        plannedTimeMinutes,
        actualTimeMinutes,
        serviceRequirementTimeMinutes,
        serviceRequirementTimeLabel: deriveTimeLabel(serviceRequirementTimeMinutes, serviceRequirementTimeField?.value),
        serviceRequirementEndTimeMinutes,
        serviceRequirementEndTimeLabel: deriveTimeLabel(
          serviceRequirementEndTimeMinutes,
          serviceRequirementEndTimeField?.value
        ),
        plannedEndTimeMinutes,
        actualEndTimeMinutes,
        plannedDateLabel: plannedDateParts.label,
        plannedDateKey: plannedDateParts.key,
        serviceUserName,
        serviceUserArea,
        serviceUserAddress,
        serviceLocationBranch,
        serviceLocationType,
        normalizedServiceUserKey,
        isDuplicateSlotRow: false,
        excludeFromMetrics,
        callTypeLabel,
      };
    },
    [normalizeColumnLabel]
  );

  const analyzeRows = useCallback(
    async (rows: Record<string, any>[], jobId: number) => {
      setAnalysisResults([]);
      if (!rows.length) {
        setProgress(100);
        return;
      }

      let batch: RowAnalysis[] = [];
      for (let i = 0; i < rows.length; i += 1) {
        if (analysisJobRef.current !== jobId) {
          return;
        }

        batch.push(runRowAnalysis(rows[i], i));
        const shouldFlush = batch.length === ROW_BATCH_SIZE || i === rows.length - 1;

        if (shouldFlush) {
          const flushed = batch;
          batch = [];

          setAnalysisResults((prev) => {
            if (analysisJobRef.current !== jobId) {
              return prev;
            }
            return [...prev, ...flushed];
          });

          setProgress(Math.round(((i + 1) / rows.length) * 100));
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
      }
    },
    [runRowAnalysis]
  );

  const processFile = useCallback(
    async (file: File) => {
      if (!isAdmin) {
        toast({
          title: "Restricted access",
          description: "Administrator access is required to use Testing Features.",
          variant: "destructive",
        });
        return;
      }
      if (!file.name.toLowerCase().match(/\.(csv|xlsx|xls)$/)) {
        toast({
          title: "Unsupported file",
          description: "Please upload a CSV, XLS, or XLSX file.",
          variant: "destructive",
        });
        return;
      }

      const jobId = Date.now();
      analysisJobRef.current = jobId;
      setProcessingState("parsing");
      setProgress(0);
      setFileMeta(null);
      setSourceHash(null);
      setConvertedBlob(null);
      setSelectedRow(null);
      setAnalysisResults([]);
      setSearchTerm("");
      setFilterStatus("all");
      setShowDuplicateRows(false);
      setCallGroupSearch("");
      setCareWorkerSearch("");
      setSelectedTemplateWeek(DEFAULT_TEMPLATE_WEEK);
      setSelectedTemplateDay(DEFAULT_TEMPLATE_DAY);
      setEnforceTimeCriticalWindow(false);
      setTemplateOverrides({});
      setExpandedTemplateGroupKeys([]);
      setSelectedCareWorkerKey(null);
      setSelectedWorkerCallKeys([]);
      setVisibleCount(INITIAL_VISIBLE_ROWS);
      setIncludeCancelledCalls(false);
      setIncludeMismatchedWorkers(false);

      try {
        const isCsv = file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";
        let workbook: WorkBook;
        let fileSourceHash: string | null = null;

        if (isCsv) {
          const text = await file.text();
          fileSourceHash = await createHash(text);
          workbook = SafeXLSX.read(text, { type: "string" });

          const buffer = SafeXLSX.write(workbook, { bookType: "xlsx", type: "array" });
          setConvertedBlob(
            new Blob([buffer], {
              type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            })
          );
        } else {
          const data = await file.arrayBuffer();
          fileSourceHash = await createHash(data);
          workbook = SafeXLSX.read(data, { type: "array" });
          setConvertedBlob(null);
        }

        if (!workbook.SheetNames.length) {
          throw new Error("No worksheets found.");
        }

        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = SafeXLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: "" });

        setSourceHash(fileSourceHash);
        setFileMeta({
          name: file.name,
          size: file.size,
          type: isCsv ? "CSV (converted to XLSX)" : "Excel",
          totalRows: rows.length,
        });

        toast({
          title: "File ready",
          description: `Loaded ${rows.length.toLocaleString()} rows for analysis.`,
        });

        setProcessingState("analyzing");
        await analyzeRows(rows, jobId);
        if (analysisJobRef.current === jobId) {
          setProcessingState("complete");
          setProgress(100);
        }
      } catch (error) {
        console.error(error);
        setSourceHash(null);
        toast({
          title: "Unable to process file",
          description: error instanceof Error ? error.message : "Unexpected error occurred.",
          variant: "destructive",
        });
        setProcessingState("idle");
      }
    },
    [analyzeRows, isAdmin, toast]
  );

  const handleFileChange = useCallback(
    async (event: any) => {
      const file = event.target.files?.[0];
      if (!file) return;
      await processFile(file);
      event.target.value = "";
    },
    [processFile]
  );

  const handleDrop = useCallback(
    async (event: any) => {
      event.preventDefault();
      event.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragging(false);
      const file = event.dataTransfer?.files?.[0];
      if (file) {
        await processFile(file);
      }
    },
    [processFile]
  );

  const handleDragEnter = useCallback((event: any) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current += 1;
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: any) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((event: any) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const usableRows = useMemo(
    () =>
      analysisResults.filter((row) => {
        const isCancelled = !row.actualWorker && !row.isShiftBar;
        const isMismatch = row.workersMatch === false;
        if (!includeCancelledCalls && isCancelled) return false;
        if (!includeMismatchedWorkers && isMismatch) return false;
        return true;
      }),
    [analysisResults, includeCancelledCalls, includeMismatchedWorkers]
  );

  const excludedCounts = useMemo(() => {
    let cancelled = 0;
    let mismatched = 0;
    analysisResults.forEach((row) => {
      const isCancelled = !row.actualWorker && !row.isShiftBar;
      const isMismatch = row.workersMatch === false;
      if (!includeCancelledCalls && isCancelled) cancelled += 1;
      if (!includeMismatchedWorkers && isMismatch) mismatched += 1;
    });
    return {
      cancelled,
      mismatched,
      total: cancelled + mismatched,
    };
  }, [analysisResults, includeCancelledCalls, includeMismatchedWorkers]);

  // Pre-compute double-up slot workers map for use in dedup
  const precomputedDoubleUpWorkers = useMemo(() => {
    const map = new Map<string, Set<string>>();
    analysisResults.forEach((row) => {
      if (row.isExcludedServiceDutyClass || row.isAdhocCall || row.isShiftBar) return;
      const slotKey = buildDoubleUpSlotKey(row);
      if (!slotKey) return;
      const workerName = getRowAssignedWorkerName(row);
      if (!workerName) return;
      const set = map.get(slotKey) ?? new Set<string>();
      set.add(workerName); // Store original name for display
      map.set(slotKey, set);
    });
    return map;
  }, [analysisResults]);

  const dedupedResults = useMemo(() => {
    if (!usableRows.length) return [];
    const seen = new Map<string, boolean>();
    return usableRows.map((row) => {
      const duplicateKey = buildDuplicateSlotKey(row);
      const doubleUpSlotKey = buildDoubleUpSlotKey(row);
      
      // Check if this slot has multiple workers (double-up call)
      const doubleUpWorkersSet = doubleUpSlotKey ? precomputedDoubleUpWorkers.get(doubleUpSlotKey) : null;
      const isDoubleUp = doubleUpWorkersSet && doubleUpWorkersSet.size > 1;
      const doubleUpWorkers = isDoubleUp ? Array.from(doubleUpWorkersSet!) : undefined;
      
      if (!duplicateKey) {
        return { 
          ...row, 
          isDuplicateSlotRow: false,
          isDoubleUpSlot: isDoubleUp || false,
          doubleUpWorkers,
          doubleUpSlotKey,
        };
      }
      if (seen.has(duplicateKey)) {
        // True duplicate: same worker appearing twice for the same slot
        return {
          ...row,
          status: "attention" as RowStatus,
          isDuplicateSlotRow: true,
          isDoubleUpSlot: isDoubleUp || false,
          doubleUpWorkers,
          doubleUpSlotKey,
          issues: row.issues.includes("Duplicate row (same worker, same slot)")
            ? row.issues
            : [...row.issues, "Duplicate row (same worker, same slot)"],
        };
      }
      seen.set(duplicateKey, true);
      return { 
        ...row, 
        isDuplicateSlotRow: false,
        isDoubleUpSlot: isDoubleUp || false,
        doubleUpWorkers,
        doubleUpSlotKey,
      };
    });
  }, [usableRows, precomputedDoubleUpWorkers]);

  const primaryRows = useMemo(() => dedupedResults.filter((row) => !row.isDuplicateSlotRow), [dedupedResults]);
  const templateWeekReferenceDayNumber = useMemo(() => {
    if (!analysisResults.length) return null;
    let latest: Date | null = null;
    analysisResults.forEach((row) => {
      const date = parseDateKeyToLocalDate(row.plannedDateKey ?? row.plannedDateLabel ?? null);
      if (!date) return;
      if (!latest || date > latest) {
        latest = date;
      }
    });
    if (!latest) return null;
    const pivotWeek = deriveTemplateWeekKey(latest, TEMPLATE_WEEK_1_START_DAY_NUMBER);
    const pivotDay = deriveWeekdayLabel(latest);
    const dayOffset = WEEKDAY_OPTIONS.indexOf(pivotDay);
    if (dayOffset < 0) return null;
    const weekOffset = pivotWeek === "week2" ? 7 : 0;
    return getDateDayNumber(latest) - weekOffset - dayOffset;
  }, [analysisResults]);

  const filteredResults = useMemo(() => {
    let rows = showDuplicateRows ? dedupedResults : primaryRows;
    if (filterStatus !== "all") {
      rows = rows.filter((row) => row.status === filterStatus);
    }

    if (debouncedSearchTerm.trim()) {
      const term = debouncedSearchTerm.toLowerCase();
      rows = rows.filter((row) => {
        const matchesRowNumber = row.rowNumber.toString().includes(term);
        if (matchesRowNumber) return true;
        return Object.values(row.data).some((value) =>
          String(value ?? "")
            .toLowerCase()
            .includes(term)
        );
      });
    }
    return rows;
  }, [dedupedResults, primaryRows, filterStatus, debouncedSearchTerm, showDuplicateRows]);

  const visibleRows = filteredResults.slice(0, visibleCount);

  const summary = useMemo(() => {
    const total = dedupedResults.length;
    const workingRows = primaryRows;
    const duplicateCount = total - workingRows.length;
    const attention = workingRows.filter((row) => row.status === "attention").length;
    const clean = workingRows.length - attention;
    const totalEmpty = workingRows.reduce((acc, row) => acc + row.emptyFields.length, 0);
    let scheduleAlerts = 0;
    let durationAlerts = 0;
    let driftAccumulator = 0;
    let driftCount = 0;
    let durationAccumulator = 0;
    let durationCount = 0;

    workingRows.forEach((row) => {
      if (row.scheduleFlag) scheduleAlerts += 1;
      if (row.durationFlag || row.durationOverrunFlag) durationAlerts += 1;
      if (typeof row.scheduleDeltaMinutes === "number") {
        driftAccumulator += Math.abs(row.scheduleDeltaMinutes);
        driftCount += 1;
      }
      if (typeof row.durationMatchPercent === "number") {
        durationAccumulator += row.durationMatchPercent;
        durationCount += 1;
      }
    });

    const averageDriftMinutes = driftCount ? driftAccumulator / driftCount : null;
    const averageDurationPercent = durationCount ? durationAccumulator / durationCount : null;

    return {
      total,
      totalPrimary: workingRows.length,
      attention,
      clean,
      totalEmpty,
      scheduleAlerts,
      durationAlerts,
      averageDriftMinutes,
      averageDurationPercent,
      duplicateCount,
    };
  }, [dedupedResults, primaryRows]);

  const coverage = useMemo(() => {
    const total = primaryRows.length;
    const counts = {
      total,
      plannedTime: 0,
      actualTime: 0,
      plannedDuration: 0,
      actualDuration: 0,
      plannedWorker: 0,
      actualWorker: 0,
      serviceUser: 0,
      plannedDate: 0,
      callType: 0,
    };

    primaryRows.forEach((row) => {
      if (typeof row.plannedTimeMinutes === "number") counts.plannedTime += 1;
      if (typeof row.actualTimeMinutes === "number") counts.actualTime += 1;
      if (typeof row.plannedDurationMinutes === "number") counts.plannedDuration += 1;
      if (typeof row.actualDurationMinutes === "number") counts.actualDuration += 1;
      if (row.plannedWorker) counts.plannedWorker += 1;
      if (row.actualWorker) counts.actualWorker += 1;
      if (row.serviceUserName) counts.serviceUser += 1;
      if (row.plannedDateKey) counts.plannedDate += 1;
      if (row.callTypeLabel) counts.callType += 1;
    });

    return counts;
  }, [primaryRows]);

  const issueBreakdown = useMemo(() => {
    const totalRows = analysisResults.length;
    const uniqueSlots = primaryRows.length;
    const duplicateSlots = dedupedResults.length - primaryRows.length;
    const cancelledCalls = analysisResults.filter((row) => !row.actualWorker && !row.isShiftBar).length;
    const mismatchedCarers = analysisResults.filter((row) => row.workersMatch === false).length;
    const missingPlannedTime = primaryRows.filter((row) => typeof row.plannedTimeMinutes !== "number").length;
    const missingActualTime = primaryRows.filter((row) => typeof row.actualTimeMinutes !== "number").length;
    const missingPlannedDuration = primaryRows.filter((row) => typeof row.plannedDurationMinutes !== "number").length;
    const missingActualDuration = primaryRows.filter((row) => typeof row.actualDurationMinutes !== "number").length;
    const driftOverTwoHours = primaryRows.filter((row) => row.scheduleFlag).length;
    const durationShortfall = primaryRows.filter((row) => row.durationFlag).length;
    const durationOverrun = primaryRows.filter((row) => row.durationOverrunFlag).length;

    return {
      totalRows,
      uniqueSlots,
      duplicateSlots,
      cancelledCalls,
      mismatchedCarers,
      missingPlannedTime,
      missingActualTime,
      missingPlannedDuration,
      missingActualDuration,
      driftOverTwoHours,
      durationShortfall,
      durationOverrun,
    };
  }, [analysisResults, dedupedResults.length, primaryRows]);

  const issueHighlights = useMemo(() => {
    if (!issueBreakdown.totalRows) return [];
    const uniqueBase = issueBreakdown.uniqueSlots || 1;
    const totalBase = issueBreakdown.totalRows || 1;

    const items = [
      {
        key: "drift",
        label: "Schedule drift > 2h",
        count: issueBreakdown.driftOverTwoHours,
        base: uniqueBase,
        helper: "Unique slots",
      },
      {
        key: "duration-short",
        label: `Duration under ${DURATION_SHORTFALL_THRESHOLD_PERCENT}%`,
        count: issueBreakdown.durationShortfall,
        base: uniqueBase,
        helper: "Unique slots",
      },
      {
        key: "duration-over",
        label: `Duration over ${DURATION_OVERRUN_THRESHOLD_PERCENT}%`,
        count: issueBreakdown.durationOverrun,
        base: uniqueBase,
        helper: "Unique slots",
      },
      {
        key: "missing-planned-time",
        label: "Missing planned time",
        count: issueBreakdown.missingPlannedTime,
        base: uniqueBase,
        helper: "Unique slots",
      },
      {
        key: "missing-actual-time",
        label: "Missing actual time",
        count: issueBreakdown.missingActualTime,
        base: uniqueBase,
        helper: "Unique slots",
      },
      {
        key: "missing-planned-duration",
        label: "Missing planned duration",
        count: issueBreakdown.missingPlannedDuration,
        base: uniqueBase,
        helper: "Unique slots",
      },
      {
        key: "missing-actual-duration",
        label: "Missing actual duration",
        count: issueBreakdown.missingActualDuration,
        base: uniqueBase,
        helper: "Unique slots",
      },
      {
        key: "duplicates",
        label: "Duplicate slot rows",
        count: issueBreakdown.duplicateSlots,
        base: totalBase,
        helper: "All rows",
      },
      {
        key: "cancelled",
        label: "Cancelled calls",
        count: issueBreakdown.cancelledCalls,
        base: totalBase,
        helper: "All rows",
      },
      {
        key: "mismatched",
        label: "Carer mismatches",
        count: issueBreakdown.mismatchedCarers,
        base: totalBase,
        helper: "All rows",
      },
    ];

    return items
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [issueBreakdown]);

  const healthSummary = useMemo(() => {
    if (!analysisResults.length || !coverage.total) return null;

    // ===== COMPLETENESS SCORE (how much data is present) =====
    const coverageBreakdown = {
      plannedTime: coverage.plannedTime / coverage.total,
      actualTime: coverage.actualTime / coverage.total,
      plannedDuration: coverage.plannedDuration / coverage.total,
      actualDuration: coverage.actualDuration / coverage.total,
      plannedWorker: coverage.plannedWorker / coverage.total,
      actualWorker: coverage.actualWorker / coverage.total,
      serviceUser: coverage.serviceUser / coverage.total,
      plannedDate: coverage.plannedDate / coverage.total,
      callType: coverage.callType / coverage.total,
    };
    const completenessValues = Object.values(coverageBreakdown).filter((v) => Number.isFinite(v));
    const completenessScore = completenessValues.length > 0
      ? completenessValues.reduce((a, b) => a + b, 0) / completenessValues.length
      : 0;

    // ===== CONSISTENCY SCORE (duplicates, mismatches, excluded) =====
    const duplicateRate = summary.total ? summary.duplicateCount / summary.total : 0;
    const excludedRate = analysisResults.length ? excludedCounts.total / analysisResults.length : 0;
    const mismatchRate = analysisResults.length ? excludedCounts.mismatched / analysisResults.length : 0;
    const consistencyScore = Math.max(0, 1 - (duplicateRate * 0.4 + excludedRate * 0.35 + mismatchRate * 0.25));

    // ===== TIMELINESS SCORE (schedule drift analysis) =====
    const driftValues = primaryRows
      .map((r) => r.scheduleDeltaMinutes)
      .filter((v): v is number => v !== null && Number.isFinite(v))
      .map(Math.abs);
    
    const sortedDrifts = [...driftValues].sort((a, b) => a - b);
    const driftP50 = sortedDrifts.length ? sortedDrifts[Math.floor(sortedDrifts.length * 0.5)] : null;
    const driftP90 = sortedDrifts.length ? sortedDrifts[Math.floor(sortedDrifts.length * 0.9)] : null;
    const driftP99 = sortedDrifts.length ? sortedDrifts[Math.floor(sortedDrifts.length * 0.99)] : null;
    const avgDrift = driftValues.length ? driftValues.reduce((a, b) => a + b, 0) / driftValues.length : 0;
    const driftStdDev = driftValues.length > 1
      ? Math.sqrt(driftValues.reduce((sum, v) => sum + Math.pow(v - avgDrift, 2), 0) / driftValues.length)
      : 0;
    
    // Score based on median drift (under 30 min = good, over 2h = bad)
    const timelinessScore = driftP50 !== null
      ? Math.max(0, Math.min(1, 1 - (driftP50 / 120)))
      : 1; // If no data, assume good

    // ===== ACCURACY SCORE (duration fidelity) =====
    const durationValues = primaryRows
      .map((r) => r.durationMatchPercent)
      .filter((v): v is number => v !== null && Number.isFinite(v));
    
    const sortedDurations = [...durationValues].sort((a, b) => a - b);
    const durationP50 = sortedDurations.length ? sortedDurations[Math.floor(sortedDurations.length * 0.5)] : null;
    const durationP10 = sortedDurations.length ? sortedDurations[Math.floor(sortedDurations.length * 0.1)] : null;
    const durationP90 = sortedDurations.length ? sortedDurations[Math.floor(sortedDurations.length * 0.9)] : null;
    const avgDuration = durationValues.length ? durationValues.reduce((a, b) => a + b, 0) / durationValues.length : 100;
    const durationStdDev = durationValues.length > 1
      ? Math.sqrt(durationValues.reduce((sum, v) => sum + Math.pow(v - avgDuration, 2), 0) / durationValues.length)
      : 0;
    
    // Score based on how close median is to 100% (80-120% = good)
    const accuracyScore = durationP50 !== null
      ? Math.max(0, Math.min(1, 1 - Math.abs(durationP50 - 100) / 50))
      : 1;

    // ===== ATTENTION RATE =====
    const attentionRate = summary.totalPrimary ? summary.attention / summary.totalPrimary : 0;

    // ===== COMPOSITE DATA QUALITY INDEX =====
    const scoreRaw =
      completenessScore * 0.30 +
      consistencyScore * 0.25 +
      timelinessScore * 0.20 +
      accuracyScore * 0.15 +
      (1 - attentionRate) * 0.10;

    const score = Math.round(Math.max(0, Math.min(1, scoreRaw)) * 100);
    const label =
      score >= 90 ? "Excellent quality" :
      score >= 80 ? "Very good quality" :
      score >= 70 ? "Good quality" :
      score >= 55 ? "Needs attention" :
      "Critical quality";
    const tone: InsightTone = score >= 70 ? "default" : score >= 55 ? "warning" : "destructive";

    // Grade letters for sub-scores
    const gradeScore = (s: number) => 
      s >= 0.9 ? "A" : s >= 0.8 ? "B" : s >= 0.7 ? "C" : s >= 0.55 ? "D" : "F";

    return {
      score,
      label,
      tone,
      // Legacy fields for backwards compat
      coverageAvg: completenessScore,
      attentionRate,
      duplicateRate,
      excludedRate,
      // Enhanced breakdown
      completeness: {
        score: Math.round(completenessScore * 100),
        grade: gradeScore(completenessScore),
        breakdown: coverageBreakdown,
      },
      consistency: {
        score: Math.round(consistencyScore * 100),
        grade: gradeScore(consistencyScore),
        duplicateRate,
        excludedRate,
        mismatchRate,
      },
      timeliness: {
        score: Math.round(timelinessScore * 100),
        grade: gradeScore(timelinessScore),
        avgDrift,
        driftStdDev,
        driftP50,
        driftP90,
        driftP99,
        outlierCount: driftValues.filter((v) => v > 120).length,
      },
      accuracy: {
        score: Math.round(accuracyScore * 100),
        grade: gradeScore(accuracyScore),
        avgDuration,
        durationStdDev,
        durationP10,
        durationP50,
        durationP90,
        underdeliveredCount: durationValues.filter((v) => v < 80).length,
        overdeliveredCount: durationValues.filter((v) => v > 120).length,
      },
    };
  }, [analysisResults.length, coverage, excludedCounts, summary, primaryRows]);

  const detectedColumns = useMemo(() => {
    if (!analysisResults.length) return [];
    const firstRow = analysisResults[0]?.data;
    if (!firstRow) return [];
    const rowKeys = Object.keys(firstRow);
    if (!rowKeys.length) return [];

    const headerRow = rowKeys.reduce<Record<string, any>>((acc, key) => {
      acc[key] = key;
      return acc;
    }, {});

    const plannedTimeField = detectField(headerRow, PLANNED_TIME_KEYWORDS);
    const serviceRequirementTimeField = detectField(
      headerRow,
      SERVICE_REQUIREMENT_TIME_KEYWORDS,
      plannedTimeField ? new Set([plannedTimeField.key]) : undefined
    );
    const plannedTimeSource = serviceRequirementTimeField ?? plannedTimeField;
    const plannedDateField = detectDateField(
      headerRow,
      PLANNED_DATE_KEYWORDS,
      (() => {
        const exclude = new Set<string>();
        if (plannedTimeField) exclude.add(plannedTimeField.key);
        if (serviceRequirementTimeField) exclude.add(serviceRequirementTimeField.key);
        return exclude.size ? exclude : undefined;
      })()
    );
    const actualTimeField = detectField(
      headerRow,
      ACTUAL_TIME_KEYWORDS,
      (() => {
        const exclude = new Set<string>();
        if (plannedTimeField) exclude.add(plannedTimeField.key);
        if (serviceRequirementTimeField) exclude.add(serviceRequirementTimeField.key);
        return exclude.size ? exclude : undefined;
      })()
    );
    const plannedEndTimeField = detectField(
      headerRow,
      PLANNED_END_TIME_KEYWORDS,
      (() => {
        const exclude = new Set<string>();
        if (plannedTimeField) exclude.add(plannedTimeField.key);
        if (serviceRequirementTimeField) exclude.add(serviceRequirementTimeField.key);
        return exclude.size ? exclude : undefined;
      })()
    );
    const actualEndTimeField = detectField(
      headerRow,
      ACTUAL_END_TIME_KEYWORDS,
      (() => {
        const exclude = new Set<string>();
        if (plannedTimeField) exclude.add(plannedTimeField.key);
        if (serviceRequirementTimeField) exclude.add(serviceRequirementTimeField.key);
        if (actualTimeField) exclude.add(actualTimeField.key);
        return exclude.size ? exclude : undefined;
      })()
    );
    const serviceRequirementEndTimeField = detectField(
      headerRow,
      SERVICE_REQUIREMENT_END_TIME_KEYWORDS,
      (() => {
        const exclude = new Set<string>();
        if (plannedTimeField) exclude.add(plannedTimeField.key);
        if (serviceRequirementTimeField) exclude.add(serviceRequirementTimeField.key);
        if (plannedEndTimeField) exclude.add(plannedEndTimeField.key);
        if (actualEndTimeField) exclude.add(actualEndTimeField.key);
        return exclude.size ? exclude : undefined;
      })()
    );
    const plannedDurationField = detectField(headerRow, PLANNED_DURATION_KEYWORDS);
    const actualDurationField = detectField(
      headerRow,
      ACTUAL_DURATION_KEYWORDS,
      plannedDurationField ? new Set([plannedDurationField.key]) : undefined
    );

    let plannedWorkerField = detectField(headerRow, PLANNED_WORKER_KEYWORDS);
    if (!plannedWorkerField) {
      plannedWorkerField = detectField(headerRow, GENERIC_WORKER_KEYWORDS);
    }
    let actualWorkerField = detectField(
      headerRow,
      ACTUAL_WORKER_KEYWORDS,
      plannedWorkerField ? new Set([plannedWorkerField.key]) : undefined
    );
    if (!actualWorkerField) {
      actualWorkerField = detectField(
        headerRow,
        GENERIC_WORKER_KEYWORDS,
        plannedWorkerField ? new Set([plannedWorkerField.key]) : undefined
      );
    }

    const serviceUserNameField = detectField(headerRow, SERVICE_USER_NAME_KEYWORDS);
    const serviceUserAreaField =
      detectFieldExcludingWorkerColumns(
        headerRow,
        [
          "customer area",
          "service location area",
          "service user area",
          "customer branch",
          "service location branch",
          "service user branch",
        ],
        serviceUserNameField ? new Set([serviceUserNameField.key]) : undefined
      ) ??
      detectFieldExcludingWorkerColumns(
        headerRow,
        ["area", "branch"],
        serviceUserNameField ? new Set([serviceUserNameField.key]) : undefined
      );
    const serviceLocationBranchField = detectFieldExcludingWorkerColumns(
      headerRow,
      SERVICE_LOCATION_BRANCH_KEYWORDS,
      serviceUserNameField ? new Set([serviceUserNameField.key]) : undefined
    );
    const serviceLocationTypeField = detectFieldExcludingWorkerColumns(
      headerRow,
      SERVICE_LOCATION_TYPE_KEYWORDS,
      serviceUserNameField ? new Set([serviceUserNameField.key]) : undefined
    );
    const serviceUserAddressField =
      detectFieldExcludingWorkerColumns(
        headerRow,
        ["service location address", "customer address"],
        serviceUserNameField ? new Set([serviceUserNameField.key]) : undefined
      ) ??
      detectFieldExcludingWorkerColumns(
        headerRow,
        ["postcode", "post code", "address"],
        serviceUserNameField ? new Set([serviceUserNameField.key]) : undefined
      );

    const serviceRequirementTypeField = detectField(headerRow, SERVICE_REQUIREMENT_TYPE_KEYWORDS);
    const serviceRequirementServiceTypeField = detectField(
      headerRow,
      SERVICE_REQUIREMENT_SERVICE_TYPE_KEYWORDS,
      serviceRequirementTypeField ? new Set([serviceRequirementTypeField.key]) : undefined
    );
    const serviceRequirementFallbackField = detectField(
      headerRow,
      ["planned service requirement type description", "planned service type description", "actual service requirement type description", "actual service type description"],
      (() => {
        const exclude = new Set<string>();
        if (serviceRequirementTypeField) exclude.add(serviceRequirementTypeField.key);
        if (serviceRequirementServiceTypeField) exclude.add(serviceRequirementServiceTypeField.key);
        return exclude.size ? exclude : undefined;
      })()
    );

    const getColumnLabel = (key: string) => {
      const index = rowKeys.indexOf(key);
      return normalizeColumnLabel(key, index);
    };

    const getSampleValue = (key: string) => {
      const match = analysisResults.find((row) => {
        const value = row.data[key];
        return value !== null && value !== undefined && String(value).trim() !== "";
      });
      if (!match) return null;
      const value = String(match.data[key]).trim();
      if (!value) return null;
      return value.length > 44 ? `${value.slice(0, 41)}...` : value;
    };

    const coveragePercent = (count?: number) => {
      if (!coverage.total || typeof count !== "number") return null;
      return Math.round((count / coverage.total) * 100);
    };

    const rows = [
      { label: "Planned start time", field: plannedTimeSource, coverageCount: coverage.plannedTime },
      { label: "Service requirement start time", field: serviceRequirementTimeField },
      { label: "Service requirement end time", field: serviceRequirementEndTimeField },
      { label: "Actual start time", field: actualTimeField, coverageCount: coverage.actualTime },
      { label: "Planned end time", field: plannedEndTimeField },
      { label: "Actual end time", field: actualEndTimeField },
      { label: "Planned duration", field: plannedDurationField, coverageCount: coverage.plannedDuration },
      { label: "Actual duration", field: actualDurationField, coverageCount: coverage.actualDuration },
      { label: "Planned carer", field: plannedWorkerField, coverageCount: coverage.plannedWorker },
      { label: "Actual carer", field: actualWorkerField, coverageCount: coverage.actualWorker },
      { label: "Service user name", field: serviceUserNameField, coverageCount: coverage.serviceUser },
      { label: "Service user area", field: serviceUserAreaField },
      { label: "Service user address", field: serviceUserAddressField },
      { label: "Service location branch", field: serviceLocationBranchField },
      { label: "Service location type", field: serviceLocationTypeField },
      {
        label: "Call type",
        field: serviceRequirementServiceTypeField ?? serviceRequirementTypeField ?? serviceRequirementFallbackField,
        coverageCount: coverage.callType,
      },
      { label: "Planned date", field: plannedDateField, coverageCount: coverage.plannedDate },
    ];

    return rows.map((row) => {
      const key = row.field?.key;
      const columnLabel = key ? getColumnLabel(key) : "Not detected";
      return {
        label: row.label,
        key: key ?? null,
        columnLabel,
        sample: key ? getSampleValue(key) : null,
        coveragePercent: coveragePercent(row.coverageCount),
      };
    });
  }, [analysisResults, coverage, normalizeColumnLabel]);

  const slotTrendMetrics = useMemo(() => {
    if (!primaryRows.length) {
      return {
        topInsights: [] as SlotTrendSummary[],
        byKey: new Map<
          string,
          {
            suggestedStartMinutes: number | null;
            suggestedDurationMinutes: number | null;
            averageStartOffsetMinutes: number | null;
            averageDurationPercent: number | null;
          }
        >(),
      };
    }

    type Accumulator = {
      key: string;
      serviceUserName: string | null;
      serviceUserArea: string | null;
      serviceUserAddress: string | null;
      callTypeLabel: string;
      totalCalls: number;
      callsWithTimes: number;
      offsetSum: number;
      offsetPositive: number;
      offsetNegative: number;
      offsetAbsOver15: number;
      callsWithActualStarts: number;
      actualStartSum: number;
      callsWithPlannedStarts: number;
      plannedStartSum: number;
      callsWithDurations: number;
      ratioSum: number;
      longCount: number;
      shortCount: number;
      plannedDurationSum: number;
      actualDurationSum: number;
    };

    const map = new Map<string, Accumulator>();

    for (const row of primaryRows) {
      const userKey = row.normalizedServiceUserKey;
      if (!userKey) continue;
      const callTypeKey = normalizeCallTypeKey(row.callTypeLabel ?? null);
      if (!callTypeKey) continue;

      const key = `${userKey}|type-${callTypeKey}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          serviceUserName: row.serviceUserName ?? null,
          serviceUserArea: row.serviceUserArea ?? null,
          serviceUserAddress: row.serviceUserAddress ?? null,
          callTypeLabel: row.callTypeLabel ?? "Unknown",
          totalCalls: 0,
          callsWithTimes: 0,
          offsetSum: 0,
          offsetPositive: 0,
          offsetNegative: 0,
          offsetAbsOver15: 0,
          callsWithActualStarts: 0,
          actualStartSum: 0,
          callsWithPlannedStarts: 0,
          plannedStartSum: 0,
          callsWithDurations: 0,
          ratioSum: 0,
          longCount: 0,
          shortCount: 0,
          plannedDurationSum: 0,
          actualDurationSum: 0,
        });
      }

      const acc = map.get(key)!;
      acc.totalCalls += 1;
      if (!acc.serviceUserName && row.serviceUserName) acc.serviceUserName = row.serviceUserName;
      if (!acc.serviceUserArea && row.serviceUserArea) acc.serviceUserArea = row.serviceUserArea;
      if (!acc.serviceUserAddress && row.serviceUserAddress) acc.serviceUserAddress = row.serviceUserAddress;
      if (acc.callTypeLabel === "Unknown" && row.callTypeLabel) acc.callTypeLabel = row.callTypeLabel;

      if (typeof row.actualTimeMinutes === "number") {
        const actual = clampMinutesOfDay(row.actualTimeMinutes);
        acc.callsWithActualStarts += 1;
        acc.actualStartSum += actual;
      }

      const baselineMinutesRaw =
        typeof row.serviceRequirementTimeMinutes === "number"
          ? row.serviceRequirementTimeMinutes
          : typeof row.plannedTimeMinutes === "number"
          ? row.plannedTimeMinutes
          : null;

      if (typeof baselineMinutesRaw === "number") {
        const planned = clampMinutesOfDay(baselineMinutesRaw);
        acc.callsWithPlannedStarts += 1;
        acc.plannedStartSum += planned;
      }

      if (typeof row.actualTimeMinutes === "number" && typeof baselineMinutesRaw === "number") {
        const delta = row.actualTimeMinutes - baselineMinutesRaw;
        if (Number.isFinite(delta) && Math.abs(delta) <= 12 * 60) {
          acc.callsWithTimes += 1;
          acc.offsetSum += delta;
          if (delta > 0) acc.offsetPositive += 1;
          if (delta < 0) acc.offsetNegative += 1;
          if (Math.abs(delta) >= 15) acc.offsetAbsOver15 += 1;
        }
      }

      if (
        typeof row.plannedDurationMinutes === "number" &&
        row.plannedDurationMinutes > 0 &&
        typeof row.actualDurationMinutes === "number" &&
        row.actualDurationMinutes >= 0
      ) {
        const ratio = row.actualDurationMinutes / row.plannedDurationMinutes;
        if (Number.isFinite(ratio) && ratio > 0 && ratio < 50) {
          acc.callsWithDurations += 1;
          acc.ratioSum += ratio;
          acc.plannedDurationSum += row.plannedDurationMinutes;
          acc.actualDurationSum += row.actualDurationMinutes;
          if (ratio >= DURATION_OVERRUN_THRESHOLD_PERCENT / 100) acc.longCount += 1;
          if (ratio <= DURATION_SHORTFALL_THRESHOLD_PERCENT / 100) acc.shortCount += 1;
        }
      }
    }

    const result: SlotTrendSummary[] = [];
    const byKey = new Map<
      string,
      {
        suggestedStartMinutes: number | null;
        suggestedDurationMinutes: number | null;
        averageStartOffsetMinutes: number | null;
        averageDurationPercent: number | null;
      }
    >();
    for (const acc of map.values()) {
      const advice: string[] = [];
      const averageStartOffsetMinutes = acc.callsWithTimes ? acc.offsetSum / acc.callsWithTimes : null;
      const dominantSignCount = Math.max(acc.offsetPositive, acc.offsetNegative);
      const offsetConsistency = acc.callsWithTimes ? dominantSignCount / acc.callsWithTimes : null;

      const averageActualStartMinutes = acc.callsWithActualStarts
        ? acc.actualStartSum / acc.callsWithActualStarts
        : null;
      const averagePlannedStartMinutes = acc.callsWithPlannedStarts
        ? acc.plannedStartSum / acc.callsWithPlannedStarts
        : null;

      let suggestedPlannedTimeLabel: string | null = null;
      let suggestedStartMinutes: number | null = null;
      if (
        acc.callsWithTimes >= TREND_MIN_CALLS &&
        averageStartOffsetMinutes !== null &&
        Math.abs(averageStartOffsetMinutes) >= TREND_MIN_AVG_OFFSET_MINUTES &&
        offsetConsistency !== null &&
        offsetConsistency >= TREND_CONSISTENCY &&
        acc.offsetAbsOver15 / acc.callsWithTimes >= TREND_CONSISTENCY
      ) {
        const suggestedMinutes =
          typeof averageActualStartMinutes === "number"
            ? clampMinutesOfDay(roundToNearest(averageActualStartMinutes, 5))
            : null;
        suggestedStartMinutes = typeof suggestedMinutes === "number" ? suggestedMinutes : null;
        suggestedPlannedTimeLabel =
          typeof suggestedMinutes === "number" ? deriveTimeLabel(suggestedMinutes, null) ?? null : null;

        const direction = averageStartOffsetMinutes > 0 ? "later" : "earlier";
        const plannedLabel =
          typeof averagePlannedStartMinutes === "number"
            ? deriveTimeLabel(averagePlannedStartMinutes, null)
            : null;
        const actualLabel =
          typeof averageActualStartMinutes === "number"
            ? deriveTimeLabel(averageActualStartMinutes, null)
            : null;
        advice.push(
          `For ${acc.callTypeLabel}, actual starts are consistently ${direction} than planned by about ${formatMinutesDisplay(Math.abs(averageStartOffsetMinutes))}${plannedLabel ? ` (planned ~${plannedLabel}` : ""}${actualLabel ? `${plannedLabel ? ", " : " ("}actual ~${actualLabel}` : ""}${plannedLabel || actualLabel ? ")" : ""}. Consider changing planned time to ${suggestedPlannedTimeLabel || "the average actual time"}.`
        );
      }

      const averageDurationPercent =
        acc.callsWithDurations ? (acc.ratioSum / acc.callsWithDurations) * 100 : null;
      const longPct = acc.callsWithDurations ? acc.longCount / acc.callsWithDurations : 0;
      const shortPct = acc.callsWithDurations ? acc.shortCount / acc.callsWithDurations : 0;

      let suggestedPlannedDurationMinutes: number | null = null;
      if (
        acc.callsWithDurations >= TREND_MIN_CALLS &&
        averageDurationPercent !== null &&
        longPct >= TREND_CONSISTENCY
      ) {
        const avgActual = acc.actualDurationSum / acc.callsWithDurations;
        suggestedPlannedDurationMinutes = roundToNearest(avgActual, 5);
        advice.push(
          `Call lengths are often longer than planned (avg ${averageDurationPercent.toFixed(0)}%). Consider increasing planned duration to about ${formatMinutesDisplay(suggestedPlannedDurationMinutes)}.`
        );
      } else if (
        acc.callsWithDurations >= TREND_MIN_CALLS &&
        averageDurationPercent !== null &&
        shortPct >= TREND_CONSISTENCY
      ) {
        const avgActual = acc.actualDurationSum / acc.callsWithDurations;
        suggestedPlannedDurationMinutes = roundToNearest(avgActual, 5);
        advice.push(
          `Call lengths are often shorter than planned (avg ${averageDurationPercent.toFixed(0)}%). Consider reducing planned duration to about ${formatMinutesDisplay(suggestedPlannedDurationMinutes)}.`
        );
      }

      byKey.set(acc.key, {
        suggestedStartMinutes,
        suggestedDurationMinutes: suggestedPlannedDurationMinutes,
        averageStartOffsetMinutes,
        averageDurationPercent,
      });

      const tone: InsightTone =
        advice.length > 0
          ? "warning"
          : averageDurationPercent !== null && averageDurationPercent > DURATION_OVERRUN_THRESHOLD_PERCENT
          ? "warning"
          : "default";

      result.push({
        key: acc.key,
        serviceUserName: acc.serviceUserName,
        serviceUserArea: acc.serviceUserArea,
        serviceUserAddress: acc.serviceUserAddress,
        callTypeLabel: acc.callTypeLabel,
        totalCalls: acc.totalCalls,
        callsWithTimes: acc.callsWithTimes,
        averageStartOffsetMinutes,
        offsetConsistency,
        averageActualStartMinutes,
        averagePlannedStartMinutes,
        suggestedPlannedTimeLabel,
        callsWithDurations: acc.callsWithDurations,
        averageDurationPercent,
        suggestedPlannedDurationMinutes,
        advice,
        tone,
      });
    }

    const topInsights = result
      .filter((item) => item.advice.length > 0)
      .sort((a, b) => {
        const aScore =
          (a.averageStartOffsetMinutes ? Math.abs(a.averageStartOffsetMinutes) : 0) +
          (a.averageDurationPercent ? Math.abs(a.averageDurationPercent - 100) : 0);
        const bScore =
          (b.averageStartOffsetMinutes ? Math.abs(b.averageStartOffsetMinutes) : 0) +
          (b.averageDurationPercent ? Math.abs(b.averageDurationPercent - 100) : 0);
        if (bScore !== aScore) return bScore - aScore;
        return (a.serviceUserName || "").localeCompare(b.serviceUserName || "");
      })
      .slice(0, 10);

    return { topInsights, byKey };
  }, [primaryRows]);

  const slotTrends = slotTrendMetrics.topInsights;
  const slotTrendLookup = slotTrendMetrics.byKey;

  const duplicateClusters = useMemo<DuplicateCluster[]>(() => {
    if (!dedupedResults.length) return [];
    const map = new Map<string, DuplicateCluster>();

    dedupedResults.forEach((row) => {
      const dupKey = buildDuplicateSlotKey(row);
      if (!dupKey) return;
      if (!map.has(dupKey)) {
        map.set(dupKey, {
          key: dupKey,
          serviceUserName: row.serviceUserName ?? null,
          serviceUserArea: row.serviceUserArea ?? null,
          serviceUserAddress: row.serviceUserAddress ?? null,
          plannedDateLabel: row.plannedDateLabel ?? null,
          plannedTimeLabel: row.plannedTimeLabel ?? null,
          rows: [],
        });
      }
      map.get(dupKey)!.rows.push(row);
    });

    return Array.from(map.values())
      .filter((cluster) => cluster.rows.length > 1)
      .sort((a, b) => b.rows.length - a.rows.length || (a.serviceUserName || "").localeCompare(b.serviceUserName || ""))
      .slice(0, 20);
  }, [dedupedResults]);

  const callGroups = useMemo<CallGroup[]>(() => {
    if (!primaryRows.length) {
      return [];
    }

    const map = new Map<string, CallGroup>();

    primaryRows.forEach((row) => {
      const key = buildGroupKey(row);
      if (!map.has(key)) {
        map.set(key, {
          key,
          serviceUserName: row.serviceUserName ?? null,
          serviceUserArea: row.serviceUserArea ?? null,
          serviceUserAddress: row.serviceUserAddress ?? null,
          plannedTimeLabel: row.plannedTimeLabel ?? null,
          plannedTimeMinutes: row.plannedTimeMinutes ?? null,
          normalizedServiceUserKey: row.normalizedServiceUserKey ?? null,
          rows: [],
        });
      }

      const group = map.get(key)!;
      group.rows.push(row);

      if (!group.serviceUserName && row.serviceUserName) group.serviceUserName = row.serviceUserName;
      if (!group.serviceUserArea && row.serviceUserArea) group.serviceUserArea = row.serviceUserArea;
      if (!group.serviceUserAddress && row.serviceUserAddress) group.serviceUserAddress = row.serviceUserAddress;
      if (!group.plannedTimeLabel && row.plannedTimeLabel) group.plannedTimeLabel = row.plannedTimeLabel;
      if (group.plannedTimeMinutes == null && row.plannedTimeMinutes != null) {
        group.plannedTimeMinutes = row.plannedTimeMinutes;
      }
      if (!group.normalizedServiceUserKey && row.normalizedServiceUserKey) {
        group.normalizedServiceUserKey = row.normalizedServiceUserKey;
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      if (b.rows.length !== a.rows.length) return b.rows.length - a.rows.length;
      return (a.serviceUserName || "").localeCompare(b.serviceUserName || "");
    });
  }, [primaryRows]);

  const serviceUserStacks = useMemo<ServiceUserStack[]>(() => {
    if (!primaryRows.length) return [];
    const map = new Map<string, ServiceUserStack>();

    primaryRows.forEach((row) => {
      const userKey = row.normalizedServiceUserKey || `row-${row.rowNumber}`;
      if (!map.has(userKey)) {
        map.set(userKey, {
          key: userKey,
          normalizedServiceUserKey: row.normalizedServiceUserKey ?? null,
          serviceUserName: row.serviceUserName ?? null,
          serviceUserArea: row.serviceUserArea ?? null,
          serviceUserAddress: row.serviceUserAddress ?? null,
          rows: [],
        });
      }

      const stack = map.get(userKey)!;
      stack.rows.push(row);
      if (!stack.serviceUserName && row.serviceUserName) stack.serviceUserName = row.serviceUserName;
      if (!stack.serviceUserArea && row.serviceUserArea) stack.serviceUserArea = row.serviceUserArea;
      if (!stack.serviceUserAddress && row.serviceUserAddress) stack.serviceUserAddress = row.serviceUserAddress;
      if (!stack.normalizedServiceUserKey && row.normalizedServiceUserKey) {
        stack.normalizedServiceUserKey = row.normalizedServiceUserKey;
      }
    });

    return Array.from(map.values())
      .map((stack) => ({
        ...stack,
        rows: [...stack.rows].sort((a, b) => {
          const aDate = a.plannedDateKey || "";
          const bDate = b.plannedDateKey || "";
          if (aDate !== bDate) return aDate.localeCompare(bDate);
          const aTime = typeof a.plannedTimeMinutes === "number" ? a.plannedTimeMinutes : Number.POSITIVE_INFINITY;
          const bTime = typeof b.plannedTimeMinutes === "number" ? b.plannedTimeMinutes : Number.POSITIVE_INFINITY;
          if (aTime !== bTime) return aTime - bTime;
          return a.rowNumber - b.rowNumber;
        }),
      }))
      .sort((a, b) => b.rows.length - a.rows.length || (a.serviceUserName || "").localeCompare(b.serviceUserName || ""));
  }, [primaryRows]);

  const { visibleServiceUserStacks, hasSearchMatch } = useMemo<{
    visibleServiceUserStacks: ServiceUserStack[];
    hasSearchMatch: boolean;
  }>(() => {
    if (!serviceUserStacks.length) {
      return { visibleServiceUserStacks: [], hasSearchMatch: true };
    }

    const term = debouncedCallGroupSearch.trim().toLowerCase();
    if (!term) {
      return { visibleServiceUserStacks: serviceUserStacks.slice(0, 3), hasSearchMatch: true };
    }

    const scored = serviceUserStacks.map((stack) => {
      const fields = [stack.serviceUserName, stack.serviceUserArea, stack.serviceUserAddress]
        .map((value) => (value ? value.toString().toLowerCase() : ""));
      const score = fields.reduce((acc, field) => {
        if (!field) return acc;
        if (field === term) return acc + 4;
        if (field.startsWith(term)) return acc + 3;
        if (field.includes(term)) return acc + 1;
        return acc;
      }, 0);
      return { stack, score };
    });

    const matches = scored.filter((entry) => entry.score > 0);
    const source = (matches.length ? matches : scored).sort(
      (a, b) =>
        b.score - a.score || (a.stack.serviceUserName || "").localeCompare(b.stack.serviceUserName || "")
    );

    return {
      visibleServiceUserStacks: source.map((entry) => entry.stack).slice(0, 3),
      hasSearchMatch: matches.length > 0,
    };
  }, [serviceUserStacks, debouncedCallGroupSearch]);

  const rosterRows = useMemo(() => {
    if (!analysisResults.length) return [];
    const hasActualAssignments = analysisResults.some((row) => Boolean(row.actualWorker));
    const seenWorkerSlots = new Set<string>();
    return analysisResults.filter((row) => {
      if (row.isExcludedServiceDutyClass || row.isAdhocCall) return false;
      if (row.isShiftBar) return false;
      const isMismatch = row.workersMatch === false && !row.templateWorker;
      if (!includeMismatchedWorkers && isMismatch) return false;
      const isCancelled = hasActualAssignments
        ? !row.actualWorker && !row.templateWorker
        : !row.actualWorker && !row.templateWorker && !row.plannedWorker;
      if (!includeCancelledCalls && isCancelled) return false;

      // Keep double-up calls (same slot, different carers) by deduping per worker+slot.
      const workerSlotKey = buildWorkerSlotKey(row);
      if (workerSlotKey) {
        if (seenWorkerSlots.has(workerSlotKey)) return false;
        seenWorkerSlots.add(workerSlotKey);
      }
      return true;
    });
  }, [analysisResults, includeCancelledCalls, includeMismatchedWorkers]);

  const doubleUpSlotWorkers = useMemo(() => {
    if (!analysisResults.length) return new Map<string, Set<string>>();
    const map = new Map<string, Set<string>>();
    analysisResults.forEach((row) => {
      if (row.isExcludedServiceDutyClass || row.isAdhocCall) return;
      if (row.isShiftBar) return;
      const slotKey = buildDoubleUpSlotKey(row);
      if (!slotKey) return;
      const workerName = getRowAssignedWorkerName(row);
      if (!workerName) return;
      const workerKey = normalizeWorkerName(workerName) || workerName.toLowerCase();
      const set = map.get(slotKey) ?? new Set<string>();
      set.add(workerKey);
      map.set(slotKey, set);
    });
    return map;
  }, [analysisResults]);

  const doubleUpSlots = useMemo(() => {
    const set = new Set<string>();
    doubleUpSlotWorkers.forEach((workers, slotKey) => {
      if (workers.size > 1) set.add(slotKey);
    });
    return set;
  }, [doubleUpSlotWorkers]);

  const shiftBarRows = useMemo(() => {
    if (!analysisResults.length) return [];
    return analysisResults.filter((row) => {
      if (!row.isShiftBar) return false;
      if (row.isExcludedServiceDutyClass || row.isAdhocCall) return false;
      const workerName = row.templateWorker || row.actualWorker || row.plannedWorker;
      return Boolean(workerName);
    });
  }, [analysisResults]);

  const workerRosterRows = useMemo(() => {
    if (!rosterRows.length && !shiftBarRows.length) return [];
    const combined = [...rosterRows, ...shiftBarRows];
    const seen = new Set<number>();
    return combined.filter((row) => {
      if (seen.has(row.rowNumber)) return false;
      seen.add(row.rowNumber);
      return true;
    });
  }, [rosterRows, shiftBarRows]);

  const shiftBarsByWorker = useMemo(() => {
    if (!shiftBarRows.length) return new Map<string, ShiftBar[]>();
    const map = new Map<string, ShiftBar[]>();
    shiftBarRows.forEach((row) => {
      const workerName = row.templateWorker || row.actualWorker || row.plannedWorker;
      if (!workerName) return;
      const workerKey = normalizeWorkerName(workerName) || workerName.toLowerCase();
      const startMinutes =
        typeof row.plannedTimeMinutes === "number"
          ? row.plannedTimeMinutes
          : typeof row.serviceRequirementTimeMinutes === "number"
          ? row.serviceRequirementTimeMinutes
          : typeof row.actualTimeMinutes === "number"
          ? row.actualTimeMinutes
          : null;
      const endMinutes = typeof startMinutes === "number" ? startMinutes + SHIFT_BAR_DURATION_MINUTES : null;
      const startLabel = deriveTimeLabel(
        startMinutes,
        row.plannedTimeLabel ?? row.serviceRequirementTimeLabel ?? row.actualTimeLabel
      );
      const endLabel = typeof endMinutes === "number" ? deriveTimeLabel(endMinutes, null) : null;
      const templateDate = parseDateKeyToLocalDate(row.plannedDateKey ?? null);
      const templateWeek = templateDate
        ? deriveTemplateWeekKey(templateDate, TEMPLATE_WEEK_1_START_DAY_NUMBER)
        : null;
      const templateDay = templateDate ? deriveWeekdayLabel(templateDate) : null;
      const templateKey =
        templateWeek && templateDay ? buildTemplateWeekdayKey(templateWeek, templateDay) : null;
      const shiftBar: ShiftBar = {
        key: `${workerKey}-${row.rowNumber}`,
        templateKey,
        templateWeek,
        templateDay,
        startMinutes,
        endMinutes,
        durationMinutes: SHIFT_BAR_DURATION_MINUTES,
        startLabel,
        endLabel,
        plannedDateLabel: row.plannedDateLabel ?? null,
      };
      if (!map.has(workerKey)) {
        map.set(workerKey, [shiftBar]);
      } else {
        map.get(workerKey)!.push(shiftBar);
      }
    });

    map.forEach((bars) => {
      bars.sort((a, b) => {
        const aStart = typeof a.startMinutes === "number" ? a.startMinutes : Number.POSITIVE_INFINITY;
        const bStart = typeof b.startMinutes === "number" ? b.startMinutes : Number.POSITIVE_INFINITY;
        if (aStart !== bStart) return aStart - bStart;
        return (a.plannedDateLabel || "").localeCompare(b.plannedDateLabel || "");
      });
    });

    return map;
  }, [shiftBarRows]);

  const careWorkerRosters = useMemo<CareWorkerRoster[]>(() => {
    if (!workerRosterRows.length) return [];

    const workerMap = new Map<
      string,
      {
        workerName: string;
        workerNameNormalized: string;
        rows: RowAnalysis[];
        callRows: RowAnalysis[];
        isAdminStaff: boolean;
      }
    >();
    workerRosterRows.forEach((row) => {
      const workerName = row.templateWorker || row.actualWorker || row.plannedWorker;
      if (!workerName) return;
      const normalized = normalizeWorkerName(workerName) || workerName.toLowerCase();
      if (!workerMap.has(normalized)) {
        workerMap.set(normalized, {
          workerName,
          workerNameNormalized: normalized,
          rows: [],
          callRows: [],
          isAdminStaff: false,
        });
      }
      const worker = workerMap.get(normalized)!;
      worker.rows.push(row);
      if (!row.isShiftBar) worker.callRows.push(row);
      if (row.isAdminStaffRow) worker.isAdminStaff = true;
    });

    return Array.from(workerMap.values())
      .map((worker) => {
        const serviceUserSet = new Set<string>();
        const daySet = new Set<string>();
        let missingRequirementTimes = 0;
        const callGroupMap = new Map<
          string,
          {
            key: string;
            serviceUserName: string | null;
            serviceUserArea: string | null;
            serviceUserAddress: string | null;
            normalizedServiceUserKey: string | null;
            callTypeLabel: string;
            callTypeKey: string;
            timeBandLabel: string;
            requirementTimes: number[];
            durations: number[];
            dayKeys: Set<string>;
            templatedWeekdayKeys: Set<string>;
            doubleUpWeekdayKeys: Set<string>;
            templatedRows: number;
            isTimeCritical: boolean;
            rows: RowAnalysis[];
          }
        >();
        const usesTemplateAssignments = worker.callRows.some((row) => Boolean(row.templateWorker));

        worker.callRows.forEach((row) => {
          if (row.normalizedServiceUserKey) serviceUserSet.add(row.normalizedServiceUserKey);
          if (row.plannedDateKey) daySet.add(row.plannedDateKey);
          const requirementMinutes = getRequirementMinutes(row);
          if (requirementMinutes === null) missingRequirementTimes += 1;

          if (!row.normalizedServiceUserKey) return;
          const callTypeKey = normalizeCallTypeKey(row.callTypeLabel ?? null) || "unknown";
          const timeBandLabel = deriveTimeBandLabel(requirementMinutes);
          const groupKey = `${row.normalizedServiceUserKey}|${callTypeKey}|${timeBandLabel}`;

          if (!callGroupMap.has(groupKey)) {
            callGroupMap.set(groupKey, {
              key: groupKey,
              serviceUserName: row.serviceUserName ?? null,
              serviceUserArea: row.serviceUserArea ?? null,
              serviceUserAddress: row.serviceUserAddress ?? null,
              normalizedServiceUserKey: row.normalizedServiceUserKey ?? null,
              callTypeLabel: row.callTypeLabel ?? "Unknown",
              callTypeKey,
              timeBandLabel,
              requirementTimes: [],
              durations: [],
              dayKeys: new Set<string>(),
              templatedWeekdayKeys: new Set<string>(),
              doubleUpWeekdayKeys: new Set<string>(),
              templatedRows: 0,
              isTimeCritical: false,
              rows: [],
            });
          }

          const group = callGroupMap.get(groupKey)!;
          group.rows.push(row);
          if (!group.serviceUserName && row.serviceUserName) group.serviceUserName = row.serviceUserName;
          if (!group.serviceUserArea && row.serviceUserArea) group.serviceUserArea = row.serviceUserArea;
          if (!group.serviceUserAddress && row.serviceUserAddress) group.serviceUserAddress = row.serviceUserAddress;
          if (typeof requirementMinutes === "number") group.requirementTimes.push(requirementMinutes);

          const durationCandidate =
            typeof row.plannedDurationMinutes === "number"
              ? row.plannedDurationMinutes
              : typeof row.actualDurationMinutes === "number"
              ? row.actualDurationMinutes
              : null;
          if (typeof durationCandidate === "number" && Number.isFinite(durationCandidate)) {
            group.durations.push(durationCandidate);
          }
          if (row.plannedDateKey) group.dayKeys.add(row.plannedDateKey);
          if (row.isTimeCritical) group.isTimeCritical = true;
          const isTemplateAssignment = Boolean(row.templateWorker) || !usesTemplateAssignments;
          if (isTemplateAssignment) {
            const templateDate = parseDateKeyToLocalDate(row.plannedDateKey ?? null);
            if (templateDate) {
              const templateKey = buildTemplateWeekdayKey(
                deriveTemplateWeekKey(templateDate, TEMPLATE_WEEK_1_START_DAY_NUMBER),
                deriveWeekdayLabel(templateDate)
              );
              group.templatedWeekdayKeys.add(templateKey);
              group.templatedRows += 1;

              const doubleUpKey = buildDoubleUpSlotKey(row);
              if (doubleUpKey && doubleUpSlots.has(doubleUpKey)) {
                group.doubleUpWeekdayKeys.add(templateKey);
              }
            }
          }
        });

        const callGroups = Array.from(callGroupMap.values())
          .map((group) => {
            const requirementStartMinutes = calculateMedian(group.requirementTimes);
            const requirementStartLabel = requirementStartMinutes !== null ? deriveTimeLabel(requirementStartMinutes, null) : null;
            const durationMinutes = calculateMedian(group.durations);
            return {
              key: group.key,
              serviceUserName: group.serviceUserName,
              serviceUserArea: group.serviceUserArea,
              serviceUserAddress: group.serviceUserAddress,
              normalizedServiceUserKey: group.normalizedServiceUserKey,
              callTypeLabel: group.callTypeLabel,
              callTypeKey: group.callTypeKey,
              timeBandLabel: group.timeBandLabel,
              requirementStartMinutes,
              requirementStartLabel,
              durationMinutes,
              totalCalls: group.rows.length,
              uniqueDays: group.dayKeys.size,
              templatedWeekdayKeys: group.templatedWeekdayKeys,
              doubleUpWeekdayKeys: group.doubleUpWeekdayKeys,
              templatedRows: group.templatedRows,
              isTimeCritical: group.isTimeCritical,
              rows: group.rows,
            } satisfies WorkerCallGroup;
          })
          .sort((a, b) => {
            const aStart = typeof a.requirementStartMinutes === "number" ? a.requirementStartMinutes : Number.POSITIVE_INFINITY;
            const bStart = typeof b.requirementStartMinutes === "number" ? b.requirementStartMinutes : Number.POSITIVE_INFINITY;
            if (aStart !== bStart) return aStart - bStart;
            return (a.serviceUserName || "").localeCompare(b.serviceUserName || "");
          });

        const shiftBars = shiftBarsByWorker.get(worker.workerNameNormalized) ?? [];
        return {
          key: worker.workerNameNormalized,
          workerName: worker.workerName,
          workerNameNormalized: worker.workerNameNormalized,
          rows: worker.rows,
          callRows: worker.callRows,
          shiftBars,
          shiftBarsCount: shiftBars.length,
          isAdminStaff: worker.isAdminStaff,
          usesTemplateAssignments,
          uniqueServiceUsers: serviceUserSet.size,
          uniqueDays: daySet.size,
          callGroups,
          missingRequirementTimes,
        } satisfies CareWorkerRoster;
      })
      .sort((a, b) => {
        const aName = parsePersonNameForSort(a.workerName);
        const bName = parsePersonNameForSort(b.workerName);
        if (aName.last !== bName.last) return aName.last.localeCompare(bName.last);
        if (aName.first !== bName.first) return aName.first.localeCompare(bName.first);
        return aName.full.localeCompare(bName.full);
      });
  }, [doubleUpSlots, shiftBarsByWorker, workerRosterRows]);

  const { visibleCareWorkerRosters, careWorkerHasMatch } = useMemo(() => {
    if (!careWorkerRosters.length) {
      return { visibleCareWorkerRosters: [], careWorkerHasMatch: true };
    }
    const term = debouncedCareWorkerSearch.trim().toLowerCase();
    if (!term) {
      return {
        visibleCareWorkerRosters: careWorkerRosters.slice(0, rosteringFullscreen ? 16 : 8),
        careWorkerHasMatch: true,
      };
    }

    const scored = careWorkerRosters.map((roster) => {
      const name = roster.workerName.toLowerCase();
      const score = name === term ? 4 : name.startsWith(term) ? 3 : name.includes(term) ? 1 : 0;
      return { roster, score };
    });
    const matches = scored.filter((entry) => entry.score > 0);
    const source = (matches.length ? matches : scored).sort(
      (a, b) => b.score - a.score || a.roster.workerName.localeCompare(b.roster.workerName)
    );

    return {
      visibleCareWorkerRosters: source
        .map((entry) => entry.roster)
        .slice(0, rosteringFullscreen ? 16 : 8),
      careWorkerHasMatch: matches.length > 0,
    };
  }, [careWorkerRosters, debouncedCareWorkerSearch, rosteringFullscreen]);

  const clearTemplateRecommendations = useCallback(
    async (workerKey: string, week: TemplateWeekKey, day: WeekdayLabel, groupKeys: string[]): Promise<{ rateLimited: boolean }> => {
      if (!groupKeys.length) return { rateLimited: false };
      try {
        const response = await fetch("/api/admin/rostering-recommendations", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            workerKey,
            templateWeek: week,
            templateDay: day,
            groupKeys,
          }),
        });
        if (response.status === 429) {
          return { rateLimited: true };
        }
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.message || "Unable to clear template recommendations.");
        }
        const storeKey = buildTemplateRecommendationKey(workerKey, week, day);
        setRecommendedTemplates((prev) => {
          const existing = prev[storeKey];
          if (!existing) return prev;
          const updated = existing.filter((value) => !groupKeys.includes(value));
          if (!updated.length) {
            const next = { ...prev };
            delete next[storeKey];
            return next;
          }
          return {
            ...prev,
            [storeKey]: updated,
          };
        });
        return { rateLimited: false };
      } catch (error) {
        console.warn("Unable to clear template recommendations.", error);
        return { rateLimited: false };
      }
    },
    []
  );

  const clearedRosterFingerprintRef = useRef<string | null>(null);

  useEffect(() => {
    if (!careWorkerRosters.length) return;

    // Build a fingerprint of the roster template state to avoid re-running
    // the same cleanup on every render / data refetch.
    const removals = new Map<
      string,
      { workerKey: string; week: TemplateWeekKey; day: WeekdayLabel; groupKeys: Set<string> }
    >();
    careWorkerRosters.forEach((roster) => {
      if (!roster.usesTemplateAssignments) return;
      roster.callGroups.forEach((group) => {
        group.templatedWeekdayKeys.forEach((templateKey) => {
          const parsed = parseTemplateWeekdayKey(templateKey);
          if (!parsed) return;
          const storeKey = buildTemplateRecommendationKey(roster.key, parsed.week, parsed.day);
          const entry = removals.get(storeKey) ?? {
            workerKey: roster.key,
            week: parsed.week,
            day: parsed.day,
            groupKeys: new Set<string>(),
          };
          entry.groupKeys.add(group.key);
          removals.set(storeKey, entry);
        });
      });
    });

    if (removals.size === 0) return;

    // Fingerprint = sorted store keys; skip if we already cleared this exact set.
    const fingerprint = Array.from(removals.keys()).sort().join("|");
    if (clearedRosterFingerprintRef.current === fingerprint) return;

    let cancelled = false;

    const clearAll = async () => {
      for (const entry of removals.values()) {
        if (cancelled) return;
        const { rateLimited } = await clearTemplateRecommendations(
          entry.workerKey,
          entry.week,
          entry.day,
          Array.from(entry.groupKeys)
        );
        // Stop immediately if the server is rate-limiting us.
        if (rateLimited) {
          console.warn("Rate-limited while clearing rostering recommendations — aborting remaining.");
          return;
        }
      }
      // Mark this fingerprint as completed so subsequent renders skip it.
      if (!cancelled) {
        clearedRosterFingerprintRef.current = fingerprint;
      }
    };

    void clearAll();

    return () => {
      cancelled = true;
    };
  }, [careWorkerRosters, clearTemplateRecommendations]);

  const handleResetRosteringStudio = useCallback(() => {
    setCareWorkerSearch("");
    setRosterCallSearch("");
    setSelectedCareWorkerKey(null);
    setSelectedWorkerCallKeys([]);
    setTemplateOverrides({});
    setExpandedTemplateGroupKeys([]);
    setSelectedTemplateWeek(DEFAULT_TEMPLATE_WEEK);
    setSelectedTemplateDay(DEFAULT_TEMPLATE_DAY);
    setEnforceTimeCriticalWindow(false);
    setPackCallsBackToBack(true);
    setUseObservedAverages(true);
    toast({
      title: "Rostering Studio reset",
      description: "Selections and temporary overrides cleared for this session.",
    });
  }, [toast]);

  const addTemplateRecommendation = useCallback(
    async (workerKey: string, week: TemplateWeekKey, day: WeekdayLabel, groupKey: string) => {
      const storeKey = buildTemplateRecommendationKey(workerKey, week, day);
      if (recommendedTemplates[storeKey]?.includes(groupKey)) return;
      setRecommendedTemplates((prev) => ({
        ...prev,
        [storeKey]: [...(prev[storeKey] ?? []), groupKey],
      }));

      try {
        const response = await fetch("/api/admin/rostering-recommendations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            workerKey,
            templateWeek: week,
            templateDay: day,
            groupKey,
          }),
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.message || "Unable to save template recommendation.");
        }
      } catch (error: any) {
        setRecommendedTemplates((prev) => {
          const existing = prev[storeKey] ?? [];
          const updated = existing.filter((value) => value !== groupKey);
          if (!updated.length) {
            const next = { ...prev };
            delete next[storeKey];
            return next;
          }
          return {
            ...prev,
            [storeKey]: updated,
          };
        });
        toast({
          title: "Recommendation failed",
          description: error?.message || "Unable to save template recommendation.",
          variant: "destructive",
        });
      }
    },
    [recommendedTemplates, toast]
  );

  const selectedCareWorker = useMemo(
    () => careWorkerRosters.find((roster) => roster.key === selectedCareWorkerKey) ?? null,
    [careWorkerRosters, selectedCareWorkerKey]
  );

  const templateSelectionKey = useMemo(
    () => buildTemplateWeekdayKey(selectedTemplateWeek, selectedTemplateDay),
    [selectedTemplateDay, selectedTemplateWeek]
  );

  const recommendationStoreKey = useMemo(() => {
    if (!selectedCareWorker) return null;
    return buildTemplateRecommendationKey(
      selectedCareWorker.key,
      selectedTemplateWeek,
      selectedTemplateDay
    );
  }, [selectedCareWorker, selectedTemplateDay, selectedTemplateWeek]);

  const recommendedForSelection = useMemo(() => {
    if (!recommendationStoreKey) return [];
    return recommendedTemplates[recommendationStoreKey] ?? [];
  }, [recommendationStoreKey, recommendedTemplates]);

  const recommendedForSelectionSet = useMemo(
    () => new Set(recommendedForSelection),
    [recommendedForSelection]
  );

  useEffect(() => {
    if (!selectedCareWorkerKey || !recommendationStoreKey) return;
    let cancelled = false;
    const loadRecommendations = async () => {
      try {
        const params = new URLSearchParams({
          workerKey: selectedCareWorkerKey,
          templateWeek: selectedTemplateWeek,
          templateDay: selectedTemplateDay,
        });
        const response = await fetch(`/api/admin/rostering-recommendations?${params.toString()}`, {
          credentials: "include",
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.message || "Unable to load template recommendations.");
        }
        if (cancelled) return;
        const groupKeys = Array.isArray(result.groupKeys) ? result.groupKeys : [];
        setRecommendedTemplates((prev) => ({
          ...prev,
          [recommendationStoreKey]: groupKeys,
        }));
      } catch (error) {
        if (!cancelled) {
          console.warn("Unable to load template recommendations.", error);
        }
      }
    };
    loadRecommendations();
    return () => {
      cancelled = true;
    };
  }, [recommendationStoreKey, selectedCareWorkerKey, selectedTemplateDay, selectedTemplateWeek]);

  const shiftBarsForSelection = useMemo(() => {
    if (!selectedCareWorker) return [];
    const shiftBars = shiftBarsByWorker.get(selectedCareWorker.key) ?? [];
    return shiftBars.filter((bar) => bar.templateKey === templateSelectionKey);
  }, [selectedCareWorker, shiftBarsByWorker, templateSelectionKey]);

  const unassignedShiftBars = useMemo(() => {
    if (!selectedCareWorker) return [];
    const shiftBars = shiftBarsByWorker.get(selectedCareWorker.key) ?? [];
    return shiftBars.filter((bar) => !bar.templateKey);
  }, [selectedCareWorker, shiftBarsByWorker]);

  const shiftBarsForPayload = useMemo<ShiftBarEntry[]>(
    () =>
      shiftBarsForSelection.map((bar) => ({
        startMinutes: bar.startMinutes,
        endMinutes: bar.endMinutes,
        durationMinutes: bar.durationMinutes,
      })),
    [shiftBarsForSelection]
  );

  const resolvedCallGroups = useMemo<ResolvedWorkerCallGroup[]>(() => {
    if (!selectedCareWorker) return [];
    return selectedCareWorker.callGroups.map((group) => {
      const overrideKey = buildTemplateOverrideKey(selectedCareWorker.key, group.key);
      const override = templateOverrides[overrideKey];

      const trendKey =
        group.normalizedServiceUserKey && group.callTypeKey
          ? `${group.normalizedServiceUserKey}|type-${group.callTypeKey}`
          : null;
      const trend = trendKey ? slotTrendLookup.get(trendKey) : undefined;
      const suggestedStartMinutes = useObservedAverages ? trend?.suggestedStartMinutes : null;

      const baseDays = splitTemplateWeekdayKeys(group.templatedWeekdayKeys);
      const week1Days = override?.week1Days ?? baseDays.week1Days;
      const week2Days = override?.week2Days ?? baseDays.week2Days;
      const effectiveTemplateWeekdayKeys = new Set<string>();
      week1Days.forEach((day) => effectiveTemplateWeekdayKeys.add(buildTemplateWeekdayKey("week1", day)));
      week2Days.forEach((day) => effectiveTemplateWeekdayKeys.add(buildTemplateWeekdayKey("week2", day)));
      const effectiveRequirementStartMinutes =
        typeof override?.requirementStartMinutes === "number"
          ? override.requirementStartMinutes
          : typeof suggestedStartMinutes === "number"
          ? suggestedStartMinutes
          : group.requirementStartMinutes;
      const effectiveRequirementStartLabel =
        typeof effectiveRequirementStartMinutes === "number"
          ? deriveTimeLabel(effectiveRequirementStartMinutes, null)
          : group.requirementStartLabel;
      const effectiveTimeBandLabel = deriveTimeBandLabel(effectiveRequirementStartMinutes);
      const isDoubleUpForSelection = group.doubleUpWeekdayKeys.has(templateSelectionKey);
      return {
        ...group,
        overrideKey,
        effectiveTemplateWeekdayKeys,
        effectiveRequirementStartMinutes,
        effectiveRequirementStartLabel,
        effectiveTimeBandLabel,
        overrideWeek1Days: week1Days,
        overrideWeek2Days: week2Days,
        hasTemplateOverride: Boolean(override),
        isDoubleUpForSelection,
      };
    });
  }, [selectedCareWorker, slotTrendLookup, templateOverrides, templateSelectionKey, useObservedAverages]);

  const filteredResolvedCallGroups = useMemo(() => {
    if (!resolvedCallGroups.length) return [];
    const term = debouncedRosterCallSearch.trim().toLowerCase();
    if (!term) return resolvedCallGroups;
    return resolvedCallGroups.filter((group) => {
      const haystack = [
        group.serviceUserName,
        group.callTypeLabel,
        group.serviceUserArea,
        group.serviceUserAddress,
        group.effectiveTimeBandLabel,
        group.effectiveRequirementStartLabel,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [resolvedCallGroups, debouncedRosterCallSearch]);

  const availableTemplateGroups = useMemo(
    () => resolvedCallGroups.filter((group) => group.effectiveTemplateWeekdayKeys.has(templateSelectionKey)),
    [resolvedCallGroups, templateSelectionKey]
  );

  const templatedAutoSelection = useMemo(
    () => availableTemplateGroups.map((group) => group.key),
    [availableTemplateGroups]
  );

  const selectedTemplateWeekLabel = useMemo(
    () => getTemplateWeekLabel(selectedTemplateWeek, templateWeekReferenceDayNumber),
    [selectedTemplateWeek, templateWeekReferenceDayNumber]
  );

  useEffect(() => {
    if (!selectedCareWorker) return;
    setSelectedWorkerCallKeys(templatedAutoSelection);
  }, [selectedCareWorker, templatedAutoSelection]);

  useEffect(() => {
    setExpandedTemplateGroupKeys([]);
  }, [selectedCareWorker?.key]);

  const selectedWorkerGroups = useMemo(() => {
    if (!resolvedCallGroups.length) return [];
    const selected = new Set(selectedWorkerCallKeys);
    return resolvedCallGroups.filter((group) => selected.has(group.key));
  }, [resolvedCallGroups, selectedWorkerCallKeys]);

  const optimizedRun = useMemo<OptimizedRouteEntry[]>(() => {
    if (!selectedWorkerGroups.length) return [];
    const DAY_START_MINUTES = ROSTER_DAY_START_MINUTES;
    const bandOrder = ["AM", "Lunch", "Tea", "Evening", "Night", "Unscheduled"];

    const blockedIntervals = (() => {
      if (!selectedCareWorker?.isAdminStaff) return [] as Array<{ start: number; end: number }>;
      const intervals = shiftBarsForSelection
        .map((bar) => {
          if (typeof bar.startMinutes !== "number" || typeof bar.endMinutes !== "number") return null;
          return { start: bar.startMinutes, end: bar.endMinutes };
        })
        .filter(Boolean) as Array<{ start: number; end: number }>;
      intervals.sort((a, b) => a.start - b.start || a.end - b.end);
      return intervals;
    })();

    const overlapsBlocked = (start: number, end: number) => {
      return blockedIntervals.some((interval) => start < interval.end && end > interval.start);
    };

    const shiftPastBlocked = (start: number, durationMinutes: number) => {
      if (!blockedIntervals.length) {
        return { start, shifted: false };
      }

      let candidate = start;
      let shifted = false;
      // Prevent infinite loops in pathological data.
      for (let i = 0; i < blockedIntervals.length + 2; i += 1) {
        const end = candidate + durationMinutes;
        const overlap = blockedIntervals.find((interval) => candidate < interval.end && end > interval.start);
        if (!overlap) break;
        candidate = overlap.end;
        shifted = true;
      }

      return { start: candidate, shifted };
    };

    const groupsByBand = bandOrder.reduce<Record<string, ResolvedWorkerCallGroup[]>>((acc, band) => {
      acc[band] = [];
      return acc;
    }, {});
    selectedWorkerGroups.forEach((group) => {
      const band = group.effectiveTimeBandLabel;
      if (!groupsByBand[band]) groupsByBand[band] = [];
      groupsByBand[band].push(group);
    });

    const optimized: OptimizedRouteEntry[] = [];
    let currentEndOverall: number | null = null;

    bandOrder.forEach((band) => {
      const bandGroups = groupsByBand[band] ?? [];
      if (!bandGroups.length) return;

      const bandGroupsWithTimes = bandGroups.filter(
        (group) => typeof group.effectiveRequirementStartMinutes === "number"
      );
      const bandMinRequirement = bandGroupsWithTimes.reduce<number | null>((acc, group) => {
        const minutes = group.effectiveRequirementStartMinutes as number;
        if (acc === null || minutes < acc) return minutes;
        return acc;
      }, null);

      const bandAnchorStart =
        typeof bandMinRequirement === "number"
          ? Math.max(DAY_START_MINUTES, bandMinRequirement)
          : DAY_START_MINUTES;
      let cursor = currentEndOverall;
      if (cursor === null || cursor < bandAnchorStart) cursor = bandAnchorStart;

      const sorted = [...bandGroups].sort((a, b) => {
        const aStart =
          typeof a.effectiveRequirementStartMinutes === "number"
            ? a.effectiveRequirementStartMinutes
            : Number.POSITIVE_INFINITY;
        const bStart =
          typeof b.effectiveRequirementStartMinutes === "number"
            ? b.effectiveRequirementStartMinutes
            : Number.POSITIVE_INFINITY;
        if (aStart !== bStart) return aStart - bStart;
        return (a.serviceUserName || "").localeCompare(b.serviceUserName || "");
      });

      sorted.forEach((group) => {
        const trendKey =
          group.normalizedServiceUserKey && group.callTypeKey
            ? `${group.normalizedServiceUserKey}|type-${group.callTypeKey}`
            : null;
        const trend = trendKey ? slotTrendLookup.get(trendKey) : undefined;
        const suggestedDurationMinutes = useObservedAverages ? trend?.suggestedDurationMinutes : null;

        const durationMinutes =
          typeof suggestedDurationMinutes === "number" && Number.isFinite(suggestedDurationMinutes) && suggestedDurationMinutes > 0
            ? suggestedDurationMinutes
            : typeof group.durationMinutes === "number"
            ? group.durationMinutes
            : DEFAULT_ROUTE_DURATION_MINUTES;
        const isLockedDoubleUp = group.isDoubleUpForSelection;

        if (typeof group.effectiveRequirementStartMinutes !== "number") {
          optimized.push({
            key: group.key,
            serviceUserName: group.serviceUserName,
            serviceUserArea: group.serviceUserArea ?? null,
            serviceUserAddress: group.serviceUserAddress ?? null,
            callTypeLabel: group.callTypeLabel,
            timeBandLabel: group.effectiveTimeBandLabel,
            requirementStartMinutes: group.effectiveRequirementStartMinutes,
            scheduledStartMinutes: null,
            scheduledEndMinutes: null,
            durationMinutes: group.durationMinutes,
            shiftMinutes: null,
            recommendedStartMinutes: null,
            travelMinutesEstimated: null,
            isTimeCritical: group.isTimeCritical,
            isDoubleUp: isLockedDoubleUp,
            windowStartMinutes: null,
            windowEndMinutes: null,
            isOutsideWindow: false,
            hasWindowConflict: false,
          });
          return;
        }

        const requirementStart = group.effectiveRequirementStartMinutes;
        const windowStart = group.isTimeCritical ? requirementStart - TIME_CRITICAL_WINDOW_MINUTES : null;
        const windowEnd = group.isTimeCritical ? requirementStart + TIME_CRITICAL_WINDOW_MINUTES : null;

        let scheduledStart: number;
        let hasWindowConflict = false;

        if (isLockedDoubleUp) {
          scheduledStart = Math.max(DAY_START_MINUTES, requirementStart);
          if (cursor !== null && scheduledStart < cursor) {
            hasWindowConflict = true;
          }
        } else {
          const allowEarlyStart = packCallsBackToBack && !group.isTimeCritical;
          const baselineStart = allowEarlyStart
            ? cursor ?? requirementStart
            : Math.max(cursor ?? requirementStart, requirementStart);
          scheduledStart = Math.max(baselineStart, DAY_START_MINUTES);
        }

        // Office staff: prevent scheduling calls inside shift bars.
        if (selectedCareWorker?.isAdminStaff) {
          const shiftResult = shiftPastBlocked(scheduledStart, durationMinutes);
          if (shiftResult.shifted) {
            hasWindowConflict = true;
          }
          scheduledStart = shiftResult.start;
        }

        const scheduledEnd = scheduledStart + durationMinutes;
        const hadOverlap = cursor !== null && scheduledStart < cursor;
        if (hadOverlap) hasWindowConflict = true;
        cursor = cursor !== null ? Math.max(cursor, scheduledEnd) : scheduledEnd;

        // Final safety: if something caused an overlap with blocked time, flag it.
        if (selectedCareWorker?.isAdminStaff && overlapsBlocked(scheduledStart, scheduledEnd)) {
          hasWindowConflict = true;
        }

        const isOutsideWindow =
          group.isTimeCritical && windowStart !== null && windowEnd !== null
            ? scheduledStart < windowStart || scheduledStart > windowEnd
            : false;

        // Suggest a window-aligned start rather than hard-locking time-critical calls.
        const suggestedStartMinutes =
          group.isTimeCritical && windowStart !== null && windowEnd !== null && isOutsideWindow
            ? Math.min(Math.max(scheduledStart, windowStart), windowEnd)
            : null;
        if (suggestedStartMinutes !== null) {
          hasWindowConflict = true;
        }

        optimized.push({
          key: group.key,
          serviceUserName: group.serviceUserName,
          serviceUserArea: group.serviceUserArea ?? null,
          serviceUserAddress: group.serviceUserAddress ?? null,
          callTypeLabel: group.callTypeLabel,
          timeBandLabel: group.effectiveTimeBandLabel,
          requirementStartMinutes: requirementStart,
          scheduledStartMinutes: scheduledStart,
          scheduledEndMinutes: scheduledEnd,
          durationMinutes,
          shiftMinutes: scheduledStart - requirementStart,
          recommendedStartMinutes: suggestedStartMinutes ?? scheduledStart,
          travelMinutesEstimated: null,
          isTimeCritical: group.isTimeCritical,
          isDoubleUp: isLockedDoubleUp,
          windowStartMinutes: windowStart,
          windowEndMinutes: windowEnd,
          isOutsideWindow,
          hasWindowConflict,
          suggestedStartMinutes,
        });
      });

      currentEndOverall = cursor;
    });

    const withRecommendations = optimized.map((entry) => ({
      ...entry,
      recommendedStartMinutes:
        typeof entry.recommendedStartMinutes === "number"
          ? entry.recommendedStartMinutes
          : entry.suggestedStartMinutes ?? entry.scheduledStartMinutes ?? entry.requirementStartMinutes ?? null,
    }));

    const travelByKey = new Map<string, number | null>();
    const scheduledSorted = [...withRecommendations]
      .filter((entry) => typeof entry.scheduledStartMinutes === "number")
      .sort((a, b) => (a.scheduledStartMinutes as number) - (b.scheduledStartMinutes as number));
    let previous: OptimizedRouteEntry | null = null;
    for (const entry of scheduledSorted) {
      let travel: number | null = null;
      if (previous) {
        if (previous.serviceUserName && entry.serviceUserName && previous.serviceUserName === entry.serviceUserName) {
          travel = 0;
        } else if (previous.serviceUserArea && entry.serviceUserArea) {
          travel = previous.serviceUserArea === entry.serviceUserArea ? 6 : 12;
        } else {
          travel = 10;
        }
      }
      travelByKey.set(entry.key, travel);
      previous = entry;
    }

    return withRecommendations.map((entry) => ({
      ...entry,
      travelMinutesEstimated: travelByKey.get(entry.key) ?? null,
    }));
  }, [enforceTimeCriticalWindow, packCallsBackToBack, selectedCareWorker?.isAdminStaff, selectedWorkerGroups, shiftBarsForSelection, slotTrendLookup, useObservedAverages]);

  const rosterSummary = useMemo(() => {
    if (!optimizedRun.length) return null;
    const scheduledEntries = optimizedRun.filter(
      (entry) => typeof entry.scheduledStartMinutes === "number" && typeof entry.scheduledEndMinutes === "number"
    );
    const scheduledCount = scheduledEntries.length;
    const unscheduledCount = optimizedRun.length - scheduledCount;
    const totalDurationMinutes = scheduledEntries.reduce((total, entry) => {
      const duration = typeof entry.durationMinutes === "number" ? entry.durationMinutes : DEFAULT_ROUTE_DURATION_MINUTES;
      return total + duration;
    }, 0);
    const earliestStart =
      scheduledEntries.length > 0
        ? Math.min(...scheduledEntries.map((entry) => entry.scheduledStartMinutes as number))
        : null;
    const latestEnd =
      scheduledEntries.length > 0
        ? Math.max(...scheduledEntries.map((entry) => entry.scheduledEndMinutes as number))
        : null;
    const runSpanMinutes =
      typeof earliestStart === "number" && typeof latestEnd === "number" ? latestEnd - earliestStart : null;

    const sortedByStart = [...scheduledEntries].sort((a, b) => {
      return (a.scheduledStartMinutes as number) - (b.scheduledStartMinutes as number);
    });
    const idleMinutes = sortedByStart.reduce((acc, entry, idx) => {
      if (idx === 0) return acc;
      const prevEnd = sortedByStart[idx - 1].scheduledEndMinutes as number;
      const gap = (entry.scheduledStartMinutes as number) - prevEnd;
      return gap > 0 ? acc + gap : acc;
    }, 0);

    const beforeStartCount = scheduledEntries.filter(
      (entry) => (entry.scheduledStartMinutes as number) < ROSTER_DAY_START_MINUTES
    ).length;
    const afterSoftCount = scheduledEntries.filter((entry) => {
      const endMinutes = entry.scheduledEndMinutes as number;
      return endMinutes > ROSTER_DAY_SOFT_END_MINUTES && endMinutes <= ROSTER_DAY_HARD_END_MINUTES;
    }).length;
    const afterHardCount = scheduledEntries.filter(
      (entry) => (entry.scheduledEndMinutes as number) > ROSTER_DAY_HARD_END_MINUTES
    ).length;
    const outsideWindowCount = scheduledEntries.filter((entry) => entry.isOutsideWindow).length;
    const windowConflictCount = scheduledEntries.filter((entry) => entry.hasWindowConflict).length;
    const timeCriticalCount = optimizedRun.filter((entry) => entry.isTimeCritical).length;
    const doubleUpCount = optimizedRun.filter((entry) => entry.isDoubleUp).length;

    return {
      totalCalls: optimizedRun.length,
      scheduledCount,
      unscheduledCount,
      totalDurationMinutes,
      earliestStart,
      latestEnd,
      runSpanMinutes,
      idleMinutes,
      beforeStartCount,
      afterSoftCount,
      afterHardCount,
      outsideWindowCount,
      windowConflictCount,
      timeCriticalCount,
      doubleUpCount,
    };
  }, [optimizedRun]);

  const buildCallSignature = useCallback(() => {
    if (!primaryRows.length) return "";
    const items: string[] = [];
    primaryRows.forEach((row) => {
      if (row.isShiftBar) return;
      const serviceKey =
        row.normalizedServiceUserKey ||
        (row.serviceUserName ? row.serviceUserName.toLowerCase().trim() : "unknown");
      const dateKey = row.plannedDateKey || "";
      const slotMinutes = getRowSlotMinutes(row);
      const duration =
        typeof row.plannedDurationMinutes === "number"
          ? row.plannedDurationMinutes
          : typeof row.actualDurationMinutes === "number"
          ? row.actualDurationMinutes
          : null;
      const callTypeKey = normalizeCallTypeKey(row.callTypeLabel ?? null) || "unknown";
      const isCancelled = !row.actualWorker && !row.isShiftBar;
      items.push(
        [
          serviceKey,
          dateKey,
          typeof slotMinutes === "number" ? Math.round(slotMinutes).toString() : "",
          typeof duration === "number" ? Math.round(duration).toString() : "",
          callTypeKey,
          isCancelled ? "1" : "0",
        ].join("|")
      );
    });
    items.sort();
    return items.join("\n");
  }, [primaryRows]);

  const handleSaveRota = useCallback(async () => {
    if (!selectedCareWorker) {
      toast({
        title: "Select a care worker",
        description: "Choose a care worker before saving a rota.",
        variant: "destructive",
      });
      return;
    }
    if (!optimizedRun.length) {
      toast({
        title: "No rota to save",
        description: "Generate an optimized run before saving.",
        variant: "destructive",
      });
      return;
    }

    // Create minimal payload - only essential fields for storage
    const minimalOptimizedRun = optimizedRun.map((entry) => ({
      key: entry.key,
      serviceUserName: entry.serviceUserName,
      serviceUserArea: entry.serviceUserArea,
      serviceUserAddress: entry.serviceUserAddress,
      callTypeLabel: entry.callTypeLabel,
      timeBandLabel: entry.timeBandLabel,
      requirementStartMinutes: entry.requirementStartMinutes,
      scheduledStartMinutes: entry.scheduledStartMinutes,
      scheduledEndMinutes: entry.scheduledEndMinutes,
      durationMinutes: entry.durationMinutes,
      shiftMinutes: entry.shiftMinutes,
      travelMinutesEstimated: entry.travelMinutesEstimated,
      isTimeCritical: entry.isTimeCritical,
      isDoubleUp: entry.isDoubleUp,
      windowStartMinutes: entry.windowStartMinutes,
      windowEndMinutes: entry.windowEndMinutes,
      isOutsideWindow: entry.isOutsideWindow,
      hasWindowConflict: entry.hasWindowConflict,
      suggestedStartMinutes: entry.suggestedStartMinutes ?? null,
    }));

    const payload = {
      workerName: selectedCareWorker.workerName,
      workerKey: selectedCareWorker.key,
      templateWeek: selectedTemplateWeek,
      templateDay: selectedTemplateDay,
      timeCriticalWindowEnforced: enforceTimeCriticalWindow,
      shiftBars: shiftBarsForPayload,
      optimizedRun: minimalOptimizedRun,
    };

    setIsSavingRota(true);
    try {
      const response = await fetch("/api/admin/care-worker-rotas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "Unable to save rota.");
      }
      toast({
        title: result.deduped ? "Rota already saved" : "Rota saved",
        description: result.deduped
          ? "An identical rota already exists in the admin library."
          : "The optimized rota is now available in the admin library.",
      });
    } catch (error: any) {
      toast({
        title: "Save failed",
        description: error.message || "Unable to save the rota.",
        variant: "destructive",
      });
    } finally {
      setIsSavingRota(false);
    }
  }, [
    enforceTimeCriticalWindow,
    optimizedRun,
    selectedCareWorker,
    selectedTemplateDay,
    selectedTemplateWeek,
    shiftBarsForPayload,
    toast,
  ]);

  const handleSaveAllRotas = useCallback(async () => {
    if (!careWorkerRosters.length) {
      toast({
        title: "No workers to save",
        description: "Upload a workbook first to extract care worker rotas.",
        variant: "destructive",
      });
      return;
    }

    setIsSavingAllRotas(true);
    setBulkSaveProgress({ saved: 0, skipped: 0, total: careWorkerRosters.length });

    const bandOrder = ["AM", "Lunch", "Tea", "Evening", "Night", "Unscheduled"];
    const DAY_START_MINUTES = ROSTER_DAY_START_MINUTES;
    let savedCount = 0;
    let skippedCount = 0;

    for (const worker of careWorkerRosters) {
      try {
        // Get call groups for this worker on the selected day
        const workerCallGroups = worker.callGroups.map((group) => {
          const overrideKey = buildTemplateOverrideKey(worker.key, group.key);
          const override = templateOverrides[overrideKey];
          const baseDays = splitTemplateWeekdayKeys(group.templatedWeekdayKeys);
          const week1Days = override?.week1Days ?? baseDays.week1Days;
          const week2Days = override?.week2Days ?? baseDays.week2Days;
          const effectiveTemplateWeekdayKeys = new Set<string>();
          week1Days.forEach((day) => effectiveTemplateWeekdayKeys.add(buildTemplateWeekdayKey("week1", day)));
          week2Days.forEach((day) => effectiveTemplateWeekdayKeys.add(buildTemplateWeekdayKey("week2", day)));
          const effectiveRequirementStartMinutes =
            typeof override?.requirementStartMinutes === "number"
              ? override.requirementStartMinutes
              : group.requirementStartMinutes;
          const effectiveTimeBandLabel = deriveTimeBandLabel(effectiveRequirementStartMinutes);
          const isDoubleUpForSelection = group.doubleUpWeekdayKeys.has(templateSelectionKey);
          return {
            ...group,
            effectiveTemplateWeekdayKeys,
            effectiveRequirementStartMinutes,
            effectiveTimeBandLabel,
            isDoubleUpForSelection,
          };
        });

        // Filter to call groups matching the template day
        const availableGroups = workerCallGroups.filter((group) =>
          group.effectiveTemplateWeekdayKeys.has(templateSelectionKey)
        );

        if (!availableGroups.length) {
          skippedCount += 1;
          setBulkSaveProgress({ saved: savedCount, skipped: skippedCount, total: careWorkerRosters.length });
          continue;
        }

        // Get shift bars for this worker
        const workerShiftBars = shiftBarsByWorker.get(worker.key) ?? [];
        const shiftBarsForWorker = workerShiftBars.filter((bar) => bar.templateKey === templateSelectionKey);
        const shiftBarsPayload: ShiftBarEntry[] = shiftBarsForWorker.map((bar) => ({
          startMinutes: bar.startMinutes,
          endMinutes: bar.endMinutes,
          durationMinutes: bar.durationMinutes,
        }));

        // Compute blocked intervals for admin staff
        const blockedIntervals = (() => {
          if (!worker.isAdminStaff) return [] as Array<{ start: number; end: number }>;
          const intervals = shiftBarsForWorker
            .map((bar) => {
              if (typeof bar.startMinutes !== "number" || typeof bar.endMinutes !== "number") return null;
              return { start: bar.startMinutes, end: bar.endMinutes };
            })
            .filter(Boolean) as Array<{ start: number; end: number }>;
          intervals.sort((a, b) => a.start - b.start || a.end - b.end);
          return intervals;
        })();

        const shiftPastBlocked = (start: number, durationMinutes: number) => {
          if (!blockedIntervals.length) return { start, shifted: false };
          let candidate = start;
          let shifted = false;
          for (let i = 0; i < blockedIntervals.length + 2; i += 1) {
            const end = candidate + durationMinutes;
            const overlap = blockedIntervals.find((interval) => candidate < interval.end && end > interval.start);
            if (!overlap) break;
            candidate = overlap.end;
            shifted = true;
          }
          return { start: candidate, shifted };
        };

        // Group by time band
        const groupsByBand = bandOrder.reduce<Record<string, typeof availableGroups>>((acc, band) => {
          acc[band] = [];
          return acc;
        }, {});
        availableGroups.forEach((group) => {
          const band = group.effectiveTimeBandLabel;
          if (!groupsByBand[band]) groupsByBand[band] = [];
          groupsByBand[band].push(group);
        });

        // Optimize the run
        const optimized: OptimizedRouteEntry[] = [];
        let currentEndOverall: number | null = null;

        bandOrder.forEach((band) => {
          const bandGroups = groupsByBand[band] ?? [];
          if (!bandGroups.length) return;

          const bandGroupsWithTimes = bandGroups.filter(
            (group) => typeof group.effectiveRequirementStartMinutes === "number"
          );
          const bandMinRequirement = bandGroupsWithTimes.reduce<number | null>((acc, group) => {
            const minutes = group.effectiveRequirementStartMinutes as number;
            if (acc === null || minutes < acc) return minutes;
            return acc;
          }, null);

          const bandAnchorStart =
            typeof bandMinRequirement === "number"
              ? Math.max(DAY_START_MINUTES, bandMinRequirement)
              : DAY_START_MINUTES;
          let cursor = currentEndOverall;
          if (cursor === null || cursor < bandAnchorStart) cursor = bandAnchorStart;

          const sorted = [...bandGroups].sort((a, b) => {
            const aStart =
              typeof a.effectiveRequirementStartMinutes === "number"
                ? a.effectiveRequirementStartMinutes
                : Number.POSITIVE_INFINITY;
            const bStart =
              typeof b.effectiveRequirementStartMinutes === "number"
                ? b.effectiveRequirementStartMinutes
                : Number.POSITIVE_INFINITY;
            if (aStart !== bStart) return aStart - bStart;
            return (a.serviceUserName || "").localeCompare(b.serviceUserName || "");
          });

          sorted.forEach((group) => {
            const durationMinutes =
              typeof group.durationMinutes === "number" ? group.durationMinutes : DEFAULT_ROUTE_DURATION_MINUTES;
            const isLockedDoubleUp = group.isDoubleUpForSelection;

            if (typeof group.effectiveRequirementStartMinutes !== "number") {
              optimized.push({
                key: group.key,
                serviceUserName: group.serviceUserName,
                serviceUserArea: group.serviceUserArea ?? null,
                serviceUserAddress: group.serviceUserAddress ?? null,
                callTypeLabel: group.callTypeLabel,
                timeBandLabel: group.effectiveTimeBandLabel,
                requirementStartMinutes: group.effectiveRequirementStartMinutes,
                scheduledStartMinutes: null,
                scheduledEndMinutes: null,
                durationMinutes: group.durationMinutes,
                shiftMinutes: null,
                recommendedStartMinutes: null,
                travelMinutesEstimated: null,
                isTimeCritical: group.isTimeCritical,
                isDoubleUp: isLockedDoubleUp,
                windowStartMinutes: null,
                windowEndMinutes: null,
                isOutsideWindow: false,
                hasWindowConflict: false,
              });
              return;
            }

            const requirementStart = group.effectiveRequirementStartMinutes;
            const windowStart = group.isTimeCritical ? requirementStart - TIME_CRITICAL_WINDOW_MINUTES : null;
            const windowEnd = group.isTimeCritical ? requirementStart + TIME_CRITICAL_WINDOW_MINUTES : null;

            let scheduledStart: number;
            let hasWindowConflict = false;

            if (isLockedDoubleUp) {
              scheduledStart = Math.max(DAY_START_MINUTES, requirementStart);
              if (cursor !== null && scheduledStart < cursor) {
                hasWindowConflict = true;
              }
            } else {
              const allowEarlyStart = packCallsBackToBack && !group.isTimeCritical;
              const baselineStart = allowEarlyStart
                ? cursor ?? requirementStart
                : Math.max(cursor ?? requirementStart, requirementStart);
              scheduledStart = Math.max(baselineStart, DAY_START_MINUTES);
            }

            if (worker.isAdminStaff) {
              const adjusted = shiftPastBlocked(scheduledStart, durationMinutes);
              if (adjusted.shifted) scheduledStart = adjusted.start;
            }

            const scheduledEnd = scheduledStart + durationMinutes;
            const shiftMinutes = scheduledStart - requirementStart;
            const isOutsideWindow =
              enforceTimeCriticalWindow && group.isTimeCritical && windowStart !== null && windowEnd !== null
                ? scheduledStart < windowStart || scheduledStart > windowEnd
                : false;

            optimized.push({
              key: group.key,
              serviceUserName: group.serviceUserName,
              serviceUserArea: group.serviceUserArea ?? null,
              serviceUserAddress: group.serviceUserAddress ?? null,
              callTypeLabel: group.callTypeLabel,
              timeBandLabel: group.effectiveTimeBandLabel,
              requirementStartMinutes: requirementStart,
              scheduledStartMinutes: scheduledStart,
              scheduledEndMinutes: scheduledEnd,
              durationMinutes,
              shiftMinutes,
              recommendedStartMinutes: null,
              travelMinutesEstimated: null,
              isTimeCritical: group.isTimeCritical,
              isDoubleUp: isLockedDoubleUp,
              windowStartMinutes: windowStart,
              windowEndMinutes: windowEnd,
              isOutsideWindow,
              hasWindowConflict,
            });

            if (!isLockedDoubleUp) {
              cursor = scheduledEnd;
              if (typeof currentEndOverall !== "number" || scheduledEnd > currentEndOverall) {
                currentEndOverall = scheduledEnd;
              }
            }
          });
        });

        if (!optimized.length) {
          skippedCount += 1;
          setBulkSaveProgress({ saved: savedCount, skipped: skippedCount, total: careWorkerRosters.length });
          continue;
        }

        // Build minimal payload - only essential fields for storage
        const minimalOptimizedRun = optimized.map((entry) => ({
          key: entry.key,
          serviceUserName: entry.serviceUserName,
          serviceUserArea: entry.serviceUserArea,
          serviceUserAddress: entry.serviceUserAddress,
          callTypeLabel: entry.callTypeLabel,
          timeBandLabel: entry.timeBandLabel,
          requirementStartMinutes: entry.requirementStartMinutes,
          scheduledStartMinutes: entry.scheduledStartMinutes,
          scheduledEndMinutes: entry.scheduledEndMinutes,
          durationMinutes: entry.durationMinutes,
          shiftMinutes: entry.shiftMinutes,
          travelMinutesEstimated: entry.travelMinutesEstimated,
          isTimeCritical: entry.isTimeCritical,
          isDoubleUp: entry.isDoubleUp,
          windowStartMinutes: entry.windowStartMinutes,
          windowEndMinutes: entry.windowEndMinutes,
          isOutsideWindow: entry.isOutsideWindow,
          hasWindowConflict: entry.hasWindowConflict,
          suggestedStartMinutes: entry.suggestedStartMinutes ?? null,
        }));

        const payload = {
          workerName: worker.workerName,
          workerKey: worker.key,
          templateWeek: selectedTemplateWeek,
          templateDay: selectedTemplateDay,
          timeCriticalWindowEnforced: enforceTimeCriticalWindow,
          shiftBars: shiftBarsPayload,
          optimizedRun: minimalOptimizedRun,
        };

        const response = await fetch("/api/admin/care-worker-rotas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
        const result = await response.json();

        if (!response.ok) {
          console.warn(`Failed to save rota for ${worker.workerName}:`, result.message);
          skippedCount += 1;
        } else if (result.deduped) {
          skippedCount += 1;
        } else {
          savedCount += 1;
        }

        setBulkSaveProgress({ saved: savedCount, skipped: skippedCount, total: careWorkerRosters.length });
      } catch (error: any) {
        console.warn(`Error saving rota for ${worker.workerName}:`, error);
        skippedCount += 1;
        setBulkSaveProgress({ saved: savedCount, skipped: skippedCount, total: careWorkerRosters.length });
      }
    }

    toast({
      title: savedCount > 0 ? "Rotas saved" : "No new rotas saved",
      description: `${savedCount} saved, ${skippedCount} skipped (duplicates or no calls).`,
    });

    setIsSavingAllRotas(false);
    setBulkSaveProgress(null);
  }, [
    careWorkerRosters,
    enforceTimeCriticalWindow,
    packCallsBackToBack,
    selectedTemplateDay,
    selectedTemplateWeek,
    shiftBarsByWorker,
    templateOverrides,
    templateSelectionKey,
    toast,
  ]);

  const handleLoadMore = () => {
    setVisibleCount((prev) => Math.min(filteredResults.length, prev + INITIAL_VISIBLE_ROWS));
  };

  const handleReset = useCallback(() => {
    analysisJobRef.current = Date.now();
    setFileMeta(null);
    setSourceHash(null);
    setConvertedBlob(null);
    setDownloadUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setAnalysisResults([]);
    setSelectedRow(null);
    setSearchTerm("");
    setCallGroupSearch("");
    setCareWorkerSearch("");
    setRosterCallSearch("");
    setSelectedTemplateWeek(DEFAULT_TEMPLATE_WEEK);
    setSelectedTemplateDay(DEFAULT_TEMPLATE_DAY);
    setEnforceTimeCriticalWindow(false);
    setPackCallsBackToBack(true);
    setTemplateOverrides({});
    setExpandedTemplateGroupKeys([]);
    setSelectedCareWorkerKey(null);
    setSelectedWorkerCallKeys([]);
    setFilterStatus("all");
    setShowDuplicateRows(false);
    setIncludeCancelledCalls(false);
    setIncludeMismatchedWorkers(false);
    setExcludeOfficeStaffFromPdf(false);
    setVisibleCount(INITIAL_VISIBLE_ROWS);
    setProgress(0);
    setProcessingState("idle");
  }, []);

  useEffect(() => {
    if (
      !isAdmin &&
      (analysisResults.length > 0 ||
        fileMeta ||
        convertedBlob ||
        downloadUrl ||
        processingState !== "idle")
    ) {
      handleReset();
    }
  }, [
    analysisResults.length,
    convertedBlob,
    downloadUrl,
    fileMeta,
    handleReset,
    isAdmin,
    processingState,
  ]);

  const triggerDownload = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, []);

  const buildRotaExportRows = useCallback(() => {
    return optimizedRun.map((entry, index) => ({
      Order: index + 1,
      "Service User": entry.serviceUserName ?? "",
      "Call Type": entry.callTypeLabel ?? "",
      "Time Band": entry.timeBandLabel ?? "",
      "Requirement Time": deriveTimeLabel(entry.requirementStartMinutes, null) ?? "",
      "Scheduled Start": deriveTimeLabel(entry.scheduledStartMinutes, null) ?? "",
      "Scheduled End": deriveTimeLabel(entry.scheduledEndMinutes, null) ?? "",
      "Recommended Start": deriveTimeLabel(entry.recommendedStartMinutes, null) ?? "",
      "Duration (mins)": typeof entry.durationMinutes === "number" ? Math.round(entry.durationMinutes) : "",
      "Shift (mins)":
        typeof entry.shiftMinutes === "number" ? Math.round(entry.shiftMinutes) : "",
      "Travel Estimate (mins)":
        typeof entry.travelMinutesEstimated === "number" ? Math.round(entry.travelMinutesEstimated) : "",
      "Time Critical": entry.isTimeCritical ? "Yes" : "No",
      "Double Up": entry.isDoubleUp ? "Yes" : "No",
      "Window Start": deriveTimeLabel(entry.windowStartMinutes, null) ?? "",
      "Window End": deriveTimeLabel(entry.windowEndMinutes, null) ?? "",
      "Outside Window": entry.isOutsideWindow ? "Yes" : "No",
      "Window Conflict": entry.hasWindowConflict ? "Yes" : "No",
    }));
  }, [optimizedRun]);

  const buildRotaFilename = useCallback(
    (suffix: string) => {
      const worker = selectedCareWorker?.workerName || "rota";
      const safeWorker = worker.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
      return `${safeWorker}-${selectedTemplateWeek}-${selectedTemplateDay}-${suffix}`;
    },
    [selectedCareWorker?.workerName, selectedTemplateDay, selectedTemplateWeek]
  );

  const handleExportRotaCsv = useCallback(() => {
    if (!optimizedRun.length) {
      toast({
        title: "No rota to export",
        description: "Generate an optimized run before exporting.",
        variant: "destructive",
      });
      return;
    }
    const rows = buildRotaExportRows();
    const headers = rows.length ? Object.keys(rows[0]) : [];
    const escapeValue = (value: unknown) => {
      const text = String(value ?? "");
      if (/[",\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };
    const csv = [
      headers.join(","),
      ...rows.map((row) => headers.map((key) => escapeValue((row as Record<string, unknown>)[key])).join(",")),
    ].join("\n");
    triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), buildRotaFilename("rota.csv"));
  }, [buildRotaExportRows, buildRotaFilename, optimizedRun.length, toast, triggerDownload]);

  const handleCopyRota = useCallback(async () => {
    if (!optimizedRun.length) {
      toast({
        title: "No rota to copy",
        description: "Generate an optimized run before copying.",
        variant: "destructive",
      });
      return;
    }
    const rows = buildRotaExportRows();
    const headers = rows.length ? Object.keys(rows[0]) : [];
    const text = [
      headers.join("\t"),
      ...rows.map((row) => headers.map((key) => String((row as Record<string, unknown>)[key] ?? "")).join("\t")),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Rota copied",
        description: "The schedule is now on your clipboard.",
      });
    } catch (error: any) {
      toast({
        title: "Copy failed",
        description: error.message || "Unable to copy the rota.",
        variant: "destructive",
      });
    }
  }, [buildRotaExportRows, optimizedRun.length, toast]);

  const handleExportFiltered = useCallback(() => {
    if (!isAdmin) {
      toast({
        title: "Restricted access",
        description: "Administrator access is required to export Testing Features data.",
        variant: "destructive",
      });
      return;
    }
    if (!filteredResults.length) {
      toast({
        title: "No rows to export",
        description: "Adjust filters or load a workbook to export rows.",
        variant: "destructive",
      });
      return;
    }

    const exportRows = filteredResults.map((row) => ({
      "Row #": row.rowNumber,
      Status: row.status === "clean" ? "Clean" : "Needs attention",
      "Service User": row.serviceUserName ?? "",
      Area: row.serviceUserArea ?? "",
      Address: row.serviceUserAddress ?? "",
      "Call Type": row.callTypeLabel ?? "",
      "Planned Date": row.plannedDateLabel ?? "",
      "Planned Time": row.plannedTimeLabel ?? "",
      "Actual Time": row.actualTimeLabel ?? "",
      "Planned Worker": row.plannedWorker ?? "",
      "Actual Worker": row.actualWorker ?? "",
      "Schedule Delta (mins)":
        typeof row.scheduleDeltaMinutes === "number" ? Math.round(row.scheduleDeltaMinutes) : "",
      "Duration %":
        typeof row.durationMatchPercent === "number"
          ? Number(row.durationMatchPercent.toFixed(1))
          : "",
      Flags: buildCallFlagsText(row),
      Issues: row.issues.join(" | "),
    }));

    const worksheet = SafeXLSX.utils.json_to_sheet(exportRows);
    const workbook = SafeXLSX.utils.book_new();
    SafeXLSX.utils.book_append_sheet(workbook, worksheet, "Filtered Rows");
    const buffer = SafeXLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const mode = showDuplicateRows ? "with-duplicates" : "unique";
    const filename = `testing-features-${filterStatus}-${mode}-${filteredResults.length}-rows.xlsx`;
    triggerDownload(blob, filename);

    toast({
      title: "Export ready",
      description: `Exported ${filteredResults.length.toLocaleString()} rows.`,
    });
  }, [filteredResults, filterStatus, isAdmin, showDuplicateRows, toast, triggerDownload]);

  const handleExportPdf = useCallback(() => {
    if (!isAdmin) {
      toast({
        title: "Restricted access",
        description: "Administrator access is required to export Testing Features data.",
      });
      return;
    }
    if (!callGroups.length) {
      toast({
        title: "No data to export",
        description: "Load and analyze a workbook before exporting.",
      });
      return;
    }

    const shouldIncludeRow = (row: RowAnalysis) =>
      !excludeOfficeStaffFromPdf || !row.isAdminStaffRow;
    const pdfCallGroups = excludeOfficeStaffFromPdf
      ? callGroups
          .map((group) => ({
            ...group,
            rows: group.rows.filter(shouldIncludeRow),
          }))
          .filter((group) => group.rows.length > 0)
      : callGroups;
    if (!pdfCallGroups.length) {
      toast({
        title: "No data to export",
        description: "All rows are filtered out of the PDF export.",
      });
      return;
    }

    const pdfDuplicateClusters = excludeOfficeStaffFromPdf
      ? duplicateClusters
          .map((cluster) => ({
            ...cluster,
            rows: cluster.rows.filter(shouldIncludeRow),
          }))
          .filter((cluster) => cluster.rows.length > 1)
      : duplicateClusters;

    const getPrimaryCallTypeForGroup = (group: CallGroup): string | null => {
      const counts = new Map<string, number>();
      group.rows.forEach((row) => {
        const label = row.callTypeLabel;
        const norm = normalizeCallTypeKey(label ?? null);
        if (!label || !norm) return;
        counts.set(label, (counts.get(label) ?? 0) + 1);
      });
      let bestLabel: string | null = null;
      let bestCount = -1;
      for (const [label, count] of counts.entries()) {
        if (count > bestCount) {
          bestLabel = label;
          bestCount = count;
        }
      }
      return bestLabel;
    };

    type ServiceUserSection = {
      key: string;
      name: string | null;
      area: string | null;
      address: string | null;
      groups: CallGroup[];
    };

    const orderedSections: ServiceUserSection[] = (() => {
      const map = new Map<string, ServiceUserSection>();
      pdfCallGroups.forEach((group, index) => {
        const key = group.normalizedServiceUserKey || group.serviceUserName || `unknown-${index}`;
        if (!map.has(key)) {
          map.set(key, {
            key,
            name: group.serviceUserName,
            area: group.serviceUserArea,
            address: group.serviceUserAddress,
            groups: [],
          });
        }

        const section = map.get(key)!;
        section.groups.push(group);
        if (!section.name && group.serviceUserName) section.name = group.serviceUserName;
        if (!section.area && group.serviceUserArea) section.area = group.serviceUserArea;
        if (!section.address && group.serviceUserAddress) section.address = group.serviceUserAddress;
      });

      const sections = Array.from(map.values());
      sections.sort((a, b) => {
        const aName = parsePersonNameForSort(a.name);
        const bName = parsePersonNameForSort(b.name);
        if (aName.last !== bName.last) return aName.last.localeCompare(bName.last);
        if (aName.first !== bName.first) return aName.first.localeCompare(bName.first);
        if (aName.full !== bName.full) return aName.full.localeCompare(bName.full);
        return a.key.localeCompare(b.key);
      });

      sections.forEach((section) => {
        section.groups.sort((a, b) => {
          const aPrimaryType = getPrimaryCallTypeForGroup(a);
          const bPrimaryType = getPrimaryCallTypeForGroup(b);
          const aNonCare = isNonPersonalCareCallType(aPrimaryType);
          const bNonCare = isNonPersonalCareCallType(bPrimaryType);
          if (aNonCare !== bNonCare) return aNonCare ? 1 : -1;

          const aTime = typeof a.plannedTimeMinutes === "number" ? a.plannedTimeMinutes : Number.POSITIVE_INFINITY;
          const bTime = typeof b.plannedTimeMinutes === "number" ? b.plannedTimeMinutes : Number.POSITIVE_INFINITY;
          if (aTime !== bTime) return aTime - bTime;

          return (aPrimaryType || "").localeCompare(bPrimaryType || "") || a.key.localeCompare(b.key);
        });
      });

      return sections;
    })();

    const allRows = orderedSections.flatMap((section) => section.groups.flatMap((group) => group.rows));
    const totalCalls = allRows.length;
    const flaggedCalls = allRows.filter(
      (row) => row.scheduleFlag || row.durationFlag || row.durationOverrunFlag
    ).length;
    const timeCriticalCalls = allRows.filter((row) => row.isTimeCritical).length;
    const mismatchedWorkers = allRows.filter((row) => row.workersMatch === false).length;
    const scheduleOffsets = allRows
      .map((row) => row.scheduleDeltaMinutes)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const avgScheduleOffset = scheduleOffsets.length
      ? scheduleOffsets.reduce((acc, value) => acc + value, 0) / scheduleOffsets.length
      : null;
    const durationPercents = allRows
      .map((row) => row.durationMatchPercent)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const avgDurationPercent = durationPercents.length
      ? durationPercents.reduce((acc, value) => acc + value, 0) / durationPercents.length
      : null;
    const dateKeys = allRows
      .map((row) => row.plannedDateKey)
      .filter((value): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value)))
      .sort();
    const dateRangeLabel =
      dateKeys.length > 0
        ? `${formatDateForPdf(dateKeys[0]) || dateKeys[0]} - ${formatDateForPdf(dateKeys[dateKeys.length - 1]) || dateKeys[dateKeys.length - 1]}`
        : "-";

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const slotTrendMap = new Map<string, SlotTrendSummary>();
    slotTrends.forEach((trend) => slotTrendMap.set(trend.key, trend));
    const duplicateNote = pdfDuplicateClusters.length
      ? `Note: Found ${pdfDuplicateClusters.length} planned slot${pdfDuplicateClusters.length === 1 ? "" : "s"} with multiple carers. Only the first row counted toward metrics. A duplicate review section is included at the end of this report.`
      : null;
    // Front page
    doc.setFontSize(20);
    doc.text("Service User Calls Report", pageWidth / 2, 140, { align: "center" });
    doc.setFontSize(11);
    doc.setTextColor(80);
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, 170, { align: "center" });
    doc.setTextColor(0);

    doc.setFontSize(12);
    doc.text("Summary", 40, 210);
    const summaryRows = [
      ["Workbook", fileMeta ? `${fileMeta.name} (${formatBytes(fileMeta.size)})` : "Unknown"],
      ["Rows analyzed", fileMeta?.totalRows ? fileMeta.totalRows.toLocaleString() : totalCalls.toLocaleString()],
      ["Service users", orderedSections.length.toLocaleString()],
      ["Call groups", pdfCallGroups.length.toLocaleString()],
      ["Total calls", totalCalls.toLocaleString()],
      ["Flagged calls", flaggedCalls.toLocaleString()],
      ["Time-critical calls", timeCriticalCalls.toLocaleString()],
      ["Mismatched workers", mismatchedWorkers.toLocaleString()],
      ["Duplicate slots", pdfDuplicateClusters.length.toLocaleString()],
      ["Avg start drift", avgScheduleOffset !== null ? formatSignedMinutes(avgScheduleOffset) : "-"],
      ["Avg duration", avgDurationPercent !== null ? `${avgDurationPercent.toFixed(0)}%` : "-"],
      ["Date range", dateRangeLabel],
    ];

    autoTable(doc, {
      startY: 226,
      head: [["Metric", "Value"]],
      body: summaryRows,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [15, 23, 42], textColor: 255 },
      margin: { left: 40, right: 40 },
      columnStyles: {
        0: { cellWidth: 150 },
        1: { cellWidth: pageWidth - 230 },
      },
    });

    const summaryEndY = (doc as any).lastAutoTable?.finalY ?? 226;
    doc.setFontSize(9);
    doc.setTextColor(90);
    const settingsText = `Export settings: cancelled calls ${includeCancelledCalls ? "included" : "excluded"}, mismatched workers ${includeMismatchedWorkers ? "included" : "excluded"}, office staff ${excludeOfficeStaffFromPdf ? "excluded" : "included"}, duplicate slots deduped${pdfDuplicateClusters.length ? " (review section appended)" : ""}.`;
    const legendText = "Flags legend: duplicate slot, >2h drift, <80% duration, >120% duration.";
    const settingsLines = doc.splitTextToSize(settingsText, pageWidth - 80);
    doc.text(settingsLines, 40, summaryEndY + 18);
    const legendLines = doc.splitTextToSize(legendText, pageWidth - 80);
    doc.text(legendLines, 40, summaryEndY + 18 + settingsLines.length * 12 + 4);
    doc.setTextColor(0);

    // Index pages (count is estimated up-front so content page numbers remain stable)
    const indexHeaderTop = 64;
    const indexLineHeight = 14;
    const indexBottomPad = 72;
    const indexCapacity = Math.max(1, Math.floor((pageHeight - indexHeaderTop - indexBottomPad) / indexLineHeight));
    const indexPages = Math.max(1, Math.ceil(orderedSections.length / indexCapacity));
    for (let i = 0; i < indexPages; i += 1) {
      doc.addPage();
    }

    // Start content after front + index (create a real page to avoid writing onto the last index page)
    doc.addPage();
    const contentStartPage = doc.getNumberOfPages();
    doc.setPage(contentStartPage);
    let currentY = 48;
    const serviceUserStartPages = new Map<string, number>();
    let duplicateNoteWritten = false;

    orderedSections.forEach((section, sectionIndex) => {
      if (sectionIndex > 0) {
        doc.addPage();
        currentY = 48;
      }

      serviceUserStartPages.set(section.key, doc.getCurrentPageInfo().pageNumber);

      doc.setFontSize(14);
      doc.text(section.name || "Unknown", 40, currentY);
      currentY += 16;
      doc.setFontSize(10);
      doc.text(`Area: ${section.area || "N/A"}`, 40, currentY);
      currentY += 14;
      doc.text(`Address: ${section.address || "N/A"}`, 40, currentY);
      currentY += 10;

      if (!duplicateNoteWritten && duplicateNote) {
        doc.setFontSize(9);
        doc.setTextColor(110);
        const noteLines = doc.splitTextToSize(duplicateNote, pageWidth - 80);
        doc.text(noteLines, 40, currentY);
        currentY += noteLines.length * 12 + 8;
        doc.setTextColor(0);
        duplicateNoteWritten = true;
      }

      const sectionRows = section.groups.flatMap((group) => group.rows);
      const sectionFlagged = sectionRows.filter(
        (row) => row.scheduleFlag || row.durationFlag || row.durationOverrunFlag
      ).length;
      const sectionTimeCritical = sectionRows.filter((row) => row.isTimeCritical).length;
      const sectionScheduleOffsets = sectionRows
        .map((row) => row.scheduleDeltaMinutes)
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      const sectionAvgScheduleOffset = sectionScheduleOffsets.length
        ? sectionScheduleOffsets.reduce((acc, value) => acc + value, 0) / sectionScheduleOffsets.length
        : null;
      const sectionDurations = sectionRows
        .map((row) => row.durationMatchPercent)
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      const sectionAvgDuration = sectionDurations.length
        ? sectionDurations.reduce((acc, value) => acc + value, 0) / sectionDurations.length
        : null;
      const sectionDays = new Set(
        sectionRows
          .map((row) => row.plannedDateKey || row.plannedDateLabel || String(row.rowNumber))
          .filter(Boolean)
      );
      const sectionWorkers = new Set(
        sectionRows
          .map((row) => row.actualWorker || row.plannedWorker || undefined)
          .filter((value): value is string => Boolean(value))
      );

      if (currentY > pageHeight - 180) {
        doc.addPage();
        currentY = 48;
      }

      const summaryCells = [
        `Total calls: ${sectionRows.length}`,
        `Call groups: ${section.groups.length}`,
        `Unique days: ${sectionDays.size}`,
        `Flagged: ${sectionFlagged}`,
        `Time-critical: ${sectionTimeCritical}`,
        `Care workers: ${sectionWorkers.size}`,
        `Avg start drift: ${sectionAvgScheduleOffset !== null ? formatSignedMinutes(sectionAvgScheduleOffset) : "-"}`,
        `Avg duration: ${sectionAvgDuration !== null ? `${sectionAvgDuration.toFixed(0)}%` : "-"}`,
      ];

      autoTable(doc, {
        startY: currentY,
        body: [summaryCells.slice(0, 4), summaryCells.slice(4)],
        theme: "plain",
        styles: { fontSize: 9, textColor: 80, cellPadding: 2 },
        margin: { left: 40, right: 40 },
        tableWidth: pageWidth - 80,
      });

      const summaryEndY = (doc as any).lastAutoTable?.finalY ?? currentY;
      currentY = summaryEndY + 12;

      type RequirementSection = { key: string; label: string; rows: RowAnalysis[] };
      const sectionUserKey =
        section.groups.map((group) => group.normalizedServiceUserKey).find((value): value is string => Boolean(value)) ??
        null;

      const rowSort = (a: RowAnalysis, b: RowAnalysis) => {
        const aDate = a.plannedDateKey || "";
        const bDate = b.plannedDateKey || "";
        if (aDate !== bDate) return aDate.localeCompare(bDate);

        const aTime =
          typeof a.actualTimeMinutes === "number"
            ? a.actualTimeMinutes
            : typeof a.plannedTimeMinutes === "number"
            ? a.plannedTimeMinutes
            : Number.POSITIVE_INFINITY;
        const bTime =
          typeof b.actualTimeMinutes === "number"
            ? b.actualTimeMinutes
            : typeof b.plannedTimeMinutes === "number"
            ? b.plannedTimeMinutes
            : Number.POSITIVE_INFINITY;
        if (aTime !== bTime) return aTime - bTime;

        return a.rowNumber - b.rowNumber;
      };

      const requirementSections: RequirementSection[] = (() => {
        const map = new Map<string, RequirementSection>();
        const allRows = section.groups.flatMap((group) => group.rows);
        allRows.forEach((row) => {
          const label = row.callTypeLabel || "Unknown";
          const norm = normalizeCallTypeKey(label) || "unknown";
          if (!map.has(norm)) {
            map.set(norm, { key: norm, label, rows: [] });
          }
          map.get(norm)!.rows.push(row);
        });

        const sections = Array.from(map.values()).map((entry) => ({
          ...entry,
          rows: [...entry.rows].sort(rowSort),
        }));

        sections.sort((a, b) => {
          const aNonCare = isNonPersonalCareCallType(a.label);
          const bNonCare = isNonPersonalCareCallType(b.label);
          if (aNonCare !== bNonCare) return aNonCare ? 1 : -1;
          return a.label.localeCompare(b.label);
        });

        return sections;
      })();

      requirementSections.forEach((req) => {
        if (currentY > pageHeight - 260) {
          doc.addPage();
          currentY = 48;
        }

        doc.setFontSize(11);
        doc.text(`Service requirement: ${req.label}`, 40, currentY);
        currentY += 14;

        const requirementFlagged = req.rows.filter(
          (row) => row.scheduleFlag || row.durationFlag || row.durationOverrunFlag
        ).length;
        const requirementOffsets = req.rows
          .map((row) => row.scheduleDeltaMinutes)
          .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
        const requirementAvgOffset = requirementOffsets.length
          ? requirementOffsets.reduce((acc, value) => acc + value, 0) / requirementOffsets.length
          : null;
        const requirementDurations = req.rows
          .map((row) => row.durationMatchPercent)
          .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
        const requirementAvgDuration = requirementDurations.length
          ? requirementDurations.reduce((acc, value) => acc + value, 0) / requirementDurations.length
          : null;
        const requirementSummary = `Calls: ${req.rows.length} | Flagged: ${requirementFlagged} | Avg start drift: ${
          requirementAvgOffset !== null ? formatSignedMinutes(requirementAvgOffset) : "-"
        } | Avg duration: ${requirementAvgDuration !== null ? `${requirementAvgDuration.toFixed(0)}%` : "-"}`;
        doc.setFontSize(9);
        doc.setTextColor(80);
        const summaryLines = doc.splitTextToSize(requirementSummary, pageWidth - 80);
        doc.text(summaryLines, 40, currentY);
        currentY += summaryLines.length * 12 + 6;
        doc.setTextColor(0);

        const slotTrendKey = buildCallTypeTrendKey(sectionUserKey, req.label);
        const slotTrendInsight = slotTrendKey ? slotTrendMap.get(slotTrendKey) : undefined;
        const durationPercents = req.rows
          .map((row) => (typeof row.durationMatchPercent === "number" ? row.durationMatchPercent : null))
          .filter((value): value is number => value !== null);
        const avgDurationPercent = durationPercents.length
          ? durationPercents.reduce((acc, value) => acc + value, 0) / durationPercents.length
          : null;
        const recommendationLines: string[] = [];
        if (typeof slotTrendInsight?.averageDurationPercent === "number") {
          recommendationLines.push(`Call duration trend: ${slotTrendInsight.averageDurationPercent.toFixed(0)}% of plan.`);
        } else if (avgDurationPercent !== null) {
          recommendationLines.push(`Call duration trend: ${avgDurationPercent.toFixed(0)}% of plan.`);
        }
        if (slotTrendInsight?.advice.length) {
          recommendationLines.push(...slotTrendInsight.advice);
        }
        if (recommendationLines.length) {
          doc.setFontSize(9);
          doc.setTextColor(80);
          const wrapped = recommendationLines.flatMap((line) => doc.splitTextToSize(line, pageWidth - 80));
          doc.text(wrapped, 40, currentY);
          currentY += wrapped.length * 12 + 8;
          doc.setTextColor(0);
        } else {
          currentY += 4;
        }

        const rows = req.rows.map((row) => [
          formatDateForPdf(row.plannedDateKey || row.plannedDateLabel) || "-",
          row.plannedTimeLabel || "-",
          row.actualTimeLabel || "-",
          row.callTypeLabel || "-",
          row.actualWorker || row.plannedWorker || "-",
          typeof row.scheduleDeltaMinutes === "number" ? formatSignedMinutes(row.scheduleDeltaMinutes) : "-",
          row.durationMatchPercent !== null ? `${row.durationMatchPercent.toFixed(0)}%` : "-",
          buildCallFlagsText(row),
        ]);

        autoTable(doc, {
          startY: currentY,
          head: [["Date", "Planned", "Actual", "Call Type", "Care Worker", "Schedule drift", "Duration %", "Flags"]],
          body: rows,
          theme: "striped",
          styles: { fontSize: 8.5, cellPadding: 3 },
          headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 9 },
          alternateRowStyles: { fillColor: [246, 248, 251] },
          columnStyles: {
            0: { cellWidth: 60 },
            1: { cellWidth: 40 },
            2: { cellWidth: 40 },
            3: { cellWidth: 90 },
            4: { cellWidth: 90 },
            5: { cellWidth: 55 },
            6: { cellWidth: 55 },
            7: { cellWidth: 85 },
          },
          margin: { left: 40, right: 40, bottom: 60 },
          didParseCell: (data) => {
            if (data.section !== "body") return;
            if (data.column.index !== 7) return;
            const rowData = req.rows[data.row.index];
            if (!rowData) return;
            const hasFlags =
              rowData.isDuplicateSlotRow ||
              rowData.scheduleFlag ||
              rowData.durationFlag ||
              rowData.durationOverrunFlag;
            data.cell.styles.textColor = hasFlags ? [185, 28, 28] : [120, 120, 120];
            if (hasFlags) {
              data.cell.styles.fontStyle = "bold";
            }
          },
        });

        const finalY = (doc as any).lastAutoTable?.finalY ?? currentY;
        currentY = finalY + 22;
      });

      currentY += 8;
    });

    // Fill index pages now that we know service-user start pages
    for (let i = 0; i < indexPages; i += 1) {
      const pageNumber = 2 + i;
      doc.setPage(pageNumber);
      doc.setFontSize(16);
      doc.text(i === 0 ? "Index" : "Index (cont.)", 40, 40);
      doc.setFontSize(10);
      doc.setTextColor(90);
      doc.text("Service user", 40, 58);
      doc.text("Calls", pageWidth - 110, 58, { align: "right" });
      doc.text("Page", pageWidth - 60, 58, { align: "right" });
      doc.setTextColor(0);

      let y = indexHeaderTop;
      const start = i * indexCapacity;
      const end = Math.min(orderedSections.length, start + indexCapacity);
      for (let j = start; j < end; j += 1) {
        const section = orderedSections[j];
        const label = (section.name || "Unknown").toString().trim();
        const page = serviceUserStartPages.get(section.key) ?? contentStartPage;
        const callCount = section.groups.reduce((acc, group) => acc + group.rows.length, 0);
        doc.setFontSize(10);
        doc.text(label, 40, y, { maxWidth: pageWidth - 170 });
        doc.text(callCount.toLocaleString(), pageWidth - 110, y, { align: "right" });
        doc.text(String(page), pageWidth - 60, y, { align: "right" });
        y += indexLineHeight;
      }
    }

    if (pdfDuplicateClusters.length) {
      doc.addPage();
      let cursorY = 48;
      doc.setFontSize(14);
      doc.text("Duplicate Slot Review", 40, cursorY);
      cursorY += 20;
      doc.setFontSize(10);
      const intro = doc.splitTextToSize(
        "Multiple carers recorded for the same service user, planned date, and planned time. Only the first entry counts toward metrics; the rest are listed below for investigation.",
        pageWidth - 80
      );
      doc.text(intro, 40, cursorY);
      cursorY += intro.length * 12 + 10;

      pdfDuplicateClusters.forEach((cluster, clusterIndex) => {
        if (cursorY > pageHeight - 140) {
          doc.addPage();
          cursorY = 48;
          doc.setFontSize(12);
          doc.text("Duplicate Slot Review (cont.)", 40, cursorY);
          cursorY += 18;
          doc.setFontSize(10);
        }

        doc.setFontSize(11);
        const headingDate = formatDateForPdf(cluster.plannedDateLabel) || cluster.plannedDateLabel || "Unknown date";
        const heading = `${clusterIndex + 1}. ${cluster.serviceUserName || "Unknown"} - ${headingDate} at ${cluster.plannedTimeLabel || "Unknown time"}`;
        const headingLines = doc.splitTextToSize(heading, pageWidth - 80);
        doc.text(headingLines, 40, cursorY);
        cursorY += headingLines.length * 12;

        doc.setFontSize(9);
        const location = `Area: ${(cluster.serviceUserArea || "Area unavailable").toString()} | Address: ${cluster.serviceUserAddress || "Address unavailable"}`;
        const locationLines = doc.splitTextToSize(location, pageWidth - 80);
        doc.text(locationLines, 40, cursorY);
        cursorY += locationLines.length * 12 + 6;

        cluster.rows.forEach((row) => {
          if (cursorY > pageHeight - 100) {
            doc.addPage();
            cursorY = 48;
            doc.setFontSize(12);
            doc.text("Duplicate Slot Review (cont.)", 40, cursorY);
            cursorY += 18;
            doc.setFontSize(9);
          }

          const worker = row.actualWorker || row.plannedWorker || "Care worker unavailable";
          const detail = `Row #${row.rowNumber} | ${worker} | Planned ${row.plannedTimeLabel || "-"} -> Actual ${row.actualTimeLabel || "-"} | ${row.isDuplicateSlotRow ? "Ignored duplicate" : "Counted"}`;
          const detailLines = doc.splitTextToSize(detail, pageWidth - 96);
          doc.text(detailLines, 48, cursorY);
          cursorY += detailLines.length * 12;

          if (row.issues.length) {
            const issuesText = doc.splitTextToSize(`Issues: ${row.issues.join("; ")}`, pageWidth - 96);
            doc.text(issuesText, 48, cursorY);
            cursorY += issuesText.length * 12;
          }

          cursorY += 6;
        });

        cursorY += 10;
      });
    }

    // Page numbering bottom-right: current/total
    const totalPages = doc.getNumberOfPages();
    doc.setFontSize(9);
    doc.setTextColor(120);
    for (let page = 1; page <= totalPages; page += 1) {
      doc.setPage(page);
      doc.text(`${page}/${totalPages}`, pageWidth - 40, pageHeight - 28, { align: "right" });
    }
    doc.setTextColor(0);

    const exportDateStamp = new Date().toISOString().slice(0, 10);
    const baseName = fileMeta?.name ? fileMeta.name.replace(/\.[^/.]+$/, "") : "service-user-calls";
    const safeBaseName = baseName
      .replace(/[^A-Za-z0-9-_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    const fileLabel = safeBaseName || "service-user-calls";
    doc.save(`${fileLabel}-report-${exportDateStamp}.pdf`);
  }, [callGroups, duplicateClusters, excludeOfficeStaffFromPdf, fileMeta, includeCancelledCalls, includeMismatchedWorkers, isAdmin, slotTrends, toast]);

  if (user?.role !== "admin") {
    return (
      <Card className="max-w-2xl mx-auto border-border/60 bg-background/70 shadow-medium">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Shield size={18} />
            Restricted Access
          </CardTitle>
          <CardDescription>
            You need administrator privileges to view Testing Features.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const workbookNavDisabled = analysisResults.length === 0;
  const kpiNavDisabled = analysisResults.length === 0;
  const insightsNavDisabled = analysisResults.length === 0;
  const studioNavDisabled = careWorkerRosters.length === 0;
  const stacksNavDisabled = serviceUserStacks.length === 0;
  const showRosteringStudio = careWorkerRosters.length > 0;

  return (
    <div className="page-shell max-w-7xl mx-auto space-y-10 relative pb-6">
      {/* Accessibility: Live region for status announcements */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {processingState === "parsing" && "Parsing workbook file. Please wait."}
        {processingState === "analyzing" && `Analyzing data. ${progress}% complete.`}
        {processingState === "complete" && `Analysis complete. Found ${summary.totalPrimary} unique slots with ${summary.attention} rows needing attention.`}
      </div>
      
      {/* Accessibility: Skip link for keyboard navigation */}
      <a 
        href="#tf-workbook" 
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md"
      >
        Skip to workbook section
      </a>

      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 right-0 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute top-40 left-0 h-96 w-96 rounded-full bg-success/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(148,163,184,0.08),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(56,189,248,0.08),transparent_35%)]" />
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/80 p-6 shadow-medium backdrop-blur-xl hover-elevate shimmer motion-safe:animate-slide-up stagger-1 md:p-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.12),transparent_55%),radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.12),transparent_45%)]" />
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 -bottom-32 h-64 w-64 rounded-full bg-success/10 blur-3xl" />
        <div className="relative z-10 space-y-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-3 rounded-full border border-primary/20 bg-primary/10 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
                <span
                  className={`h-2 w-2 rounded-full ${
                    processingState === "analyzing" ? "bg-success/10 animate-pulse" : "bg-primary"
                  }`}
                />
                Admin Sandbox
                <Badge variant="secondary" className="ml-2 text-[10px] uppercase tracking-wide">
                  Experimental
                </Badge>
              </div>
              <div>
                <h1 className="text-3xl font-heading font-bold text-foreground md:text-4xl">
                  Testing <span className="gradient-text">Features</span>
                </h1>
                <p className="text-muted-foreground max-w-2xl mt-2">
                  Upload large CSV or Excel workbooks, automatically convert CSV files to Excel, and
                  inspect every row with automated data quality checks before pushing experiments to production.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Badge variant="outline" className="bg-background/70 px-3 py-1 text-xs">
                  <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />
                  {summary.totalPrimary.toLocaleString()} unique slots
                </Badge>
                <Badge variant="outline" className="bg-background/70 px-3 py-1 text-xs">
                  <AlertCircle className="mr-2 h-3.5 w-3.5 text-warning" />
                  {summary.attention.toLocaleString()} flagged rows
                </Badge>
                <Badge variant="outline" className="bg-background/70 px-3 py-1 text-xs">
                  <CheckCircle2 className="mr-2 h-3.5 w-3.5 text-success" />
                  {summary.clean.toLocaleString()} clean rows
                </Badge>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:w-[360px]">
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4 shadow-soft hover-elevate shimmer">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Active file</p>
                <p className="text-sm font-semibold text-foreground mt-2">
                  {fileMeta?.name || "No workbook loaded"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {fileMeta ? `${fileMeta.totalRows.toLocaleString()} rows • ${formatBytes(fileMeta.size)}` : "Upload a file to begin analysis."}
                </p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4 shadow-soft hover-elevate shimmer">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Pipeline status</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm font-semibold capitalize">{processingState}</span>
                  <Badge variant={processingState === "complete" ? "default" : "secondary"} className="text-[10px] uppercase">
                    {processingState === "complete" ? "Ready" : "Running"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {processingState === "idle" && "Waiting for workbook upload"}
                  {processingState === "parsing" && "Parsing workbook structure"}
                  {processingState === "analyzing" && "Scanning rows in batches"}
                  {processingState === "complete" && "Insights available below"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr] items-stretch motion-safe:animate-slide-up stagger-2">
        <Alert className="relative overflow-hidden border-warning/25 bg-warning/100/5 text-foreground shadow-soft backdrop-blur-xl hover-elevate dark:border-warning/30 dark:bg-warning/100/10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.18),transparent_55%)]" />
          <AlertTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-warning" />
            {careWorkerRosters.length > 0 ? "Ready to save" : "Volatile workspace"}
          </AlertTitle>
          <AlertDescription className="text-sm">
            {careWorkerRosters.length > 0
              ? "Save your analysis to the library for persistent storage and reporting."
              : "Data stays in-memory only. Refreshing the page clears every upload, so export a PDF if you need a temporary record."}
          </AlertDescription>
          {careWorkerRosters.length > 0 && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Company</Label>
                <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select company" />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPANY_OPTIONS.map((company) => (
                      <SelectItem key={company} value={company}>
                        {company}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Branch</Label>
                <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {BRANCH_OPTIONS.map((branch) => (
                      <SelectItem key={branch} value={branch}>
                        {branch}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {careWorkerRosters.length > 0 ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  disabled={isSavingWorkbook || saveWorkbookMutation.isPending}
                  onClick={async () => {
                    if (!fileMeta) return;
                    setIsSavingWorkbook(true);
                    try {
                      if (!selectedCompany || !selectedBranch) {
                        throw new Error("Select a company and branch before saving.");
                      }

                      const callSignature = buildCallSignature();
                      const callsHash = callSignature ? await createHash(callSignature) : null;
                      const dedupeHash = callsHash || sourceHash;
                      if (!dedupeHash) {
                        throw new Error("Call signature hash not available. Re-upload the workbook and try again.");
                      }

                      // Convert Sets to arrays and drop per-row payloads to keep the save request small.
                      const serializableRosters = careWorkerRosters.map((roster) => ({
                        key: roster.key,
                        workerName: roster.workerName,
                        workerNameNormalized: roster.workerNameNormalized,
                        shiftBars: roster.shiftBars,
                        shiftBarsCount: roster.shiftBarsCount,
                        isAdminStaff: roster.isAdminStaff,
                        usesTemplateAssignments: roster.usesTemplateAssignments,
                        uniqueServiceUsers: roster.uniqueServiceUsers,
                        uniqueDays: roster.uniqueDays,
                        missingRequirementTimes: roster.missingRequirementTimes,
                        callRowsCount: roster.callRows.length,
                        rowCount: roster.rows.length,
                        callGroups: roster.callGroups.map((group) => ({
                          key: group.key,
                          serviceUserName: group.serviceUserName,
                          serviceUserArea: group.serviceUserArea,
                          serviceUserAddress: group.serviceUserAddress,
                          normalizedServiceUserKey: group.normalizedServiceUserKey,
                          callTypeLabel: group.callTypeLabel,
                          callTypeKey: group.callTypeKey,
                          timeBandLabel: group.timeBandLabel,
                          requirementStartMinutes: group.requirementStartMinutes,
                          requirementStartLabel: group.requirementStartLabel,
                          durationMinutes: group.durationMinutes,
                          totalCalls: group.totalCalls,
                          uniqueDays: group.uniqueDays,
                          templatedWeekdayKeys: Array.from(group.templatedWeekdayKeys),
                          doubleUpWeekdayKeys: Array.from(group.doubleUpWeekdayKeys),
                          templatedRows: group.templatedRows,
                          isTimeCritical: group.isTimeCritical,
                        })),
                      }));

                      // Convert doubleUpSlots from Set to array
                      const serializableDoubleUpSlots: Record<string, string[]> = {};
                      doubleUpSlots.forEach((slotKey) => {
                        const workers = doubleUpSlotWorkers.get(slotKey);
                        if (workers) {
                          serializableDoubleUpSlots[slotKey] = Array.from(workers);
                        }
                      });

                      // Enrich analysisResults with computed templateWeek, templateDay, and isDoubleUpSlot
                      const enrichedRowAnalysis = analysisResults.map((row) => {
                        const templateDate = parseDateKeyToLocalDate(row.plannedDateKey ?? null);
                        const templateWeek = templateDate
                          ? deriveTemplateWeekKey(templateDate, TEMPLATE_WEEK_1_START_DAY_NUMBER)
                          : null;
                        const templateDay = templateDate ? deriveWeekdayLabel(templateDate) : null;
                        const doubleUpKey = buildDoubleUpSlotKey(row);
                        const isDoubleUpSlot = Boolean(doubleUpKey && doubleUpSlots.has(doubleUpKey));
                        return {
                          ...row,
                          templateWeek,
                          templateDay,
                          isDoubleUpSlot,
                        };
                      });

                      saveWorkbookMutation.mutate({
                        name: fileMeta.name.replace(/\.[^/.]+$/, ""), // Remove file extension
                        fileName: fileMeta.name,
                        sourceHash: dedupeHash,
                        company: selectedCompany,
                        branch: selectedBranch,
                        totalRows: fileMeta.totalRows,
                        careWorkerCount: careWorkerRosters.length,
                        serviceUserCount: serviceUserStacks.length,
                        callGroupCount: callGroups.length,
                        rowAnalysis: enrichedRowAnalysis,
                        callGroups: [],
                        careWorkerRosters: serializableRosters,
                        doubleUpSlots: serializableDoubleUpSlots,
                      });
                    } catch (error) {
                      toast({
                        title: "Save failed",
                        description: error instanceof Error ? error.message : "Unknown error",
                        variant: "destructive",
                      });
                      setIsSavingWorkbook(false);
                    }
                  }}
                  className="gap-2"
                >
                  {(isSavingWorkbook || saveWorkbookMutation.isPending) ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Save to Library
                </Button>
              </>
            ) : (
              <>
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                  In-memory only
                </Badge>
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                  No server storage
                </Badge>
              </>
            )}
          </div>
        </Alert>

        <Card className="h-full border-border/60 bg-background/70 hover-elevate shimmer">
          <CardHeader>
            <CardTitle>Quick navigation</CardTitle>
            <CardDescription>Jump between workbook tools, KPIs, and insights.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={workbookNavDisabled}
                onClick={() => scrollToAnchor("tf-workbook")}
                className="gap-2"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Workbook
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={kpiNavDisabled}
                onClick={() => scrollToAnchor("tf-kpi")}
                className="gap-2"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                KPI
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={insightsNavDisabled}
                onClick={() => scrollToAnchor("tf-insights")}
                className="gap-2"
              >
                <Search className="h-3.5 w-3.5" />
                Insights
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={stacksNavDisabled}
                onClick={() => scrollToAnchor("tf-stacks")}
                className="gap-2"
              >
                <Users className="h-3.5 w-3.5" />
                Stacks
              </Button>
              {showRosteringStudio && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={studioNavDisabled}
                  onClick={() => scrollToAnchor("tf-studio")}
                  className="gap-2"
                >
                  <Route className="h-3.5 w-3.5" />
                  Rostering Studio
                </Button>
              )}
            </div>
            <Separator />
            <p className="text-xs text-muted-foreground">
              Tip: sections appear as data is loaded (some anchors may not exist yet).
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Workbook Comparison Panel */}
      {(comparisonSnapshot || (fileMeta && processingState === "complete")) && (
        <Card className="relative overflow-hidden border-border/70 bg-background/70 shadow-soft hover-elevate motion-safe:animate-slide-up stagger-2">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(139,92,246,0.12),transparent_55%)]" />
          <CardHeader className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-600">
                <Copy className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Workbook Comparison</CardTitle>
                <CardDescription>
                  {comparisonSnapshot 
                    ? `Comparing against: ${comparisonSnapshot.fileMeta.name}`
                    : "Take a snapshot to compare against future uploads."}
                </CardDescription>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {!comparisonSnapshot && fileMeta && processingState === "complete" && summary && healthSummary && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setComparisonSnapshot({
                      fileMeta,
                      summary: { ...summary },
                      healthSummary: healthSummary ? { ...healthSummary } : null,
                      primaryRowCount: primaryRows.length,
                    });
                    setIsComparisonMode(true);
                    toast({
                      title: "Snapshot saved",
                      description: "Upload a new workbook to compare against this baseline.",
                    });
                  }}
                  className="gap-2"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Save Snapshot
                </Button>
              )}
              {comparisonSnapshot && (
                <>
                  <Badge variant="secondary" className="text-xs">
                    Baseline: {comparisonSnapshot.fileMeta.name}
                  </Badge>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setComparisonSnapshot(null);
                      setIsComparisonMode(false);
                      toast({
                        title: "Snapshot cleared",
                        description: "Comparison mode disabled.",
                      });
                    }}
                  >
                    Clear Snapshot
                  </Button>
                </>
              )}
            </div>
          </CardHeader>
          {comparisonSnapshot && fileMeta && processingState === "complete" && healthSummary && (
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <ComparisonMetric
                  label="Quality Score"
                  baseline={comparisonSnapshot.healthSummary?.score ?? 0}
                  current={healthSummary.score}
                  format={(v) => `${v}`}
                  higherIsBetter={true}
                />
                <ComparisonMetric
                  label="Total Rows"
                  baseline={comparisonSnapshot.summary?.total ?? 0}
                  current={summary.total}
                  format={(v) => v.toLocaleString()}
                  higherIsBetter={true}
                />
                <ComparisonMetric
                  label="Clean Rows"
                  baseline={comparisonSnapshot.summary?.clean ?? 0}
                  current={summary.clean}
                  format={(v) => v.toLocaleString()}
                  higherIsBetter={true}
                />
                <ComparisonMetric
                  label="Attention Rows"
                  baseline={comparisonSnapshot.summary?.attention ?? 0}
                  current={summary.attention}
                  format={(v) => v.toLocaleString()}
                  higherIsBetter={false}
                />
                <ComparisonMetric
                  label="Duplicate Rate"
                  baseline={Math.round((comparisonSnapshot.healthSummary?.duplicateRate ?? 0) * 100)}
                  current={Math.round(healthSummary.duplicateRate * 100)}
                  format={(v) => `${v}%`}
                  higherIsBetter={false}
                />
                <ComparisonMetric
                  label="Completeness"
                  baseline={comparisonSnapshot.healthSummary?.completeness?.score ?? 0}
                  current={healthSummary.completeness?.score ?? 0}
                  format={(v) => `${v}`}
                  higherIsBetter={true}
                />
                <ComparisonMetric
                  label="Schedule Drift Alerts"
                  baseline={comparisonSnapshot.summary?.scheduleAlerts ?? 0}
                  current={summary.scheduleAlerts}
                  format={(v) => v.toLocaleString()}
                  higherIsBetter={false}
                />
                <ComparisonMetric
                  label="Duration Alerts"
                  baseline={comparisonSnapshot.summary?.durationAlerts ?? 0}
                  current={summary.durationAlerts}
                  format={(v) => v.toLocaleString()}
                  higherIsBetter={false}
                />
              </div>
              <Separator />
              <p className="text-xs text-muted-foreground">
                <TrendingUp className="h-3 w-3 inline mr-1" />
                Green arrows indicate improvement from baseline. Red arrows indicate regression.
              </p>
            </CardContent>
          )}
        </Card>
      )}

      {showGlobalProgress && (
        <div className="z-30 mb-6 motion-safe:animate-fade-in">
          <div className="rounded-full h-2 bg-border/50 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary via-sky-400/70 to-emerald-400/60 transition-all duration-200 motion-safe:animate-glow-pulse"
              style={{ width: `${Math.min(Math.max(progress, 5), 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">Analyzing workbook… {progress}%</p>
        </div>
      )}

      <section id="tf-workbook" className="scroll-mt-24 space-y-6 motion-safe:animate-slide-up stagger-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-primary">
              <UploadCloud className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-[0.2em]">Workbook Lab</span>
            </div>
            <h2 className="text-2xl font-heading font-bold text-foreground">Workbook command center</h2>
            <p className="text-sm text-muted-foreground">
              Load raw files, monitor batch progress, and validate the pipeline before sharing results.
            </p>
          </div>
          {fileMeta && (
            <Badge variant="outline" className="bg-background/70 text-xs">
              {fileMeta.type} • {fileMeta.totalRows.toLocaleString()} rows
            </Badge>
          )}
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2 border-border/60 bg-background/70 shadow-medium hover-elevate shimmer">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <UploadCloud className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Upload Workbook</CardTitle>
                  <CardDescription>Accepted formats: CSV, XLS, XLSX</CardDescription>
                </div>
              </div>
              {processingState === "analyzing" && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Analyzing
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                role="button"
                tabIndex={0}
                aria-label="Upload workbook file. Accepts CSV, XLS, and XLSX formats. You can also drag and drop files here."
                aria-describedby="upload-instructions"
                className={`relative overflow-hidden rounded-2xl border-2 border-dashed p-6 text-center transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                  isDragging
                    ? "border-primary bg-primary/10 shadow-glow"
                    : "border-border bg-background/60 hover:bg-muted/20 hover:shadow-soft"
                }`}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    document.getElementById("testing-features-upload")?.click();
                  }
                }}
              >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.12),transparent_55%)]" />
                <input
                  id="testing-features-upload"
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  aria-hidden="true"
                  onChange={handleFileChange}
                />
                <label htmlFor="testing-features-upload" className="relative z-10 cursor-pointer space-y-3 block">
                  <div className="flex items-center justify-center gap-3 text-muted-foreground">
                    <UploadCloud className="h-5 w-5" aria-hidden="true" />
                    <span>{isDragging ? "Drop the file to start analysis" : "Click to choose a data file or drag it here"}</span>
                  </div>
                  <p id="upload-instructions" className="text-xs text-muted-foreground/80">
                    We keep everything client-side so you can experiment safely.
                  </p>
                </label>
              </div>

              {fileMeta && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-border bg-background/60 p-4 shadow-soft">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Active file</p>
                    <p className="font-medium text-sm mt-1">{fileMeta.name}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
                      <span>{fileMeta.type}</span>
                      <span>•</span>
                      <span>{formatBytes(fileMeta.size)}</span>
                      <span>•</span>
                      <span>{fileMeta.totalRows.toLocaleString()} rows</span>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border bg-background/60 p-4 space-y-3 shadow-soft">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Actions</p>
                    <div className="flex flex-wrap gap-2">
                      {downloadUrl && (
                        <Button size="sm" variant="secondary" asChild>
                          <a href={downloadUrl} download={fileMeta?.name?.replace(/\.csv$/i, ".xlsx") || "converted.xlsx"}>
                            <Download className="h-4 w-4 mr-2" /> Download converted Excel
                          </a>
                        </Button>
                      )}
                      {fileMeta && (
                        <Button size="sm" variant="ghost" onClick={handleReset}>
                          Reset
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-background/70 shadow-medium hover-elevate">
            <CardHeader>
              <CardTitle>Analysis Progress</CardTitle>
              <CardDescription>
                {processingState === "analyzing" && "Crunching rows in batches"}
                {processingState === "parsing" && "Preparing workbook"}
                {processingState === "complete" && "Analysis finished"}
                {processingState === "idle" && "Awaiting upload"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">{progress}%</span>
                <Badge variant={processingState === "complete" ? "default" : "secondary"} className="capitalize">
                  {processingState}
                </Badge>
              </div>
              <Progress value={progress} className="h-2" />
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Rows analyzed: {analysisResults.length.toLocaleString()}</p>
                <p>Unique slots: {summary.totalPrimary.toLocaleString()}</p>
                {summary.duplicateCount > 0 && (
                  <p>Duplicates ignored: {summary.duplicateCount.toLocaleString()}</p>
                )}
                {excludedCounts.total > 0 && (
                  <p>
                    Excluded rows: {excludedCounts.total.toLocaleString()} (cancelled{" "}
                    {excludedCounts.cancelled.toLocaleString()}, mismatched{" "}
                    {excludedCounts.mismatched.toLocaleString()})
                  </p>
                )}
                <p>Flagged rows: {summary.attention.toLocaleString()}</p>
                <p>Empty fields: {summary.totalEmpty.toLocaleString()}</p>
              </div>
              <div className="pt-3 border-t border-border/60 space-y-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Metrics filters</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <Label htmlFor="toggle-include-cancelled" className="font-medium">
                    Include cancelled calls
                  </Label>
                  <Switch
                    id="toggle-include-cancelled"
                    checked={includeCancelledCalls}
                    onCheckedChange={setIncludeCancelledCalls}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <Label htmlFor="toggle-include-mismatch" className="font-medium">
                    Include mismatched carers
                  </Label>
                  <Switch
                    id="toggle-include-mismatch"
                    checked={includeMismatchedWorkers}
                    onCheckedChange={setIncludeMismatchedWorkers}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section id="tf-kpi" className="scroll-mt-24 space-y-6 motion-safe:animate-slide-up stagger-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-primary">
              <SlidersHorizontal className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-[0.2em]">KPI</span>
            </div>
            <h2 className="text-2xl font-heading font-bold text-foreground">Performance snapshot</h2>
            <p className="text-sm text-muted-foreground">Totals, trends, and alert volume at a glance.</p>
          </div>
          <Badge variant="outline" className="bg-background/70 text-xs">
            Updated with workbook analysis
          </Badge>
        </div>
        <div className="rounded-3xl border border-border/60 bg-background/70 p-4 shadow-medium hover-elevate shimmer md:p-6">
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <MetricCard
              icon={<FileSpreadsheet className="h-4 w-4" />}
              label="Total Rows"
              value={summary.total.toLocaleString()}
              helper={`${summary.totalPrimary.toLocaleString()} unique slots`}
            />
            <MetricCard
              icon={<Users className="h-4 w-4 text-muted-foreground" />}
              label="Duplicate Slot Rows"
              value={summary.duplicateCount.toLocaleString()}
              helper="Same user/date/time — ignored"
            />
            <MetricCard
              icon={<CheckCircle2 className="h-4 w-4 text-success" />}
              label="Clean Rows"
              value={summary.clean.toLocaleString()}
              helper="No warnings detected"
            />
            <MetricCard
              icon={<AlertCircle className="h-4 w-4 text-warning" />}
              label="Needs Attention"
              value={summary.attention.toLocaleString()}
              helper="Contains missing or risky values"
            />
            <MetricCard
              icon={<Filter className="h-4 w-4" />}
              label="Empty Cells"
              value={summary.totalEmpty.toLocaleString()}
            />
            <MetricCard
              icon={<Clock4 className="h-4 w-4 text-sky-500" />}
              label="Schedule Drift Alerts"
              value={summary.scheduleAlerts.toLocaleString()}
              helper="Same carer moved >2h"
            />
            <MetricCard
              icon={<Timer className="h-4 w-4 text-warning" />}
              label="Duration Alerts"
              value={summary.durationAlerts.toLocaleString()}
              helper="Under 80% or over 120%"
            />
          </div>
          {/* Enhanced KPI Rate Metrics */}
          {summary.totalPrimary > 0 && (
            <>
              <Separator className="my-6" />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <RateMetric
                  label="Data Cleanliness Rate"
                  value={Math.round((summary.clean / summary.totalPrimary) * 100)}
                  target={90}
                  description="Percentage of rows without issues"
                />
                <RateMetric
                  label="Schedule Compliance Rate"
                  value={summary.totalPrimary > 0 ? Math.round(((summary.totalPrimary - summary.scheduleAlerts) / summary.totalPrimary) * 100) : 100}
                  target={95}
                  description="Rows within 2h of planned time"
                />
                <RateMetric
                  label="Duration Compliance Rate"
                  value={summary.totalPrimary > 0 ? Math.round(((summary.totalPrimary - summary.durationAlerts) / summary.totalPrimary) * 100) : 100}
                  target={90}
                  description="Rows within 80-120% of plan"
                />
                <RateMetric
                  label="Data Efficiency"
                  value={summary.total > 0 ? Math.round((summary.totalPrimary / summary.total) * 100) : 100}
                  target={95}
                  description="Non-duplicate row ratio"
                />
              </div>
            </>
          )}
        </div>
      </section>

      <section id="tf-insights" className="scroll-mt-24 space-y-6 motion-safe:animate-slide-up stagger-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-primary">
              <Search className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-[0.2em]">Insights</span>
            </div>
            <h2 className="text-2xl font-heading font-bold text-foreground">Deep diagnostics</h2>
            <p className="text-sm text-muted-foreground">Root-cause signals and confidence checks once data is loaded.</p>
          </div>
          <Badge variant="outline" className="bg-background/70 text-xs">
            Powered by data health scoring
          </Badge>
        </div>

        {analysisResults.length > 0 && healthSummary && (
        <>
        {/* ===== ENHANCED DATA QUALITY DASHBOARD ===== */}
        <Card className="relative overflow-hidden border-border/70 bg-background/70 shadow-soft hover-elevate">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_55%)]" />
          <CardHeader className="relative z-10">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-success/10 text-success">
                  <Shield className="h-6 w-6" />
                </div>
                <div>
                  <CardTitle className="text-xl">Data Quality Dashboard</CardTitle>
                  <CardDescription>Comprehensive quality assessment with multi-dimensional scoring.</CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Overall Index</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-5xl font-semibold text-foreground">{healthSummary.score}</span>
                    <span className="text-lg text-muted-foreground">/100</span>
                  </div>
                </div>
                <Badge variant="outline" className={`${toneTextMap[healthSummary.tone]} text-sm px-3 py-1`}>
                  {healthSummary.label}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Overall Progress Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Data Quality Index</span>
                <span>{healthSummary.score}%</span>
              </div>
              <Progress value={healthSummary.score} className="h-3" />
            </div>

            {/* Quality Dimension Scores */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <QualityDimensionCard
                title="Completeness"
                score={healthSummary.completeness.score}
                grade={healthSummary.completeness.grade}
                description="Data field coverage"
                icon={<FileSpreadsheet className="h-4 w-4" />}
                details={[
                  `${Math.round(healthSummary.completeness.breakdown.serviceUser * 100)}% service users`,
                  `${Math.round(healthSummary.completeness.breakdown.plannedTime * 100)}% planned times`,
                  `${Math.round(healthSummary.completeness.breakdown.actualTime * 100)}% actual times`,
                ]}
              />
              <QualityDimensionCard
                title="Consistency"
                score={healthSummary.consistency.score}
                grade={healthSummary.consistency.grade}
                description="Data integrity"
                icon={<CheckCircle2 className="h-4 w-4" />}
                details={[
                  `${Math.round(healthSummary.consistency.duplicateRate * 100)}% duplicates`,
                  `${Math.round(healthSummary.consistency.mismatchRate * 100)}% mismatches`,
                  `${Math.round(healthSummary.consistency.excludedRate * 100)}% excluded`,
                ]}
              />
              <QualityDimensionCard
                title="Timeliness"
                score={healthSummary.timeliness.score}
                grade={healthSummary.timeliness.grade}
                description="Schedule adherence"
                icon={<Clock4 className="h-4 w-4" />}
                details={[
                  healthSummary.timeliness.driftP50 !== null ? `P50 drift: ${Math.round(healthSummary.timeliness.driftP50)} min` : "No drift data",
                  healthSummary.timeliness.driftP90 !== null ? `P90 drift: ${Math.round(healthSummary.timeliness.driftP90)} min` : "",
                  `${healthSummary.timeliness.outlierCount} outliers (>2h)`,
                ].filter(Boolean)}
              />
              <QualityDimensionCard
                title="Accuracy"
                score={healthSummary.accuracy.score}
                grade={healthSummary.accuracy.grade}
                description="Duration fidelity"
                icon={<Timer className="h-4 w-4" />}
                details={[
                  healthSummary.accuracy.durationP50 !== null ? `Median: ${Math.round(healthSummary.accuracy.durationP50)}%` : "No duration data",
                  `${healthSummary.accuracy.underdeliveredCount} under 80%`,
                  `${healthSummary.accuracy.overdeliveredCount} over 120%`,
                ]}
              />
            </div>

            {/* Statistical Insights */}
            <Separator />
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-3.5 w-3.5" />
                Statistical Insights
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatInsightCard
                  label="Schedule Drift"
                  primary={healthSummary.timeliness.avgDrift !== null ? `${Math.round(healthSummary.timeliness.avgDrift)} min avg` : "—"}
                  secondary={healthSummary.timeliness.driftStdDev ? `±${Math.round(healthSummary.timeliness.driftStdDev)} std dev` : ""}
                />
                <StatInsightCard
                  label="Duration Fidelity"
                  primary={healthSummary.accuracy.avgDuration !== null ? `${Math.round(healthSummary.accuracy.avgDuration)}% avg` : "—"}
                  secondary={healthSummary.accuracy.durationStdDev ? `±${Math.round(healthSummary.accuracy.durationStdDev)}% std dev` : ""}
                />
                <StatInsightCard
                  label="Drift Percentiles"
                  primary={healthSummary.timeliness.driftP50 !== null ? `P50: ${Math.round(healthSummary.timeliness.driftP50)}m` : "—"}
                  secondary={healthSummary.timeliness.driftP99 !== null ? `P99: ${Math.round(healthSummary.timeliness.driftP99)}m` : ""}
                />
                <StatInsightCard
                  label="Duration Range"
                  primary={healthSummary.accuracy.durationP10 !== null ? `P10: ${Math.round(healthSummary.accuracy.durationP10)}%` : "—"}
                  secondary={healthSummary.accuracy.durationP90 !== null ? `P90: ${Math.round(healthSummary.accuracy.durationP90)}%` : ""}
                />
              </div>
            </div>

            {/* Legacy Stats Row for backwards compat */}
            <Separator />
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <HealthStat label="Coverage" value={`${Math.round(healthSummary.coverageAvg * 100)}%`} />
              <HealthStat label="Attention rate" value={`${Math.round(healthSummary.attentionRate * 100)}%`} />
              <HealthStat label="Duplicate rate" value={`${Math.round(healthSummary.duplicateRate * 100)}%`} />
              <HealthStat label="Excluded rate" value={`${Math.round(healthSummary.excludedRate * 100)}%`} />
            </div>
          </CardContent>
        </Card>

        {/* Issue Breakdown - kept separate */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="relative overflow-hidden border-border/70 bg-background/70 shadow-soft hover-elevate">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(251,146,60,0.18),transparent_55%)]" />
            <CardHeader className="relative z-10 flex flex-row items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-warning/100/15 text-warning">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Issue Breakdown</CardTitle>
                <CardDescription>Top risk signals across the dataset.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {issueHighlights.length ? (
                issueHighlights.map((item) => (
                  <IssueBreakdownRow
                    key={item.key}
                    label={item.label}
                    count={item.count}
                    base={item.base}
                    helper={item.helper}
                  />
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No issues detected in the current dataset.</p>
              )}
            </CardContent>
          </Card>

          {/* Anomaly Detection Panel */}
          <Card className="relative overflow-hidden border-border/70 bg-background/70 shadow-soft hover-elevate">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(168,85,247,0.14),transparent_55%)]" />
            <CardHeader className="relative z-10 flex flex-row items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Anomaly Detection</CardTitle>
                <CardDescription>Statistical outliers that may need review.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {(() => {
                const anomalies = [];
                if (healthSummary.timeliness.outlierCount > 0) {
                  anomalies.push({
                    key: "drift-outliers",
                    label: "Extreme schedule drift",
                    count: healthSummary.timeliness.outlierCount,
                    description: "Calls with >2 hour difference from planned time",
                    severity: healthSummary.timeliness.outlierCount > 10 ? "high" : "medium",
                  });
                }
                if (healthSummary.accuracy.underdeliveredCount > 0) {
                  anomalies.push({
                    key: "underdelivered",
                    label: "Significantly underdelivered",
                    count: healthSummary.accuracy.underdeliveredCount,
                    description: "Calls with <80% of planned duration",
                    severity: healthSummary.accuracy.underdeliveredCount > 20 ? "high" : "medium",
                  });
                }
                if (healthSummary.accuracy.overdeliveredCount > 0) {
                  anomalies.push({
                    key: "overdelivered",
                    label: "Significantly overdelivered",
                    count: healthSummary.accuracy.overdeliveredCount,
                    description: "Calls with >120% of planned duration",
                    severity: healthSummary.accuracy.overdeliveredCount > 20 ? "high" : "low",
                  });
                }
                if (healthSummary.timeliness.driftStdDev > 60) {
                  anomalies.push({
                    key: "high-variance",
                    label: "High timing variance",
                    count: Math.round(healthSummary.timeliness.driftStdDev),
                    description: `Standard deviation of ${Math.round(healthSummary.timeliness.driftStdDev)} minutes indicates inconsistent scheduling`,
                    severity: "medium",
                  });
                }
                
                return anomalies.length > 0 ? (
                  anomalies.map((anomaly) => (
                    <AnomalyRow
                      key={anomaly.key}
                      label={anomaly.label}
                      count={anomaly.count}
                      description={anomaly.description}
                      severity={anomaly.severity as "high" | "medium" | "low"}
                    />
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No statistical anomalies detected.</p>
                );
              })()}
            </CardContent>
          </Card>
        </div>
        </>
        )}

      {coverage.total > 0 && (
        <Card className="relative overflow-hidden border-border/70 bg-background/70 shadow-soft hover-elevate">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.12),transparent_55%)]" />
          <CardHeader className="relative z-10 flex flex-row items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Data Coverage</CardTitle>
              <CardDescription>How many of the unique slots contain each key signal.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <CoverageStat label="Planned time" count={coverage.plannedTime} total={coverage.total} />
              <CoverageStat label="Actual time" count={coverage.actualTime} total={coverage.total} />
              <CoverageStat label="Planned duration" count={coverage.plannedDuration} total={coverage.total} />
              <CoverageStat label="Actual duration" count={coverage.actualDuration} total={coverage.total} />
              <CoverageStat label="Planned carer" count={coverage.plannedWorker} total={coverage.total} />
              <CoverageStat label="Actual carer" count={coverage.actualWorker} total={coverage.total} />
              <CoverageStat label="Service user" count={coverage.serviceUser} total={coverage.total} />
              <CoverageStat label="Planned date" count={coverage.plannedDate} total={coverage.total} />
              <CoverageStat label="Call type" count={coverage.callType} total={coverage.total} />
            </div>
          </CardContent>
        </Card>
      )}

      {detectedColumns.length > 0 && (
        <Card className="relative overflow-hidden border-border/70 bg-background/70 shadow-soft hover-elevate">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.1),transparent_60%)]" />
          <CardHeader className="relative z-10 flex flex-row items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Search className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Detected Columns</CardTitle>
              <CardDescription>Auto-mapped columns used in this analysis.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              {detectedColumns.map((item) => {
                const hasColumn = Boolean(item.key);
                return (
                  <div key={item.label} className="rounded-2xl border border-border/70 bg-background/60 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
                      {item.coveragePercent !== null && (
                        <Badge variant="secondary">{item.coveragePercent}% coverage</Badge>
                      )}
                    </div>
                    <p className={`mt-1 text-sm font-semibold ${hasColumn ? "text-foreground" : "text-muted-foreground"}`}>
                      {hasColumn ? item.columnLabel : "Not detected"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Sample: {item.sample || "—"}
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {analysisResults.length > 0 && (
        <Accordion type="multiple" className="w-full">
          {summary.total > 0 && (
            <AccordionItem value="timing-insights" className="mb-4 rounded-2xl border border-border/60 bg-card/60 px-5 shadow-soft hover-elevate border-b-0">
              <AccordionTrigger className="py-5 text-base font-semibold hover:no-underline transition-colors data-[state=open]:text-primary">
                Timing Insights
              </AccordionTrigger>
              <AccordionContent className="pb-5">
                <Card className="border border-primary/20 bg-card">
                  <CardHeader>
                    <CardTitle>Timing Insights</CardTitle>
                    <CardDescription>Compare planned intent against care delivery reality.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    <TimingStat
                      title="Average Schedule Drift"
                      value={formatMinutesDisplay(summary.averageDriftMinutes)}
                      helper={`${summary.scheduleAlerts.toLocaleString()} rows exceeded the 2h tolerance.`}
                      tone={
                        summary.averageDriftMinutes !== null && summary.averageDriftMinutes > 120
                          ? "destructive"
                          : summary.averageDriftMinutes !== null && summary.averageDriftMinutes > 90
                          ? "warning"
                          : "default"
                      }
                      badge={summary.averageDriftMinutes !== null ? formatMinutesDisplay(summary.averageDriftMinutes) : undefined}
                    />
                    <TimingStat
                      title="Average Duration Fidelity"
                      value={
                        summary.averageDurationPercent !== null
                          ? `${summary.averageDurationPercent.toFixed(1)}%`
                          : "—"
                      }
                      helper={`${summary.durationAlerts.toLocaleString()} rows were under 80% or over 120% of plan.`}
                      tone={
                        summary.averageDurationPercent !== null && summary.averageDurationPercent < 80
                          ? "destructive"
                          : summary.averageDurationPercent !== null && summary.averageDurationPercent > 120
                          ? "warning"
                          : summary.averageDurationPercent !== null && summary.averageDurationPercent < 90
                          ? "warning"
                          : "default"
                      }
                      badge={
                        summary.averageDurationPercent !== null
                          ? `${Math.round(summary.averageDurationPercent)}% actual`
                          : undefined
                      }
                    />
                  </CardContent>
                </Card>
              </AccordionContent>
            </AccordionItem>
          )}

          {slotTrends.length > 0 && (
            <AccordionItem value="call-type-trends" className="mb-4 rounded-2xl border border-border/60 bg-card/60 px-5 shadow-soft hover-elevate border-b-0">
              <AccordionTrigger className="py-5 text-base font-semibold hover:no-underline transition-colors data-[state=open]:text-primary">
                Recurring Call Type Trends
              </AccordionTrigger>
              <AccordionContent className="pb-5">
                <Card>
                  <CardHeader>
                    <CardTitle>Recurring Call Type Trends</CardTitle>
                    <CardDescription>
                      Detect consistent drift for the same service user and call type, then suggest practical updates to planned times or durations based on actuals.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3">
                      {slotTrends.map((trend) => (
                        <div
                          key={trend.key}
                          className={`rounded-2xl border p-4 ${toneSurfaceMap[trend.tone]}`}
                        >
                          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">Service User • Call Type</p>
                              <p className="text-base font-semibold text-foreground">
                                {trend.serviceUserName || "Unknown"} • {trend.callTypeLabel}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {(trend.serviceUserArea || "Area unavailable").toString()} • {trend.serviceUserAddress || "Address unavailable"}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="outline" className="text-xs font-semibold">
                                {trend.totalCalls} call{trend.totalCalls === 1 ? "" : "s"}
                              </Badge>
                              {typeof trend.averageStartOffsetMinutes === "number" && (
                                <Badge variant="secondary" className="text-xs font-semibold">
                                  Avg start Δ {formatSignedMinutes(trend.averageStartOffsetMinutes)}
                                </Badge>
                              )}
                              {typeof trend.averageDurationPercent === "number" && (
                                <Badge variant="secondary" className="text-xs font-semibold">
                                  Avg duration {trend.averageDurationPercent.toFixed(0)}%
                                </Badge>
                              )}
                            </div>
                          </div>

                          <div className="mt-3 space-y-2">
                            {trend.advice.map((line, idx) => (
                              <p key={`${trend.key}-advice-${idx}`} className="text-sm text-foreground">
                                {line}
                              </p>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </AccordionContent>
            </AccordionItem>
          )}

          {showRosteringStudio && careWorkerRosters.length > 0 && (
            <AccordionItem
              id="tf-studio"
              value="care-worker-route-optimizer"
              className="scroll-mt-24 mb-4 rounded-2xl border border-border/60 bg-card/60 px-5 shadow-soft hover-elevate border-b-0 overflow-hidden"
            >
              <AccordionTrigger className="py-5 text-base font-semibold hover:no-underline transition-colors data-[state=open]:text-primary">
                Rostering Studio
              </AccordionTrigger>
              <AccordionContent className="relative pb-5">
                {rosteringFullscreen && (
                  <div
                    className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm"
                    onClick={() => setRosteringFullscreen(false)}
                    aria-hidden="true"
                  />
                )}
                <div className={rosteringFullscreen ? "fixed inset-4 z-50" : undefined}>
                  <Card
                    className={
                      rosteringFullscreen
                        ? "h-[calc(100vh-2rem)] border border-border/70 bg-background shadow-[var(--shadow-strong)]"
                        : "border-0 bg-transparent shadow-none"
                    }
                  >
                    <CardHeader
                      className={`flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between ${rosteringFullscreen ? "sticky top-0 z-10 border-b border-border/60 bg-background/95 backdrop-blur" : ""}`}
                    >
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Route className="h-5 w-5 text-primary" />
                        Rostering Studio
                      </CardTitle>
                      <CardDescription>
                        Build a care worker run from templated calls, then refine it into a working rota with time-critical safeguards and zero overlaps.
                      </CardDescription>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="outline" className="text-[10px] font-semibold">
                          {careWorkerRosters.length} workers
                        </Badge>
                        <Badge variant="outline" className="text-[10px] font-semibold">
                          {serviceUserStacks.length} service users
                        </Badge>
                        <Badge variant="outline" className="text-[10px] font-semibold">
                          {rosterRows.length} calls
                        </Badge>
                        {summary.averageDriftMinutes !== null && (
                          <Badge variant="secondary" className="text-[10px] font-semibold">
                            Avg drift {formatMinutesDisplay(summary.averageDriftMinutes)}
                          </Badge>
                        )}
                        {summary.averageDurationPercent !== null && (
                          <Badge variant="secondary" className="text-[10px] font-semibold">
                            Avg duration {Math.round(summary.averageDurationPercent)}%
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="text-xs font-semibold">
                        <CalendarDays className="mr-1 h-3.5 w-3.5" />
                        {selectedTemplateWeekLabel} • {selectedTemplateDay}
                      </Badge>
                      <Button size="sm" variant="ghost" onClick={handleResetRosteringStudio}>
                        Reset
                      </Button>
                      <Button
                        size="sm"
                        variant={rosteringFullscreen ? "secondary" : "outline"}
                        onClick={() => setRosteringFullscreen((prev) => !prev)}
                      >
                        {rosteringFullscreen ? (
                          <>
                            <Minimize2 className="h-4 w-4 mr-2" />
                            Exit full screen
                          </>
                        ) : (
                          <>
                            <Maximize2 className="h-4 w-4 mr-2" />
                            Full screen
                          </>
                        )}
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <Link href="/rostering-studio">Open Rostering Studio</Link>
                      </Button>
                    </div>
                    </CardHeader>
                    <CardContent
                      className={`space-y-6 overflow-auto pr-2 ${
                        rosteringFullscreen
                          ? "h-[calc(100vh-12rem)]"
                          : "max-h-[70vh]"
                      }`}
                    >
                    {!careWorkerHasMatch && (
                      <p className="text-xs text-muted-foreground">
                        No direct match found — showing the nearest care workers instead.
                      </p>
                    )}
                    <div className="grid gap-4 xl:grid-cols-[260px,1fr]">
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
                        <ScrollArea
                          className={`${
                            rosteringFullscreen
                              ? "h-[calc(100vh-22rem)]"
                              : "h-[360px]"
                          } rounded-md border border-border/70`}
                        >
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
                                        <Badge variant="outline" className="text-[10px] font-semibold">
                                          Office staff
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      {roster.uniqueServiceUsers} service users • {roster.callRows.length} calls
                                      {roster.shiftBarsCount
                                        ? ` • ${roster.shiftBarsCount} shift bar${roster.shiftBarsCount === 1 ? "" : "s"}`
                                        : ""}
                                    </p>
                                  </div>
                                  {isSelected && <CheckCircle2 className="h-4 w-4 text-primary" />}
                                </button>
                              );
                            })}
                          </div>
                        </ScrollArea>
                        <p className="text-xs text-muted-foreground">
                          Saved {careWorkerRosters.length} care workers • {serviceUserStacks.length} service users
                        </p>
                      </div>

                      <div className="space-y-4">
                        {!selectedCareWorker ? (
                          <Alert>
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Select a care worker</AlertTitle>
                            <AlertDescription>
                              Choose a care worker on the left to view their typical daily calls and build a route.
                            </AlertDescription>
                          </Alert>
                        ) : (
                          <>
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-semibold text-foreground">{selectedCareWorker.workerName}</p>
                                  {selectedCareWorker.isAdminStaff && (
                                    <Badge variant="outline" className="text-xs font-semibold">
                                      Office staff
                                    </Badge>
                                  )}
                                  {selectedCareWorker.shiftBarsCount > 0 && (
                                    <Badge variant="secondary" className="text-xs font-semibold">
                                      {selectedCareWorker.shiftBarsCount} shift bar{selectedCareWorker.shiftBarsCount === 1 ? "" : "s"}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {selectedCareWorker.uniqueServiceUsers} service users • {selectedCareWorker.callGroups.length} call types •{" "}
                                  {selectedCareWorker.callRows.length} calls • {selectedCareWorker.uniqueDays} days
                                </p>
                              </div>
                            </div>

                            <Tabs defaultValue="library" className="space-y-4">
                              <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="library">Call Library</TabsTrigger>
                                <TabsTrigger value="preview">Schedule Preview</TabsTrigger>
                              </TabsList>

                              <TabsContent value="library" className="space-y-4">
                                <div className="grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
                                  <div className="space-y-4">
                                    <div className="rounded-2xl border border-border/70 bg-muted/30 p-4 space-y-3">
                                      <div className="flex items-center justify-between">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                          Template schedule
                                        </p>
                                        <Badge variant="secondary" className="text-[10px] font-semibold">
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
                                        {availableTemplateGroups.length} templated call{availableTemplateGroups.length === 1 ? "" : "s"} available
                                        for {selectedTemplateWeekLabel} • {selectedTemplateDay}.
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        Template employee assignments override planned and actual carers for routing.
                                      </p>
                                    </div>
                                  </div>
                                  <div className="space-y-4">
                                    <div className="rounded-2xl border border-border/70 bg-background/60 p-4 space-y-3">
                                      <div className="flex items-center gap-2">
                                        <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                                        <p className="text-sm font-semibold text-foreground">Roster controls</p>
                                      </div>
                                      <p className="text-xs text-muted-foreground">
                                        Working window: 06:00 → 22:00 (warn at 23:00). Double-up calls stay locked to the shared time.
                                      </p>
                                      <div className="space-y-2 text-xs text-muted-foreground">
                                        <div className="flex items-center justify-between">
                                          <label htmlFor="toggle-pack-calls" className="font-medium">
                                            Pack calls back-to-back
                                          </label>
                                          <Switch
                                            id="toggle-pack-calls"
                                            checked={packCallsBackToBack}
                                            onCheckedChange={setPackCallsBackToBack}
                                          />
                                        </div>
                                        <div className="flex items-center justify-between">
                                          <label htmlFor="toggle-observed-averages" className="font-medium">
                                            Use observed averages (starts & durations)
                                          </label>
                                          <Switch
                                            id="toggle-observed-averages"
                                            checked={useObservedAverages}
                                            onCheckedChange={setUseObservedAverages}
                                          />
                                        </div>
                                        <div className="flex items-center justify-between">
                                          <label htmlFor="toggle-time-critical" className="font-medium">
                                            Enforce time-critical window (±{TIME_CRITICAL_WINDOW_MINUTES} mins)
                                          </label>
                                          <Switch
                                            id="toggle-time-critical"
                                            checked={enforceTimeCriticalWindow}
                                            onCheckedChange={setEnforceTimeCriticalWindow}
                                          />
                                        </div>
                                      </div>
                                      <p className="text-xs text-muted-foreground">
                                        Observed averages use consistent drift in the uploaded data to shift requirement times and durations.
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        Calls flagged as adhoc or ServiceDutyClassType A/S are excluded from routing.
                                      </p>
                                    </div>

                                    <div className="rounded-2xl border border-border/70 bg-background/60 p-4 space-y-3">
                                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        Shift bars (fixed)
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {selectedCareWorker.isAdminStaff
                                          ? "For office staff, shift bars block scheduling (no calls will be placed inside them)."
                                          : `Shift bars stay at their template time for ${formatMinutesDisplay(SHIFT_BAR_DURATION_MINUTES)} and can overlap calls.`}
                                      </p>
                                      {selectedCareWorker.shiftBarsCount === 0 ? (
                                        <p className="text-xs text-muted-foreground">No shift bars recorded for this worker.</p>
                                      ) : shiftBarsForSelection.length ? (
                                        <div className="space-y-2">
                                          {shiftBarsForSelection.map((bar) => (
                                            <div
                                              key={bar.key}
                                              className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background/70 p-3 sm:flex-row sm:items-center sm:justify-between"
                                            >
                                              <div>
                                                <p className="text-sm font-semibold text-foreground">Shift bar</p>
                                                <p className="text-xs text-muted-foreground">
                                                  {bar.plannedDateLabel ? `Template date ${bar.plannedDateLabel}` : "Template date not set"}
                                                </p>
                                              </div>
                                              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                                <Badge variant="outline" className="text-xs font-semibold">
                                                  Fixed {bar.startLabel || "—"} → {bar.endLabel || "—"}
                                                </Badge>
                                                <Badge variant="secondary" className="text-xs font-semibold">
                                                  {formatMinutesDisplay(bar.durationMinutes)}
                                                </Badge>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="text-xs text-muted-foreground">
                                          No shift bars on {selectedTemplateWeekLabel} • {selectedTemplateDay}.
                                        </p>
                                      )}
                                      {unassignedShiftBars.length > 0 && (
                                        <p className="text-xs text-muted-foreground">
                                          {unassignedShiftBars.length} shift bar{unassignedShiftBars.length === 1 ? "" : "s"} missing a template date and not placed.
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {selectedCareWorker.missingRequirementTimes > 0 && (
                                  <Alert>
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertTitle>Missing service requirement times</AlertTitle>
                                    <AlertDescription>
                                      {selectedCareWorker.missingRequirementTimes} calls have no requirement or planned time and are excluded from routing.
                                    </AlertDescription>
                                  </Alert>
                                )}

                                <div className="rounded-2xl border border-border/70 bg-card/50 p-4 space-y-3">
                                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                      <p className="text-sm font-semibold text-foreground">Call library</p>
                                      <p className="text-xs text-muted-foreground">
                                        {selectedWorkerCallKeys.length} selected • {availableTemplateGroups.length} templated call
                                        {availableTemplateGroups.length === 1 ? "" : "s"} for {selectedTemplateWeekLabel} • {selectedTemplateDay}
                                        {recommendedForSelection.length
                                          ? ` • ${recommendedForSelection.length} recommended to template`
                                          : ""}
                                        .
                                      </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => {
                                          const typicalKeys = availableTemplateGroups
                                            .filter((group) => group.uniqueDays >= TYPICAL_DAY_MIN_OCCURRENCES)
                                            .map((group) => group.key);
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
                                          const selectableKeys = availableTemplateGroups.map((group) => group.key);
                                          setSelectedWorkerCallKeys(selectableKeys);
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

                                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="relative w-full sm:w-72">
                                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                      <Input
                                        value={rosterCallSearch}
                                        onChange={(e) => setRosterCallSearch(e.target.value)}
                                        placeholder="Search service user, call type, or area"
                                        className="pl-9"
                                      />
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      Showing {filteredResolvedCallGroups.length} of {resolvedCallGroups.length} call groups
                                    </p>
                                  </div>

                                  {!availableTemplateGroups.length ? (
                                    <Alert>
                                      <AlertCircle className="h-4 w-4" />
                                      <AlertTitle>No templated calls for this day</AlertTitle>
                                      <AlertDescription>
                                        There are no permanent template assignments for {selectedTemplateWeekLabel} • {selectedTemplateDay}.
                                      </AlertDescription>
                                    </Alert>
                                  ) : null}

                                  {filteredResolvedCallGroups.length ? (
                                    <div className="rounded-xl border border-border/60 bg-background/60">
                                      <div className="space-y-3 p-3">
                                        {filteredResolvedCallGroups.map((group, index) => {
                                          const isTemplatedForSelection = group.templatedWeekdayKeys.has(templateSelectionKey);
                                          const isSelected = selectedWorkerCallKeys.includes(group.key);
                                          const hasRequirementTime = typeof group.effectiveRequirementStartMinutes === "number";
                                          const isSelectable = hasRequirementTime;
                                          const isRecommended = recommendedForSelectionSet.has(group.key);
                                          const hasTimeOverride =
                                            group.hasTemplateOverride &&
                                            group.effectiveRequirementStartMinutes !== group.requirementStartMinutes;
                                          const durationLabel =
                                            group.durationMinutes !== null
                                              ? formatMinutesDisplay(group.durationMinutes)
                                              : `${DEFAULT_ROUTE_DURATION_MINUTES} mins assumed`;
                                          const isExpanded = expandedTemplateGroupKeys.includes(group.overrideKey);
                                          return (
                                            <div
                                              key={`${group.overrideKey}-${group.key}-${index}`}
                                              className={`flex flex-col gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between transition-colors ${
                                                isSelectable
                                                  ? isSelected
                                                    ? "border-primary/50 bg-primary/10 hover:bg-primary/15"
                                                    : "border-border/60 bg-background/60 hover:bg-muted/20"
                                                  : "border-border/40 bg-muted/30 opacity-75"
                                              }`}
                                            >
                                              <div>
                                                <p className="text-sm font-semibold text-foreground">
                                                  {group.serviceUserName || "Unknown service user"}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                  {group.callTypeLabel} • {group.effectiveTimeBandLabel} • Req{" "}
                                                  {group.effectiveRequirementStartLabel || "No requirement time"}
                                                  {hasTimeOverride ? " (override)" : ""}
                                                </p>
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                  <Badge variant="outline" className="text-xs font-semibold">
                                                    {group.totalCalls} call{group.totalCalls === 1 ? "" : "s"}
                                                  </Badge>
                                                  {!isTemplatedForSelection && isRecommended && (
                                                    <Badge variant="secondary" className="text-xs font-semibold">
                                                      Recommended to template
                                                    </Badge>
                                                  )}
                                                  {!isTemplatedForSelection && !isRecommended && (
                                                    <Badge variant="outline" className="text-xs font-semibold">
                                                      Not templated
                                                    </Badge>
                                                  )}
                                                  {!isSelectable && (
                                                    <Badge variant="outline" className="text-xs font-semibold">
                                                      Missing requirement time
                                                    </Badge>
                                                  )}
                                                  {group.hasTemplateOverride && (
                                                    <Badge variant="secondary" className="text-xs font-semibold">
                                                      Manual override
                                                    </Badge>
                                                  )}
                                                  {group.isTimeCritical && (
                                                    <Badge variant="outline" className="text-xs font-semibold">
                                                      Time critical
                                                    </Badge>
                                                  )}
                                                  {group.isDoubleUpForSelection && (
                                                    <Badge variant="outline" className="text-xs font-semibold">
                                                      Double-up (locked)
                                                    </Badge>
                                                  )}
                                                  <Badge variant="secondary" className="text-xs font-semibold">
                                                    {group.uniqueDays} days
                                                  </Badge>
                                                  <Badge variant="outline" className="text-xs font-semibold">
                                                    Duration {durationLabel}
                                                  </Badge>
                                                </div>
                                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                                  <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() =>
                                                      setExpandedTemplateGroupKeys((prev) =>
                                                        prev.includes(group.overrideKey)
                                                          ? prev.filter((key) => key !== group.overrideKey)
                                                          : [...prev, group.overrideKey]
                                                      )
                                                    }
                                                  >
                                                    {isExpanded ? "Hide edit" : "Edit template"}
                                                  </Button>
                                                  {group.hasTemplateOverride && (
                                                    <Button
                                                      type="button"
                                                      size="sm"
                                                      variant="outline"
                                                      onClick={() =>
                                                        setTemplateOverrides((prev) => {
                                                          const next = { ...prev };
                                                          delete next[group.overrideKey];
                                                          return next;
                                                        })
                                                      }
                                                    >
                                                      Reset overrides
                                                    </Button>
                                                  )}
                                                </div>
                                                {isExpanded && (
                                                  <div className="mt-3 space-y-3 rounded-xl border border-border/60 bg-background/70 p-3">
                                                    <div>
                                                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                        Week 1
                                                      </p>
                                                      <div className="mt-2 flex flex-wrap gap-2">
                                                        {WEEKDAY_OPTIONS.map((day) => (
                                                          <Button
                                                            key={`${group.overrideKey}-week1-${day}`}
                                                            type="button"
                                                            size="sm"
                                                            variant={group.overrideWeek1Days.includes(day) ? "secondary" : "outline"}
                                                            onClick={() =>
                                                              setTemplateOverrides((prev) => {
                                                                const current = prev[group.overrideKey] ?? {
                                                                  week1Days: group.overrideWeek1Days,
                                                                  week2Days: group.overrideWeek2Days,
                                                                  requirementStartMinutes: group.effectiveRequirementStartMinutes,
                                                                };
                                                                const nextWeek1Days = toggleWeekdaySelection(current.week1Days, day);
                                                                return {
                                                                  ...prev,
                                                                  [group.overrideKey]: {
                                                                    ...current,
                                                                    week1Days: nextWeek1Days,
                                                                  },
                                                                };
                                                              })
                                                            }
                                                          >
                                                            {day.slice(0, 3)}
                                                          </Button>
                                                        ))}
                                                      </div>
                                                    </div>
                                                    <div>
                                                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                        Week 2
                                                      </p>
                                                      <div className="mt-2 flex flex-wrap gap-2">
                                                        {WEEKDAY_OPTIONS.map((day) => (
                                                          <Button
                                                            key={`${group.overrideKey}-week2-${day}`}
                                                            type="button"
                                                            size="sm"
                                                            variant={group.overrideWeek2Days.includes(day) ? "secondary" : "outline"}
                                                            onClick={() =>
                                                              setTemplateOverrides((prev) => {
                                                                const current = prev[group.overrideKey] ?? {
                                                                  week1Days: group.overrideWeek1Days,
                                                                  week2Days: group.overrideWeek2Days,
                                                                  requirementStartMinutes: group.effectiveRequirementStartMinutes,
                                                                };
                                                                const nextWeek2Days = toggleWeekdaySelection(current.week2Days, day);
                                                                return {
                                                                  ...prev,
                                                                  [group.overrideKey]: {
                                                                    ...current,
                                                                    week2Days: nextWeek2Days,
                                                                  },
                                                                };
                                                              })
                                                            }
                                                          >
                                                            {day.slice(0, 3)}
                                                          </Button>
                                                        ))}
                                                      </div>
                                                    </div>
                                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                                      <div>
                                                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                          Time override
                                                        </p>
                                                        <p className="text-xs text-muted-foreground">
                                                          Update the requirement time if the template needs adjusting.
                                                        </p>
                                                      </div>
                                                      <div className="flex flex-wrap items-center gap-2">
                                                        <Input
                                                          type="time"
                                                          value={formatTimeInputValue(group.effectiveRequirementStartMinutes)}
                                                          onChange={(event) => {
                                                            const minutes = parseTimeToMinutes(event.target.value);
                                                            setTemplateOverrides((prev) => {
                                                              const current = prev[group.overrideKey] ?? {
                                                                week1Days: group.overrideWeek1Days,
                                                                week2Days: group.overrideWeek2Days,
                                                                requirementStartMinutes: group.effectiveRequirementStartMinutes,
                                                              };
                                                              return {
                                                                ...prev,
                                                                [group.overrideKey]: {
                                                                  ...current,
                                                                  requirementStartMinutes: minutes,
                                                                },
                                                              };
                                                            });
                                                          }}
                                                          className="w-32"
                                                        />
                                                        {hasTimeOverride && (
                                                          <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() =>
                                                              setTemplateOverrides((prev) => {
                                                                const current = prev[group.overrideKey] ?? {
                                                                  week1Days: group.overrideWeek1Days,
                                                                  week2Days: group.overrideWeek2Days,
                                                                  requirementStartMinutes: group.effectiveRequirementStartMinutes,
                                                                };
                                                                return {
                                                                  ...prev,
                                                                  [group.overrideKey]: {
                                                                    ...current,
                                                                    requirementStartMinutes: group.requirementStartMinutes ?? null,
                                                                  },
                                                                };
                                                              })
                                                            }
                                                          >
                                                            Use detected time
                                                          </Button>
                                                        )}
                                                      </div>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">
                                                      Overrides are saved for this session only.
                                                    </p>
                                                  </div>
                                                )}
                                              </div>
                                                <Switch
                                                  checked={isSelected}
                                                  onCheckedChange={(checked: boolean) => {
                                                    if (!isSelectable) return;
                                                    if (checked && selectedCareWorker && !isTemplatedForSelection) {
                                                      addTemplateRecommendation(
                                                        selectedCareWorker.key,
                                                        selectedTemplateWeek,
                                                        selectedTemplateDay,
                                                        group.key
                                                      );
                                                    }
                                                    setSelectedWorkerCallKeys((prev) =>
                                                      checked
                                                        ? prev.includes(group.key)
                                                          ? prev
                                                          : [...prev, group.key]
                                                      : prev.filter((key) => key !== group.key)
                                                  );
                                                }}
                                                disabled={!isSelectable}
                                              />
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">
                                      {rosterCallSearch.trim()
                                        ? "No call groups match that search."
                                        : "No call groups available for this worker."}
                                    </p>
                                  )}
                                </div>
                              </TabsContent>

                              <TabsContent value="preview" className="space-y-4">
                                {!rosterSummary ? (
                                  <Alert>
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertTitle>No optimized run yet</AlertTitle>
                                    <AlertDescription>
                                      Select calls in the library to generate a schedule preview.
                                    </AlertDescription>
                                  </Alert>
                                ) : (
                                  <>
                                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                      <GroupMetric
                                        label="Scheduled calls"
                                        value={`${rosterSummary.scheduledCount}/${rosterSummary.totalCalls}`}
                                        helper={`${rosterSummary.unscheduledCount} unscheduled`}
                                        tone={rosterSummary.unscheduledCount ? "warning" : "default"}
                                      />
                                      <GroupMetric
                                        label="Run window"
                                        value={`${deriveTimeLabel(rosterSummary.earliestStart, null) ?? "—"} → ${deriveTimeLabel(rosterSummary.latestEnd, null) ?? "—"}`}
                                        helper={`Span ${formatMinutesDisplay(rosterSummary.runSpanMinutes)}`}
                                      />
                                      <GroupMetric
                                        label="Care minutes"
                                        value={formatMinutesDisplay(rosterSummary.totalDurationMinutes)}
                                        helper={`Idle ${formatMinutesDisplay(rosterSummary.idleMinutes)}`}
                                        tone={rosterSummary.idleMinutes > 30 ? "warning" : "default"}
                                      />
                                      <GroupMetric
                                        label="Time-critical calls"
                                        value={`${rosterSummary.timeCriticalCount}`}
                                        helper={`${rosterSummary.outsideWindowCount} outside window`}
                                        tone={rosterSummary.outsideWindowCount ? "destructive" : "default"}
                                      />
                                      <GroupMetric
                                        label="Double-up calls"
                                        value={`${rosterSummary.doubleUpCount}`}
                                        helper="Locked to shared time"
                                      />
                                      <GroupMetric
                                        label="Window conflicts"
                                        value={`${rosterSummary.windowConflictCount}`}
                                        helper="Overlaps or ordering clashes"
                                        tone={rosterSummary.windowConflictCount ? "destructive" : "default"}
                                      />
                                    </div>

                                    {(rosterSummary.beforeStartCount > 0 ||
                                      rosterSummary.afterSoftCount > 0 ||
                                      rosterSummary.afterHardCount > 0 ||
                                      rosterSummary.outsideWindowCount > 0 ||
                                      rosterSummary.windowConflictCount > 0 ||
                                      rosterSummary.unscheduledCount > 0) && (
                                      <Alert>
                                        <AlertCircle className="h-4 w-4" />
                                        <AlertTitle>Rota warnings</AlertTitle>
                                        <AlertDescription className="space-y-1">
                                          {rosterSummary.unscheduledCount > 0 && (
                                            <p>{rosterSummary.unscheduledCount} calls have no scheduled time.</p>
                                          )}
                                          {rosterSummary.beforeStartCount > 0 && (
                                            <p>{rosterSummary.beforeStartCount} calls start before 06:00.</p>
                                          )}
                                          {rosterSummary.afterSoftCount > 0 && (
                                            <p>{rosterSummary.afterSoftCount} calls end after 22:00.</p>
                                          )}
                                          {rosterSummary.afterHardCount > 0 && (
                                            <p>{rosterSummary.afterHardCount} calls end after 23:00.</p>
                                          )}
                                          {rosterSummary.outsideWindowCount > 0 && (
                                            <p>{rosterSummary.outsideWindowCount} time-critical calls are outside the ±{TIME_CRITICAL_WINDOW_MINUTES}-minute window.</p>
                                          )}
                                          {rosterSummary.windowConflictCount > 0 && (
                                            <p>{rosterSummary.windowConflictCount} calls overlap or violate ordering.</p>
                                          )}
                                        </AlertDescription>
                                      </Alert>
                                    )}
                                  </>
                                )}

                                <div className="rounded-2xl border border-border/70 bg-card/50 p-4">
                                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div>
                                      <p className="text-sm font-semibold text-foreground">Optimized run</p>
                                      <p className="text-xs text-muted-foreground">
                                        {packCallsBackToBack
                                          ? "Packing calls back-to-back to reduce idle gaps."
                                          : "Respecting requirement times with gaps where needed."}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        Time-critical window {enforceTimeCriticalWindow ? "enforced." : "not enforced."}
                                      </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={handleExportRotaCsv}
                                        disabled={!optimizedRun.length}
                                      >
                                        <Download className="h-4 w-4 mr-2" />
                                        Export CSV
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={handleCopyRota}
                                        disabled={!optimizedRun.length}
                                      >
                                        <Copy className="h-4 w-4 mr-2" />
                                        Copy
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="secondary"
                                        onClick={handleSaveRota}
                                        disabled={!optimizedRun.length || isSavingRota}
                                      >
                                        {isSavingRota ? (
                                          <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Saving
                                          </>
                                        ) : (
                                          "Save rota"
                                        )}
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="default"
                                        onClick={handleSaveAllRotas}
                                        disabled={!careWorkerRosters.length || isSavingAllRotas}
                                      >
                                        {isSavingAllRotas ? (
                                          <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            {bulkSaveProgress
                                              ? `${bulkSaveProgress.saved + bulkSaveProgress.skipped}/${bulkSaveProgress.total}`
                                              : "Saving all..."}
                                          </>
                                        ) : (
                                          <>
                                            <Users className="h-4 w-4 mr-2" />
                                            Save all workers
                                          </>
                                        )}
                                      </Button>
                                    </div>
                                  </div>

                                  {optimizedRun.length ? (
                                    <div className="mt-3 space-y-2">
                                      {optimizedRun.map((entry, index) => {
                                        const requiredLabel = deriveTimeLabel(entry.requirementStartMinutes, null) || "—";
                                        const scheduledStart = deriveTimeLabel(entry.scheduledStartMinutes, null) || "—";
                                        const scheduledEnd = deriveTimeLabel(entry.scheduledEndMinutes, null) || "—";
                                        const recommendedStart =
                                          deriveTimeLabel(entry.recommendedStartMinutes, null) || "—";
                                        const shiftLabel = (() => {
                                          if (typeof entry.shiftMinutes !== "number") return "—";
                                          const rounded = Math.round(entry.shiftMinutes);
                                          if (rounded > 0) return `+${rounded} mins`;
                                          if (rounded < 0) return `${Math.abs(rounded)} mins earlier`;
                                          return "On time";
                                        })();
                                        const travelLabel =
                                          typeof entry.travelMinutesEstimated === "number"
                                            ? `${Math.round(entry.travelMinutesEstimated)} mins travel`
                                            : null;
                                        const windowLabel =
                                          entry.windowStartMinutes !== null && entry.windowEndMinutes !== null
                                            ? `${deriveTimeLabel(entry.windowStartMinutes, null)} → ${deriveTimeLabel(entry.windowEndMinutes, null)}`
                                            : null;
                                        const isBeforeDayStart =
                                          typeof entry.scheduledStartMinutes === "number" &&
                                          entry.scheduledStartMinutes < ROSTER_DAY_START_MINUTES;
                                        const endMinutes =
                                          typeof entry.scheduledEndMinutes === "number" ? entry.scheduledEndMinutes : null;
                                        const isAfterHardLimit = endMinutes !== null && endMinutes > ROSTER_DAY_HARD_END_MINUTES;
                                        const isAfterSoftLimit =
                                          endMinutes !== null &&
                                          endMinutes > ROSTER_DAY_SOFT_END_MINUTES &&
                                          endMinutes <= ROSTER_DAY_HARD_END_MINUTES;
                                        const hasSchedule =
                                          typeof entry.scheduledStartMinutes === "number" &&
                                          typeof entry.scheduledEndMinutes === "number";
                                        const timelineRange = ROSTER_DAY_HARD_END_MINUTES - ROSTER_DAY_START_MINUTES || 1;
                                        const startOffset = hasSchedule
                                          ? (entry.scheduledStartMinutes as number) - ROSTER_DAY_START_MINUTES
                                          : 0;
                                        const endOffset = hasSchedule
                                          ? (entry.scheduledEndMinutes as number) - ROSTER_DAY_START_MINUTES
                                          : 0;
                                        const rawLeft = hasSchedule ? (startOffset / timelineRange) * 100 : 0;
                                        const rawWidth = hasSchedule ? ((endOffset - startOffset) / timelineRange) * 100 : 0;
                                        const leftPercent = hasSchedule ? Math.max(0, Math.min(98, rawLeft)) : 0;
                                        const widthPercent = hasSchedule
                                          ? Math.max(2, Math.min(100 - leftPercent, Math.max(0, rawWidth)))
                                          : 0;
                                        const barTone =
                                          isAfterHardLimit || entry.isOutsideWindow || entry.hasWindowConflict
                                            ? "bg-destructive/10"
                                            : isAfterSoftLimit || isBeforeDayStart
                                            ? "bg-warning/80"
                                            : entry.isDoubleUp
                                            ? "bg-success/10"
                                            : "bg-primary/70";
                                        const borderTone =
                                          isAfterHardLimit || entry.isOutsideWindow || entry.hasWindowConflict
                                            ? "border-l-red-500/70"
                                            : isAfterSoftLimit || isBeforeDayStart
                                            ? "border-l-warning/80"
                                            : entry.isDoubleUp
                                            ? "border-l-emerald-500/70"
                                            : "border-l-primary/70";
                                        return (
                                          <div
                                            key={`${entry.key}-${entry.callTypeLabel}-${entry.timeBandLabel}-${entry.requirementStartMinutes ?? "none"}-${index}`}
                                            className={`flex flex-col gap-2 rounded-xl border border-border/60 bg-background/60 p-3 shadow-[var(--shadow-xs)] transition-shadow hover:shadow-[var(--shadow-medium)] border-l-4 ${borderTone}`}
                                          >
                                            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                                              <div>
                                                <p className="text-sm font-semibold text-foreground">
                                                  {entry.serviceUserName || "Unknown service user"}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                  {entry.callTypeLabel} • {entry.timeBandLabel}
                                                </p>
                                              </div>
                                              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                                <Badge variant="outline" className="text-xs font-semibold">
                                                  Required {requiredLabel}
                                                </Badge>
                                                {hasSchedule ? (
                                                  <Badge variant="secondary" className="text-xs font-semibold">
                                                    Scheduled {scheduledStart} → {scheduledEnd}
                                                  </Badge>
                                                ) : (
                                                  <Badge variant="destructive" className="text-xs font-semibold">
                                                    No scheduled time
                                                  </Badge>
                                                )}
                                                {recommendedStart !== "—" &&
                                                  (entry.scheduledStartMinutes === null ||
                                                    entry.recommendedStartMinutes !== entry.scheduledStartMinutes) && (
                                                    <Badge variant="outline" className="text-xs font-semibold">
                                                      Recommended {recommendedStart}
                                                    </Badge>
                                                  )}
                                                <Badge variant="outline" className="text-xs font-semibold">
                                                  {shiftLabel}
                                                </Badge>
                                                {travelLabel && (
                                                  <Badge variant="outline" className="text-xs font-semibold">
                                                    {travelLabel}
                                                  </Badge>
                                                )}
                                                {entry.isDoubleUp && (
                                                  <Badge variant="outline" className="text-xs font-semibold">
                                                    Double-up (locked)
                                                  </Badge>
                                                )}
                                                {isBeforeDayStart && (
                                                  <Badge variant="destructive" className="text-xs font-semibold">
                                                    Before 06:00
                                                  </Badge>
                                                )}
                                                {isAfterSoftLimit && (
                                                  <Badge
                                                    variant="outline"
                                                    className="text-xs font-semibold border-warning/40 text-warning dark:text-warning"
                                                  >
                                                    After 22:00
                                                  </Badge>
                                                )}
                                                {isAfterHardLimit && (
                                                  <Badge variant="destructive" className="text-xs font-semibold">
                                                    After 23:00
                                                  </Badge>
                                                )}
                                                {entry.isTimeCritical && windowLabel && (
                                                  <Badge variant="outline" className="text-xs font-semibold">
                                                    Time critical {windowLabel}
                                                  </Badge>
                                                )}
                                                {entry.isOutsideWindow && (
                                                  <Badge variant="destructive" className="text-xs font-semibold">
                                                    Outside ±{TIME_CRITICAL_WINDOW_MINUTES} mins
                                                  </Badge>
                                                )}
                                                {entry.hasWindowConflict && (
                                                  <Badge variant="destructive" className="text-xs font-semibold">
                                                    Window conflict
                                                  </Badge>
                                                )}
                                              </div>
                                            </div>
                                            {hasSchedule && (
                                              <div className="mt-2">
                                                <div className="relative h-2 rounded-full bg-muted/50">
                                                  <div
                                                    className={`absolute h-2 rounded-full ${barTone}`}
                                                    style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                                                  />
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <p className="mt-3 text-xs text-muted-foreground">
                                      Select call groups in the Call Library to generate an optimized run.
                                    </p>
                                  )}
                                </div>
                              </TabsContent>
                            </Tabs>
                          </>
                        )}
                      </div>
                    </div>
                    </CardContent>
                  </Card>
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

            <AccordionItem value="row-level-analysis" className="mt-4 rounded-2xl border border-border/60 bg-card/60 px-5 shadow-soft hover-elevate border-b-0">
              <AccordionTrigger className="py-5 text-base font-semibold hover:no-underline transition-colors data-[state=open]:text-primary">
                Row-Level Analysis
              </AccordionTrigger>
              <AccordionContent>
                <Card>
                  <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <CardTitle>Row-Level Analysis</CardTitle>
                      <CardDescription>
                        Use filters to triage thousands of rows quickly. Showing {filteredResults.length.toLocaleString()} of {primaryRows.length.toLocaleString()} rows.
                      </CardDescription>
                    </div>
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      <Input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search row or keyword"
                        aria-label="Search rows by keyword"
                        className="pl-9 w-full md:w-64"
                      />
                    </div>
                    <div className="flex gap-2" role="group" aria-label="Filter by status">
                      <Button
                        type="button"
                        size="sm"
                        variant={filterStatus === "all" ? "default" : "secondary"}
                        onClick={() => setFilterStatus("all")}
                        aria-pressed={filterStatus === "all"}
                        aria-label="Show all rows"
                      >
                        All
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={filterStatus === "clean" ? "default" : "secondary"}
                        onClick={() => setFilterStatus("clean")}
                        aria-pressed={filterStatus === "clean"}
                        aria-label="Show only clean rows"
                      >
                        Clean
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={filterStatus === "attention" ? "default" : "secondary"}
                        onClick={() => setFilterStatus("attention")}
                        aria-pressed={filterStatus === "attention"}
                        aria-label="Show only rows needing attention"
                      >
                        Needs Attention
                      </Button>
                      {/* Save Filter Preset */}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        title="Save current filter as preset"
                        onClick={() => {
                          const presetName = prompt("Enter a name for this filter preset:");
                          if (presetName?.trim()) {
                            const newPreset = {
                              id: `preset-${Date.now()}`,
                              name: presetName.trim(),
                              status: filterStatus,
                              searchTerm,
                              showDuplicates: showDuplicateRows,
                              includeCancelled: includeCancelledCalls,
                              includeMismatched: includeMismatchedWorkers,
                            };
                            setFilterPresets((prev) => [...prev, newPreset]);
                            toast({
                              title: "Filter preset saved",
                              description: `"${presetName}" has been saved.`,
                            });
                          }
                        }}
                      >
                        <Save className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleExportFiltered}
                      disabled={!filteredResults.length}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Export filtered ({filteredResults.length})
                    </Button>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Switch id="toggle-duplicates" checked={showDuplicateRows} onCheckedChange={setShowDuplicateRows} />
                      <label htmlFor="toggle-duplicates" className="font-medium">
                        Show duplicate slot rows
                      </label>
                    </div>
                  </div>
                  {/* Filter Presets Row */}
                  {filterPresets.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-border/60">
                      <span className="text-xs text-muted-foreground uppercase tracking-wide">Presets:</span>
                      {filterPresets.map((preset) => (
                        <div key={preset.id} className="flex items-center gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="text-xs h-7"
                            onClick={() => {
                              setFilterStatus(preset.status);
                              setSearchTerm(preset.searchTerm);
                              setShowDuplicateRows(preset.showDuplicates);
                              setIncludeCancelledCalls(preset.includeCancelled);
                              setIncludeMismatchedWorkers(preset.includeMismatched);
                              toast({
                                title: "Filter preset loaded",
                                description: `Applied "${preset.name}"`,
                              });
                            }}
                          >
                            {preset.name}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              setFilterPresets((prev) => prev.filter((p) => p.id !== preset.id));
                            }}
                          >
                            ×
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div
                      ref={tableRef}
                      className="max-h-[480px] rounded-md border border-border/80 overflow-auto"
                      onScroll={(event) => setTableScrollTop(event.currentTarget.scrollTop)}
                    >
                      <table className="w-full text-sm">
                        <thead className="bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="px-4 py-3 w-16">Row</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Highlights</th>
                            <th className="px-4 py-3">Issues</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const rowHeight = 72;
                            const overscan = 8;
                            const totalRows = filteredResults.length;
                            const startIndex = Math.max(0, Math.floor(tableScrollTop / rowHeight) - overscan);
                            const endIndex = Math.min(
                              totalRows,
                              Math.ceil((tableScrollTop + tableViewportHeight) / rowHeight) + overscan
                            );
                            const visible = filteredResults.slice(startIndex, endIndex);
                            return (
                              <>
                                <tr style={{ height: `${startIndex * rowHeight}px` }}>
                                  <td colSpan={4} />
                                </tr>
                                {visible.map((row) => (
                                  <tr
                                    key={row.rowNumber}
                                    className="border-t border-border/60 hover:bg-muted/30 cursor-pointer"
                                    onClick={() => setSelectedRow(row)}
                                  >
                                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{row.rowNumber}</td>
                                    <td className="px-4 py-3">
                                      <Badge variant={row.status === "clean" ? "outline" : "destructive"}>
                                        {row.status === "clean" ? "Clean" : "Needs attention"}
                                      </Badge>
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="flex flex-wrap gap-1">
                                        {row.callTypeLabel && <Badge variant="outline">{row.callTypeLabel}</Badge>}
                                        {row.emptyFields.length > 0 && (
                                          <Badge variant="secondary">{row.emptyFields.length} empty</Badge>
                                        )}
                                        {row.numericWarnings.length > 0 && (
                                          <Badge variant="secondary">{row.numericWarnings.length} negative</Badge>
                                        )}
                                        {row.textWarnings.length > 0 && (
                                          <Badge variant="secondary">{row.textWarnings.length} long</Badge>
                                        )}
                                      </div>
                                      <div className="flex flex-wrap gap-2 mt-2">
                                        {typeof row.scheduleDeltaMinutes === "number" && (
                                          <InsightPill tone={row.scheduleFlag ? "destructive" : "default"}>
                                            Δ {formatSignedMinutes(row.scheduleDeltaMinutes)}
                                          </InsightPill>
                                        )}
                                        {typeof row.durationMatchPercent === "number" && (
                                          <InsightPill
                                            tone={
                                              row.durationFlag
                                                ? "destructive"
                                                : row.durationOverrunFlag
                                                ? "warning"
                                                : row.durationMatchPercent < 90
                                                ? "warning"
                                                : "default"
                                            }
                                          >
                                            {row.durationMatchPercent.toFixed(0)}% duration
                                          </InsightPill>
                                        )}
                                        {row.isDoubleUpSlot && row.doubleUpWorkers && (
                                          <InsightPill tone="default">
                                            Double-up: {row.doubleUpWorkers.join(", ")}
                                          </InsightPill>
                                        )}
                                        {row.isDuplicateSlotRow && !row.isDoubleUpSlot && (
                                          <InsightPill tone="warning">Duplicate slot</InsightPill>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">
                                      {row.issues.length ? row.issues.join(", ") : "No issues detected"}
                                    </td>
                                  </tr>
                                ))}
                                <tr style={{ height: `${Math.max(0, totalRows - endIndex) * rowHeight}px` }}>
                                  <td colSpan={4} />
                                </tr>
                              </>
                            );
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>

          {duplicateClusters.length > 0 && (
            <AccordionItem value="duplicate-slot-review" className="mt-4 rounded-2xl border border-border/60 bg-card/60 px-5 shadow-soft hover-elevate border-b-0">
              <AccordionTrigger className="py-5 text-base font-semibold hover:no-underline transition-colors data-[state=open]:text-primary">
                Duplicate Slot Review
              </AccordionTrigger>
              <AccordionContent>
                <Card>
                  <CardHeader>
                    <CardTitle>Duplicate Slot Review</CardTitle>
                    <CardDescription>
                      Multiple carers recorded for the same service user, date, and planned time. We kept the first row for metrics—review the rest here.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {duplicateClusters.map((cluster) => (
                      <div key={cluster.key} className="rounded-2xl border border-border/70 bg-card/50 p-4 space-y-3">
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Service User</p>
                            <p className="text-base font-semibold text-foreground">
                              {cluster.serviceUserName || "Unknown"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {(cluster.serviceUserArea || "Area unavailable").toString()} • {cluster.serviceUserAddress || "Address unavailable"}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Planned date: {cluster.plannedDateLabel || "—"} • Planned time: {cluster.plannedTimeLabel || "—"}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-xs font-semibold">
                            {cluster.rows.length} entries
                          </Badge>
                        </div>
                        <div className="space-y-2">
                          {cluster.rows.map((row) => (
                            <div
                              key={`${cluster.key}-${row.rowNumber}`}
                              className="rounded-xl border border-border/60 bg-background/60 p-3 text-sm"
                            >
                              <div className="flex flex-wrap items-center gap-2 justify-between">
                                <div className="flex flex-col">
                                  <span className="text-xs text-muted-foreground">Row #{row.rowNumber}</span>
                                  <span className="font-semibold">{row.actualWorker || row.plannedWorker || "Care worker unavailable"}</span>
                                </div>
                                <Badge variant={row.isDuplicateSlotRow ? "secondary" : "default"} className="text-xs">
                                  {row.isDuplicateSlotRow ? "Ignored duplicate" : "Used for metrics"}
                                </Badge>
                              </div>
                              <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                                <span>
                                  Planned {row.plannedTimeLabel || "—"} → Actual {row.actualTimeLabel || "—"}
                                </span>
                                <span>
                                  Duration {typeof row.durationMatchPercent === "number" ? `${row.durationMatchPercent.toFixed(0)}% of plan` : "—"}
                                </span>
                              </div>
                              {row.issues.length > 0 && (
                                <p className="mt-2 text-xs text-muted-foreground">
                                  {row.issues.join(" • ")}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </AccordionContent>
            </AccordionItem>
          )}

          {serviceUserStacks.length > 0 && (
            <AccordionItem
              id="tf-stacks"
              value="service-user-call-stacks"
              className="scroll-mt-24 mb-4 rounded-2xl border border-border/70 bg-card/60 px-5 shadow-[var(--shadow-xs)] border-b-0 overflow-hidden"
            >
              <AccordionTrigger className="py-5 text-base font-semibold hover:no-underline">Service User Call Stacks</AccordionTrigger>
              <AccordionContent className="pb-5">
                <Card className="border-0 bg-transparent shadow-none">
                  <CardHeader className="px-0 pt-0 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                      <CardTitle>Service User Call Stacks</CardTitle>
                      <CardDescription>
                        One box per service user. Expand to see call types, then expand again to see every call.
                      </CardDescription>
                    </div>
                    <div className="flex flex-col gap-3 w-full xl:w-auto sm:flex-row">
                      <div className="relative flex-1 sm:w-64">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          value={callGroupSearch}
                          onChange={(e) => setCallGroupSearch(e.target.value)}
                          placeholder="Search service users"
                          className="pl-9"
                        />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Switch
                          id="toggle-office-staff-pdf"
                          checked={excludeOfficeStaffFromPdf}
                          onCheckedChange={setExcludeOfficeStaffFromPdf}
                        />
                        <Label htmlFor="toggle-office-staff-pdf" className="font-medium">
                          Exclude office staff from PDF
                        </Label>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full sm:w-auto"
                        onClick={handleExportPdf}
                      >
                        <FileText className="h-4 w-4 mr-2" /> Export grouped PDF
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="px-0 pb-0 space-y-6">
                    {callGroupSearch.trim() && !hasSearchMatch && (
                      <p className="text-xs text-muted-foreground">
                        No direct match found — showing the nearest stacks instead.
                      </p>
                    )}

                    <Accordion type="single" collapsible className="w-full">
                      {visibleServiceUserStacks.map((stack) => {
                        const flaggedRows = stack.rows.filter((row) => row.scheduleFlag || row.durationFlag).length;
                        const driftValues = stack.rows
                          .map((row) =>
                            typeof row.scheduleDeltaMinutes === "number" ? Math.abs(row.scheduleDeltaMinutes) : null
                          )
                          .filter((value): value is number => value !== null);
                        const averageDrift = driftValues.length
                          ? driftValues.reduce((acc, val) => acc + val, 0) / driftValues.length
                          : null;
                        const durationValues = stack.rows
                          .map((row) =>
                            typeof row.durationMatchPercent === "number" ? row.durationMatchPercent : null
                          )
                          .filter((value): value is number => value !== null);
                        const averageDuration = durationValues.length
                          ? durationValues.reduce((acc, val) => acc + val, 0) / durationValues.length
                          : null;
                        const workerSet = new Set(
                          stack.rows
                            .map((row) => row.actualWorker || row.plannedWorker || undefined)
                            .filter((value): value is string => Boolean(value))
                        );

                        const callTypeGroups = (() => {
                          const map = new Map<
                            string,
                            {
                              key: string;
                              callTypeLabel: string;
                              plannedDurationMinutes: number | null;
                              rows: RowAnalysis[];
                            }
                          >();

                          stack.rows.forEach((row) => {
                            const normalizedType = normalizeCallTypeKey(row.callTypeLabel ?? null) || "unknown";
                            const durationBucket =
                              typeof row.plannedDurationMinutes === "number" && Number.isFinite(row.plannedDurationMinutes)
                                ? roundToNearest(row.plannedDurationMinutes, 5)
                                : null;
                            const groupKey = `${normalizedType}|dur-${durationBucket ?? "unknown"}`;
                            if (!map.has(groupKey)) {
                              map.set(groupKey, {
                                key: groupKey,
                                callTypeLabel: row.callTypeLabel || "Unknown",
                                plannedDurationMinutes: durationBucket,
                                rows: [],
                              });
                            }
                            map.get(groupKey)!.rows.push(row);
                          });

                          return Array.from(map.values())
                            .map((group) => ({
                              ...group,
                              rows: [...group.rows].sort((a, b) => {
                                const aDate = a.plannedDateKey || "";
                                const bDate = b.plannedDateKey || "";
                                if (aDate !== bDate) return aDate.localeCompare(bDate);
                                const aTime =
                                  typeof a.plannedTimeMinutes === "number" ? a.plannedTimeMinutes : Number.POSITIVE_INFINITY;
                                const bTime =
                                  typeof b.plannedTimeMinutes === "number" ? b.plannedTimeMinutes : Number.POSITIVE_INFINITY;
                                if (aTime !== bTime) return aTime - bTime;
                                return a.rowNumber - b.rowNumber;
                              }),
                            }))
                            .sort((a, b) =>
                              b.rows.length - a.rows.length || a.callTypeLabel.localeCompare(b.callTypeLabel)
                            );
                        })();

                        return (
                  <AccordionItem
                    key={stack.key}
                    value={stack.key}
                    className="rounded-2xl border border-border/70 bg-card/50 px-5"
                  >
                    <AccordionTrigger className="py-5">
                      <div className="flex flex-1 flex-col gap-3 text-left lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Service User</p>
                          <p className="text-xl font-semibold text-foreground">
                            {stack.serviceUserName || "Unknown service user"}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {(stack.serviceUserArea || "Area unavailable").toString()} • {stack.serviceUserAddress || "Address unavailable"}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline" className="text-xs font-semibold">
                            {stack.rows.length} call{stack.rows.length === 1 ? "" : "s"}
                          </Badge>
                          <Badge variant={flaggedRows ? "destructive" : "secondary"} className="text-xs font-semibold">
                            {flaggedRows} flagged
                          </Badge>
                          <Badge variant="secondary" className="text-xs font-semibold">
                            {workerSet.size || 1} carer{workerSet.size === 1 ? "" : "s"}
                          </Badge>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-5">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <GroupMetric
                          label="Avg Schedule Drift"
                          value={formatMinutesDisplay(averageDrift)}
                          helper="Absolute delta"
                          tone={
                            averageDrift !== null && averageDrift > 120
                              ? "destructive"
                              : averageDrift !== null && averageDrift > 90
                              ? "warning"
                              : "default"
                          }
                        />
                        <GroupMetric
                          label="Avg Duration Fidelity"
                          value={averageDuration !== null ? `${averageDuration.toFixed(0)}%` : "—"}
                          helper="Actual vs planned"
                          tone={
                            averageDuration !== null && averageDuration < 80
                              ? "destructive"
                              : averageDuration !== null && averageDuration > 120
                              ? "warning"
                              : averageDuration !== null && averageDuration < 90
                              ? "warning"
                              : "default"
                          }
                        />
                        <GroupMetric
                          label="Issue Density"
                          value={stack.rows.length ? `${Math.round((flaggedRows / stack.rows.length) * 100)}%` : "0%"}
                          helper="Flagged rows in stack"
                          tone={
                            flaggedRows
                              ? flaggedRows / stack.rows.length > 0.5
                                ? "destructive"
                                : "warning"
                              : "default"
                          }
                        />
                      </div>

                      <div className="mt-4">
                        <Accordion type="single" collapsible className="w-full">
                          {callTypeGroups.map((group) => {
                            const groupFlagged = group.rows.filter((row) => row.scheduleFlag || row.durationFlag).length;
                            const groupDriftValues = group.rows
                              .map((row) => (typeof row.scheduleDeltaMinutes === "number" ? Math.abs(row.scheduleDeltaMinutes) : null))
                              .filter((value): value is number => value !== null);
                            const groupAverageDrift = groupDriftValues.length
                              ? groupDriftValues.reduce((acc, val) => acc + val, 0) / groupDriftValues.length
                              : null;
                            const groupDurationValues = group.rows
                              .map((row) => (typeof row.durationMatchPercent === "number" ? row.durationMatchPercent : null))
                              .filter((value): value is number => value !== null);
                            const groupAverageDuration = groupDurationValues.length
                              ? groupDurationValues.reduce((acc, val) => acc + val, 0) / groupDurationValues.length
                              : null;

                            return (
                              <AccordionItem key={`${stack.key}-${group.key}`} value={`${stack.key}-${group.key}`} className="border-border/60">
                                <AccordionTrigger className="py-4">
                                  <div className="flex flex-1 flex-col gap-2 text-left sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                      <p className="text-sm font-semibold text-foreground">{group.callTypeLabel}</p>
                                      <p className="text-xs text-muted-foreground">
                                        Planned duration: {group.plannedDurationMinutes !== null ? formatMinutesDisplay(group.plannedDurationMinutes) : "—"}
                                      </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      <Badge variant="outline" className="text-xs font-semibold">
                                        {group.rows.length} call{group.rows.length === 1 ? "" : "s"}
                                      </Badge>
                                      <Badge variant={groupFlagged ? "destructive" : "secondary"} className="text-xs font-semibold">
                                        {groupFlagged} flagged
                                      </Badge>
                                      <Badge variant="secondary" className="text-xs font-semibold">
                                        Avg drift {formatMinutesDisplay(groupAverageDrift)}
                                      </Badge>
                                    </div>
                                  </div>
                                </AccordionTrigger>
                                <AccordionContent className="pb-4">
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <GroupMetric
                                      label="Avg Schedule Drift"
                                      value={formatMinutesDisplay(groupAverageDrift)}
                                      helper="Within this call type"
                                      tone={
                                        groupAverageDrift !== null && groupAverageDrift > 120
                                          ? "destructive"
                                          : groupAverageDrift !== null && groupAverageDrift > 90
                                          ? "warning"
                                          : "default"
                                      }
                                    />
                                    <GroupMetric
                                      label="Avg Duration Fidelity"
                                      value={groupAverageDuration !== null ? `${groupAverageDuration.toFixed(0)}%` : "—"}
                                      helper="Within this call type"
                                      tone={
                                        groupAverageDuration !== null && groupAverageDuration < 80
                                          ? "destructive"
                                          : groupAverageDuration !== null && groupAverageDuration > 120
                                          ? "warning"
                                          : groupAverageDuration !== null && groupAverageDuration < 90
                                          ? "warning"
                                          : "default"
                                      }
                                    />
                                  </div>

                                  <div className="mt-4 space-y-3">
                                    {group.rows.map((row, idx) => (
                                      <div
                                        key={`${stack.key}-${group.key}-${row.rowNumber}`}
                                        className="rounded-xl border border-border/60 bg-background/60 p-4 space-y-2"
                                      >
                                        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                                          <div>
                                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Call {idx + 1}</p>
                                            <p className="font-semibold text-sm">
                                              {row.actualWorker || row.plannedWorker || "Care worker unavailable"}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                              {(row.plannedDateLabel ? `${row.plannedDateLabel} ` : "") + (row.plannedTimeLabel || "—")} → {row.actualTimeLabel || "—"}
                                            </p>
                                          </div>
                                          <div className="flex flex-wrap gap-2">
                                            {typeof row.scheduleDeltaMinutes === "number" && (
                                              <InsightPill tone={row.scheduleFlag ? "destructive" : "default"}>
                                                Δ {formatSignedMinutes(row.scheduleDeltaMinutes)}
                                              </InsightPill>
                                            )}
                                            {typeof row.durationMatchPercent === "number" && (
                                              <InsightPill
                                                tone={
                                                  row.durationFlag
                                                    ? "destructive"
                                                    : row.durationOverrunFlag
                                                    ? "warning"
                                                    : row.durationMatchPercent < 90
                                                    ? "warning"
                                                    : "default"
                                                }
                                              >
                                                {row.durationMatchPercent.toFixed(0)}% duration
                                              </InsightPill>
                                            )}
                                            {row.status === "attention" && (
                                              <InsightPill tone="warning">Manual review</InsightPill>
                                            )}
                                          </div>
                                        </div>
                                        {row.issues.length > 0 && (
                                          <p className="text-xs text-muted-foreground">{row.issues.join(" • ")}</p>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            );
                          })}
                        </Accordion>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>

            {serviceUserStacks.length > visibleServiceUserStacks.length && !callGroupSearch.trim() && (
              <p className="text-xs text-muted-foreground">
                Showing {visibleServiceUserStacks.length} stacks. Use search to find a specific service user.
              </p>
            )}
            {callGroupSearch.trim() && !hasSearchMatch && (
              <p className="text-xs text-muted-foreground">
                Showing {visibleServiceUserStacks.length} closest match{visibleServiceUserStacks.length === 1 ? "" : "es"}.
              </p>
            )}
          </CardContent>
        </Card>
              </AccordionContent>
            </AccordionItem>
          )}

          {selectedRow && (
            <AccordionItem value="selected-row-details" className="mt-4 rounded-2xl border border-border/60 bg-card/60 px-5 shadow-soft hover-elevate border-b-0">
              <AccordionTrigger className="py-5 text-base font-semibold hover:no-underline transition-colors data-[state=open]:text-primary">
                Selected Row Details (Row {selectedRow.rowNumber})
              </AccordionTrigger>
              <AccordionContent>
                <Card>
                  <CardHeader>
                    <CardTitle>Row {selectedRow.rowNumber} Details</CardTitle>
                    <CardDescription>Full payload plus issues detected.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {selectedRow.isDuplicateSlotRow && (
                      <Alert variant="destructive">
                        <AlertTitle>Duplicate care slot</AlertTitle>
                        <AlertDescription>
                          Another row with the same service user, planned date, and planned time already counts toward the metrics. This entry is shown for context only.
                        </AlertDescription>
                      </Alert>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {selectedRow.callTypeLabel && <Badge variant="outline">Call: {selectedRow.callTypeLabel}</Badge>}
                      {selectedRow.emptyFields.length > 0 && (
                        <Badge variant="secondary">Empty: {selectedRow.emptyFields.join(", ")}</Badge>
                      )}
                      {selectedRow.numericWarnings.length > 0 && (
                        <Badge variant="secondary">Negative: {selectedRow.numericWarnings.join(", ")}</Badge>
                      )}
                      {selectedRow.textWarnings.length > 0 && (
                        <Badge variant="secondary">Long Text: {selectedRow.textWarnings.join(", ")}</Badge>
                      )}
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <DiagnosticStat
                        title="Schedule Delta"
                        value={
                          typeof selectedRow.scheduleDeltaMinutes === "number"
                            ? formatSignedMinutes(selectedRow.scheduleDeltaMinutes)
                            : "No timing data"
                        }
                        helper={
                          selectedRow.workersMatch === false
                            ? "Different carer delivered this visit."
                            : selectedRow.scheduleFlag
                            ? "Same carer drifted more than 2 hours."
                            : "Within the 2 hour tolerance."
                        }
                        tone={
                          typeof selectedRow.scheduleDeltaMinutes !== "number"
                            ? "warning"
                            : selectedRow.scheduleFlag
                            ? "destructive"
                            : Math.abs(selectedRow.scheduleDeltaMinutes) > 90
                            ? "warning"
                            : "default"
                        }
                        meta={[
                          { label: "Planned", value: selectedRow.plannedTimeLabel || "—" },
                          { label: "Actual", value: selectedRow.actualTimeLabel || "—" },
                          { label: "Carer", value: formatWorkersMatch(selectedRow.workersMatch) },
                        ]}
                      />
                      <DiagnosticStat
                        title="Duration Fidelity"
                        value={
                          typeof selectedRow.durationMatchPercent === "number"
                            ? `${selectedRow.durationMatchPercent.toFixed(1)}%`
                            : "No duration data"
                        }
                        helper={
                          selectedRow.durationFlag
                            ? "Actual duration delivered under 80% of the plan."
                            : selectedRow.durationOverrunFlag
                            ? "Actual duration exceeded 120% of the plan."
                            : typeof selectedRow.durationMatchPercent === "number"
                            ? "Actual vs planned duration."
                            : "Provide planned & actual duration columns."
                        }
                        tone={
                          typeof selectedRow.durationMatchPercent !== "number"
                            ? "warning"
                            : selectedRow.durationFlag
                            ? "destructive"
                            : selectedRow.durationOverrunFlag
                            ? "warning"
                            : selectedRow.durationMatchPercent < 90
                            ? "warning"
                            : "default"
                        }
                        meta={[
                          {
                            label: "Planned",
                            value:
                              typeof selectedRow.plannedDurationMinutes === "number"
                                ? formatMinutesDisplay(selectedRow.plannedDurationMinutes)
                                : "—",
                          },
                          {
                            label: "Actual",
                            value:
                              typeof selectedRow.actualDurationMinutes === "number"
                                ? formatMinutesDisplay(selectedRow.actualDurationMinutes)
                                : "—",
                          },
                          {
                            label: "Delta",
                            value:
                              typeof selectedRow.durationMatchPercent === "number"
                                ? formatDurationDelta(selectedRow.durationMatchPercent)
                                : "—",
                          },
                        ]}
                      />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {Object.entries(selectedRow.data).map(([key, value], index) => (
                        <div key={`${key}-${index}`} className="rounded border border-border/80 p-3 text-sm">
                          <p className="text-xs uppercase text-muted-foreground">{normalizeColumnLabel(key, index)}</p>
                          <p className="mt-1 break-words">{String(value ?? "").trim() || "—"}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      )}

      </section>

    </div>
  );
}

type InsightTone = "default" | "warning" | "destructive";

const toneSurfaceMap: Record<InsightTone, string> = {
  default:
    "border-success/30 bg-gradient-to-br from-emerald-500/10 via-background/80 to-background shadow-soft backdrop-blur-xl",
  warning:
    "border-warning/30 bg-gradient-to-br from-warning/10 via-background/80 to-background shadow-soft backdrop-blur-xl",
  destructive:
    "border-destructive/30 bg-gradient-to-br from-red-500/10 via-background/80 to-background shadow-soft backdrop-blur-xl",
};

const toneTextMap: Record<InsightTone, string> = {
  default: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
};

const toneGlowMap: Record<InsightTone, string> = {
  default: "from-emerald-400/50 via-emerald-400/15 to-transparent",
  warning: "from-warning/50 via-warning/15 to-transparent",
  destructive: "from-red-400/50 via-red-400/15 to-transparent",
};

const toneBarMap: Record<InsightTone, string> = {
  default: "from-emerald-400/80 via-emerald-400/40 to-transparent",
  warning: "from-warning/80 via-warning/40 to-transparent",
  destructive: "from-red-400/80 via-red-400/40 to-transparent",
};

function TimingStat({
  title,
  value,
  helper,
  tone,
  badge,
}: {
  title: string;
  value: string;
  helper: string;
  tone: InsightTone;
  badge?: string;
}) {
  return (
    <div className={`group relative overflow-hidden rounded-2xl border p-4 ${toneSurfaceMap[tone]} hover-elevate`}>
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r ${toneGlowMap[tone]} opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
      />
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="flex items-baseline gap-2 mt-2">
        <span className="text-2xl font-semibold text-foreground">{value}</span>
        {badge && <span className={`text-xs font-semibold ${toneTextMap[tone]}`}>{badge}</span>}
      </div>
      <p className="text-xs text-muted-foreground mt-1">{helper}</p>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  helper,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <Card className="group relative overflow-hidden border-border/70 bg-background/70 shadow-soft hover-elevate shimmer">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.12),transparent_55%)]" />
      <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-primary/15 blur-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-primary/40 via-primary/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <CardHeader className="relative z-10 flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            {icon}
          </div>
          <CardTitle className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {label}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="relative z-10">
        <div className="text-3xl font-semibold text-foreground tracking-tight">{value}</div>
        {helper && <p className="text-xs text-muted-foreground/80 mt-2">{helper}</p>}
      </CardContent>
    </Card>
  );
}

function GroupMetric({
  label,
  value,
  helper,
  tone = "default",
}: {
  label: string;
  value: string;
  helper: string;
  tone?: InsightTone;
}) {
  return (
    <div className={`group relative overflow-hidden rounded-2xl border px-4 py-3 ${toneSurfaceMap[tone]} hover-elevate`}>
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r ${toneGlowMap[tone]} opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
      />
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-foreground mt-1">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{helper}</p>
    </div>
  );
}

function HealthStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/70 px-3 py-2 shadow-soft hover-elevate shimmer">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function QualityDimensionCard({
  title,
  score,
  grade,
  description,
  icon,
  details,
}: {
  title: string;
  score: number;
  grade: string;
  description: string;
  icon: ReactNode;
  details: string[];
}) {
  const tone: InsightTone = score >= 70 ? "default" : score >= 55 ? "warning" : "destructive";
  const gradeColor =
    grade === "A" ? "text-success" :
    grade === "B" ? "text-primary" :
    grade === "C" ? "text-warning" :
    grade === "D" ? "text-warning" :
    "text-destructive";

  return (
    <div className={`group relative overflow-hidden rounded-2xl border p-4 ${toneSurfaceMap[tone]} hover-elevate`}>
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r ${toneGlowMap[tone]} opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
      />
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <span className="text-xs uppercase tracking-wide">{title}</span>
        </div>
        <span className={`text-2xl font-semibold ${gradeColor}`}>{grade}</span>
      </div>
      <div className="mt-3">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold text-foreground">{score}</span>
          <span className="text-sm text-muted-foreground">/100</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>
      <div className="mt-3 pt-3 border-t border-border/50 space-y-1">
        {details.map((detail, idx) => (
          <p key={idx} className="text-xs text-muted-foreground">{detail}</p>
        ))}
      </div>
    </div>
  );
}

function StatInsightCard({
  label,
  primary,
  secondary,
}: {
  label: string;
  primary: string;
  secondary?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/70 p-3 shadow-soft hover-elevate shimmer">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground mt-1">{primary}</p>
      {secondary && <p className="text-xs text-muted-foreground">{secondary}</p>}
    </div>
  );
}

function RateMetric({
  label,
  value,
  target,
  description,
}: {
  label: string;
  value: number;
  target: number;
  description: string;
}) {
  const isAboveTarget = value >= target;
  const tone: InsightTone = value >= target ? "default" : value >= target * 0.8 ? "warning" : "destructive";
  const progressColor = isAboveTarget 
    ? "bg-success/10" 
    : value >= target * 0.8 
    ? "bg-warning/100" 
    : "bg-destructive/10";

  return (
    <div className={`rounded-2xl border p-4 ${toneSurfaceMap[tone]} hover-elevate`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        <div className="text-right">
          <span className={`text-2xl font-semibold ${toneTextMap[tone]}`}>{value}%</span>
          <p className="text-[10px] text-muted-foreground">Target: {target}%</p>
        </div>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-background/50">
        <div
          className={`h-full rounded-full ${progressColor} transition-all duration-500`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>0%</span>
        <span className={isAboveTarget ? "text-success" : ""}>
          {isAboveTarget ? "✓ On target" : `${target - value}% below target`}
        </span>
        <span>100%</span>
      </div>
    </div>
  );
}

function AnomalyRow({
  label,
  count,
  description,
  severity,
}: {
  label: string;
  count: number;
  description: string;
  severity: "high" | "medium" | "low";
}) {
  const tone: InsightTone = severity === "high" ? "destructive" : severity === "medium" ? "warning" : "default";
  const severityLabel = severity === "high" ? "High" : severity === "medium" ? "Medium" : "Low";

  return (
    <div className={`group relative overflow-hidden rounded-2xl border px-4 py-3 ${toneSurfaceMap[tone]} hover-elevate`}>
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r ${toneGlowMap[tone]} opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
      />
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Zap className={`h-3.5 w-3.5 ${toneTextMap[tone]}`} />
            <p className="text-sm font-medium text-foreground">{label}</p>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </div>
        <div className="text-right">
          <Badge variant="outline" className={toneTextMap[tone]}>
            {count.toLocaleString()}
          </Badge>
          <p className="text-[10px] text-muted-foreground mt-1">{severityLabel} severity</p>
        </div>
      </div>
    </div>
  );
}

function ComparisonMetric({
  label,
  baseline,
  current,
  format,
  higherIsBetter,
}: {
  label: string;
  baseline: number;
  current: number;
  format: (value: number) => string;
  higherIsBetter: boolean;
}) {
  const diff = current - baseline;
  const percentChange = baseline !== 0 ? Math.abs((diff / baseline) * 100) : 0;
  const isImproved = higherIsBetter ? diff > 0 : diff < 0;
  const isRegressed = higherIsBetter ? diff < 0 : diff > 0;
  const isUnchanged = diff === 0;

  const trendColor = isUnchanged
    ? "text-muted-foreground"
    : isImproved
    ? "text-success"
    : "text-destructive";

  const trendIcon = isUnchanged ? "→" : isImproved ? "↑" : "↓";
  const trendBg = isUnchanged
    ? "bg-muted/50"
    : isImproved
    ? "bg-success/10"
    : "bg-destructive/10";

  return (
    <div className={`rounded-2xl border border-border/70 p-4 shadow-soft hover-elevate shimmer ${trendBg}`}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-2xl font-semibold text-foreground">{format(current)}</span>
        <div className={`flex items-center gap-1 text-sm font-medium ${trendColor}`}>
          <span>{trendIcon}</span>
          {!isUnchanged && <span>{percentChange.toFixed(0)}%</span>}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>Baseline: {format(baseline)}</span>
        {!isUnchanged && (
          <span className={trendColor}>
            {diff > 0 ? "+" : ""}{format(diff)}
          </span>
        )}
      </div>
    </div>
  );
}

function IssueBreakdownRow({
  label,
  count,
  base,
  helper,
}: {
  label: string;
  count: number;
  base: number;
  helper: string;
}) {
  const percent = base > 0 ? Math.round((count / base) * 100) : 0;
  const tone: InsightTone = percent >= 40 ? "destructive" : percent >= 20 ? "warning" : "default";

  return (
    <div className={`group relative overflow-hidden rounded-2xl border px-4 py-3 ${toneSurfaceMap[tone]} hover-elevate`}>
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r ${toneGlowMap[tone]} opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
      />
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">
            {count.toLocaleString()} of {base.toLocaleString()} {helper.toLowerCase()}
          </p>
        </div>
        <Badge variant="outline" className={toneTextMap[tone]}>
          {percent}%
        </Badge>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-border/50">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${toneBarMap[tone]}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function CoverageStat({
  label,
  count,
  total,
}: {
  label: string;
  count: number;
  total: number;
}) {
  const percent = total > 0 ? Math.round((count / total) * 100) : null;
  const percentValue = percent ?? 0;
  const tone: InsightTone =
    percent === null
      ? "warning"
      : percent < 50
      ? "destructive"
      : percent < 75
      ? "warning"
      : "default";

  return (
    <div className={`group relative overflow-hidden rounded-2xl border px-4 py-3 ${toneSurfaceMap[tone]} hover-elevate`}>
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r ${toneGlowMap[tone]} opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
      />
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="text-lg font-semibold text-foreground">{percent !== null ? `${percent}%` : "—"}</span>
        {percent !== null && (
          <span className="text-xs text-muted-foreground">
            {count}/{total}
          </span>
        )}
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-border/50">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${toneBarMap[tone]}`}
          style={{ width: `${percentValue}%` }}
        />
      </div>
    </div>
  );
}

function DiagnosticStat({
  title,
  value,
  helper,
  meta,
  tone,
}: {
  title: string;
  value: string;
  helper: string;
  meta: { label: string; value: string }[];
  tone: InsightTone;
}) {
  return (
    <div className={`group relative overflow-hidden rounded-2xl border p-4 ${toneSurfaceMap[tone]} hover-elevate`}>
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r ${toneGlowMap[tone]} opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
      />
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="text-2xl font-semibold text-foreground mt-1">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{helper}</p>
      <div className="mt-3 space-y-1 text-xs">
        {meta.map(({ label, value: metaValue }) => (
          <div className="flex items-center justify-between" key={`${label}-${metaValue}`}>
            <span className="text-muted-foreground">{label}</span>
            <span className="text-foreground font-medium">{metaValue}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InsightPill({ tone = "default", children }: { tone?: InsightTone; children: ReactNode }) {
  const toneClass: Record<InsightTone, string> = {
    default: "bg-success/10 text-success",
    warning: "bg-warning/100/15 text-warning",
    destructive: "bg-destructive/10 text-destructive",
  };
  return (
    <span
      className={`text-xs font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1 border border-white/10 shadow-soft backdrop-blur ${toneClass[tone]}`}
    >
      {children}
    </span>
  );
}

function detectField(
  row: Record<string, any>,
  keywords: string[],
  excludeKeys?: Set<string>
): DetectedField {
  if (!keywords.length) return null;
  const normalizedKeywords = keywords.map((keyword) => keyword.toLowerCase());
  for (const key of Object.keys(row)) {
    if (excludeKeys?.has(key)) continue;
    const normalizedKey = normalizeKeyForMatch(key);
    if (normalizedKeywords.some((keyword) => normalizedKey.includes(keyword))) {
      return { key, value: row[key] };
    }
  }
  return null;
}

function detectDateField(
  row: Record<string, any>,
  keywords: string[],
  excludeKeys?: Set<string>
): DetectedField {
  if (!keywords.length) return null;
  const normalizedKeywords = keywords.map((keyword) => keyword.toLowerCase());
  for (const key of Object.keys(row)) {
    if (excludeKeys?.has(key)) continue;
    const normalizedKey = normalizeKeyForMatch(key);

    // Avoid picking date component columns like "Planned Start Date Year" which would
    // parse as Jan 1st of that year for every row.
    if (
      normalizedKey.includes(" year") ||
      normalizedKey.endsWith(" year") ||
      normalizedKey.includes(" month") ||
      normalizedKey.endsWith(" month") ||
      normalizedKey.includes(" weekday") ||
      normalizedKey.includes(" week")
    ) {
      continue;
    }

    if (normalizedKeywords.some((keyword) => normalizedKey.includes(keyword))) {
      return { key, value: row[key] };
    }
  }
  return null;
}

function normalizeKeyForMatch(label: string) {
  return label
    .replace(/[\s_-]+/g, " ")
    .trim()
    .toLowerCase();
}

function isWorkerRelatedColumnKey(key: string): boolean {
  const normalized = normalizeKeyForMatch(key);
  return (
    normalized.includes("employee") ||
    normalized.includes("worker") ||
    normalized.includes("carer") ||
    normalized.includes("care worker") ||
    normalized.includes("staff")
  );
}

function detectFieldExcludingWorkerColumns(
  row: Record<string, any>,
  keywords: string[],
  excludeKeys?: Set<string>
): DetectedField {
  if (!keywords.length) return null;
  const normalizedKeywords = keywords.map((keyword) => keyword.toLowerCase());
  for (const key of Object.keys(row)) {
    if (excludeKeys?.has(key)) continue;
    if (isWorkerRelatedColumnKey(key)) continue;
    const normalizedKey = normalizeKeyForMatch(key);
    if (normalizedKeywords.some((keyword) => normalizedKey.includes(keyword))) {
      return { key, value: row[key] };
    }
  }
  return null;
}

function sanitizeStringValue(value: any): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function sanitizeHumanReadable(value: any): string | null {
  const text = sanitizeStringValue(value);
  if (!text) return null;
  return text.replace(/\s+/g, " ").trim();
}

function isTruthyValue(value: any): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value).trim().toLowerCase();
  if (!text) return false;
  return ["true", "yes", "y", "1", "t", "checked"].includes(text);
}

function parseTimeToMinutes(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const excelMinutes = excelSerialToMinutes(value);
    if (excelMinutes !== null) return excelMinutes;
    // Fallback for Excel/CSV numeric date-times when SSF parser is unavailable.
    // Excel stores date-times as days since an epoch; fractional part is time-of-day.
    const fraction = value - Math.floor(value);
    if (fraction >= 0 && fraction < 1) {
      return fraction * 24 * 60;
    }
    if (value <= 24) {
      return value * 60;
    }
    if (value > 24 && value <= 24 * 60) {
      return value;
    }
  }
  const str = String(value).trim();
  if (!str) return null;

  // Prefer our own date parsing to handle formats like DD/MM/YYYY HH:MM:SS.
  const parsedDate = parseDateValue(str);
  if (parsedDate) {
    return parsedDate.getHours() * 60 + parsedDate.getMinutes() + parsedDate.getSeconds() / 60;
  }

  const dateValue = Date.parse(str);
  if (!Number.isNaN(dateValue)) {
    const date = new Date(dateValue);
    return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  }
  const timeMatch = str.match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm)?$/i);
  if (timeMatch) {
    let hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2] ?? "0");
    const seconds = Number(timeMatch[3] ?? "0");
    const meridiem = timeMatch[4]?.toLowerCase();
    if (meridiem === "pm" && hours < 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;
    return hours * 60 + minutes + seconds / 60;
  }
  return null;
}

function parseDurationToMinutes(value: any, label?: string | null): number | null {
  if (value === null || value === undefined || value === "") return null;
  const normalizedLabel = label ? normalizeKeyForMatch(label) : "";
  const prefersHours = normalizedLabel.includes("hour");
  const prefersMinutes = normalizedLabel.includes("min");
  const prefersSeconds = normalizedLabel.includes("sec") || normalizedLabel.includes("second");

  const clampReasonableDuration = (minutes: number): number | null => {
    if (!Number.isFinite(minutes) || minutes < 0) return null;
    // Care calls should not be multiple hours long; treat very large values as mis-parsed.
    // (Keeps the trends from recommending nonsense like 13 hours for a 30-minute visit.)
    if (minutes > 8 * 60) return null;
    return minutes;
  };

  const parseNumericDuration = (numericValue: number): number | null => {
    if (!Number.isFinite(numericValue)) return null;
    if (numericValue < 0) return null;

    if (prefersSeconds) return clampReasonableDuration(numericValue / 60);
    if (prefersMinutes) return clampReasonableDuration(numericValue);
    if (prefersHours) return clampReasonableDuration(numericValue * 60);

    const minutesFromHoursRaw = numericValue * 60;
    const minutesFromDayRaw = numericValue * 24 * 60;
    const minutesFromHours = clampReasonableDuration(minutesFromHoursRaw);
    const minutesFromMinutes = clampReasonableDuration(numericValue);
    const minutesFromDayFraction = clampReasonableDuration(minutesFromDayRaw);
    const isFractional = numericValue > 0 && numericValue < 1;

    if (isFractional) {
      const hoursScore = Math.abs(minutesFromHoursRaw - Math.round(minutesFromHoursRaw));
      const dayScore = Math.abs(minutesFromDayRaw - Math.round(minutesFromDayRaw));
      if (minutesFromDayFraction !== null && dayScore + 0.01 < hoursScore) {
        return minutesFromDayFraction;
      }
      if (minutesFromHours !== null) return minutesFromHours;
      if (minutesFromDayFraction !== null) return minutesFromDayFraction;
      if (minutesFromMinutes !== null) return minutesFromMinutes;
      return null;
    }

    if (numericValue <= 12 && minutesFromHours !== null) {
      return minutesFromHours;
    }
    if (minutesFromMinutes !== null) return minutesFromMinutes;

    const excelMinutes = excelSerialToMinutes(numericValue);
    if (excelMinutes !== null) return clampReasonableDuration(excelMinutes);
    return null;
  };

  if (typeof value === "number" && Number.isFinite(value)) {
    return parseNumericDuration(value);
  }

  const str = String(value).trim();
  if (!str) return null;

  const timePattern = str.match(/(?:(\d+(?:\.\d+)?)\s*h(?:ours?)?)?\s*(\d+(?:\.\d+)?)?\s*m(?:in(?:utes)?)?/i);
  if (timePattern) {
    const hoursPortion = timePattern[1] ? parseFloat(timePattern[1]) : 0;
    const minutesPortion = timePattern[2] ? parseFloat(timePattern[2]) : 0;
    if (hoursPortion || minutesPortion) {
      return hoursPortion * 60 + minutesPortion;
    }
  }

  const hhmmss = str.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (hhmmss) {
    const hours = Number(hhmmss[1]);
    const minutes = Number(hhmmss[2]);
    const seconds = Number(hhmmss[3]);
    const total = hours * 60 + minutes + seconds / 60;
    return clampReasonableDuration(total);
  }

  const twoPart = str.match(/^(\d{1,2}):(\d{2})$/);
  if (twoPart) {
    const first = Number(twoPart[1]);
    const second = Number(twoPart[2]);
    // Ambiguous formats:
    // - Could be HH:MM (e.g., 00:30 meaning 30 minutes)
    // - Could be MM:SS (e.g., 13:55 meaning 13 minutes 55 seconds)
    const asHoursMinutes = first * 60 + second;
    const asMinutesSeconds = first + second / 60;

    if (prefersSeconds) {
      return clampReasonableDuration(asMinutesSeconds);
    }

    // Heuristic: if HH:MM would imply an implausibly long care call, treat it as MM:SS.
    if (asHoursMinutes > 6 * 60 && asMinutesSeconds <= 6 * 60) {
      return clampReasonableDuration(asMinutesSeconds);
    }

    return clampReasonableDuration(asHoursMinutes);
  }

  const numeric = Number(str.replace(/[^0-9.]/g, ""));
  if (!Number.isNaN(numeric)) {
    return parseNumericDuration(numeric);
  }

  return null;
}

function computeDurationFromTimes(startMinutes: number | null, endMinutes: number | null): number | null {
  if (typeof startMinutes !== "number" || typeof endMinutes !== "number") return null;
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) return null;

  let diff = endMinutes - startMinutes;
  // Handle midnight wrap (rare for care calls, but avoids negative durations)
  if (diff < 0) {
    diff += 24 * 60;
  }

  // Basic sanity clamp
  if (!Number.isFinite(diff) || diff <= 0) return null;
  if (diff > 8 * 60) return null;
  return diff;
}

function excelSerialToMinutes(value: number): number | null {
  const parser = (RawXLSX as any).SSF?.parse_date_code;
  if (typeof parser !== "function") return null;
  const parts = parser(value);
  if (!parts) return null;
  const hours = (parts.H ?? parts.h ?? 0) as number;
  const minutes = (parts.M ?? parts.m ?? 0) as number;
  const seconds = (parts.S ?? parts.s ?? 0) as number;
  return hours * 60 + minutes + seconds / 60;
}

function deriveTimeLabel(minutes: number | null, raw: any): string | null {
  if (minutes === null || Number.isNaN(minutes)) {
    return sanitizeStringValue(raw);
  }
  const normalized = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hrs = Math.floor(normalized / 60);
  const mins = Math.round(normalized % 60);
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

function formatMinutesDisplay(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  const hours = Math.floor(abs / 60);
  const minutes = Math.round(abs % 60);
  const parts: string[] = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (!parts.length) parts.push("0m");
  return parts.join(" ");
}

function formatSignedMinutes(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  const magnitude = formatMinutesDisplay(value);
  if (value === 0) return magnitude;
  return `${value > 0 ? "+" : "-"}${magnitude}`;
}

function formatBytes(bytes: number): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  let unitIndex = 0;
  let value = bytes;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const decimals = unitIndex === 0 ? 0 : value < 10 ? 2 : 1;
  return `${value.toFixed(decimals)} ${units[unitIndex]}`;
}

function formatDurationDelta(percent: number): string {
  const delta = percent - 100;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}% vs plan`;
}

function formatWorkersMatch(match: boolean | null): string {
  if (match === true) return "Same carer";
  if (match === false) return "Different carer";
  return "Unknown";
}

function normalizeWorkerName(value: string | null): string | null {
  if (!value) return null;
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeCallTypeKey(value: string | null): string | null {
  if (!value) return null;
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function calculateMedian(values: number[]): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function deriveTimeBandLabel(minutes: number | null): string {
  if (minutes === null || Number.isNaN(minutes)) return "Unscheduled";
  const normalized = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  if (normalized >= 4 * 60 && normalized < 11 * 60) return "AM";
  if (normalized >= 11 * 60 && normalized < 14 * 60) return "Lunch";
  if (normalized >= 14 * 60 && normalized < 17 * 60) return "Tea";
  if (normalized >= 17 * 60 && normalized < 20 * 60) return "Evening";
  return "Night";
}

function parsePersonNameForSort(name: string | null | undefined): { last: string; first: string; full: string } {
  const full = (name ?? "").toString().replace(/\s+/g, " ").trim().toLowerCase();
  if (!full) return { last: "", first: "", full: "" };

  // Handle common formats:
  // - "Last, First"
  // - "First Middle Last"
  if (full.includes(",")) {
    const [lastRaw, restRaw] = full.split(",", 2);
    const last = (lastRaw ?? "").trim();
    const first = (restRaw ?? "").trim();
    return { last, first, full };
  }

  const parts = full.split(" ").filter(Boolean);
  if (parts.length === 1) return { last: parts[0], first: "", full };
  return { last: parts[parts.length - 1], first: parts[0], full };
}

function isNonPersonalCareCallType(callTypeLabel: string | null | undefined): boolean {
  const text = normalizeCallTypeKey(callTypeLabel ?? null);
  if (!text) return false;

  // Explicitly push these to the end (per request: shopping/escorts/etc after personal care).
  const nonCareKeywords = [
    "shopping",
    "shop",
    "escort",
    "escorted",
    "transport",
    "appointment",
    "community",
    "outing",
    "errand",
  ];
  return nonCareKeywords.some((kw) => text.includes(kw));
}

function formatDateForPdf(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value.toString().trim();
  if (!text) return null;

  // ISO datetime (YYYY-MM-DDTHH:mm:ss...) or (YYYY-MM-DD HH:mm:ss...)
  const isoDateTime = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)$/);
  if (isoDateTime) {
    const [, yyyy, mm, dd] = isoDateTime;
    return `${dd}/${mm}/${yyyy}`;
  }

  // Convert ISO date key (YYYY-MM-DD) into UK display (DD/MM/YYYY).
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const [, yyyy, mm, dd] = iso;
    return `${dd}/${mm}/${yyyy}`;
  }

  // Normalize existing DD/MM/YYYY (possibly without zero padding).
  const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (dmy) {
    const dd = dmy[1].padStart(2, "0");
    const mm = dmy[2].padStart(2, "0");
    let yyyy = dmy[3];
    if (yyyy.length === 2) yyyy = `20${yyyy}`;
    return `${dd}/${mm}/${yyyy}`;
  }

  // Already in DD/MM/YYYY (or other human-readable) – leave as-is.
  return text;
}

function normalizeLocationToken(value: string | null): string | null {
  if (!value) return null;
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function createNormalizedServiceUserKey(
  name?: string | null,
  address?: string | null,
  area?: string | null
): string | null {
  return (
    normalizeWorkerName(name ?? null) ||
    normalizeLocationToken(address ?? null) ||
    normalizeLocationToken(area ?? null)
  );
}

function buildGroupKey(row: RowAnalysis): string {
  const userKey = row.normalizedServiceUserKey;
  const timeKey =
    typeof row.plannedTimeMinutes === "number"
      ? `t-${Math.round(row.plannedTimeMinutes)}`
      : row.plannedTimeLabel
      ? `l-${row.plannedTimeLabel.toLowerCase()}`
      : null;

  if (userKey && timeKey) return `${userKey}|${timeKey}`;
  if (userKey) return `${userKey}|row-${row.rowNumber}`;
  return `row-${row.rowNumber}`;
}

function buildCallFlagsText(row: RowAnalysis): string {
  const flags: string[] = [];
  if (row.isDuplicateSlotRow) flags.push("duplicate slot");
  if (row.scheduleFlag) flags.push(">2h drift");
  if (row.durationFlag) flags.push("<80% duration");
  if (row.durationOverrunFlag) flags.push(">120% duration");
  return flags.join(", ") || "—";
}

function deriveDateParts(raw: any): { label: string | null; key: string | null } {
  const date = parseDateValue(raw);
  if (!date) return { label: null, key: null };
  const key = formatDateKey(date);
  return { label: key, key };
}

function parseDateValue(value: any): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const parser = (RawXLSX as any).SSF?.parse_date_code;
    if (typeof parser === "function") {
      const parts = parser(value);
      if (parts && typeof parts.y === "number" && typeof parts.m === "number" && typeof parts.d === "number") {
        return new Date(parts.y, parts.m - 1, parts.d, parts.H ?? parts.h ?? 0, parts.M ?? parts.m ?? 0, parts.S ?? parts.s ?? 0);
      }
    }

    // Fallback when SSF parser is unavailable (common in some bundles).
    // Convert Excel serial date-time to a local Date without timezone shifting the calendar day.
    // 25569 is the Excel serial for 1970-01-01.
    const utcMillis = (value - 25569) * 86400 * 1000;
    if (Number.isFinite(utcMillis)) {
      const utcDate = new Date(utcMillis);
      return new Date(
        utcDate.getUTCFullYear(),
        utcDate.getUTCMonth(),
        utcDate.getUTCDate(),
        utcDate.getUTCHours(),
        utcDate.getUTCMinutes(),
        utcDate.getUTCSeconds()
      );
    }
  }

  const str = String(value).trim();
  if (!str) return null;

  // Guard: a time-only value like "08:00" should NOT become "today".
  // (Date.parse("08:00") is valid in JS and defaults to today's date.)
  if (str.match(/^\d{1,2}(?::\d{2})?(?::\d{2})?\s*(am|pm)?$/i)) {
    return null;
  }

  const european = str.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (european) {
    const day = Number(european[1]);
    const month = Number(european[2]);
    let year = Number(european[3]);
    if (year < 100) year += 2000;
    const hours = european[4] ? Number(european[4]) : 0;
    const minutes = european[5] ? Number(european[5]) : 0;
    const seconds = european[6] ? Number(european[6]) : 0;
    return new Date(year, month - 1, day, hours, minutes, seconds);
  }

  const timestamp = Date.parse(str);
  if (!Number.isNaN(timestamp)) {
    return new Date(timestamp);
  }

  return null;
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKeyToLocalDate(key: string | null): Date | null {
  if (!key) return null;
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  return parseDateValue(key);
}

function getDateDayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
}

function deriveTemplateWeekKey(date: Date, referenceDayNumber = TEMPLATE_WEEK_1_START_DAY_NUMBER): TemplateWeekKey {
  const diffDays = getDateDayNumber(date) - referenceDayNumber;
  const weekOffset = Math.floor(diffDays / 7);
  const parity = ((weekOffset % 2) + 2) % 2;
  return parity === 0 ? "week1" : "week2";
}

function deriveWeekdayLabel(date: Date): WeekdayLabel {
  const dayIndex = date.getDay();
  return WEEKDAY_OPTIONS[(dayIndex + 6) % 7];
}

function buildTemplateWeekdayKey(week: TemplateWeekKey, day: WeekdayLabel): string {
  return `${week}|${day}`;
}

function buildTemplateOverrideKey(workerKey: string, groupKey: string): string {
  return `${workerKey}::${groupKey}`;
}

function buildTemplateRecommendationKey(workerKey: string, week: TemplateWeekKey, day: WeekdayLabel): string {
  return `${workerKey}::${week}::${day}`;
}

function parseTemplateWeekdayKey(key: string): { week: TemplateWeekKey; day: WeekdayLabel } | null {
  const [week, day] = key.split("|");
  if ((week !== "week1" && week !== "week2") || !WEEKDAY_OPTIONS.includes(day as WeekdayLabel)) {
    return null;
  }
  return { week: week as TemplateWeekKey, day: day as WeekdayLabel };
}

function getTemplateWeekLabel(week: TemplateWeekKey, referenceDayNumber: number | null): string {
  const base = week === "week1" ? "Week 1" : "Week 2";
  if (referenceDayNumber === null) return base;
  const dayOffset = week === "week2" ? 7 : 0;
  const targetDayNumber = referenceDayNumber + dayOffset;
  const targetDate = new Date(targetDayNumber * 86400000);
  const dd = String(targetDate.getUTCDate()).padStart(2, "0");
  const mm = String(targetDate.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = targetDate.getUTCFullYear();
  return `${base} (starts ${dd}/${mm}/${yyyy})`;
}

function splitTemplateWeekdayKeys(keys: Set<string>): { week1Days: WeekdayLabel[]; week2Days: WeekdayLabel[] } {
  const week1Days = WEEKDAY_OPTIONS.filter((day) => keys.has(buildTemplateWeekdayKey("week1", day)));
  const week2Days = WEEKDAY_OPTIONS.filter((day) => keys.has(buildTemplateWeekdayKey("week2", day)));
  return { week1Days, week2Days };
}

function toggleWeekdaySelection(days: WeekdayLabel[], day: WeekdayLabel): WeekdayLabel[] {
  return days.includes(day) ? days.filter((value) => value !== day) : [...days, day];
}

function formatTimeInputValue(minutes: number | null): string {
  if (typeof minutes !== "number" || !Number.isFinite(minutes)) return "";
  const normalized = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hrs = Math.floor(normalized / 60);
  const mins = Math.round(normalized % 60);
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

function buildDuplicateSlotKey(row: RowAnalysis): string | null {
  // Include worker in the key so that different workers at the same slot
  // are NOT considered duplicates (they are double-up calls)
  if (!row.normalizedServiceUserKey) return null;
  if (!row.plannedDateKey) return null;
  if (typeof row.plannedTimeMinutes !== "number") return null;
  const workerName = getRowAssignedWorkerName(row);
  const workerKey = workerName ? (normalizeWorkerName(workerName) || workerName.toLowerCase()) : "unknown";
  return `${row.normalizedServiceUserKey}|${row.plannedDateKey}|${Math.round(row.plannedTimeMinutes)}|${workerKey}`;
}

function getRowAssignedWorkerName(row: RowAnalysis): string | null {
  return row.templateWorker || row.actualWorker || row.plannedWorker || null;
}

function getRequirementMinutes(row: RowAnalysis): number | null {
  if (typeof row.serviceRequirementTimeMinutes === "number") return row.serviceRequirementTimeMinutes;
  if (typeof row.plannedTimeMinutes === "number") return row.plannedTimeMinutes;
  if (typeof row.actualTimeMinutes === "number") return row.actualTimeMinutes;
  return null;
}

function getRowSlotMinutes(row: RowAnalysis): number | null {
  if (typeof row.plannedTimeMinutes === "number") return row.plannedTimeMinutes;
  if (typeof row.serviceRequirementTimeMinutes === "number") return row.serviceRequirementTimeMinutes;
  if (typeof row.actualTimeMinutes === "number") return row.actualTimeMinutes;
  return null;
}

function buildDoubleUpSlotKey(row: RowAnalysis): string | null {
  if (!row.normalizedServiceUserKey) return null;
  if (!row.plannedDateKey) return null;
  const minutes = getRowSlotMinutes(row);
  if (typeof minutes !== "number") return null;
  return `${row.normalizedServiceUserKey}|${row.plannedDateKey}|${Math.round(minutes)}`;
}

function buildWorkerSlotKey(row: RowAnalysis): string | null {
  const slotKey = buildDoubleUpSlotKey(row);
  if (!slotKey) return null;
  const workerName = getRowAssignedWorkerName(row);
  if (!workerName) return null;
  const workerKey = normalizeWorkerName(workerName) || workerName.toLowerCase();
  return `${slotKey}|${workerKey}`;
}

function bucketMinutes(value: number, bucketSize: number): number {
  if (!Number.isFinite(value) || bucketSize <= 1) return clampMinutesOfDay(value);
  return clampMinutesOfDay(Math.round(value / bucketSize) * bucketSize);
}

function buildSlotTrendKeyForGroup(
  normalizedServiceUserKey?: string | null,
  plannedTimeMinutes?: number | null
): string | null {
  if (!normalizedServiceUserKey) return null;
  if (typeof plannedTimeMinutes !== "number") return null;
  const slotMinutes = bucketMinutes(plannedTimeMinutes, TREND_BUCKET_MINUTES);
  return `${normalizedServiceUserKey}|slot-${slotMinutes}`;
}

function buildCallTypeTrendKey(
  normalizedServiceUserKey?: string | null,
  callTypeLabel?: string | null
): string | null {
  if (!normalizedServiceUserKey) return null;
  const typeKey = normalizeCallTypeKey(callTypeLabel ?? null);
  if (!typeKey) return null;
  return `${normalizedServiceUserKey}|type-${typeKey}`;
}

function clampMinutesOfDay(value: number): number {
  const mod = ((value % (24 * 60)) + 24 * 60) % (24 * 60);
  return mod;
}

function roundToNearest(value: number, step: number): number {
  if (!Number.isFinite(value)) return value;
  if (!step || step <= 0) return value;
  return Math.round(value / step) * step;
}
