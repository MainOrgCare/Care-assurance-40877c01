import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

interface CallGroup {
  serviceUserKey?: string | null;
  serviceUserName: string | null;
  callTypeLabel: string;
  templatedWeekdayKeys: Set<string>;
  isTimeCritical: boolean;
}

interface CareWorkerRosterInput {
  key: string;
  workerName: string;
  callGroups: CallGroup[];
}

interface StaffingGapsPanelProps {
  careWorkerRosters: CareWorkerRosterInput[];
  selectedTemplateWeek: "week1" | "week2";
}

// ============================================================================
// Constants
// ============================================================================

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
type Weekday = (typeof WEEKDAYS)[number];

const SHORT_DAY: Record<Weekday, string> = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun",
};

const CALL_TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  am: { bg: "bg-blue-100 dark:bg-blue-950/50", border: "border-blue-300 dark:border-blue-700", text: "text-blue-800 dark:text-blue-300" },
  morning: { bg: "bg-blue-100 dark:bg-blue-950/50", border: "border-blue-300 dark:border-blue-700", text: "text-blue-800 dark:text-blue-300" },
  lunch: { bg: "bg-amber-100 dark:bg-amber-950/40", border: "border-amber-300 dark:border-amber-700", text: "text-amber-800 dark:text-amber-300" },
  tea: { bg: "bg-orange-100 dark:bg-orange-950/40", border: "border-orange-300 dark:border-orange-700", text: "text-orange-800 dark:text-orange-300" },
  afternoon: { bg: "bg-orange-100 dark:bg-orange-950/40", border: "border-orange-300 dark:border-orange-700", text: "text-orange-800 dark:text-orange-300" },
  pm: { bg: "bg-orange-100 dark:bg-orange-950/40", border: "border-orange-300 dark:border-orange-700", text: "text-orange-800 dark:text-orange-300" },
  bed: { bg: "bg-purple-100 dark:bg-purple-950/40", border: "border-purple-300 dark:border-purple-700", text: "text-purple-800 dark:text-purple-300" },
  evening: { bg: "bg-purple-100 dark:bg-purple-950/40", border: "border-purple-300 dark:border-purple-700", text: "text-purple-800 dark:text-purple-300" },
  night: { bg: "bg-slate-100 dark:bg-slate-900/40", border: "border-slate-300 dark:border-slate-700", text: "text-slate-700 dark:text-slate-400" },
};

function getCallTypeColorKey(label: string): keyof typeof CALL_TYPE_COLORS | null {
  const normalized = label.toLowerCase().trim();
  for (const key of Object.keys(CALL_TYPE_COLORS)) {
    if (normalized.includes(key)) return key;
  }
  return null;
}

function getCallTypeColors(label: string) {
  const key = getCallTypeColorKey(label);
  return key ? CALL_TYPE_COLORS[key] : { bg: "bg-muted", border: "border-border", text: "text-muted-foreground" };
}

// ============================================================================
// Data Types
// ============================================================================

interface ServiceUserCoverage {
  key: string;
  name: string;
  days: Partial<Record<Weekday, CoverageCell>>;
  coveredDays: number;
  totalExpectedDays: number; // Days with at least one templated call
  gapDays: Weekday[];
  callTypes: Set<string>;
  workers: Set<string>;
  hasTimeCritical: boolean;
}

interface CoverageCell {
  callTypes: string[];
  workers: string[];
  isDoubleUp: boolean;
}

// ============================================================================
// Main Component
// ============================================================================

export default function StaffingGapsPanel({ careWorkerRosters, selectedTemplateWeek }: StaffingGapsPanelProps) {
  const [filterCallType, setFilterCallType] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "gaps" | "coverage">("gaps");
  const [showOnlyGaps, setShowOnlyGaps] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Build coverage matrix
  const coverageMatrix = useMemo((): ServiceUserCoverage[] => {
    // Map: serviceUserKey → { name, days: { Monday: { callTypes, workers } } }
    const suMap = new Map<string, {
      name: string;
      days: Partial<Record<Weekday, { callTypes: Set<string>; workers: Set<string>; count: number }>>;
      callTypes: Set<string>;
      workers: Set<string>;
      hasTimeCritical: boolean;
    }>();

    for (const roster of careWorkerRosters) {
      for (const cg of roster.callGroups) {
        const suKey = cg.serviceUserKey?.trim() || cg.serviceUserName?.trim();
        if (!suKey) continue;

        if (!suMap.has(suKey)) {
          suMap.set(suKey, {
            name: cg.serviceUserName || suKey,
            days: {},
            callTypes: new Set(),
            workers: new Set(),
            hasTimeCritical: false,
          });
        }

        const su = suMap.get(suKey)!;
        if (cg.isTimeCritical) su.hasTimeCritical = true;
        su.callTypes.add(cg.callTypeLabel);

        // Find which days in the selected week this call group covers
        for (const day of WEEKDAYS) {
          const weekDayKey = `${selectedTemplateWeek}|${day}`;
          if (!cg.templatedWeekdayKeys.has(weekDayKey)) continue;

          su.workers.add(roster.workerName);

          if (!su.days[day]) {
            su.days[day] = { callTypes: new Set(), workers: new Set(), count: 0 };
          }
          const cell = su.days[day]!;
          cell.callTypes.add(cg.callTypeLabel);
          cell.workers.add(roster.workerName);
          cell.count += 1;
        }
      }
    }

    // Convert to array
    const result: ServiceUserCoverage[] = [];
    for (const [key, data] of suMap) {
      // Days that have any templated call (at all weeks) to determine "expected" days
      // For gap detection: compare Mon-Fri coverage vs weekend
      const coveredDays = WEEKDAYS.filter((d) => data.days[d] !== undefined).length;
      // Expected = if they have any calls, we look at their pattern
      // A user "expects" a day if they have it in some other week or if the call type suggests daily
      const totalExpectedDays = coveredDays; // We can only measure what's in the data

      const gapDays = WEEKDAYS.filter((d) => {
        // A gap is a weekday where they have NO coverage but they DO have coverage on surrounding days
        // More practically: just days with no coverage among Mon-Fri
        return !data.days[d] && d !== "Saturday" && d !== "Sunday";
      });

      const days: Partial<Record<Weekday, CoverageCell>> = {};
      for (const day of WEEKDAYS) {
        const cell = data.days[day];
        if (cell) {
          const callTypeArr = Array.from(cell.callTypes);
          days[day] = {
            callTypes: callTypeArr,
            workers: Array.from(cell.workers),
            isDoubleUp: cell.count > 1 || cell.workers.size > 1,
          };
        }
      }

      if (filterCallType !== "all") {
        // Filter: only include SU if they have a call group matching the selected type
        const hasType = Array.from(data.callTypes).some(
          (ct) => ct.toLowerCase().includes(filterCallType.toLowerCase())
        );
        if (!hasType) continue;
      }

      result.push({
        key,
        name: data.name,
        days,
        coveredDays,
        totalExpectedDays,
        gapDays,
        callTypes: data.callTypes,
        workers: data.workers,
        hasTimeCritical: data.hasTimeCritical,
      });
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === "gaps") return b.gapDays.length - a.gapDays.length;
      if (sortBy === "coverage") return a.coveredDays - b.coveredDays;
      return a.name.localeCompare(b.name);
    });

    if (showOnlyGaps) {
      return result.filter((su) => su.gapDays.length > 0);
    }

    return result;
  }, [careWorkerRosters, selectedTemplateWeek, filterCallType, sortBy, showOnlyGaps]);

  // Summary stats
  const stats = useMemo(() => {
    const total = coverageMatrix.length;
    const withGaps = coverageMatrix.filter((su) => su.gapDays.length > 0).length;
    const fullyCovered = coverageMatrix.filter((su) => su.gapDays.length === 0 && su.coveredDays > 0).length;
    const avgGapDays = total > 0
      ? Math.round((coverageMatrix.reduce((sum, su) => sum + su.gapDays.length, 0) / total) * 10) / 10
      : 0;
    const dayGapCounts = Object.fromEntries(
      WEEKDAYS.map((d) => [d, coverageMatrix.filter((su) => su.gapDays.includes(d)).length])
    );
    const worstDay = WEEKDAYS.reduce((worst, d) =>
      dayGapCounts[d] > dayGapCounts[worst] ? d : worst, "Monday" as Weekday);

    return { total, withGaps, fullyCovered, avgGapDays, dayGapCounts, worstDay };
  }, [coverageMatrix]);

  // Unique call types for filter
  const allCallTypes = useMemo(() => {
    const types = new Set<string>();
    for (const su of coverageMatrix) {
      for (const ct of su.callTypes) types.add(ct);
    }
    return Array.from(types).sort();
  }, [coverageMatrix]);

  if (careWorkerRosters.length === 0) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
        <CalendarDays className="h-4 w-4" />
        No roster data loaded
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col gap-3 overflow-hidden p-3">
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Staffing Coverage — {selectedTemplateWeek === "week1" ? "Week 1" : "Week 2"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant={showOnlyGaps ? "default" : "outline"}
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => setShowOnlyGaps(!showOnlyGaps)}
            >
              <AlertTriangle className="h-3 w-3" />
              Gaps only
            </Button>
            <Select value={filterCallType} onValueChange={setFilterCallType}>
              <SelectTrigger className="h-7 w-[110px] text-xs">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {allCallTypes.map((ct) => (
                  <SelectItem key={ct} value={ct}>{ct}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="h-7 w-[100px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gaps">Most gaps</SelectItem>
                <SelectItem value="name">Name A–Z</SelectItem>
                <SelectItem value="coverage">Least covered</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Summary strip */}
        <div className="flex flex-shrink-0 flex-wrap gap-2">
          <div className="flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-xs shadow-[var(--shadow-xs)]">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-semibold">{stats.total}</span>
            <span className="text-muted-foreground">service users</span>
          </div>
          <div className={cn(
            "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs shadow-[var(--shadow-xs)]",
            stats.withGaps > 0 ? "border-destructive/30 bg-destructive/5 text-destructive" : "bg-card"
          )}>
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="font-semibold">{stats.withGaps}</span>
            <span>with weekday gaps</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-md border bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-800 shadow-[var(--shadow-xs)] dark:bg-emerald-950/30 dark:text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="font-semibold">{stats.fullyCovered}</span>
            <span>fully covered Mon–Fri</span>
          </div>
          {stats.withGaps > 0 && (
            <div className="flex items-center gap-1.5 rounded-md border bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 shadow-[var(--shadow-xs)] dark:bg-amber-950/30 dark:text-amber-300">
              <CalendarDays className="h-3.5 w-3.5" />
              <span>Most gaps on:</span>
              <span className="font-semibold">{stats.worstDay}</span>
              <span className="text-muted-foreground">({stats.dayGapCounts[stats.worstDay]})</span>
            </div>
          )}
        </div>

        {/* Day-gap bar (how many SUs have a gap on each day) */}
        <div className="flex flex-shrink-0 gap-1">
          {WEEKDAYS.map((day) => {
            const gapCount = stats.dayGapCounts[day];
            const isWeekend = day === "Saturday" || day === "Sunday";
            const maxGaps = Math.max(...Object.values(stats.dayGapCounts), 1);
            const fillPct = Math.round((gapCount / maxGaps) * 100);
            return (
              <Tooltip key={day}>
                <TooltipTrigger asChild>
                  <div className={cn(
                    "flex flex-1 flex-col items-center gap-0.5 rounded-md px-1 py-1.5 text-[10px] transition-colors",
                    isWeekend ? "opacity-50" : "",
                    gapCount > 0 ? "cursor-pointer hover:bg-muted/50" : ""
                  )}>
                    <span className="font-medium text-muted-foreground">{SHORT_DAY[day]}</span>
                    <div className="w-full rounded-full bg-muted overflow-hidden h-1.5">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          gapCount === 0 ? "bg-emerald-400" :
                          fillPct > 66 ? "bg-red-400" :
                          fillPct > 33 ? "bg-amber-400" : "bg-yellow-300"
                        )}
                        style={{ width: `${gapCount === 0 ? 100 : fillPct}%` }}
                      />
                    </div>
                    <span className={cn(
                      "font-semibold",
                      gapCount === 0 ? "text-emerald-600 dark:text-emerald-400" :
                      fillPct > 66 ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"
                    )}>
                      {gapCount === 0 ? "✓" : gapCount}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">
                    {gapCount === 0
                      ? `${day}: Full weekday coverage`
                      : `${day}: ${gapCount} service user${gapCount !== 1 ? "s" : ""} without a visit`}
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Coverage matrix table */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="min-w-[520px]">
            {/* Header row */}
            <div className="mb-1 grid grid-cols-[180px_repeat(7,1fr)] gap-px text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <div className="px-2">Service User</div>
              {WEEKDAYS.map((day) => (
                <div key={day} className="text-center">
                  {SHORT_DAY[day]}
                </div>
              ))}
            </div>

            {/* Data rows */}
            <div className="flex flex-col gap-px">
              {coverageMatrix.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  {showOnlyGaps ? "No service users with coverage gaps" : "No service users found"}
                </div>
              ) : (
                coverageMatrix.map((su) => (
                  <div key={su.key} className="group">
                    <div
                      className={cn(
                        "grid cursor-pointer grid-cols-[180px_repeat(7,1fr)] gap-px rounded-sm hover:bg-muted/40 transition-colors",
                        su.gapDays.length > 0 ? "bg-destructive/3" : ""
                      )}
                      onClick={() => setExpandedRow(expandedRow === su.key ? null : su.key)}
                    >
                      {/* Service user name */}
                      <div className="flex min-w-0 items-center gap-1.5 px-2 py-1.5">
                        <span className="truncate text-xs font-medium">{su.name}</span>
                        {su.hasTimeCritical && (
                          <span className="flex-shrink-0 text-[9px] font-semibold text-amber-600 dark:text-amber-400">TC</span>
                        )}
                        {su.gapDays.length > 0 && (
                          <AlertTriangle className="h-3 w-3 flex-shrink-0 text-destructive" />
                        )}
                        {expandedRow === su.key ? (
                          <ChevronUp className="ml-auto h-3 w-3 flex-shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="ml-auto h-3 w-3 flex-shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
                        )}
                      </div>

                      {/* Day cells */}
                      {WEEKDAYS.map((day) => {
                        const cell = su.days[day];
                        const isWeekend = day === "Saturday" || day === "Sunday";
                        const isGap = !isWeekend && !cell && su.coveredDays > 0;

                        if (!cell) {
                          return (
                            <div
                              key={day}
                              className={cn(
                                "flex items-center justify-center py-1.5 text-[10px] rounded-sm",
                                isGap ? "bg-red-50 text-red-400 dark:bg-red-950/20 dark:text-red-600" : "text-muted-foreground/30",
                                isWeekend ? "opacity-40" : ""
                              )}
                            >
                              {isGap ? "–" : isWeekend ? "·" : ""}
                            </div>
                          );
                        }

                        const primaryType = cell.callTypes[0] ?? "";
                        const colors = getCallTypeColors(primaryType);

                        return (
                          <Tooltip key={day}>
                            <TooltipTrigger asChild>
                              <div
                                className={cn(
                                  "flex flex-col items-center justify-center gap-0.5 rounded-sm px-0.5 py-1 text-[9px] font-medium transition-colors",
                                  colors.bg,
                                  cell.isDoubleUp ? "ring-1 ring-primary/30" : ""
                                )}
                              >
                                <span className={cn("truncate max-w-full", colors.text)}>
                                  {primaryType.slice(0, 3).toUpperCase()}
                                </span>
                                {cell.callTypes.length > 1 && (
                                  <span className="text-[8px] text-muted-foreground">+{cell.callTypes.length - 1}</span>
                                )}
                                {cell.isDoubleUp && (
                                  <span className="text-[8px] text-primary">×2</span>
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-xs space-y-0.5">
                                <div className="font-semibold">{su.name} — {day}</div>
                                <div>Types: {cell.callTypes.join(", ")}</div>
                                <div>Workers: {cell.workers.join(", ")}</div>
                                {cell.isDoubleUp && <div className="text-primary">Double-up call</div>}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>

                    {/* Expanded detail row */}
                    {expandedRow === su.key && (
                      <div className="mb-1 ml-2 mt-0.5 rounded-sm border border-border/50 bg-muted/30 p-2 text-xs">
                        <div className="flex flex-wrap gap-3">
                          <div>
                            <span className="text-muted-foreground">Covered days: </span>
                            <span className="font-medium">{su.coveredDays}/7</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Weekday gaps: </span>
                            <span className={cn("font-medium", su.gapDays.length > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400")}>
                              {su.gapDays.length === 0 ? "None" : su.gapDays.join(", ")}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Call types: </span>
                            <span className="font-medium">{Array.from(su.callTypes).join(", ")}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Workers: </span>
                            <span className="font-medium">{Array.from(su.workers).join(", ")}</span>
                            {su.workers.size > 1 && (
                              <Badge variant="outline" className="ml-1.5 text-[9px] text-amber-600 border-amber-300">
                                {su.workers.size} workers
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}
