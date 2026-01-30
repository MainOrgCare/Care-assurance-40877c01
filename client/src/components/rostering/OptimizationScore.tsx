import React from "react";
import type { OptimizationMetrics } from "@/lib/rostering/travelUtils";
import { TrendingUp, AlertTriangle, CheckCircle, Clock, Car } from "lucide-react";

export interface OptimizationScoreProps {
  metrics: OptimizationMetrics;
  showDetails?: boolean;
}

const gradeColors: Record<OptimizationMetrics["grade"], { bg: string; text: string; border: string }> = {
  A: { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-300" },
  B: { bg: "bg-green-100", text: "text-green-700", border: "border-green-300" },
  C: { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-300" },
  D: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-300" },
  F: { bg: "bg-red-100", text: "text-red-700", border: "border-red-300" },
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
            <span className={`text-xl font-bold ${colors.text}`}>{metrics.grade}</span>
          </div>
          <div>
            <p className="text-sm font-semibold">Route Efficiency</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold">{metrics.efficiency}%</p>
          <p className="text-xs text-muted-foreground">Score</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full rounded-full bg-muted/40">
        <div
          className={`h-2 rounded-full transition-all ${
            metrics.efficiency >= 75
              ? "bg-emerald-500"
              : metrics.efficiency >= 50
              ? "bg-amber-500"
              : "bg-red-500"
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
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              ) : (
                <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
              )}
              <span className="text-[10px] uppercase tracking-wide">Conflicts</span>
            </div>
            <p className={`text-sm font-semibold mt-1 ${metrics.conflictCount > 0 ? "text-amber-600" : "text-emerald-600"}`}>
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
        className={`flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold ${colors.bg} ${colors.text}`}
      >
        {metrics.grade}
      </span>
      <span className="text-sm font-medium">{metrics.efficiency}%</span>
    </div>
  );
};
