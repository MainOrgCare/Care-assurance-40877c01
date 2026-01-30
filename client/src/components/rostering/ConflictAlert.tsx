import React from "react";
import { AlertTriangle, Clock, Users, MapPin } from "lucide-react";

export type ConflictType = "overlap" | "travel" | "double-up" | "time-critical";

export interface ConflictAlertProps {
  type: ConflictType;
  title: string;
  description: string;
  count?: number;
  onResolve?: () => void;
}

const conflictConfig: Record<ConflictType, { icon: typeof AlertTriangle; color: string; bgColor: string }> = {
  overlap: {
    icon: Clock,
    color: "text-red-600",
    bgColor: "bg-red-50 border-red-200",
  },
  travel: {
    icon: MapPin,
    color: "text-amber-600",
    bgColor: "bg-amber-50 border-amber-200",
  },
  "double-up": {
    icon: Users,
    color: "text-violet-600",
    bgColor: "bg-violet-50 border-violet-200",
  },
  "time-critical": {
    icon: AlertTriangle,
    color: "text-orange-600",
    bgColor: "bg-orange-50 border-orange-200",
  },
};

export const ConflictAlert: React.FC<ConflictAlertProps> = ({
  type,
  title,
  description,
  count,
  onResolve,
}) => {
  const config = conflictConfig[type];
  const Icon = config.icon;

  return (
    <div className={`flex items-start gap-3 rounded-xl border p-3 ${config.bgColor}`}>
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white ${config.color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className={`text-sm font-semibold ${config.color}`}>{title}</p>
          {count !== undefined && count > 0 && (
            <span className={`rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold ${config.color}`}>
              {count}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      {onResolve && (
        <button
          type="button"
          onClick={onResolve}
          className={`shrink-0 rounded-lg border bg-white px-2.5 py-1 text-xs font-medium transition hover:bg-muted/40 ${config.color}`}
        >
          Resolve
        </button>
      )}
    </div>
  );
};

export interface ConflictSummaryProps {
  conflicts: Array<{ type: ConflictType; count: number }>;
}

export const ConflictSummary: React.FC<ConflictSummaryProps> = ({ conflicts }) => {
  const total = conflicts.reduce((sum, c) => sum + c.count, 0);

  if (total === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-sm font-medium text-emerald-700">No conflicts detected</p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {conflicts.map(({ type, count }) => {
        if (count === 0) return null;
        const config = conflictConfig[type];
        const Icon = config.icon;
        return (
          <div
            key={type}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${config.bgColor} ${config.color}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {count} {type.replace("-", " ")}
          </div>
        );
      })}
    </div>
  );
};
