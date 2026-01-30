import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, ChevronRight, Clock, Users as UsersIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// ===== TYPES =====
type OptimizedRouteEntry = {
  key: string;
  serviceUserName: string | null;
  callTypeLabel: string | null;
  timeBandLabel: string | null;
  scheduledStartMinutes: number | null;
  scheduledEndMinutes: number | null;
  durationMinutes: number | null;
  isTimeCritical?: boolean;
  isDoubleUp?: boolean;
};

type CareWorkerRotaPayload = {
  workerName: string;
  workerKey: string;
  templateWeek: "week1" | "week2";
  templateDay: string;
  timeCriticalWindowEnforced?: boolean;
  optimizedRun: OptimizedRouteEntry[];
};

type CareWorkerRotaRecord = {
  id: string;
  workerName: string;
  workerKey: string;
  templateWeek: string;
  templateDay: string;
  payload: CareWorkerRotaPayload;
  createdByUsername?: string | null;
  createdAt: string;
};

interface WeeklyPlannerGridProps {
  rotas: CareWorkerRotaRecord[];
  selectedRotaId: string | null;
  onSelectRota: (id: string) => void;
  loading?: boolean;
}

// ===== CONSTANTS =====
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const SHORT_WEEKDAYS: Record<string, string> = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun",
};

const CALL_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  am: { bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-300" },
  morning: { bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-300" },
  lunch: { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-300" },
  tea: { bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-300" },
  evening: { bg: "bg-purple-100", text: "text-purple-800", border: "border-purple-300" },
  night: { bg: "bg-slate-200", text: "text-slate-800", border: "border-slate-400" },
  default: { bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-300" },
};

// ===== UTILITY FUNCTIONS =====
function formatMinutesShort(minutes: number | null | undefined): string {
  if (typeof minutes !== "number" || Number.isNaN(minutes)) return "";
  const normalized = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hrs = Math.floor(normalized / 60);
  const mins = Math.round(normalized % 60);
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

function getCallTypeColor(timeBand: string | null | undefined) {
  if (!timeBand) return CALL_TYPE_COLORS.default;
  const key = timeBand.toLowerCase();
  return CALL_TYPE_COLORS[key] ?? CALL_TYPE_COLORS.default;
}

function groupRotasByWorker(rotas: CareWorkerRotaRecord[]) {
  const workerMap = new Map<string, {
    workerName: string;
    workerKey: string;
    rotasByDay: Map<string, CareWorkerRotaRecord>;
  }>();

  rotas.forEach((rota) => {
    if (!workerMap.has(rota.workerKey)) {
      workerMap.set(rota.workerKey, {
        workerName: rota.workerName,
        workerKey: rota.workerKey,
        rotasByDay: new Map(),
      });
    }
    const worker = workerMap.get(rota.workerKey)!;
    // Use most recent rota for each day
    const existing = worker.rotasByDay.get(rota.templateDay);
    if (!existing || new Date(rota.createdAt) > new Date(existing.createdAt)) {
      worker.rotasByDay.set(rota.templateDay, rota);
    }
  });

  return Array.from(workerMap.values()).sort((a, b) =>
    a.workerName.localeCompare(b.workerName)
  );
}

// ===== MINI CALL BLOCK =====
function MiniCallBlock({
  entry,
  isCompact,
}: {
  entry: OptimizedRouteEntry;
  isCompact?: boolean;
}) {
  const color = getCallTypeColor(entry.timeBandLabel);
  const startTime = formatMinutesShort(entry.scheduledStartMinutes);

  if (isCompact) {
    return (
      <div
        className={cn(
          "h-2 w-full rounded-sm",
          color.bg,
          entry.isTimeCritical && "ring-1 ring-red-400"
        )}
        title={`${entry.serviceUserName || "Unknown"} - ${startTime}`}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] leading-tight truncate border",
        color.bg,
        color.text,
        color.border,
        entry.isTimeCritical && "ring-1 ring-red-400"
      )}
      title={`${entry.serviceUserName || "Unknown"} @ ${startTime}`}
    >
      <span className="font-medium">{startTime}</span>
      {!isCompact && entry.serviceUserName && (
        <span className="ml-1 opacity-80">{entry.serviceUserName.split(" ")[0]}</span>
      )}
    </div>
  );
}

// ===== DAY CELL =====
function DayCell({
  rota,
  isSelected,
  onClick,
}: {
  rota: CareWorkerRotaRecord | undefined;
  isSelected: boolean;
  onClick?: () => void;
}) {
  if (!rota) {
    return (
      <div className="h-full min-h-[52px] bg-muted/30 rounded flex items-center justify-center">
        <span className="text-[10px] text-muted-foreground">—</span>
      </div>
    );
  }

  const calls = rota.payload.optimizedRun ?? [];
  const callCount = calls.length;
  const displayCalls = calls.slice(0, 4);
  const moreCount = callCount - displayCalls.length;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full h-full min-h-[52px] p-1 rounded border transition-all text-left",
        "hover:bg-accent/50 hover:border-primary/30",
        isSelected
          ? "bg-primary/10 border-primary ring-1 ring-primary/40"
          : "bg-background border-border/50"
      )}
    >
      <div className="flex flex-col gap-0.5">
        {displayCalls.map((entry, idx) => (
          <MiniCallBlock key={`${entry.key}-${idx}`} entry={entry} isCompact={callCount > 4} />
        ))}
        {moreCount > 0 && (
          <span className="text-[9px] text-muted-foreground text-center">
            +{moreCount} more
          </span>
        )}
      </div>
    </button>
  );
}

// ===== WORKER ROW =====
function WorkerRow({
  workerName,
  rotasByDay,
  selectedRotaId,
  onSelectRota,
}: {
  workerName: string;
  rotasByDay: Map<string, CareWorkerRotaRecord>;
  selectedRotaId: string | null;
  onSelectRota: (id: string) => void;
}) {
  const totalCalls = WEEKDAYS.reduce((sum, day) => {
    const rota = rotasByDay.get(day);
    return sum + (rota?.payload.optimizedRun?.length ?? 0);
  }, 0);

  return (
    <div className="grid grid-cols-8 gap-1 py-1 border-b border-border/30 last:border-b-0">
      {/* Worker name column - sticky */}
      <div className="sticky left-0 z-10 bg-background flex items-center gap-2 px-2 min-w-[140px]">
        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
          {workerName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{workerName}</p>
          <p className="text-[10px] text-muted-foreground">{totalCalls} calls</p>
        </div>
      </div>

      {/* Day cells */}
      {WEEKDAYS.map((day) => {
        const rota = rotasByDay.get(day);
        return (
          <DayCell
            key={day}
            rota={rota}
            isSelected={rota?.id === selectedRotaId}
            onClick={rota ? () => onSelectRota(rota.id) : undefined}
          />
        );
      })}
    </div>
  );
}

// ===== MAIN COMPONENT =====
export function WeeklyPlannerGrid({
  rotas,
  selectedRotaId,
  onSelectRota,
  loading,
}: WeeklyPlannerGridProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedWeek, setSelectedWeek] = useState<"week1" | "week2">("week1");

  // Filter rotas by selected week
  const weekRotas = useMemo(
    () => rotas.filter((rota) => rota.templateWeek === selectedWeek),
    [rotas, selectedWeek]
  );

  // Group by worker
  const workerGroups = useMemo(() => groupRotasByWorker(weekRotas), [weekRotas]);

  // Filter by search
  const filteredWorkers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return workerGroups;
    return workerGroups.filter((worker) =>
      worker.workerName.toLowerCase().includes(term)
    );
  }, [workerGroups, searchTerm]);

  // Stats
  const totalWorkers = workerGroups.length;
  const totalRotas = weekRotas.length;

  return (
    <div className="flex flex-col h-full">
      {/* Header controls */}
      <div className="flex flex-wrap items-center gap-3 p-4 border-b bg-muted/30">
        <Tabs value={selectedWeek} onValueChange={(v) => setSelectedWeek(v as "week1" | "week2")}>
          <TabsList className="h-8">
            <TabsTrigger value="week1" className="text-xs px-3">Week 1</TabsTrigger>
            <TabsTrigger value="week2" className="text-xs px-3">Week 2</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search workers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground ml-auto">
          <span className="flex items-center gap-1">
            <UsersIcon className="h-3.5 w-3.5" />
            {totalWorkers} workers
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {totalRotas} rotas
          </span>
        </div>
      </div>

      {/* Grid header */}
      <div className="grid grid-cols-8 gap-1 px-4 py-2 bg-muted/50 border-b sticky top-0 z-20">
        <div className="text-xs font-semibold text-muted-foreground sticky left-0 bg-muted/50 px-2 min-w-[140px]">
          Care Worker
        </div>
        {WEEKDAYS.map((day) => (
          <div key={day} className="text-xs font-semibold text-center text-muted-foreground">
            {SHORT_WEEKDAYS[day]}
          </div>
        ))}
      </div>

      {/* Grid body */}
      <ScrollArea className="flex-1">
        <div className="px-4 py-1">
          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Loading rotas...
            </div>
          ) : filteredWorkers.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {searchTerm ? "No workers match your search." : "No rotas saved for this week."}
            </div>
          ) : (
            filteredWorkers.map((worker) => (
              <WorkerRow
                key={worker.workerKey}
                workerName={worker.workerName}
                rotasByDay={worker.rotasByDay}
                selectedRotaId={selectedRotaId}
                onSelectRota={onSelectRota}
              />
            ))
          )}
        </div>
      </ScrollArea>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-t bg-muted/20 text-[10px]">
        <span className="text-muted-foreground">Time bands:</span>
        {Object.entries(CALL_TYPE_COLORS)
          .filter(([key]) => key !== "default")
          .map(([key, colors]) => (
            <span
              key={key}
              className={cn("px-1.5 py-0.5 rounded capitalize", colors.bg, colors.text)}
            >
              {key}
            </span>
          ))}
      </div>
    </div>
  );
}

export default WeeklyPlannerGrid;
