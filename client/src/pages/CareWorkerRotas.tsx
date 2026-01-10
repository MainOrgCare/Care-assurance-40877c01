import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  windowStartMinutes?: number | null;
  windowEndMinutes?: number | null;
  isOutsideWindow?: boolean;
  hasWindowConflict?: boolean;
};

type CareWorkerRotaPayload = {
  workerName: string;
  workerKey: string;
  templateWeek: "week1" | "week2";
  templateDay: string;
  timeCriticalWindowEnforced?: boolean;
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

function formatMinutesLabel(minutes: number | null | undefined): string {
  if (typeof minutes !== "number" || Number.isNaN(minutes)) return "—";
  const normalized = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hrs = Math.floor(normalized / 60);
  const mins = Math.round(normalized % 60);
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

function formatDateLabel(isoString: string | null | undefined): string {
  if (!isoString) return "—";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return date.toLocaleString();
}

export default function CareWorkerRotas() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rotas, setRotas] = useState<CareWorkerRotaRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRotaId, setSelectedRotaId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    <div className="space-y-6 animate-in fade-in duration-500">
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
                    {selectedRota.payload?.timeCriticalWindowEnforced && (
                      <Badge variant="outline">Time window enforced</Badge>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>Saved: {formatDateLabel(selectedRota.createdAt)}</span>
                  {selectedRota.createdByUsername && <span>• Saved by {selectedRota.createdByUsername}</span>}
                </div>

                <div className="space-y-2">
                  {(selectedRota.payload?.optimizedRun || []).map((entry) => {
                    const requiredLabel = formatMinutesLabel(entry.requirementStartMinutes);
                    const scheduledStart = formatMinutesLabel(entry.scheduledStartMinutes);
                    const scheduledEnd = formatMinutesLabel(entry.scheduledEndMinutes);
                    const shiftLabel =
                      typeof entry.shiftMinutes === "number" && entry.shiftMinutes > 0
                        ? `+${Math.round(entry.shiftMinutes)} mins`
                        : "On time";
                    const windowLabel =
                      typeof entry.windowStartMinutes === "number" && typeof entry.windowEndMinutes === "number"
                        ? `${formatMinutesLabel(entry.windowStartMinutes)} → ${formatMinutesLabel(entry.windowEndMinutes)}`
                        : null;
                    return (
                      <div
                        key={entry.key}
                        className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background/60 p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
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
                          <Badge variant="secondary">
                            Scheduled {scheduledStart} → {scheduledEnd}
                          </Badge>
                          <Badge variant="outline">{shiftLabel}</Badge>
                          {entry.isTimeCritical && windowLabel && (
                            <Badge variant="outline">Time critical {windowLabel}</Badge>
                          )}
                          {entry.isOutsideWindow && (
                            <Badge variant="destructive">Outside window</Badge>
                          )}
                          {entry.hasWindowConflict && (
                            <Badge variant="destructive">Window conflict</Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {!selectedRota.payload?.optimizedRun?.length && (
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
