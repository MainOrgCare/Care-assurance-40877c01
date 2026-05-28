import React from "react";
import { AlertTriangle, Clock, Users, MapPin, Wand2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TimelineEntry, GanttLane } from "@/lib/rostering/rosterModel";
import { haversineDistance, estimateTravelMinutes } from "@/lib/rostering/travelUtils";

export type ConflictType = "overlap" | "travel" | "double-up" | "time-critical" | "workload";

export interface ConflictAlertProps {
  type: ConflictType;
  title: string;
  description: string;
  count?: number;
  onResolve?: () => void;
}

export interface ConflictDetail {
  type: ConflictType;
  entry1Id: string;
  entry2Id?: string;
  entry1Title: string;
  entry2Title?: string;
  laneId: string;
  laneName: string;
  suggestion?: string;
  suggestedMove?: { entryId: string; newStartMinutes: number };
}

const conflictConfig: Record<ConflictType, { icon: typeof AlertTriangle; color: string; bgColor: string }> = {
  overlap: {
    icon: Clock,
    color: "text-destructive dark:text-destructive",
    bgColor: "bg-destructive/10 dark:bg-destructive/10 border-destructive/30 dark:border-destructive/30",
  },
  travel: {
    icon: MapPin,
    color: "text-warning",
    bgColor: "bg-warning/10 border-warning/30",
  },
  "double-up": {
    icon: Users,
    color: "text-violet-600 dark:text-violet-400",
    bgColor: "bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800/50",
  },
  "time-critical": {
    icon: AlertTriangle,
    color: "text-warning",
    bgColor: "bg-warning/8 border-warning/20",
  },
  workload: {
    icon: Users,
    color: "text-warning",
    bgColor: "bg-warning/10 border-warning/30",
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
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background ${config.color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className={`text-sm font-semibold ${config.color}`}>{title}</p>
          {count !== undefined && count > 0 && (
            <span className={`rounded-full bg-background px-1.5 py-0.5 text-[10px] font-semibold ${config.color}`}>
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
          className={`shrink-0 rounded-lg border bg-background px-2.5 py-1 text-xs font-medium transition hover:bg-muted/40 ${config.color}`}
        >
          Resolve
        </button>
      )}
    </div>
  );
};

export interface ConflictSummaryProps {
  conflicts: Array<{ type: ConflictType; count: number }>;
  onResolveAll?: () => void;
  canResolve?: boolean;
}

export const ConflictSummary: React.FC<ConflictSummaryProps> = ({ conflicts, onResolveAll, canResolve = false }) => {
  const total = conflicts.reduce((sum, c) => sum + c.count, 0);

  if (total === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-success/30 dark:border-success/40 bg-success/10 dark:bg-success/15 px-3 py-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-success/100 text-white">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-sm font-medium text-success dark:text-success">No conflicts detected</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
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
      {canResolve && onResolveAll && total > 0 && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full text-xs"
          onClick={onResolveAll}
        >
          <Wand2 className="h-3.5 w-3.5 mr-1.5" />
          Auto-resolve {total} conflict{total !== 1 ? "s" : ""}
        </Button>
      )}
    </div>
  );
};

// ============================================================================
// Conflict Detection Utilities
// ============================================================================

/**
 * Detect all conflicts in the timeline lanes
 */
export const detectConflicts = (lanes: GanttLane[]): ConflictDetail[] => {
  const conflicts: ConflictDetail[] = [];
  const doubleUpEntriesBySlot = new Map<
    string,
    Array<{ laneId: string; laneName: string; entry: TimelineEntry }>
  >();

  for (const lane of lanes) {
    const sorted = [...lane.entries]
      .filter((e) => Number.isFinite(e.startMinutes))
      .sort((a, b) => a.startMinutes - b.startMinutes);

    for (const entry of sorted) {
      if (!entry.isDoubleUp) continue;
      const slotUserKey = entry.serviceUserKey ?? entry.serviceUserName ?? entry.title;
      const slotTime = entry.requiredStartMinutes ?? entry.startMinutes;
      const slotType = entry.callTypeLabel ?? "";
      const slotKey = `${slotUserKey}|${slotTime}|${slotType}`;
      const participants = doubleUpEntriesBySlot.get(slotKey);
      if (participants) {
        participants.push({ laneId: lane.id, laneName: lane.label, entry });
      } else {
        doubleUpEntriesBySlot.set(slotKey, [{ laneId: lane.id, laneName: lane.label, entry }]);
      }
    }

    for (let i = 0; i < sorted.length - 1; i++) {
      const curr = sorted[i];
      const next = sorted[i + 1];
      const currEnd = curr.startMinutes + curr.durationMinutes;

      // Check for overlap
      if (next.startMinutes < currEnd) {
        const overlapMinutes = currEnd - next.startMinutes;
        conflicts.push({
          type: "overlap",
          entry1Id: curr.id,
          entry2Id: next.id,
          entry1Title: curr.title,
          entry2Title: next.title,
          laneId: lane.id,
          laneName: lane.label,
          suggestion: `Move "${next.title}" ${overlapMinutes} minutes later to resolve overlap`,
          suggestedMove: {
            entryId: next.id,
            newStartMinutes: currEnd + 5, // Add 5 min buffer
          },
        });
        continue;
      }

      // Check for travel-gap violation (docs §5.1): when both visits are geocoded and the
      // actual gap between them is shorter than the estimated driving time, the worker
      // physically cannot get there in time. Only evaluated when the visits don't overlap.
      if (
        curr.latitude != null &&
        curr.longitude != null &&
        next.latitude != null &&
        next.longitude != null
      ) {
        const distanceKm = haversineDistance(
          curr.latitude,
          curr.longitude,
          next.latitude,
          next.longitude
        );
        const travelMinutes = estimateTravelMinutes(distanceKm);
        const gapMinutes = next.startMinutes - currEnd;
        if (travelMinutes > gapMinutes) {
          const shortfall = travelMinutes - gapMinutes;
          conflicts.push({
            type: "travel",
            entry1Id: curr.id,
            entry2Id: next.id,
            entry1Title: curr.title,
            entry2Title: next.title,
            laneId: lane.id,
            laneName: lane.label,
            suggestion: `Allow ~${travelMinutes} min travel: move "${next.title}" ${shortfall} min later`,
            suggestedMove: {
              entryId: next.id,
              newStartMinutes: currEnd + travelMinutes,
            },
          });
        }
      }
    }
  }

  // Double-up safety checks across all lanes.
  for (const participants of doubleUpEntriesBySlot.values()) {
    if (participants.length <= 1) {
      const only = participants[0];
      if (!only) continue;
      conflicts.push({
        type: "double-up",
        entry1Id: only.entry.id,
        entry1Title: only.entry.title,
        laneId: only.laneId,
        laneName: only.laneName,
        suggestion: "Double-up call is unpaired; assign a second worker at the same time",
      });
      continue;
    }

    const starts = participants.map((p) => p.entry.startMinutes);
    const targetStart = Math.min(...starts);
    const anchor = participants.find((p) => p.entry.startMinutes === targetStart) ?? participants[0];

    for (const participant of participants) {
      if (participant.entry.startMinutes === targetStart) continue;
      conflicts.push({
        type: "double-up",
        entry1Id: anchor.entry.id,
        entry2Id: participant.entry.id,
        entry1Title: anchor.entry.title,
        entry2Title: participant.entry.title,
        laneId: participant.laneId,
        laneName: participant.laneName,
        suggestion: `Align double-up timing: move "${participant.entry.title}" to ${targetStart} minutes`,
        suggestedMove: {
          entryId: participant.entry.id,
          newStartMinutes: targetStart,
        },
      });
    }
  }

  return conflicts;
};

/**
 * Generate automatic resolution moves for all conflicts
 */
export const generateAutoResolutions = (
  lanes: GanttLane[]
): Record<string, number> => {
  const moves: Record<string, number> = {};

  for (const lane of lanes) {
    const sorted = [...lane.entries]
      .filter((e) => Number.isFinite(e.startMinutes))
      .sort((a, b) => a.startMinutes - b.startMinutes);

    let cursor = sorted[0]?.startMinutes ?? 360; // 6:00 AM
    let prev: TimelineEntry | undefined;

    for (const entry of sorted) {
      // When we have a previous visit, the earliest legal start for this one is the
      // previous end plus either the estimated driving time (if both visits are
      // geocoded) or a flat 5-minute buffer. This keeps auto-resolutions consistent
      // with the travel-gap conflicts emitted by detectConflicts().
      let buffer = 5;
      if (
        prev &&
        prev.latitude != null &&
        prev.longitude != null &&
        entry.latitude != null &&
        entry.longitude != null
      ) {
        const distanceKm = haversineDistance(
          prev.latitude,
          prev.longitude,
          entry.latitude,
          entry.longitude
        );
        buffer = Math.max(5, estimateTravelMinutes(distanceKm));
      }
      const earliestStart = prev ? cursor - 5 + buffer : cursor;

      // If entry starts before its earliest legal start, move it (unless time-critical).
      if (entry.startMinutes < earliestStart) {
        if (!entry.isTimeCritical) {
          moves[entry.id] = earliestStart;
        }
      }
      const effectiveStart = moves[entry.id] ?? entry.startMinutes;
      // Cursor tracks "end of this visit + 5 min" so the next iteration can add its
      // own travel buffer relative to a known anchor.
      cursor = effectiveStart + entry.durationMinutes + 5;
      prev = entry;
    }
  }

  return moves;
};

// ============================================================================
// Detailed Conflict List Component
// ============================================================================

export interface ConflictListProps {
  conflicts: ConflictDetail[];
  onResolve?: (conflict: ConflictDetail) => void;
  onSelectEntry?: (entryId: string) => void;
}

export const ConflictList: React.FC<ConflictListProps> = ({
  conflicts,
  onResolve,
  onSelectEntry,
}) => {
  if (conflicts.length === 0) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        No conflicts to display
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {conflicts.map((conflict, idx) => {
        const config = conflictConfig[conflict.type];
        const Icon = config.icon;

        return (
          <div
            key={`${conflict.entry1Id}-${conflict.entry2Id ?? idx}`}
            className={`rounded-lg border p-2.5 ${config.bgColor}`}
          >
            <div className="flex items-start gap-2">
              <Icon className={`h-4 w-4 mt-0.5 ${config.color}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => onSelectEntry?.(conflict.entry1Id)}
                    className="font-semibold hover:underline truncate max-w-[120px]"
                  >
                    {conflict.entry1Title}
                  </button>
                  {conflict.entry2Title && (
                    <>
                      <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      <button
                        type="button"
                        onClick={() => conflict.entry2Id && onSelectEntry?.(conflict.entry2Id)}
                        className="font-semibold hover:underline truncate max-w-[120px]"
                      >
                        {conflict.entry2Title}
                      </button>
                    </>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {conflict.laneName}
                </p>
                {conflict.suggestion && (
                  <p className="text-[10px] text-muted-foreground mt-1 italic">
                    💡 {conflict.suggestion}
                  </p>
                )}
              </div>
              {onResolve && conflict.suggestedMove && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => onResolve(conflict)}
                >
                  Fix
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
