import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RefreshCw, Shield, Download, Copy, Pencil, Calendar, Users } from "lucide-react";
import { Link } from "wouter";
import { WeeklyPlannerGrid } from "@/components/rostering/WeeklyPlannerGrid";

type OptimizedRouteEntry = {
  key: string;
  serviceUserName: string | null;
  serviceUserArea?: string | null;
  serviceUserAddress?: string | null;
  callTypeLabel: string | null;
  timeBandLabel: string | null;
  requirementStartMinutes?: number | null;
  scheduledStartMinutes: number | null;
  scheduledEndMinutes: number | null;
  durationMinutes: number | null;
  shiftMinutes?: number | null;
  travelMinutesEstimated?: number | null;
  isTimeCritical?: boolean;
  isDoubleUp?: boolean;
  windowStartMinutes?: number | null;
  windowEndMinutes?: number | null;
  isOutsideWindow?: boolean;
  hasWindowConflict?: boolean;
  suggestedStartMinutes?: number | null;
  recommendedStartMinutes?: number | null;
};

type ShiftBarEntry = {
  startMinutes: number | null;
  endMinutes: number | null;
  durationMinutes: number | null;
};

type CareWorkerRotaPayload = {
  workerName: string;
  workerKey: string;
  templateWeek: "week1" | "week2";
  templateDay: string;
  timeCriticalWindowEnforced?: boolean;
  shiftBars?: ShiftBarEntry[];
  optimizedRun: OptimizedRouteEntry[];
  workerStartMinutes?: number | null;
  workerEndMinutes?: number | null;
};

type CareWorkerRotaRecord = {
  id: string;
  workerName: string;
  workerKey: string;
  templateWeek: string;
  templateDay: string;
  payload: CareWorkerRotaPayload;
  createdByUsername?: string | null;
  createdAt: string;
};

type WorkbookSummary = {
  id: string;
  name: string;
  fileName: string;
  totalRows: number;
  careWorkerCount: number;
  serviceUserCount: number;
  callGroupCount: number;
  createdByUsername?: string | null;
  createdAt: string;
};

type WorkerCallGroup = {
  key: string;
  serviceUserName: string | null;
  serviceUserArea?: string | null;
  serviceUserAddress?: string | null;
  normalizedServiceUserKey?: string | null;
  callTypeLabel: string | null;
  timeBandLabel?: string | null;
  requirementStartMinutes: number | null;
  durationMinutes: number | null;
  totalCalls: number;
  isTimeCritical: boolean;
  templatedWeekdayKeys?: string[];
  templatedRows?: number;
  doubleUpWeekdayKeys?: string[];
};

type WorkbookCareWorkerRoster = {
  key: string;
  workerName: string;
  workerNameNormalized: string;
  callGroups: WorkerCallGroup[];
  shiftBars?: ShiftBarEntry[];
};

type WorkbookFull = {
  id: string;
  name: string;
  fileName: string;
  careWorkerRosters: WorkbookCareWorkerRoster[];
  createdAt: string;
};

const TEMPLATE_WEEK_LABELS: Record<string, string> = {
  week1: "Week 1",
  week2: "Week 2",
};
const PLANNER_DAY_START_MINUTES = 0;
const PLANNER_DAY_END_MINUTES = 24 * 60;
const WEEKDAY_OPTIONS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
const ROSTER_DAY_START_MINUTES = 6 * 60;
const ROSTER_DAY_SOFT_END_MINUTES = 22 * 60;
const ROSTER_DAY_HARD_END_MINUTES = 23 * 60;

const getCallTypeTone = (callTypeLabel: string | null | undefined) => {
  const label = (callTypeLabel || "").toLowerCase();
  if (label.includes("am") || label.includes("morning")) {
    return "bg-emerald-400 border-emerald-600 text-emerald-900";
  }
  if (label.includes("lunch")) {
    return "bg-amber-300 border-amber-500 text-amber-900";
  }
  if (label.includes("tea")) {
    return "bg-orange-300 border-orange-500 text-orange-900";
  }
  if (label.includes("evening") || label.includes("pm")) {
    return "bg-lime-300 border-lime-500 text-lime-900";
  }
  if (label.includes("night")) {
    return "bg-sky-300 border-sky-500 text-sky-900";
  }
  return "bg-yellow-300 border-yellow-500 text-yellow-900";
};

function formatMinutesLabel(minutes: number | null | undefined): string {
  if (typeof minutes !== "number" || Number.isNaN(minutes)) return "—";
  const normalized = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hrs = Math.floor(normalized / 60);
  const mins = Math.round(normalized % 60);
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

function minutesToTimeInput(minutes: number | null | undefined): string {
  if (typeof minutes !== "number" || Number.isNaN(minutes)) return "";
  return formatMinutesLabel(minutes);
}

function timeInputToMinutes(value: string): number | null {
  const trimmed = value.trim();
  if (!/^[0-2]\d:[0-5]\d$/.test(trimmed)) return null;
  const [hours, minutes] = trimmed.split(":").map((part) => Number(part));
  if (hours >= 24) return null;
  return hours * 60 + minutes;
}

function formatDurationLabel(minutes: number | null | undefined): string {
  if (typeof minutes !== "number" || Number.isNaN(minutes)) return "—";
  const abs = Math.abs(minutes);
  const hrs = Math.floor(abs / 60);
  const mins = Math.round(abs % 60);
  const parts: string[] = [];
  if (hrs) parts.push(`${hrs}h`);
  if (mins) parts.push(`${mins}m`);
  if (!parts.length) parts.push("0m");
  return parts.join(" ");
}

function buildScheduledEnd(
  startMinutes: number | null,
  scheduledEndMinutes: number | null | undefined,
  durationMinutes: number | null | undefined
): number | null {
  if (typeof startMinutes !== "number") return null;
  if (typeof scheduledEndMinutes === "number") return scheduledEndMinutes;
  if (typeof durationMinutes === "number") return startMinutes + durationMinutes;
  return null;
}

function findOverlap(entries: OptimizedRouteEntry[]): { first: OptimizedRouteEntry; second: OptimizedRouteEntry } | null {
  const scheduled = entries
    .map((entry) => {
      const start = typeof entry.scheduledStartMinutes === "number" ? entry.scheduledStartMinutes : null;
      const end = buildScheduledEnd(start, entry.scheduledEndMinutes, entry.durationMinutes);
      if (typeof start !== "number" || typeof end !== "number") return null;
      const normalizedEnd = end < start ? end + 24 * 60 : end;
      return { entry, start, end: normalizedEnd };
    })
    .filter(Boolean) as Array<{ entry: OptimizedRouteEntry; start: number; end: number }>;
  scheduled.sort((a, b) => a.start - b.start);
  for (let i = 1; i < scheduled.length; i++) {
    const prev = scheduled[i - 1];
    const curr = scheduled[i];
    if (curr.start < prev.end) {
      return { first: prev.entry, second: curr.entry };
    }
  }
  return null;
}

function applyFixedDoubleUp(
  entries: OptimizedRouteEntry[],
  fixedKey: string,
  fixedStart: number,
  fixedEnd: number
): OptimizedRouteEntry[] {
  const durationFallback = 30;
  const fixedDuration = Math.max(0, fixedEnd - fixedStart);
  const withFixed = entries.map((entry) =>
    entry.key === fixedKey
      ? {
          ...entry,
          scheduledStartMinutes: fixedStart,
          scheduledEndMinutes: fixedEnd,
          durationMinutes: fixedDuration || entry.durationMinutes || durationFallback,
        }
      : entry
  );

  const sorted = [...withFixed].sort((a, b) => {
    const aStart = typeof a.scheduledStartMinutes === "number" ? a.scheduledStartMinutes : Number.POSITIVE_INFINITY;
    const bStart = typeof b.scheduledStartMinutes === "number" ? b.scheduledStartMinutes : Number.POSITIVE_INFINITY;
    return aStart - bStart;
  });

  let cursor = fixedEnd;
  const updated = sorted.map((entry) => {
    if (entry.key === fixedKey) return entry;
    if (typeof entry.scheduledStartMinutes !== "number") return entry;
    const duration = typeof entry.durationMinutes === "number" ? entry.durationMinutes : durationFallback;
    const start = Math.max(entry.scheduledStartMinutes, cursor);
    const end = Math.min(24 * 60, start + duration);
    cursor = end;
    return { ...entry, scheduledStartMinutes: start, scheduledEndMinutes: end };
  });

  const updatedMap = new Map(updated.map((entry) => [entry.key, entry]));
  return entries.map((entry) => updatedMap.get(entry.key) ?? entry);
}

function buildChangePreview(
  before: OptimizedRouteEntry[],
  after: OptimizedRouteEntry[]
): Array<{
  key: string;
  name: string;
  beforeStart: number | null;
  beforeEnd: number | null;
  afterStart: number | null;
  afterEnd: number | null;
}> {
  const afterMap = new Map(after.map((entry) => [entry.key, entry]));
  const changes: Array<{
    key: string;
    name: string;
    beforeStart: number | null;
    beforeEnd: number | null;
    afterStart: number | null;
    afterEnd: number | null;
  }> = [];
  before.forEach((entry) => {
    const next = afterMap.get(entry.key);
    if (!next) return;
    const beforeStart = typeof entry.scheduledStartMinutes === "number" ? entry.scheduledStartMinutes : null;
    const beforeEnd = typeof entry.scheduledEndMinutes === "number" ? entry.scheduledEndMinutes : null;
    const afterStart = typeof next.scheduledStartMinutes === "number" ? next.scheduledStartMinutes : null;
    const afterEnd = typeof next.scheduledEndMinutes === "number" ? next.scheduledEndMinutes : null;
    if (beforeStart !== afterStart || beforeEnd !== afterEnd) {
      changes.push({
        key: entry.key,
        name: entry.serviceUserName || entry.callTypeLabel || "Visit",
        beforeStart,
        beforeEnd,
        afterStart,
        afterEnd,
      });
    }
  });
  return changes;
}

function formatDateLabel(isoString: string | null | undefined): string {
  if (!isoString) return "—";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return date.toLocaleString();
}

function SummaryMetric({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/60 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">{value}</p>
      {helper && <p className="text-xs text-muted-foreground">{helper}</p>}
    </div>
  );
}

export default function CareWorkerRotas() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rotas, setRotas] = useState<CareWorkerRotaRecord[]>([]);
  const [selectedRotaId, setSelectedRotaId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftPayload, setDraftPayload] = useState<CareWorkerRotaPayload | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [plannerWeek, setPlannerWeek] = useState<"week1" | "week2">("week1");
  const [plannerDay, setPlannerDay] = useState<(typeof WEEKDAY_OPTIONS)[number]>("Monday");
  const [selectedPlannerEntryId, setSelectedPlannerEntryId] = useState<string | null>(null);
  const [plannerZoom, setPlannerZoom] = useState(1);
  const [workbooks, setWorkbooks] = useState<WorkbookSummary[]>([]);
  const [workbooksLoading, setWorkbooksLoading] = useState(false);
  const [selectedWorkbook, setSelectedWorkbook] = useState<WorkbookFull | null>(null);
  const [selectedWorkbookWorkerKey, setSelectedWorkbookWorkerKey] = useState<string | null>(null);
  const [isCreatingRota, setIsCreatingRota] = useState(false);
  const workbookCacheRef = useRef<Map<string, WorkbookFull>>(new Map());
  const templateKey = useMemo(() => `${plannerWeek}|${plannerDay}`, [plannerDay, plannerWeek]);
  const [linkedUpdates, setLinkedUpdates] = useState<Record<string, CareWorkerRotaPayload>>({});
  const [doubleUpConflict, setDoubleUpConflict] = useState<{
    targetRotaId: string;
    targetWorkerName: string;
    updatedPayload: CareWorkerRotaPayload;
    originalPayload: CareWorkerRotaPayload;
    conflictWith?: OptimizedRouteEntry | null;
    fixedKey: string;
    fixedStart: number;
    fixedEnd: number;
    sourceEntrySnapshot?: OptimizedRouteEntry;
  } | null>(null);
  const [workbookWorkerSearch, setWorkbookWorkerSearch] = useState("");

  const fetchRotas = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/care-worker-rotas", {
        credentials: "include",
      });

      let data: any = null;
      let rawText = "";
      try {
        data = await response.clone().json();
      } catch {
        rawText = await response
          .clone()
          .text()
          .catch(() => "");
      }

      if (!response.ok) {
        const message =
          (typeof data?.message === "string" && data.message.trim()) ||
          rawText.trim() ||
          `Unable to load care worker rotas (HTTP ${response.status}).`;
        throw new Error(message);
      }

      setRotas(Array.isArray(data) ? data : []);
    } catch (error: any) {
      toast({
        title: "Load failed",
        description: error.message || "Unable to load saved rotas.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchRotas();
  }, [fetchRotas]);

  const fetchWorkbooks = useCallback(async () => {
    setWorkbooksLoading(true);
    try {
      const response = await fetch("/api/admin/testing-features/workbooks", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`Unable to load workbooks (HTTP ${response.status}).`);
      }
      const data = await response.json();
      setWorkbooks(Array.isArray(data) ? data : []);
    } catch (error: any) {
      toast({
        title: "Workbook load failed",
        description: error.message || "Unable to load saved workbooks.",
        variant: "destructive",
      });
    } finally {
      setWorkbooksLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchWorkbooks();
  }, [fetchWorkbooks]);

  const fetchWorkbook = useCallback(
    async (id: string) => {
      try {
        const cached = workbookCacheRef.current.get(id);
        if (cached) {
          setSelectedWorkbook(cached);
          return cached;
        }
        const response = await fetch(`/api/admin/testing-features/workbooks/${id}`, {
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error(`Unable to load workbook details (HTTP ${response.status}).`);
        }
        const data = await response.json();
        setSelectedWorkbook(data);
        workbookCacheRef.current.set(id, data);
        return data;
      } catch (error: any) {
        setSelectedWorkbook(null);
        toast({
          title: "Workbook load failed",
          description: error.message || "Unable to load workbook details.",
          variant: "destructive",
        });
        return null;
      }
    },
    [toast]
  );

  useEffect(() => {
    if (!workbooks.length) {
      setSelectedWorkbook(null);
      setSelectedWorkbookWorkerKey(null);
      return;
    }
    const resolveWorkbookForTemplate = async () => {
      const sorted = [...workbooks].sort((a, b) => {
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        return bTime - aTime;
      });
      for (const workbook of sorted) {
        const data = await fetchWorkbook(workbook.id);
        if (!data?.careWorkerRosters?.length) continue;
        const hasTemplate = data.careWorkerRosters.some((worker) =>
          (worker.callGroups || []).some((group) =>
            Array.isArray(group.templatedWeekdayKeys)
              ? group.templatedWeekdayKeys.includes(templateKey)
              : true
          )
        );
        if (hasTemplate) {
          return;
        }
      }
    };
    void resolveWorkbookForTemplate();
  }, [fetchWorkbook, templateKey, workbooks]);

  const selectedRota = useMemo(
    () => rotas.find((rota) => rota.id === selectedRotaId) ?? null,
    [rotas, selectedRotaId]
  );

  const activePayload = useMemo(() => {
    if (isEditing && draftPayload) return draftPayload;
    return selectedRota?.payload ?? null;
  }, [draftPayload, isEditing, selectedRota?.payload]);

  useEffect(() => {
    setIsEditing(false);
    setSavingEdit(false);
    if (selectedRota?.payload) {
      setDraftPayload(JSON.parse(JSON.stringify(selectedRota.payload)) as CareWorkerRotaPayload);
    } else {
      setDraftPayload(null);
    }
  }, [selectedRota?.id, selectedRota?.payload]);

  useEffect(() => {
    if (!selectedRota) return;
    if (selectedRota.templateWeek === "week1" || selectedRota.templateWeek === "week2") {
      setPlannerWeek(selectedRota.templateWeek);
    }
    if (WEEKDAY_OPTIONS.includes(selectedRota.templateDay as (typeof WEEKDAY_OPTIONS)[number])) {
      setPlannerDay(selectedRota.templateDay as (typeof WEEKDAY_OPTIONS)[number]);
    }
  }, [selectedRota]);

  useEffect(() => {
    setSelectedPlannerEntryId(null);
  }, [plannerWeek, plannerDay]);

  useEffect(() => {
    if (!selectedWorkbook?.careWorkerRosters?.length) {
      setSelectedWorkbookWorkerKey(null);
      return;
    }
    if (
      selectedWorkbookWorkerKey &&
      selectedWorkbook.careWorkerRosters.some((worker) => worker.key === selectedWorkbookWorkerKey)
    ) {
      return;
    }
    setSelectedWorkbookWorkerKey(selectedWorkbook.careWorkerRosters[0]?.key ?? null);
  }, [selectedWorkbook, selectedWorkbookWorkerKey]);

  const rosterSummary = useMemo(() => {
    const entries = activePayload?.optimizedRun ?? [];
    if (!entries.length) return null;
    const scheduledEntries = entries.filter(
      (entry) => typeof entry.scheduledStartMinutes === "number" && typeof entry.scheduledEndMinutes === "number"
    );
    const unscheduledCount = entries.length - scheduledEntries.length;
    const totalDurationMinutes = scheduledEntries.reduce((total, entry) => {
      const duration = typeof entry.durationMinutes === "number" ? entry.durationMinutes : 0;
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
    const timeCriticalCount = entries.filter((entry) => entry.isTimeCritical).length;
    const doubleUpCount = entries.filter((entry) => entry.isDoubleUp).length;

    return {
      totalCalls: entries.length,
      scheduledCount: scheduledEntries.length,
      unscheduledCount,
      totalDurationMinutes,
      earliestStart,
      latestEnd,
      idleMinutes,
      beforeStartCount,
      afterSoftCount,
      afterHardCount,
      timeCriticalCount,
      doubleUpCount,
    };
  }, [activePayload?.optimizedRun]);

  const plannerRotas = useMemo(() => {
    const filtered = rotas.filter(
      (rota) => rota.templateWeek === plannerWeek && rota.templateDay === plannerDay
    );
    const byWorker = new Map<string, CareWorkerRotaRecord>();
    filtered.forEach((rota) => {
      const existing = byWorker.get(rota.workerKey);
      if (!existing) {
        byWorker.set(rota.workerKey, rota);
        return;
      }
      const existingTime = new Date(existing.createdAt).getTime();
      const nextTime = new Date(rota.createdAt).getTime();
      if (Number.isFinite(nextTime) && nextTime > existingTime) {
        byWorker.set(rota.workerKey, rota);
      }
    });
    return Array.from(byWorker.values()).sort((a, b) =>
      a.workerName.localeCompare(b.workerName)
    );
  }, [plannerDay, plannerWeek, rotas]);

  const { plannerLanes, plannerUnscheduled, plannerEntryToRota } = useMemo(() => {
    const entryToRota = new Map<string, CareWorkerRotaRecord>();
    const unscheduled: Array<{
      rota: CareWorkerRotaRecord;
      entry: OptimizedRouteEntry;
    }> = [];

    const lanes = plannerRotas.map((rota) => {
      const entries = (rota.payload?.optimizedRun ?? []).flatMap((entry) => {
        const start = entry.scheduledStartMinutes;
        const end = entry.scheduledEndMinutes;
        if (typeof start !== "number" || typeof end !== "number") {
          unscheduled.push({ rota, entry });
          return [];
        }
        let duration =
          typeof entry.durationMinutes === "number"
            ? entry.durationMinutes
            : end - start;
        if (duration < 0) duration += 24 * 60;
        const id = `${rota.id}::${entry.key}`;
        entryToRota.set(id, rota);
        return [
          {
            id,
            title: entry.serviceUserName || entry.callTypeLabel || "Visit",
            startMinutes: start,
            durationMinutes: Math.max(5, duration || 0),
            serviceUserName: entry.serviceUserName,
            callTypeLabel: entry.callTypeLabel,
            isTimeCritical: entry.isTimeCritical,
            address: entry.serviceUserAddress ?? null,
          },
        ];
      });

      return {
        id: rota.workerKey,
        label: rota.workerName,
        entries,
      };
    });

    return { plannerLanes: lanes, plannerUnscheduled: unscheduled, plannerEntryToRota: entryToRota };
  }, [plannerRotas]);

  const plannerShiftBars = useMemo(() => {
    const map = new Map<string, ShiftBarEntry[]>();
    plannerRotas.forEach((rota) => {
      if (Array.isArray(rota.payload?.shiftBars) && rota.payload.shiftBars.length > 0) {
        map.set(rota.workerKey, rota.payload.shiftBars);
      }
    });
    return map;
  }, [plannerRotas]);

  const plannerSummary = useMemo(() => {
    const totalCalls = plannerLanes.reduce((acc, lane) => acc + lane.entries.length, 0);
    return {
      totalWorkers: plannerLanes.length,
      totalCalls,
      unscheduledCount: plannerUnscheduled.length,
    };
  }, [plannerLanes, plannerUnscheduled.length]);

  const plannerDayRows = useMemo(() => {
    const totals = WEEKDAY_OPTIONS.map((day) => ({
      day,
      unallocated: 0,
      allocated: 0,
    }));
    const dayIndex = new Map(WEEKDAY_OPTIONS.map((day, idx) => [day, idx]));
    rotas
      .filter((rota) => rota.templateWeek === plannerWeek)
      .forEach((rota) => {
        const idx = dayIndex.get(rota.templateDay as (typeof WEEKDAY_OPTIONS)[number]);
        if (typeof idx !== "number") return;
        const rows = rota.payload?.optimizedRun ?? [];
        rows.forEach((entry) => {
          const hasSchedule =
            typeof entry.scheduledStartMinutes === "number" &&
            typeof entry.scheduledEndMinutes === "number";
          if (hasSchedule) totals[idx].allocated += 1;
          else totals[idx].unallocated += 1;
        });
      });
    return totals;
  }, [plannerWeek, rotas]);

  const plannerLaneStats = useMemo(() => {
    const map = new Map<string, { totalMinutes: number; callCount: number }>();
    plannerLanes.forEach((lane) => {
      const totalMinutes = lane.entries.reduce((acc, entry) => acc + entry.durationMinutes, 0);
      map.set(lane.id, { totalMinutes, callCount: lane.entries.length });
    });
    return map;
  }, [plannerLanes]);

  const buildNonOverlappingRun = useCallback((entries: OptimizedRouteEntry[]) => {
    const scheduled = entries
      .map((entry) => ({
        ...entry,
        scheduledStartMinutes: typeof entry.scheduledStartMinutes === "number" ? entry.scheduledStartMinutes : null,
        durationMinutes: typeof entry.durationMinutes === "number" ? entry.durationMinutes : null,
        suggestedStartMinutes:
          typeof entry.suggestedStartMinutes === "number"
            ? entry.suggestedStartMinutes
            : typeof entry.scheduledStartMinutes === "number"
            ? entry.scheduledStartMinutes
            : null,
      }))
      .sort((a, b) => {
        const aStart = typeof a.scheduledStartMinutes === "number" ? a.scheduledStartMinutes : Number.POSITIVE_INFINITY;
        const bStart = typeof b.scheduledStartMinutes === "number" ? b.scheduledStartMinutes : Number.POSITIVE_INFINITY;
        return aStart - bStart;
      });

    let cursor = 0;
    return scheduled.map((entry) => {
      if (typeof entry.scheduledStartMinutes !== "number") {
        return { ...entry, scheduledEndMinutes: null };
      }
      const duration = typeof entry.durationMinutes === "number" ? entry.durationMinutes : 30;
      const start = Math.max(entry.scheduledStartMinutes, cursor);
      const end = Math.min(24 * 60, start + duration);
      cursor = end;
      if (start >= 24 * 60) {
        return { ...entry, scheduledStartMinutes: null, scheduledEndMinutes: null };
      }
      return { ...entry, scheduledStartMinutes: start, scheduledEndMinutes: end };
    });
  }, []);

  const handleCreateRota = useCallback(async () => {
    if (!selectedWorkbook || !selectedWorkbookWorkerKey) {
      toast({
        title: "Select a workbook",
        description: "Choose a saved workbook and care worker to build a rota.",
        variant: "destructive",
      });
      return;
    }
    const roster = selectedWorkbook.careWorkerRosters.find((worker) => worker.key === selectedWorkbookWorkerKey);
    if (!roster) {
      toast({
        title: "Care worker missing",
        description: "The selected care worker was not found in this workbook.",
        variant: "destructive",
      });
      return;
    }

    const eligibleGroups = roster.callGroups;

    if (!eligibleGroups.length) {
      toast({
        title: "No template calls",
        description: "No calls were found for the selected Week/Day template.",
        variant: "destructive",
      });
      return;
    }

    const baseEntries: OptimizedRouteEntry[] = eligibleGroups.map((group) => {
      const startMinutes = typeof group.requirementStartMinutes === "number" ? group.requirementStartMinutes : null;
      const duration = typeof group.durationMinutes === "number" ? group.durationMinutes : null;
      const isDoubleUp =
        Array.isArray(group.doubleUpWeekdayKeys) && group.doubleUpWeekdayKeys.includes(templateKey);
      return {
        key: group.key,
        serviceUserName: group.serviceUserName ?? null,
        serviceUserArea: group.serviceUserArea ?? null,
        serviceUserAddress: group.serviceUserAddress ?? null,
        callTypeLabel: group.callTypeLabel ?? null,
        timeBandLabel: group.timeBandLabel ?? null,
        requirementStartMinutes: startMinutes,
        scheduledStartMinutes: startMinutes,
        scheduledEndMinutes: startMinutes !== null && duration !== null ? startMinutes + duration : null,
        durationMinutes: duration,
        shiftMinutes: null,
        travelMinutesEstimated: null,
        isTimeCritical: group.isTimeCritical,
        isDoubleUp,
        windowStartMinutes: null,
        windowEndMinutes: null,
        isOutsideWindow: false,
        hasWindowConflict: false,
        suggestedStartMinutes: startMinutes,
      };
    });

    const scheduledRun = buildNonOverlappingRun(baseEntries).map((entry) => ({
      ...entry,
      recommendedStartMinutes:
        typeof entry.scheduledStartMinutes === "number" ? entry.scheduledStartMinutes : entry.recommendedStartMinutes ?? null,
    }));
    const overlap = findOverlap(scheduledRun);
    if (overlap) {
      toast({
        title: "Overlapping calls",
        description: "Unable to build a rota without overlapping visits.",
        variant: "destructive",
      });
      return;
    }

    setIsCreatingRota(true);
    try {
    const payload: CareWorkerRotaPayload = {
      workerName: roster.workerName,
      workerKey: roster.key,
      templateWeek: plannerWeek,
      templateDay: plannerDay,
      timeCriticalWindowEnforced: false,
      shiftBars: roster.shiftBars ?? [],
      optimizedRun: scheduledRun,
    };

      const response = await fetch("/api/admin/care-worker-rotas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "Unable to save rota.");
      }

      toast({
        title: result.deduped ? "Rota already exists" : "Rota created",
        description: result.deduped
          ? "An identical rota already exists in the library."
          : "The new rota has been saved to the library.",
      });
      fetchRotas();
      setSelectedRotaId(result.rota?.id ?? null);
    } catch (error: any) {
      toast({
        title: "Create failed",
        description: error.message || "Unable to create a rota.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingRota(false);
    }
  }, [buildNonOverlappingRun, fetchRotas, plannerDay, plannerWeek, selectedWorkbook, selectedWorkbookWorkerKey, templateKey, toast]);

  const handleUpdateEntry = useCallback(
    (entryKey: string, updates: Partial<OptimizedRouteEntry>) => {
      setDraftPayload((prev) => {
        if (!prev) return prev;
        const idx = prev.optimizedRun.findIndex((entry) => entry.key === entryKey);
        if (idx === -1) return prev;
        const nextEntries = [...prev.optimizedRun];
        const currentEntry = nextEntries[idx];
        const nextEntry = { ...currentEntry, ...updates } as OptimizedRouteEntry;

        if (
          typeof nextEntry.scheduledStartMinutes === "number" &&
          typeof nextEntry.scheduledEndMinutes === "number"
        ) {
          let duration = nextEntry.scheduledEndMinutes - nextEntry.scheduledStartMinutes;
          if (duration < 0) duration += 24 * 60;
          nextEntry.durationMinutes = duration;
        }

        nextEntries[idx] = nextEntry;
        const nextPayload = { ...prev, optimizedRun: nextEntries };

        if (nextEntry.isDoubleUp && selectedRota) {
          const peers = rotas.filter(
            (rota) =>
              rota.id !== selectedRota.id &&
              rota.templateWeek === selectedRota.templateWeek &&
              rota.templateDay === selectedRota.templateDay
          );
          const peer = peers.find((rota) =>
            rota.payload.optimizedRun?.some(
              (entry) => entry.key === entryKey && entry.isDoubleUp
            )
          );
          if (peer) {
            const start = nextEntry.scheduledStartMinutes;
            const end = nextEntry.scheduledEndMinutes;
            if (typeof start === "number" && typeof end === "number") {
              const peerEntries = peer.payload.optimizedRun.map((entry) =>
                entry.key === entryKey
                  ? { ...entry, scheduledStartMinutes: start, scheduledEndMinutes: end }
                  : entry
              );
              const overlap = findOverlap(peerEntries);
              if (overlap) {
                setDoubleUpConflict({
                  targetRotaId: peer.id,
                  targetWorkerName: peer.workerName,
                  updatedPayload: {
                    ...peer.payload,
                    optimizedRun: peerEntries,
                  },
                  originalPayload: peer.payload,
                  conflictWith: overlap.second,
                  fixedKey: entryKey,
                  fixedStart: start,
                  fixedEnd: end,
                  sourceEntrySnapshot: currentEntry,
                });
              } else {
                setLinkedUpdates((prevLinked) => ({
                  ...prevLinked,
                  [peer.id]: { ...peer.payload, optimizedRun: peerEntries },
                }));
                setRotas((prevRotas) =>
                  prevRotas.map((rota) =>
                    rota.id === peer.id
                      ? { ...rota, payload: { ...rota.payload, optimizedRun: peerEntries } }
                      : rota
                  )
                );
              }
            }
          }
        }

        return nextPayload;
      });
    },
    [rotas, selectedRota]
  );

  const handleCancelEdits = useCallback(() => {
    if (selectedRota?.payload) {
      setDraftPayload(JSON.parse(JSON.stringify(selectedRota.payload)) as CareWorkerRotaPayload);
    } else {
      setDraftPayload(null);
    }
    setIsEditing(false);
  }, [selectedRota?.payload]);

  const handleSaveEdits = useCallback(async () => {
    if (!selectedRota || !draftPayload) return;
    const overlap = findOverlap(draftPayload.optimizedRun ?? []);
    if (overlap) {
      toast({
        title: "Overlapping calls",
        description: "Adjust the rota times so no visits overlap.",
        variant: "destructive",
      });
      return;
    }
    setSavingEdit(true);
    try {
      const payloadToSave: CareWorkerRotaPayload = {
        ...draftPayload,
        workerStartMinutes:
          typeof draftPayload.workerStartMinutes === "number" ? draftPayload.workerStartMinutes : null,
        workerEndMinutes: typeof draftPayload.workerEndMinutes === "number" ? draftPayload.workerEndMinutes : null,
      };

      const response = await fetch(`/api/admin/care-worker-rotas/${selectedRota.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...payloadToSave,
          workerName: selectedRota.workerName,
          workerKey: selectedRota.workerKey,
          templateWeek: selectedRota.templateWeek as "week1" | "week2",
          templateDay: selectedRota.templateDay as string,
        }),
      });

      let result: any = null;
      let rawText = "";
      try {
        result = await response.clone().json();
      } catch {
        rawText = await response
          .clone()
          .text()
          .catch(() => "");
      }

      if (!response.ok) {
        const message =
          (typeof result?.message === "string" && result.message.trim()) ||
          rawText.trim() ||
          `Unable to update rota (HTTP ${response.status}).`;
        throw new Error(message);
      }

      const updatedRota: CareWorkerRotaRecord = result.rota;
      setRotas((prev) => {
        const exists = prev.some((rota) => rota.id === updatedRota.id);
        if (!exists) return [updatedRota, ...prev];
        return prev.map((rota) => (rota.id === updatedRota.id ? updatedRota : rota));
      });
      setSelectedRotaId(updatedRota.id);
      setDraftPayload(JSON.parse(JSON.stringify(updatedRota.payload)) as CareWorkerRotaPayload);
      setIsEditing(false);

      const updatedLabel = result?.updated ? "Changes saved" : "No changes";
      const description = result?.deduped
        ? "An identical rota already exists. Showing the existing record instead."
        : result?.updated
        ? "The saved rota has been updated."
        : "No differences detected to save.";

      toast({ title: result?.deduped ? "Duplicate rota" : updatedLabel, description });
      if (Object.keys(linkedUpdates).length > 0) {
        const updateEntries = Object.entries(linkedUpdates);
        for (const [rotaId, payload] of updateEntries) {
          await fetch(`/api/admin/care-worker-rotas/${rotaId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(payload),
          });
        }
        setLinkedUpdates({});
      }
    } catch (error: any) {
      toast({
        title: "Update failed",
        description: error.message || "Unable to update the rota.",
        variant: "destructive",
      });
    } finally {
      setSavingEdit(false);
    }
  }, [draftPayload, linkedUpdates, selectedRota, toast]);

  const addShiftBar = useCallback(
    (startMinutes: number) => {
      const duration = 8 * 60;
      const endMinutes = startMinutes + duration;
      setDraftPayload((prev) => {
        if (!prev) return prev;
        const nextBars = [...(prev.shiftBars || [])];
        nextBars.push({
          startMinutes,
          endMinutes,
          durationMinutes: duration,
        });
        return { ...prev, shiftBars: nextBars };
      });
    },
    []
  );

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

  const buildExportRows = useCallback((entries: OptimizedRouteEntry[]) => {
    return entries.map((entry, index) => ({
      Order: index + 1,
      "Service User": entry.serviceUserName ?? "",
      "Call Type": entry.callTypeLabel ?? "",
      "Time Band": entry.timeBandLabel ?? "",
      "Scheduled Start": formatMinutesLabel(entry.scheduledStartMinutes),
      "Scheduled End": formatMinutesLabel(entry.scheduledEndMinutes),
      "Duration (mins)": typeof entry.durationMinutes === "number" ? Math.round(entry.durationMinutes) : "",
      "Time Critical": entry.isTimeCritical ? "Yes" : "No",
      "Double Up": entry.isDoubleUp ? "Yes" : "No",
    }));
  }, []);

  const handleExportCsv = useCallback(() => {
    if (!activePayload?.optimizedRun?.length || !selectedRota) {
      toast({
        title: "No rota to export",
        description: "Select a saved rota with an optimized run.",
        variant: "destructive",
      });
      return;
    }
    const rows = buildExportRows(activePayload.optimizedRun);
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
    const safeWorker = (selectedRota.workerName || "rota").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
    const filename = `${safeWorker}-${selectedRota.templateWeek}-${selectedRota.templateDay}-rota.csv`;
    triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), filename);
  }, [activePayload?.optimizedRun, buildExportRows, selectedRota, toast, triggerDownload]);

  const handleCopyRota = useCallback(async () => {
    if (!activePayload?.optimizedRun?.length) {
      toast({
        title: "No rota to copy",
        description: "Select a saved rota with an optimized run.",
        variant: "destructive",
      });
      return;
    }
    const rows = buildExportRows(activePayload.optimizedRun);
    const headers = rows.length ? Object.keys(rows[0]) : [];
    const text = [
      headers.join("\t"),
      ...rows.map((row) => headers.map((key) => String((row as Record<string, unknown>)[key] ?? "")).join("\t")),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Rota copied",
        description: "The optimized rota is on your clipboard.",
      });
    } catch (error: any) {
      toast({
        title: "Copy failed",
        description: error.message || "Unable to copy the rota.",
        variant: "destructive",
      });
    }
  }, [activePayload?.optimizedRun, buildExportRows, toast]);

  if (user?.role !== "admin") {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-500">
            <Shield size={18} />
            Restricted Access
          </CardTitle>
          <CardDescription>You need administrator privileges to view saved rotas.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const totalWorkers = new Set(rotas.map((r) => r.workerKey)).size;
  const week1Count = rotas.filter((r) => r.templateWeek === "week1").length;
  const week2Count = rotas.filter((r) => r.templateWeek === "week2").length;

  return (
    <div className="page-shell-compact">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-primary">Admin Library</p>
          <h1 className="text-3xl font-heading font-bold text-foreground">Care Worker Rotas</h1>
          <p className="text-muted-foreground">
            Daily planner timeline and weekly grid for saved care worker rotas.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              {totalWorkers} workers
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              {rotas.length} rotas
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fetchRotas()}
            disabled={loading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Link href="/testing-features">
            <Button type="button" variant="default" size="sm">
              Optimise new rota
            </Button>
          </Link>
        </div>
      </div>

      {/* Main grid card */}
      <Card className="border-border/60">
        <CardHeader className="border-b bg-muted/20">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-base">Create rota from latest workbook</CardTitle>
              <CardDescription>
                Automatically uses the most recent Week 1 / Week 2 templates.
              </CardDescription>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={fetchWorkbooks}
              disabled={workbooksLoading}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${workbooksLoading ? "animate-spin" : ""}`} />
              Refresh workbook
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[1.4fr_1fr_auto] items-end p-4">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Care worker</p>
            <Select
              value={selectedWorkbookWorkerKey ?? ""}
              onValueChange={(value) => setSelectedWorkbookWorkerKey(value)}
              disabled={!selectedWorkbook?.careWorkerRosters?.length}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder={selectedWorkbook ? "Select a care worker" : "No workbook available"} />
              </SelectTrigger>
              <SelectContent>
                <div className="p-2">
                  <Input
                    value={workbookWorkerSearch}
                    onChange={(event) => setWorkbookWorkerSearch(event.target.value)}
                    placeholder="Search care worker..."
                    className="h-8 text-xs"
                  />
                </div>
                <div className="max-h-56 overflow-auto">
                  {(selectedWorkbook?.careWorkerRosters ?? [])
                    .filter((worker) =>
                      worker.workerName.toLowerCase().includes(workbookWorkerSearch.trim().toLowerCase())
                    )
                    .map((worker) => (
                      <SelectItem key={worker.key} value={worker.key}>
                        {worker.workerName}
                      </SelectItem>
                    ))}
                </div>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Template</p>
            <div className="flex gap-2">
              <Select value={plannerWeek} onValueChange={(value) => setPlannerWeek(value as "week1" | "week2")}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Week" />
                </SelectTrigger>
                <SelectContent className="max-h-48 overflow-auto">
                  <SelectItem value="week1">{TEMPLATE_WEEK_LABELS.week1}</SelectItem>
                  <SelectItem value="week2">{TEMPLATE_WEEK_LABELS.week2}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={plannerDay} onValueChange={(value) => setPlannerDay(value as (typeof WEEKDAY_OPTIONS)[number])}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Day" />
                </SelectTrigger>
                <SelectContent className="max-h-48 overflow-auto">
                  {WEEKDAY_OPTIONS.map((day) => (
                    <SelectItem key={day} value={day}>
                      {day}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            className="h-9"
            onClick={handleCreateRota}
            disabled={isCreatingRota || !selectedWorkbook || !selectedWorkbookWorkerKey}
          >
            {isCreatingRota ? "Creating..." : "Create rota"}
          </Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="planner" className="space-y-3">
        <TabsList>
          <TabsTrigger value="planner">Daily planner</TabsTrigger>
          <TabsTrigger value="weekly">Weekly grid</TabsTrigger>
        </TabsList>

        <TabsContent value="planner">
          <div className="space-y-3">
            <Card className="border-border/60">
              <CardContent className="p-3">
                <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_1fr_1fr] items-end">
                  <div className="space-y-1">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Branch</p>
                    <Select defaultValue="all">
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Branch" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Area</p>
                    <Select defaultValue="all">
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Area" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Type</p>
                    <Select defaultValue="all">
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Date</p>
                    <div className="flex gap-2">
                      <Select value={plannerWeek} onValueChange={(value) => setPlannerWeek(value as "week1" | "week2")}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Week" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="week1">{TEMPLATE_WEEK_LABELS.week1}</SelectItem>
                          <SelectItem value="week2">{TEMPLATE_WEEK_LABELS.week2}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={plannerDay} onValueChange={(value) => setPlannerDay(value as (typeof WEEKDAY_OPTIONS)[number])}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Day" />
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
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-3 xl:grid-cols-[1fr_320px]">
              <Card className="border-border/60 overflow-hidden">
                <CardHeader className="border-b bg-muted/20">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">Employees</CardTitle>
                    <CardDescription>
                      {plannerDay} • {TEMPLATE_WEEK_LABELS[plannerWeek]}
                    </CardDescription>
                  </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-3 rounded-md border px-3 py-1.5 text-xs text-muted-foreground">
                        <span>{plannerSummary.totalWorkers} workers</span>
                        <span>•</span>
                        <span>{plannerSummary.totalCalls} visits</span>
                        <span>•</span>
                        <span>{plannerSummary.unscheduledCount} unallocated</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Zoom</span>
                        <input
                          type="range"
                          min="0.8"
                          max="1.6"
                          step="0.1"
                          value={plannerZoom}
                          onChange={(event) => setPlannerZoom(Number(event.target.value))}
                          className="w-28"
                        />
                        <span className="w-8 text-right">{Math.round(plannerZoom * 100)}%</span>
                      </div>
                    </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                  <div className="max-h-[calc(100vh-340px)] min-h-[520px] overflow-auto">
                    <div style={{ minWidth: `${1200 * plannerZoom}px` }}>
                      <div className="flex border-b bg-muted/30 text-[11px] font-medium text-muted-foreground">
                        <div className="w-[260px] px-3 py-2 border-r">Employees</div>
                        <div className="relative flex-1">
                          <div className="h-8">
                            {Array.from({ length: 25 }).map((_, idx) => {
                              const minutes = PLANNER_DAY_START_MINUTES + idx * 60;
                              const left = ((minutes - PLANNER_DAY_START_MINUTES) / (PLANNER_DAY_END_MINUTES - PLANNER_DAY_START_MINUTES)) * 100;
                              const labelStride = plannerZoom < 1 ? 2 : 1;
                              const showLabel = idx % labelStride === 0;
                              const isFirst = idx === 0;
                              const isLast = idx === 24;
                              return (
                                <div
                                  key={`tick-${idx}`}
                                  className="absolute inset-y-0 flex items-center"
                                  style={{ left: `${left}%` }}
                                >
                                  <div className="h-8 w-px bg-border/60" />
                                  {showLabel && (
                                    <span
                                      className="ml-1 px-1.5 py-0.5 rounded-sm bg-background/80 text-[10px] text-muted-foreground shadow-sm"
                                      style={{ transform: isFirst ? "translateX(0)" : isLast ? "translateX(-70%)" : "translateX(-50%)" }}
                                    >
                                      {formatMinutesLabel(minutes)}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {plannerLanes.length === 0 ? (
                        <div className="px-4 py-8 text-sm text-muted-foreground">No saved rotas for this day.</div>
                      ) : (
                        plannerLanes.map((lane, idx) => {
                          const stats = plannerLaneStats.get(lane.id);
                          const shiftBars = plannerShiftBars.get(lane.id) ?? [];
                          return (
                            <div
                              key={lane.id}
                              className={`flex border-b ${idx % 2 === 0 ? "bg-background" : "bg-muted/10"}`}
                            >
                              <div className="w-[260px] border-r px-3 py-3">
                                <p className="text-sm font-semibold">{lane.label}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {stats?.callCount ?? 0} visits • {formatDurationLabel(stats?.totalMinutes ?? 0)}
                                </p>
                              </div>
                              <div className="relative flex-1 h-14">
                                {Array.from({ length: 25 }).map((_, idx2) => {
                                  const minutes = PLANNER_DAY_START_MINUTES + idx2 * 60;
                                  const left = ((minutes - PLANNER_DAY_START_MINUTES) / (PLANNER_DAY_END_MINUTES - PLANNER_DAY_START_MINUTES)) * 100;
                                  return (
                                    <div
                                      key={`grid-${lane.id}-${idx2}`}
                                      className="absolute inset-y-0 w-px bg-border/30"
                                      style={{ left: `${left}%` }}
                                    />
                                  );
                                })}
                                {shiftBars.map((bar, barIdx) => {
                                  const start = typeof bar.startMinutes === "number" ? bar.startMinutes : null;
                                  const end =
                                    typeof bar.endMinutes === "number"
                                      ? bar.endMinutes
                                      : typeof bar.startMinutes === "number" && typeof bar.durationMinutes === "number"
                                      ? bar.startMinutes + bar.durationMinutes
                                      : null;
                                  if (start === null || end === null) return null;
                                  const left = ((start - PLANNER_DAY_START_MINUTES) / (PLANNER_DAY_END_MINUTES - PLANNER_DAY_START_MINUTES)) * 100;
                                  const width = ((end - start) / (PLANNER_DAY_END_MINUTES - PLANNER_DAY_START_MINUTES)) * 100;
                                  return (
                                    <div
                                      key={`shift-${lane.id}-${barIdx}`}
                                      className="absolute top-1 h-12 bg-slate-200/70 border border-slate-300"
                                      style={{ left: `${left}%`, width: `${Math.max(width, 1.5)}%` }}
                                    />
                                  );
                                })}
                                {lane.entries.map((entry) => {
                                  const start = Math.max(entry.startMinutes, PLANNER_DAY_START_MINUTES);
                                  const end = Math.min(entry.startMinutes + entry.durationMinutes, PLANNER_DAY_END_MINUTES);
                                  const left = ((start - PLANNER_DAY_START_MINUTES) / (PLANNER_DAY_END_MINUTES - PLANNER_DAY_START_MINUTES)) * 100;
                                  const width = ((end - start) / (PLANNER_DAY_END_MINUTES - PLANNER_DAY_START_MINUTES)) * 100;
                                  const tone = getCallTypeTone(entry.callTypeLabel);
                                  const isSelected = selectedPlannerEntryId === entry.id;
                                  return (
                                    <button
                                      key={entry.id}
                                      type="button"
                                      onClick={() => {
                                        setSelectedPlannerEntryId(entry.id);
                                        const rota = plannerEntryToRota.get(entry.id);
                                        if (rota) setSelectedRotaId(rota.id);
                                      }}
                                      className={`absolute top-1 h-12 rounded-none border-l-4 px-2 text-left text-[11px] font-semibold shadow-sm transition hover:brightness-105 ${tone} ${
                                        isSelected ? "ring-2 ring-primary/40" : ""
                                      }`}
                                      style={{ left: `${left}%`, width: `${Math.max(width, 1.5)}%` }}
                                    >
                                      <div className="truncate">{entry.title}</div>
                                      <div className="text-[10px] font-normal opacity-80">
                                        {formatMinutesLabel(entry.startMinutes)} • {Math.round(entry.durationMinutes)}m
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-3">
                <Card className="border-border/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Info</CardTitle>
                    <CardDescription>Allocated vs unallocated visits.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 text-[11px] font-semibold text-muted-foreground">
                      <span>Date</span>
                      <span className="text-right">Unallocated</span>
                      <span className="text-right">Allocated</span>
                    </div>
                    {plannerDayRows.map((row) => (
                      <div key={row.day} className="grid grid-cols-[1fr_1fr_1fr] gap-2 text-xs">
                        <span className={row.day === plannerDay ? "font-semibold text-foreground" : "text-muted-foreground"}>
                          {row.day.slice(0, 3)}
                        </span>
                        <span className="text-right text-red-500">{row.unallocated}</span>
                        <span className="text-right text-emerald-600">{row.allocated}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="border-border/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Unallocated calls</CardTitle>
                    <CardDescription>
                      Calls without scheduled times for {plannerDay}.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {plannerUnscheduled.length === 0 ? (
                      <p className="text-xs text-muted-foreground">All calls are scheduled.</p>
                    ) : (
                      plannerUnscheduled.map(({ rota, entry }) => (
                        <button
                          key={`${rota.id}-${entry.key}`}
                          type="button"
                          onClick={() => setSelectedRotaId(rota.id)}
                          className="w-full rounded-lg border bg-background px-3 py-2 text-left transition hover:bg-muted/40"
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium truncate">{entry.serviceUserName || "Unknown"}</p>
                            {entry.isTimeCritical && (
                              <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-600">
                                TC
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {rota.workerName} • {entry.callTypeLabel || "Visit"}
                          </p>
                        </button>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="weekly">
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="h-[calc(100vh-220px)] min-h-[500px]">
                <WeeklyPlannerGrid
                  rotas={rotas}
                  selectedRotaId={selectedRotaId}
                  onSelectRota={setSelectedRotaId}
                  loading={loading}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Detail sheet (slide-out panel) */}
      <Sheet open={!!selectedRota} onOpenChange={(open) => !open && setSelectedRotaId(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader className="pb-4 border-b">
            <div className="flex items-start justify-between">
              <div>
                <SheetTitle className="text-xl">{selectedRota?.workerName}</SheetTitle>
                <SheetDescription className="text-sm">
                  {selectedRota?.templateDay} • {TEMPLATE_WEEK_LABELS[selectedRota?.templateWeek ?? ""] || selectedRota?.templateWeek}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          {selectedRota && activePayload && (
            <div className="py-4 space-y-4">
              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={handleExportCsv}>
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
                <Button size="sm" variant="outline" onClick={handleCopyRota}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy
                </Button>
                <Button
                  size="sm"
                  variant={isEditing ? "secondary" : "outline"}
                  onClick={() => setIsEditing((prev) => !prev)}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  {isEditing ? "Editing" : "Edit"}
                </Button>
                {isEditing && (
                  <>
                    <Button size="sm" onClick={handleSaveEdits} disabled={savingEdit}>
                      {savingEdit ? "Saving..." : "Save"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleCancelEdits}>
                      Cancel
                    </Button>
                  </>
                )}
              </div>

              {/* Metadata */}
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {selectedRota.createdByUsername && <span>Saved by {selectedRota.createdByUsername}</span>}
              </div>

              {/* Edit mode controls */}
              {isEditing && (
                <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-xs">
                  <Switch
                    checked={Boolean(activePayload.timeCriticalWindowEnforced)}
                    onCheckedChange={(checked) =>
                      setDraftPayload((prev) => (prev ? { ...prev, timeCriticalWindowEnforced: checked } : prev))
                    }
                    id="time-critical-enforced"
                  />
                  <label htmlFor="time-critical-enforced" className="cursor-pointer select-none">
                    Enforce time-critical windows
                  </label>
                </div>
              )}

              {/* Summary metrics */}
              {rosterSummary && (
                <div className="grid grid-cols-2 gap-2">
                  <SummaryMetric
                    label="Scheduled"
                    value={`${rosterSummary.scheduledCount}/${rosterSummary.totalCalls}`}
                    helper={rosterSummary.unscheduledCount > 0 ? `${rosterSummary.unscheduledCount} unscheduled` : undefined}
                  />
                  <SummaryMetric
                    label="Run window"
                    value={`${formatMinutesLabel(rosterSummary.earliestStart)} → ${formatMinutesLabel(rosterSummary.latestEnd)}`}
                  />
                  <SummaryMetric
                    label="Care time"
                    value={formatDurationLabel(rosterSummary.totalDurationMinutes)}
                    helper={`Idle ${formatDurationLabel(rosterSummary.idleMinutes)}`}
                  />
                  <SummaryMetric
                    label="Warnings"
                    value={`${rosterSummary.beforeStartCount + rosterSummary.afterSoftCount + rosterSummary.afterHardCount}`}
                  />
                </div>
              )}

              {/* Shift bars */}
              {((activePayload?.shiftBars?.length ?? 0) > 0 || isEditing) && (
                <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Shift bars</p>
                    {isEditing && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => addShiftBar(7 * 60)}>+07:00</Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => addShiftBar(9 * 60)}>+09:00</Button>
                      </div>
                    )}
                  </div>
                  {(activePayload?.shiftBars || []).map((bar, index) => (
                    <div key={`shift-${index}`} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-[10px]">Shift</Badge>
                      <span>{formatMinutesLabel(bar.startMinutes)} → {formatMinutesLabel(bar.endMinutes)}</span>
                      <Badge variant="secondary" className="text-[10px]">{formatDurationLabel(bar.durationMinutes)}</Badge>
                    </div>
                  ))}
                  {(!activePayload?.shiftBars?.length) && (
                    <p className="text-xs text-muted-foreground">No shift bars.</p>
                  )}
                </div>
              )}

              {/* Call entries */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Scheduled calls ({activePayload.optimizedRun?.length ?? 0})</p>
                {(activePayload.optimizedRun || []).map((entry) => {
                  const scheduledStart = formatMinutesLabel(entry.scheduledStartMinutes);
                  const scheduledEnd = formatMinutesLabel(entry.scheduledEndMinutes);
                  const templateTime = formatMinutesLabel(entry.requirementStartMinutes ?? entry.suggestedStartMinutes ?? null);
                  const recommendedTime = formatMinutesLabel(entry.recommendedStartMinutes ?? entry.scheduledStartMinutes);
                  const hasSchedule =
                    typeof entry.scheduledStartMinutes === "number" &&
                    typeof entry.scheduledEndMinutes === "number";
                  const isAfterHardLimit =
                    typeof entry.scheduledEndMinutes === "number" &&
                    entry.scheduledEndMinutes > ROSTER_DAY_HARD_END_MINUTES;

                  return (
                    <div
                      key={entry.key}
                      className="rounded-lg border bg-background p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{entry.serviceUserName || "Unknown"}</p>
                          <p className="text-xs text-muted-foreground">
                            {entry.callTypeLabel} • {entry.timeBandLabel}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-1">
                            Template: {templateTime} • Recommended: {recommendedTime}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1 shrink-0">
                          {hasSchedule && (
                            <Badge variant="secondary" className="text-[10px]">
                              {scheduledStart} → {scheduledEnd}
                            </Badge>
                          )}
                          {entry.isTimeCritical && (
                            <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-600">TC</Badge>
                          )}
                          {entry.isDoubleUp && (
                            <Badge variant="outline" className="text-[10px] border-emerald-400 text-emerald-600">2x</Badge>
                          )}
                          {isAfterHardLimit && (
                            <Badge variant="destructive" className="text-[10px]">Late</Badge>
                          )}
                        </div>
                      </div>

                      {isEditing && (
                        <div className="flex flex-wrap gap-2 text-xs">
                          <Input
                            type="time"
                            className="w-24 h-7"
                            value={minutesToTimeInput(entry.scheduledStartMinutes)}
                            onChange={(e) =>
                              handleUpdateEntry(entry.key, {
                                scheduledStartMinutes: timeInputToMinutes(e.target.value),
                              })
                            }
                          />
                          <Input
                            type="time"
                            className="w-24 h-7"
                            value={minutesToTimeInput(entry.scheduledEndMinutes)}
                            onChange={(e) =>
                              handleUpdateEntry(entry.key, {
                                scheduledEndMinutes: timeInputToMinutes(e.target.value),
                              })
                            }
                          />
                          <Button
                            size="sm"
                            variant={entry.isTimeCritical ? "secondary" : "ghost"}
                            className="h-7 px-2 text-xs"
                            onClick={() => handleUpdateEntry(entry.key, { isTimeCritical: !entry.isTimeCritical })}
                          >
                            TC
                          </Button>
                          <Button
                            size="sm"
                            variant={entry.isDoubleUp ? "secondary" : "ghost"}
                            className="h-7 px-2 text-xs"
                            onClick={() => handleUpdateEntry(entry.key, { isDoubleUp: !entry.isDoubleUp })}
                          >
                            2x
                          </Button>
                        </div>
                      )}

                      {/* Mini timeline bar */}
                      {hasSchedule && (
                        <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                          {(() => {
                            const timelineRange = ROSTER_DAY_HARD_END_MINUTES - ROSTER_DAY_START_MINUTES;
                            const startOffset = (entry.scheduledStartMinutes as number) - ROSTER_DAY_START_MINUTES;
                            const endOffset = (entry.scheduledEndMinutes as number) - ROSTER_DAY_START_MINUTES;
                            const left = Math.max(0, Math.min(98, (startOffset / timelineRange) * 100));
                            const width = Math.max(2, Math.min(100 - left, ((endOffset - startOffset) / timelineRange) * 100));
                            const color =
                              isAfterHardLimit
                                ? "bg-red-500"
                                : entry.isDoubleUp
                                ? "bg-emerald-500"
                                : "bg-primary";
                            return (
                              <div
                                className={`h-full rounded-full ${color}`}
                                style={{ marginLeft: `${left}%`, width: `${width}%` }}
                              />
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}

                {!activePayload.optimizedRun?.length && (
                  <p className="text-xs text-muted-foreground py-4 text-center">No calls scheduled.</p>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={Boolean(doubleUpConflict)} onOpenChange={() => setDoubleUpConflict(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Double‑up conflict detected</AlertDialogTitle>
            <AlertDialogDescription>
              This double‑up call would overlap another visit for {doubleUpConflict?.targetWorkerName}.
              Review the conflict and choose to optimise or cancel.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {doubleUpConflict?.conflictWith && (
            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              Conflicts with: {doubleUpConflict.conflictWith.serviceUserName || "Unknown"}{" "}
              ({formatMinutesLabel(doubleUpConflict.conflictWith.scheduledStartMinutes)} →
              {formatMinutesLabel(doubleUpConflict.conflictWith.scheduledEndMinutes)}). Proposed double‑up time:{" "}
              {formatMinutesLabel(doubleUpConflict.fixedStart)} → {formatMinutesLabel(doubleUpConflict.fixedEnd)}.
            </div>
          )}
          {doubleUpConflict && (() => {
            const previewRun = applyFixedDoubleUp(
              doubleUpConflict.updatedPayload.optimizedRun,
              doubleUpConflict.fixedKey,
              doubleUpConflict.fixedStart,
              doubleUpConflict.fixedEnd
            );
            const changes = buildChangePreview(doubleUpConflict.originalPayload.optimizedRun, previewRun);
            if (!changes.length) return null;
            return (
              <div className="rounded-md border bg-background p-3 text-xs">
                <p className="font-semibold text-foreground mb-2">Preview changes</p>
                <div className="space-y-1 max-h-40 overflow-auto">
                  {changes.slice(0, 8).map((change) => (
                    <div key={change.key} className="flex items-center justify-between gap-2 text-muted-foreground">
                      <span className="truncate">{change.name}</span>
                      <span className="text-[11px]">
                        {formatMinutesLabel(change.beforeStart)} → {formatMinutesLabel(change.beforeEnd)}{" "}
                        <span className="mx-1">→</span>
                        {formatMinutesLabel(change.afterStart)} → {formatMinutesLabel(change.afterEnd)}
                      </span>
                    </div>
                  ))}
                  {changes.length > 8 && (
                    <p className="text-[11px] text-muted-foreground">+{changes.length - 8} more changes</p>
                  )}
                </div>
              </div>
            );
          })()}
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                if (doubleUpConflict?.sourceEntrySnapshot) {
                  setDraftPayload((prev) => {
                    if (!prev) return prev;
                    const nextEntries = prev.optimizedRun.map((entry) =>
                      entry.key === doubleUpConflict.sourceEntrySnapshot?.key
                        ? doubleUpConflict.sourceEntrySnapshot!
                        : entry
                    );
                    return { ...prev, optimizedRun: nextEntries };
                  });
                }
                setDoubleUpConflict(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!doubleUpConflict) return;
                const { updatedPayload, targetRotaId, fixedKey, fixedStart, fixedEnd } = doubleUpConflict;
                const optimizedRun = applyFixedDoubleUp(
                  updatedPayload.optimizedRun,
                  fixedKey,
                  fixedStart,
                  fixedEnd
                );
                const payload = { ...updatedPayload, optimizedRun };
                setLinkedUpdates((prevLinked) => ({ ...prevLinked, [targetRotaId]: payload }));
                setRotas((prevRotas) =>
                  prevRotas.map((rota) =>
                    rota.id === targetRotaId ? { ...rota, payload } : rota
                  )
                );
                setDoubleUpConflict(null);
              }}
            >
              Optimize & Accept
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
