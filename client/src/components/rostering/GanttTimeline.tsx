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

export interface GanttTimelineProps {
  lanes: GanttLane[];
  startMinutes: number;
  endMinutes: number;
  onSelectEntry?: (entry: TimelineEntry) => void;
  onEntryMove?: (entryId: string, newStartMinutes: number) => void;
  snapMinutes?: number;
  showHalfHourTicks?: boolean;
  selectedEntryId?: string | null;
}

const formatTimeLabel = (minutes: number) => {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const GanttTimeline: React.FC<GanttTimelineProps> = ({
  lanes,
  startMinutes,
  endMinutes,
  onSelectEntry,
  onEntryMove,
  snapMinutes = 10,
  showHalfHourTicks = false,
  selectedEntryId,
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

  return (
    <div className="rounded-2xl border bg-card/70 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold">Timeline</p>
          <p className="text-xs text-muted-foreground">{formatTimeLabel(startMinutes)} — {formatTimeLabel(endMinutes)}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Scheduled
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-400" /> Time critical
          </span>
        </div>
      </div>

      <div className="rounded-xl border bg-background/60">
        <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2">
          <div className="w-[180px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Worker</div>
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
                    <span className="ml-1 text-[10px] text-muted-foreground">{formatTimeLabel(tick)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="divide-y">
            {lanes.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted-foreground">No scheduled entries available.</div>
            ) : (
              lanes.map((lane, idx) => (
                <div
                  key={lane.id}
                  className={`flex items-stretch gap-2 px-4 py-3 ${idx % 2 === 0 ? "bg-background/40" : "bg-muted/20"}`}
                >
                  <div className="w-[180px]">
                    <p className="text-sm font-semibold text-foreground truncate">{lane.label}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {lane.entries.length} slots · {Math.round(lane.entries.reduce((acc, entry) => acc + entry.durationMinutes, 0))} mins
                    </p>
                  </div>
                  <div ref={trackRef} className="relative flex-1">
                    <div className="h-12 rounded-md bg-muted/30" />
                    {lane.entries.map((entry) => (
                      <DraggableEntry
                        key={entry.id}
                        entry={entry}
                        startMinutes={startMinutes}
                        endMinutes={endMinutes}
                        totalMinutes={totalMinutes}
                        onSelect={onSelectEntry}
                        isSelected={selectedEntryId === entry.id}
                      />
                    ))}
                  </div>
                </div>
              ))
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
}

const DraggableEntry: React.FC<DraggableEntryProps> = ({
  entry,
  startMinutes,
  endMinutes,
  totalMinutes,
  onSelect,
  isSelected = false,
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: entry.id });
  const start = clamp(entry.startMinutes, startMinutes, endMinutes);
  const end = clamp(entry.startMinutes + entry.durationMinutes, startMinutes, endMinutes);
  const left = ((start - startMinutes) / totalMinutes) * 100;
  const width = ((end - start) / totalMinutes) * 100;

  const style = {
    left: `${left}%`,
    width: `${Math.max(width, 1)}%`,
    transform: CSS.Translate.toString(transform),
  } as React.CSSProperties;

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onSelect?.(entry)}
      className={`absolute top-1 h-10 rounded-lg px-2 text-left text-[11px] font-semibold text-white shadow-sm transition focus:outline-none focus:ring-2 focus:ring-primary/60 ${
        entry.isTimeCritical ? "bg-amber-500" : "bg-emerald-500"
      } ${isDragging ? "opacity-80 ring-2 ring-primary/50" : ""} ${isSelected ? "ring-2 ring-white/80" : ""}`}
      style={style}
      {...attributes}
      {...listeners}
    >
      <div className="truncate">{entry.title}</div>
      <div className="text-[10px] font-normal opacity-90">
        {formatTimeLabel(entry.startMinutes)} · {entry.durationMinutes}m
      </div>
    </button>
  );
};
