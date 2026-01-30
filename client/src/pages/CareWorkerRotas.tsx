import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Search, RefreshCw, Shield, X, Download, Copy, Pencil, Calendar, Clock, Users } from "lucide-react";
import { Link } from "wouter";
import { WeeklyPlannerGrid } from "@/components/rostering/WeeklyPlannerGrid";

type OptimizedRouteEntry = {
  key: string;
  serviceUserName: string | null;
  callTypeLabel: string | null;
  timeBandLabel: string | null;
  scheduledStartMinutes: number | null;
  scheduledEndMinutes: number | null;
  durationMinutes: number | null;
  isTimeCritical?: boolean;
  isDoubleUp?: boolean;
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

const TEMPLATE_WEEK_LABELS: Record<string, string> = {
  week1: "Week 1 (starts 05/01/26)",
  week2: "Week 2 (starts 12/01/26)",
};
const ROSTER_DAY_START_MINUTES = 6 * 60;
const ROSTER_DAY_SOFT_END_MINUTES = 22 * 60;
const ROSTER_DAY_HARD_END_MINUTES = 23 * 60;

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

  const handleUpdateEntry = useCallback(
    (entryKey: string, updates: Partial<OptimizedRouteEntry>) => {
      setDraftPayload((prev) => {
        if (!prev) return prev;
        const idx = prev.optimizedRun.findIndex((entry) => entry.key === entryKey);
        if (idx === -1) return prev;
        const nextEntries = [...prev.optimizedRun];
        const nextEntry = { ...nextEntries[idx], ...updates } as OptimizedRouteEntry;

        if (
          typeof nextEntry.scheduledStartMinutes === "number" &&
          typeof nextEntry.scheduledEndMinutes === "number"
        ) {
          let duration = nextEntry.scheduledEndMinutes - nextEntry.scheduledStartMinutes;
          if (duration < 0) duration += 24 * 60; // handle cross-midnight edits
          nextEntry.durationMinutes = duration;
        }

        nextEntries[idx] = nextEntry;
        return { ...prev, optimizedRun: nextEntries };
      });
    },
    []
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
    } catch (error: any) {
      toast({
        title: "Update failed",
        description: error.message || "Unable to update the rota.",
        variant: "destructive",
      });
    } finally {
      setSavingEdit(false);
    }
  }, [draftPayload, selectedRota, toast]);

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
            Weekly planner grid showing all saved rotas by care worker and day.
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
                <span>Saved: {formatDateLabel(selectedRota.createdAt)}</span>
                {selectedRota.createdByUsername && <span>• by {selectedRota.createdByUsername}</span>}
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
    </div>
  );
}
