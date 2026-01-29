import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Trophy, FileText, Users, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

export default function Performance() {
  const { toast } = useToast();
  const [careWorkers, setCareWorkers] = useState<CareWorkerFromAudits[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const res = await fetch("/api/audits/care-workers", { credentials: "include" });

      if (!res.ok) {
        throw new Error("Failed to fetch data");
      }

      const workers: CareWorkerFromAudits[] = await res.json();
      setCareWorkers(workers);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load performance data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getTopPerformers = (): CareWorkerFromAudits[] => {
    return careWorkers
      .filter(w => w.discrepancyCount === 0 && w.auditCount > 0);
  };

  const getCompliancePercentage = (worker: CareWorkerFromAudits): number => {
    if (worker.auditCount === 0) return 100;
    const complianceRatio = Math.max(0, 1 - (worker.discrepancyCount / (worker.auditCount + worker.discrepancyCount)));
    return Math.round(complianceRatio * 100);
  };

  const getTrainingRecommendations = (): TrainingRecommendation[] => {
    const recommendations: TrainingRecommendation[] = [];
    const topicMap = new Map<string, Set<string>>();

    for (const worker of careWorkers) {
      for (const disc of worker.discrepancies) {
        const topic = disc.type === "EMAR" 
          ? "Medication Administration & EMAR Compliance"
          : "Visit Compliance & Call Monitoring";
        
        if (!topicMap.has(topic)) {
          topicMap.set(topic, new Set());
        }
        topicMap.get(topic)!.add(worker.name);
      }
    }

    topicMap.forEach((names, topic) => {
      if (names.size > 0) {
        recommendations.push({
          topic,
          assignedTo: Array.from(names),
          reason: `Based on ${names.size} staff member(s) with related discrepancies`
        });
      }
    });

    return recommendations;
  };

  const topPerformers = getTopPerformers();
  const trainingRecommendations = getTrainingRecommendations();

  return (
    <div className="page-shell">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 animate-slide-up stagger-1">
        <div className="space-y-1">
          <h1 className="page-title leading-tight">Staff Performance</h1>
          <p className="page-subtitle">Training recommendations and compliance statistics derived from operational auditing.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground animate-pulse">
          <BookOpen className="h-12 w-12 mb-4 opacity-20" />
          <p className="font-bold tracking-widest text-xs uppercase">Synthesizing performance data...</p>
        </div>
      ) : careWorkers.length === 0 ? (
        <Card className="glass-card animate-slide-up stagger-2 mt-6">
          <CardContent className="py-24">
            <div className="text-center space-y-4">
              <div className="h-20 w-20 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-6">
                <FileText className="h-10 w-10 text-muted-foreground/40" />
              </div>
              <h3 className="text-xl font-black tracking-tight text-foreground">Operational Data Missing</h3>
              <p className="text-sm font-medium text-muted-foreground max-w-md mx-auto leading-relaxed">
                Staff metrics require baseline audit data. Complete EMAR or Visit audits to populate the intelligence hub.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-6 animate-slide-up stagger-2 mt-6">
          <Card className="glass-card overflow-hidden">
            <CardHeader className="border-b border-border/40 pb-6">
              <CardTitle className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl flex items-center justify-center bg-amber-500/10 shadow-xs">
                  <Trophy className="h-5 w-5 text-amber-500" />
                </div>
                Top Performers
              </CardTitle>
              <CardDescription className="text-xs font-medium">Staff achieving 100% compliance across all vectors.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {topPerformers.length === 0 ? (
                <div className="text-center py-12 bg-muted/10 rounded-2xl border border-dashed border-border/60">
                  <Users className="mx-auto h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">No candidates identified</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {topPerformers.map((worker) => (
                    <li 
                      key={worker.name} 
                      className="flex justify-between items-center p-4 bg-muted/20 hover:bg-muted/30 border border-border/40 rounded-xl transition-colors group"
                      data-testid={`performer-${worker.name.replace(/\s/g, '-')}`}
                    >
                      <span className="text-sm font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">{worker.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-tighter">{worker.auditCount} AUDITS</span>
                        <Badge className="bg-success/15 text-success border-success/20 rounded-lg font-black text-[10px]">
                          {getCompliancePercentage(worker)}% COMPLIANT
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card overflow-hidden">
            <CardHeader className="border-b border-border/40 pb-6">
              <CardTitle className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl flex items-center justify-center bg-primary/10 shadow-xs">
                  <BookOpen className="h-5 w-5 text-primary" />
                </div>
                Targeted Training
              </CardTitle>
              <CardDescription className="text-xs font-medium">Auto-generated learning pathways based on discrepancy themes.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {trainingRecommendations.length === 0 ? (
                <div className="text-center py-12 bg-muted/10 rounded-2xl border border-dashed border-border/60">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-success/30 mb-3" />
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">No gaps detected</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {trainingRecommendations.map((rec, idx) => (
                    <div 
                      key={idx} 
                      className="p-4 bg-primary/5 border border-primary/10 rounded-xl group hover:bg-primary/10 transition-colors"
                      data-testid={`training-${idx}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="h-8 w-8 rounded-lg bg-background flex items-center justify-center border border-primary/20 shrink-0 mt-0.5">
                          <BookOpen className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <h4 className="font-bold text-foreground text-sm tracking-tight mb-1">{rec.topic}</h4>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                            Assigned: {rec.assignedTo.join(", ")}
                          </p>
                          <div className="flex items-center gap-2 text-xs font-medium text-primary">
                            <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
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

          <Card className="glass-card md:col-span-2 overflow-hidden">
            <CardHeader className="border-b border-border/40 pb-6">
              <CardTitle className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl flex items-center justify-center bg-teal-500/10 shadow-xs">
                  <Users className="h-5 w-5 text-teal-500" />
                </div>
                Fleet Intelligence Summary
              </CardTitle>
              <CardDescription className="text-xs font-medium">Aggregated operational status of the care workforce.</CardDescription>
            </CardHeader>
            <CardContent className="pt-8">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="p-6 bg-muted/20 border border-border/40 rounded-2xl text-center group hover:bg-muted/30 transition-all">
                  <p className="text-4xl font-black tracking-tighter text-foreground group-hover:scale-110 transition-transform">{careWorkers.length}</p>
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mt-2">Active Staff</p>
                </div>
                <div className="p-6 bg-success/5 border border-success/10 rounded-2xl text-center group hover:bg-success/10 transition-all">
                  <p className="text-4xl font-black tracking-tighter text-success group-hover:scale-110 transition-transform">
                    {careWorkers.filter(w => w.discrepancyCount === 0).length}
                  </p>
                  <p className="text-[10px] font-black text-success uppercase tracking-widest mt-2">Elite Status</p>
                </div>
                <div className="p-6 bg-amber-500/5 border border-amber-500/10 rounded-2xl text-center group hover:bg-amber-500/10 transition-all">
                  <p className="text-4xl font-black tracking-tighter text-amber-500 group-hover:scale-110 transition-transform">
                    {careWorkers.filter(w => w.discrepancyCount > 0 && w.discrepancyCount < 3).length}
                  </p>
                  <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mt-2">Minor Drifts</p>
                </div>
                <div className="p-6 bg-destructive/5 border border-destructive/10 rounded-2xl text-center group hover:bg-destructive/10 transition-all">
                  <p className="text-4xl font-black tracking-tighter text-destructive group-hover:scale-110 transition-transform">
                    {careWorkers.filter(w => w.discrepancyCount >= 3).length}
                  </p>
                  <p className="text-[10px] font-black text-destructive uppercase tracking-widest mt-2">Critical Risk</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
