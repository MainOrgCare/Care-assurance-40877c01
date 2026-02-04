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
  /** When true, timeline never scrolls horizontally; it scales to the container */
  lockToContainer?: boolean;
}

const formatTimeLabel = (minutes: number) => {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const normalizeLabelForMatch = (value: string | null | undefined) => {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
};

// Call type to color mapping (light + dark theme friendly)
const getCallTypeColor = (callTypeLabel: string | null | undefined): { bg: string; border: string } => {
  const label = normalizeLabelForMatch(callTypeLabel);
  // NOTE: Treat "pm" as the Tea/Afternoon band (common dataset convention).
  if (/(^| )am( |$)/.test(label) || label.includes("morning")) {
    return { bg: "bg-sky-100/80 dark:bg-sky-950/35", border: "border-sky-300/80 dark:border-sky-700/60" };
  }
  if (label.includes("lunch") || label.includes("midday") || label.includes("noon")) {
    return { bg: "bg-amber-100/80 dark:bg-amber-950/30", border: "border-amber-300/80 dark:border-amber-700/60" };
  }
  if (label.includes("tea") || label.includes("afternoon") || /(^| )pm( |$)/.test(label)) {
    return { bg: "bg-emerald-100/80 dark:bg-emerald-950/30", border: "border-emerald-300/80 dark:border-emerald-700/60" };
  }
  if (label.includes("bed") || label.includes("evening") || label.includes("night") || label.includes("eve")) {
    return { bg: "bg-indigo-100/80 dark:bg-indigo-950/30", border: "border-indigo-300/80 dark:border-indigo-700/60" };
  }
  return { bg: "bg-slate-100/70 dark:bg-slate-900/40", border: "border-slate-300/70 dark:border-slate-700/60" };
};

const getTimeBandBackgrounds = (
  startMinutes: number,
  endMinutes: number
): Array<{ leftPercent: number; widthPercent: number; className: string; key: string }> => {
  const totalMinutes = Math.max(endMinutes - startMinutes, 1);
  const bands = [
    { key: "am", start: 6 * 60, end: 12 * 60, className: "bg-sky-500/5 dark:bg-sky-400/10" },
    { key: "lunch", start: 12 * 60, end: 14 * 60, className: "bg-amber-500/5 dark:bg-amber-400/10" },
    { key: "tea", start: 14 * 60, end: 17 * 60, className: "bg-emerald-500/5 dark:bg-emerald-400/10" },
    { key: "bed", start: 17 * 60, end: 22 * 60, className: "bg-indigo-500/5 dark:bg-indigo-400/10" },
  ];

  return bands
    .map((band) => {
      const bandStart = Math.max(startMinutes, band.start);
      const bandEnd = Math.min(endMinutes, band.end);
      if (bandEnd <= bandStart) return null;
      const leftPercent = ((bandStart - startMinutes) / totalMinutes) * 100;
      const widthPercent = ((bandEnd - bandStart) / totalMinutes) * 100;
      return { leftPercent, widthPercent, className: band.className, key: band.key };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);
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
  lockToContainer = false,
}) => {
  const rowHeight = clamp(rowHeightProp ?? 60, 52, 120);
  const entryHeight = Math.max(26, Math.round(rowHeight * 0.68));
  const rowPadding = Math.max(2, Math.round((rowHeight - entryHeight) / 2));
  const entryTop = rowPadding;
  const gapHeight = Math.max(8, entryHeight - 6);
  const gapTop = entryTop + Math.max(0, Math.round((entryHeight - gapHeight) / 2));
  const totalMinutes = Math.max(endMinutes - startMinutes, 1);
  const hours = Math.ceil(totalMinutes / 60);
  const timeBandBackgrounds = useMemo(
    () => getTimeBandBackgrounds(startMinutes, endMinutes),
    [startMinutes, endMinutes]
  );
  
  // Horizontal zoom factor: 100 = 1x, 150 = 1.5x width, etc.
  const zoomFactor = clamp(horizontalZoom, 50, 200) / 100;
  const baseMinWidth = 800; // Minimum width at 100% zoom
  const trackMinWidth = lockToContainer ? 0 : Math.round(baseMinWidth * zoomFactor);
  const trackWidthStyle = lockToContainer
    ? { width: "100%", minWidth: 0 }
    : { minWidth: `${trackMinWidth}px` };
  
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
      className={`rounded-lg border border-border/60 bg-background/70 ${containerPadding} shadow-md backdrop-blur-sm ${fitHeight ? "flex h-full min-h-0 flex-col" : ""}`}
    >
      {showHeader && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-2">
          <div>
            <p className="text-sm font-semibold tracking-tight">Timeline</p>
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
        className={`rounded-lg border border-border/60 bg-background/80 overflow-hidden relative ${fitHeight ? "flex min-h-0 flex-1 flex-col" : ""}`}
      >
        {/* Timeline Header - Professional time ruler */}
        <div className="flex items-stretch border-b bg-gradient-to-b from-muted/50 to-muted/20 flex-shrink-0 sticky top-0 z-30 backdrop-blur-sm shadow-sm">
          {/* Worker column header */}
          <div className="w-[100px] sm:w-[180px] px-2 sm:px-3 py-2 flex items-center border-r bg-muted/40 shrink-0">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-muted-foreground">Worker</span>
          </div>
          {/* Time ruler */}
          <div className={lockToContainer ? "flex-1 overflow-x-hidden" : "flex-1 overflow-x-auto"}>
            <div className="relative h-10" style={trackWidthStyle}>
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
                        className="absolute top-1 text-[9px] sm:text-[10px] font-semibold text-muted-foreground whitespace-nowrap"
                        style={{ left: '4px' }}
                      >
                        {formatTimeLabel(tick)}
                      </div>
                    )}
                    {isLast && (
                      <div 
                        className="absolute top-1 text-[9px] sm:text-[10px] font-semibold text-muted-foreground whitespace-nowrap"
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
                        <div className={lockToContainer ? "flex-1 overflow-x-hidden" : "flex-1 overflow-x-auto"}>
                          <div 
                            ref={actualIdx === 0 ? trackRef : undefined} 
                            className="relative h-full"
                            style={trackWidthStyle}
                          >
                            {/* Background grid */}
                            <div className="rounded bg-muted/15 relative overflow-hidden" style={{ height: entryHeight }}>
                              {/* Time-of-day bands (AM → Lunch → Tea → Bed) */}
                              {timeBandBackgrounds.map((band) => (
                                <div
                                  key={band.key}
                                  className={`absolute inset-y-0 ${band.className}`}
                                  style={{ left: `${band.leftPercent}%`, width: `${band.widthPercent}%` }}
                                />
                              ))}
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
                    <div className="flex-1 overflow-x-hidden">
                      <div 
                        ref={idx === 0 ? trackRef : undefined} 
                        className="relative h-full"
                        style={trackWidthStyle}
                      >
                        {/* Background grid */}
                        <div className="bg-muted/15 relative overflow-hidden" style={{ height: entryHeight }}>
                          {/* Time-of-day bands (AM → Lunch → Tea → Bed) */}
                          {timeBandBackgrounds.map((band) => (
                            <div
                              key={band.key}
                              className={`absolute inset-y-0 ${band.className}`}
                              style={{ left: `${band.leftPercent}%`, width: `${band.widthPercent}%` }}
                            />
                          ))}
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
  const buildInitials = (name: string) => {
    const clean = name.trim().split(/\s+/).filter(Boolean);
    if (clean.length === 0) return "";
    if (clean.length === 1) return clean[0].slice(0, 2).toUpperCase();
    return `${clean[0][0]}${clean[clean.length - 1][0]}`.toUpperCase();
  };

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: entry.id,
    disabled: !enableDrag,
  });
  const start = clamp(entry.startMinutes, startMinutes, endMinutes);
  const end = clamp(entry.startMinutes + entry.durationMinutes, startMinutes, endMinutes);
  const left = ((start - startMinutes) / totalMinutes) * 100;
  const width = ((end - start) / totalMinutes) * 100;

  const colors = entry.isTimeCritical 
    ? { bg: "bg-rose-100/80 dark:bg-rose-950/30", border: "border-rose-300/80 dark:border-rose-700/60" }
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

  const initialsSource = entry.serviceUserName || entry.title || "";
  const initials = buildInitials(initialsSource);

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            ref={setNodeRef}
            type="button"
            onClick={handleClick}
            className={`absolute rounded-md px-1.5 sm:px-2 text-left text-[10px] sm:text-[11px] font-semibold text-foreground shadow-sm touch-manipulation
              transition-shadow focus:outline-none focus:ring-1 focus:ring-primary/60 
              ${colors.bg} border ${colors.border}
              ${isDragging ? "opacity-60 shadow-md z-20" : "hover:shadow-md"}
              ${isSelected ? "ring-1 ring-primary shadow-md z-10" : ""}
              ${isFocused ? "ring-1 ring-primary z-10" : ""}
              ${hasConflict ? "ring-1 ring-red-400" : ""}`}
            style={style}
            {...attributes}
            {...listeners}
          >
            {/* Selection indicator */}
            {isSelected && (
              <div className="absolute -top-1.5 -left-1.5 h-4 w-4 rounded-full bg-background shadow-sm flex items-center justify-center border border-border/60">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
              </div>
            )}
            {/* Double-up badge */}
            {entry.isDoubleUp && (
              <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-blue-600 border border-background shadow-sm flex items-center justify-center">
                <span className="text-[9px] font-bold text-white">2</span>
              </div>
            )}
            <div className="flex h-full w-full items-center justify-center">
              <span className="text-[9px] sm:text-[10px] font-bold tracking-wide">
                {initials || "?"}
              </span>
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
