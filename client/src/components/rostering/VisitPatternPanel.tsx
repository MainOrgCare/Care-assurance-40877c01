import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ActivitySquare,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
  UserCheck,
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
  requirementStartMinutes: number | null;
  isTimeCritical: boolean;
}

interface CareWorkerRosterInput {
  key: string;
  workerName: string;
  callGroups: CallGroup[];
}

interface TimelineEntry {
  id: string;
  serviceUserKey?: string | null;
  serviceUserName?: string | null;
  title: string;
  startMinutes: number;
  durationMinutes: number;
  callTypeLabel?: string | null;
}

interface GanttLane {
  id: string;
  label: string;
  entries: TimelineEntry[];
}

interface VisitPatternPanelProps {
  careWorkerRosters: CareWorkerRosterInput[];
  timelineLanes: GanttLane[];
  selectedTemplateWeek: "week1" | "week2";
}

// ============================================================================
// Constants
// ============================================================================

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
type Weekday = (typeof WEEKDAYS)[number];
const SHORT_DAY: Record<Weekday, string> = {
  Monday: "M", Tuesday: "T", Wednesday: "W", Thursday: "T", Friday: "F", Saturday: "S", Sunday: "S",
};

function formatTime(minutes: number | null | undefined): string {
  if (minutes == null || isNaN(minutes)) return "--:--";
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60 > 0 ? `${minutes % 60}m` : ""}`.trim();
}

// ============================================================================
// Data computation
// ============================================================================

interface CallPattern {
  callTypeLabel: string;
  scheduledDays: Weekday[];
  startTimes: number[];
  avgStartMinutes: number | null;
  stdDevMinutes: number | null;
  consistencyScore: number; // 0–100
  workers: string[];
  workerCount: number;
  hasMultipleWorkers: boolean;
  isTimeCritical: boolean;
  avgDurationMinutes: number | null;
}

interface ServiceUserPattern {
  key: string;
  name: string;
  callPatterns: CallPattern[];
  totalCallsPerWeek: number;
  coveredDays: number;
  uniqueWorkers: string[];
  workerCount: number;
  continuityScore: number; // 0–100 (100 = one worker for all)
  consistencyScore: number; // 0–100 average across call types
  hasTimeCritical: boolean;
  hasTravelRisk: boolean; // multiple workers visiting = risk
}

function computeStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function consistencyFromStdDev(stdDev: number): number {
  // 0 stdDev = 100% consistent, 60 min stdDev = 0% consistent
  return Math.max(0, Math.round(100 - (stdDev / 60) * 100));
}

// ============================================================================
// Main Component
// ============================================================================

export default function VisitPatternPanel({
  careWorkerRosters,
  timelineLanes,
  selectedTemplateWeek,
}: VisitPatternPanelProps) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "continuity" | "consistency" | "workers">("continuity");
  const [showFlag, setShowFlag] = useState<"all" | "multi-worker" | "inconsistent" | "time-critical">("all");

  // Build per-service-user patterns from roster data + timeline
  const patterns = useMemo((): ServiceUserPattern[] => {
    // 1. Gather from careWorkerRosters (template data)
    type RawCallEntry = {
      callTypeLabel: string;
      day: Weekday;
      workerName: string;
      requirementStartMinutes: number | null;
      isTimeCritical: boolean;
    };

    const suMap = new Map<string, {
      name: string;
      entries: RawCallEntry[];
    }>();

    for (const roster of careWorkerRosters) {
      for (const cg of roster.callGroups) {
        const suKey = cg.serviceUserKey?.trim() || cg.serviceUserName?.trim();
        if (!suKey) continue;

        if (!suMap.has(suKey)) {
          suMap.set(suKey, { name: cg.serviceUserName || suKey, entries: [] });
        }

        for (const day of WEEKDAYS) {
          const weekDayKey = `${selectedTemplateWeek}|${day}`;
          if (!cg.templatedWeekdayKeys.has(weekDayKey)) continue;
          suMap.get(suKey)!.entries.push({
            callTypeLabel: cg.callTypeLabel,
            day,
            workerName: roster.workerName,
            requirementStartMinutes: cg.requirementStartMinutes,
            isTimeCritical: cg.isTimeCritical,
          });
        }
      }
    }

    // 2. Also gather from timeline (actual scheduled start times for consistency scoring)
    const timelineByKey = new Map<string, Array<{ workerName: string; startMinutes: number; callTypeLabel: string; durationMinutes: number }>>();
    for (const lane of timelineLanes) {
      for (const entry of lane.entries) {
        const key = entry.serviceUserKey?.trim() ||
          entry.serviceUserName?.trim()?.toLowerCase().replace(/\s+/g, "_") ||
          entry.title?.trim().toLowerCase().replace(/\s+/g, "_");
        if (!key) continue;
        if (!timelineByKey.has(key)) timelineByKey.set(key, []);
        timelineByKey.get(key)!.push({
          workerName: lane.label,
          startMinutes: entry.startMinutes,
          callTypeLabel: entry.callTypeLabel ?? "",
          durationMinutes: entry.durationMinutes,
        });
      }
    }

    // 3. Combine into patterns
    const result: ServiceUserPattern[] = [];

    for (const [key, data] of suMap) {
      if (data.entries.length === 0) continue;

      // Group by call type
      const byCallType = new Map<string, RawCallEntry[]>();
      for (const entry of data.entries) {
        if (!byCallType.has(entry.callTypeLabel)) byCallType.set(entry.callTypeLabel, []);
        byCallType.get(entry.callTypeLabel)!.push(entry);
      }

      const callPatterns: CallPattern[] = [];
      let totalTimeCritical = false;
      const allWorkers = new Set<string>();

      for (const [callType, entries] of byCallType) {
        const days = Array.from(new Set(entries.map((e) => e.day)));
        const workers = Array.from(new Set(entries.map((e) => e.workerName)));
        workers.forEach((w) => allWorkers.add(w));

        // Start times from template data
        const startTimes = entries
          .map((e) => e.requirementStartMinutes)
          .filter((t): t is number => t != null);

        // Also add from timeline if available
        const timelineEntries = timelineByKey.get(key)?.filter(
          (te) => te.callTypeLabel?.toLowerCase().includes(callType.toLowerCase().slice(0, 4))
        ) ?? [];
        const timelineStartTimes = timelineEntries.map((te) => te.startMinutes);
        const allStartTimes = [...startTimes, ...timelineStartTimes];

        const avgStart = allStartTimes.length > 0
          ? Math.round(allStartTimes.reduce((a, b) => a + b, 0) / allStartTimes.length)
          : null;
        const stdDev = allStartTimes.length >= 2 ? computeStdDev(allStartTimes) : 0;
        const consistency = consistencyFromStdDev(stdDev);

        // Average duration from timeline
        const avgDuration = timelineEntries.length > 0
          ? Math.round(timelineEntries.reduce((sum, te) => sum + te.durationMinutes, 0) / timelineEntries.length)
          : null;

        const isTimeCritical = entries.some((e) => e.isTimeCritical);
        if (isTimeCritical) totalTimeCritical = true;

        callPatterns.push({
          callTypeLabel: callType,
          scheduledDays: days,
          startTimes: allStartTimes,
          avgStartMinutes: avgStart,
          stdDevMinutes: Math.round(stdDev),
          consistencyScore: consistency,
          workers,
          workerCount: workers.length,
          hasMultipleWorkers: workers.length > 1,
          isTimeCritical,
          avgDurationMinutes: avgDuration,
        });
      }

      // Sort call patterns by call type for consistent display
      callPatterns.sort((a, b) => a.callTypeLabel.localeCompare(b.callTypeLabel));

      const coveredDays = new Set(data.entries.map((e) => e.day)).size;
      const totalCalls = data.entries.length;
      const workerCount = allWorkers.size;
      const continuityScore = workerCount === 1 ? 100 : workerCount === 0 ? 0 : Math.round(100 / workerCount);
      const avgConsistency = callPatterns.length > 0
        ? Math.round(callPatterns.reduce((sum, cp) => sum + cp.consistencyScore, 0) / callPatterns.length)
        : 0;

      result.push({
        key,
        name: data.name,
        callPatterns,
        totalCallsPerWeek: totalCalls,
        coveredDays,
        uniqueWorkers: Array.from(allWorkers),
        workerCount,
        continuityScore,
        consistencyScore: avgConsistency,
        hasTimeCritical: totalTimeCritical,
        hasTravelRisk: workerCount > 2,
      });
    }

    // Filter
    let filtered = result.filter((su) => {
      if (search && !su.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (showFlag === "multi-worker") return su.workerCount > 1;
      if (showFlag === "inconsistent") return su.consistencyScore < 70;
      if (showFlag === "time-critical") return su.hasTimeCritical;
      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "continuity") return a.continuityScore - b.continuityScore;
      if (sortBy === "consistency") return a.consistencyScore - b.consistencyScore;
      if (sortBy === "workers") return b.workerCount - a.workerCount;
      return 0;
    });

    return filtered;
  }, [careWorkerRosters, timelineLanes, selectedTemplateWeek, search, showFlag, sortBy]);

  // Summary stats
  const stats = useMemo(() => {
    const all = patterns;
    const multiWorker = all.filter((su) => su.workerCount > 1).length;
    const highContinuity = all.filter((su) => su.continuityScore >= 80).length;
    const inconsistent = all.filter((su) => su.consistencyScore < 70).length;
    const avgContinuity = all.length > 0
      ? Math.round(all.reduce((sum, su) => sum + su.continuityScore, 0) / all.length)
      : 0;
    return { total: all.length, multiWorker, highContinuity, inconsistent, avgContinuity };
  }, [patterns]);

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col gap-3 overflow-hidden p-3">
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ActivitySquare className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">
              Visit Patterns — {selectedTemplateWeek === "week1" ? "Week 1" : "Week 2"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="h-7 w-[120px] pl-6 text-xs"
              />
            </div>
            <Select value={showFlag} onValueChange={(v) => setShowFlag(v as typeof showFlag)}>
              <SelectTrigger className="h-7 w-[130px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="multi-worker">Multi-worker</SelectItem>
                <SelectItem value="inconsistent">Inconsistent times</SelectItem>
                <SelectItem value="time-critical">Time-critical</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="h-7 w-[120px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="continuity">Least continuity</SelectItem>
                <SelectItem value="consistency">Least consistent</SelectItem>
                <SelectItem value="workers">Most workers</SelectItem>
                <SelectItem value="name">Name A–Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Summary strip */}
        <div className="flex flex-shrink-0 flex-wrap gap-2 text-xs">
          <StatChip
            icon={<Users className="h-3.5 w-3.5 text-muted-foreground" />}
            label="service users"
            value={String(stats.total)}
          />
          <StatChip
            icon={<UserCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />}
            label="avg continuity"
            value={`${stats.avgContinuity}%`}
            tone={stats.avgContinuity >= 70 ? "good" : stats.avgContinuity >= 40 ? "warn" : "bad"}
          />
          <StatChip
            icon={<RefreshCw className="h-3.5 w-3.5 text-amber-500" />}
            label="multi-worker"
            value={String(stats.multiWorker)}
            tone={stats.multiWorker > 0 ? "warn" : "good"}
          />
          <StatChip
            icon={<AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
            label="inconsistent times"
            value={String(stats.inconsistent)}
            tone={stats.inconsistent > 0 ? "bad" : "good"}
          />
        </div>

        {/* List */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="flex flex-col gap-2 pr-1">
            {patterns.length === 0 ? (
              <div className="py-10 text-center text-xs text-muted-foreground">
                {search ? "No service users match the search" : "No visit pattern data available"}
              </div>
            ) : (
              patterns.map((su) => (
                <ServiceUserCard key={su.key} su={su} />
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function StatChip({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "good" | "warn" | "bad";
}) {
  return (
    <div className={cn(
      "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 shadow-[var(--shadow-xs)]",
      tone === "good" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300" :
      tone === "warn" ? "bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300" :
      tone === "bad" ? "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-400" :
      "bg-card text-foreground"
    )}>
      {icon}
      <span className="font-semibold">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

function ServiceUserCard({ su }: { su: ServiceUserPattern }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      aria-label={`Toggle visit pattern details for ${su.name}`}
      className={cn(
        "rounded-lg border bg-card p-3 shadow-[var(--shadow-xs)] transition-shadow hover:shadow-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        su.continuityScore < 50 ? "border-amber-300/50 dark:border-amber-800/30" : ""
      )}
      onClick={() => setExpanded(!expanded)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setExpanded(!expanded);
        }
      }}
    >
      {/* Top row */}
      <div className="flex items-start gap-3">
        {/* Name + badges */}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{su.name}</span>
            {su.hasTimeCritical && (
              <Badge variant="outline" className="h-4 px-1 text-[9px] text-amber-600 border-amber-300">TC</Badge>
            )}
            {su.workerCount > 1 && (
              <Badge variant="outline" className="h-4 px-1 text-[9px] text-orange-600 border-orange-300">
                {su.workerCount} workers
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span>{su.totalCallsPerWeek} calls/wk</span>
            <span>{su.coveredDays}/7 days</span>
            <span>{su.callPatterns.length} call type{su.callPatterns.length !== 1 ? "s" : ""}</span>
          </div>
        </div>

        {/* Scores */}
        <div className="flex flex-shrink-0 items-center gap-3">
          <ScoreIndicator label="Continuity" score={su.continuityScore} />
          <ScoreIndicator label="Consistency" score={su.consistencyScore} />
        </div>
      </div>

      {/* Day strip */}
      <div className="mt-2 flex gap-1">
        {WEEKDAYS.map((day) => {
          const covered = su.callPatterns.some((cp) => cp.scheduledDays.includes(day));
          const isWeekend = day === "Saturday" || day === "Sunday";
          return (
            <Tooltip key={day}>
              <TooltipTrigger asChild>
                <div className={cn(
                  "flex h-5 flex-1 items-center justify-center rounded-sm text-[9px] font-bold",
                  covered
                    ? "bg-primary/15 text-primary dark:bg-primary/20"
                    : isWeekend
                      ? "bg-muted/30 text-muted-foreground/30"
                      : "bg-red-50 text-red-300 dark:bg-red-950/10 dark:text-red-800"
                )}>
                  {SHORT_DAY[day]}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">
                  {covered ? `${day}: has scheduled visits` : isWeekend ? `${day}: weekend (no expectation)` : `${day}: no coverage`}
                </p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-3 space-y-2 border-t pt-2">
          {su.callPatterns.map((cp) => (
            <CallPatternRow key={cp.callTypeLabel} cp={cp} />
          ))}
          <div className="text-[11px] text-muted-foreground">
            <span className="font-medium">Workers: </span>
            {su.uniqueWorkers.join(", ")}
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreIndicator({ label, score }: { label: string; score: number }) {
  const color =
    score >= 80 ? "text-emerald-600 dark:text-emerald-400" :
    score >= 60 ? "text-amber-600 dark:text-amber-400" :
    "text-red-500 dark:text-red-400";
  const bg =
    score >= 80 ? "bg-emerald-100 dark:bg-emerald-950/40" :
    score >= 60 ? "bg-amber-100 dark:bg-amber-950/30" :
    "bg-red-50 dark:bg-red-950/20";

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className={cn("rounded px-1.5 py-0.5 text-xs font-bold tabular-nums", bg, color)}>
        {score}%
      </div>
      <span className="text-[9px] text-muted-foreground">{label}</span>
    </div>
  );
}

function CallPatternRow({ cp }: { cp: CallPattern }) {
  return (
    <div className="flex items-center gap-3 rounded-sm bg-muted/30 px-2 py-1.5 text-xs">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="font-medium">{cp.callTypeLabel}</span>
          {cp.isTimeCritical && (
            <Badge variant="outline" className="h-3.5 px-1 text-[8px] text-amber-600 border-amber-300">TC</Badge>
          )}
          {cp.hasMultipleWorkers && (
            <Badge variant="outline" className="h-3.5 px-1 text-[8px] text-orange-600 border-orange-300">
              {cp.workerCount} workers
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-0.5">
            <Clock className="h-3 w-3" />
            {cp.avgStartMinutes != null ? formatTime(cp.avgStartMinutes) : "–"}
            {cp.stdDevMinutes != null && cp.stdDevMinutes > 0 && (
              <span className="ml-0.5 text-amber-500">±{cp.stdDevMinutes}m</span>
            )}
          </span>
          {cp.avgDurationMinutes != null && (
            <span>{formatMinutes(cp.avgDurationMinutes)}</span>
          )}
          <span>{cp.scheduledDays.length} day{cp.scheduledDays.length !== 1 ? "s" : ""}/wk</span>
        </div>
      </div>
      <div className="flex flex-shrink-0 flex-col items-end gap-0.5">
        <div className="w-16">
          <Progress
            value={cp.consistencyScore}
            className={cn(
              "h-1.5",
              cp.consistencyScore >= 80 ? "[&>*]:bg-emerald-500" :
              cp.consistencyScore >= 60 ? "[&>*]:bg-amber-500" :
              "[&>*]:bg-red-500"
            )}
          />
        </div>
        <span className="text-[9px] text-muted-foreground">{cp.consistencyScore}% consistent</span>
      </div>
    </div>
  );
}
