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
  type DragMoveEvent,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  /** Row height in pixels for each timeline lane */
  rowHeight?: number;
  /** Horizontal zoom factor (percentage 50-200). Higher = tighter time spacing */
  horizontalZoom?: number;
  /** When true, timeline fills available height and scrolls internally */
  fitHeight?: boolean;
  /** Hide the timeline header/legend row */
  showHeader?: boolean;
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
    return { bg: "bg-blue-600", border: "border-blue-700" };
  }
  if (label.includes("lunch")) {
    return { bg: "bg-amber-600", border: "border-amber-700" };
  }
  if (label.includes("tea")) {
    return { bg: "bg-emerald-600", border: "border-emerald-700" };
  }
  if (label.includes("evening") || label.includes("pm")) {
    return { bg: "bg-indigo-600", border: "border-indigo-700" };
  }
  if (label.includes("night")) {
    return { bg: "bg-slate-700", border: "border-slate-800" };
  }
  return { bg: "bg-slate-600", border: "border-slate-700" };
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
  style?: React.CSSProperties;
  children: React.ReactNode;
}

const DroppableLane: React.FC<DroppableLaneProps> = ({
  laneId,
  isDropTarget,
  isSourceLane,
  className = "",
  style,
  children,
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: laneId });

  return (
    <div
      ref={setNodeRef}
      style={style}
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
  rowHeight: rowHeightProp,
  horizontalZoom = 100,
  fitHeight = false,
  showHeader = true,
}) => {
  const rowHeight = clamp(rowHeightProp ?? 72, 52, 120);
  const entryHeight = Math.max(26, Math.round(rowHeight * 0.68));
  const rowPadding = Math.max(2, Math.round((rowHeight - entryHeight) / 2));
  const entryTop = rowPadding;
  const gapHeight = Math.max(8, entryHeight - 6);
  const gapTop = entryTop + Math.max(0, Math.round((entryHeight - gapHeight) / 2));
  const totalMinutes = Math.max(endMinutes - startMinutes, 1);
  const hours = Math.ceil(totalMinutes / 60);
  
  // Horizontal zoom factor: 100 = 1x, 150 = 1.5x width, etc.
  const zoomFactor = clamp(horizontalZoom, 50, 200) / 100;
  const baseMinWidth = 800; // Minimum width at 100% zoom
  const trackMinWidth = Math.round(baseMinWidth * zoomFactor);
  
  // Hour ticks for header
  const hourTicks = Array.from({ length: hours + 1 }, (_, idx) => startMinutes + idx * 60);
  const minorTicks = showHalfHourTicks
    ? Array.from({ length: hours * 2 + 1 }, (_, idx) => startMinutes + idx * 30)
    : [];
  const trackRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const [activeLaneId, setActiveLaneId] = useState<string | null>(null);
  const [dragOverLaneId, setDragOverLaneId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<{ start: number; end: number } | null>(null);
  
  // Virtual scrolling state
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(400);
  const ROW_HEIGHT = rowHeight; // Height of each lane row in pixels
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
  }, [lanes, scrollTop, viewportHeight, ROW_HEIGHT]);

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

    const specificMap = new Map<string, RecommendedTimeWindow>();
    const genericMap = new Map<string, RecommendedTimeWindow>();
    recommendedTimes.forEach((rt) => {
      if (rt.callTypeLabel) {
        specificMap.set(`${rt.serviceUserKey}::${rt.callTypeLabel}`, rt);
      } else {
        genericMap.set(rt.serviceUserKey, rt);
      }
    });

    lanes.forEach((lane) => {
      lane.entries.forEach((entry) => {
        if (!entry.serviceUserKey) return;
        const key = `${entry.serviceUserKey}::${entry.callTypeLabel ?? ""}`;
        const recommendation = specificMap.get(key) || genericMap.get(entry.serviceUserKey);

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
    const entry = entryIndex.get(entryId) ?? null;
    setActiveLaneId(currentLaneId ?? null);
    setActiveEntry(entry);
    if (entry) {
      setDragPreview({
        start: entry.startMinutes,
        end: entry.startMinutes + entry.durationMinutes,
      });
    }
  }, [entryToLaneMap, entryIndex]);

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    if (!activeEntry || !trackWidth) return;
    const minutesPerPixel = totalMinutes / trackWidth;
    const deltaMinutes = Math.round(event.delta.x * minutesPerPixel);
    const rawStart = activeEntry.startMinutes + deltaMinutes;
    const snappedStart = Math.round(rawStart / snapMinutes) * snapMinutes;
    const nextStart = clamp(
      snappedStart,
      startMinutes,
      endMinutes - activeEntry.durationMinutes
    );
    setDragPreview({
      start: nextStart,
      end: nextStart + activeEntry.durationMinutes,
    });
  }, [activeEntry, endMinutes, snapMinutes, startMinutes, totalMinutes, trackWidth]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const entryId = String(event.active.id);
    const entry = entryIndex.get(entryId);
    
    setActiveLaneId(null);
    setDragOverLaneId(null);
    setActiveEntry(null);
    setDragPreview(null);
    
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

  const containerPadding = showHeader ? "p-3" : "p-2";

  return (
    <div
      className={`rounded-lg border bg-card ${containerPadding} shadow-sm ${fitHeight ? "flex h-full min-h-0 flex-col" : ""}`}
    >
      {showHeader && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-2">
          <div>
            <p className="text-sm font-semibold">Timeline</p>
            <p className="text-xs text-muted-foreground">
              {formatTimeLabel(startMinutes)} — {formatTimeLabel(endMinutes)} · Snap: {snapMinutes}m
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 text-xs text-muted-foreground flex-wrap">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-blue-600" /> AM
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-600" /> Lunch
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-600" /> Tea
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-indigo-600" /> Evening
            </span>
            {totalConflicts > 0 && (
              <span className="inline-flex items-center gap-1 text-red-500 font-medium">
                <AlertTriangle className="h-3 w-3" /> {totalConflicts / 2} conflicts
              </span>
            )}
          </div>
        </div>
      )}

      <div
        className={`rounded-lg border bg-background overflow-hidden ${fitHeight ? "flex min-h-0 flex-1 flex-col" : ""}`}
      >
        {/* Timeline Header - Professional time ruler */}
        <div className="flex items-stretch border-b bg-muted/30 flex-shrink-0">
          {/* Worker column header */}
          <div className="w-[100px] sm:w-[180px] px-2 sm:px-3 py-2 flex items-center border-r bg-muted/40 shrink-0">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-muted-foreground">Worker</span>
          </div>
          {/* Time ruler */}
          <div className="flex-1 overflow-x-auto">
            <div className="relative h-10" style={{ minWidth: `${trackMinWidth}px` }}>
              {/* Minor tick marks (half-hour) */}
              {minorTicks.map((tick) => {
                const left = ((tick - startMinutes) / totalMinutes) * 100;
                const isHour = tick % 60 === 0;
                if (isHour) return null;
                return (
                  <div
                    key={`minor-${tick}`}
                    className="absolute top-0 bottom-0"
                    style={{ left: `${left}%` }}
                  >
                    <div className="h-2.5 w-px bg-border/40 mt-auto" style={{ marginTop: 'auto', position: 'absolute', bottom: 0 }} />
                  </div>
                );
              })}
              {/* Hour tick marks with labels */}
              {hourTicks.map((tick, idx) => {
                const left = ((tick - startMinutes) / totalMinutes) * 100;
                const isLast = idx === hourTicks.length - 1;
                return (
                  <div
                    key={tick}
                    className="absolute top-0 bottom-0 flex flex-col"
                    style={{ left: `${left}%` }}
                  >
                    {/* Hour line */}
                    <div className="h-full w-px bg-border/60" />
                    {/* Time label - positioned to not overlap */}
                    {!isLast && (
                      <div 
                        className="absolute top-1 text-[10px] sm:text-[11px] font-medium text-muted-foreground whitespace-nowrap"
                        style={{ left: '4px' }}
                      >
                        {formatTimeLabel(tick)}
                      </div>
                    )}
                    {isLast && (
                      <div 
                        className="absolute top-1 text-[10px] sm:text-[11px] font-medium text-muted-foreground whitespace-nowrap"
                        style={{ right: '4px' }}
                      >
                        {formatTimeLabel(tick)}
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Current time indicator (if within range) */}
              {(() => {
                const now = new Date();
                const currentMinutes = now.getHours() * 60 + now.getMinutes();
                if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
                  const left = ((currentMinutes - startMinutes) / totalMinutes) * 100;
                  return (
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
                      style={{ left: `${left}%` }}
                    >
                      <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-red-500" />
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          </div>
        </div>

        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          collisionDetection={rectIntersection}
        >
          <div 
            ref={scrollContainerRef}
            className={`divide-y divide-border/40 ${
              fitHeight
                ? "flex-1 min-h-0 overflow-y-auto"
                : lanes.length > VIRTUAL_SCROLL_THRESHOLD
                  ? "max-h-[500px] overflow-y-auto"
                  : ""
            }`}
          >
            {/* Drag overlay for smoother visual feedback with time preview */}
            <DragOverlay dropAnimation={null}>
              {activeEntry && (
                <div
                  className="rounded-lg px-3 text-left text-[11px] font-semibold text-white shadow-lg bg-slate-700 border-l-4 border-slate-900 pointer-events-none"
                  style={{ height: entryHeight }}
                >
                  <div className="flex items-center gap-1.5 pt-1.5">
                    {activeEntry.isTimeCritical && <AlertTriangle className="h-3 w-3" />}
                    {activeEntry.isDoubleUp && (
                      <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-white/20 text-[10px] font-bold">2</span>
                    )}
                    <span className="truncate">{activeEntry.title}</span>
                  </div>
                  <div className="text-[11px] font-semibold opacity-100 mt-1 flex items-center gap-1.5 bg-white/10 rounded px-1.5 py-0.5">
                    <Clock className="h-3 w-3" />
                    {formatTimeLabel(dragPreview?.start ?? activeEntry.startMinutes)} - {formatTimeLabel(dragPreview?.end ?? (activeEntry.startMinutes + activeEntry.durationMinutes))}
                    <span className="text-[10px] opacity-80">({activeEntry.durationMinutes}m)</span>
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
                        style={{ paddingTop: rowPadding, paddingBottom: rowPadding }}
                        className={`flex items-stretch h-full transition-colors ${actualIdx % 2 === 0 ? "bg-background/40" : "bg-muted/20"}`}
                      >
                        {/* Worker info - fixed width */}
                        <div className="w-[100px] sm:w-[180px] px-2 sm:px-3 flex items-start gap-2 shrink-0 border-r">
                          <WorkerAvatar name={lane.label} size="sm" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate">{lane.label}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {lane.entries.length} calls · {Math.round(laneTotalMinutes)}m
                            </p>
                            <div className="mt-1 flex items-center gap-1">
                              <div className="flex-1 h-1 rounded-full bg-muted/50 max-w-[60px]">
                                <div
                                  className={`h-1 rounded-full transition-all ${
                                    utilization > 100 ? "bg-red-500" : utilization > 80 ? "bg-amber-500" : "bg-emerald-500"
                                  }`}
                                  style={{ width: `${Math.min(utilization, 100)}%` }}
                                />
                              </div>
                              <span className="text-[9px] text-muted-foreground">{utilization}%</span>
                            </div>
                          </div>
                        </div>
                        {/* Timeline track - scrollable with zoom */}
                        <div className="flex-1 overflow-x-auto">
                          <div 
                            ref={actualIdx === 0 ? trackRef : undefined} 
                            className="relative h-full"
                            style={{ minWidth: `${trackMinWidth}px` }}
                          >
                            {/* Background grid */}
                            <div className="rounded bg-muted/15 relative overflow-hidden" style={{ height: entryHeight }}>
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
                                className="absolute hidden sm:flex items-center justify-center"
                                style={{ left: `${gap.leftPercent}%`, width: `${gap.widthPercent}%`, top: `${gapTop}px`, height: `${gapHeight}px` }}
                                title={`${gap.gapMinutes} minute gap`}
                              >
                                <div className="h-full w-full rounded border border-dashed border-amber-400/40 bg-amber-50/10" />
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
                                entryHeight={entryHeight}
                                entryTop={entryTop}
                              />
                            ))}
                          </div>
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
                  style={{ paddingTop: rowPadding, paddingBottom: rowPadding }}
                  className={`flex items-stretch transition-colors ${idx % 2 === 0 ? "bg-background/40" : "bg-muted/20"}`}
                >
                    {/* Worker info - fixed width */}
                    <div className="w-[100px] sm:w-[180px] px-2 sm:px-3 flex items-start gap-2 shrink-0 border-r">
                      <WorkerAvatar name={lane.label} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{lane.label}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {lane.entries.length} calls · {Math.round(laneTotalMinutes)}m
                        </p>
                        <div className="mt-1 flex items-center gap-1">
                          <div className="flex-1 h-1 rounded-full bg-muted/50 max-w-[60px]">
                            <div
                              className={`h-1 rounded-full transition-all ${
                                utilization > 100 ? "bg-red-500" : utilization > 80 ? "bg-amber-500" : "bg-emerald-500"
                              }`}
                              style={{ width: `${Math.min(utilization, 100)}%` }}
                            />
                          </div>
                          <span className="text-[9px] text-muted-foreground">{utilization}%</span>
                        </div>
                      </div>
                    </div>
                    {/* Timeline track - scrollable with zoom */}
                    <div className="flex-1 overflow-x-auto">
                      <div 
                        ref={idx === 0 ? trackRef : undefined} 
                        className="relative h-full"
                        style={{ minWidth: `${trackMinWidth}px` }}
                      >
                        {/* Background grid */}
                        <div className="rounded bg-muted/15 relative overflow-hidden" style={{ height: entryHeight }}>
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
                            className="absolute hidden sm:flex items-center justify-center"
                            style={{ left: `${gap.leftPercent}%`, width: `${gap.widthPercent}%`, top: `${gapTop}px`, height: `${gapHeight}px` }}
                            title={`${gap.gapMinutes} minute gap`}
                          >
                            <div className="h-full w-full rounded border border-dashed border-amber-400/40 bg-amber-50/10" />
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
                            entryHeight={entryHeight}
                            entryTop={entryTop}
                          />
                        ))}
                      </div>
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
  entryHeight: number;
  entryTop: number;
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
  entryHeight,
  entryTop,
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
    ? { bg: "bg-rose-600", border: "border-rose-700" }
    : getCallTypeColor(entry.callTypeLabel);

  const style = {
    left: `${left}%`,
    width: `${Math.max(width, 2)}%`,
    top: entryTop,
    height: entryHeight,
    transform: CSS.Translate.toString(transform),
  } as React.CSSProperties;

  const handleClick = useCallback((e: React.MouseEvent) => {
    onSelect?.(entry, e);
  }, [entry, onSelect]);

  // Build tooltip content
  const tooltipContent = (
    <div className="text-xs space-y-1 min-w-[140px]">
      <div className="font-semibold">{entry.title}</div>
      <div className="flex items-center gap-1.5">
        <Clock className="h-3 w-3" />
        {formatTimeLabel(entry.startMinutes)} - {formatTimeLabel(entry.startMinutes + entry.durationMinutes)}
      </div>
      <div className="text-muted-foreground">{entry.durationMinutes} minutes</div>
      {entry.callTypeLabel && <div className="text-muted-foreground">{entry.callTypeLabel}</div>}
      {entry.address && <div className="text-muted-foreground truncate max-w-[200px]">{entry.address}</div>}
      {entry.isTimeCritical && <div className="text-rose-500 font-medium">⚠ Time Critical</div>}
      {entry.isDoubleUp && <div className="text-blue-500 font-medium">👥 Double-Up Required</div>}
      {hasConflict && <div className="text-red-500 font-medium">⚠ Schedule Conflict</div>}
    </div>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            ref={setNodeRef}
            type="button"
            onClick={handleClick}
            className={`absolute rounded-lg px-1.5 sm:px-2 text-left text-[10px] sm:text-[11px] font-semibold text-white shadow-sm touch-manipulation
              focus:outline-none focus:ring-2 focus:ring-primary/60 
              ${colors.bg} border-l-4 ${colors.border}
              ${isDragging ? "opacity-60 shadow-md z-20" : ""}
              ${isSelected ? "ring-2 ring-white shadow-md z-10" : ""}
              ${isFocused ? "ring-2 ring-primary ring-offset-1 z-10" : ""}
              ${hasConflict ? "ring-2 ring-red-400" : ""}`}
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
            {/* Double-up badge */}
            {entry.isDoubleUp && (
              <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-blue-600 border border-white shadow-sm flex items-center justify-center">
                <span className="text-[9px] font-bold text-white">2</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              {entry.isTimeCritical && <AlertTriangle className="h-3 w-3 shrink-0" />}
              <span className="truncate">{entry.title}</span>
            </div>
            {hasConflict && !entry.isDoubleUp && (
              <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500 border border-white" />
            )}
            {/* Recommended time indicator */}
            {recommendedStatus?.hasRecommendation && !entry.isDoubleUp && (
              <div 
                className={`absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border border-white flex items-center justify-center ${
                  recommendedStatus.isWithinWindow ? "bg-emerald-500" : "bg-amber-500"
                }`}
              >
                <Target className="h-2 w-2 text-white" />
              </div>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="p-2">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
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
    prev.entry.isDoubleUp === next.entry.isDoubleUp &&
    prev.entry.callTypeLabel === next.entry.callTypeLabel &&
    prev.entry.address === next.entry.address &&
    prev.startMinutes === next.startMinutes &&
    prev.endMinutes === next.endMinutes &&
    prev.totalMinutes === next.totalMinutes &&
    prev.entryHeight === next.entryHeight &&
    prev.entryTop === next.entryTop &&
    prev.isSelected === next.isSelected &&
    prev.isFocused === next.isFocused &&
    prev.hasConflict === next.hasConflict &&
    prev.enableDrag === next.enableDrag &&
    prev.recommendedStatus?.hasRecommendation === next.recommendedStatus?.hasRecommendation &&
    prev.recommendedStatus?.isWithinWindow === next.recommendedStatus?.isWithinWindow &&
    prev.recommendedStatus?.deviationMinutes === next.recommendedStatus?.deviationMinutes
  );
});
