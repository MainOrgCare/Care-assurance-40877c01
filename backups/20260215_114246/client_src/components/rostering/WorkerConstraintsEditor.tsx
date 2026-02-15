import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Settings2, Plus, Trash2, Edit2, Search, AlertTriangle } from "lucide-react";

export interface WorkerConstraint {
  id?: string;
  workerKey: string;
  workerName: string;
  maxCallsPerDay?: number;
  maxMinutesPerDay?: number;
  maxCallsPerWeek?: number;
  maxMinutesPerWeek?: number;
  notes?: string;
}

interface WorkerConstraintsEditorProps {
  constraints: WorkerConstraint[];
  workers: { key: string; name: string }[];
  workerSummaries?: { workerKey: string; workerName: string; totalMinutes: number; callCount: number; uniqueServiceUsers: number }[];
  weeklyTotals?: Map<string, { calls: number; minutes: number }>;
  onSave: (constraint: Omit<WorkerConstraint, "id">) => void;
  onDelete: (id: string) => void;
  isSaving?: boolean;
}

export const WorkerConstraintsEditor: React.FC<WorkerConstraintsEditorProps> = ({
  constraints,
  workers,
  workerSummaries = [],
  weeklyTotals,
  onSave,
  onDelete,
  isSaving,
}) => {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConstraint, setEditingConstraint] = useState<WorkerConstraint | null>(null);

  // Form state
  const [selectedWorker, setSelectedWorker] = useState<string>("");
  const [maxCallsPerDay, setMaxCallsPerDay] = useState<number | undefined>();
  const [maxMinutesPerDay, setMaxMinutesPerDay] = useState<number | undefined>();
  const [maxCallsPerWeek, setMaxCallsPerWeek] = useState<number | undefined>();
  const [maxMinutesPerWeek, setMaxMinutesPerWeek] = useState<number | undefined>();
  const [notes, setNotes] = useState<string>("");

  // Build lookup map for worker summaries
  const summaryMap = useMemo(() => {
    const map = new Map<string, { currentCalls: number; currentMinutes: number }>();
    for (const s of workerSummaries) {
      map.set(s.workerKey, { currentCalls: s.callCount, currentMinutes: s.totalMinutes });
    }
    return map;
  }, [workerSummaries]);

  const weeklyMap = useMemo(
    () => weeklyTotals ?? new Map<string, { calls: number; minutes: number }>(),
    [weeklyTotals]
  );

  const constraintMap = useMemo(() => {
    const map = new Map<string, WorkerConstraint>();
    for (const c of constraints) {
      map.set(c.workerKey, c);
    }
    return map;
  }, [constraints]);

  const filteredWorkers = useMemo(() => {
    if (!search.trim()) return workers;
    const term = search.toLowerCase();
    return workers.filter((w) => w.name.toLowerCase().includes(term));
  }, [workers, search]);

  const workersWithStatus = useMemo(() => {
    return filteredWorkers.map((w) => {
      const constraint = constraintMap.get(w.key);
      const summary = summaryMap.get(w.key) || { currentCalls: 0, currentMinutes: 0 };
      const weekly = weeklyMap.get(w.key);
      let status: "ok" | "warning" | "overloaded" = "ok";
      
      if (constraint) {
        if (constraint.maxCallsPerDay && summary.currentCalls > constraint.maxCallsPerDay) {
          status = "overloaded";
        } else if (constraint.maxMinutesPerDay && summary.currentMinutes > constraint.maxMinutesPerDay) {
          status = "overloaded";
        } else if (constraint.maxCallsPerWeek && (weekly?.calls ?? 0) > constraint.maxCallsPerWeek) {
          status = "overloaded";
        } else if (constraint.maxMinutesPerWeek && (weekly?.minutes ?? 0) > constraint.maxMinutesPerWeek) {
          status = "overloaded";
        } else if (constraint.maxCallsPerDay && summary.currentCalls > constraint.maxCallsPerDay * 0.9) {
          status = "warning";
        } else if (constraint.maxMinutesPerDay && summary.currentMinutes > constraint.maxMinutesPerDay * 0.9) {
          status = "warning";
        } else if (constraint.maxCallsPerWeek && (weekly?.calls ?? 0) > constraint.maxCallsPerWeek * 0.9) {
          status = "warning";
        } else if (constraint.maxMinutesPerWeek && (weekly?.minutes ?? 0) > constraint.maxMinutesPerWeek * 0.9) {
          status = "warning";
        }
      }
      
      return { ...w, ...summary, weekly, constraint, status };
    });
  }, [filteredWorkers, constraintMap, summaryMap, weeklyMap]);

  const resetForm = () => {
    setSelectedWorker("");
    setMaxCallsPerDay(undefined);
    setMaxMinutesPerDay(undefined);
    setMaxCallsPerWeek(undefined);
    setMaxMinutesPerWeek(undefined);
    setNotes("");
    setEditingConstraint(null);
  };

  const handleOpenDialog = (constraint?: WorkerConstraint) => {
    if (constraint) {
      setEditingConstraint(constraint);
      setSelectedWorker(constraint.workerKey);
      setMaxCallsPerDay(constraint.maxCallsPerDay);
      setMaxMinutesPerDay(constraint.maxMinutesPerDay);
      setMaxCallsPerWeek(constraint.maxCallsPerWeek);
      setMaxMinutesPerWeek(constraint.maxMinutesPerWeek);
      setNotes(constraint.notes || "");
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!selectedWorker) return;
    
    const worker = workers.find((w) => w.key === selectedWorker);
    if (!worker) return;

    await onSave({
      workerKey: selectedWorker,
      workerName: worker.name,
      maxCallsPerDay,
      maxMinutesPerDay,
      maxCallsPerWeek,
      maxMinutesPerWeek,
      notes: notes || undefined,
    });
    
    setDialogOpen(false);
    resetForm();
  };

  const formatDuration = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  };

  const avgCalls = workersWithStatus.length > 0
    ? Math.round(workersWithStatus.reduce((sum, w) => sum + w.currentCalls, 0) / workersWithStatus.length)
    : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Worker Constraints
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Set max calls/hours per day or week to prevent overloading
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={() => handleOpenDialog()}>
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingConstraint ? "Edit Worker Constraint" : "Add Worker Constraint"}
                </DialogTitle>
                <DialogDescription>
                  Set limits for a care worker to prevent overloading.
                </DialogDescription>
              </DialogHeader>
              
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="worker">Care Worker</Label>
                  <Select value={selectedWorker} onValueChange={setSelectedWorker}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select worker" />
                    </SelectTrigger>
                    <SelectContent>
                      {workers.map((w) => {
                        const summary = summaryMap.get(w.key);
                        return (
                          <SelectItem key={w.key} value={w.key}>
                            {w.name} ({summary?.currentCalls ?? 0} calls)
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label>Max Calls Per Day</Label>
                  <div className="flex items-center gap-4">
                    <Slider
                      value={[maxCallsPerDay ?? avgCalls]}
                      min={1}
                      max={Math.max(50, avgCalls * 2)}
                      step={1}
                      onValueChange={(v) => setMaxCallsPerDay(v[0])}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      value={maxCallsPerDay ?? ""}
                      onChange={(e) => setMaxCallsPerDay(e.target.value ? Number(e.target.value) : undefined)}
                      className="w-20"
                      placeholder="None"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Average across all workers: {avgCalls} calls
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label>Max Hours Per Day</Label>
                  <div className="flex items-center gap-4">
                    <Slider
                      value={[maxMinutesPerDay ? maxMinutesPerDay / 60 : 8]}
                      min={1}
                      max={12}
                      step={0.5}
                      onValueChange={(v) => setMaxMinutesPerDay(Math.round(v[0] * 60))}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      step="0.5"
                      value={maxMinutesPerDay ? (maxMinutesPerDay / 60).toFixed(1) : ""}
                      onChange={(e) => setMaxMinutesPerDay(e.target.value ? Math.round(Number(e.target.value) * 60) : undefined)}
                      className="w-20"
                      placeholder="None"
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label>Max Calls Per Week</Label>
                  <Input
                    type="number"
                    value={maxCallsPerWeek ?? ""}
                    onChange={(e) => setMaxCallsPerWeek(e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="None"
                  />
                </div>

                <div className="grid gap-2">
                  <Label>Max Hours Per Week</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={maxMinutesPerWeek ? (maxMinutesPerWeek / 60).toFixed(1) : ""}
                    onChange={(e) => setMaxMinutesPerWeek(e.target.value ? Math.round(Number(e.target.value) * 60) : undefined)}
                    placeholder="None"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="notes">Notes (optional)</Label>
                  <Input
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g., Part-time worker, medical restriction"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={!selectedWorker || isSaving}>
                  {editingConstraint ? "Update" : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search workers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>

        <ScrollArea className="h-[300px]">
          <div className="space-y-2">
            {workersWithStatus.map((w) => (
              <div
                key={w.key}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                  w.status === "overloaded"
                    ? "border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/30"
                    : w.status === "warning"
                    ? "border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30"
                    : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  {w.status === "overloaded" && (
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                  )}
                  {w.status === "warning" && (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  )}
                  <span className="font-medium truncate max-w-[140px]">{w.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {w.currentCalls} calls • {formatDuration(w.currentMinutes)}
                    {w.weekly && (w.constraint?.maxCallsPerWeek || w.constraint?.maxMinutesPerWeek)
                      ? ` • ${w.weekly.calls} wk calls${w.weekly.minutes ? ` • ${formatDuration(w.weekly.minutes)} wk` : ""}`
                      : ""}
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  {w.constraint ? (
                    <>
                      <div className="text-[10px] text-muted-foreground">
                        {w.constraint.maxCallsPerDay && (
                          <span>max {w.constraint.maxCallsPerDay} calls</span>
                        )}
                        {w.constraint.maxCallsPerDay && w.constraint.maxMinutesPerDay && " • "}
                        {w.constraint.maxMinutesPerDay && (
                          <span>max {formatDuration(w.constraint.maxMinutesPerDay)}</span>
                        )}
                        {(w.constraint.maxCallsPerDay || w.constraint.maxMinutesPerDay) && (w.constraint.maxCallsPerWeek || w.constraint.maxMinutesPerWeek) && " • "}
                        {w.constraint.maxCallsPerWeek && (
                          <span>{w.constraint.maxCallsPerWeek} / week</span>
                        )}
                        {w.constraint.maxCallsPerWeek && w.constraint.maxMinutesPerWeek && " • "}
                        {w.constraint.maxMinutesPerWeek && (
                          <span>{formatDuration(w.constraint.maxMinutesPerWeek)} / week</span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => handleOpenDialog(w.constraint)}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      {w.constraint.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => onDelete(w.constraint!.id!)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => {
                        setSelectedWorker(w.key);
                        setDialogOpen(true);
                      }}
                    >
                      Set Limit
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default WorkerConstraintsEditor;
