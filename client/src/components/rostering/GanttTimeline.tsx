import React, { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  DragOverlay,
  rectIntersection,
} from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { GanttLane, TimelineEntry } from "@/lib/rostering/rosterModel";
import { WorkerAvatar } from "./WorkerAvatar";
import { AlertTriangle, Clock, Check, CheckCircle2, Target } from "lucide-react";

/** Recommended call time window */
export interface RecommendedTimeWindow {
  serviceUserKey: string;
  callTypeLabel: string;
  recommendedStartMinutes: number;
  toleranceMinutes: number;
}

export interface GanttTimelineProps {
  lanes: GanttLane[];
  startMinutes: number;
  endMinutes: number;
  /** Called when entry is clicked. Event is passed for Shift+Click detection */
  onSelectEntry?: (entry: TimelineEntry, event?: React.MouseEvent) => void;
  /** Called when an entry is moved. If newLaneId is provided, entry was dragged to a different worker */
  onEntryMove?: (entryId: string, newStartMinutes: number, newLaneId?: string) => void;
  snapMinutes?: number;
  showHalfHourTicks?: boolean;
  selectedEntryId?: string | null;
  /** Set of entry IDs that are currently selected (for multi-select) */
  selectedEntryIds?: Set<string>;
  /** ID of the entry that was last focused (for Shift+Click range) */
  focusedEntryId?: string | null;
  showConflicts?: boolean;
  showTravelGaps?: boolean;
  enableDrag?: boolean;
  /** Recommended call time windows - shows target indicators for scheduled times */
  recommendedTimes?: RecommendedTimeWindow[];
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

// Droppable lane wrapper for cross-worker drag-drop
interface DroppableLaneProps {
  laneId: string;
  isDropTarget: boolean;
  isSourceLane: boolean;
  className?: string;
  children: React.ReactNode;
}

const DroppableLane: React.FC<DroppableLaneProps> = ({
  laneId,
  isDropTarget,
  isSourceLane,
  className = "",
  children,
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: laneId });

  return (
    <div
      ref={setNodeRef}
      className={`${className} ${
        isDropTarget || isOver
          ? "bg-primary/10 ring-2 ring-primary/30 ring-inset"
          : ""
      } ${isSourceLane ? "bg-muted/30" : ""}`}
    >
      {children}
      {(isDropTarget || isOver) && !isSourceLane && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground">
          <Check className="h-3 w-3" /> Drop here
        </div>
      )}
    </div>
  );
};

export const GanttTimeline: React.FC<GanttTimelineProps> = ({
  lanes,
  startMinutes,
  endMinutes,
  onSelectEntry,
  onEntryMove,
  snapMinutes = 10,
  showHalfHourTicks = false,
  selectedEntryId,
  selectedEntryIds,
  focusedEntryId,
  showConflicts = true,
  showTravelGaps = true,
  enableDrag = true,
  recommendedTimes = [],
}) => {
  const totalMinutes = Math.max(endMinutes - startMinutes, 1);
  const hours = Math.ceil(totalMinutes / 60);
  const hourTicks = Array.from({ length: hours + 1 }, (_, idx) => startMinutes + idx * 60);
  const minorTicks = showHalfHourTicks
    ? Array.from({ length: hours * 2 + 1 }, (_, idx) => startMinutes + idx * 30)
    : [];
  const trackRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const [activeLaneId, setActiveLaneId] = useState<string | null>(null);
  const [dragOverLaneId, setDragOverLaneId] = useState<string | null>(null);
  
  // Virtual scrolling state
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(400);
  const ROW_HEIGHT = 72; // Height of each lane row in pixels
  const OVERSCAN = 3; // Number of extra rows to render above/below viewport
  const VIRTUAL_SCROLL_THRESHOLD = 10; // Only virtualize when > this many lanes

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

  // Handle scroll for virtual scrolling
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    const handleScroll = () => {
      setScrollTop(container.scrollTop);
    };
    
    const handleResize = () => {
      setViewportHeight(container.clientHeight);
    };
    
    container.addEventListener("scroll", handleScroll, { passive: true });
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    handleResize(); // Initial measurement
    
    return () => {
      container.removeEventListener("scroll", handleScroll);
      resizeObserver.disconnect();
    };
  }, []);

  // Calculate visible lanes for virtual scrolling
  const { visibleLanes, startIndex, totalHeight } = useMemo(() => {
    if (lanes.length <= VIRTUAL_SCROLL_THRESHOLD) {
      return { visibleLanes: lanes, startIndex: 0, totalHeight: 0 };
    }
    
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2;
    const end = Math.min(lanes.length, start + visibleCount);
    
    return {
      visibleLanes: lanes.slice(start, end),
      startIndex: start,
      totalHeight: lanes.length * ROW_HEIGHT,
    };
  }, [lanes, scrollTop, viewportHeight]);

  // Multi-sensor setup for mouse, touch, and keyboard
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor)
  );

  // Dragging entry for overlay
  const [activeEntry, setActiveEntry] = useState<TimelineEntry | null>(null);

  const entryIndex = useMemo(() => {
    const map = new Map<string, TimelineEntry>();
    lanes.forEach((lane) => lane.entries.forEach((entry) => map.set(entry.id, entry)));
    return map;
  }, [lanes]);

  // Map entry IDs to their current lane ID
  const entryToLaneMap = useMemo(() => {
    const map = new Map<string, string>();
    lanes.forEach((lane) => {
      lane.entries.forEach((entry) => map.set(entry.id, lane.id));
    });
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

  // Check entries against recommended times - returns status per entry
  const recommendedTimeStatus = useMemo(() => {
    const statusMap = new Map<string, { hasRecommendation: boolean; isWithinWindow: boolean; deviationMinutes: number }>();
    if (!recommendedTimes || recommendedTimes.length === 0) return statusMap;
    
    lanes.forEach((lane) => {
      lane.entries.forEach((entry) => {
        // Find matching recommendation by service user and call type
        const recommendation = recommendedTimes.find(
          (rt) => rt.serviceUserKey === entry.serviceUserKey && 
                  (rt.callTypeLabel === entry.callTypeLabel || !rt.callTypeLabel)
        );
        
        if (recommendation) {
          const deviation = Math.abs(entry.startMinutes - recommendation.recommendedStartMinutes);
          const isWithinWindow = deviation <= recommendation.toleranceMinutes;
          statusMap.set(entry.id, {
            hasRecommendation: true,
            isWithinWindow,
            deviationMinutes: deviation,
          });
        }
      });
    });
    
    return statusMap;
  }, [lanes, recommendedTimes]);

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

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const overId = event.over?.id;
    if (overId && typeof overId === "string") {
      // Check if hovering over a lane (lane IDs are used as droppable IDs)
      const isLane = lanes.some((lane) => lane.id === overId);
      setDragOverLaneId(isLane ? overId : null);
    } else {
      setDragOverLaneId(null);
    }
  }, [lanes]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const entryId = String(event.active.id);
    const currentLaneId = entryToLaneMap.get(entryId);
    setActiveLaneId(currentLaneId ?? null);
    setActiveEntry(entryIndex.get(entryId) ?? null);
  }, [entryToLaneMap, entryIndex]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const entryId = String(event.active.id);
    const entry = entryIndex.get(entryId);
    
    setActiveLaneId(null);
    setDragOverLaneId(null);
    setActiveEntry(null);
    
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
    
    // Check if dropped on a different lane
    const targetLaneId = event.over?.id ? String(event.over.id) : undefined;
    const currentLaneId = entryToLaneMap.get(entryId);
    const isLaneDrop = targetLaneId && lanes.some((lane) => lane.id === targetLaneId);
    const newLaneId = isLaneDrop && targetLaneId !== currentLaneId ? targetLaneId : undefined;
    
    // Only fire callback if something changed
    if (nextStart !== entry.startMinutes || newLaneId) {
      onEntryMove?.(entryId, nextStart, newLaneId);
    }
  }, [entryIndex, trackWidth, totalMinutes, snapMinutes, startMinutes, endMinutes, entryToLaneMap, lanes, onEntryMove]);

  const totalConflicts = allConflicts.size;

  return (
    <div className="rounded-2xl border bg-card/70 p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-2">
        <div>
          <p className="text-sm font-semibold">Timeline</p>
          <p className="text-xs text-muted-foreground">
            {formatTimeLabel(startMinutes)} — {formatTimeLabel(endMinutes)} · Snap: {snapMinutes}m
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 text-xs text-muted-foreground flex-wrap">
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
        <div className="flex items-center gap-2 border-b bg-muted/40 px-2 sm:px-4 py-2">
          <div className="w-[120px] sm:w-[200px] text-xs font-semibold uppercase tracking-wide text-muted-foreground shrink-0">Worker</div>
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

        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          collisionDetection={rectIntersection}
        >
          <div 
            ref={scrollContainerRef}
            className={`divide-y divide-border/40 ${lanes.length > VIRTUAL_SCROLL_THRESHOLD ? "max-h-[500px] overflow-y-auto" : ""}`}
          >
            {/* Drag overlay for smoother visual feedback */}
            <DragOverlay dropAnimation={null}>
              {activeEntry && (
                <div className="h-12 rounded-lg px-2 text-left text-[11px] font-semibold text-white shadow-xl bg-primary border-l-4 border-primary-foreground opacity-90 scale-105">
                  <div className="flex items-center gap-1 pt-1">
                    {activeEntry.isTimeCritical && <AlertTriangle className="h-3 w-3" />}
                    <span className="truncate">{activeEntry.title}</span>
                  </div>
                  <div className="text-[10px] font-normal opacity-90">
                    {formatTimeLabel(activeEntry.startMinutes)} · {activeEntry.durationMinutes}m
                  </div>
                </div>
              )}
            </DragOverlay>
            {lanes.length === 0 ? (
              <div className="px-4 py-8 text-sm text-muted-foreground text-center">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                No scheduled entries available.
              </div>
            ) : lanes.length > VIRTUAL_SCROLL_THRESHOLD ? (
              // Virtual scrolling for large datasets
              <div className="relative" style={{ height: `${totalHeight}px` }}>
                {visibleLanes.map((lane, idx) => {
                  const actualIdx = startIndex + idx;
                  const laneTotalMinutes = lane.entries.reduce((acc, entry) => acc + entry.durationMinutes, 0);
                  const utilization = Math.min(100, Math.round((laneTotalMinutes / (8 * 60)) * 100));
                  const gaps = laneGaps.get(lane.id) || [];
                  const isDropTarget = dragOverLaneId === lane.id && activeLaneId !== lane.id;
                  const isSourceLane = activeLaneId === lane.id;
                  
                  return (
                    <div
                      key={lane.id}
                      className="absolute left-0 right-0"
                      style={{ top: `${actualIdx * ROW_HEIGHT}px`, height: `${ROW_HEIGHT}px` }}
                    >
                      <DroppableLane
                        laneId={lane.id}
                        isDropTarget={isDropTarget}
                        isSourceLane={isSourceLane}
                        className={`flex items-stretch gap-2 px-2 sm:px-4 py-2 sm:py-3 h-full transition-colors ${actualIdx % 2 === 0 ? "bg-background/40" : "bg-muted/20"}`}
                      >
                        <div className="w-[120px] sm:w-[200px] flex items-start gap-2 shrink-0">
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
                        <div ref={actualIdx === 0 ? trackRef : undefined} className="relative flex-1">
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
                          {gaps.map((gap) => (
                            <div
                              key={`gap-${gap.afterEntryId}`}
                              className="absolute top-1 h-12 sm:h-14 hidden sm:flex items-center justify-center"
                              style={{ left: `${gap.leftPercent}%`, width: `${gap.widthPercent}%` }}
                            >
                              <div className="h-6 w-full rounded border border-dashed border-amber-400/50 bg-amber-50/30 flex items-center justify-center">
                                <span className="text-[9px] text-amber-600 font-medium">{gap.gapMinutes}m</span>
                              </div>
                            </div>
                          ))}
                          {lane.entries.map((entry) => (
                            <MemoizedDraggableEntry
                              key={entry.id}
                              entry={entry}
                              startMinutes={startMinutes}
                              endMinutes={endMinutes}
                              totalMinutes={totalMinutes}
                              onSelect={onSelectEntry}
                              isSelected={selectedEntryId === entry.id || selectedEntryIds?.has(entry.id)}
                              isFocused={focusedEntryId === entry.id}
                              hasConflict={allConflicts.has(entry.id)}
                              enableDrag={enableDrag}
                              recommendedStatus={recommendedTimeStatus.get(entry.id)}
                            />
                          ))}
                        </div>
                      </DroppableLane>
                    </div>
                  );
                })}
              </div>
            ) : (
              // Normal rendering for small datasets
              lanes.map((lane, idx) => {
                const laneTotalMinutes = lane.entries.reduce((acc, entry) => acc + entry.durationMinutes, 0);
                const utilization = Math.min(100, Math.round((laneTotalMinutes / (8 * 60)) * 100));
                const gaps = laneGaps.get(lane.id) || [];
                const isDropTarget = dragOverLaneId === lane.id && activeLaneId !== lane.id;
                const isSourceLane = activeLaneId === lane.id;
                
                return (
                  <DroppableLane
                    key={lane.id}
                    laneId={lane.id}
                    isDropTarget={isDropTarget}
                    isSourceLane={isSourceLane}
                    className={`flex items-stretch gap-2 px-2 sm:px-4 py-2 sm:py-3 transition-colors ${idx % 2 === 0 ? "bg-background/40" : "bg-muted/20"}`}
                  >
                    <div className="w-[120px] sm:w-[200px] flex items-start gap-2 shrink-0">
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
                      {/* Travel gap indicators - hidden on mobile */}
                      {gaps.map((gap) => (
                        <div
                          key={`gap-${gap.afterEntryId}`}
                          className="absolute top-1 h-12 sm:h-14 hidden sm:flex items-center justify-center"
                          style={{ left: `${gap.leftPercent}%`, width: `${gap.widthPercent}%` }}
                        >
                          <div className="h-6 w-full rounded border border-dashed border-amber-400/50 bg-amber-50/30 flex items-center justify-center">
                            <span className="text-[9px] text-amber-600 font-medium">{gap.gapMinutes}m</span>
                          </div>
                        </div>
                      ))}
                      {/* Entry blocks */}
                      {lane.entries.map((entry) => (
                        <MemoizedDraggableEntry
                          key={entry.id}
                          entry={entry}
                          startMinutes={startMinutes}
                          endMinutes={endMinutes}
                          totalMinutes={totalMinutes}
                          onSelect={onSelectEntry}
                          isSelected={selectedEntryId === entry.id || selectedEntryIds?.has(entry.id)}
                          isFocused={focusedEntryId === entry.id}
                          hasConflict={allConflicts.has(entry.id)}
                          enableDrag={enableDrag}
                          recommendedStatus={recommendedTimeStatus.get(entry.id)}
                        />
                      ))}
                    </div>
                  </DroppableLane>
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
  onSelect?: (entry: TimelineEntry, event?: React.MouseEvent) => void;
  isSelected?: boolean;
  isFocused?: boolean;
  hasConflict?: boolean;
  enableDrag?: boolean;
  recommendedStatus?: { hasRecommendation: boolean; isWithinWindow: boolean; deviationMinutes: number };
}

const DraggableEntry: React.FC<DraggableEntryProps> = ({
  entry,
  startMinutes,
  endMinutes,
  totalMinutes,
  onSelect,
  isSelected = false,
  isFocused = false,
  hasConflict = false,
  enableDrag = true,
  recommendedStatus,
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

  const handleClick = useCallback((e: React.MouseEvent) => {
    onSelect?.(entry, e);
  }, [entry, onSelect]);

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={handleClick}
      className={`absolute top-1 h-14 sm:h-12 rounded-lg px-1.5 sm:px-2 text-left text-[10px] sm:text-[11px] font-semibold text-white shadow-md transition-all touch-manipulation
        focus:outline-none focus:ring-2 focus:ring-primary/60 
        ${colors.bg} border-l-4 ${colors.border}
        ${isDragging ? "opacity-50 scale-105 shadow-lg z-20" : ""}
        ${isSelected ? "ring-2 ring-white shadow-lg z-10" : ""}
        ${isFocused ? "ring-2 ring-primary ring-offset-1 z-10" : ""}
        ${hasConflict ? "animate-pulse ring-2 ring-red-400" : ""}
        hover:brightness-110 active:scale-[0.98]`}
      style={style}
      {...attributes}
      {...listeners}
    >
      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute -top-1.5 -left-1.5 h-4 w-4 rounded-full bg-white shadow-sm flex items-center justify-center">
          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
        </div>
      )}
      <div className="flex items-center gap-1">
        {entry.isTimeCritical && <AlertTriangle className="h-3 w-3 shrink-0" />}
        <span className="truncate">{entry.title}</span>
      </div>
      <div className="text-[9px] sm:text-[10px] font-normal opacity-90 flex items-center gap-1">
        <Clock className="h-2.5 w-2.5" />
        {formatTimeLabel(entry.startMinutes)} · {entry.durationMinutes}m
      </div>
      {hasConflict && (
        <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500 border border-white" />
      )}
      {/* Recommended time indicator */}
      {recommendedStatus?.hasRecommendation && (
        <div 
          className={`absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border border-white flex items-center justify-center ${
            recommendedStatus.isWithinWindow ? "bg-emerald-500" : "bg-amber-500"
          }`}
          title={recommendedStatus.isWithinWindow ? "Within recommended time" : `${recommendedStatus.deviationMinutes}m from recommended`}
        >
          <Target className="h-2 w-2 text-white" />
        </div>
      )}
    </button>
  );
};

// Memoized version with custom comparison to prevent unnecessary re-renders
const MemoizedDraggableEntry = memo(DraggableEntry, (prev, next) => {
  return (
    prev.entry.id === next.entry.id &&
    prev.entry.startMinutes === next.entry.startMinutes &&
    prev.entry.durationMinutes === next.entry.durationMinutes &&
    prev.entry.title === next.entry.title &&
    prev.entry.isTimeCritical === next.entry.isTimeCritical &&
    prev.entry.callTypeLabel === next.entry.callTypeLabel &&
    prev.startMinutes === next.startMinutes &&
    prev.endMinutes === next.endMinutes &&
    prev.totalMinutes === next.totalMinutes &&
    prev.isSelected === next.isSelected &&
    prev.isFocused === next.isFocused &&
    prev.hasConflict === next.hasConflict &&
    prev.enableDrag === next.enableDrag &&
    prev.recommendedStatus?.hasRecommendation === next.recommendedStatus?.hasRecommendation &&
    prev.recommendedStatus?.isWithinWindow === next.recommendedStatus?.isWithinWindow &&
    prev.recommendedStatus?.deviationMinutes === next.recommendedStatus?.deviationMinutes
  );
});
