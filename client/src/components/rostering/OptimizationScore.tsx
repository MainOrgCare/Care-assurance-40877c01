import React from "react";
import type { OptimizationMetrics } from "@/lib/rostering/travelUtils";
import { TrendingUp, AlertTriangle, CheckCircle, Clock, Car } from "lucide-react";

export interface OptimizationScoreProps {
  metrics: OptimizationMetrics;
  showDetails?: boolean;
}

const gradeColors: Record<OptimizationMetrics["grade"], { bg: string; text: string; border: string }> = {
  A: { bg: "bg-success/10 dark:bg-success-950/40", text: "text-success dark:text-success-400", border: "bg-success/10" },
  B: { bg: "bg-success/10 dark:bg-green-950/40", text: "text-success dark:text-green-400", border: "border-green-300 dark:border-green-700/60" },
  C: { bg: "bg-warning/10", text: "text-warning", border: "border-warning/30/60" },
  D: { bg: "bg-orange-100 dark:bg-orange-950/40", text: "text-orange-700 dark:text-orange-400", border: "border-orange-300 dark:border-orange-700/60" },
  F: { bg: "bg-destructive/10 dark:bg-red-950/40", text: "text-destructive dark:text-red-400", border: "border-red-300 dark:border-red-700/60" },
};

const gradeDescriptions: Record<OptimizationMetrics["grade"], string> = {
  A: "Excellent route efficiency",
  B: "Good schedule with minor gaps",
  C: "Moderate efficiency, room for improvement",
  D: "Suboptimal routing, consider rebalancing",
  F: "Poor efficiency, significant issues",
};

export const OptimizationScore: React.FC<OptimizationScoreProps> = ({
  metrics,
  showDetails = true,
}) => {
  const colors = gradeColors[metrics.grade];
  const description = gradeDescriptions[metrics.grade];

  return (
    <div className="rounded-xl border bg-card/70 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-xl border-2 ${colors.bg} ${colors.border}`}
          >
            <span className={`text-xl font-semibold ${colors.text}`}>{metrics.grade}</span>
          </div>
          <div>
            <p className="text-sm font-semibold">Route Efficiency</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold">{metrics.efficiency}%</p>
          <p className="text-xs text-muted-foreground">Score</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full rounded-full bg-muted/40">
        <div
          className={`h-2 rounded-full transition-all ${
            metrics.efficiency >= 75
              ? "bg-success/100"
              : metrics.efficiency >= 50
              ? "bg-warning/100"
              : "bg-destructive/100"
          }`}
          style={{ width: `${metrics.efficiency}%` }}
        />
      </div>

      {showDetails && (
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="rounded-lg border border-border/50 bg-background/60 px-3 py-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Car className="h-3.5 w-3.5" />
              <span className="text-[10px] uppercase tracking-wide">Total travel</span>
            </div>
            <p className="text-sm font-semibold mt-1">{metrics.totalTravelMinutes} mins</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/60 px-3 py-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span className="text-[10px] uppercase tracking-wide">Avg per trip</span>
            </div>
            <p className="text-sm font-semibold mt-1">{metrics.avgTravelMinutes} mins</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/60 px-3 py-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" />
              <span className="text-[10px] uppercase tracking-wide">Gap time</span>
            </div>
            <p className="text-sm font-semibold mt-1">{metrics.totalGapMinutes} mins</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/60 px-3 py-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              {metrics.conflictCount > 0 ? (
                <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              ) : (
                <CheckCircle className="h-3.5 w-3.5 text-success" />
              )}
              <span className="text-[10px] uppercase tracking-wide">Conflicts</span>
            </div>
            <p className={`text-sm font-semibold mt-1 ${metrics.conflictCount > 0 ? "text-warning" : "text-success dark:text-success-400"}`}>
              {metrics.conflictCount}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export const OptimizationScoreCompact: React.FC<{ metrics: OptimizationMetrics }> = ({
  metrics,
}) => {
  const colors = gradeColors[metrics.grade];

  return (
    <div className="inline-flex items-center gap-2">
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-md text-xs font-semibold ${colors.bg} ${colors.text}`}
      >
        {metrics.grade}
      </span>
      <span className="text-sm font-medium">{metrics.efficiency}%</span>
    </div>
  );
};
