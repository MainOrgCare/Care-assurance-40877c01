import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, Trophy, FileText, Users, CheckCircle2, Search, ArrowUpDown, Download, Eye, X, BarChart3, TrendingUp, AlertTriangle, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface CareWorkerDiscrepancy {
  date: string;
  type: string;
  issue: string;
  auditId: string;
}

interface CareWorkerFromAudits {
  name: string;
  auditCount: number;
  discrepancyCount: number;
  discrepancies: CareWorkerDiscrepancy[];
  lastSeen: string;
}

interface TrainingRecommendation {
  topic: string;
  assignedTo: string[];
  reason: string;
}

type SortField = "name" | "compliance" | "audits" | "discrepancies";
type SortDirection = "asc" | "desc";
type FilterTab = "all" | "compliant" | "at-risk" | "critical";

export default function Performance() {
  const { toast } = useToast();
  const [careWorkers, setCareWorkers] = useState<CareWorkerFromAudits[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<SortField>("compliance");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [selectedWorker, setSelectedWorker] = useState<CareWorkerFromAudits | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/audits/care-workers", { credentials: "include" });
        if (!res.ok) throw new Error("Failed to fetch data");
        const workers: CareWorkerFromAudits[] = await res.json();
        if (!cancelled) setCareWorkers(workers);
      } catch (error: any) {
        if (!cancelled) {
          toast({ title: "Error", description: error.message || "Failed to load performance data", variant: "destructive" });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [toast]);

  const getCompliancePercentage = useCallback((worker: CareWorkerFromAudits): number => {
    if (worker.auditCount === 0) return 100;
    const complianceRatio = Math.max(0, 1 - (worker.discrepancyCount / (worker.auditCount + worker.discrepancyCount)));
    return Math.round(complianceRatio * 100);
  }, []);

  const getRiskLevel = useCallback((worker: CareWorkerFromAudits): "compliant" | "at-risk" | "critical" => {
    const pct = getCompliancePercentage(worker);
    if (pct >= 100 && worker.discrepancyCount === 0) return "compliant";
    if (worker.discrepancyCount >= 3 || pct < 70) return "critical";
    return "at-risk";
  }, [getCompliancePercentage]);

  const filteredAndSortedWorkers = useMemo(() => {
    let result = [...careWorkers];

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(w => w.name.toLowerCase().includes(term));
    }

    // Tab filter
    if (filterTab !== "all") {
      result = result.filter(w => getRiskLevel(w) === filterTab);
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name": cmp = a.name.localeCompare(b.name); break;
        case "compliance": cmp = getCompliancePercentage(a) - getCompliancePercentage(b); break;
        case "audits": cmp = a.auditCount - b.auditCount; break;
        case "discrepancies": cmp = a.discrepancyCount - b.discrepancyCount; break;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return result;
  }, [careWorkers, searchTerm, filterTab, sortField, sortDirection, getCompliancePercentage, getRiskLevel]);

  const stats = useMemo(() => {
    const total = careWorkers.length;
    const compliant = careWorkers.filter(w => w.discrepancyCount === 0).length;
    const atRisk = careWorkers.filter(w => w.discrepancyCount > 0 && w.discrepancyCount < 3).length;
    const critical = careWorkers.filter(w => w.discrepancyCount >= 3).length;
    const avgCompliance = total > 0
      ? Math.round(careWorkers.reduce((sum, w) => sum + getCompliancePercentage(w), 0) / total)
      : 0;
    const totalAudits = careWorkers.reduce((sum, w) => sum + w.auditCount, 0);
    const totalDiscrepancies = careWorkers.reduce((sum, w) => sum + w.discrepancyCount, 0);
    return { total, compliant, atRisk, critical, avgCompliance, totalAudits, totalDiscrepancies };
  }, [careWorkers, getCompliancePercentage]);

  const getTrainingRecommendations = (): TrainingRecommendation[] => {
    const recommendations: TrainingRecommendation[] = [];
    const topicMap = new Map<string, Set<string>>();
    for (const worker of careWorkers) {
      for (const disc of worker.discrepancies) {
        const topic = disc.type === "EMAR"
          ? "Medication Administration & EMAR Compliance"
          : "Visit Compliance & Call Monitoring";
        if (!topicMap.has(topic)) topicMap.set(topic, new Set());
        topicMap.get(topic)!.add(worker.name);
      }
    }
    topicMap.forEach((names, topic) => {
      if (names.size > 0) {
        recommendations.push({ topic, assignedTo: Array.from(names), reason: `Based on ${names.size} staff member(s) with related discrepancies` });
      }
    });
    return recommendations;
  };

  const handleExportCSV = useCallback(() => {
    if (careWorkers.length === 0) return;
    const headers = ["Name", "Audits", "Discrepancies", "Compliance %", "Risk Level", "Last Seen"];
    const rows = careWorkers.map(w => [
      w.name,
      w.auditCount.toString(),
      w.discrepancyCount.toString(),
      getCompliancePercentage(w).toString() + "%",
      getRiskLevel(w),
      w.lastSeen || "N/A",
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `staff-performance-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: `${careWorkers.length} staff records exported to CSV.` });
  }, [careWorkers, getCompliancePercentage, getRiskLevel, toast]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const trainingRecommendations = getTrainingRecommendations();

  const getComplianceColor = (pct: number) => {
    if (pct >= 90) return "text-success";
    if (pct >= 70) return "text-amber-500";
    return "text-destructive";
  };

  const getComplianceBarColor = (pct: number) => {
    if (pct >= 90) return "bg-success";
    if (pct >= 70) return "bg-warning";
    return "bg-destructive";
  };

  return (
    <div className="page-shell">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 animate-slide-up stagger-1">
        <div className="space-y-1">
          <h1 className="page-title leading-tight">Staff Performance</h1>
          <p className="page-subtitle">Training recommendations and compliance statistics derived from operational auditing.</p>
        </div>
        {careWorkers.length > 0 && (
          <Button variant="outline" onClick={handleExportCSV} className="shrink-0">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground animate-pulse">
          <BookOpen className="h-12 w-12 mb-4 opacity-20" />
          <p className="font-semibold tracking-widest text-xs uppercase">Synthesizing performance data...</p>
        </div>
      ) : careWorkers.length === 0 ? (
        <Card className="animate-slide-up stagger-2 mt-6">
          <CardContent className="py-24">
            <div className="text-center space-y-4">
              <div className="h-16 w-16 rounded-xl bg-muted/30 flex items-center justify-center mx-auto mb-4">
                <FileText className="h-7 w-7 text-muted-foreground/40" />
              </div>
              <h3 className="text-lg font-bold tracking-tight text-foreground">Operational Data Missing</h3>
              <p className="text-[0.8125rem] font-medium text-muted-foreground max-w-md mx-auto leading-relaxed">
                Staff metrics require baseline audit data. Complete EMAR or Visit audits to populate the intelligence hub.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6 animate-slide-up stagger-2 mt-6">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <Card className="col-span-1">
              <CardContent className="p-3.5 text-center">
                <p className="text-2xl font-bold tracking-tight text-foreground tabular-nums">{stats.total}</p>
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Total Staff</p>
              </CardContent>
            </Card>
            <Card className="col-span-1">
              <CardContent className="p-3.5 text-center">
                <p className={cn("text-2xl font-bold tracking-tight tabular-nums", stats.avgCompliance >= 90 ? "text-success" : stats.avgCompliance >= 70 ? "text-amber-500" : "text-destructive")}>
                  {stats.avgCompliance}%
                </p>
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Avg Compliance</p>
              </CardContent>
            </Card>
            <Card className="col-span-1">
              <CardContent className="p-3.5 text-center">
                <p className="text-2xl font-bold tracking-tight text-primary tabular-nums">{stats.totalAudits}</p>
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Total Audits</p>
              </CardContent>
            </Card>
            <Card className="col-span-1">
              <CardContent className="p-3.5 text-center">
                <p className="text-2xl font-bold tracking-tight text-destructive tabular-nums">{stats.totalDiscrepancies}</p>
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Discrepancies</p>
              </CardContent>
            </Card>
            <Card className="col-span-1">
              <CardContent className="p-3.5 text-center">
                <p className="text-2xl font-bold tracking-tight text-success tabular-nums">{stats.compliant}</p>
                <p className="text-[9px] font-bold text-success uppercase tracking-widest mt-0.5">Compliant</p>
              </CardContent>
            </Card>
            <Card className="col-span-1">
              <CardContent className="p-3.5 text-center">
                <p className="text-2xl font-bold tracking-tight text-amber-500 tabular-nums">{stats.atRisk}</p>
                <p className="text-[9px] font-bold text-amber-500 uppercase tracking-widest mt-0.5">At Risk</p>
              </CardContent>
            </Card>
            <Card className="col-span-1">
              <CardContent className="p-3.5 text-center">
                <p className="text-2xl font-bold tracking-tight text-destructive tabular-nums">{stats.critical}</p>
                <p className="text-[9px] font-bold text-destructive uppercase tracking-widest mt-0.5">Critical</p>
              </CardContent>
            </Card>
          </div>

          {/* Compliance Distribution Bar */}
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border/30 pb-4">
              <CardTitle className="flex items-center gap-3 text-sm">
                <div className="h-7 w-7 rounded-md flex items-center justify-center bg-primary/8">
                  <BarChart3 className="h-3.5 w-3.5 text-primary" />
                </div>
                Compliance Distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              <div className="flex items-center gap-1 h-8 rounded-lg overflow-hidden bg-muted/30">
                {stats.total > 0 && (
                  <>
                    <div
                      className="h-full bg-success transition-all duration-700 flex items-center justify-center text-success-foreground text-[10px] font-bold"
                      style={{ width: `${(stats.compliant / stats.total) * 100}%`, minWidth: stats.compliant > 0 ? '2rem' : '0' }}
                    >
                      {stats.compliant > 0 && stats.compliant}
                    </div>
                    <div
                      className="h-full bg-warning transition-all duration-700 flex items-center justify-center text-warning-foreground text-[10px] font-bold"
                      style={{ width: `${(stats.atRisk / stats.total) * 100}%`, minWidth: stats.atRisk > 0 ? '2rem' : '0' }}
                    >
                      {stats.atRisk > 0 && stats.atRisk}
                    </div>
                    <div
                      className="h-full bg-destructive transition-all duration-700 flex items-center justify-center text-destructive-foreground text-[10px] font-bold"
                      style={{ width: `${(stats.critical / stats.total) * 100}%`, minWidth: stats.critical > 0 ? '2rem' : '0' }}
                    >
                      {stats.critical > 0 && stats.critical}
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center gap-6 mt-3">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-success" />
                  <span className="text-xs text-muted-foreground">Compliant</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-warning" />
                  <span className="text-xs text-muted-foreground">At Risk (1-2 issues)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-destructive" />
                  <span className="text-xs text-muted-foreground">Critical (3+ issues)</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Staff Table with Search, Filter, Sort */}
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border/30 pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <CardTitle className="flex items-center gap-3 text-sm">
                  <div className="h-7 w-7 rounded-md flex items-center justify-center bg-teal-500/8">
                    <Users className="h-3.5 w-3.5 text-teal-500" />
                  </div>
                  Staff Roster ({filteredAndSortedWorkers.length})
                </CardTitle>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search staff..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="pl-9 h-9 w-48 text-sm"
                      aria-label="Search staff by name"
                    />
                    {searchTerm && (
                      <button onClick={() => setSearchTerm("")} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <Tabs value={filterTab} onValueChange={v => setFilterTab(v as FilterTab)} className="mt-3">
                <TabsList className="bg-muted/30 border border-border/50 h-9">
                  <TabsTrigger value="all" className="text-xs font-medium">All ({stats.total})</TabsTrigger>
                  <TabsTrigger value="compliant" className="text-xs font-medium">Compliant ({stats.compliant})</TabsTrigger>
                  <TabsTrigger value="at-risk" className="text-xs font-medium">At Risk ({stats.atRisk})</TabsTrigger>
                  <TabsTrigger value="critical" className="text-xs font-medium">Critical ({stats.critical})</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent className="p-0">
              {/* Table Header */}
              <div role="row" className="grid grid-cols-12 gap-2 px-5 py-3 bg-muted/20 border-b border-border/40 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <button onClick={() => toggleSort("name")} aria-sort={sortField === "name" ? (sortDirection === "asc" ? "ascending" : "descending") : undefined} className="col-span-4 flex items-center gap-1 hover:text-foreground transition-colors text-left">
                  Name <ArrowUpDown className="h-3 w-3" />
                </button>
                <button onClick={() => toggleSort("compliance")} aria-sort={sortField === "compliance" ? (sortDirection === "asc" ? "ascending" : "descending") : undefined} className="col-span-3 flex items-center gap-1 hover:text-foreground transition-colors text-left">
                  Compliance <ArrowUpDown className="h-3 w-3" />
                </button>
                <button onClick={() => toggleSort("audits")} aria-sort={sortField === "audits" ? (sortDirection === "asc" ? "ascending" : "descending") : undefined} className="col-span-2 flex items-center gap-1 hover:text-foreground transition-colors text-left">
                  Audits <ArrowUpDown className="h-3 w-3" />
                </button>
                <button onClick={() => toggleSort("discrepancies")} aria-sort={sortField === "discrepancies" ? (sortDirection === "asc" ? "ascending" : "descending") : undefined} className="col-span-2 flex items-center gap-1 hover:text-foreground transition-colors text-left">
                  Issues <ArrowUpDown className="h-3 w-3" />
                </button>
                <div className="col-span-1 text-right">Detail</div>
              </div>

              {/* Table Rows */}
              <div className="divide-y divide-border/30 max-h-[480px] overflow-y-auto">
                {filteredAndSortedWorkers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <div className="h-12 w-12 rounded-xl bg-muted/40 flex items-center justify-center mb-3">
                      <Search className="h-5 w-5 text-muted-foreground/40" />
                    </div>
                    <p className="text-[0.8125rem] font-medium">No staff match current filters</p>
                  </div>
                ) : (
                  filteredAndSortedWorkers.map(worker => {
                    const pct = getCompliancePercentage(worker);
                    const risk = getRiskLevel(worker);
                    return (
                      <div
                        key={worker.name}
                        role="button"
                        tabIndex={0}
                        className="grid grid-cols-12 gap-2 px-5 py-3.5 items-center hover:bg-muted/20 focus-visible:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-inset transition-colors group cursor-pointer"
                        onClick={() => setSelectedWorker(worker)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedWorker(worker); } }}
                        data-testid={`worker-row-${worker.name.replace(/\s/g, '-')}`}
                      >
                        <div className="col-span-4 flex items-center gap-3">
                          <div className={cn(
                            "h-8 w-8 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0",
                            risk === "compliant" ? "bg-success/10 text-success" :
                            risk === "at-risk" ? "bg-warning/20 text-warning" :
                            "bg-destructive/10 text-destructive"
                          )}>
                            {worker.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">{worker.name}</p>
                            {worker.lastSeen && (
                              <p className="text-[10px] text-muted-foreground">Last seen: {new Date(worker.lastSeen).toLocaleDateString("en-GB")}</p>
                            )}
                          </div>
                        </div>
                        <div className="col-span-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-muted/40 rounded-full overflow-hidden">
                              <div
                                className={cn("h-full rounded-full transition-all duration-700", getComplianceBarColor(pct))}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className={cn("text-xs font-bold tabular-nums min-w-[3ch]", getComplianceColor(pct))}>{pct}%</span>
                          </div>
                        </div>
                        <div className="col-span-2">
                          <span className="text-sm font-semibold text-foreground">{worker.auditCount}</span>
                        </div>
                        <div className="col-span-2 flex items-center gap-2">
                          <span className={cn("text-sm font-semibold", worker.discrepancyCount === 0 ? "text-success" : "text-destructive")}>
                            {worker.discrepancyCount}
                          </span>
                          {risk !== "compliant" && (
                            <Badge variant="outline" className={cn(
                              "text-[9px] font-bold tracking-wider px-1.5 py-0",
                              risk === "at-risk" ? "border-amber-500/30 text-amber-600" : "border-destructive/30 text-destructive"
                            )}>
                              {risk === "at-risk" ? "RISK" : "CRITICAL"}
                            </Badge>
                          )}
                        </div>
                        <div className="col-span-1 flex justify-end">
                          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>

          {/* Training & Top Performers */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="overflow-hidden">
              <CardHeader className="border-b border-border/30 pb-4">
                <CardTitle className="flex items-center gap-3">
                  <div className="h-7 w-7 rounded-md flex items-center justify-center bg-warning/15">
                    <Trophy className="h-3.5 w-3.5 text-amber-500" />
                  </div>
                  Top Performers
                </CardTitle>
                <CardDescription className="text-[11px] font-medium">Staff achieving 100% compliance across all vectors.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                {stats.compliant === 0 ? (
                  <div className="text-center py-12 bg-muted/10 rounded-xl border border-dashed border-border/60">
                    <div className="h-12 w-12 rounded-xl bg-muted/40 flex items-center justify-center mx-auto mb-3">
                      <Users className="h-5 w-5 text-muted-foreground/40" />
                    </div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">No candidates identified</p>
                  </div>
                ) : (
                  <ul className="space-y-2 max-h-[300px] overflow-y-auto">
                    {careWorkers.filter(w => w.discrepancyCount === 0 && w.auditCount > 0).map(worker => (
                      <li
                        key={worker.name}
                        className="flex justify-between items-center p-4 bg-muted/20 hover:bg-muted/30 border border-border/40 rounded-xl transition-colors group cursor-pointer"
                        onClick={() => setSelectedWorker(worker)}
                        data-testid={`performer-${worker.name.replace(/\s/g, '-')}`}
                      >
                        <span className="text-sm font-medium tracking-tight text-foreground group-hover:text-primary transition-colors">{worker.name}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-black text-muted-foreground uppercase tracking-tighter">{worker.auditCount} AUDITS</span>
                          <Badge className="bg-success/15 text-success border-success/20 rounded-lg font-black text-[10px]">100%</Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader className="border-b border-border/30 pb-4">
                <CardTitle className="flex items-center gap-3">
                  <div className="h-7 w-7 rounded-md flex items-center justify-center bg-primary/8">
                    <BookOpen className="h-3.5 w-3.5 text-primary" />
                  </div>
                  Targeted Training
                </CardTitle>
                <CardDescription className="text-[11px] font-medium">Auto-generated learning pathways based on discrepancy themes.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                {trainingRecommendations.length === 0 ? (
                  <div className="text-center py-12 bg-muted/10 rounded-xl border border-dashed border-border/60">
                    <div className="h-12 w-12 rounded-xl bg-success/8 flex items-center justify-center mx-auto mb-3">
                      <CheckCircle2 className="h-5 w-5 text-success/50" />
                    </div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">No gaps detected</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {trainingRecommendations.map((rec, idx) => (
                      <div
                        key={rec.topic}
                        className="p-4 bg-primary/5 border border-primary/10 rounded-xl group hover:bg-primary/10 transition-colors"
                        data-testid={`training-${idx}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="h-8 w-8 rounded-lg bg-background flex items-center justify-center border border-primary/20 shrink-0 mt-0.5">
                            <BookOpen className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-foreground text-sm tracking-tight mb-1">{rec.topic}</h4>
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                              Assigned: {rec.assignedTo.join(", ")}
                            </p>
                            <div className="flex items-center gap-2 text-xs font-medium text-primary">
                              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                              {rec.reason}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Worker Detail Dialog */}
      <Dialog open={!!selectedWorker} onOpenChange={open => !open && setSelectedWorker(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {selectedWorker && (
                <>
                  <div className={cn(
                    "h-10 w-10 rounded-xl flex items-center justify-center text-sm font-bold",
                    getRiskLevel(selectedWorker) === "compliant" ? "bg-success/10 text-success" :
                    getRiskLevel(selectedWorker) === "at-risk" ? "bg-warning/20 text-warning" :
                    "bg-destructive/10 text-destructive"
                  )}>
                    {selectedWorker.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                  </div>
                  {selectedWorker.name}
                </>
              )}
            </DialogTitle>
            <DialogDescription>Detailed performance breakdown and discrepancy log.</DialogDescription>
          </DialogHeader>
          {selectedWorker && (
            <div className="space-y-5 py-2">
              {/* Quick Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 bg-muted/20 rounded-xl border border-border/40">
                  <p className={cn("text-2xl font-black", getComplianceColor(getCompliancePercentage(selectedWorker)))}>{getCompliancePercentage(selectedWorker)}%</p>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Compliance</p>
                </div>
                <div className="text-center p-3 bg-muted/20 rounded-xl border border-border/40">
                  <p className="text-2xl font-black text-primary">{selectedWorker.auditCount}</p>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Audits</p>
                </div>
                <div className="text-center p-3 bg-muted/20 rounded-xl border border-border/40">
                  <p className={cn("text-2xl font-black", selectedWorker.discrepancyCount === 0 ? "text-success" : "text-destructive")}>{selectedWorker.discrepancyCount}</p>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Issues</p>
                </div>
              </div>

              {/* Compliance Bar */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-muted-foreground">Compliance Rate</span>
                  <span className={cn("text-xs font-bold", getComplianceColor(getCompliancePercentage(selectedWorker)))}>
                    {getCompliancePercentage(selectedWorker)}%
                  </span>
                </div>
                <div className="h-3 bg-muted/40 rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all duration-700", getComplianceBarColor(getCompliancePercentage(selectedWorker)))}
                    style={{ width: `${getCompliancePercentage(selectedWorker)}%` }}
                  />
                </div>
              </div>

              {/* Discrepancy Log */}
              {selectedWorker.discrepancies.length > 0 ? (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                    Discrepancy Log ({selectedWorker.discrepancies.length})
                  </h4>
                  <div className="space-y-2 max-h-[240px] overflow-y-auto">
                    {selectedWorker.discrepancies.map((disc, i) => (
                      <div key={i} className="p-3 bg-destructive/5 border border-destructive/10 rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <Badge variant="outline" className="text-[9px] font-bold border-destructive/20 text-destructive">{disc.type}</Badge>
                          <span className="text-[10px] text-muted-foreground">{new Date(disc.date).toLocaleDateString("en-GB")}</span>
                        </div>
                        <p className="text-xs text-foreground leading-relaxed">{disc.issue}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 bg-success/5 rounded-xl border border-success/10">
                  <CheckCircle2 className="h-8 w-8 text-success mx-auto mb-2" />
                  <p className="text-sm font-semibold text-success">No discrepancies recorded</p>
                  <p className="text-xs text-muted-foreground mt-1">This staff member has a clean record.</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
