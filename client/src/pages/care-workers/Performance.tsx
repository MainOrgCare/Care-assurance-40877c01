import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Trophy, FileText, Users } from "lucide-react";
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
      .filter(w => w.discrepancyCount === 0 && w.auditCount > 0)
      .slice(0, 5);
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
          assignedTo: Array.from(names).slice(0, 3),
          reason: `Based on ${names.size} staff member(s) with related discrepancies`
        });
      }
    });

    return recommendations;
  };

  const topPerformers = getTopPerformers();
  const trainingRecommendations = getTrainingRecommendations();

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h2 className="text-3xl font-heading font-bold text-foreground">Staff Performance</h2>
        <p className="text-muted-foreground mt-2">
          Training recommendations and compliance statistics from saved audits.
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading performance data...</div>
      ) : careWorkers.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="py-12">
            <div className="text-center space-y-3">
              <FileText className="mx-auto h-16 w-16 text-muted-foreground" />
              <h3 className="text-lg font-medium text-foreground">No Audit Data Available</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                Performance metrics are calculated from saved EMAR and Visit audits. 
                Complete some audits to see performance data here.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="text-yellow-500" /> 
                Top Performers
              </CardTitle>
              <CardDescription>Staff with no discrepancies in audits.</CardDescription>
            </CardHeader>
            <CardContent>
              {topPerformers.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Users className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
                  <p className="text-sm">No fully compliant staff members yet.</p>
                  <p className="text-xs text-muted-foreground mt-1">Staff with zero discrepancies will appear here.</p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {topPerformers.map((worker) => (
                    <li 
                      key={worker.name} 
                      className="flex justify-between items-center p-2 bg-white/5 rounded"
                      data-testid={`performer-${worker.name.replace(/\s/g, '-')}`}
                    >
                      <span className="text-foreground">{worker.name}</span>
                      <Badge className="bg-green-600">
                        {getCompliancePercentage(worker)}%
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="text-blue-500" /> 
                Recommended Training
              </CardTitle>
              <CardDescription>Based on discrepancies in saved audits.</CardDescription>
            </CardHeader>
            <CardContent>
              {trainingRecommendations.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <BookOpen className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
                  <p className="text-sm">No training recommendations.</p>
                  <p className="text-xs text-muted-foreground mt-1">Recommendations appear when discrepancies are found.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {trainingRecommendations.map((rec, idx) => (
                    <div 
                      key={idx} 
                      className="p-3 border border-border rounded-lg"
                      data-testid={`training-${idx}`}
                    >
                      <h4 className="font-medium text-foreground text-sm">{rec.topic}</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        Assigned to: {rec.assignedTo.join(", ")}
                        {rec.assignedTo.length < careWorkers.filter(w => w.discrepancyCount > 0).length && " and others"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">{rec.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="text-teal-500" />
                Staff Summary
              </CardTitle>
              <CardDescription>Overview of all staff from saved audits.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-white/5 rounded-lg text-center">
                  <p className="text-3xl font-bold text-foreground">{careWorkers.length}</p>
                  <p className="text-sm text-muted-foreground">Total Staff</p>
                </div>
                <div className="p-4 bg-white/5 rounded-lg text-center">
                  <p className="text-3xl font-bold text-green-400">
                    {careWorkers.filter(w => w.discrepancyCount === 0).length}
                  </p>
                  <p className="text-sm text-muted-foreground">Fully Compliant</p>
                </div>
                <div className="p-4 bg-white/5 rounded-lg text-center">
                  <p className="text-3xl font-bold text-amber-400">
                    {careWorkers.filter(w => w.discrepancyCount > 0 && w.discrepancyCount < 3).length}
                  </p>
                  <p className="text-sm text-muted-foreground">Minor Issues</p>
                </div>
                <div className="p-4 bg-white/5 rounded-lg text-center">
                  <p className="text-3xl font-bold text-red-400">
                    {careWorkers.filter(w => w.discrepancyCount >= 3).length}
                  </p>
                  <p className="text-sm text-muted-foreground">Needs Attention</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
