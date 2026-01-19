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
import { Search, RefreshCw, Shield } from "lucide-react";

type OptimizedRouteEntry = {
  key: string;
  serviceUserName: string | null;
  callTypeLabel: string | null;
  timeBandLabel: string | null;
  requirementStartMinutes: number | null;
  scheduledStartMinutes: number | null;
  scheduledEndMinutes: number | null;
  durationMinutes: number | null;
  shiftMinutes: number | null;
  isTimeCritical?: boolean;
  isDoubleUp?: boolean;
  windowStartMinutes?: number | null;
  windowEndMinutes?: number | null;
  isOutsideWindow?: boolean;
  hasWindowConflict?: boolean;
  suggestedStartMinutes?: number | null;
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
  selectedGroupKeys?: string[];
  overrides?: Record<string, any>;
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
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRotaId, setSelectedRotaId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftPayload, setDraftPayload] = useState<CareWorkerRotaPayload | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchRotas = useCallback(async (search?: string) => {
    setLoading(true);
    try {
      const query = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
      const response = await fetch(`/api/admin/care-worker-rotas${query}`, {
        credentials: "include",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Unable to load care worker rotas.");
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

  const filteredRotas = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return rotas;
    return rotas.filter((rota) => {
      return (
        rota.workerName.toLowerCase().includes(term) ||
        rota.workerKey.toLowerCase().includes(term) ||
        rota.templateDay.toLowerCase().includes(term)
      );
    });
  }, [rotas, searchTerm]);

  useEffect(() => {
    if (!filteredRotas.length) {
      setSelectedRotaId(null);
      return;
    }
    if (!selectedRotaId || !filteredRotas.some((rota) => rota.id === selectedRotaId)) {
      setSelectedRotaId(filteredRotas[0].id);
    }
  }, [filteredRotas, selectedRotaId]);

  const selectedRota = useMemo(
    () => filteredRotas.find((rota) => rota.id === selectedRotaId) ?? null,
    [filteredRotas, selectedRotaId]
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
    const outsideWindowCount = scheduledEntries.filter((entry) => entry.isOutsideWindow).length;
    const windowConflictCount = scheduledEntries.filter((entry) => entry.hasWindowConflict).length;
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
      outsideWindowCount,
      windowConflictCount,
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
      const normalizedRun = draftPayload.optimizedRun.map((entry) => {
        const hasWindow = typeof entry.windowStartMinutes === "number" && typeof entry.windowEndMinutes === "number";
        const isTimeCritical = hasWindow ? Boolean(entry.isTimeCritical) : false;
        return {
          ...entry,
          isTimeCritical,
          suggestedStartMinutes: hasWindow ? entry.suggestedStartMinutes ?? null : null,
        } as OptimizedRouteEntry;
      });

      const payloadToSave: CareWorkerRotaPayload = {
        ...draftPayload,
        optimizedRun: normalizedRun,
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
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "Unable to update rota.");
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
      "Requirement Time": formatMinutesLabel(entry.requirementStartMinutes),
      "Scheduled Start": formatMinutesLabel(entry.scheduledStartMinutes),
      "Scheduled End": formatMinutesLabel(entry.scheduledEndMinutes),
      "Duration (mins)": typeof entry.durationMinutes === "number" ? Math.round(entry.durationMinutes) : "",
      "Shift (mins)": typeof entry.shiftMinutes === "number" ? Math.round(entry.shiftMinutes) : "",
      "Time Critical": entry.isTimeCritical ? "Yes" : "No",
      "Double Up": entry.isDoubleUp ? "Yes" : "No",
      "Window Start": formatMinutesLabel(entry.windowStartMinutes),
      "Window End": formatMinutesLabel(entry.windowEndMinutes),
      "Outside Window": entry.isOutsideWindow ? "Yes" : "No",
      "Window Conflict": entry.hasWindowConflict ? "Yes" : "No",
      "Suggested Start": formatMinutesLabel(entry.suggestedStartMinutes ?? null),
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

  return (
    <div className="page-shell-compact">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-primary">Admin Library</p>
          <h1 className="text-3xl font-heading font-bold text-foreground">Saved Care Worker Rotas</h1>
          <p className="text-muted-foreground max-w-3xl">
            Search saved runs and review optimized rotas by care worker, week, and day.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => fetchRotas(searchTerm)}
            disabled={loading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search care worker or day"
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[320px,1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Saved Rotas</CardTitle>
            <CardDescription>{filteredRotas.length} result{filteredRotas.length === 1 ? "" : "s"}</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[520px] rounded-md border border-border/70">
              <div className="space-y-2 p-2">
                {filteredRotas.map((rota) => {
                  const isSelected = rota.id === selectedRotaId;
                  const weekLabel = TEMPLATE_WEEK_LABELS[rota.templateWeek] || rota.templateWeek;
                  return (
                    <button
                      key={rota.id}
                      type="button"
                      onClick={() => setSelectedRotaId(rota.id)}
                      className={`flex w-full flex-col gap-1 rounded-xl border px-3 py-2 text-left transition ${
                        isSelected
                          ? "border-primary/50 bg-primary/10"
                          : "border-border/60 bg-background/60 hover:bg-muted/40"
                      }`}
                    >
                      <p className="text-sm font-semibold text-foreground">{rota.workerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {weekLabel} • {rota.templateDay}
                      </p>
                      <p className="text-[11px] text-muted-foreground">Saved {formatDateLabel(rota.createdAt)}</p>
                    </button>
                  );
                })}
                {!filteredRotas.length && (
                  <p className="px-3 py-4 text-xs text-muted-foreground">No saved rotas match your search.</p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Optimized Rota</CardTitle>
            <CardDescription>Review the saved optimized run for the selected care worker.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedRota ? (
              <Alert>
                <AlertTitle>Select a rota</AlertTitle>
                <AlertDescription>Choose a saved rota to view its optimized schedule.</AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-lg font-semibold text-foreground">{selectedRota.workerName}</p>
                    <p className="text-xs text-muted-foreground">{selectedRota.workerKey}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">
                      {TEMPLATE_WEEK_LABELS[selectedRota.templateWeek] || selectedRota.templateWeek}
                    </Badge>
                    <Badge variant="secondary">{selectedRota.templateDay}</Badge>
                    {activePayload?.timeCriticalWindowEnforced && (
                      <Badge variant="outline">Time window enforced</Badge>
                    )}
                    <Button size="sm" variant="outline" onClick={handleExportCsv}>
                      Export CSV
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleCopyRota}>
                      Copy
                    </Button>
                    <Button
                      size="sm"
                      variant={isEditing ? "secondary" : "default"}
                      onClick={() => setIsEditing((prev) => !prev)}
                    >
                      {isEditing ? "Editing" : "Edit"}
                    </Button>
                    {isEditing && (
                      <>
                        <Button size="sm" onClick={handleSaveEdits} disabled={savingEdit}>
                          {savingEdit ? "Saving..." : "Save changes"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={handleCancelEdits}>
                          Cancel
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>Saved: {formatDateLabel(selectedRota.createdAt)}</span>
                  {selectedRota.createdByUsername && <span>• Saved by {selectedRota.createdByUsername}</span>}
                </div>

                {isEditing && activePayload && (
                  <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 p-3 text-xs text-foreground">
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

                {rosterSummary && (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <SummaryMetric
                      label="Scheduled calls"
                      value={`${rosterSummary.scheduledCount}/${rosterSummary.totalCalls}`}
                      helper={`${rosterSummary.unscheduledCount} unscheduled`}
                    />
                    <SummaryMetric
                      label="Run window"
                      value={`${formatMinutesLabel(rosterSummary.earliestStart)} → ${formatMinutesLabel(rosterSummary.latestEnd)}`}
                      helper={`Idle ${formatDurationLabel(rosterSummary.idleMinutes)}`}
                    />
                    <SummaryMetric
                      label="Care minutes"
                      value={formatDurationLabel(rosterSummary.totalDurationMinutes)}
                      helper={`${rosterSummary.timeCriticalCount} time critical`}
                    />
                    <SummaryMetric
                      label="Warnings"
                      value={`${rosterSummary.windowConflictCount + rosterSummary.outsideWindowCount}`}
                      helper={`${rosterSummary.beforeStartCount} early, ${rosterSummary.afterHardCount} after 23:00`}
                    />
                  </div>
                )}

                {(activePayload?.shiftBars?.length ?? 0) > 0 && (
                  <div className="rounded-xl border border-border/60 bg-background/60 p-3">
                    <p className="text-sm font-semibold text-foreground">Fixed shift bars</p>
                    <p className="text-xs text-muted-foreground">
                      Shift bars stay at their template time and can overlap calls.
                    </p>
                    <div className="mt-2 space-y-2">
                      {(activePayload?.shiftBars || []).map((bar, index) => (
                        <div
                          key={`shift-bar-${index}`}
                          className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-background/70 px-3 py-2 text-xs text-muted-foreground"
                        >
                          <Badge variant="outline" className="text-xs font-semibold">
                            Shift
                          </Badge>
                          <span>
                            {formatMinutesLabel(bar.startMinutes)} → {formatMinutesLabel(bar.endMinutes)}
                          </span>
                          <Badge variant="secondary" className="text-xs font-semibold">
                            {formatDurationLabel(bar.durationMinutes)}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  {(activePayload?.optimizedRun || []).map((entry) => {
                    const requiredLabel = formatMinutesLabel(entry.requirementStartMinutes);
                    const scheduledStart = formatMinutesLabel(entry.scheduledStartMinutes);
                    const scheduledEnd = formatMinutesLabel(entry.scheduledEndMinutes);
                    const shiftLabel = (() => {
                      if (typeof entry.shiftMinutes !== "number") return "—";
                      const rounded = Math.round(entry.shiftMinutes);
                      if (rounded > 0) return `+${rounded} mins`;
                      if (rounded < 0) return `${Math.abs(rounded)} mins earlier`;
                      return "On time";
                    })();
                    const windowLabel =
                      typeof entry.windowStartMinutes === "number" && typeof entry.windowEndMinutes === "number"
                        ? `${formatMinutesLabel(entry.windowStartMinutes)} → ${formatMinutesLabel(entry.windowEndMinutes)}`
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
                        ? "bg-red-500/70"
                        : isAfterSoftLimit || isBeforeDayStart
                        ? "bg-amber-400/80"
                        : entry.isDoubleUp
                        ? "bg-emerald-500/70"
                        : "bg-primary/70";
                    return (
                      <div
                        key={entry.key}
                        className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background/60 p-3"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              {entry.serviceUserName || "Unknown service user"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {(entry.callTypeLabel || "Call").toString()} • {entry.timeBandLabel || "Unscheduled"}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline">Required {requiredLabel}</Badge>
                            {hasSchedule ? (
                              <Badge variant="secondary">
                                Scheduled {scheduledStart} → {scheduledEnd}
                              </Badge>
                            ) : (
                              <Badge variant="destructive">No scheduled time</Badge>
                            )}
                            <Badge variant="outline">{shiftLabel}</Badge>
                            {entry.isDoubleUp && <Badge variant="outline">Double-up (locked)</Badge>}
                            {isBeforeDayStart && <Badge variant="destructive">Before 06:00</Badge>}
                            {isAfterSoftLimit && (
                              <Badge
                                variant="outline"
                                className="border-amber-500/40 text-amber-600 dark:text-amber-300"
                              >
                                After 22:00
                              </Badge>
                            )}
                            {isAfterHardLimit && <Badge variant="destructive">After 23:00</Badge>}
                            {entry.isTimeCritical && windowLabel && (
                              <Badge variant="outline">Time critical {windowLabel}</Badge>
                            )}
                              {entry.isTimeCritical && entry.suggestedStartMinutes !== null && entry.suggestedStartMinutes !== undefined && (
                                <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-200">
                                  Suggested start {formatMinutesLabel(entry.suggestedStartMinutes)}
                                </Badge>
                              )}
                            {entry.isOutsideWindow && (
                              <Badge variant="destructive">Outside window</Badge>
                            )}
                            {entry.hasWindowConflict && (
                              <Badge variant="destructive">Window conflict</Badge>
                            )}
                          </div>
                        </div>
                        {isEditing && (
                          <div className="flex flex-wrap gap-2 text-xs text-foreground">
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground">Start</span>
                              <Input
                                type="time"
                                className="w-28"
                                value={minutesToTimeInput(entry.scheduledStartMinutes)}
                                onChange={(event) =>
                                  handleUpdateEntry(entry.key, {
                                    scheduledStartMinutes: timeInputToMinutes(event.target.value),
                                  })
                                }
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground">End</span>
                              <Input
                                type="time"
                                className="w-28"
                                value={minutesToTimeInput(entry.scheduledEndMinutes)}
                                onChange={(event) =>
                                  handleUpdateEntry(entry.key, {
                                    scheduledEndMinutes: timeInputToMinutes(event.target.value),
                                  })
                                }
                              />
                            </div>
                            <Button
                              size="sm"
                              variant={entry.isDoubleUp ? "secondary" : "outline"}
                              onClick={() => handleUpdateEntry(entry.key, { isDoubleUp: !entry.isDoubleUp })}
                            >
                              {entry.isDoubleUp ? "Double-up" : "Mark double-up"}
                            </Button>
                            <Button
                              size="sm"
                              variant={entry.isTimeCritical ? "secondary" : "outline"}
                              onClick={() => handleUpdateEntry(entry.key, { isTimeCritical: !entry.isTimeCritical })}
                            >
                              {entry.isTimeCritical ? "Time critical" : "Mark time critical"}
                            </Button>
                          </div>
                        )}
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

                  {!activePayload?.optimizedRun?.length && (
                    <p className="text-xs text-muted-foreground">No optimized entries saved for this rota.</p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
