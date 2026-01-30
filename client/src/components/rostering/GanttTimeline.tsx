import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { GanttLane, TimelineEntry } from "@/lib/rostering/rosterModel";
import { WorkerAvatar } from "./WorkerAvatar";
import { AlertTriangle, Clock } from "lucide-react";

export interface GanttTimelineProps {
  lanes: GanttLane[];
  startMinutes: number;
  endMinutes: number;
  onSelectEntry?: (entry: TimelineEntry) => void;
  onEntryMove?: (entryId: string, newStartMinutes: number) => void;
  snapMinutes?: number;
  showHalfHourTicks?: boolean;
  selectedEntryId?: string | null;
  showConflicts?: boolean;
  showTravelGaps?: boolean;
  enableDrag?: boolean;
}

const formatTimeLabel = (minutes: number) => {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

// Call type to color mapping
const getCallTypeColor = (callTypeLabel: string | null | undefined): { bg: string; border: string } => {
  const label = (callTypeLabel || "").toLowerCase();
  if (label.includes("am") || label.includes("morning")) {
    return { bg: "bg-sky-500", border: "border-sky-600" };
  }
  if (label.includes("lunch")) {
    return { bg: "bg-amber-500", border: "border-amber-600" };
  }
  if (label.includes("tea")) {
    return { bg: "bg-orange-500", border: "border-orange-600" };
  }
  if (label.includes("evening") || label.includes("pm")) {
    return { bg: "bg-violet-500", border: "border-violet-600" };
  }
  if (label.includes("night")) {
    return { bg: "bg-indigo-500", border: "border-indigo-600" };
  }
  return { bg: "bg-emerald-500", border: "border-emerald-600" };
};

// Check for overlaps in a lane
const findConflicts = (entries: TimelineEntry[]): Set<string> => {
  const conflicts = new Set<string>();
  const sorted = [...entries]
    .filter((e) => Number.isFinite(e.startMinutes))
    .sort((a, b) => a.startMinutes - b.startMinutes);
  
  for (let i = 0; i < sorted.length - 1; i++) {
    const curr = sorted[i];
    const next = sorted[i + 1];
    const currEnd = curr.startMinutes + curr.durationMinutes;
    if (next.startMinutes < currEnd) {
      conflicts.add(curr.id);
      conflicts.add(next.id);
    }
  }
  return conflicts;
};

// Calculate travel gaps
interface TravelGap {
  afterEntryId: string;
  gapMinutes: number;
  leftPercent: number;
  widthPercent: number;
}

export const GanttTimeline: React.FC<GanttTimelineProps> = ({
  lanes,
  startMinutes,
  endMinutes,
  onSelectEntry,
  onEntryMove,
  snapMinutes = 10,
  showHalfHourTicks = false,
  selectedEntryId,
  showConflicts = true,
  showTravelGaps = true,
  enableDrag = true,
}) => {
  const totalMinutes = Math.max(endMinutes - startMinutes, 1);
  const hours = Math.ceil(totalMinutes / 60);
  const hourTicks = Array.from({ length: hours + 1 }, (_, idx) => startMinutes + idx * 60);
  const minorTicks = showHalfHourTicks
    ? Array.from({ length: hours * 2 + 1 }, (_, idx) => startMinutes + idx * 30)
    : [];
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);

  useEffect(() => {
    if (!trackRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setTrackWidth(entry.contentRect.width);
      }
    });
    observer.observe(trackRef.current);
    return () => observer.disconnect();
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const entryIndex = useMemo(() => {
    const map = new Map<string, TimelineEntry>();
    lanes.forEach((lane) => lane.entries.forEach((entry) => map.set(entry.id, entry)));
    return map;
  }, [lanes]);

  // Find all conflicts across lanes
  const allConflicts = useMemo(() => {
    const conflicts = new Set<string>();
    if (!showConflicts) return conflicts;
    lanes.forEach((lane) => {
      findConflicts(lane.entries).forEach((id) => conflicts.add(id));
    });
    return conflicts;
  }, [lanes, showConflicts]);

  // Calculate travel gaps for each lane
  const laneGaps = useMemo(() => {
    if (!showTravelGaps) return new Map<string, TravelGap[]>();
    const gapsMap = new Map<string, TravelGap[]>();
    
    lanes.forEach((lane) => {
      const gaps: TravelGap[] = [];
      const sorted = [...lane.entries]
        .filter((e) => Number.isFinite(e.startMinutes))
        .sort((a, b) => a.startMinutes - b.startMinutes);
      
      for (let i = 0; i < sorted.length - 1; i++) {
        const curr = sorted[i];
        const next = sorted[i + 1];
        const currEnd = curr.startMinutes + curr.durationMinutes;
        const gapMinutes = next.startMinutes - currEnd;
        
        if (gapMinutes > 5) { // Only show gaps > 5 minutes
          const leftPercent = ((currEnd - startMinutes) / totalMinutes) * 100;
          const widthPercent = (gapMinutes / totalMinutes) * 100;
          gaps.push({
            afterEntryId: curr.id,
            gapMinutes,
            leftPercent,
            widthPercent,
          });
        }
      }
      gapsMap.set(lane.id, gaps);
    });
    
    return gapsMap;
  }, [lanes, showTravelGaps, startMinutes, totalMinutes]);

  const handleDragEnd = (event: DragEndEvent) => {
    const entryId = String(event.active.id);
    const entry = entryIndex.get(entryId);
    if (!entry || !trackWidth) return;
    const minutesPerPixel = totalMinutes / trackWidth;
    const deltaMinutes = Math.round(event.delta.x * minutesPerPixel);
    const rawStart = entry.startMinutes + deltaMinutes;
    const snappedStart = Math.round(rawStart / snapMinutes) * snapMinutes;
    const nextStart = clamp(
      snappedStart,
      startMinutes,
      endMinutes - entry.durationMinutes
    );
    if (nextStart !== entry.startMinutes) {
      onEntryMove?.(entryId, nextStart);
    }
  };

  const totalConflicts = allConflicts.size;

  return (
    <div className="rounded-2xl border bg-card/70 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold">Timeline</p>
          <p className="text-xs text-muted-foreground">
            {formatTimeLabel(startMinutes)} — {formatTimeLabel(endMinutes)} · Snap: {snapMinutes}m
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-sky-500" /> AM
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-500" /> Lunch
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-orange-500" /> Tea
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-violet-500" /> Evening
          </span>
          {totalConflicts > 0 && (
            <span className="inline-flex items-center gap-1 text-red-500 font-medium">
              <AlertTriangle className="h-3 w-3" /> {totalConflicts / 2} conflicts
            </span>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-background/60 overflow-hidden">
        <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2">
          <div className="w-[200px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Worker</div>
          <div className="flex-1">
            <div className="relative h-8">
              {minorTicks.map((tick) => {
                const left = ((tick - startMinutes) / totalMinutes) * 100;
                return (
                  <div
                    key={`minor-${tick}`}
                    className="absolute inset-y-0"
                    style={{ left: `${left}%` }}
                  >
                    <div className="h-8 w-px bg-border/30" />
                  </div>
                );
              })}
              {hourTicks.map((tick) => {
                const left = ((tick - startMinutes) / totalMinutes) * 100;
                return (
                  <div
                    key={tick}
                    className="absolute inset-y-0 flex items-center"
                    style={{ left: `${left}%` }}
                  >
                    <div className="h-8 w-px bg-border/60" />
                    <span className="ml-1 text-[10px] text-muted-foreground font-medium">{formatTimeLabel(tick)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="divide-y divide-border/40">
            {lanes.length === 0 ? (
              <div className="px-4 py-8 text-sm text-muted-foreground text-center">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                No scheduled entries available.
              </div>
            ) : (
              lanes.map((lane, idx) => {
                const laneTotalMinutes = lane.entries.reduce((acc, entry) => acc + entry.durationMinutes, 0);
                const utilization = Math.min(100, Math.round((laneTotalMinutes / (8 * 60)) * 100));
                const gaps = laneGaps.get(lane.id) || [];
                
                return (
                  <div
                    key={lane.id}
                    className={`flex items-stretch gap-2 px-4 py-3 transition-colors ${idx % 2 === 0 ? "bg-background/40" : "bg-muted/20"}`}
                  >
                    <div className="w-[200px] flex items-start gap-2">
                      <WorkerAvatar name={lane.label} size="md" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{lane.label}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {lane.entries.length} slots · {Math.round(laneTotalMinutes)} mins
                        </p>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <div className="flex-1 h-1 rounded-full bg-muted/50 max-w-[80px]">
                            <div
                              className={`h-1 rounded-full transition-all ${
                                utilization > 100 ? "bg-red-500" : utilization > 80 ? "bg-amber-500" : "bg-emerald-500"
                              }`}
                              style={{ width: `${Math.min(utilization, 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground">{utilization}%</span>
                        </div>
                      </div>
                    </div>
                    <div ref={idx === 0 ? trackRef : undefined} className="relative flex-1">
                      {/* Background track with hour divisions */}
                      <div className="h-14 rounded-lg bg-muted/20 relative overflow-hidden">
                        {hourTicks.slice(0, -1).map((tick) => {
                          const left = ((tick - startMinutes) / totalMinutes) * 100;
                          return (
                            <div
                              key={`bg-${tick}`}
                              className="absolute inset-y-0 w-px bg-border/20"
                              style={{ left: `${left}%` }}
                            />
                          );
                        })}
                      </div>
                      {/* Travel gap indicators */}
                      {gaps.map((gap) => (
                        <div
                          key={`gap-${gap.afterEntryId}`}
                          className="absolute top-1 h-12 flex items-center justify-center"
                          style={{ left: `${gap.leftPercent}%`, width: `${gap.widthPercent}%` }}
                        >
                          <div className="h-6 w-full rounded border border-dashed border-amber-400/50 bg-amber-50/30 flex items-center justify-center">
                            <span className="text-[9px] text-amber-600 font-medium">{gap.gapMinutes}m</span>
                          </div>
                        </div>
                      ))}
                      {/* Entry blocks */}
                      {lane.entries.map((entry) => (
                        <DraggableEntry
                          key={entry.id}
                          entry={entry}
                          startMinutes={startMinutes}
                          endMinutes={endMinutes}
                          totalMinutes={totalMinutes}
                          onSelect={onSelectEntry}
                          isSelected={selectedEntryId === entry.id}
                          hasConflict={allConflicts.has(entry.id)}
                          enableDrag={enableDrag}
                        />
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </DndContext>
      </div>
    </div>
  );
};

interface DraggableEntryProps {
  entry: TimelineEntry;
  startMinutes: number;
  endMinutes: number;
  totalMinutes: number;
  onSelect?: (entry: TimelineEntry) => void;
  isSelected?: boolean;
  hasConflict?: boolean;
  enableDrag?: boolean;
}

const DraggableEntry: React.FC<DraggableEntryProps> = ({
  entry,
  startMinutes,
  endMinutes,
  totalMinutes,
  onSelect,
  isSelected = false,
  hasConflict = false,
  enableDrag = true,
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: entry.id,
    disabled: !enableDrag,
  });
  const start = clamp(entry.startMinutes, startMinutes, endMinutes);
  const end = clamp(entry.startMinutes + entry.durationMinutes, startMinutes, endMinutes);
  const left = ((start - startMinutes) / totalMinutes) * 100;
  const width = ((end - start) / totalMinutes) * 100;

  const colors = entry.isTimeCritical 
    ? { bg: "bg-amber-500", border: "border-amber-600" }
    : getCallTypeColor(entry.callTypeLabel);

  const style = {
    left: `${left}%`,
    width: `${Math.max(width, 2)}%`,
    transform: CSS.Translate.toString(transform),
  } as React.CSSProperties;

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onSelect?.(entry)}
      className={`absolute top-1 h-12 rounded-lg px-2 text-left text-[11px] font-semibold text-white shadow-md transition-all 
        focus:outline-none focus:ring-2 focus:ring-primary/60 
        ${colors.bg} border-l-4 ${colors.border}
        ${isDragging ? "opacity-90 scale-105 shadow-lg ring-2 ring-white/50 z-20" : ""}
        ${isSelected ? "ring-2 ring-white shadow-lg z-10" : ""}
        ${hasConflict ? "animate-pulse ring-2 ring-red-400" : ""}
        hover:brightness-110`}
      style={style}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-center gap-1">
        {entry.isTimeCritical && <AlertTriangle className="h-3 w-3 shrink-0" />}
        <span className="truncate">{entry.title}</span>
      </div>
      <div className="text-[10px] font-normal opacity-90 flex items-center gap-1">
        <Clock className="h-2.5 w-2.5" />
        {formatTimeLabel(entry.startMinutes)} · {entry.durationMinutes}m
      </div>
      {hasConflict && (
        <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500 border border-white" />
      )}
    </button>
  );
};
