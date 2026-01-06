import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Eye, Lock, UserX, Activity, AlertTriangle, Terminal, Check, X, UserPlus, UserMinus, ShieldCheck, ArrowRightLeft, EyeOff, Clock, FileKey, Pencil, Search, Filter, Trash2, Save, FileWarning, Loader2, Unplug, FileText, Upload, FileCheck, FileX, DollarSign, Cpu, TrendingUp } from "lucide-react";
import { CURRENT_TERMS_VERSION } from "@shared/schema";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface AdminAlert {
  id: string;
  careWorkerId: string;
  careWorkerName: string;
  message: string;
  discrepancyType: string;
  discrepancyCount: number;
  isRead: boolean;
  createdAt: string;
}

interface RiskAssessmentLog {
  id: string;
  serviceUserName: string;
  performedBy: string;
  performedByJobTitle: string | null;
  offeredAssessments: string[];
  selectedAssessments: string[];
  skippedMandatory: string[];
  documentSummary: string | null;
  createdAt: string;
}

interface AiUsageLog {
  id: string;
  userId: string | null;
  username: string | null;
  featureName: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costMicroDollars: number;
  durationMs: number | null;
  createdAt: string;
}

interface AiUsageStats {
  totalCost: number;
  totalCalls: number;
  byFeature: Record<string, { calls: number; cost: number; tokens: number }>;
}

function formatCost(microDollars: number): string {
  const dollars = microDollars / 1000000;
  if (dollars < 0.01) {
    return `$${dollars.toFixed(4)}`;
  } else if (dollars < 1) {
    return `$${dollars.toFixed(3)}`;
  } else {
    return `$${dollars.toFixed(2)}`;
  }
}

function AICostSection() {
  const [logs, setLogs] = useState<AiUsageLog[]>([]);
  const [stats, setStats] = useState<AiUsageStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAiUsage();
  }, []);

  const fetchAiUsage = async () => {
    try {
      const response = await fetch("/api/ai-usage", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs || []);
        setStats(data.stats || null);
      }
    } catch (error) {
      console.error("Failed to fetch AI usage:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="bg-card border-white/5 backdrop-blur-sm">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const featureColors: Record<string, string> = {
    "emar_metadata": "bg-blue-500/20 text-blue-400",
    "emar_entries": "bg-indigo-500/20 text-indigo-400",
    "emar_pass": "bg-purple-500/20 text-purple-400",
    "drug_interactions": "bg-red-500/20 text-red-400",
    "care_plan": "bg-green-500/20 text-green-400",
    "risk_assessment": "bg-amber-500/20 text-amber-400",
    "plan_enhancer": "bg-cyan-500/20 text-cyan-400",
  };

  const getFeatureColor = (feature: string): string => {
    for (const [key, color] of Object.entries(featureColors)) {
      if (feature.toLowerCase().includes(key.toLowerCase())) {
        return color;
      }
    }
    return "bg-gray-500/20 text-gray-400";
  };

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="bg-card border-white/5 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <DollarSign size={14} className="text-green-500" /> Total Spend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-400">{stats ? formatCost(stats.totalCost) : "$0.00"}</div>
            <p className="text-xs text-muted-foreground">All time AI costs</p>
          </CardContent>
        </Card>
        
        <Card className="bg-card border-white/5 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Cpu size={14} className="text-blue-500" /> API Calls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-400">{stats?.totalCalls || 0}</div>
            <p className="text-xs text-muted-foreground">Total AI requests</p>
          </CardContent>
        </Card>
        
        <Card className="bg-card border-white/5 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <TrendingUp size={14} className="text-purple-500" /> Features Used
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-400">{stats ? Object.keys(stats.byFeature).length : 0}</div>
            <p className="text-xs text-muted-foreground">Unique AI features</p>
          </CardContent>
        </Card>
      </div>

      {stats && Object.keys(stats.byFeature).length > 0 && (
        <Card className="bg-card border-white/5 backdrop-blur-sm">
          <CardHeader className="border-b border-white/5 bg-black/20">
            <CardTitle className="flex items-center gap-2 text-foreground text-base">
              <DollarSign size={18} className="text-green-400" />
              Cost Breakdown by Feature
            </CardTitle>
            <CardDescription className="text-muted-foreground text-sm">
              See how much each AI feature costs
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-3">
              {Object.entries(stats.byFeature)
                .sort((a, b) => b[1].cost - a[1].cost)
                .map(([feature, data]) => (
                  <div key={feature} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary" className={getFeatureColor(feature)}>
                        {feature.replace(/_/g, " ")}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{data.calls} calls</span>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-foreground">{formatCost(data.cost)}</div>
                      <div className="text-xs text-muted-foreground">{data.tokens.toLocaleString()} tokens</div>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-card border-white/5 backdrop-blur-sm overflow-hidden">
        <CardHeader className="border-b border-white/5 bg-black/20">
          <CardTitle className="flex items-center gap-2 text-foreground text-base">
            <Activity size={18} className="text-blue-400" />
            Recent AI Calls
          </CardTitle>
          <CardDescription className="text-muted-foreground text-sm">
            Last 100 AI API requests with user and cost info
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Time</TableHead>
                  <TableHead className="text-muted-foreground">User</TableHead>
                  <TableHead className="text-muted-foreground">Feature</TableHead>
                  <TableHead className="text-muted-foreground">Billed To</TableHead>
                  <TableHead className="text-muted-foreground">Model</TableHead>
                  <TableHead className="text-muted-foreground text-right">Tokens</TableHead>
                  <TableHead className="text-muted-foreground text-right">Cost</TableHead>
                  <TableHead className="text-muted-foreground text-right">Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id} className="border-white/5" data-testid={`ai-log-${log.id}`}>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(log.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-foreground">
                      {log.username || <span className="text-muted-foreground italic">System</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={getFeatureColor(log.featureName)}>
                        {log.featureName.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className={log.provider === "replit" 
                          ? "border-indigo-500/50 text-indigo-300 bg-indigo-500/10" 
                          : "border-emerald-500/50 text-emerald-300 bg-emerald-500/10"
                        }
                      >
                        {log.provider === "replit" ? "Replit AI" : "OpenAI"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {log.model}
                    </TableCell>
                    <TableCell className="text-right text-foreground">
                      {log.totalTokens.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-green-400">
                      {formatCost(log.costMicroDollars)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {log.durationMs ? `${(log.durationMs / 1000).toFixed(1)}s` : "-"}
                    </TableCell>
                  </TableRow>
                ))}
                {logs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No AI usage recorded yet. Run an EMAR analysis or generate a care plan to see data here.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AIProviderSection() {
  const [provider, setProvider] = useState<"replit" | "openai">("replit");
  const [hasOpenAIKey, setHasOpenAIKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const EMAR_MODE_STORAGE_KEY = "admin.emarAnalysisMode";
  const [emarMode, setEmarMode] = useState<"enhanced" | "legacy">(() => {
    try {
      const stored = window.localStorage.getItem(EMAR_MODE_STORAGE_KEY);
      if (stored === "enhanced" || stored === "legacy") return stored;
      return "legacy";
    } catch {
      return "legacy";
    }
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(EMAR_MODE_STORAGE_KEY, emarMode);
    } catch {
      // ignore
    }
  }, [emarMode]);

  const fetchSettings = async () => {
    try {
      const providerRes = await fetch("/api/admin/ai-provider", { credentials: "include" });
      
      if (providerRes.ok) {
        const data = await providerRes.json();
        setProvider(data.provider);
        setHasOpenAIKey(data.hasOpenAIKey);
      }
    } catch (error) {
      console.error("Failed to fetch AI settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchProvider = async (newProvider: "replit" | "openai") => {
    if (newProvider === provider) return;
    
    setSwitching(true);
    try {
      const response = await fetch("/api/admin/ai-provider", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: newProvider }),
      });
      
      if (response.ok) {
        setProvider(newProvider);
        toast({
          title: "AI Provider Updated",
          description: `Now using ${newProvider === "replit" ? "Replit AI" : "OpenAI"} as the primary provider.`,
        });
      } else {
        const data = await response.json();
        toast({
          title: "Failed to switch provider",
          description: data.message || "Unknown error occurred",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Failed to switch AI provider:", error);
      toast({
        title: "Error",
        description: "Failed to switch AI provider. Check console for details.",
        variant: "destructive",
      });
    } finally {
      setSwitching(false);
    }
  };

  if (loading) {
    return (
      <Card className="bg-card border-white/5 backdrop-blur-sm">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-white/5 backdrop-blur-sm">
      <CardHeader className="border-b border-white/5 bg-black/20">
        <CardTitle className="flex items-center gap-2 text-foreground text-base">
          <Cpu size={18} className="text-purple-400" />
          AI Configuration
        </CardTitle>
        <CardDescription className="text-muted-foreground text-sm">
          Configure billing provider. Model selection uses optimized tiered approach automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        <div>
          <h4 className="text-sm font-medium text-foreground mb-3">Billing Provider</h4>
          <div className="flex flex-col md:flex-row gap-4">
            <button
              onClick={() => handleSwitchProvider("replit")}
              disabled={switching || provider === "replit"}
              className={`flex-1 p-4 rounded-lg border-2 transition-all ${
                provider === "replit"
                  ? "border-indigo-500 bg-indigo-500/10"
                  : "border-white/10 hover:border-white/20 bg-white/5"
              } ${switching ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              data-testid="button-provider-replit"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  provider === "replit" ? "bg-indigo-500/20" : "bg-white/10"
                }`}>
                  <Cpu size={20} className={provider === "replit" ? "text-indigo-400" : "text-muted-foreground"} />
                </div>
                <div className="text-left">
                  <div className="font-medium text-foreground">Replit AI</div>
                  <div className="text-xs text-muted-foreground">Uses your Replit AI credits</div>
                </div>
                {provider === "replit" && (
                  <Badge variant="secondary" className="ml-auto bg-indigo-500/20 text-indigo-300 border-indigo-500/30">
                    Active
                  </Badge>
                )}
              </div>
            </button>

            <button
              onClick={() => handleSwitchProvider("openai")}
              disabled={switching || provider === "openai" || !hasOpenAIKey}
              className={`flex-1 p-4 rounded-lg border-2 transition-all ${
                provider === "openai"
                  ? "border-emerald-500 bg-emerald-500/10"
                  : hasOpenAIKey
                    ? "border-white/10 hover:border-white/20 bg-white/5"
                    : "border-white/5 bg-white/5 opacity-50"
              } ${switching || !hasOpenAIKey ? "cursor-not-allowed" : "cursor-pointer"}`}
              data-testid="button-provider-openai"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  provider === "openai" ? "bg-emerald-500/20" : "bg-white/10"
                }`}>
                  <TrendingUp size={20} className={provider === "openai" ? "text-emerald-400" : "text-muted-foreground"} />
                </div>
                <div className="text-left">
                  <div className="font-medium text-foreground">OpenAI</div>
                  <div className="text-xs text-muted-foreground">
                    {hasOpenAIKey ? "Uses your OpenAI API key" : "OPENAI_FALLBACK_API_KEY not set"}
                  </div>
                </div>
                {provider === "openai" && (
                  <Badge variant="secondary" className="ml-auto bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                    Active
                  </Badge>
                )}
                {!hasOpenAIKey && (
                  <Badge variant="outline" className="ml-auto border-yellow-500/50 text-yellow-400">
                    Key Missing
                  </Badge>
                )}
              </div>
            </button>
          </div>
        </div>

        <div className="border-t border-white/5 pt-6">
          <h4 className="text-sm font-medium text-foreground mb-3">EMAR Analysis Mode</h4>
          <div className="p-4 bg-black/20 rounded-lg border border-white/10 flex items-center justify-between gap-6">
            <div className="min-w-0">
              <div className="font-medium text-foreground">Legacy AI-only mode</div>
              <div className="text-xs text-muted-foreground mt-1">
                When enabled, EMAR analysis skips the new coordinate-based grid parser and uses the original AI-only extraction.
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                variant="outline"
                className={emarMode === "legacy" ? "border-yellow-500/50 text-yellow-400" : "border-white/15 text-muted-foreground"}
              >
                {emarMode === "legacy" ? "Legacy" : "Enhanced"}
              </Badge>
              <Switch
                checked={emarMode === "legacy"}
                onCheckedChange={(checked) => setEmarMode(checked ? "legacy" : "enhanced")}
                data-testid="switch-emar-legacy-mode"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-white/5 pt-6">
          <h4 className="text-sm font-medium text-foreground mb-3">AI Model Strategy</h4>
          <div className="p-4 bg-purple-500/10 rounded-lg border border-purple-500/20">
            <div className="font-medium text-foreground mb-2">Optimized Tiered Approach</div>
            <div className="text-xs text-muted-foreground space-y-2">
              <div className="flex items-start gap-2">
                <Badge variant="secondary" className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30 shrink-0">GPT-5.1</Badge>
                <span>Core EMAR extraction (accuracy critical)</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 shrink-0">GPT-4.1-mini</Badge>
                <span>Count validation, equivalence checks, drug interactions, validation passes (cost-efficient with temperature support)</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-3 bg-black/20 rounded-lg border border-white/5 text-xs text-muted-foreground">
          <strong className="text-foreground">Note:</strong> AI models are automatically selected based on task complexity. 
          Drug interaction checks are computed on each run to avoid reusing previous responses.
          If the primary provider fails, the system will automatically try the other provider.
        </div>
      </CardContent>
    </Card>
  );
}

function RiskAssessmentLogsSection() {
  const [logs, setLogs] = useState<RiskAssessmentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const response = await fetch("/api/risk-assessment-logs", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setLogs(data);
      }
    } catch (error) {
      console.error("Failed to fetch risk assessment logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter(log => 
    log.serviceUserName.toLowerCase().includes(search.toLowerCase()) ||
    log.performedBy.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <Card className="bg-card border-white/5 backdrop-blur-sm">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-white/5 backdrop-blur-sm overflow-hidden">
      <CardHeader className="border-b border-white/5 bg-black/20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-foreground text-base">
              <FileWarning size={18} className="text-amber-400" />
              Risk Assessment Audit Log
            </CardTitle>
            <CardDescription className="text-muted-foreground text-sm">
              Track which risk assessments were offered and selected for each service user.
            </CardDescription>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by service user or staff..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-muted border-border text-foreground placeholder:text-muted-foreground w-[250px]"
              data-testid="input-risk-log-search"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="text-muted-foreground font-medium">Date</TableHead>
                <TableHead className="text-muted-foreground font-medium">Service User</TableHead>
                <TableHead className="text-muted-foreground font-medium">Performed By</TableHead>
                <TableHead className="text-muted-foreground font-medium text-center">Offered</TableHead>
                <TableHead className="text-muted-foreground font-medium text-center">Selected</TableHead>
                <TableHead className="text-muted-foreground font-medium">Skipped Mandatory</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.map((log) => (
                <TableRow key={log.id} className="border-white/5 hover:bg-white/5 transition-colors" data-testid={`row-risk-log-${log.id}`}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {new Date(log.createdAt).toLocaleDateString("en-GB", { 
                      day: "2-digit", 
                      month: "short", 
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </TableCell>
                  <TableCell>
                    <span className="font-medium text-foreground">{log.serviceUserName}</span>
                  </TableCell>
                  <TableCell>
                    <div>
                      <span className="text-foreground">{log.performedBy}</span>
                      {log.performedByJobTitle && (
                        <p className="text-xs text-muted-foreground">{log.performedByJobTitle}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="bg-muted text-foreground">
                      {log.offeredAssessments?.length || 0}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="bg-green-900/50 text-green-300 border border-green-700/50">
                      {log.selectedAssessments?.length || 0}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {log.skippedMandatory && log.skippedMandatory.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {log.skippedMandatory.map((item, idx) => (
                          <Badge key={idx} variant="destructive" className="text-xs">
                            {item}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-green-400">None skipped</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filteredLogs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {logs.length === 0 ? "No risk assessment logs yet." : "No logs found matching your search."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      <CardFooter className="border-t border-white/5 bg-black/20 py-3">
        <p className="text-xs text-muted-foreground">Showing {filteredLogs.length} of {logs.length} log entries</p>
      </CardFooter>
    </Card>
  );
}

interface UserPresence {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  status: string;
  jobTitle: string | null;
  suspendedUntil: string | null;
  lastOnlineAt: string | null;
  isOnline: boolean;
  currentSession: { 
    createdAt: string; 
    lastActivity: string;
    ipAddress?: string | null;
    city?: string | null;
    region?: string | null;
    country?: string | null;
  } | null;
}

interface BlockedIp {
  id: string;
  ipAddress: string;
  blockedBy: string;
  reason: string | null;
  username: string | null;
  createdAt: string;
}

interface AuditTrailData {
  riskAssessments: RiskAssessmentLog[];
  discrepancies: Array<{
    id: string;
    careWorkerId: string;
    type: string;
    date: string;
    description: string;
    action: string;
    severity: string | null;
    actionMedium: string | null;
    manager: string | null;
    notes: string | null;
    createdAt: string;
    careWorker: { name: string };
  }>;
  suspensions: Array<{
    id: string;
    userId: string;
    username: string;
    adminUsername: string;
    durationMinutes: number;
    reason: string | null;
    startsAt: string;
    endsAt: string;
    reinstatedEarly: boolean;
    createdAt: string;
  }>;
  sessionHistory: Array<{
    id: string;
    userId: string;
    username: string;
    sessionId: string;
    loggedInAt: string;
    loggedOutAt: string | null;
    durationSeconds: number | null;
    terminatedByAdmin: boolean;
  }>;
}

function ActivePresenceSection() {
  const [users, setUsers] = useState<UserPresence[]>([]);
  const [loading, setLoading] = useState(true);
  const [suspendingUser, setSuspendingUser] = useState<string | null>(null);
  const [suspendDuration, setSuspendDuration] = useState(5);
  const [suspendReason, setSuspendReason] = useState("");
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [blockingIp, setBlockingIp] = useState<{ip: string; username: string} | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const { toast } = useToast();

  const toggleExpanded = (userId: string) => {
    setExpandedUsers(prev => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleBlockIp = async () => {
    if (!blockingIp || !blockingIp.ip || blockingIp.ip === "Unknown") {
      toast({ title: "Error", description: "Cannot block - no valid IP address.", variant: "destructive" });
      return;
    }
    try {
      const response = await fetch("/api/admin/block-ip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          ipAddress: blockingIp.ip, 
          reason: blockReason || undefined,
          username: blockingIp.username,
        }),
        credentials: "include",
      });
      if (response.ok) {
        toast({ title: "IP Blocked", description: `${blockingIp.ip} has been blocked.` });
        setBlockingIp(null);
        setBlockReason("");
        fetchPresence();
      } else {
        const data = await response.json();
        toast({ title: "Error", description: data.message, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to block IP.", variant: "destructive" });
    }
  };

  useEffect(() => {
    fetchPresence();
    const interval = setInterval(fetchPresence, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchPresence = async () => {
    try {
      const response = await fetch("/api/admin/users-presence", { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error("Failed to fetch presence:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSuspend = async (userId: string) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}/suspend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durationMinutes: suspendDuration, reason: suspendReason || undefined }),
        credentials: "include",
      });
      if (response.ok) {
        toast({ title: "User Suspended", description: `User suspended for ${suspendDuration} minutes.` });
        setSuspendingUser(null);
        setSuspendDuration(5);
        setSuspendReason("");
        fetchPresence();
      } else {
        const data = await response.json();
        toast({ title: "Error", description: data.message, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to suspend user.", variant: "destructive" });
    }
  };

  const handleKick = async (userId: string) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}/kick`, {
        method: "POST",
        credentials: "include",
      });
      if (response.ok) {
        toast({ title: "User Kicked", description: "User has been logged out." });
        fetchPresence();
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to kick user.", variant: "destructive" });
    }
  };

  const handleReinstate = async (userId: string) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}/reinstate`, {
        method: "POST",
        credentials: "include",
      });
      if (response.ok) {
        toast({ title: "User Reinstated", description: "Suspension has been lifted." });
        fetchPresence();
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to reinstate user.", variant: "destructive" });
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "-";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const getSessionDuration = (session: { createdAt: string } | null) => {
    if (!session) return "-";
    const start = new Date(session.createdAt);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - start.getTime()) / 1000);
    return formatDuration(seconds);
  };

  if (loading) {
    return (
      <Card className="bg-card border-white/5 backdrop-blur-sm">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const onlineUsers = users.filter(u => u.isOnline);
  const offlineUsers = users.filter(u => !u.isOnline && u.role !== "admin");

  return (
    <div className="space-y-6">
      <Card className="bg-card border-white/5 backdrop-blur-sm overflow-hidden">
        <CardHeader className="border-b border-white/5 bg-black/20">
          <CardTitle className="flex items-center gap-2 text-foreground text-base">
            <Activity size={18} className="text-green-400" />
            Online Users ({onlineUsers.length})
          </CardTitle>
          <CardDescription className="text-muted-foreground text-xs">Click on a user to see more details</CardDescription>
        </CardHeader>
        <CardContent className="p-4 space-y-2">
          {onlineUsers.map((user) => {
            const isExpanded = expandedUsers.has(user.id);
            const ipAddress = user.currentSession?.ipAddress || "Unknown";
            const location = [user.currentSession?.city, user.currentSession?.region, user.currentSession?.country]
              .filter(Boolean).join(", ") || null;
            
            return (
              <div 
                key={user.id} 
                className="border border-border rounded-lg overflow-hidden transition-all"
                data-testid={`card-presence-${user.id}`}
              >
                <div 
                  className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleExpanded(user.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-2.5 w-2.5 rounded-full bg-green-400 animate-pulse" />
                    <div>
                      <span className="font-medium text-foreground">{user.username}</span>
                      <Badge variant="outline" className={`ml-2 text-xs ${user.role === "admin" ? "border-indigo-500/50 text-indigo-300" : "border-border text-foreground"}`}>
                        {user.role}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground font-mono">{getSessionDuration(user.currentSession)}</span>
                    <svg 
                      className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                
                {isExpanded && (
                  <div className="border-t border-border bg-muted/30 p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">IP Address</p>
                        <p className="text-sm text-foreground font-mono">{ipAddress}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Last Activity</p>
                        <p className="text-sm text-foreground">
                          {user.currentSession?.lastActivity ? new Date(user.currentSession.lastActivity).toLocaleTimeString() : "-"}
                        </p>
                      </div>
                      {location && (
                        <div className="md:col-span-2">
                          <p className="text-xs text-muted-foreground mb-1">Approximate Location</p>
                          <p className="text-sm text-foreground">{location}</p>
                        </div>
                      )}
                    </div>
                    
                    {user.role !== "admin" && (
                      <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="border-red-500/50 text-red-300 hover:bg-red-950"
                          onClick={(e) => { e.stopPropagation(); handleKick(user.id); }}
                          data-testid={`button-kick-${user.id}`}
                        >
                          <UserX size={14} className="mr-1" /> End Session
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="border-amber-500/50 text-amber-300 hover:bg-amber-950"
                          onClick={(e) => { e.stopPropagation(); setSuspendingUser(user.id); }}
                          data-testid={`button-suspend-${user.id}`}
                        >
                          <Clock size={14} className="mr-1" /> Suspend
                        </Button>
                        {ipAddress !== "Unknown" && (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="border-destructive/50 text-destructive hover:bg-destructive/10"
                            onClick={(e) => { e.stopPropagation(); setBlockingIp({ ip: ipAddress, username: user.username }); }}
                            data-testid={`button-block-ip-${user.id}`}
                          >
                            <Shield size={14} className="mr-1" /> Block IP
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {onlineUsers.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">No users currently online.</div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border-white/5 backdrop-blur-sm overflow-hidden">
        <CardHeader className="border-b border-white/5 bg-black/20">
          <CardTitle className="flex items-center gap-2 text-foreground text-base">
            <EyeOff size={18} className="text-muted-foreground" />
            Offline Staff ({offlineUsers.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="text-muted-foreground font-medium">User</TableHead>
                <TableHead className="text-muted-foreground font-medium">Status</TableHead>
                <TableHead className="text-muted-foreground font-medium">Last Online</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {offlineUsers.slice(0, 10).map((user) => (
                <TableRow key={user.id} className="border-white/5 hover:bg-white/5">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-muted-foreground" />
                      <span className="text-muted-foreground">{user.username}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {user.suspendedUntil && new Date(user.suspendedUntil) > new Date() ? (
                      <div className="flex items-center gap-2">
                        <Badge variant="destructive" className="text-xs">Suspended</Badge>
                        <Button size="sm" variant="ghost" className="text-xs text-green-400 hover:text-green-300" onClick={() => handleReinstate(user.id)}>Reinstate</Button>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">Offline</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {user.lastOnlineAt ? new Date(user.lastOnlineAt).toLocaleString() : "Never"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!suspendingUser} onOpenChange={() => setSuspendingUser(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Suspend User</DialogTitle>
            <DialogDescription className="text-muted-foreground">Set the suspension duration (2 minutes to 24 hours).</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Duration: {suspendDuration} minutes</Label>
              <Slider value={[suspendDuration]} onValueChange={(v) => setSuspendDuration(v[0])} min={2} max={1440} step={1} className="w-full" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>2 min</span><span>1 hour</span><span>24 hours</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Reason (optional)</Label>
              <Input value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} placeholder="Enter reason..." className="bg-muted border-border text-foreground" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendingUser(null)} className="border-border text-foreground">Cancel</Button>
            <Button onClick={() => suspendingUser && handleSuspend(suspendingUser)} className="bg-amber-600 hover:bg-amber-500 text-white">Suspend User</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!blockingIp} onOpenChange={() => { setBlockingIp(null); setBlockReason(""); }}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Block IP Address</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              This will prevent anyone from logging in from IP: <span className="font-mono text-foreground">{blockingIp?.ip}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Associated User</Label>
              <p className="text-sm text-foreground">{blockingIp?.username || "Unknown"}</p>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Reason (optional)</Label>
              <Input 
                value={blockReason} 
                onChange={(e) => setBlockReason(e.target.value)} 
                placeholder="Enter reason for blocking..." 
                className="bg-muted border-border text-foreground" 
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBlockingIp(null); setBlockReason(""); }} className="border-border text-foreground">Cancel</Button>
            <Button onClick={handleBlockIp} className="bg-destructive hover:bg-destructive/90 text-white">Block IP</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BlockedIpsSection() {
  const [blockedIps, setBlockedIps] = useState<BlockedIp[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchBlockedIps();
  }, []);

  const fetchBlockedIps = async () => {
    try {
      const response = await fetch("/api/admin/blocked-ips", { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setBlockedIps(data);
      }
    } catch (error) {
      console.error("Failed to fetch blocked IPs:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUnblock = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/blocked-ips/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (response.ok) {
        toast({ title: "IP Unblocked", description: "The IP address has been unblocked." });
        fetchBlockedIps();
      } else {
        toast({ title: "Error", description: "Failed to unblock IP.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to unblock IP.", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <Card className="bg-card border-white/5 backdrop-blur-sm">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-white/5 backdrop-blur-sm overflow-hidden">
      <CardHeader className="border-b border-white/5 bg-black/20">
        <CardTitle className="flex items-center gap-2 text-foreground text-base">
          <Shield size={18} className="text-red-400" />
          Blocked IP Addresses ({blockedIps.length})
        </CardTitle>
        <CardDescription className="text-muted-foreground text-xs">
          IP addresses that are blocked from logging in
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead className="text-muted-foreground font-medium">IP Address</TableHead>
              <TableHead className="text-muted-foreground font-medium">Associated User</TableHead>
              <TableHead className="text-muted-foreground font-medium">Blocked By</TableHead>
              <TableHead className="text-muted-foreground font-medium">Reason</TableHead>
              <TableHead className="text-muted-foreground font-medium">Blocked At</TableHead>
              <TableHead className="text-muted-foreground font-medium text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {blockedIps.map((blocked) => (
              <TableRow key={blocked.id} className="border-white/5 hover:bg-white/5" data-testid={`row-blocked-ip-${blocked.id}`}>
                <TableCell className="font-mono text-foreground">{blocked.ipAddress}</TableCell>
                <TableCell className="text-muted-foreground">{blocked.username || "-"}</TableCell>
                <TableCell className="text-muted-foreground">{blocked.blockedBy}</TableCell>
                <TableCell className="text-muted-foreground">{blocked.reason || "-"}</TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {new Date(blocked.createdAt).toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="border-green-500/50 text-green-300 hover:bg-green-950"
                    onClick={() => handleUnblock(blocked.id)}
                    data-testid={`button-unblock-${blocked.id}`}
                  >
                    <Check size={14} className="mr-1" /> Unblock
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {blockedIps.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No blocked IP addresses.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function AuditTrailSection() {
  const [data, setData] = useState<AuditTrailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("discrepancies");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchAuditTrail();
  }, []);

  const fetchAuditTrail = async () => {
    try {
      const response = await fetch("/api/admin/audit-trail", { credentials: "include" });
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error("Failed to fetch audit trail:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="bg-card border-white/5 backdrop-blur-sm">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search audit trail..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-muted border-border text-foreground placeholder:text-muted-foreground" data-testid="input-audit-search" />
        </div>
        <Select value={activeTab} onValueChange={setActiveTab}>
          <SelectTrigger className="w-[180px] bg-muted border-border text-foreground">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="discrepancies">Discrepancies</SelectItem>
            <SelectItem value="suspensions">Suspensions</SelectItem>
            <SelectItem value="sessions">Session History</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {activeTab === "discrepancies" && (
        <Card className="bg-card border-white/5 backdrop-blur-sm overflow-hidden">
          <CardHeader className="border-b border-white/5 bg-black/20">
            <CardTitle className="flex items-center gap-2 text-foreground text-base">
              <AlertTriangle size={18} className="text-amber-400" />
              Care Worker Discrepancies ({data.discrepancies.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/5">
                    <TableHead className="text-muted-foreground">Date</TableHead>
                    <TableHead className="text-muted-foreground">Care Worker</TableHead>
                    <TableHead className="text-muted-foreground">Type</TableHead>
                    <TableHead className="text-muted-foreground">Description</TableHead>
                    <TableHead className="text-muted-foreground">Action</TableHead>
                    <TableHead className="text-muted-foreground">Severity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.discrepancies.filter(d => d.careWorker.name.toLowerCase().includes(search.toLowerCase()) || d.description.toLowerCase().includes(search.toLowerCase())).slice(0, 20).map((d) => (
                    <TableRow key={d.id} className="border-white/5 hover:bg-white/5">
                      <TableCell className="text-muted-foreground text-xs font-mono">{d.date}</TableCell>
                      <TableCell className="text-foreground">{d.careWorker.name}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{d.type}</Badge></TableCell>
                      <TableCell className="text-muted-foreground text-sm max-w-[300px] truncate">{d.description}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{d.action}</TableCell>
                      <TableCell>
                        {d.severity && (
                          <Badge className={d.severity === "high" ? "bg-red-900/50 text-red-300" : d.severity === "medium" ? "bg-amber-900/50 text-amber-300" : "bg-muted text-foreground"}>
                            {d.severity}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "suspensions" && (
        <Card className="bg-card border-white/5 backdrop-blur-sm overflow-hidden">
          <CardHeader className="border-b border-white/5 bg-black/20">
            <CardTitle className="flex items-center gap-2 text-foreground text-base">
              <Lock size={18} className="text-red-400" />
              Suspension Logs ({data.suspensions.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-white/5">
                  <TableHead className="text-muted-foreground">Date</TableHead>
                  <TableHead className="text-muted-foreground">User</TableHead>
                  <TableHead className="text-muted-foreground">Admin</TableHead>
                  <TableHead className="text-muted-foreground">Duration</TableHead>
                  <TableHead className="text-muted-foreground">Reason</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.suspensions.filter(s => s.username.toLowerCase().includes(search.toLowerCase())).map((s) => (
                  <TableRow key={s.id} className="border-white/5 hover:bg-white/5">
                    <TableCell className="text-muted-foreground text-xs font-mono">{new Date(s.startsAt).toLocaleString()}</TableCell>
                    <TableCell className="text-foreground">{s.username}</TableCell>
                    <TableCell className="text-muted-foreground">{s.adminUsername}</TableCell>
                    <TableCell className="text-muted-foreground">{s.durationMinutes} min</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{s.reason || "-"}</TableCell>
                    <TableCell>
                      {s.reinstatedEarly ? (
                        <Badge variant="outline" className="border-green-500/50 text-green-300">Reinstated</Badge>
                      ) : new Date(s.endsAt) > new Date() ? (
                        <Badge variant="destructive">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="border-border text-muted-foreground">Expired</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {activeTab === "sessions" && (
        <Card className="bg-card border-white/5 backdrop-blur-sm overflow-hidden">
          <CardHeader className="border-b border-white/5 bg-black/20">
            <CardTitle className="flex items-center gap-2 text-foreground text-base">
              <Activity size={18} className="text-blue-400" />
              Session History ({data.sessionHistory.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-white/5">
                  <TableHead className="text-muted-foreground">Login Time</TableHead>
                  <TableHead className="text-muted-foreground">User</TableHead>
                  <TableHead className="text-muted-foreground">Logout Time</TableHead>
                  <TableHead className="text-muted-foreground">Duration</TableHead>
                  <TableHead className="text-muted-foreground">Terminated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.sessionHistory.filter(s => s.username.toLowerCase().includes(search.toLowerCase())).slice(0, 30).map((s) => (
                  <TableRow key={s.id} className="border-white/5 hover:bg-white/5">
                    <TableCell className="text-muted-foreground text-xs font-mono">{new Date(s.loggedInAt).toLocaleString()}</TableCell>
                    <TableCell className="text-foreground">{s.username}</TableCell>
                    <TableCell className="text-muted-foreground text-xs font-mono">{s.loggedOutAt ? new Date(s.loggedOutAt).toLocaleString() : "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{s.durationSeconds ? `${Math.floor(s.durationSeconds / 60)}m` : "-"}</TableCell>
                    <TableCell>{s.terminatedByAdmin ? <Badge variant="destructive" className="text-xs">Admin</Badge> : <span className="text-muted-foreground">-</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface SystemLog {
  id: number;
  user: string;
  action: string;
  target: string;
  time: string;
  status: "Authorized" | "System" | "Flagged" | "Blocked";
  alert?: string;
}

interface UnifiedSystemLogSectionProps {
  systemLogs: SystemLog[];
  logSearch: string;
  setLogSearch: (val: string) => void;
  logStatusFilter: string;
  setLogStatusFilter: (val: string) => void;
  filteredLogs: SystemLog[];
}

function UnifiedSystemLogSection({ systemLogs, logSearch, setLogSearch, logStatusFilter, setLogStatusFilter, filteredLogs }: UnifiedSystemLogSectionProps) {
  const [logCategory, setLogCategory] = useState("activity");
  const [auditData, setAuditData] = useState<AuditTrailData | null>(null);
  const [riskLogs, setRiskLogs] = useState<RiskAssessmentLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        const [auditRes, riskRes] = await Promise.all([
          fetch("/api/admin/audit-trail", { credentials: "include" }),
          fetch("/api/risk-assessment-logs", { credentials: "include" })
        ]);
        if (auditRes.ok) setAuditData(await auditRes.json());
        if (riskRes.ok) setRiskLogs(await riskRes.json());
      } catch (error) {
        console.error("Failed to fetch logs:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchAllData();
  }, []);

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case "activity": return "Activity Logs";
      case "discrepancies": return "Discrepancies";
      case "suspensions": return "Suspensions";
      case "sessions": return "Session History";
      case "risk": return "Risk Assessments";
      default: return cat;
    }
  };

  const getCategoryCount = (cat: string) => {
    switch (cat) {
      case "activity": return systemLogs.length;
      case "discrepancies": return auditData?.discrepancies.length || 0;
      case "suspensions": return auditData?.suspensions.length || 0;
      case "sessions": return auditData?.sessionHistory.length || 0;
      case "risk": return riskLogs.length;
      default: return 0;
    }
  };

  if (loading) {
    return (
      <Card className="bg-card border-white/5 backdrop-blur-sm">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-white/5 backdrop-blur-sm overflow-hidden">
      <CardHeader className="border-b border-white/5 bg-black/20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-foreground text-base">
              <Terminal size={18} className="text-purple-400" /> System Log
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Unified view of all system activity, audits, and assessments.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
              <Input
                placeholder="Search..."
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                className="bg-card border-border text-foreground pl-9 w-[180px]"
                data-testid="input-unified-log-search"
              />
            </div>
            <Select value={logCategory} onValueChange={setLogCategory}>
              <SelectTrigger className="bg-card border-border text-foreground w-[180px]" data-testid="select-log-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="activity">Activity Logs ({getCategoryCount("activity")})</SelectItem>
                <SelectItem value="discrepancies">Discrepancies ({getCategoryCount("discrepancies")})</SelectItem>
                <SelectItem value="suspensions">Suspensions ({getCategoryCount("suspensions")})</SelectItem>
                <SelectItem value="sessions">Session History ({getCategoryCount("sessions")})</SelectItem>
                <SelectItem value="risk">Risk Assessments ({getCategoryCount("risk")})</SelectItem>
              </SelectContent>
            </Select>
            {logCategory === "activity" && (
              <Select value={logStatusFilter} onValueChange={setLogStatusFilter}>
                <SelectTrigger className="bg-card border-border text-foreground w-[120px]" data-testid="select-log-filter">
                  <Filter size={14} className="mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Authorized">Authorized</SelectItem>
                  <SelectItem value="System">System</SelectItem>
                  <SelectItem value="Flagged">Flagged</SelectItem>
                  <SelectItem value="Blocked">Blocked</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </CardHeader>
      <div className="max-h-[500px] overflow-auto">
        {logCategory === "activity" && (
          <Table>
            <TableHeader className="bg-muted sticky top-0 backdrop-blur-sm z-10">
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="text-muted-foreground w-[100px]">Time</TableHead>
                <TableHead className="text-muted-foreground">User</TableHead>
                <TableHead className="text-muted-foreground">Action</TableHead>
                <TableHead className="text-muted-foreground">Target</TableHead>
                <TableHead className="text-muted-foreground text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.map((log) => (
                <TableRow key={log.id} className="border-white/5 hover:bg-white/5 transition-colors" data-testid={`row-log-${log.id}`}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{log.time}</TableCell>
                  <TableCell className="font-medium text-foreground">{log.user}</TableCell>
                  <TableCell className="text-muted-foreground">{log.action}</TableCell>
                  <TableCell className="text-muted-foreground">{log.target || "-"}</TableCell>
                  <TableCell className="text-right">
                    {log.status === 'Authorized' && <span className="text-xs text-green-400 bg-green-950/30 px-2 py-0.5 rounded-full border border-green-900/50">Authorized</span>}
                    {log.status === 'System' && <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full border border-border/50">System</span>}
                    {(log.status === 'Flagged' || log.status === 'Blocked') && (
                      <span className="text-xs text-amber-400 bg-amber-950/30 px-2 py-0.5 rounded-full border border-amber-900/50 flex items-center justify-end gap-1 ml-auto w-fit">
                        <Lock size={10} /> {log.alert || log.status}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filteredLogs.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No logs found.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}

        {logCategory === "discrepancies" && auditData && (
          <Table>
            <TableHeader className="bg-muted sticky top-0 backdrop-blur-sm z-10">
              <TableRow className="border-white/5">
                <TableHead className="text-muted-foreground">Date</TableHead>
                <TableHead className="text-muted-foreground">Care Worker</TableHead>
                <TableHead className="text-muted-foreground">Type</TableHead>
                <TableHead className="text-muted-foreground">Description</TableHead>
                <TableHead className="text-muted-foreground">Action</TableHead>
                <TableHead className="text-muted-foreground">Severity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditData.discrepancies.filter(d => d.careWorker.name.toLowerCase().includes(logSearch.toLowerCase()) || d.description.toLowerCase().includes(logSearch.toLowerCase())).slice(0, 30).map((d) => (
                <TableRow key={d.id} className="border-white/5 hover:bg-white/5">
                  <TableCell className="text-muted-foreground text-xs font-mono">{d.date}</TableCell>
                  <TableCell className="text-foreground">{d.careWorker.name}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{d.type}</Badge></TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-[300px] truncate">{d.description}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{d.action}</TableCell>
                  <TableCell>
                    {d.severity && (
                      <Badge className={d.severity === "high" ? "bg-red-900/50 text-red-300" : d.severity === "medium" ? "bg-amber-900/50 text-amber-300" : "bg-muted text-foreground"}>
                        {d.severity}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {auditData.discrepancies.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No discrepancies recorded.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}

        {logCategory === "suspensions" && auditData && (
          <Table>
            <TableHeader className="bg-muted sticky top-0 backdrop-blur-sm z-10">
              <TableRow className="border-white/5">
                <TableHead className="text-muted-foreground">Date</TableHead>
                <TableHead className="text-muted-foreground">User</TableHead>
                <TableHead className="text-muted-foreground">Admin</TableHead>
                <TableHead className="text-muted-foreground">Duration</TableHead>
                <TableHead className="text-muted-foreground">Reason</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditData.suspensions.filter(s => s.username.toLowerCase().includes(logSearch.toLowerCase())).map((s) => (
                <TableRow key={s.id} className="border-white/5 hover:bg-white/5">
                  <TableCell className="text-muted-foreground text-xs font-mono">{new Date(s.startsAt).toLocaleString()}</TableCell>
                  <TableCell className="text-foreground">{s.username}</TableCell>
                  <TableCell className="text-muted-foreground">{s.adminUsername}</TableCell>
                  <TableCell className="text-muted-foreground">{s.durationMinutes} min</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{s.reason || "-"}</TableCell>
                  <TableCell>
                    {s.reinstatedEarly ? (
                      <Badge variant="outline" className="border-green-500/50 text-green-300">Reinstated</Badge>
                    ) : new Date(s.endsAt) > new Date() ? (
                      <Badge variant="destructive">Active</Badge>
                    ) : (
                      <Badge variant="outline" className="border-border text-muted-foreground">Expired</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {auditData.suspensions.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No suspensions recorded.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}

        {logCategory === "sessions" && auditData && (
          <Table>
            <TableHeader className="bg-muted sticky top-0 backdrop-blur-sm z-10">
              <TableRow className="border-white/5">
                <TableHead className="text-muted-foreground">Login Time</TableHead>
                <TableHead className="text-muted-foreground">User</TableHead>
                <TableHead className="text-muted-foreground">Logout Time</TableHead>
                <TableHead className="text-muted-foreground">Duration</TableHead>
                <TableHead className="text-muted-foreground">Terminated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditData.sessionHistory.filter(s => s.username.toLowerCase().includes(logSearch.toLowerCase())).slice(0, 30).map((s) => (
                <TableRow key={s.id} className="border-white/5 hover:bg-white/5">
                  <TableCell className="text-muted-foreground text-xs font-mono">{new Date(s.loggedInAt).toLocaleString()}</TableCell>
                  <TableCell className="text-foreground">{s.username}</TableCell>
                  <TableCell className="text-muted-foreground text-xs font-mono">{s.loggedOutAt ? new Date(s.loggedOutAt).toLocaleString() : "-"}</TableCell>
                  <TableCell className="text-muted-foreground">{s.durationSeconds ? `${Math.floor(s.durationSeconds / 60)}m` : "-"}</TableCell>
                  <TableCell>{s.terminatedByAdmin ? <Badge variant="destructive" className="text-xs">Admin</Badge> : <span className="text-muted-foreground">-</span>}</TableCell>
                </TableRow>
              ))}
              {auditData.sessionHistory.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No session history.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}

        {logCategory === "risk" && (
          <Table>
            <TableHeader className="bg-muted sticky top-0 backdrop-blur-sm z-10">
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="text-muted-foreground">Date</TableHead>
                <TableHead className="text-muted-foreground">Service User</TableHead>
                <TableHead className="text-muted-foreground">Performed By</TableHead>
                <TableHead className="text-muted-foreground text-center">Offered</TableHead>
                <TableHead className="text-muted-foreground text-center">Selected</TableHead>
                <TableHead className="text-muted-foreground">Skipped Mandatory</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {riskLogs.filter(log => log.serviceUserName.toLowerCase().includes(logSearch.toLowerCase()) || log.performedBy.toLowerCase().includes(logSearch.toLowerCase())).map((log) => (
                <TableRow key={log.id} className="border-white/5 hover:bg-white/5 transition-colors" data-testid={`row-risk-log-${log.id}`}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {new Date(log.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </TableCell>
                  <TableCell>
                    <span className="font-medium text-foreground">{log.serviceUserName}</span>
                  </TableCell>
                  <TableCell>
                    <div>
                      <span className="text-foreground">{log.performedBy}</span>
                      {log.performedByJobTitle && <p className="text-xs text-muted-foreground">{log.performedByJobTitle}</p>}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="bg-muted text-foreground">{log.offeredAssessments?.length || 0}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="bg-green-900/50 text-green-300 border border-green-700/50">{log.selectedAssessments?.length || 0}</Badge>
                  </TableCell>
                  <TableCell>
                    {log.skippedMandatory && log.skippedMandatory.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {log.skippedMandatory.map((item, idx) => <Badge key={idx} variant="destructive" className="text-xs">{item}</Badge>)}
                      </div>
                    ) : (
                      <span className="text-xs text-green-400">None skipped</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {riskLogs.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No risk assessment logs yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>
      <CardFooter className="border-t border-white/5 bg-black/20 py-3">
        <p className="text-xs text-muted-foreground">
          Viewing {getCategoryLabel(logCategory)} • {getCategoryCount(logCategory)} entries
        </p>
      </CardFooter>
    </Card>
  );
}

interface PolicyDocument {
  id: string;
  name: string;
  category: string;
  content: string;
  version: string | null;
  lastUpdated: string;
  createdAt: string;
}

const POLICY_CATEGORIES = [
  { value: "medication", label: "Medication Policy" },
  { value: "emar_audit", label: "EMAR Audit SOP" },
  { value: "visit_audit", label: "Visit Audit SOP" },
  { value: "care_plan", label: "Care Plan Template" },
  { value: "care_tasks", label: "Approved Care Tasks" },
  { value: "initial_assessment", label: "Initial Assessment Template" },
  { value: "risk_assessment", label: "Risk Assessment Guidelines" },
];

function PolicyDocumentsSection() {
  const [documents, setDocuments] = useState<PolicyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadCategory, setUploadCategory] = useState("");
  const [uploadVersion, setUploadVersion] = useState("1.0");
  const { toast } = useToast();

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const response = await fetch("/api/policy-documents", { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setDocuments(data);
      }
    } catch (error) {
      console.error("Failed to fetch policy documents:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!uploadName || !uploadCategory) {
      toast({ title: "Error", description: "Please enter a name and select a category first", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", uploadName);
      formData.append("category", uploadCategory);
      formData.append("version", uploadVersion);

      const response = await fetch("/api/policy-documents/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (response.ok) {
        toast({ title: "Success", description: "Policy document uploaded successfully" });
        setUploadName("");
        setUploadCategory("");
        setUploadVersion("1.0");
        fetchDocuments();
      } else {
        const data = await response.json();
        toast({ title: "Error", description: data.message || "Failed to upload document", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/policy-documents/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        toast({ title: "Success", description: "Policy document deleted" });
        fetchDocuments();
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete document", variant: "destructive" });
    }
  };

  const getCategoryLabel = (category: string) => {
    return POLICY_CATEGORIES.find(c => c.value === category)?.label || category;
  };

  if (loading) {
    return (
      <Card className="bg-card border-white/5 backdrop-blur-sm">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-card border-white/5 backdrop-blur-sm">
        <CardHeader className="border-b border-white/5 bg-black/20">
          <CardTitle className="flex items-center gap-2 text-foreground text-base">
            <Upload size={18} className="text-blue-400" />
            Upload Policy Document
          </CardTitle>
          <CardDescription className="text-muted-foreground text-sm">
            Upload PDF or Word documents containing your facility's policies. These will be used as reference by all AI analysis features.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Input
              placeholder="Document name"
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              className="bg-muted border-border text-foreground"
              data-testid="input-policy-name"
            />
            <Select value={uploadCategory} onValueChange={setUploadCategory}>
              <SelectTrigger className="bg-muted border-border text-foreground" data-testid="select-policy-category">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {POLICY_CATEGORIES.map(cat => (
                  <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Version (e.g., 1.0)"
              value={uploadVersion}
              onChange={(e) => setUploadVersion(e.target.value)}
              className="bg-muted border-border text-foreground"
              data-testid="input-policy-version"
            />
            <div className="relative">
              <input
                type="file"
                accept=".pdf,.docx"
                onChange={handleUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={uploading || !uploadName || !uploadCategory}
                data-testid="input-policy-file"
              />
              <Button 
                className="w-full" 
                disabled={uploading || !uploadName || !uploadCategory}
                data-testid="button-upload-policy"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                {uploading ? "Uploading..." : "Upload File"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-white/5 backdrop-blur-sm overflow-hidden">
        <CardHeader className="border-b border-white/5 bg-black/20">
          <CardTitle className="flex items-center gap-2 text-foreground text-base">
            <FileText size={18} className="text-emerald-400" />
            Uploaded Policy Documents
          </CardTitle>
          <CardDescription className="text-muted-foreground text-sm">
            These documents are injected into AI prompts to ensure analysis follows your facility's specific policies.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="text-muted-foreground font-medium">Name</TableHead>
                <TableHead className="text-muted-foreground font-medium">Category</TableHead>
                <TableHead className="text-muted-foreground font-medium">Version</TableHead>
                <TableHead className="text-muted-foreground font-medium">Last Updated</TableHead>
                <TableHead className="text-muted-foreground font-medium text-center">Content Length</TableHead>
                <TableHead className="text-muted-foreground font-medium text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc) => (
                <TableRow key={doc.id} className="border-white/5 hover:bg-white/5 transition-colors" data-testid={`row-policy-${doc.id}`}>
                  <TableCell className="font-medium text-foreground">{doc.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-blue-900/30 text-blue-300 border-blue-700/50">
                      {getCategoryLabel(doc.category)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{doc.version || "1.0"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(doc.lastUpdated).toLocaleDateString("en-GB")}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="bg-muted/50 text-foreground">
                      {Math.round(doc.content.length / 1000)}K chars
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                      onClick={() => handleDelete(doc.id)}
                      data-testid={`button-delete-policy-${doc.id}`}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {documents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No policy documents uploaded yet. Upload your facility's policies above.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

interface EditingUser {
  id: string;
  username: string;
  role: string;
  status: string;
  jobTitle: string;
  firstName: string;
  lastName: string;
}

export default function SecretAdminPortal() {
  const { users, approveUser, rejectUser, auditLogs, createUser, fetchUsers } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [adminAlerts, setAdminAlerts] = useState<AdminAlert[]>([]);
  const { toast } = useToast();
  
  // New User State
  const [newUserUsername, setNewUserUsername] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState("staff");
  const [newUserJobTitle, setNewUserJobTitle] = useState("");
  const [newUserFirstName, setNewUserFirstName] = useState("");
  const [newUserLastName, setNewUserLastName] = useState("");

  // System Logs State
  const [logSearch, setLogSearch] = useState("");
  const [logStatusFilter, setLogStatusFilter] = useState<string>("all");
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>(auditLogs);

  // User Management State
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<string>("all");
  const [userStatusFilter, setUserStatusFilter] = useState<string>("all");
  const [editingUser, setEditingUser] = useState<EditingUser | null>(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<string | null>(null);

  // System Log Dialog State
  const [systemLogDialogOpen, setSystemLogDialogOpen] = useState(false);
  const [auditCompletionLogs, setAuditCompletionLogs] = useState<Array<{
    id: string;
    auditType: string;
    serviceUserInitials: string;
    auditor: string;
    periodStart: string;
    periodEnd: string;
    createdAt: string;
  }>>([]);

  useEffect(() => {
    setMounted(true);
    fetchAdminAlerts();
  }, []);

  const fetchAuditCompletionLogs = async () => {
    try {
      const response = await fetch("/api/audits", {
        credentials: "include",
      });
      if (response.ok) {
        const audits = await response.json();
        const formattedLogs = audits.map((audit: any) => ({
          id: audit.id,
          auditType: audit.auditType,
          serviceUserInitials: audit.serviceUserName,
          auditor: audit.auditor,
          periodStart: audit.periodStart,
          periodEnd: audit.periodEnd,
          createdAt: audit.createdAt,
        }));
        setAuditCompletionLogs(formattedLogs);
      }
    } catch (error) {
      console.error("Failed to fetch audit logs:", error);
    }
  };

  const handleOpenSystemLogDialog = () => {
    setSystemLogDialogOpen(true);
    fetchAuditCompletionLogs();
  };

  useEffect(() => {
    setSystemLogs(auditLogs);
  }, [auditLogs]);

  const fetchAdminAlerts = async () => {
    try {
      const response = await fetch("/api/admin-alerts", {
        credentials: "include",
      });
      
      if (response.ok) {
        const alerts = await response.json();
        setAdminAlerts(alerts);
      }
    } catch (error) {
      console.error("Failed to fetch admin alerts:", error);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserUsername || !newUserPassword) return;
    
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newUserUsername,
          password: newUserPassword,
          role: newUserRole,
          jobTitle: newUserJobTitle || undefined,
          firstName: newUserFirstName || undefined,
          lastName: newUserLastName || undefined,
        }),
        credentials: "include",
      });

      if (response.ok) {
        await fetchUsers();
        setNewUserUsername("");
        setNewUserPassword("");
        setNewUserRole("staff");
        setNewUserJobTitle("");
        setNewUserFirstName("");
        setNewUserLastName("");
        toast({
          title: "User Created",
          description: `Account for ${newUserUsername} has been created.`,
        });
      } else {
        const data = await response.json();
        toast({
          title: "Creation Failed",
          description: data.message || "Could not create user.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create user.",
        variant: "destructive",
      });
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    
    try {
      const originalUser = users.find(u => u.id === editingUser.id);
      let hasError = false;
      
      // Update username if changed
      if (originalUser && originalUser.username !== editingUser.username) {
        const usernameRes = await fetch(`/api/users/${editingUser.id}/username`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: editingUser.username }),
          credentials: "include",
        });

        if (!usernameRes.ok) {
          const data = await usernameRes.json().catch(() => ({}));
          toast({
            title: "Username Update Failed",
            description: data.message || "Could not update username.",
            variant: "destructive",
          });
          hasError = true;
        }
      }
      
      // Update first/last name
      const nameRes = await fetch(`/api/admin/users/${editingUser.id}/name`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          firstName: editingUser.firstName || null, 
          lastName: editingUser.lastName || null 
        }),
        credentials: "include",
      });

      if (!nameRes.ok) {
        const data = await nameRes.json().catch(() => ({}));
        toast({
          title: "Name Update Failed",
          description: data.message || "Could not update name.",
          variant: "destructive",
        });
        hasError = true;
      }
      
      // Update job title
      const jobTitleRes = await fetch(`/api/users/${editingUser.id}/job-title`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobTitle: editingUser.jobTitle }),
        credentials: "include",
      });

      if (!jobTitleRes.ok) {
        const data = await jobTitleRes.json().catch(() => ({}));
        toast({
          title: "Job Title Update Failed",
          description: data.message || "Could not update job title.",
          variant: "destructive",
        });
        hasError = true;
      }

      // Update role if changed
      if (originalUser && originalUser.role !== editingUser.role) {
        const roleRes = await fetch(`/api/users/${editingUser.id}/role`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: editingUser.role }),
          credentials: "include",
        });

        if (!roleRes.ok) {
          const data = await roleRes.json().catch(() => ({}));
          toast({
            title: "Role Update Failed",
            description: data.message || "Could not update role.",
            variant: "destructive",
          });
          hasError = true;
        }
      }

      await fetchUsers();
      setEditingUser(null);
      
      if (!hasError) {
        toast({
          title: "User Updated",
          description: "User details have been saved.",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update user.",
        variant: "destructive",
      });
    }
  };

  const handleDisconnectSession = async (userId: string, username: string) => {
    try {
      const response = await fetch(`/api/sessions/${userId}/disconnect`, {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        toast({
          title: "Session Disconnected",
          description: `${username}'s session has been terminated.`,
        });
        await fetchUsers();
      } else {
        const data = await response.json();
        toast({
          title: "Disconnect Failed",
          description: data.message || "Could not disconnect user session.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to disconnect session.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        await fetchUsers();
        setDeleteConfirmUser(null);
        toast({
          title: "User Removed",
          description: "The user has been removed from the system.",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete user.",
        variant: "destructive",
      });
    }
  };

  const handleMarkAlertRead = async (alertId: string) => {
    try {
      const response = await fetch(`/api/admin-alerts/${alertId}/read`, {
        method: "PATCH",
        credentials: "include",
      });
      
      if (response.ok) {
        setAdminAlerts(prev => prev.filter(a => a.id !== alertId));
        toast({
          title: "Alert Dismissed",
          description: "Alert marked as read.",
        });
      }
    } catch (error) {
      console.error("Failed to mark alert as read:", error);
    }
  };

  // Filter logs
  const filteredLogs = systemLogs.filter(log => {
    const matchesSearch = logSearch === "" || 
      log.user.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.action.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.target?.toLowerCase().includes(logSearch.toLowerCase());
    
    const matchesStatus = logStatusFilter === "all" || log.status === logStatusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Filter users
  const filteredUsers = users.filter(u => {
    const matchesSearch = userSearch === "" ||
      u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
      (u.jobTitle && u.jobTitle.toLowerCase().includes(userSearch.toLowerCase()));
    
    const matchesRole = userRoleFilter === "all" || u.role === userRoleFilter;
    const matchesStatus = userStatusFilter === "all" || u.status === userStatusFilter;
    
    return matchesSearch && matchesRole && matchesStatus;
  });

  if (!mounted) return null;

  const pendingUsers = users.filter(u => u.status === "pending");
  const activeUsers = users.filter(u => u.status === "active");

  return (
    <div className="space-y-8 animate-in fade-in duration-700 p-2 md:p-8">
      {/* Header - Softer, friendlier design */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-background via-card to-indigo-900/30 border border-white/10 p-8 shadow-2xl">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-5"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 ring-1 ring-white/20">
              <Shield size={32} className="text-white" />
            </div>
            <div>
              <h2 className="text-3xl font-heading font-bold text-foreground tracking-tight">Administrator Controls</h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="border-indigo-500/50 text-indigo-300 bg-indigo-950/30">Level 0 Access</Badge>
                <span className="text-muted-foreground text-sm font-mono">•</span>
                <p className="text-muted-foreground text-sm">Owner Access Only</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3 bg-black/20 backdrop-blur-md px-4 py-2 rounded-full border border-indigo-500/30">
            <div className="h-2 w-2 rounded-full bg-green-400" />
            <span className="text-xs font-medium text-foreground uppercase tracking-wider">System Active</span>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Navigation & Tools */}
        <div className="lg:col-span-8 space-y-8">
          
          {/* Critical Tools Section */}
          <div className="grid md:grid-cols-2 gap-4">
            <Link href="/call-reconciliation">
              <div className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-900/40 to-card border border-blue-500/20 p-6 transition-all hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/10 cursor-pointer">
                <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                  <ArrowRightLeft size={80} />
                </div>
                <div className="relative z-10">
                  <div className="h-10 w-10 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 mb-4 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                    <ArrowRightLeft size={20} />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-1">Call Reconciliation</h3>
                  <p className="text-sm text-muted-foreground">ECM matching interface for admin use only.</p>
                </div>
              </div>
            </Link>

            <Button 
              className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-purple-600 to-purple-800 border border-purple-500/30 p-6 h-auto transition-all hover:from-purple-500 hover:to-purple-700 hover:border-purple-400/50 hover:shadow-lg hover:shadow-purple-500/20 cursor-pointer w-full text-left flex flex-col items-start"
              onClick={handleOpenSystemLogDialog}
              data-testid="button-system-log"
            >
              <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                <Terminal size={80} />
              </div>
              <div className="relative z-10 w-full">
                <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center text-white mb-4">
                  <Terminal size={20} />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-1">System Log</h3>
                <p className="text-sm text-purple-200/80">View audit completion records.</p>
              </div>
            </Button>
          </div>

          {/* Admin Tabs */}
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="bg-card/50 border border-white/5 p-1 rounded-xl mb-6 flex-wrap">
              <TabsTrigger value="overview" className="rounded-lg data-[state=active]:bg-muted data-[state=active]:text-foreground">Overview</TabsTrigger>
              <TabsTrigger value="users" className="rounded-lg data-[state=active]:bg-muted data-[state=active]:text-foreground relative">
                User Management
                {pendingUsers.length > 0 && <span className="absolute -top-1 -right-1 h-2 w-2 bg-amber-500 rounded-full animate-pulse" />}
              </TabsTrigger>
              <TabsTrigger value="presence" className="rounded-lg data-[state=active]:bg-muted data-[state=active]:text-foreground">
                Active Presence
              </TabsTrigger>
              <TabsTrigger value="policies" className="rounded-lg data-[state=active]:bg-muted data-[state=active]:text-foreground">
                <FileText size={14} className="mr-1.5 inline-block" />
                Policy Documents
              </TabsTrigger>
              <TabsTrigger value="ai-costs" className="rounded-lg data-[state=active]:bg-muted data-[state=active]:text-foreground">
                <DollarSign size={14} className="mr-1.5 inline-block" />
                AI Costs
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              
              {/* Private Alert Section */}
              {adminAlerts.length > 0 && (
                <Card className="bg-amber-950/20 border-amber-900/50 backdrop-blur-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-amber-400 flex items-center gap-2">
                      <AlertTriangle /> Priority Staff Alerts
                    </CardTitle>
                    <CardDescription className="text-amber-400/70">
                      Staff members with 3+ discrepancies of the same type.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {adminAlerts.map((alert) => (
                        <div key={alert.id} className="flex items-center justify-between p-3 bg-amber-950/40 rounded border border-amber-900/30" data-testid={`alert-${alert.id}`}>
                          <div>
                            <p className="text-foreground font-bold" data-testid={`alert-name-${alert.careWorkerId}`}>{alert.careWorkerName}</p>
                            <p className="text-xs text-amber-300" data-testid={`alert-message-${alert.id}`}>{alert.discrepancyCount}x {alert.discrepancyType} Discrepancies</p>
                          </div>
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="border-amber-500/50 text-amber-300 hover:bg-amber-950"
                            onClick={() => handleMarkAlertRead(alert.id)}
                            data-testid={`button-dismiss-alert-${alert.id}`}
                          >
                            Dismiss
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid md:grid-cols-3 gap-4">
                {[
                  { label: "Active Users", value: activeUsers.length.toString(), sub: "Currently approved", color: "text-green-500", icon: ShieldCheck },
                  { label: "Pending Approvals", value: pendingUsers.length.toString(), sub: "Awaiting review", color: "text-amber-500", icon: Clock },
                  { label: "Total Logs", value: systemLogs.length.toString(), sub: "Session activity", color: "text-blue-500", icon: Activity }
                ].map((stat, i) => (
                  <Card key={i} className="bg-card border-white/5 backdrop-blur-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                        <stat.icon size={14} className={stat.color} /> {stat.label}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                      <p className="text-xs text-muted-foreground">{stat.sub}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Quick User List */}
              <Card className="bg-card border-white/5 backdrop-blur-sm overflow-hidden">
                <CardHeader className="border-b border-white/5 bg-black/20">
                  <CardTitle className="flex items-center gap-2 text-foreground text-base">
                    <UserPlus size={18} className="text-muted-foreground"/> Active Team Members
                  </CardTitle>
                </CardHeader>
                <div className="max-h-[250px] overflow-auto">
                  <Table>
                    <TableHeader className="bg-muted sticky top-0 backdrop-blur-sm z-10">
                      <TableRow className="border-white/5 hover:bg-transparent">
                        <TableHead className="text-muted-foreground">Username</TableHead>
                        <TableHead className="text-muted-foreground">Job Title</TableHead>
                        <TableHead className="text-muted-foreground">Role</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeUsers.slice(0, 5).map((u) => (
                        <TableRow key={u.id} className="border-white/5 hover:bg-white/5 transition-colors">
                          <TableCell className="font-medium text-foreground">{u.username}</TableCell>
                          <TableCell className="text-muted-foreground">{u.jobTitle || "-"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={u.role === "admin" ? "border-indigo-500/50 text-indigo-300" : "border-border text-foreground"}>
                              {u.role}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="users" className="space-y-6">
              {/* Add New User */}
              <Card className="bg-card border-white/5 backdrop-blur-sm">
                <CardHeader className="border-b border-white/5 bg-black/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-foreground text-base">Add New User</CardTitle>
                      <CardDescription className="text-muted-foreground">Create a new user account with immediate access.</CardDescription>
                    </div>
                    <UserPlus className="text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <form onSubmit={handleCreateUser} className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="space-y-2">
                        <Label className="text-muted-foreground text-xs">First Name</Label>
                        <Input 
                          placeholder="Enter first name" 
                          value={newUserFirstName}
                          onChange={(e) => setNewUserFirstName(e.target.value)}
                          className="bg-card border-border text-foreground" 
                          data-testid="input-new-first-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-muted-foreground text-xs">Last Name</Label>
                        <Input 
                          placeholder="Enter last name" 
                          value={newUserLastName}
                          onChange={(e) => setNewUserLastName(e.target.value)}
                          className="bg-card border-border text-foreground" 
                          data-testid="input-new-last-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-muted-foreground text-xs">Username</Label>
                        <Input 
                          placeholder="Enter username" 
                          value={newUserUsername}
                          onChange={(e) => setNewUserUsername(e.target.value)}
                          className="bg-card border-border text-foreground" 
                          data-testid="input-new-username"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-muted-foreground text-xs">Password</Label>
                        <Input 
                          type="password" 
                          placeholder="Enter password" 
                          value={newUserPassword}
                          onChange={(e) => setNewUserPassword(e.target.value)}
                          className="bg-card border-border text-foreground" 
                          data-testid="input-new-password"
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="space-y-2">
                        <Label className="text-muted-foreground text-xs">Job Title</Label>
                        <Input 
                          placeholder="e.g. Care Coordinator" 
                          value={newUserJobTitle}
                          onChange={(e) => setNewUserJobTitle(e.target.value)}
                          className="bg-card border-border text-foreground" 
                          data-testid="input-new-job-title"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-muted-foreground text-xs">Role</Label>
                        <Select value={newUserRole} onValueChange={setNewUserRole}>
                          <SelectTrigger className="bg-card border-border text-foreground" data-testid="select-new-role">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="staff">Staff</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="md:col-span-2 flex items-end">
                        <Button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white w-full" data-testid="button-create-user">
                          <UserPlus size={16} className="mr-2" /> Create User
                        </Button>
                      </div>
                    </div>
                  </form>
                </CardContent>
              </Card>

              {/* Pending Approvals */}
              {pendingUsers.length > 0 && (
                <Card className="bg-amber-950/20 border-amber-900/30 backdrop-blur-sm">
                  <CardHeader className="border-b border-amber-900/30 bg-black/20">
                    <CardTitle className="text-amber-400 text-base flex items-center gap-2">
                      <Clock size={18} /> Pending Approvals
                      <Badge className="bg-amber-600 text-foreground ml-2">{pendingUsers.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="space-y-2">
                      {pendingUsers.map((u) => (
                        <div key={u.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-foreground">
                              {u.username.substring(0,2).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-foreground">{u.username}</p>
                              <p className="text-xs text-muted-foreground capitalize">{u.role} • Requested access</p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-950/30" onClick={() => rejectUser(u.id)} data-testid={`button-reject-${u.id}`}>
                              <X size={14} />
                            </Button>
                            <Button size="sm" className="h-8 w-8 p-0 bg-green-600 hover:bg-green-500 text-white" onClick={() => approveUser(u.id)} data-testid={`button-approve-${u.id}`}>
                              <Check size={14} />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* All Users Table */}
              <Card className="bg-card border-white/5 backdrop-blur-sm overflow-hidden">
                <CardHeader className="border-b border-white/5 bg-black/20">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <CardTitle className="text-foreground text-base">All Users</CardTitle>
                      <CardDescription className="text-muted-foreground">Manage user accounts, roles, and permissions.</CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                        <Input 
                          placeholder="Search users..."
                          value={userSearch}
                          onChange={(e) => setUserSearch(e.target.value)}
                          className="bg-card border-border text-foreground pl-9 w-[200px]"
                          data-testid="input-user-search"
                        />
                      </div>
                      <Select value={userRoleFilter} onValueChange={setUserRoleFilter}>
                        <SelectTrigger className="bg-card border-border text-foreground w-[100px]" data-testid="select-role-filter">
                          <SelectValue placeholder="Role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Roles</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="staff">Staff</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={userStatusFilter} onValueChange={setUserStatusFilter}>
                        <SelectTrigger className="bg-card border-border text-foreground w-[110px]" data-testid="select-status-filter">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Status</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <div className="max-h-[400px] overflow-auto">
                  <Table>
                    <TableHeader className="bg-muted sticky top-0 backdrop-blur-sm z-10">
                      <TableRow className="border-white/5 hover:bg-transparent">
                        <TableHead className="text-muted-foreground">Username</TableHead>
                        <TableHead className="text-muted-foreground hidden sm:table-cell">Job Title</TableHead>
                        <TableHead className="text-muted-foreground hidden sm:table-cell">Role</TableHead>
                        <TableHead className="text-muted-foreground hidden sm:table-cell">Status</TableHead>
                        <TableHead className="text-muted-foreground hidden md:table-cell">Terms</TableHead>
                        <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map((u) => (
                        <TableRow key={u.id} className="border-white/5 hover:bg-white/5 transition-colors" data-testid={`row-user-${u.id}`}>
                          <TableCell className="font-medium text-foreground" data-testid={`text-username-${u.id}`}>
                            <div>{u.username}</div>
                            <div className="sm:hidden text-xs text-muted-foreground mt-1">
                              {u.role} - {u.status}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground hidden sm:table-cell" data-testid={`text-jobtitle-${u.id}`}>{u.jobTitle || "-"}</TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Badge variant="outline" className={u.role === "admin" ? "border-indigo-500/50 text-indigo-300" : "border-border text-foreground"} data-testid={`badge-role-${u.id}`}>
                              {u.role}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Badge variant="outline" className={u.status === "active" ? "border-green-500/50 text-green-300" : "border-amber-500/50 text-amber-300"} data-testid={`badge-status-${u.id}`}>
                              {u.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden md:table-cell" data-testid={`text-terms-${u.id}`}>
                            {u.termsVersion ? (
                              <div className="flex items-center gap-1.5">
                                <FileCheck size={14} className={u.termsVersion === CURRENT_TERMS_VERSION ? "text-green-400" : "text-amber-400"} />
                                <div className="text-xs">
                                  <span className={u.termsVersion === CURRENT_TERMS_VERSION ? "text-green-300" : "text-amber-300"}>
                                    v{u.termsVersion}
                                  </span>
                                  {u.termsSignatureName && (
                                    <div className="text-foreground font-medium truncate max-w-[120px]" title={u.termsSignatureName}>
                                      {u.termsSignatureName}
                                    </div>
                                  )}
                                  {u.termsSignatureDate && (
                                    <div className="text-muted-foreground">
                                      {u.termsSignatureDate}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-red-400">
                                <FileX size={14} />
                                <span className="text-xs">Not signed</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                onClick={() => setEditingUser({
                                  id: u.id,
                                  username: u.username,
                                  role: u.role,
                                  status: u.status,
                                  jobTitle: u.jobTitle || "",
                                  firstName: u.firstName || "",
                                  lastName: u.lastName || ""
                                })}
                                data-testid={`button-edit-${u.id}`}
                                title="Edit user details"
                              >
                                <Pencil size={14} />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="h-7 w-7 p-0 text-orange-400 hover:text-orange-300 hover:bg-orange-950/30"
                                onClick={() => handleDisconnectSession(u.id, u.username)}
                                title="Disconnect user session"
                                data-testid={`button-disconnect-${u.id}`}
                              >
                                <Unplug size={14} />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="h-7 w-7 p-0 text-amber-400 hover:text-amber-300 hover:bg-amber-950/30"
                                onClick={async () => {
                                  try {
                                    const res = await fetch(`/api/admin/users/${u.id}/reset-password`, {
                                      method: "POST",
                                      credentials: "include"
                                    });
                                    if (res.ok) {
                                      const data = await res.json();
                                      toast({ title: "Password Reset", description: data.message });
                                    } else {
                                      toast({ title: "Error", description: "Failed to reset password", variant: "destructive" });
                                    }
                                  } catch {
                                    toast({ title: "Error", description: "Failed to reset password", variant: "destructive" });
                                  }
                                }}
                                title="Reset password to 'test'"
                                data-testid={`button-reset-password-${u.id}`}
                              >
                                <FileKey size={14} />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:bg-red-950/30"
                                onClick={() => setDeleteConfirmUser(u.id)}
                                data-testid={`button-delete-${u.id}`}
                                title="Delete user"
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredUsers.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            No users found matching your filters.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="presence" className="space-y-6">
              <ActivePresenceSection />
              <BlockedIpsSection />
            </TabsContent>

            <TabsContent value="policies" className="space-y-6">
              <PolicyDocumentsSection />
            </TabsContent>

            <TabsContent value="ai-costs" className="space-y-6">
              <AIProviderSection />
              <AICostSection />
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Column: Status & Info */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="bg-indigo-950/20 border-indigo-900/30 backdrop-blur-sm overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-5">
                <Shield size={120} />
             </div>
             <CardHeader>
                <CardTitle className="text-indigo-300 flex items-center gap-2">
                   <Shield size={18} /> Access Level
                </CardTitle>
             </CardHeader>
             <CardContent className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                   <span className="text-muted-foreground">Access Type</span>
                   <span className="text-indigo-300 font-mono">Level 0 (Owner)</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                   <span className="text-muted-foreground">Session Status</span>
                   <span className="text-green-400 font-mono">ACTIVE</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                   <span className="text-muted-foreground">Session Timeout</span>
                   <span className="text-foreground font-mono">30 minutes</span>
                </div>
                <div className="mt-4 p-3 bg-indigo-950/30 rounded-lg border border-indigo-900/30 text-xs text-indigo-200 leading-relaxed">
                   <strong>Note:</strong> This console provides full administrative access. All actions are logged for your records.
                </div>
             </CardContent>
          </Card>

          <Card className="bg-card border-white/5 backdrop-blur-sm">
             <CardHeader>
                <CardTitle className="text-foreground text-sm flex items-center gap-2">
                   <Activity size={16} className="text-muted-foreground" /> Quick Stats
                </CardTitle>
             </CardHeader>
             <CardContent>
                <div className="space-y-3">
                   <div className="flex items-center justify-between p-2 rounded bg-white/5 border border-white/5">
                      <span className="text-xs text-muted-foreground">Total Users</span>
                      <span className="text-sm font-bold text-foreground">{users.length}</span>
                   </div>
                   <div className="flex items-center justify-between p-2 rounded bg-white/5 border border-white/5">
                      <span className="text-xs text-muted-foreground">Admins</span>
                      <span className="text-sm font-bold text-indigo-300">{users.filter(u => u.role === 'admin').length}</span>
                   </div>
                   <div className="flex items-center justify-between p-2 rounded bg-white/5 border border-white/5">
                      <span className="text-xs text-muted-foreground">Staff</span>
                      <span className="text-sm font-bold text-foreground">{users.filter(u => u.role === 'staff').length}</span>
                   </div>
                </div>
             </CardContent>
          </Card>

          <Card className="bg-red-950/20 border-red-900/30 backdrop-blur-sm">
             <CardHeader>
                <CardTitle className="text-red-300 text-sm flex items-center gap-2">
                   <Trash2 size={16} /> Data Management
                </CardTitle>
             </CardHeader>
             <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">Clear all care worker performance data, discrepancies, audits and alerts.</p>
                <Button 
                  variant="destructive" 
                  size="sm" 
                  className="w-full"
                  onClick={async () => {
                    if (!confirm("Are you sure you want to delete ALL performance data? This cannot be undone.")) return;
                    try {
                      const res = await fetch("/api/admin/reset-performance-data", {
                        method: "POST",
                        credentials: "include"
                      });
                      if (res.ok) {
                        const data = await res.json();
                        toast({ 
                          title: "Data Cleared", 
                          description: `Deleted: ${data.deleted.careWorkers} workers, ${data.deleted.discrepancies} discrepancies, ${data.deleted.audits} audits, ${data.deleted.adminAlerts} alerts` 
                        });
                      } else {
                        toast({ title: "Error", description: "Failed to reset data", variant: "destructive" });
                      }
                    } catch {
                      toast({ title: "Error", description: "Failed to reset data", variant: "destructive" });
                    }
                  }}
                  data-testid="button-reset-performance-data"
                >
                  <Trash2 size={14} className="mr-2" /> Reset All Performance Data
                </Button>
             </CardContent>
          </Card>
        </div>

      </div>

      {/* Edit User Dialog */}
      <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Edit User</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Update user details and permissions.
            </DialogDescription>
          </DialogHeader>
          {editingUser && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">First Name</Label>
                  <Input 
                    value={editingUser.firstName}
                    onChange={(e) => setEditingUser({...editingUser, firstName: e.target.value})}
                    placeholder="Enter first name"
                    className="bg-muted border-border text-foreground"
                    data-testid="input-edit-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Last Name</Label>
                  <Input 
                    value={editingUser.lastName}
                    onChange={(e) => setEditingUser({...editingUser, lastName: e.target.value})}
                    placeholder="Enter last name"
                    className="bg-muted border-border text-foreground"
                    data-testid="input-edit-last-name"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Username</Label>
                <Input 
                  value={editingUser.username}
                  onChange={(e) => setEditingUser({...editingUser, username: e.target.value})}
                  placeholder="Enter username"
                  className="bg-muted border-border text-foreground"
                  data-testid="input-edit-username"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Job Title</Label>
                <Input 
                  value={editingUser.jobTitle}
                  onChange={(e) => setEditingUser({...editingUser, jobTitle: e.target.value})}
                  placeholder="e.g. Care Coordinator"
                  className="bg-muted border-border text-foreground"
                  data-testid="input-edit-job-title"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Role</Label>
                <Select value={editingUser.role} onValueChange={(val) => setEditingUser({...editingUser, role: val})}>
                  <SelectTrigger className="bg-muted border-border text-foreground" data-testid="select-edit-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)} className="border-border text-foreground">
              Cancel
            </Button>
            <Button onClick={handleUpdateUser} className="bg-indigo-600 hover:bg-indigo-500 text-white" data-testid="button-save-user">
              <Save size={16} className="mr-2" /> Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmUser} onOpenChange={() => setDeleteConfirmUser(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Remove User</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Are you sure you want to remove this user? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmUser(null)} className="border-border text-foreground">
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => deleteConfirmUser && handleDeleteUser(deleteConfirmUser)}
              data-testid="button-confirm-delete"
            >
              <Trash2 size={16} className="mr-2" /> Remove User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* System Log Dialog */}
      <Dialog open={systemLogDialogOpen} onOpenChange={setSystemLogDialogOpen}>
        <DialogContent className="bg-card border-border max-w-4xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Terminal size={20} className="text-purple-400" /> System Log
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Audit completion records showing EMAR and Visit audits with service user initials only.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-auto">
            <Table>
              <TableHeader className="bg-muted sticky top-0 backdrop-blur-sm z-10">
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Date</TableHead>
                  <TableHead className="text-muted-foreground">Audit Type</TableHead>
                  <TableHead className="text-muted-foreground">Service User</TableHead>
                  <TableHead className="text-muted-foreground">Auditor</TableHead>
                  <TableHead className="text-muted-foreground">Period</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditCompletionLogs.map((log) => (
                  <TableRow key={log.id} className="border-white/5 hover:bg-white/5 transition-colors" data-testid={`row-audit-log-${log.id}`}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {new Date(log.createdAt).toLocaleDateString("en-GB", { 
                        day: "2-digit", 
                        month: "short", 
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className={log.auditType === "EMAR" 
                          ? "border-blue-500/50 text-blue-300" 
                          : "border-green-500/50 text-green-300"
                        }
                      >
                        {log.auditType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-foreground font-medium">
                      {log.serviceUserInitials}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {log.auditor}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {log.periodStart} - {log.periodEnd}
                    </TableCell>
                  </TableRow>
                ))}
                {auditCompletionLogs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No audit completion logs yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <p className="text-xs text-muted-foreground mr-auto">
              Showing {auditCompletionLogs.length} audit record{auditCompletionLogs.length !== 1 ? 's' : ''}
            </p>
            <Button variant="outline" onClick={() => setSystemLogDialogOpen(false)} className="border-border text-foreground">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
