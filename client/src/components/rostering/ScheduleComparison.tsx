import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GitCompare, TrendingUp, TrendingDown, Minus, CheckCircle2, XCircle, Loader2, ArrowRight } from "lucide-react";
import { useMutation } from "@tanstack/react-query";

interface WorkerStats {
  name: string;
  calls: number;
  minutes: number;
}

interface ScheduleComparisonProps {
  workbookId: number;
  beforeSchedule: {
    workers: WorkerStats[];
    conflicts: number;
    travelGaps: number;
    timestamp?: string;
  };
  afterSchedule: {
    workers: WorkerStats[];
    conflicts: number;
    travelGaps: number;
    timestamp?: string;
  };
  changes: {
    timeShifts: number;
    reassignments: number;
    deletions: number;
  };
}

interface ComparisonResult {
  improvementScore: number;
  summary: string;
  metrics: {
    conflictChange: number;
    travelGapChange: number;
    workloadBalance: {
      before: number;
      after: number;
      improvement: number;
    };
  };
  workerImpact: Array<{
    workerName: string;
    callsDelta: number;
    minutesDelta: number;
    impact: "positive" | "neutral" | "negative";
    note: string;
  }>;
  recommendation: string;
}

export default function ScheduleComparison(props: ScheduleComparisonProps) {
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);

  const compareMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/admin/rostering/workbooks/${props.workbookId}/compare-schedules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          beforeSchedule: props.beforeSchedule,
          afterSchedule: props.afterSchedule,
          changes: props.changes,
        }),
      });
      if (!response.ok) throw new Error("Comparison failed");
      return response.json();
    },
    onSuccess: (data) => {
      setComparison(data);
    },
  });

  const getScoreColor = (score: number) => {
    if (score >= 40) return "text-green-600";
    if (score >= 10) return "text-blue-600";
    if (score >= -9) return "text-gray-600";
    if (score >= -39) return "text-orange-600";
    return "text-red-600";
  };

  const getScoreIcon = (score: number) => {
    if (score >= 10) return <TrendingUp className="h-5 w-5 text-green-600" />;
    if (score >= -9) return <Minus className="h-5 w-5 text-gray-600" />;
    return <TrendingDown className="h-5 w-5 text-red-600" />;
  };

  const getDeltaDisplay = (delta: number, suffix: string = "") => {
    if (delta === 0) return <span className="text-gray-500">—</span>;
    const sign = delta > 0 ? "+" : "";
    const color = delta > 0 ? "text-red-600" : "text-green-600";
    return <span className={`font-semibold ${color}`}>{sign}{delta}{suffix}</span>;
  };

  const getImpactBadge = (impact: string) => {
    const variants = {
      positive: "default",
      neutral: "secondary",
      negative: "destructive",
    } as const;
    return <Badge variant={variants[impact as keyof typeof variants] || "secondary"}>{impact}</Badge>;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <GitCompare className="h-5 w-5 text-blue-600" />
                Schedule Comparison
              </CardTitle>
              <CardDescription>
                AI-powered before/after analysis with GPT-5.2
              </CardDescription>
            </div>
            <Button 
              onClick={() => compareMutation.mutate()} 
              disabled={compareMutation.isPending}
              className="gap-2"
            >
              {compareMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <GitCompare className="h-4 w-4" />
                  Compare Schedules
                </>
              )}
            </Button>
          </div>
        </CardHeader>

        {comparison && (
          <CardContent>
            <Tabs defaultValue="summary" className="space-y-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="metrics">Metrics</TabsTrigger>
                <TabsTrigger value="impact">Worker Impact</TabsTrigger>
              </TabsList>

              <TabsContent value="summary" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Improvement Score</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2">
                        {getScoreIcon(comparison.improvementScore)}
                        <span className={`text-3xl font-semibold ${getScoreColor(comparison.improvementScore)}`}>
                          {comparison.improvementScore > 0 ? "+" : ""}{comparison.improvementScore}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {comparison.improvementScore >= 40 && "Excellent improvement"}
                        {comparison.improvementScore >= 10 && comparison.improvementScore < 40 && "Good improvement"}
                        {comparison.improvementScore >= -9 && comparison.improvementScore < 10 && "Neutral change"}
                        {comparison.improvementScore < -9 && "Degradation detected"}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Changes Made</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-1">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Time shifts:</span>
                        <span className="font-semibold">{props.changes.timeShifts}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Reassignments:</span>
                        <span className="font-semibold">{props.changes.reassignments}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Deletions:</span>
                        <span className="font-semibold">{props.changes.deletions}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Quick Stats</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-1">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Workers:</span>
                        <span className="font-semibold">{props.afterSchedule.workers.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total calls:</span>
                        <span className="font-semibold">
                          {props.afterSchedule.workers.reduce((sum, w) => sum + w.calls, 0)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total hours:</span>
                        <span className="font-semibold">
                          {Math.round(props.afterSchedule.workers.reduce((sum, w) => sum + w.minutes, 0) / 60)}h
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Alert className={comparison.improvementScore >= 10 ? "border-green-500" : comparison.improvementScore < -9 ? "border-red-500" : ""}>
                  <AlertDescription>
                    <p className="font-semibold mb-2">{comparison.summary}</p>
                    <p className="text-sm text-muted-foreground">{comparison.recommendation}</p>
                  </AlertDescription>
                </Alert>
              </TabsContent>

              <TabsContent value="metrics" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Schedule Quality</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Conflicts</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">{props.beforeSchedule.conflicts}</span>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-semibold">{props.afterSchedule.conflicts}</span>
                          {getDeltaDisplay(comparison.metrics.conflictChange)}
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Travel gaps</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">{props.beforeSchedule.travelGaps}</span>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-semibold">{props.afterSchedule.travelGaps}</span>
                          {getDeltaDisplay(comparison.metrics.travelGapChange)}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Workload Balance</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Before</span>
                        <span className="text-sm text-muted-foreground">
                          {comparison.metrics.workloadBalance.before.toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">After</span>
                        <span className="text-sm font-semibold">
                          {comparison.metrics.workloadBalance.after.toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t">
                        <span className="text-sm font-semibold">Improvement</span>
                        {getDeltaDisplay(comparison.metrics.workloadBalance.improvement, "%")}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="impact" className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Worker</TableHead>
                      <TableHead className="text-right">Calls Change</TableHead>
                      <TableHead className="text-right">Time Change</TableHead>
                      <TableHead>Impact</TableHead>
                      <TableHead>Note</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comparison.workerImpact.map((worker, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{worker.workerName}</TableCell>
                        <TableCell className="text-right">
                          {getDeltaDisplay(worker.callsDelta)}
                        </TableCell>
                        <TableCell className="text-right">
                          {getDeltaDisplay(Math.round(worker.minutesDelta / 60 * 10) / 10, "h")}
                        </TableCell>
                        <TableCell>{getImpactBadge(worker.impact)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {worker.note}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>
            </Tabs>
          </CardContent>
        )}

        {compareMutation.isError && (
          <CardContent>
            <Alert variant="destructive">
              <AlertDescription>
                Failed to compare schedules. Please try again.
              </AlertDescription>
            </Alert>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
