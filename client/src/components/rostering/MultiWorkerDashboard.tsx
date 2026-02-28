import React from "react";
import type { WorkerSummary } from "@/lib/rostering/rosterModel";

export interface MultiWorkerDashboardProps {
  workers: WorkerSummary[];
  selectedWorkerKey?: string | null;
  onSelectWorker?: (workerKey: string) => void;
}

const formatMinutes = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
};

export const MultiWorkerDashboard: React.FC<MultiWorkerDashboardProps> = ({
  workers,
  selectedWorkerKey,
  onSelectWorker,
}) => {
  const totalCalls = workers.reduce((acc, worker) => acc + worker.totalCalls, 0);
  const totalDurationMinutes = workers.reduce((acc, worker) => acc + worker.totalDurationMinutes, 0);
  const timeCriticalCalls = workers.reduce((acc, worker) => acc + worker.timeCriticalCalls, 0);
  const maxDuration = workers.reduce((acc, worker) => Math.max(acc, worker.totalDurationMinutes), 0) || 1;

  return (
    <div className="rounded-2xl border bg-card/70 p-4 shadow-[var(--shadow-xs)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold">Multi-worker workload</p>
          <p className="text-xs text-muted-foreground">
            {workers.length} workers · {totalCalls} calls · {formatMinutes(totalDurationMinutes)} planned
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="rounded-full border px-2 py-0.5">Time critical: {timeCriticalCalls}</span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {workers.map((worker) => {
          const isSelected = worker.key === selectedWorkerKey;
          const intensity = Math.min(1, worker.totalDurationMinutes / maxDuration);
          const heat = `rgba(16, 185, 129, ${0.08 + intensity * 0.25})`;
          const utilization = Math.min(100, Math.round((worker.totalDurationMinutes / (8 * 60)) * 100));
          return (
            <button
              key={worker.key}
              type="button"
              onClick={() => onSelectWorker?.(worker.key)}
              className={`rounded-xl border px-3 py-3 text-left transition ${
                isSelected ? "border-primary/60 bg-primary/10" : "border-border/60 bg-background/60 hover:bg-muted/40"
              }`}
              style={{ background: isSelected ? undefined : heat }}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground truncate">{worker.workerName}</p>
                {worker.shiftBarsCount > 0 && (
                  <span className="text-[10px] rounded-full bg-muted px-2 py-0.5">{worker.shiftBarsCount} shifts</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {worker.totalCalls} calls · {worker.uniqueServiceUsers} SUs · {formatMinutes(worker.totalDurationMinutes)}
              </p>
              <p className="text-[11px] text-amber-600 mt-1">Time critical: {worker.timeCriticalCalls}</p>
              <div className="mt-3">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Utilization</span>
                  <span>{utilization}%</span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-background/60">
                  <div
                    className="h-1.5 rounded-full bg-emerald-500"
                    style={{ width: `${utilization}%` }}
                  />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
