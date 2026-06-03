import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useToast } from "@/hooks/use-toast";
import {
  getSharedAllSlots,
  getSharedRecommendationDecisions,
  setSharedRecommendationDecisions,
  subscribeSharedRecommendationDecisions,
  subscribeSharedRosteringData,
  updateSharedRecommendationDecision,
  type RecommendationDecision,
  type SharedCallSlot,
} from "@/pages/rosteringRunsStore";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Download,
  Filter,
  Lightbulb,
  ListOrdered,
  MapPin,
  Route,
  Search,
  Sparkles,
  Timer,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

interface ServiceUser {
  key: string;
  name: string;
  area: string | null;
  calls: SharedCallSlot[];
}

type RouteMode = "location" | "time";

/**
 * A call placed on the run timeline. `effectiveStartMinutes` is the actual
 * scheduled start time after no-overlap resolution; `pushedMinutes` is how far
 * forward it had to move from `desiredStartMinutes` to avoid colliding with the
 * previous call. Duration is taken from the service-requirement length
 * (`averagePlannedDurationMinutes`, which is sourced from service requirement
 * times in the parser) — never the variable actual length.
 */
interface ScheduledCall {
  call: SharedCallSlot;
  desiredStartMinutes: number;
  effectiveStartMinutes: number;
  durationMinutes: number;
  endMinutes: number;
  pushedMinutes: number;
}

const DEFAULT_CALL_DURATION_MINUTES = 30;
const RUN_TRAVEL_BUFFER_MINUTES = 5;

/** Service-requirement length for a call, falling back to a sensible default. */
function durationForCall(call: SharedCallSlot): number {
  const planned = call.averagePlannedDurationMinutes;
  if (typeof planned === "number" && Number.isFinite(planned) && planned > 0) {
    return Math.max(5, Math.round(planned));
  }
  return DEFAULT_CALL_DURATION_MINUTES;
}

/**
 * Place an ordered list of calls onto a timeline so they never overlap.
 * Each call keeps its recommended start unless the previous call (plus a short
 * travel buffer) would still be running — in which case the call is pushed
 * forward to start exactly when the previous one ends + buffer.
 */
function buildRunSchedule(orderedCalls: SharedCallSlot[]): ScheduledCall[] {
  const result: ScheduledCall[] = [];
  let cursor = Number.NEGATIVE_INFINITY;
  for (const call of orderedCalls) {
    const desired = callStartMinutes(call);
    const duration = durationForCall(call);
    const effective = Math.max(desired, cursor);
    const end = effective + duration;
    result.push({
      call,
      desiredStartMinutes: desired,
      effectiveStartMinutes: effective,
      durationMinutes: duration,
      endMinutes: end,
      pushedMinutes: Math.max(0, effective - desired),
    });
    cursor = end + RUN_TRAVEL_BUFFER_MINUTES;
  }
  return result;
}

function formatMinutesToTime(minutes: number): string {
  const normalized = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hrs = Math.floor(normalized / 60);
  const mins = Math.round(normalized % 60);
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

function callStartMinutes(call: SharedCallSlot): number {
  return call.averageActualStartMinutes ?? call.averagePlannedStartMinutes ?? 9999;
}

function recommendationDecisionLabel(decision: RecommendationDecision | undefined): string {
  if (decision === "implemented") return "Approved";
  if (decision === "rejected") return "Rejected";
  return "Pending";
}

function initialsForLog(name: string): string {
  const initials = name
    .split(/\s+/)
    .map((part) => part.trim().charAt(0).toUpperCase())
    .filter(Boolean)
    .slice(0, 3)
    .join("");
  return initials || "SU";
}

// Extract a UK-style postcode outward code (e.g. "SW1A", "M14", "L4") from a free-text field.
function extractPostcodeOutward(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.toUpperCase().match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?)\s*\d[A-Z]{2}\b/);
  if (match) return match[1];
  const loose = text.toUpperCase().match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?)\b(?=[\s,]|$)/);
  return loose ? loose[1] : null;
}

// Stable location key per call (postcode > area > first street token).
function locationKeyForCall(call: SharedCallSlot): string {
  const pc =
    extractPostcodeOutward(call.serviceUserAddress) ?? extractPostcodeOutward(call.serviceUserArea);
  if (pc) return `pc:${pc}`;
  const area = (call.serviceUserArea ?? "").trim().toLowerCase();
  if (area) return `area:${area}`;
  const addr = (call.serviceUserAddress ?? "").trim().toLowerCase();
  if (addr) {
    const street = addr.split(",")[0].trim().replace(/^\d+\s*/, "");
    return `street:${street.slice(0, 32)}`;
  }
  return `su:${call.serviceUserKey}`;
}

// 0 = same locality, higher = further apart. No real geocoding, so we score
// using postcode district, then address-token Jaccard overlap.
function locationDistance(a: SharedCallSlot, b: SharedCallSlot): number {
  const ka = locationKeyForCall(a);
  const kb = locationKeyForCall(b);
  if (ka === kb) return 0;
  if (ka.startsWith("pc:") && kb.startsWith("pc:")) {
    const districtA = ka.slice(3).match(/^[A-Z]+/)?.[0] ?? "";
    const districtB = kb.slice(3).match(/^[A-Z]+/)?.[0] ?? "";
    if (districtA && districtA === districtB) return 1;
    return 3;
  }
  const tokenize = (text: string | null) =>
    new Set(
      (text ?? "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 2),
    );
  const ta = tokenize(a.serviceUserAddress);
  const tb = tokenize(b.serviceUserAddress);
  if (ta.size && tb.size) {
    let common = 0;
    for (const t of ta) if (tb.has(t)) common += 1;
    const union = new Set([...ta, ...tb]).size;
    const jaccard = union === 0 ? 0 : common / union;
    if (jaccard >= 0.5) return 1;
    if (jaccard >= 0.25) return 2;
  }
  return 3;
}

// Greedy nearest-neighbour route that respects a soft time window so we don't
// jump backwards in time. Anchors on the earliest call, then at each step picks
// the next call that minimises a weighted combination of travel distance and
// time gap from the last chosen call.
function optimiseRouteByLocation(calls: SharedCallSlot[]): SharedCallSlot[] {
  if (calls.length <= 2) {
    return [...calls].sort((a, b) => callStartMinutes(a) - callStartMinutes(b));
  }
  const timeSorted = [...calls].sort((a, b) => callStartMinutes(a) - callStartMinutes(b));
  const remaining = new Set<SharedCallSlot>(timeSorted.slice(1));
  const ordered: SharedCallSlot[] = [timeSorted[0]];
  const TIME_WINDOW = 60; // minutes — calls within this window of the last pick are clustered by location
  while (remaining.size > 0) {
    const last = ordered[ordered.length - 1];
    const lastTime = callStartMinutes(last);
    let best: SharedCallSlot | null = null;
    let bestScore = Infinity;
    for (const candidate of remaining) {
      const candidateTime = callStartMinutes(candidate);
      const dt = Math.abs(candidateTime - lastTime);
      const distance = locationDistance(last, candidate);
      // Inside the window: travel cost dominates. Outside: chronological order dominates,
      // but we still prefer closer locations as a tiebreaker.
      const score = dt <= TIME_WINDOW ? distance * 60 + dt * 0.5 : dt + distance * 20;
      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    if (!best) break;
    ordered.push(best);
    remaining.delete(best);
  }
  return ordered;
}

export default function RosteringRuns() {
  usePageTitle("Rostering Runs");
  const { toast } = useToast();
  const { user } = useAuth();
  const isPilotUser = user?.role === "pilot";

  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [callTypeFilter, setCallTypeFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [routeMode, setRouteMode] = useState<RouteMode>("location");
  const [showRecommendedOnly, setShowRecommendedOnly] = useState(false);
  const [runViewFilter, setRunViewFilter] = useState<"all" | "recs" | "pending">("all");
  const [expandedCalls, setExpandedCalls] = useState<Set<string>>(new Set());
  // Undo stack for recommendation decisions: records {key, prev} before each change
  const [decisionHistory, setDecisionHistory] = useState<Array<{ key: string; prev: RecommendationDecision | null }>>([]);

  const toggleCallExpanded = useCallback((key: string) => {
    setExpandedCalls((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const recommendationDecisions = useSyncExternalStore(
    subscribeSharedRecommendationDecisions,
    getSharedRecommendationDecisions,
    getSharedRecommendationDecisions,
  );

  // Read ALL call slots from shared store (populated by Analyse). Subscribed so
  // the view re-renders when a new ECM export is analysed.
  const allSlots = useSyncExternalStore(
    subscribeSharedRosteringData,
    getSharedAllSlots,
    getSharedAllSlots,
  );

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

  // Filter service users by search and recommendation toggle
  const filteredServiceUsers = useMemo(() => {
    let list = serviceUsers;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter((su) => su.name.toLowerCase().includes(term));
    }
    if (showRecommendedOnly) {
      list = list.filter((su) => su.calls.some((c) => c.hasRecommendation));
    }
    return list;
  }, [serviceUsers, searchTerm, showRecommendedOnly]);

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

    if (routeMode === "location") {
      return optimiseRouteByLocation(calls);
    }
    return calls.sort((a, b) => callStartMinutes(a) - callStartMinutes(b));
  }, [selectedUsers, callTypeFilter, serviceUsers, routeMode]);

  // Resolve the ordered run into a no-overlap timeline using service-requirement
  // durations. Each scheduled entry exposes both the desired start (what the
  // recommendation asked for) and the effective start (after collision push).
  const scheduledRun = useMemo<ScheduledCall[]>(
    () => buildRunSchedule(optimalRun),
    [optimalRun],
  );

  const overlapResolvedCount = useMemo(
    () => scheduledRun.reduce((acc, s) => acc + (s.pushedMinutes > 0 ? 1 : 0), 0),
    [scheduledRun],
  );

  const approvedRunRecommendationCount = useMemo(
    () =>
      scheduledRun.reduce(
        (acc, entry) =>
          acc + (entry.call.hasRecommendation && recommendationDecisions[entry.call.key] === "implemented" ? 1 : 0),
        0,
      ),
    [scheduledRun, recommendationDecisions],
  );

  const pendingRunRecommendationCount = useMemo(
    () =>
      scheduledRun.reduce(
        (acc, entry) =>
          acc + (entry.call.hasRecommendation && recommendationDecisions[entry.call.key] !== "implemented" ? 1 : 0),
        0,
      ),
    [scheduledRun, recommendationDecisions],
  );

  const totalRunRecommendationCount = useMemo(
    () => scheduledRun.reduce((acc, entry) => acc + (entry.call.hasRecommendation ? 1 : 0), 0),
    [scheduledRun],
  );

  // Filtered subset of scheduled run for the list view
  const visibleRunEntries = useMemo(() => {
    if (runViewFilter === "recs") return scheduledRun.filter((e) => e.call.hasRecommendation);
    if (runViewFilter === "pending")
      return scheduledRun.filter(
        (e) => e.call.hasRecommendation && recommendationDecisions[e.call.key] !== "implemented",
      );
    return scheduledRun;
  }, [scheduledRun, runViewFilter, recommendationDecisions]);

  const totalScheduledDurationMinutes = useMemo(
    () => scheduledRun.reduce((acc, s) => acc + s.durationMinutes, 0),
    [scheduledRun],
  );

  // First/last effective minute used for proportional timeline placement.
  const timelineBounds = useMemo(() => {
    if (scheduledRun.length === 0) return null;
    const first = scheduledRun[0].effectiveStartMinutes;
    const last = scheduledRun[scheduledRun.length - 1].endMinutes;
    const span = Math.max(1, last - first);
    return { first, last, span };
  }, [scheduledRun]);

  // Count location transitions ("hops") between consecutive calls — lower is a tighter route.
  const routeStats = useMemo(() => {
    if (optimalRun.length < 2) return { hops: 0, distinctLocations: optimalRun.length };
    let hops = 0;
    const distinct = new Set<string>();
    for (let i = 0; i < optimalRun.length; i += 1) {
      const key = locationKeyForCall(optimalRun[i]);
      distinct.add(key);
      if (i > 0 && locationKeyForCall(optimalRun[i - 1]) !== key) hops += 1;
    }
    return { hops, distinctLocations: distinct.size };
  }, [optimalRun]);

  // Total elapsed minutes from the first scheduled start to the last scheduled end.
  const totalGapMinutes = useMemo(() => {
    if (!timelineBounds) return 0;
    return Math.max(0, timelineBounds.span);
  }, [timelineBounds]);

  // Global dataset insights (across all slots, not just current run)
  const globalStats = useMemo(() => {
    const withRec = allSlots.filter((s) => s.hasRecommendation);
    const totalSUs = new Set(allSlots.map((s) => s.serviceUserKey)).size;
    const susWithRec = new Set(withRec.map((s) => s.serviceUserKey)).size;

    // Avg time delta (suggested vs planned) for slots with both values
    const deltas: number[] = [];
    for (const s of withRec) {
      if (s.averagePlannedStartMinutes != null && s.averageActualStartMinutes != null) {
        deltas.push(s.averageActualStartMinutes - s.averagePlannedStartMinutes);
      }
    }
    const avgDeltaMinutes =
      deltas.length > 0 ? Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length) : null;

    // Pct that run early vs late
    const earlyCount = deltas.filter((d) => d < -1).length;
    const lateCount = deltas.filter((d) => d > 1).length;
    const earlyPct = deltas.length > 0 ? Math.round((earlyCount / deltas.length) * 100) : null;
    const latePct = deltas.length > 0 ? Math.round((lateCount / deltas.length) * 100) : null;

    return { withRecCount: withRec.length, totalSUs, susWithRec, avgDeltaMinutes, earlyPct, latePct };
  }, [allSlots]);

  // Service users with recs (for quick-select)
  const serviceUsersWithRecs = useMemo(
    () => serviceUsers.filter((su) => su.calls.some((c) => c.hasRecommendation)),
    [serviceUsers],
  );

  const handleSelectWithRecs = useCallback(() => {
    setSelectedUsers(new Set(serviceUsersWithRecs.map((su) => su.key)));
  }, [serviceUsersWithRecs]);

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
    if (!scheduledRun.length) return;
    const lines = scheduledRun.map((entry, idx) => {
      const start = formatMinutesToTime(entry.effectiveStartMinutes);
      const end = formatMinutesToTime(entry.endMinutes);
      const pushedTag = entry.pushedMinutes > 0 ? ` (+${entry.pushedMinutes}m to avoid overlap)` : "";
      const decisionTag = entry.call.hasRecommendation
        ? ` · ${recommendationDecisionLabel(recommendationDecisions[entry.call.key])}`
        : "";
      return `${idx + 1}. ${entry.call.serviceUserName} — ${entry.call.callTypeLabel} (${entry.call.timeBandLabel}) @ ${start}–${end} · ${entry.durationMinutes}m${pushedTag}${decisionTag}`;
    });
    const text = `Optimal Run (${scheduledRun.length} calls)\n${"─".repeat(40)}\n${lines.join("\n")}`;
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard", description: `${scheduledRun.length} calls in optimal order.` });
  }, [scheduledRun, recommendationDecisions, toast]);

  const handleExportCSV = useCallback(() => {
    if (!scheduledRun.length) return;
    const header = "Order,Service User,Call Type,Time Band,Desired Start,Effective Start,End,Length (min),Pushed (min),Area,Address,Advice,Has Recommendation,Approval Status";
    const rows = scheduledRun.map((entry, idx) => {
      const { call } = entry;
      return [
        idx + 1,
        `"${call.serviceUserName}"`,
        `"${call.callTypeLabel}"`,
        `"${call.timeBandLabel}"`,
        `"${formatMinutesToTime(entry.desiredStartMinutes)}"`,
        `"${formatMinutesToTime(entry.effectiveStartMinutes)}"`,
        `"${formatMinutesToTime(entry.endMinutes)}"`,
        entry.durationMinutes,
        entry.pushedMinutes,
        `"${call.serviceUserArea ?? ""}"`,
        `"${(call.serviceUserAddress ?? "").replace(/"/g, '""')}"`,
        `"${call.advice.join("; ").replace(/"/g, '""')}"`,
        call.hasRecommendation ? "Yes" : "No",
        `"${call.hasRecommendation ? recommendationDecisionLabel(recommendationDecisions[call.key]) : "Not applicable"}"`,
      ].join(",");
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `optimal-run-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [scheduledRun, recommendationDecisions]);

  const recordRecommendationDecision = useCallback((call: SharedCallSlot, decision: RecommendationDecision | null) => {
    if (!call.hasRecommendation) return;
    if (isPilotUser) {
      toast({
        title: "Read-only access",
        description: "Pilot users can review runs but cannot approve rostering recommendations.",
        variant: "destructive",
      });
      return;
    }

    // Push undo entry before applying
    setDecisionHistory((prev) => [
      ...prev.slice(-49),
      { key: call.key, prev: recommendationDecisions[call.key] ?? null },
    ]);

    updateSharedRecommendationDecision(call.key, decision);

    if (decision === "implemented") {
      toast({
        title: "Rostering recommendation approved",
        description: `${call.serviceUserName} • ${call.timeBandLabel}`,
      });
    } else {
      toast({
        title: "Approval reset",
        description: `${call.serviceUserName} is back to pending.`,
      });
    }

    fetch("/api/system-logs", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "rostering_recommendation",
        action: decision === "implemented" ? "Approved rostering run recommendation" : "Reset rostering run recommendation approval",
        target: `${call.serviceUserName} · ${call.callTypeLabel} · ${call.timeBandLabel}`,
        status: decision === "implemented" ? "Authorized" : "Pending",
        serviceUserInitials: initialsForLog(call.serviceUserName),
        details: {
          decision: decision ?? "pending",
          recommendationKey: call.key,
          serviceUserName: call.serviceUserName,
          serviceUserArea: call.serviceUserArea ?? null,
          callTypeLabel: call.callTypeLabel,
          timeBandLabel: call.timeBandLabel,
          suggestedPlannedTime: call.suggestedPlannedTimeLabel,
          suggestedPlannedDurationMinutes: call.suggestedPlannedDurationMinutes,
          source: "rostering_runs",
        },
      }),
    }).catch((err) => {
      console.warn("Failed to record rostering run recommendation decision in system log", err);
    });
  }, [isPilotUser, toast, recommendationDecisions]);

  const undoLastDecision = useCallback(() => {
    if (decisionHistory.length === 0) {
      toast({ title: "Nothing to undo", description: "No decisions have been recorded yet.", variant: "destructive" });
      return;
    }
    const last = decisionHistory[decisionHistory.length - 1];
    setDecisionHistory((prev) => prev.slice(0, -1));
    updateSharedRecommendationDecision(last.key, last.prev);
    toast({ title: "Decision undone", description: `Reverted to ${last.prev ?? "pending"}` });
  }, [decisionHistory, toast]);

  const approveCurrentRunRecommendations = useCallback(() => {
    if (isPilotUser) {
      toast({
        title: "Read-only access",
        description: "Pilot users can review runs but cannot approve rostering recommendations.",
        variant: "destructive",
      });
      return;
    }

    const recommendationCalls = scheduledRun.filter((entry) => entry.call.hasRecommendation);
    if (!recommendationCalls.length) {
      toast({
        title: "No recommendations to approve",
        description: "The current run only contains calls without timing recommendations.",
        variant: "destructive",
      });
      return;
    }

    const next = { ...recommendationDecisions };
    recommendationCalls.forEach((entry) => {
      next[entry.call.key] = "implemented";
    });
    setSharedRecommendationDecisions(next);

    toast({
      title: "Run recommendations approved",
      description: `${recommendationCalls.length} recommendation${recommendationCalls.length === 1 ? "" : "s"} marked approved.`,
    });

    fetch("/api/system-logs", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "rostering_recommendation",
        action: "Approved rostering run recommendations",
        target: `Rostering Runs · ${recommendationCalls.length} call${recommendationCalls.length === 1 ? "" : "s"}`,
        status: "Authorized",
        details: {
          decision: "implemented",
          source: "rostering_runs",
          recommendationKeys: recommendationCalls.map((entry) => entry.call.key),
          callCount: recommendationCalls.length,
        },
      }),
    }).catch((err) => {
      console.warn("Failed to record rostering run approval summary in system log", err);
    });
  }, [isPilotUser, scheduledRun, recommendationDecisions, toast]);

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
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.18),transparent_55%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.12),transparent_55%)]" />
        <div className="relative z-10 space-y-5">
          <div className="inline-flex items-center gap-3 rounded-full border border-primary/20 bg-primary/10 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Optimal Ordering
          </div>
          <div>
            <h1 className="text-3xl font-heading font-bold text-foreground md:text-4xl">Rostering Runs</h1>
            <p className="text-muted-foreground max-w-2xl mt-2">
              Select service users to build an optimised run. Calls are placed end‑to‑end on the timeline using their
              <span className="font-medium text-foreground/80"> service‑requirement length</span> so two visits can never overlap.
            </p>
          </div>

          {/* Global insight stat strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border/50 bg-background/60 px-3 py-2 space-y-0.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Service users</p>
              <p className="text-xl font-bold text-foreground tabular-nums">{globalStats.totalSUs}</p>
              {globalStats.susWithRec > 0 && (
                <p className="text-[10px] text-primary font-medium">
                  {globalStats.susWithRec} with recs
                </p>
              )}
            </div>
            <div className="rounded-xl border border-border/50 bg-background/60 px-3 py-2 space-y-0.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Recommendations</p>
              <p className="text-xl font-bold text-foreground tabular-nums">{globalStats.withRecCount}</p>
              {approvedRunRecommendationCount > 0 && (
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                  {approvedRunRecommendationCount} approved this run
                </p>
              )}
            </div>
            {globalStats.avgDeltaMinutes !== null && (
              <div className="rounded-xl border border-border/50 bg-background/60 px-3 py-2 space-y-0.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Avg time drift</p>
                <p className={`text-xl font-bold tabular-nums ${
                  globalStats.avgDeltaMinutes > 2 ? "text-amber-600 dark:text-amber-400"
                  : globalStats.avgDeltaMinutes < -2 ? "text-sky-600 dark:text-sky-400"
                  : "text-foreground"
                }`}>
                  {globalStats.avgDeltaMinutes > 0 ? "+" : ""}{globalStats.avgDeltaMinutes}m
                </p>
                <p className="text-[10px] text-muted-foreground">actual vs planned</p>
              </div>
            )}
            {globalStats.latePct !== null && (
              <div className="rounded-xl border border-border/50 bg-background/60 px-3 py-2 space-y-0.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Punctuality</p>
                <p className="text-xl font-bold text-foreground tabular-nums">
                  {100 - (globalStats.latePct ?? 0) - (globalStats.earlyPct ?? 0)}%
                </p>
                <p className="text-[10px] text-muted-foreground">
                  on time · {globalStats.latePct}% late · {globalStats.earlyPct}% early
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <TooltipProvider delayDuration={300}>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        {/* Left: Service user selection */}
        <Card className="border-border/60 bg-background/75 shadow-medium">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Select Service Users</CardTitle>
                <CardDescription>
                  {globalStats.susWithRec > 0
                    ? `${globalStats.totalSUs} users · ${globalStats.susWithRec} have recommendations`
                    : "Choose which service users to include in the optimised run."}
                </CardDescription>
              </div>
            </div>
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

            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleSelectAll}>
                Select all ({filteredServiceUsers.length})
              </Button>
              {serviceUsersWithRecs.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/5"
                  onClick={handleSelectWithRecs}
                >
                  <Zap className="h-3 w-3" />
                  With recs ({serviceUsersWithRecs.length})
                </Button>
              )}
              {selectedUsers.size > 0 && (
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleClearSelection}>
                  Clear
                </Button>
              )}
              <button
                type="button"
                onClick={() => setShowRecommendedOnly((v) => !v)}
                className={`ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium border transition ${
                  showRecommendedOnly
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "border-border/60 text-muted-foreground hover:text-foreground"
                }`}
                title="Show only service users with recommendations"
              >
                <Filter className="h-3 w-3" /> Recs only
              </button>
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
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="text-sm font-medium truncate cursor-default">{su.name}</div>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-[240px] space-y-1.5">
                          <p className="font-semibold text-xs">{su.name}</p>
                          {su.calls.map((call, i) => (
                            <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-x-2 text-[11px]">
                              <span className="text-muted-foreground truncate">{call.callTypeLabel}</span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3 text-primary/70" />
                                {call.averagePlannedStartMinutes != null ? formatMinutesToTime(call.averagePlannedStartMinutes) : "—"}
                              </span>
                              <span className="text-muted-foreground">
                                {call.averageActualStartMinutes != null ? formatMinutesToTime(call.averageActualStartMinutes) : "—"}
                              </span>
                            </div>
                          ))}
                          <p className="text-[10px] text-muted-foreground pt-0.5 border-t border-border/50">Planned · Actual avg</p>
                        </TooltipContent>
                      </Tooltip>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                        {su.area && <span>{su.area} · </span>}
                        {su.calls.length} call{su.calls.length === 1 ? "" : "s"}
                        {(() => {
                          const recCount = su.calls.filter((c) => c.hasRecommendation).length;
                          return recCount > 0 ? (
                            <span className="inline-flex items-center gap-0.5 text-primary font-medium">
                              <Sparkles className="h-2.5 w-2.5" />
                              {recCount} rec{recCount === 1 ? "" : "s"}
                            </span>
                          ) : null;
                        })()}
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
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <ListOrdered className="h-4 w-4 text-primary" />
                  Optimal Run
                </CardTitle>
                <CardDescription>
                  {scheduledRun.length > 0
                    ? routeMode === "location"
                      ? `${scheduledRun.length} call${scheduledRun.length === 1 ? "" : "s"} routed by location & time — placed end‑to‑end with no overlap`
                      : `${scheduledRun.length} call${scheduledRun.length === 1 ? "" : "s"} ordered by recommended time — placed end‑to‑end with no overlap`
                    : "Select service users to generate an optimal run"}
                </CardDescription>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <div
                  role="group"
                  aria-label="Route ordering mode"
                  className="inline-flex items-center rounded-lg border border-border/60 bg-background/80 p-0.5"
                >
                  <button
                    type="button"
                    onClick={() => setRouteMode("location")}
                    className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition ${
                      routeMode === "location"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    aria-pressed={routeMode === "location"}
                  >
                    <Route className="h-3 w-3" /> Route
                  </button>
                  <button
                    type="button"
                    onClick={() => setRouteMode("time")}
                    className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition ${
                      routeMode === "time"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    aria-pressed={routeMode === "time"}
                  >
                    <Clock className="h-3 w-3" /> Time
                  </button>
                </div>
                {scheduledRun.length > 0 && (
                  <>
                    {pendingRunRecommendationCount > 0 && !isPilotUser && (
                      <Button size="sm" variant="secondary" className="h-7 text-xs gap-1" onClick={approveCurrentRunRecommendations}>
                        <CheckCircle2 className="h-3 w-3" /> Approve run
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleCopyRun}>
                      <Copy className="h-3 w-3" /> Copy
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleExportCSV}>
                      <Download className="h-3 w-3" /> CSV
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Summary stats */}
            {scheduledRun.length > 0 && timelineBounds && (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <div className="rounded-xl border border-border/60 bg-gradient-to-br from-background/90 to-background/60 px-3 py-2 text-center shadow-sm">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Calls</p>
                  <p className="text-lg font-bold text-foreground">{scheduledRun.length}</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-gradient-to-br from-background/90 to-background/60 px-3 py-2 text-center shadow-sm">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Window</p>
                  <p className="text-sm font-bold text-foreground leading-tight">
                    {formatMinutesToTime(timelineBounds.first)}–{formatMinutesToTime(timelineBounds.last)}
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-gradient-to-br from-background/90 to-background/60 px-3 py-2 text-center shadow-sm">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">On‑call time</p>
                  <p className="text-lg font-bold text-foreground">
                    {Math.floor(totalScheduledDurationMinutes / 60)}h {totalScheduledDurationMinutes % 60}m
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-gradient-to-br from-background/90 to-background/60 px-3 py-2 text-center shadow-sm">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Area hops</p>
                  <p className="text-lg font-bold text-foreground">
                    {routeStats.hops}
                    <span className="text-[10px] font-normal text-muted-foreground"> / {routeStats.distinctLocations}</span>
                  </p>
                </div>
              </div>
            )}

            {/* Proportional timeline strip */}
            {scheduledRun.length > 0 && timelineBounds && (
              <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Run timeline</p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatMinutesToTime(timelineBounds.first)} – {formatMinutesToTime(timelineBounds.last)} · {Math.floor(timelineBounds.span / 60)}h {timelineBounds.span % 60}m window
                  </p>
                </div>
                {/* Main bar */}
                <div className="relative h-8 w-full rounded-md bg-background/70 ring-1 ring-border/60 overflow-hidden">
                  {scheduledRun.map((entry, idx) => {
                    const leftPct = ((entry.effectiveStartMinutes - timelineBounds.first) / timelineBounds.span) * 100;
                    const widthPct = Math.max(0.6, (entry.durationMinutes / timelineBounds.span) * 100);
                    const pushed = entry.pushedMinutes > 0;
                    const approved = recommendationDecisions[entry.call.key] === "implemented";
                    return (
                      <Tooltip key={`tl-${idx}`}>
                        <TooltipTrigger asChild>
                          <div
                            className={`absolute top-0 h-full rounded-sm transition-colors cursor-pointer ${
                              pushed
                                ? "bg-amber-500/70 hover:bg-amber-500"
                                : approved
                                  ? "bg-emerald-500/80 hover:bg-emerald-500"
                                  : entry.call.hasRecommendation
                                    ? "bg-primary/70 hover:bg-primary"
                                    : "bg-muted-foreground/35 hover:bg-muted-foreground/55"
                            }`}
                            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                            aria-label={`${idx + 1}. ${entry.call.serviceUserName}`}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-[11px] space-y-0.5">
                          <p className="font-semibold">{idx + 1}. {entry.call.serviceUserName}</p>
                          <p className="text-muted-foreground">{entry.call.callTypeLabel}</p>
                          <p className="font-mono">{formatMinutesToTime(entry.effectiveStartMinutes)}–{formatMinutesToTime(entry.endMinutes)} · {entry.durationMinutes}m</p>
                          {approved && <p className="text-emerald-600 dark:text-emerald-300">✓ Approved</p>}
                          {pushed && <p className="text-amber-600 dark:text-amber-300">Pushed +{entry.pushedMinutes}m to avoid overlap</p>}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                  {/* Hour tick marks */}
                  {(() => {
                    const firstHour = Math.ceil(timelineBounds.first / 60);
                    const lastHour = Math.floor(timelineBounds.last / 60);
                    const ticks: JSX.Element[] = [];
                    for (let h = firstHour; h <= lastHour; h++) {
                      const pct = ((h * 60 - timelineBounds.first) / timelineBounds.span) * 100;
                      if (pct <= 0 || pct >= 100) continue;
                      ticks.push(
                        <div
                          key={`tick-${h}`}
                          className="absolute top-0 h-full w-px bg-border/40 pointer-events-none"
                          style={{ left: `${pct}%` }}
                        />,
                      );
                    }
                    return ticks;
                  })()}
                </div>
                {/* Hour labels below bar */}
                <div className="relative h-3 w-full mt-0.5">
                  {(() => {
                    const firstHour = Math.ceil(timelineBounds.first / 60);
                    const lastHour = Math.floor(timelineBounds.last / 60);
                    const labels: JSX.Element[] = [];
                    for (let h = firstHour; h <= lastHour; h++) {
                      const pct = ((h * 60 - timelineBounds.first) / timelineBounds.span) * 100;
                      if (pct <= 1 || pct >= 99) continue;
                      labels.push(
                        <span
                          key={`lbl-${h}`}
                          className="absolute text-[9px] text-muted-foreground/60 -translate-x-1/2"
                          style={{ left: `${pct}%` }}
                        >
                          {String(h).padStart(2, "0")}:00
                        </span>,
                      );
                    }
                    return labels;
                  })()}
                </div>
                <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500/80" /> Approved</span>
                  <span className="inline-flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-primary/70" /> Pending</span>
                  <span className="inline-flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-muted-foreground/35" /> No rec</span>
                  <span className="inline-flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-500/70" /> Shifted</span>
                </div>
              </div>
            )}

            {/* Recommendation progress bar */}
            {totalRunRecommendationCount > 0 && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 font-medium text-foreground/80">
                    <Sparkles className="h-3 w-3 text-primary" />
                    Recommendation progress
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {approvedRunRecommendationCount} / {totalRunRecommendationCount} approved
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                    style={{
                      width: `${totalRunRecommendationCount > 0 ? Math.round((approvedRunRecommendationCount / totalRunRecommendationCount) * 100) : 0}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Run list filter tabs */}
            {scheduledRun.length > 0 && (
              <div
                role="group"
                aria-label="Run view filter"
                className="inline-flex items-center rounded-lg border border-border/60 bg-background/80 p-0.5 self-start"
              >
                {(
                  [
                    { id: "all", label: `All (${scheduledRun.length})` },
                    { id: "recs", label: `Recommendations (${totalRunRecommendationCount})` },
                    { id: "pending", label: `Pending (${pendingRunRecommendationCount})` },
                  ] as const
                ).map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setRunViewFilter(id)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                      runViewFilter === id
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    aria-pressed={runViewFilter === id}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* Run list */}
            {scheduledRun.length > 0 ? (
              <div className="relative">
                <ScrollArea className="h-[420px] border rounded-xl">
                  <div className="divide-y">
                    {visibleRunEntries.length === 0 ? (
                      <div className="py-10 text-center text-sm text-muted-foreground">
                        {runViewFilter === "pending" ? "All recommendations in this run have been approved. 🎉" : "No calls match this filter."}
                      </div>
                    ) : (
                      visibleRunEntries.map((entry, listIdx) => {
                        const { call } = entry;
                        // True position in the full run (not filtered index)
                        const trueIdx = scheduledRun.indexOf(entry);
                        const pushed = entry.pushedMinutes > 0;
                        const decision = recommendationDecisions[call.key];
                        const isApproved = decision === "implemented";
                        const isExpanded = expandedCalls.has(call.key);

                        // Idle gap before this entry compared to previous in full (unfiltered) run
                        const prevEntry = trueIdx > 0 ? scheduledRun[trueIdx - 1] : null;
                        const idleGapMinutes = prevEntry
                          ? Math.max(0, entry.effectiveStartMinutes - prevEntry.endMinutes - RUN_TRAVEL_BUFFER_MINUTES)
                          : null;

                        // Time delta: how far the suggested time differs from current planned
                        const timeDeltaMinutes =
                          call.hasRecommendation && call.averagePlannedStartMinutes != null
                            ? Math.round(entry.desiredStartMinutes - call.averagePlannedStartMinutes)
                            : null;
                        const timeDeltaLabel =
                          timeDeltaMinutes === null || timeDeltaMinutes === 0
                            ? null
                            : timeDeltaMinutes > 0
                            ? `+${timeDeltaMinutes}m later`
                            : `${timeDeltaMinutes}m earlier`;

                      return (
                        <div key={`${call.serviceUserKey}-${call.callTypeLabel}-${trueIdx}`}>
                          {/* Idle gap separator — show only when gap ≥ 10 min and it's a visible boundary */}
                          {idleGapMinutes !== null && idleGapMinutes >= 10 && listIdx > 0 && (
                            <div className="flex items-center gap-2 px-4 py-1.5 bg-muted/20">
                              <div className="flex-1 h-px bg-border/50" />
                              <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap flex items-center gap-1">
                                <Timer className="h-3 w-3 inline" />
                                {idleGapMinutes}m free
                              </span>
                              <div className="flex-1 h-px bg-border/50" />
                            </div>
                          )}
                          <div
                            className={`transition-colors ${
                              pushed
                                ? "bg-amber-500/[0.04]"
                                : call.hasRecommendation
                                ? isApproved
                                  ? "bg-emerald-500/[0.03]"
                                  : "bg-primary/[0.02]"
                                : ""
                            }`}
                          >
                          {/* Main row */}
                          <div className="flex items-start gap-3 px-3 py-3">
                            {/* Position circle */}
                            <span
                              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold shrink-0 ring-1 mt-0.5 ${
                                call.hasRecommendation
                                  ? isApproved
                                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30"
                                    : "bg-primary/10 text-primary ring-primary/30"
                                  : "bg-muted text-muted-foreground ring-border/60"
                              }`}
                            >
                              {trueIdx + 1}
                            </span>

                            <div className="flex-1 min-w-0">
                              {/* Name + badges row */}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium truncate">{call.serviceUserName}</span>
                                {call.hasRecommendation && (
                                  <Badge
                                    variant="outline"
                                    className={`px-1.5 py-0 text-[9px] leading-tight shrink-0 ${
                                      isApproved
                                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                        : "border-primary/30 bg-primary/5 text-primary"
                                    }`}
                                  >
                                    {isApproved ? "✓ Approved" : "Pending"}
                                  </Badge>
                                )}
                                {pushed && (
                                  <Badge variant="outline" className="px-1.5 py-0 text-[9px] leading-tight shrink-0 border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-500/10">
                                    +{entry.pushedMinutes}m shifted
                                  </Badge>
                                )}
                              </div>

                              {/* Sub-line */}
                              <div className="text-[11px] text-muted-foreground mt-0.5">
                                {call.callTypeLabel} · {call.timeBandLabel} · {entry.durationMinutes} min
                                {call.serviceUserArea && ` · ${call.serviceUserArea}`}
                              </div>

                              {/* Inline recommendation detail for calls with recs */}
                              {call.hasRecommendation && (
                                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                                  <span className="flex items-center gap-1 text-muted-foreground">
                                    <Clock className="h-3 w-3 text-primary/70 shrink-0" />
                                    Suggested:
                                    <span className="font-mono font-semibold text-primary ml-0.5">
                                      {call.suggestedPlannedTimeLabel ?? formatMinutesToTime(entry.desiredStartMinutes)}
                                    </span>
                                  </span>
                                  {timeDeltaLabel && (
                                    <span className={`font-medium ${timeDeltaMinutes! > 0 ? "text-amber-600 dark:text-amber-400" : "text-sky-600 dark:text-sky-400"}`}>
                                      ({timeDeltaLabel} vs planned)
                                    </span>
                                  )}
                                  {call.offsetConsistency != null && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="flex items-center gap-0.5 text-muted-foreground cursor-default">
                                          <TrendingUp className="h-3 w-3" />
                                          {Math.round(call.offsetConsistency * 100)}% consistent
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent side="bottom" className="text-[11px]">
                                        This care worker visits at a consistent offset {Math.round(call.offsetConsistency * 100)}% of the time.
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                              )}

                              {/* Top advice line inline */}
                              {call.hasRecommendation && call.advice.length > 0 && (
                                <div className="mt-1.5 flex items-start gap-1.5">
                                  <Lightbulb className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                                  <span className="text-[11px] text-foreground/75 leading-relaxed line-clamp-2">
                                    {call.advice[0]}
                                  </span>
                                  {call.advice.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => toggleCallExpanded(call.key)}
                                      className="shrink-0 flex items-center gap-0.5 text-[10px] text-primary font-medium hover:underline"
                                    >
                                      {isExpanded ? (
                                        <><ChevronDown className="h-3 w-3" />Less</>
                                      ) : (
                                        <><ChevronRight className="h-3 w-3" />+{call.advice.length - 1} more</>
                                      )}
                                    </button>
                                  )}
                                </div>
                              )}

                              {/* Expanded advice list */}
                              {isExpanded && call.advice.length > 1 && (
                                <div className="mt-1.5 space-y-1 pl-4 border-l-2 border-primary/20">
                                  {call.advice.slice(1).map((tip, ti) => (
                                    <div key={ti} className="flex items-start gap-1.5">
                                      <Lightbulb className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
                                      <span className="text-[11px] text-foreground/70 leading-relaxed">{tip}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Right: time + approve */}
                            <div className="text-right shrink-0 space-y-1 min-w-[120px]">
                              <div className={`text-sm font-mono font-semibold tabular-nums ${
                                pushed ? "text-amber-700 dark:text-amber-300" : call.hasRecommendation ? "text-primary" : "text-foreground"
                              }`}>
                                {formatMinutesToTime(entry.effectiveStartMinutes)}
                                <span className="text-muted-foreground"> → </span>
                                {formatMinutesToTime(entry.endMinutes)}
                              </div>
                              {call.serviceUserAddress && (
                                <div className="text-[10px] text-muted-foreground/80 truncate" title={call.serviceUserAddress}>
                                  <MapPin className="inline h-2.5 w-2.5 mr-0.5 align-text-bottom" />
                                  {call.serviceUserAddress}
                                </div>
                              )}
                              {call.hasRecommendation && !isPilotUser && (
                                <div className="flex justify-end pt-1">
                                  {isApproved ? (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 px-2.5 text-[11px] text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
                                      onClick={() => recordRecommendationDecision(call, null)}
                                    >
                                      <CheckCircle2 className="h-3 w-3 mr-1" />
                                      Approved
                                    </Button>
                                  ) : (
                                    <Button
                                      type="button"
                                      variant="default"
                                      size="sm"
                                      className="h-7 gap-1 px-2.5 text-[11px]"
                                      onClick={() => recordRecommendationDecision(call, "implemented")}
                                    >
                                      <CheckCircle2 className="h-3 w-3" />
                                      Approve
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
              {/* Sticky bulk-approve bar — shown when pending recs exist */}
              {pendingRunRecommendationCount > 0 && !isPilotUser && (
                <div className="absolute bottom-0 inset-x-0 rounded-b-xl border-t border-border/60 bg-background/95 backdrop-blur-sm px-3 py-2 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-muted-foreground">
                      <span className="font-semibold text-foreground">{pendingRunRecommendationCount}</span> recommendation{pendingRunRecommendationCount === 1 ? "" : "s"} pending approval
                    </p>
                  </div>
                  {decisionHistory.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 text-[11px] shrink-0"
                      onClick={undoLastDecision}
                      title={`Undo last decision (${decisionHistory.length} step${decisionHistory.length === 1 ? "" : "s"} in history)`}
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      Undo
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 gap-1.5 text-[11px] shrink-0"
                    onClick={approveCurrentRunRecommendations}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Approve all
                  </Button>
                </div>
              )}
            </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-14 text-center gap-3 rounded-xl border border-dashed border-border/60 bg-background/40">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <ListOrdered className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">No run built yet</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                    Select one or more service users from the left panel — calls are sorted end‑to‑end with no overlap.
                  </p>
                </div>
                {serviceUsersWithRecs.length > 0 && (
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs border-primary/30 text-primary" onClick={handleSelectWithRecs}>
                    <Zap className="h-3.5 w-3.5" />
                    Quick-select {serviceUsersWithRecs.length} users with recs
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      </TooltipProvider>
    </div>
  );
}
