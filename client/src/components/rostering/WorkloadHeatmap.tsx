import React, { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Users, AlertTriangle, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface WorkerConstraint {
  workerKey: string;
  maxCallsPerDay?: number;
  maxMinutesPerDay?: number;
  maxCallsPerWeek?: number;
  maxMinutesPerWeek?: number;
}

interface WorkerSummaryInput {
  workerKey: string;
  workerName: string;
  totalMinutes: number;
  callCount: number;
  uniqueServiceUsers: number;
}

interface WorkloadHeatmapProps {
  workers: WorkerSummaryInput[];
  constraints?: WorkerConstraint[];
  weeklyTotals?: Map<string, { calls: number; minutes: number }>;
  onWorkerClick?: (workerKey: string) => void;
  selectedWorkerKey?: string | null;
}

interface WorkerWorkload {
  key: string;
  name: string;
  calls: number;
  minutes: number;
  percentage: number; // relative to average
  isOverloaded: boolean;
  isUnderloaded: boolean;
  constraint?: WorkerConstraint;
  capacityUsed?: number; // percentage of constraint
}

export const WorkloadHeatmap: React.FC<WorkloadHeatmapProps> = ({
  workers,
  constraints = [],
  weeklyTotals,
  onWorkerClick,
  selectedWorkerKey,
}) => {
  const workloads = useMemo<WorkerWorkload[]>(() => {
    if (workers.length === 0) return [];
    
    const constraintMap = new Map<string, WorkerConstraint>();
    for (const c of constraints) {
      constraintMap.set(c.workerKey, c);
    }
    const weeklyMap = weeklyTotals ?? new Map<string, { calls: number; minutes: number }>();
    
    const totalMinutesSum = workers.reduce((sum, w) => sum + w.totalMinutes, 0);
    const avgMinutes = totalMinutesSum / workers.length;
    const totalCallsSum = workers.reduce((sum, w) => sum + w.callCount, 0);
    const avgCalls = totalCallsSum / workers.length;
    
    // Standard deviation for threshold calculation
    const variance = workers.reduce((sum, w) => sum + Math.pow(w.totalMinutes - avgMinutes, 2), 0) / workers.length;
    const stdDev = Math.sqrt(variance);
    
    const overloadThreshold = avgMinutes + stdDev;
    const underloadThreshold = avgMinutes - stdDev;
    
    return workers
      .map((w): WorkerWorkload => {
        const percentage = avgMinutes > 0 ? (w.totalMinutes / avgMinutes) * 100 : 100;
        const constraint = constraintMap.get(w.workerKey);
        const weekly = weeklyMap.get(w.workerKey);
        let capacityUsed: number | undefined;

        if (constraint?.maxCallsPerWeek && weekly) {
          capacityUsed = (weekly.calls / constraint.maxCallsPerWeek) * 100;
        } else if (constraint?.maxMinutesPerWeek && weekly) {
          capacityUsed = (weekly.minutes / constraint.maxMinutesPerWeek) * 100;
        } else if (constraint?.maxCallsPerDay) {
          capacityUsed = (w.callCount / constraint.maxCallsPerDay) * 100;
        } else if (constraint?.maxMinutesPerDay) {
          capacityUsed = (w.totalMinutes / constraint.maxMinutesPerDay) * 100;
        }

        const weeklyOverCalls = constraint?.maxCallsPerWeek
          ? (weekly?.calls ?? 0) > constraint.maxCallsPerWeek
          : false;
        const weeklyOverMinutes = constraint?.maxMinutesPerWeek
          ? (weekly?.minutes ?? 0) > constraint.maxMinutesPerWeek
          : false;
        
        return {
          key: w.workerKey,
          name: w.workerName,
          calls: w.callCount,
          minutes: w.totalMinutes,
          percentage: Math.round(percentage),
          isOverloaded: w.totalMinutes > overloadThreshold || weeklyOverCalls || weeklyOverMinutes || (capacityUsed !== undefined && capacityUsed > 100),
          isUnderloaded: w.totalMinutes < underloadThreshold,
          constraint,
          capacityUsed: capacityUsed ? Math.round(capacityUsed) : undefined,
        };
      })
      .sort((a, b) => b.minutes - a.minutes);
  }, [workers, constraints, weeklyTotals]);

  const stats = useMemo(() => {
    const overloaded = workloads.filter((w) => w.isOverloaded).length;
    const underloaded = workloads.filter((w) => w.isUnderloaded).length;
    const balanced = workloads.length - overloaded - underloaded;
    return { overloaded, underloaded, balanced };
  }, [workloads]);

  const getBarColor = (workload: WorkerWorkload): string => {
    if (workload.capacityUsed !== undefined && workload.capacityUsed > 100) {
      return "bg-red-500";
    }
    if (workload.isOverloaded) {
      return "bg-amber-500";
    }
    if (workload.isUnderloaded) {
      return "bg-blue-400";
    }
    return "bg-emerald-500";
  };

  const formatDuration = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  };

  if (workers.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground">No worker data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" />
          Workload Distribution
        </CardTitle>
        <CardDescription className="text-xs">
          Workers sorted by workload. Hover for details.
        </CardDescription>
        <div className="flex gap-2 mt-2">
          {stats.overloaded > 0 && (
            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-200 bg-amber-50">
              <TrendingUp className="h-3 w-3 mr-1" />
              {stats.overloaded} overloaded
            </Badge>
          )}
          {stats.underloaded > 0 && (
            <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-200 bg-blue-50">
              <TrendingDown className="h-3 w-3 mr-1" />
              {stats.underloaded} underloaded
            </Badge>
          )}
          {stats.balanced > 0 && (
            <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-200 bg-emerald-50">
              <Minus className="h-3 w-3 mr-1" />
              {stats.balanced} balanced
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <TooltipProvider>
          <div className="space-y-2">
            {workloads.map((workload) => (
              <Tooltip key={workload.key}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onWorkerClick?.(workload.key)}
                    className={`w-full text-left rounded-lg border px-3 py-2 transition-colors hover:bg-muted/50 ${
                      selectedWorkerKey === workload.key
                        ? "border-primary bg-primary/5"
                        : "border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate max-w-[120px]">
                          {workload.name}
                        </span>
                        {workload.isOverloaded && (
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{workload.calls} calls</span>
                        <span>•</span>
                        <span>{formatDuration(workload.minutes)}</span>
                      </div>
                    </div>
                    <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`absolute inset-y-0 left-0 rounded-full transition-all ${getBarColor(workload)}`}
                        style={{ width: `${Math.min(workload.percentage, 150)}%` }}
                      />
                      {/* 100% marker */}
                      <div className="absolute inset-y-0 left-[100%] w-0.5 bg-border" />
                    </div>
                    {workload.constraint && (
                      <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
                        <span>
                          {workload.constraint.maxCallsPerDay
                            ? `Limit: ${workload.constraint.maxCallsPerDay} calls/day`
                            : workload.constraint.maxMinutesPerDay
                            ? `Limit: ${formatDuration(workload.constraint.maxMinutesPerDay)}/day`
                            : ""}
                          {(workload.constraint.maxCallsPerDay || workload.constraint.maxMinutesPerDay) && (workload.constraint.maxCallsPerWeek || workload.constraint.maxMinutesPerWeek)
                            ? " • "
                            : ""}
                          {workload.constraint.maxCallsPerWeek
                            ? `${workload.constraint.maxCallsPerWeek} calls/week`
                            : workload.constraint.maxMinutesPerWeek
                            ? `${formatDuration(workload.constraint.maxMinutesPerWeek)}/week`
                            : ""}
                        </span>
                        {workload.capacityUsed !== undefined && (
                          <span className={workload.capacityUsed > 100 ? "text-red-500 font-medium" : ""}>
                            {workload.capacityUsed}% of limit
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[200px]">
                  <p className="font-medium">{workload.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {workload.calls} calls • {formatDuration(workload.minutes)}
                  </p>
                  <p className="text-xs mt-1">
                    {workload.percentage}% of average workload
                  </p>
                  {workload.isOverloaded && (
                    <p className="text-xs text-amber-500 mt-1">
                      ⚠️ Worker is overloaded
                    </p>
                  )}
                  {workload.isUnderloaded && (
                    <p className="text-xs text-blue-500 mt-1">
                      ℹ️ Worker has capacity for more
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
};

export default WorkloadHeatmap;
