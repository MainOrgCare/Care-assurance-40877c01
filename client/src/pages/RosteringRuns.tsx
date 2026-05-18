import { useCallback, useMemo, useState } from "react";
import { Link } from "wouter";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useToast } from "@/hooks/use-toast";
import { getSharedAllSlots, type SharedCallSlot } from "@/pages/rosteringRunsStore";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Download,
  ListOrdered,
  Search,
  Users,
} from "lucide-react";

interface ServiceUser {
  key: string;
  name: string;
  area: string | null;
  calls: SharedCallSlot[];
}

function formatMinutesToTime(minutes: number): string {
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

export default function RosteringRuns() {
  usePageTitle("Rostering Runs");
  const { toast } = useToast();

  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [callTypeFilter, setCallTypeFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Read ALL call slots from shared store (populated by Analyse)
  const allSlots = getSharedAllSlots();

  // Derive service users and call types from all analysed slots
  const { serviceUsers, callTypes } = useMemo(() => {
    const userMap = new Map<string, ServiceUser>();
    const typeSet = new Set<string>();

    for (const slot of allSlots) {
      typeSet.add(slot.callTypeLabel);

      if (!userMap.has(slot.serviceUserKey)) {
        userMap.set(slot.serviceUserKey, {
          key: slot.serviceUserKey,
          name: slot.serviceUserName,
          area: slot.serviceUserArea,
          calls: [slot],
        });
      } else {
        userMap.get(slot.serviceUserKey)!.calls.push(slot);
      }
    }

    return {
      serviceUsers: Array.from(userMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
      callTypes: Array.from(typeSet).sort(),
    };
  }, [allSlots]);

  // Filter service users by search
  const filteredServiceUsers = useMemo(() => {
    if (!searchTerm.trim()) return serviceUsers;
    const term = searchTerm.toLowerCase();
    return serviceUsers.filter((su) => su.name.toLowerCase().includes(term));
  }, [serviceUsers, searchTerm]);

  // Compute optimal run order from selected users
  const optimalRun = useMemo(() => {
    if (selectedUsers.size === 0) return [];

    const calls: SharedCallSlot[] = [];
    for (const su of serviceUsers) {
      if (!selectedUsers.has(su.key)) continue;
      for (const call of su.calls) {
        if (callTypeFilter !== "all" && call.callTypeLabel.toLowerCase() !== callTypeFilter.toLowerCase()) continue;
        calls.push(call);
      }
    }

    // Sort by recommended start time (optimal order)
    return calls.sort((a, b) => {
      const aTime = a.averageActualStartMinutes ?? a.averagePlannedStartMinutes ?? 9999;
      const bTime = b.averageActualStartMinutes ?? b.averagePlannedStartMinutes ?? 9999;
      return aTime - bTime;
    });
  }, [selectedUsers, callTypeFilter, serviceUsers]);

  // Total time span estimation
  const totalGapMinutes = useMemo(() => {
    if (optimalRun.length < 2) return 0;
    const first = optimalRun[0].averageActualStartMinutes ?? optimalRun[0].averagePlannedStartMinutes ?? 0;
    const last = optimalRun[optimalRun.length - 1].averageActualStartMinutes ?? optimalRun[optimalRun.length - 1].averagePlannedStartMinutes ?? 0;
    return Math.max(0, last - first);
  }, [optimalRun]);

  const handleSelectAll = useCallback(() => {
    setSelectedUsers(new Set(filteredServiceUsers.map((su) => su.key)));
  }, [filteredServiceUsers]);

  const handleClearSelection = useCallback(() => {
    setSelectedUsers(new Set());
  }, []);

  const handleToggleUser = useCallback((key: string) => {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleCopyRun = useCallback(() => {
    if (!optimalRun.length) return;
    const lines = optimalRun.map((call, idx) => {
      const time = call.suggestedPlannedTimeLabel ?? formatMinutesToTime(call.averageActualStartMinutes ?? call.averagePlannedStartMinutes ?? 0);
      return `${idx + 1}. ${call.serviceUserName} — ${call.callTypeLabel} (${call.timeBandLabel}) @ ${time}`;
    });
    const text = `Optimal Run (${optimalRun.length} calls)\n${"─".repeat(40)}\n${lines.join("\n")}`;
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard", description: `${optimalRun.length} calls in optimal order.` });
  }, [optimalRun, toast]);

  const handleExportCSV = useCallback(() => {
    if (!optimalRun.length) return;
    const header = "Order,Service User,Call Type,Time Band,Suggested Time,Duration (min),Area,Advice,Has Recommendation";
    const rows = optimalRun.map((call, idx) => {
      const time = call.suggestedPlannedTimeLabel ?? formatMinutesToTime(call.averageActualStartMinutes ?? call.averagePlannedStartMinutes ?? 0);
      return `${idx + 1},"${call.serviceUserName}","${call.callTypeLabel}","${call.timeBandLabel}","${time}","${call.suggestedPlannedDurationMinutes ?? ""}","${call.serviceUserArea ?? ""}","${call.advice.join("; ").replace(/"/g, '""')}","${call.hasRecommendation ? "Yes" : "No"}"`;
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `optimal-run-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [optimalRun]);

  // Empty state: no analysis data available
  if (allSlots.length === 0) {
    return (
      <div className="page-shell max-w-5xl mx-auto space-y-6 pb-8">
        <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/80 p-6 shadow-medium backdrop-blur-xl md:p-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.1),transparent_55%)]" />
          <div className="relative z-10 space-y-4">
            <div className="inline-flex items-center gap-3 rounded-full border border-primary/20 bg-primary/10 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
              <ListOrdered className="h-3.5 w-3.5" />
              Optimal Ordering
            </div>
            <h1 className="text-3xl font-heading font-bold text-foreground">Rostering Runs</h1>
          </div>
        </div>
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No analysis data available</AlertTitle>
          <AlertDescription>
            Upload an ECM export in{" "}
            <Link href="/rostering/data" className="underline font-medium text-primary">
              Rostering → Data
            </Link>{" "}
            and run analysis in{" "}
            <Link href="/rostering/analyse" className="underline font-medium text-primary">
              Rostering → Analyse
            </Link>{" "}
            first. Recommendations will then appear here for optimal run building.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="page-shell max-w-5xl mx-auto space-y-6 pb-8">
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/80 p-6 shadow-medium backdrop-blur-xl md:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.1),transparent_55%)]" />
        <div className="relative z-10 space-y-4">
          <div className="inline-flex items-center gap-3 rounded-full border border-primary/20 bg-primary/10 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
            <ListOrdered className="h-3.5 w-3.5" />
            Optimal Ordering
          </div>
          <div>
            <h1 className="text-3xl font-heading font-bold text-foreground">Rostering Runs</h1>
            <p className="text-muted-foreground max-w-2xl mt-2">
              Select service users to build an optimised rota run. Calls are ordered by their recommended times to minimise gaps and maximise efficiency.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Badge variant="outline" className="bg-background/70 px-3 py-1 text-xs">
              <Users className="mr-2 h-3.5 w-3.5" />
              {serviceUsers.length} service user{serviceUsers.length === 1 ? "" : "s"}
            </Badge>
            {selectedUsers.size > 0 && (
              <Badge variant="outline" className="bg-background/70 px-3 py-1 text-xs">
                <CheckCircle2 className="mr-2 h-3.5 w-3.5 text-emerald-500" />
                {selectedUsers.size} selected
              </Badge>
            )}
            {optimalRun.length > 0 && (
              <Badge variant="outline" className="bg-background/70 px-3 py-1 text-xs">
                <ListOrdered className="mr-2 h-3.5 w-3.5 text-primary" />
                {optimalRun.length} call{optimalRun.length === 1 ? "" : "s"} in run
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        {/* Left: Service user selection */}
        <Card className="border-border/60 bg-background/75 shadow-medium">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Select Service Users</CardTitle>
            <CardDescription>Choose which service users to include in the optimised run.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Controls */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search service users…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>
              <Select value={callTypeFilter} onValueChange={setCallTypeFilter}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {callTypes.map((ct) => (
                    <SelectItem key={ct} value={ct.toLowerCase()}>{ct}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleSelectAll}>
                Select all ({filteredServiceUsers.length})
              </Button>
              {selectedUsers.size > 0 && (
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleClearSelection}>
                  Clear
                </Button>
              )}
            </div>

            {/* Service user list */}
            <ScrollArea className="h-[400px] border rounded-xl">
              <div className="divide-y">
                {filteredServiceUsers.map((su) => (
                  <label
                    key={su.key}
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      className="rounded border-border h-4 w-4"
                      checked={selectedUsers.has(su.key)}
                      onChange={() => handleToggleUser(su.key)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{su.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {su.area && <span>{su.area} · </span>}
                        {su.calls.length} call{su.calls.length === 1 ? "" : "s"}
                      </div>
                    </div>
                    {selectedUsers.has(su.key) && (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    )}
                  </label>
                ))}
                {filteredServiceUsers.length === 0 && (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    {searchTerm ? "No matching service users." : "No service users with recommendations."}
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Right: Optimal run result */}
        <Card className="border-border/60 bg-background/75 shadow-medium">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <ListOrdered className="h-4 w-4 text-primary" />
                  Optimal Run
                </CardTitle>
                <CardDescription>
                  {optimalRun.length > 0
                    ? `${optimalRun.length} call${optimalRun.length === 1 ? "" : "s"} ordered by recommended time`
                    : "Select service users to generate an optimal run"}
                </CardDescription>
              </div>
              {optimalRun.length > 0 && (
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleCopyRun}>
                    <Copy className="h-3 w-3" /> Copy
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleExportCSV}>
                    <Download className="h-3 w-3" /> CSV
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Summary stats */}
            {optimalRun.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-border/60 bg-background/80 px-3 py-2 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Calls</p>
                  <p className="text-lg font-bold text-foreground">{optimalRun.length}</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/80 px-3 py-2 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Time span</p>
                  <p className="text-lg font-bold text-foreground">
                    {optimalRun.length >= 2
                      ? `${formatMinutesToTime(optimalRun[0].averageActualStartMinutes ?? optimalRun[0].averagePlannedStartMinutes ?? 0)} – ${formatMinutesToTime(optimalRun[optimalRun.length - 1].averageActualStartMinutes ?? optimalRun[optimalRun.length - 1].averagePlannedStartMinutes ?? 0)}`
                      : "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/80 px-3 py-2 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total span</p>
                  <p className="text-lg font-bold text-foreground">
                    {totalGapMinutes > 0 ? `${Math.floor(totalGapMinutes / 60)}h ${totalGapMinutes % 60}m` : "—"}
                  </p>
                </div>
              </div>
            )}

            {/* Run list */}
            {optimalRun.length > 0 ? (
              <ScrollArea className="h-[380px] border rounded-xl">
                <div className="divide-y">
                  {optimalRun.map((call, idx) => (
                    <div key={`${call.serviceUserKey}-${call.callTypeLabel}-${idx}`} className="flex items-center gap-3 px-3 py-3">
                      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shrink-0 ${
                        call.hasRecommendation ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                      }`}>
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate flex items-center gap-1.5">
                          {call.serviceUserName}
                          {call.hasRecommendation && (
                            <Badge variant="outline" className="px-1.5 py-0 text-[9px] leading-tight border-primary/30 text-primary">
                              Rec
                            </Badge>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {call.callTypeLabel} · {call.timeBandLabel}
                          {call.suggestedPlannedDurationMinutes != null && (
                            <span> · {call.suggestedPlannedDurationMinutes} min</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-sm font-mono font-semibold ${call.hasRecommendation ? "text-primary" : "text-foreground"}`}>
                          {call.suggestedPlannedTimeLabel ?? formatMinutesToTime(call.averageActualStartMinutes ?? call.averagePlannedStartMinutes ?? 0)}
                        </div>
                        {call.serviceUserArea && (
                          <div className="text-[10px] text-muted-foreground">
                            {call.serviceUserArea}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <ListOrdered className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  Select service users from the left panel to build an optimised run.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Calls will be sorted by their optimal times to create an efficient route.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
