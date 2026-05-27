import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Sparkles, TrendingUp, AlertTriangle, CheckCircle2, Brain, Users, Clock, Target, Loader2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { normalizeApiPayload } from "@/lib/queryClient";

interface ScheduleAnalysisProps {
  workbookId: string;
  workers: Array<{
    key: string;
    name: string;
    calls: number;
    minutes: number;
    serviceUsers: number;
  }>;
  conflicts: number;
  travelGaps: number;
  utilizationStats: {
    avgCalls: number;
    avgHours: number;
    workersOverLimit: number;
    workersUnderUtilized: number;
  };
  constraintViolations: Array<{
    workerName: string;
    violationType: string;
    actual: number;
    limit: number;
  }>;
  weekDay: string;
  weekNumber: string;
}

interface AnalysisResult {
  overallScore: number;
  scoreRationale: string;
  insights: Array<{
    type: "positive" | "warning" | "critical";
    category: "workload" | "efficiency" | "quality" | "compliance";
    title: string;
    description: string;
    impact: "high" | "medium" | "low";
  }>;
  recommendations: Array<{
    priority: number;
    action: string;
    expectedBenefit: string;
    affectedWorkers: string[];
  }>;
  predictive: {
    burnoutRisk: Array<{
      workerName: string;
      riskScore: number;
      factors: string[];
    }>;
    bottlenecks: Array<{
      timeWindow: string;
      description: string;
      affectedCalls: number;
    }>;
    optimizationPotential: {
      travelTimeReduction: number;
      workloadBalanceImprovement: number;
      conflictElimination: number;
    };
  };
}

const toFiniteNumber = (value: unknown, fallback: number = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const normalizeAnalysisResult = (payload: unknown): AnalysisResult => {
  const raw = normalizeApiPayload<Record<string, unknown>>(payload);

  const rawInsights = Array.isArray(raw?.insights) ? raw.insights : [];
  const insights: AnalysisResult["insights"] = rawInsights.map((entry) => {
    const item = (entry as Record<string, unknown>) ?? {};
    const type = item.type;
    const category = item.category;
    const impact = item.impact;

    return {
      type: type === "positive" || type === "warning" || type === "critical" ? type : "warning",
      category:
        category === "workload" ||
        category === "efficiency" ||
        category === "quality" ||
        category === "compliance"
          ? category
          : "quality",
      title: typeof item.title === "string" && item.title.trim().length > 0 ? item.title : "Untitled insight",
      description:
        typeof item.description === "string" && item.description.trim().length > 0
          ? item.description
          : "No description provided.",
      impact: impact === "high" || impact === "medium" || impact === "low" ? impact : "medium",
    };
  });

  const rawRecommendations = Array.isArray(raw?.recommendations) ? raw.recommendations : [];
  const recommendations: AnalysisResult["recommendations"] = rawRecommendations.map((entry) => {
    const item = (entry as Record<string, unknown>) ?? {};
    const affectedWorkers = Array.isArray(item.affectedWorkers)
      ? item.affectedWorkers
          .map((w) => (typeof w === "string" ? w : ""))
          .filter((w) => w.trim().length > 0)
      : [];

    return {
      priority: toFiniteNumber(item.priority, 0),
      action: typeof item.action === "string" && item.action.trim().length > 0 ? item.action : "Review schedule",
      expectedBenefit:
        typeof item.expectedBenefit === "string" && item.expectedBenefit.trim().length > 0
          ? item.expectedBenefit
          : "Potential schedule improvement.",
      affectedWorkers,
    };
  });

  const rawPredictive = (raw?.predictive as Record<string, unknown> | undefined) ?? {};

  const rawBurnoutRisk = Array.isArray(rawPredictive.burnoutRisk) ? rawPredictive.burnoutRisk : [];
  const burnoutRisk: AnalysisResult["predictive"]["burnoutRisk"] = rawBurnoutRisk.map((entry, idx) => {
    const item = (entry as Record<string, unknown>) ?? {};
    const factors = Array.isArray(item.factors)
      ? item.factors
          .map((factor) => (typeof factor === "string" ? factor : ""))
          .filter((factor) => factor.trim().length > 0)
      : [];

    return {
      workerName:
        typeof item.workerName === "string" && item.workerName.trim().length > 0
          ? item.workerName
          : `Worker ${idx + 1}`,
      riskScore: Math.max(0, Math.min(100, toFiniteNumber(item.riskScore, 0))),
      factors,
    };
  });

  const rawBottlenecks = Array.isArray(rawPredictive.bottlenecks) ? rawPredictive.bottlenecks : [];
  const bottlenecks: AnalysisResult["predictive"]["bottlenecks"] = rawBottlenecks.map((entry, idx) => {
    const item = (entry as Record<string, unknown>) ?? {};
    return {
      timeWindow:
        typeof item.timeWindow === "string" && item.timeWindow.trim().length > 0
          ? item.timeWindow
          : `Window ${idx + 1}`,
      description:
        typeof item.description === "string" && item.description.trim().length > 0
          ? item.description
          : "Potential bottleneck detected.",
      affectedCalls: Math.max(0, toFiniteNumber(item.affectedCalls, 0)),
    };
  });

  const rawOptimizationPotential =
    (rawPredictive.optimizationPotential as Record<string, unknown> | undefined) ?? {};

  const rationaleRaw = typeof raw?.scoreRationale === "string" ? raw.scoreRationale.trim() : "";

  return {
    overallScore: Math.max(0, Math.min(100, toFiniteNumber(raw?.overallScore, 0))),
    scoreRationale: rationaleRaw,
    insights,
    recommendations,
    predictive: {
      burnoutRisk,
      bottlenecks,
      optimizationPotential: {
        travelTimeReduction: Math.max(0, toFiniteNumber(rawOptimizationPotential.travelTimeReduction, 0)),
        workloadBalanceImprovement: Math.max(
          0,
          toFiniteNumber(rawOptimizationPotential.workloadBalanceImprovement, 0),
        ),
        conflictElimination: Math.max(0, toFiniteNumber(rawOptimizationPotential.conflictElimination, 0)),
      },
    },
  };
};

export default function ScheduleAnalysisDashboard(props: ScheduleAnalysisProps) {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/admin/rostering/workbooks/${props.workbookId}/analyze-schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          workers: props.workers,
          conflicts: props.conflicts,
          travelGaps: props.travelGaps,
          utilizationStats: props.utilizationStats,
          constraintViolations: props.constraintViolations,
          weekDay: props.weekDay,
          weekNumber: props.weekNumber,
        }),
      });
      if (!response.ok) throw new Error("Analysis failed");
      return response.json() as Promise<unknown>;
    },
    onSuccess: (data: unknown) => {
      setAnalysis(normalizeAnalysisResult(data));
    },
  });

  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-success";
    if (score >= 75) return "text-primary";
    if (score >= 60) return "text-warning";
    if (score >= 40) return "text-warning";
    return "text-destructive";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 90) return "Excellent";
    if (score >= 75) return "Good";
    if (score >= 60) return "Fair";
    if (score >= 40) return "Poor";
    return "Critical";
  };

  const getInsightIcon = (type: string) => {
    switch (type) {
      case "positive":
        return <CheckCircle2 className="h-5 w-5 text-success" />;
      case "warning":
        return <AlertTriangle className="h-5 w-5 text-warning" />;
      case "critical":
        return <AlertTriangle className="h-5 w-5 text-destructive" />;
      default:
        return null;
    }
  };

  const getBurnoutRiskColor = (risk: number) => {
    if (risk >= 70) return "bg-destructive/100";
    if (risk >= 50) return "bg-warning";
    if (risk >= 30) return "bg-warning";
    return "bg-success/100";
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-primary" />
                AI Schedule Analysis
              </CardTitle>
              <CardDescription>
                AI-powered insights for {props.weekNumber}, {props.weekDay}
              </CardDescription>
            </div>
            <Button 
              onClick={() => analyzeMutation.mutate()} 
              disabled={analyzeMutation.isPending}
              className="gap-2"
            >
              {analyzeMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Analyze Schedule
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        {analysis && (
          <CardContent>
            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="insights">Insights</TabsTrigger>
                <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
                <TabsTrigger value="predictive">Predictive</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Overall Score</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className={`text-3xl font-semibold ${getScoreColor(analysis.overallScore)}`}>
                        {analysis.overallScore}/100
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {getScoreLabel(analysis.overallScore)}
                      </p>
                      <Progress value={analysis.overallScore} className="mt-2" />
                      {analysis.scoreRationale && (
                        <p className="text-xs text-muted-foreground mt-3 leading-snug" data-testid="text-score-rationale">
                          {analysis.scoreRationale}
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        Insights
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-success">✓ Positive:</span>
                          <span className="font-semibold">
                            {analysis.insights.filter(i => i.type === "positive").length}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-warning">⚠ Warning:</span>
                          <span className="font-semibold">
                            {analysis.insights.filter(i => i.type === "warning").length}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-destructive">✕ Critical:</span>
                          <span className="font-semibold">
                            {analysis.insights.filter(i => i.type === "critical").length}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Burnout Risk
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-semibold">
                        {analysis.predictive.burnoutRisk.filter(w => w.riskScore >= 50).length}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        workers at risk
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        Optimization Potential
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span>Travel time:</span>
                          <span className="font-semibold">-{analysis.predictive.optimizationPotential.travelTimeReduction}min</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Balance:</span>
                          <span className="font-semibold">+{analysis.predictive.optimizationPotential.workloadBalanceImprovement}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Conflicts:</span>
                          <span className="font-semibold">-{analysis.predictive.optimizationPotential.conflictElimination}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="insights" className="space-y-3">
                {["critical", "warning", "positive"].map((type) => {
                  const typedInsights = analysis.insights.filter(i => i.type === type);
                  if (typedInsights.length === 0) return null;
                  
                  return (
                    <div key={type} className="space-y-2">
                      <h3 className="font-semibold capitalize flex items-center gap-2">
                        {getInsightIcon(type)}
                        {type} Insights ({typedInsights.length})
                      </h3>
                      {typedInsights.map((insight, idx) => (
                        <Alert key={`${insight.title}-${insight.category}`} variant={type === "critical" ? "destructive" : "default"}>
                          <AlertDescription>
                            <div className="space-y-1">
                              <div className="flex items-start justify-between">
                                <p className="font-semibold">{insight.title}</p>
                                <div className="flex gap-1">
                                  <Badge variant="outline" className="text-xs">
                                    {insight.category}
                                  </Badge>
                                  <Badge variant={insight.impact === "high" ? "destructive" : "secondary"} className="text-xs">
                                    {insight.impact}
                                  </Badge>
                                </div>
                              </div>
                              <p className="text-sm text-muted-foreground">{insight.description}</p>
                            </div>
                          </AlertDescription>
                        </Alert>
                      ))}
                    </div>
                  );
                })}
              </TabsContent>

              <TabsContent value="recommendations" className="space-y-3">
                {analysis.recommendations
                  .sort((a, b) => b.priority - a.priority)
                  .map((rec, idx) => (
                    <Card key={rec.action}>
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-sm font-medium">
                            {rec.action}
                          </CardTitle>
                          <Badge variant={rec.priority >= 8 ? "destructive" : rec.priority >= 5 ? "default" : "secondary"}>
                            Priority: {rec.priority}/10
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <p className="text-sm text-muted-foreground">
                          <strong>Expected benefit:</strong> {rec.expectedBenefit}
                        </p>
                        {rec.affectedWorkers.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            <span className="text-xs text-muted-foreground">Affects:</span>
                            {rec.affectedWorkers.map((worker, widx) => (
                              <Badge key={widx} variant="outline" className="text-xs">
                                {worker}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
              </TabsContent>

              <TabsContent value="predictive" className="space-y-4">
                {analysis.predictive.burnoutRisk.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Burnout Risk Assessment
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {analysis.predictive.burnoutRisk
                        .sort((a, b) => b.riskScore - a.riskScore)
                        .map((risk, idx) => (
                          <div key={risk.workerName} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{risk.workerName}</span>
                              <span className="text-sm font-semibold">{risk.riskScore}% risk</span>
                            </div>
                            <Progress 
                              value={risk.riskScore} 
                              className={`h-2 ${getBurnoutRiskColor(risk.riskScore)}`}
                            />
                            <div className="flex flex-wrap gap-1">
                              {risk.factors.map((factor, fidx) => (
                                <Badge key={fidx} variant="secondary" className="text-xs">
                                  {factor}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ))}
                    </CardContent>
                  </Card>
                )}

                {analysis.predictive.bottlenecks.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Scheduling Bottlenecks
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {analysis.predictive.bottlenecks.map((bottleneck, idx) => (
                        <Alert key={bottleneck.timeWindow}>
                          <AlertDescription>
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold">{bottleneck.timeWindow}</span>
                                <Badge variant="outline">{bottleneck.affectedCalls} calls</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">{bottleneck.description}</p>
                            </div>
                          </AlertDescription>
                        </Alert>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        )}
        {analyzeMutation.isError && (
          <CardContent>
            <Alert variant="destructive">
              <AlertDescription>
                Failed to analyze schedule. Please try again.
              </AlertDescription>
            </Alert>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
