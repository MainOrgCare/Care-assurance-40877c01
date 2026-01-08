import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
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
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertCircle,
  CheckCircle2,
  Clock4,
  FileText,
  Download,
  FileSpreadsheet,
  Filter,
  FlaskConical,
  Loader2,
  Search,
  Shield,
  Timer,
  Users,
} from "lucide-react";

const ROW_BATCH_SIZE = 250;
const INITIAL_VISIBLE_ROWS = 200;

const TREND_MIN_CALLS = 4;
const TREND_CONSISTENCY = 0.7;
const TREND_MIN_AVG_OFFSET_MINUTES = 30;
const TREND_BUCKET_MINUTES = 15;

const DURATION_SHORTFALL_THRESHOLD_PERCENT = 80;
const DURATION_OVERRUN_THRESHOLD_PERCENT = 120;

const PLANNED_TIME_KEYWORDS = [
  "planned time",
  "scheduled time",
  "plan time",
  "expected time",
  "appointment time",
];

const ACTUAL_TIME_KEYWORDS = [
  "actual time",
  "delivered time",
  "visit time",
  "call time",
  "arrival time",
  "check-in time",
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
  "call duration",
  "visit duration",
];

const GENERIC_DURATION_KEYWORDS = ["duration", "mins", "minutes"];

const PLANNED_WORKER_KEYWORDS = [
  "planned worker",
  "scheduled worker",
  "assigned worker",
  "planned carer",
  "assigned carer",
];

const ACTUAL_WORKER_KEYWORDS = [
  "actual worker",
  "actual carer",
  "delivered worker",
  "attending worker",
  "visiting carer",
];

const GENERIC_WORKER_KEYWORDS = ["care worker", "carer", "staff", "worker", "caregiver"];

const SERVICE_USER_NAME_KEYWORDS = [
  "service user",
  "service user name",
  "client",
  "client name",
  "client full name",
  "resident",
  "person",
  "individual",
  "patient",
  "su name",
  "customer name",
  "people we support",
  "participant",
  "service location name",
];

const SERVICE_USER_AREA_KEYWORDS = [
  "area",
  "region",
  "zone",
  "patch",
  "team",
  "borough",
];

const SERVICE_USER_ADDRESS_KEYWORDS = [
  "address",
  "street",
  "road",
  "postcode",
  "post code",
  "zip",
  "city",
  "town",
  "service location address",
];

const SERVICE_REQUIREMENT_TYPE_KEYWORDS = ["service requirement type description", "service requirement description"];
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
  plannedTimeLabel?: string | null;
  actualTimeLabel?: string | null;
  plannedDurationMinutes?: number | null;
  actualDurationMinutes?: number | null;
  plannedTimeMinutes?: number | null;
  actualTimeMinutes?: number | null;
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
  slotLabel: string;
  slotMinutes: number;
  totalCalls: number;
  callsWithTimes: number;
  averageStartOffsetMinutes: number | null;
  offsetConsistency: number | null;
  suggestedPlannedTimeLabel: string | null;
  callsWithDurations: number;
  averageDurationPercent: number | null;
  suggestedPlannedDurationMinutes: number | null;
  advice: string[];
  tone: InsightTone;
}

export default function TestingFeatures() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [fileMeta, setFileMeta] = useState<FileMeta | null>(null);
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
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_ROWS);
  const [showDuplicateRows, setShowDuplicateRows] = useState(true);
  const [callGroupSearch, setCallGroupSearch] = useState("");
  const analysisJobRef = useRef<number>(0);
  const showGlobalProgress = processingState === "parsing" || processingState === "analyzing";

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_ROWS);
  }, [filterStatus, searchTerm, fileMeta?.name]);

  useEffect(() => {
    setSelectedRow(null);
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
      if (emptyFields.length) {
        issues.push(`${emptyFields.length} empty field${emptyFields.length > 1 ? "s" : ""}`);
      }
      if (numericWarnings.length) {
        issues.push(`${numericWarnings.length} negative value${numericWarnings.length > 1 ? "s" : ""}`);
      }
      if (textWarnings.length) {
        issues.push(`${textWarnings.length} long text field${textWarnings.length > 1 ? "s" : ""}`);
      }

      const plannedTimeField = detectField(row, PLANNED_TIME_KEYWORDS);
      const actualTimeField = detectField(
        row,
        ACTUAL_TIME_KEYWORDS,
        plannedTimeField ? new Set([plannedTimeField.key]) : undefined
      );

      const plannedDurationField = detectField(row, PLANNED_DURATION_KEYWORDS);
      const actualDurationField = detectField(
        row,
        ACTUAL_DURATION_KEYWORDS,
        plannedDurationField ? new Set([plannedDurationField.key]) : undefined
      );

      let plannedWorkerField = detectField(row, PLANNED_WORKER_KEYWORDS);
      if (!plannedWorkerField) {
        plannedWorkerField = detectField(row, GENERIC_WORKER_KEYWORDS);
      }
      let actualWorkerField = detectField(
        row,
        ACTUAL_WORKER_KEYWORDS,
        plannedWorkerField ? new Set([plannedWorkerField.key]) : undefined
      );
      if (!actualWorkerField) {
        actualWorkerField = detectField(
          row,
          GENERIC_WORKER_KEYWORDS,
          plannedWorkerField ? new Set([plannedWorkerField.key]) : undefined
        );
      }

      const plannedTimeMinutes = plannedTimeField
        ? parseTimeToMinutes(plannedTimeField.value)
        : null;
      const actualTimeMinutes = actualTimeField ? parseTimeToMinutes(actualTimeField.value) : null;
      const scheduleDeltaMinutes =
        plannedTimeMinutes !== null && actualTimeMinutes !== null
          ? actualTimeMinutes - plannedTimeMinutes
          : null;
      const plannedDateParts = deriveDateParts(plannedTimeField?.value);

      const plannedWorkerName = sanitizeStringValue(plannedWorkerField?.value);
      const actualWorkerName = sanitizeStringValue(actualWorkerField?.value);
      const normalizedPlannedWorker = normalizeWorkerName(plannedWorkerName);
      const normalizedActualWorker = normalizeWorkerName(actualWorkerName);
      const workersMatch =
        normalizedPlannedWorker && normalizedActualWorker
          ? normalizedPlannedWorker === normalizedActualWorker
          : null;

      const plannedDurationMinutes = plannedDurationField
        ? parseDurationToMinutes(plannedDurationField.value, plannedDurationField?.key)
        : null;
      const actualDurationMinutes = actualDurationField
        ? parseDurationToMinutes(actualDurationField.value, actualDurationField?.key)
        : null;
      const hasDurationComparison =
        plannedDurationMinutes !== null && plannedDurationMinutes > 0 && actualDurationMinutes !== null;
      const durationMatchPercent = hasDurationComparison
        ? (actualDurationMinutes! / plannedDurationMinutes!) * 100
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
        ["service location name"],
        serviceUserNameField ? new Set([serviceUserNameField.key]) : undefined
      );
      const serviceUserAreaField = detectField(
        row,
        SERVICE_USER_AREA_KEYWORDS,
        serviceUserNameField ? new Set([serviceUserNameField.key]) : undefined
      );
      const serviceUserAddressField = detectField(
        row,
        SERVICE_USER_ADDRESS_KEYWORDS,
        serviceUserNameField ? new Set([serviceUserNameField.key]) : undefined
      );
      const serviceLocationAddressField = detectField(
        row,
        ["service location address"],
        serviceUserAddressField ? new Set([serviceUserAddressField.key]) : undefined
      );

      const serviceRequirementTypeField = detectField(row, SERVICE_REQUIREMENT_TYPE_KEYWORDS);
      const serviceRequirementServiceTypeField = detectField(
        row,
        SERVICE_REQUIREMENT_SERVICE_TYPE_KEYWORDS,
        serviceRequirementTypeField ? new Set([serviceRequirementTypeField.key]) : undefined
      );
      const callTypeParts = [serviceRequirementTypeField?.value, serviceRequirementServiceTypeField?.value]
        .map(sanitizeHumanReadable)
        .filter(Boolean) as string[];
      const callTypeLabel = callTypeParts.length ? Array.from(new Set(callTypeParts)).join(" • ") : null;

      const serviceUserName = sanitizeHumanReadable(serviceLocationNameField?.value ?? serviceUserNameField?.value);
      const serviceUserArea = sanitizeHumanReadable(serviceUserAreaField?.value);
      const serviceUserAddress = sanitizeHumanReadable(
        serviceLocationAddressField?.value ?? serviceUserAddressField?.value
      );
      const normalizedServiceUserKey = createNormalizedServiceUserKey(
        serviceUserName,
        serviceUserAddress,
        serviceUserArea
      );

      const excludeFromMetrics = workersMatch === false;
      if (excludeFromMetrics) {
        issues.push("Care worker mismatch — excluded from metrics");
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
        plannedTimeLabel: deriveTimeLabel(plannedTimeMinutes, plannedTimeField?.value),
        actualTimeLabel: deriveTimeLabel(actualTimeMinutes, actualTimeField?.value),
        plannedDurationMinutes,
        actualDurationMinutes,
        plannedTimeMinutes,
        actualTimeMinutes,
        plannedDateLabel: plannedDateParts.label,
        plannedDateKey: plannedDateParts.key,
        serviceUserName,
        serviceUserArea,
        serviceUserAddress,
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

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
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
      setConvertedBlob(null);
      setSelectedRow(null);
      setAnalysisResults([]);

      try {
        const isCsv = file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";
        let workbook: XLSX.WorkBook;

        if (isCsv) {
          const text = await file.text();
          workbook = XLSX.read(text, { type: "string" });

          const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
          setConvertedBlob(
            new Blob([buffer], {
              type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            })
          );
        } else {
          const data = await file.arrayBuffer();
          workbook = XLSX.read(data, { type: "array" });
          setConvertedBlob(null);
        }

        if (!workbook.SheetNames.length) {
          throw new Error("No worksheets found.");
        }

        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: "" });

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
        toast({
          title: "Unable to process file",
          description: error instanceof Error ? error.message : "Unexpected error occurred.",
          variant: "destructive",
        });
        setProcessingState("idle");
      } finally {
        event.target.value = "";
      }
    },
    [analyzeRows, toast]
  );

  const usableRows = useMemo(() => analysisResults.filter((row) => !row.excludeFromMetrics), [analysisResults]);
  const excludedRows = useMemo(() => analysisResults.filter((row) => row.excludeFromMetrics), [analysisResults]);

  const dedupedResults = useMemo(() => {
    if (!usableRows.length) return [];
    const seen = new Map<string, boolean>();
    return usableRows.map((row) => {
      const duplicateKey = buildDuplicateSlotKey(row);
      if (!duplicateKey) {
        return { ...row, isDuplicateSlotRow: false };
      }
      if (seen.has(duplicateKey)) {
        return {
          ...row,
          status: "attention" as RowStatus,
          isDuplicateSlotRow: true,
          issues: row.issues.includes("Duplicate care slot (ignored in totals)")
            ? row.issues
            : [...row.issues, "Duplicate care slot (ignored in totals)"],
        };
      }
      seen.set(duplicateKey, true);
      return { ...row, isDuplicateSlotRow: false };
    });
  }, [usableRows]);

  const primaryRows = useMemo(() => dedupedResults.filter((row) => !row.isDuplicateSlotRow), [dedupedResults]);

  const filteredResults = useMemo(() => {
    let rows = showDuplicateRows ? dedupedResults : primaryRows;
    if (filterStatus !== "all") {
      rows = rows.filter((row) => row.status === filterStatus);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
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
  }, [dedupedResults, primaryRows, filterStatus, searchTerm, showDuplicateRows]);

  const visibleRows = filteredResults.slice(0, visibleCount);

  const summary = useMemo(() => {
    const total = dedupedResults.length;
    const workingRows = primaryRows;
    const duplicateCount = total - workingRows.length;
    const excludedCareWorkers = excludedRows.length;
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
      excludedCareWorkers,
    };
  }, [dedupedResults, excludedRows.length, primaryRows, usableRows.length]);

  const slotTrends = useMemo<SlotTrendSummary[]>(() => {
    if (!primaryRows.length) return [];

    type Accumulator = {
      key: string;
      serviceUserName: string | null;
      serviceUserArea: string | null;
      serviceUserAddress: string | null;
      slotMinutes: number;
      totalCalls: number;
      callsWithTimes: number;
      offsetSum: number;
      offsetPositive: number;
      offsetNegative: number;
      offsetAbsOver15: number;
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
      if (typeof row.plannedTimeMinutes !== "number") continue;

      const slotMinutes = bucketMinutes(row.plannedTimeMinutes, TREND_BUCKET_MINUTES);
      const key = `${userKey}|slot-${slotMinutes}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          serviceUserName: row.serviceUserName ?? null,
          serviceUserArea: row.serviceUserArea ?? null,
          serviceUserAddress: row.serviceUserAddress ?? null,
          slotMinutes,
          totalCalls: 0,
          callsWithTimes: 0,
          offsetSum: 0,
          offsetPositive: 0,
          offsetNegative: 0,
          offsetAbsOver15: 0,
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

      if (typeof row.actualTimeMinutes === "number") {
        const delta = row.actualTimeMinutes - row.plannedTimeMinutes;
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
    for (const acc of map.values()) {
      const advice: string[] = [];
      const averageStartOffsetMinutes = acc.callsWithTimes ? acc.offsetSum / acc.callsWithTimes : null;
      const dominantSignCount = Math.max(acc.offsetPositive, acc.offsetNegative);
      const offsetConsistency = acc.callsWithTimes ? dominantSignCount / acc.callsWithTimes : null;

      let suggestedPlannedTimeLabel: string | null = null;
      if (
        acc.callsWithTimes >= TREND_MIN_CALLS &&
        averageStartOffsetMinutes !== null &&
        Math.abs(averageStartOffsetMinutes) >= TREND_MIN_AVG_OFFSET_MINUTES &&
        offsetConsistency !== null &&
        offsetConsistency >= TREND_CONSISTENCY &&
        acc.offsetAbsOver15 / acc.callsWithTimes >= TREND_CONSISTENCY
      ) {
        const roundedOffset = roundToNearest(averageStartOffsetMinutes, 5);
        const suggestedMinutes = clampMinutesOfDay(acc.slotMinutes + roundedOffset);
        suggestedPlannedTimeLabel = deriveTimeLabel(suggestedMinutes, null) ?? null;
        const direction = averageStartOffsetMinutes > 0 ? "later" : "earlier";
        advice.push(
          `Actual starts are consistently ${direction} than planned by about ${formatMinutesDisplay(Math.abs(averageStartOffsetMinutes))}. Consider changing planned time from ${deriveTimeLabel(acc.slotMinutes, null)} to ${suggestedPlannedTimeLabel}.`
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
        slotLabel: deriveTimeLabel(acc.slotMinutes, null) ?? "—",
        slotMinutes: acc.slotMinutes,
        totalCalls: acc.totalCalls,
        callsWithTimes: acc.callsWithTimes,
        averageStartOffsetMinutes,
        offsetConsistency,
        suggestedPlannedTimeLabel,
        callsWithDurations: acc.callsWithDurations,
        averageDurationPercent,
        suggestedPlannedDurationMinutes,
        advice,
        tone,
      });
    }

    return result
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
      .slice(0, 25);
  }, [primaryRows]);

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

  const { visibleCallGroups, hasSearchMatch } = useMemo<{
    visibleCallGroups: CallGroup[];
    hasSearchMatch: boolean;
  }>(() => {
    if (!callGroups.length) {
      return { visibleCallGroups: [], hasSearchMatch: true };
    }

    const term = callGroupSearch.trim().toLowerCase();
    if (!term) {
      return { visibleCallGroups: callGroups.slice(0, 5), hasSearchMatch: true };
    }

    const scored = callGroups.map((group) => {
      const fields = [group.serviceUserName, group.serviceUserArea, group.serviceUserAddress, group.plannedTimeLabel]
        .map((value) => (value ? value.toString().toLowerCase() : ""));
      const score = fields.reduce((acc, field) => {
        if (!field) return acc;
        if (field === term) return acc + 4;
        if (field.startsWith(term)) return acc + 3;
        if (field.includes(term)) return acc + 1;
        return acc;
      }, 0);
      return { group, score };
    });

    const matches = scored.filter((entry) => entry.score > 0);
    const source = (matches.length ? matches : scored).sort(
      (a, b) =>
        b.score - a.score || (a.group.serviceUserName || "").localeCompare(b.group.serviceUserName || "")
    );

    return {
      visibleCallGroups: source.map((entry) => entry.group).slice(0, 5),
      hasSearchMatch: matches.length > 0,
    };
  }, [callGroups, callGroupSearch]);

  const handleLoadMore = () => {
    setVisibleCount((prev) => Math.min(filteredResults.length, prev + INITIAL_VISIBLE_ROWS));
  };

  const handleReset = () => {
    analysisJobRef.current = Date.now();
    setFileMeta(null);
    setConvertedBlob(null);
    setDownloadUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setAnalysisResults([]);
    setSelectedRow(null);
    setSearchTerm("");
    setFilterStatus("all");
    setVisibleCount(INITIAL_VISIBLE_ROWS);
    setProgress(0);
    setProcessingState("idle");
  };

  const handleExportPdf = useCallback(() => {
    if (!callGroups.length) {
      toast({
        title: "No data to export",
        description: "Load and analyze a workbook before exporting.",
      });
      return;
    }

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const slotTrendMap = new Map<string, SlotTrendSummary>();
    slotTrends.forEach((trend) => slotTrendMap.set(trend.key, trend));
    const duplicateNote = duplicateClusters.length
      ? `Note: Found ${duplicateClusters.length} planned slot${duplicateClusters.length === 1 ? "" : "s"} with multiple carers. Only the first row counted toward metrics. A duplicate review section is included at the end of this report.`
      : null;
    let currentY = 48;

    callGroups.forEach((group, groupIndex) => {
      if (currentY > pageHeight - 320) {
        doc.addPage();
        currentY = 48;
      }

      doc.setFontSize(12);
      doc.text(`Service User: ${group.serviceUserName || "Unknown"}`, 40, currentY);
      currentY += 16;
      doc.setFontSize(10);
      doc.text(`Area: ${group.serviceUserArea || "N/A"}`, 40, currentY);
      currentY += 14;
      doc.text(`Address: ${group.serviceUserAddress || "N/A"}`, 40, currentY);
      currentY += 14;
      doc.text(`Planned Time: ${group.plannedTimeLabel || "N/A"}`, 40, currentY);
      currentY += 16;

      const callTypes = Array.from(
        new Set(
          group.rows
            .map((row) => row.callTypeLabel)
            .filter((value): value is string => Boolean(value))
        )
      );

      const recommendationLines: string[] = [];
      if (callTypes.length || group.plannedTimeLabel) {
        recommendationLines.push(
          `Service requirement: ${callTypes.length ? callTypes.join(", ") : "—"} • Planned ${group.plannedTimeLabel || "—"}`
        );
      }

      const slotTrendKey = buildSlotTrendKeyForGroup(group.normalizedServiceUserKey, group.plannedTimeMinutes);
      const slotTrendInsight = slotTrendKey ? slotTrendMap.get(slotTrendKey) : undefined;

      const startDeltaValues = group.rows
        .map((row) => (typeof row.scheduleDeltaMinutes === "number" ? row.scheduleDeltaMinutes : null))
        .filter((value): value is number => value !== null);
      const avgStartDelta = startDeltaValues.length
        ? startDeltaValues.reduce((acc, value) => acc + value, 0) / startDeltaValues.length
        : null;
      const actualTrendLabel =
        avgStartDelta !== null && typeof group.plannedTimeMinutes === "number"
          ? deriveTimeLabel(clampMinutesOfDay(group.plannedTimeMinutes + avgStartDelta), null)
          : null;

      const durationPercents = group.rows
        .map((row) => (typeof row.durationMatchPercent === "number" ? row.durationMatchPercent : null))
        .filter((value): value is number => value !== null);
      const avgDurationPercent = durationPercents.length
        ? durationPercents.reduce((acc, value) => acc + value, 0) / durationPercents.length
        : null;
      const actualDurationValues = group.rows
        .map((row) => (typeof row.actualDurationMinutes === "number" ? row.actualDurationMinutes : null))
        .filter((value): value is number => value !== null);
      const avgActualDuration = actualDurationValues.length
        ? actualDurationValues.reduce((acc, value) => acc + value, 0) / actualDurationValues.length
        : null;

      const addStartTrendLine = (consistency?: number | null, offset?: number | null, suggestion?: string | null) => {
        if (offset === null || typeof group.plannedTimeMinutes !== "number") return;
        const actualLabel = deriveTimeLabel(clampMinutesOfDay(group.plannedTimeMinutes + offset), null);
        if (!actualLabel) return;
        const direction = offset > 0 ? "later" : "earlier";
        const coverage = consistency ? `${Math.round(consistency * 100)}% of visits` : "Actual visits";
        recommendationLines.push(
          `${coverage} land ${direction} around ${actualLabel} (${formatMinutesDisplay(Math.abs(offset))} from plan).`
        );
        if (suggestion) {
          recommendationLines.push(`Recommended planned time: ${suggestion}.`);
        }
      };

      if (slotTrendInsight?.averageStartOffsetMinutes !== null) {
        addStartTrendLine(
          slotTrendInsight.offsetConsistency,
          slotTrendInsight.averageStartOffsetMinutes,
          slotTrendInsight.suggestedPlannedTimeLabel
        );
      } else if (avgStartDelta !== null) {
        addStartTrendLine(null, avgStartDelta, null);
      }

      if (slotTrendInsight?.averageDurationPercent !== null) {
        const percent = slotTrendInsight.averageDurationPercent.toFixed(0);
        const recommendedDuration = slotTrendInsight.suggestedPlannedDurationMinutes
          ? formatMinutesDisplay(slotTrendInsight.suggestedPlannedDurationMinutes)
          : null;
        recommendationLines.push(
          `Call duration trend: ${percent}% of plan${
            avgActualDuration !== null ? ` (${formatMinutesDisplay(avgActualDuration)} actual)` : ""
          }${recommendedDuration ? `. Recommend planning ${recommendedDuration}.` : ""}`
        );
      } else if (avgDurationPercent !== null) {
        recommendationLines.push(
          `Call duration trend: ${avgDurationPercent.toFixed(0)}% of plan${
            avgActualDuration !== null ? ` (${formatMinutesDisplay(avgActualDuration)} actual)` : ""
          }.`
        );
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

      if (groupIndex === 0 && duplicateNote) {
        doc.setFontSize(9);
        doc.setTextColor(110);
        const noteLines = doc.splitTextToSize(duplicateNote, pageWidth - 80);
        doc.text(noteLines, 40, currentY);
        currentY += noteLines.length * 12 + 8;
        doc.setTextColor(0);
      }

      const rows = group.rows.map((row, idx) => [
        (idx + 1).toString(),
        row.plannedTimeLabel || "—",
        row.actualTimeLabel || "—",
        row.callTypeLabel || "—",
        row.actualWorker || row.plannedWorker || "—",
        typeof row.scheduleDeltaMinutes === "number" ? formatSignedMinutes(row.scheduleDeltaMinutes) : "—",
        row.durationMatchPercent !== null ? `${row.durationMatchPercent.toFixed(0)}%` : "—",
        buildCallFlagsText(row),
      ]);

      autoTable(doc, {
        startY: currentY,
        head: [["#", "Planned", "Actual", "Call Type", "Care Worker", "Schedule Δ", "Duration %", "Flags"]],
        body: rows,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [15, 23, 42] },
        margin: { left: 40, right: 40 },
      });

      const finalY = (doc as any).lastAutoTable?.finalY ?? currentY;
      currentY = finalY + 28;
    });

    if (duplicateClusters.length) {
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

      duplicateClusters.forEach((cluster, clusterIndex) => {
        if (cursorY > pageHeight - 140) {
          doc.addPage();
          cursorY = 48;
          doc.setFontSize(12);
          doc.text("Duplicate Slot Review (cont.)", 40, cursorY);
          cursorY += 18;
          doc.setFontSize(10);
        }

        doc.setFontSize(11);
        const heading = `${clusterIndex + 1}. ${cluster.serviceUserName || "Unknown"} — ${cluster.plannedDateLabel || "Unknown date"} at ${cluster.plannedTimeLabel || "Unknown time"}`;
        const headingLines = doc.splitTextToSize(heading, pageWidth - 80);
        doc.text(headingLines, 40, cursorY);
        cursorY += headingLines.length * 12;

        doc.setFontSize(9);
        const location = `Area: ${(cluster.serviceUserArea || "Area unavailable").toString()} • Address: ${cluster.serviceUserAddress || "Address unavailable"}`;
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
          const detail = `Row #${row.rowNumber} • ${worker} • Planned ${row.plannedTimeLabel || "—"} → Actual ${row.actualTimeLabel || "—"} • ${row.isDuplicateSlotRow ? "Ignored duplicate" : "Counted"}`;
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

    doc.save("service-user-calls.pdf");
  }, [callGroups, duplicateClusters, slotTrends, toast]);

  if (user?.role !== "admin") {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-500">
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

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-primary">
          <FlaskConical className="h-5 w-5" />
          <p className="text-sm font-medium uppercase tracking-wide">Admin Sandbox</p>
        </div>
        <h1 className="text-3xl font-heading font-bold text-foreground">Testing Features</h1>
        <p className="text-muted-foreground max-w-3xl">
          Upload large CSV or Excel workbooks, automatically convert CSV files to Excel, and
          inspect every row with automated data quality checks before pushing experiments to production.
        </p>
      </div>

      <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
        <AlertTitle>Volatile workspace</AlertTitle>
        <AlertDescription>
          Data stays in-memory only. Refreshing the page clears every upload, so export a PDF if you need a temporary record.
        </AlertDescription>
      </Alert>

      {showGlobalProgress && (
        <div className="z-30 mb-6">
          <div className="rounded-full h-2 bg-muted/60 overflow-hidden shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-primary via-primary/80 to-primary/60 transition-all duration-200"
              style={{ width: `${Math.min(Math.max(progress, 5), 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">Analyzing workbook… {progress}%</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Upload Workbook</CardTitle>
              <CardDescription>Accepted formats: CSV, XLS, XLSX</CardDescription>
            </div>
            {processingState === "analyzing" && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border border-dashed border-border rounded-xl p-6 text-center bg-muted/40">
              <input
                id="testing-features-upload"
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={handleFileChange}
              />
              <label htmlFor="testing-features-upload" className="cursor-pointer space-y-3 block">
                <div className="flex items-center justify-center gap-3 text-muted-foreground">
                  <UploadCloudIcon />
                  <span>Click to choose a data file or drag it here</span>
                </div>
                <p className="text-xs text-muted-foreground/80">
                  We keep everything client-side so you can experiment safely.
                </p>
              </label>
            </div>

            {fileMeta && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-border bg-background/60 p-4">
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
                <div className="rounded-lg border border-border bg-background/60 p-4 space-y-3">
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

        <Card>
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
              <span>{progress}%</span>
              <Badge variant={processingState === "complete" ? "default" : "secondary"}>{processingState}</Badge>
            </div>
            <Progress value={progress} className="h-2" />
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>Rows analyzed: {analysisResults.length.toLocaleString()}</p>
              <p>Unique slots: {summary.totalPrimary.toLocaleString()}</p>
              {summary.duplicateCount > 0 && (
                <p>Duplicates ignored: {summary.duplicateCount.toLocaleString()}</p>
              )}
              {summary.excludedCareWorkers > 0 && (
                <p>Carer mismatches excluded: {summary.excludedCareWorkers.toLocaleString()}</p>
              )}
              <p>Flagged rows: {summary.attention.toLocaleString()}</p>
              <p>Empty fields: {summary.totalEmpty.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricCard
          icon={<FileSpreadsheet className="h-4 w-4" />}
          label="Total Rows"
          value={summary.total.toLocaleString()}
          helper={`${summary.totalPrimary.toLocaleString()} unique slots`}
        />
        <MetricCard
          icon={<Users className="h-4 w-4 text-slate-600" />}
          label="Duplicate Slot Rows"
          value={summary.duplicateCount.toLocaleString()}
          helper="Same user/date/time — ignored"
        />
        <MetricCard
          icon={<CheckCircle2 className="h-4 w-4 text-green-500" />}
          label="Clean Rows"
          value={summary.clean.toLocaleString()}
          helper="No warnings detected"
        />
        <MetricCard
          icon={<AlertCircle className="h-4 w-4 text-orange-500" />}
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
          icon={<Timer className="h-4 w-4 text-amber-500" />}
          label="Duration Alerts"
          value={summary.durationAlerts.toLocaleString()}
          helper="Under 80% or over 120%"
        />
      </div>

      {summary.total > 0 && (
        <Card className="border border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle>Timing Insights</CardTitle>
            <CardDescription>Compare planned intent against care delivery reality.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <TimingStat
              title="Average Schedule Drift"
              value={formatMinutesDisplay(summary.averageDriftMinutes)}
              helper={`${summary.scheduleAlerts.toLocaleString()} rows exceeded the 2h tolerance.`}
              tone=
                {summary.averageDriftMinutes !== null && summary.averageDriftMinutes > 120
                  ? "destructive"
                  : summary.averageDriftMinutes !== null && summary.averageDriftMinutes > 90
                  ? "warning"
                  : "default"}
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
              tone=
                {summary.averageDurationPercent !== null && summary.averageDurationPercent < 80
                  ? "destructive"
                  : summary.averageDurationPercent !== null && summary.averageDurationPercent > 120
                  ? "warning"
                  : summary.averageDurationPercent !== null && summary.averageDurationPercent < 90
                  ? "warning"
                  : "default"}
              badge={
                summary.averageDurationPercent !== null
                  ? `${Math.round(summary.averageDurationPercent)}% actual`
                  : undefined
              }
            />
          </CardContent>
        </Card>
      )}

      {slotTrends.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recurring Slot Trends</CardTitle>
            <CardDescription>
              Detect consistent drift for the same service user and planned slot, then suggest practical updates to planned times or durations.
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
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Service User • Slot</p>
                      <p className="text-base font-semibold text-foreground">
                        {trend.serviceUserName || "Unknown"} • {trend.slotLabel}
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
      )}

      <Card>
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>Row-Level Analysis</CardTitle>
            <CardDescription>Use filters to triage thousands of rows quickly.</CardDescription>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search row or keyword"
                className="pl-9 w-full md:w-64"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={filterStatus === "all" ? "default" : "secondary"}
                onClick={() => setFilterStatus("all")}
              >
                All
              </Button>
              <Button
                type="button"
                size="sm"
                variant={filterStatus === "clean" ? "default" : "secondary"}
                onClick={() => setFilterStatus("clean")}
              >
                Clean
              </Button>
              <Button
                type="button"
                size="sm"
                variant={filterStatus === "attention" ? "default" : "secondary"}
                onClick={() => setFilterStatus("attention")}
              >
                Needs Attention
              </Button>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch id="toggle-duplicates" checked={showDuplicateRows} onCheckedChange={setShowDuplicateRows} />
              <label htmlFor="toggle-duplicates" className="font-medium">
                Show duplicate slot rows
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {analysisResults.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              <p>Upload data to see row-by-row insights.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <ScrollArea className="max-h-[480px] rounded-md border border-border/80">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 w-16">Row</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Highlights</th>
                      <th className="px-4 py-3">Issues</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => (
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
                            {row.isDuplicateSlotRow && <InsightPill tone="warning">Duplicate slot</InsightPill>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {row.issues.length ? row.issues.join(", ") : "No issues detected"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>

              {visibleRows.length < filteredResults.length && (
                <Button onClick={handleLoadMore} variant="secondary" className="w-full">
                  Load {Math.min(INITIAL_VISIBLE_ROWS, filteredResults.length - visibleRows.length)} more rows
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {duplicateClusters.length > 0 && (
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
      )}

      {selectedRow && (
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
      )}

      {callGroups.length > 0 && (
        <Card>
          <CardHeader className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <CardTitle>Service User Call Stacks</CardTitle>
              <CardDescription>
                Search for a service user to focus the list. We keep the view lightweight by showing the five closest matches.
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
          <CardContent className="space-y-6">
            {callGroupSearch.trim() && !hasSearchMatch && (
              <p className="text-xs text-muted-foreground">
                No direct match found — showing the nearest stacks instead.
              </p>
            )}
            {visibleCallGroups.map((group) => {
              const flaggedRows = group.rows.filter((row) => row.scheduleFlag || row.durationFlag).length;
              const driftValues = group.rows
                .map((row) => (typeof row.scheduleDeltaMinutes === "number" ? Math.abs(row.scheduleDeltaMinutes) : null))
                .filter((value): value is number => value !== null);
              const averageDrift = driftValues.length
                ? driftValues.reduce((acc, val) => acc + val, 0) / driftValues.length
                : null;
              const durationValues = group.rows
                .map((row) => (typeof row.durationMatchPercent === "number" ? row.durationMatchPercent : null))
                .filter((value): value is number => value !== null);
              const averageDuration = durationValues.length
                ? durationValues.reduce((acc, val) => acc + val, 0) / durationValues.length
                : null;
              const workerSet = new Set(
                group.rows
                  .map((row) => row.actualWorker || row.plannedWorker || undefined)
                  .filter((value): value is string => Boolean(value))
              );

              return (
                <div key={group.key} className="rounded-2xl border border-border/70 bg-card/50 p-5 space-y-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Service User</p>
                      <p className="text-xl font-semibold text-foreground">
                        {group.serviceUserName || "Unknown service user"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {(group.serviceUserArea || "Area unavailable").toString()} • {group.serviceUserAddress || "Address unavailable"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Planned time: {group.plannedTimeLabel || "Not supplied"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="text-xs font-semibold">
                        {group.rows.length} call{group.rows.length === 1 ? "" : "s"}
                      </Badge>
                      <Badge variant={flaggedRows ? "destructive" : "secondary"} className="text-xs font-semibold">
                        {flaggedRows} flagged
                      </Badge>
                      <Badge variant="secondary" className="text-xs font-semibold">
                        {workerSet.size || 1} carer{workerSet.size === 1 ? "" : "s"}
                      </Badge>
                    </div>
                  </div>
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
                      value={group.rows.length ? `${Math.round((flaggedRows / group.rows.length) * 100)}%` : "0%"}
                      helper="Flagged rows in stack"
                      tone={flaggedRows ? (flaggedRows / group.rows.length > 0.5 ? "destructive" : "warning") : "default"}
                    />
                  </div>
                  <div className="space-y-3">
                    {group.rows.map((row, idx) => (
                      <div
                        key={`${group.key}-${row.rowNumber}`}
                        className="rounded-xl border border-border/60 bg-background/60 p-4 space-y-2"
                      >
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Call {idx + 1}</p>
                            <p className="font-semibold text-sm">
                              {row.actualWorker || row.plannedWorker || "Care worker unavailable"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {row.plannedTimeLabel || "—"} → {row.actualTimeLabel || "—"}
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
                            {row.status === "attention" && <InsightPill tone="warning">Manual review</InsightPill>}
                          </div>
                        </div>
                        {row.issues.length > 0 && (
                          <p className="text-xs text-muted-foreground">{row.issues.join(" • ")}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {callGroups.length > visibleCallGroups.length && !callGroupSearch.trim() && (
              <p className="text-xs text-muted-foreground text-center">
                Showing the first 5 of {callGroups.length.toLocaleString()} stacks. Use search to focus on a specific service user.
              </p>
            )}
            {callGroupSearch.trim() && (
              <p className="text-xs text-muted-foreground text-center">
                Showing up to 5 matches. Refine your search to zero in on a single service user.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(1)} ${units[index]}`;
}

function UploadCloudIcon() {
  return (
    <svg
      className="h-5 w-5 text-muted-foreground"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 15.5a4.5 4.5 0 0 0-3.7-4.4 5 5 0 0 0-9.6-1.3A4 4 0 0 0 4 13.5 4 4 0 0 0 8 17h3" />
      <path d="m12 12-4 4m4-4 4 4m-4-4v9" />
    </svg>
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {helper && <p className="text-xs text-muted-foreground mt-1">{helper}</p>}
      </CardContent>
    </Card>
  );
}

type InsightTone = "default" | "warning" | "destructive";

const toneSurfaceMap: Record<InsightTone, string> = {
  default: "border-emerald-500/30 bg-emerald-500/5",
  warning: "border-amber-500/30 bg-amber-500/5",
  destructive: "border-red-500/30 bg-red-500/5",
};

const toneTextMap: Record<InsightTone, string> = {
  default: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  destructive: "text-red-600 dark:text-red-400",
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
    <div className={`rounded-2xl border p-4 ${toneSurfaceMap[tone]}`}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="flex items-baseline gap-2 mt-2">
        <span className="text-2xl font-semibold text-foreground">{value}</span>
        {badge && <span className={`text-xs font-semibold ${toneTextMap[tone]}`}>{badge}</span>}
      </div>
      <p className="text-xs text-muted-foreground mt-1">{helper}</p>
    </div>
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
    <div className={`rounded-2xl border px-4 py-3 ${toneSurfaceMap[tone]}`}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-foreground mt-1">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{helper}</p>
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
    <div className={`rounded-2xl border p-4 ${toneSurfaceMap[tone]}`}>
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
    default: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    warning: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    destructive: "bg-red-500/15 text-red-600 dark:text-red-400",
  };
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1 ${toneClass[tone]}`}>
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

function normalizeKeyForMatch(label: string) {
  return label.replace(/[_-]+/g, " ").trim().toLowerCase();
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

function parseTimeToMinutes(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const excelMinutes = excelSerialToMinutes(value);
    if (excelMinutes !== null) return excelMinutes;
    if (value >= 0 && value < 1) {
      return value * 24 * 60;
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

  if (typeof value === "number" && Number.isFinite(value)) {
    const excelMinutes = excelSerialToMinutes(value);
    if (excelMinutes !== null) return excelMinutes;
    if (prefersHours) return value * 60;
    if (prefersMinutes) return value;
    if (value <= 12) return value * 60;
    return value;
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

  const hhmm = str.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    return Number(hhmm[1]) * 60 + Number(hhmm[2]);
  }

  const numeric = Number(str.replace(/[^0-9.]/g, ""));
  if (!Number.isNaN(numeric)) {
    if (prefersHours) return numeric * 60;
    if (prefersMinutes) return numeric;
    if (numeric <= 12) return numeric * 60;
    return numeric;
  }

  return null;
}

function excelSerialToMinutes(value: number): number | null {
  const parser = (XLSX as any).SSF?.parse_date_code;
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
    const parser = (XLSX as any).SSF?.parse_date_code;
    if (typeof parser === "function") {
      const parts = parser(value);
      if (parts && typeof parts.y === "number" && typeof parts.m === "number" && typeof parts.d === "number") {
        return new Date(parts.y, parts.m - 1, parts.d, parts.H ?? parts.h ?? 0, parts.M ?? parts.m ?? 0, parts.S ?? parts.s ?? 0);
      }
    }
  }

  const str = String(value).trim();
  if (!str) return null;

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

function buildDuplicateSlotKey(row: RowAnalysis): string | null {
  if (!row.normalizedServiceUserKey) return null;
  if (!row.plannedDateKey) return null;
  if (typeof row.plannedTimeMinutes !== "number") return null;
  return `${row.normalizedServiceUserKey}|${row.plannedDateKey}|${Math.round(row.plannedTimeMinutes)}`;
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

function clampMinutesOfDay(value: number): number {
  const mod = ((value % (24 * 60)) + 24 * 60) % (24 * 60);
  return mod;
}

function roundToNearest(value: number, step: number): number {
  if (!Number.isFinite(value)) return value;
  if (!step || step <= 0) return value;
  return Math.round(value / step) * step;
}
