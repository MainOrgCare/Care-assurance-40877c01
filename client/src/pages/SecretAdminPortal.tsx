import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Lock, UserX, Activity, AlertTriangle, Terminal, Check, X, UserPlus, ShieldCheck, ArrowRightLeft, EyeOff, Clock, FileKey, Pencil, Search, Filter, Trash2, Save, FileWarning, Loader2, Unplug, FileText, Upload, FileCheck, FileX, DollarSign, Cpu, TrendingUp, Mail, MailOpen, Archive, ExternalLink, Database, Server, Zap, RefreshCcw, Megaphone, Power, CalendarClock, Download, ChevronDown } from "lucide-react";
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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import AdminDatabasePanel from "@/components/rostering/AdminDatabasePanel";

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

interface AIRequestLog {
  id: string;
  userId: string | null;
  username: string | null;
  endpoint: string;
  featureName: string;
  requestBody: any;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costMicroDollars: number;
  model: string;
  provider: string;
  createdAt: string;
}

interface ContactMessage {
  id: string;
  name: string;
  email: string;
  organisation: string | null;
  message: string;
  isRead: boolean;
  isArchived: boolean;
  readBy: string | null;
  readAt: string | null;
  createdAt: string;
}

type AnnouncementSeverity = "info" | "warning" | "critical";

interface PlatformControlsState {
  maintenanceMode: boolean;
  readOnlyMode: boolean;
  maintenanceActive?: boolean;
  readOnlyActive?: boolean;
  maintenanceMessage: string;
  maintenanceWindowStart: string | null;
  maintenanceWindowEnd: string | null;
  maintenanceWindowActive?: boolean;
  maintenanceWindowUpcoming?: boolean;
  announcementEnabled: boolean;
  announcementText: string;
  announcementSeverity: AnnouncementSeverity;
  updatedAt: string;
  updatedBy: string | null;
}

interface OpsHealthSnapshot {
  generatedAt: string;
  runtime: {
    uptimeSeconds: number;
    nodeVersion: string;
    platform: string;
    loadAverage: number[];
  };
  memory: {
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
    externalMb: number;
    arrayBuffersMb: number;
  };
  sessions: {
    total: number;
    nonAdmin: number;
    webSocketClients: number;
  };
  users: {
    total: number;
    admins: number;
    staff: number;
    active: number;
    pending: number;
    suspended: number;
  };
  alerts: {
    unreadAdminAlerts: number;
    unreadContactMessages: number;
  };
  security: {
    blockedIps: number;
  };
}

interface OpsIncident {
  id: string;
  eventType: string;
  username: string;
  createdAt: string;
  severity: "info" | "warning" | "critical";
  action: string;
  status: string;
}

interface ExtensionPackageInfo {
  manifestVersion: string | null;
  downloadUrl: string;
  package: {
    available: boolean;
    filename: string | null;
    sizeBytes: number | null;
    sha256: string | null;
    packagedAt: string | null;
    rebuilt?: boolean;
  };
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

function formatBytes(bytes: number | null | undefined): string {
  if (typeof bytes !== "number" || Number.isNaN(bytes) || bytes < 0) return "Unavailable";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const PASSWORD_RULES_TEXT = "Password must be at least 8 characters and include a letter and a number.";
const isValidPassword = (value: string): boolean => {
  if (!value || value.length < 8) return false;
  return /[A-Za-z]/.test(value) && /\d/.test(value);
};

function AIAdminLog() {
  const [logs, setLogs] = useState<AIRequestLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [userFilter, setUserFilter] = useState("all");
  const [endpointFilter, setEndpointFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  useEffect(() => {
    fetchAILogs();
  }, []);

  const fetchAILogs = async () => {
    try {
      const response = await fetch("/api/admin/ai-logs", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs || []);
      }
    } catch (error) {
      console.error("Failed to fetch AI logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const uniqueUsers = useMemo(() => {
    const users = new Set<string>();
    logs.forEach(log => {
      if (log.username) users.add(log.username);
    });
    return Array.from(users).sort();
  }, [logs]);

  const uniqueEndpoints = useMemo(() => {
    const endpoints = new Set<string>();
    logs.forEach(log => endpoints.add(log.endpoint));
    return Array.from(endpoints).sort();
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const filtered = logs.filter(log => {
      const matchesSearch = !searchQuery || 
        log.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.endpoint.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.featureName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesUser = userFilter === "all" || log.username === userFilter;
      const matchesEndpoint = endpointFilter === "all" || log.endpoint === endpointFilter;
      return matchesSearch && matchesUser && matchesEndpoint;
    });
    // Reset to page 1 when filters change
    setCurrentPage(1);
    return filtered;
  }, [logs, searchQuery, userFilter, endpointFilter]);

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const displayedLogs = filteredLogs.slice(startIndex, endIndex);

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-GB', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatCost = (microDollars: number) => {
    const dollars = microDollars / 1000000;
    return `$${dollars.toFixed(4)}`;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Terminal className="h-5 w-5" />
          AI Request Log
        </CardTitle>
        <CardDescription>
          Detailed log of all AI requests with full request payloads
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
            />
          </div>
          <Select value={userFilter} onValueChange={setUserFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by user" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              {uniqueUsers.map(user => (
                <SelectItem key={user} value={user}>{user}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={endpointFilter} onValueChange={setEndpointFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Filter by endpoint" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Endpoints</SelectItem>
              {uniqueEndpoints.map(endpoint => (
                <SelectItem key={endpoint} value={endpoint}>
                  {endpoint.replace('/api/', '')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Results count */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {startIndex + 1}-{Math.min(endIndex, filteredLogs.length)} of {filteredLogs.length} requests
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </div>

        {/* Logs */}
        {filteredLogs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Terminal className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p>No AI requests logged yet</p>
          </div>
        ) : (
          <Accordion type="single" collapsible className="space-y-2">
            {displayedLogs.map((log) => (
              <AccordionItem 
                key={log.id} 
                value={log.id}
                className="border rounded-lg bg-muted/30"
              >
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center justify-between w-full pr-4">
                    <div className="flex items-center gap-3 flex-1">
                      <Badge variant="outline" className="font-mono text-xs">
                        {formatTimestamp(log.createdAt)}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {log.username || "Unknown User"}
                      </Badge>
                      <span className="text-sm font-medium text-foreground truncate max-w-[300px]">
                        {log.endpoint.replace('/api/', '')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {log.totalTokens.toLocaleString()} tokens
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {formatCost(log.costMicroDollars)}
                      </Badge>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-3 mt-2">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="font-semibold text-muted-foreground">Feature:</span>
                        <span className="ml-2">{log.featureName}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-muted-foreground">Model:</span>
                        <span className="ml-2">{log.model} ({log.provider})</span>
                      </div>
                      <div>
                        <span className="font-semibold text-muted-foreground">Input Tokens:</span>
                        <span className="ml-2">{log.inputTokens.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-muted-foreground">Output Tokens:</span>
                        <span className="ml-2">{log.outputTokens.toLocaleString()}</span>
                      </div>
                    </div>
                    
                    <div className="border-t pt-3">
                      <div className="font-semibold text-sm mb-2">Request Payload:</div>
                      <pre className="bg-muted p-3 rounded-md overflow-x-auto text-xs font-mono max-h-[400px] overflow-y-auto">
                        {JSON.stringify(log.requestBody, null, 2)}
                      </pre>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}

function AICostSection() {
  const [logs, setLogs] = useState<AiUsageLog[]>([]);
  const [stats, setStats] = useState<AiUsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [logSearch, setLogSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");

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
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const featureColors: Record<string, string> = {
    "emar_metadata": "bg-primary/10 text-primary",
    "emar_entries": "bg-indigo-500/10 text-indigo-500",
    "emar_pass": "bg-purple-500/10 text-purple-500",
    "drug_interactions": "bg-destructive/10 text-destructive",
    "care_plan": "bg-success/10 text-success",
    "risk_assessment": "bg-amber-500/10 text-amber-500",
    "plan_enhancer": "bg-cyan-500/10 text-cyan-500",
  };

  const getFeatureColor = (feature: string): string => {
    for (const [key, color] of Object.entries(featureColors)) {
      if (feature.toLowerCase().includes(key.toLowerCase())) {
        return color;
      }
    }
    return "bg-muted text-muted-foreground";
  };

  const totalCost = stats?.totalCost ?? 0;
  const totalCalls = stats?.totalCalls ?? 0;
  const totalTokens = stats
    ? Object.values(stats.byFeature).reduce((sum, feature) => sum + (feature.tokens || 0), 0)
    : 0;
  const avgCostPerCall = totalCalls > 0 ? totalCost / totalCalls : 0;
  const avgTokensPerCall = totalCalls > 0 ? totalTokens / totalCalls : 0;
  const costPerThousandTokens = totalTokens > 0 ? (totalCost / totalTokens) * 1000 : 0;

  const featureEntries = stats
    ? Object.entries(stats.byFeature).sort((a, b) => b[1].cost - a[1].cost)
    : [];
  const topFeature = featureEntries[0];

  const providerSummary = logs.reduce<Record<string, { calls: number; cost: number; tokens: number }>>(
    (acc, log) => {
      const key = log.provider || "unknown";
      if (!acc[key]) acc[key] = { calls: 0, cost: 0, tokens: 0 };
      acc[key].calls += 1;
      acc[key].cost += log.costMicroDollars || 0;
      acc[key].tokens += log.totalTokens || 0;
      return acc;
    },
    {}
  );
  const providerEntries = Object.entries(providerSummary).sort((a, b) => b[1].cost - a[1].cost);

  const formatProviderLabel = (value: string): string => {
    if (!value || value === "unknown") return "Unknown";
    if (value === "openai") return "OpenAI";
    return "Other Provider";
  };

  const providerBadgeClass = (value: string): string => (
    value === "openai"
      ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10"
      : "border-white/10 text-muted-foreground bg-muted/30"
  );

  const filteredLogs = logs.filter((log) => {
    const searchValue = logSearch.toLowerCase().trim();
    const matchesSearch =
      !searchValue ||
      log.username?.toLowerCase().includes(searchValue) ||
      log.featureName?.toLowerCase().includes(searchValue) ||
      log.model?.toLowerCase().includes(searchValue);
    const matchesProvider =
      providerFilter === "all" ||
      (providerFilter === "openai" && log.provider === "openai") ||
      (providerFilter === "other" && log.provider !== "openai");
    return matchesSearch && matchesProvider;
  });

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider flex items-center gap-2 text-muted-foreground">
              <DollarSign size={14} className="text-success" /> Total Spend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-success">{stats ? formatCost(totalCost) : "$0.00"}</div>
            <p className="text-xs text-muted-foreground">All time AI costs</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider flex items-center gap-2 text-muted-foreground">
              <Cpu size={14} className="text-primary" /> API Calls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-primary">{totalCalls}</div>
            <p className="text-xs text-muted-foreground">Total AI requests</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider flex items-center gap-2 text-muted-foreground">
              <TrendingUp size={14} className="text-purple-600" /> Features Used
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-violet-600">{stats ? Object.keys(stats.byFeature).length : 0}</div>
            <p className="text-xs text-muted-foreground">Unique AI features</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider flex items-center gap-2 text-muted-foreground">
              <Activity size={14} className="text-amber-500" /> Avg Cost / Call
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-amber-600">{formatCost(avgCostPerCall)}</div>
            <p className="text-xs text-muted-foreground">{avgTokensPerCall.toFixed(0)} tokens per call</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider flex items-center gap-2 text-muted-foreground">
              <Cpu size={14} className="text-sky-500" /> Cost Efficiency
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Cost per 1k tokens</span>
              <span className="font-semibold text-foreground">{formatCost(costPerThousandTokens)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total tokens processed</span>
              <span className="font-semibold text-foreground">{totalTokens.toLocaleString()}</span>
            </div>
            {providerEntries.length > 0 && (
              <div className="pt-2 space-y-2 border-t border-border">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Provider Mix</p>
                <div className="flex flex-wrap gap-2">
                  {providerEntries.map(([provider, data]) => (
                    <Badge
                      key={provider}
                      variant="outline"
                      className={providerBadgeClass(provider)}
                    >
                      {formatProviderLabel(provider)} · {formatCost(data.cost)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider flex items-center gap-2 text-muted-foreground">
              <TrendingUp size={14} className="text-emerald-500" /> Top Cost Driver
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topFeature ? (
              <>
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className={getFeatureColor(topFeature[0])}>
                    {topFeature[0].replace(/_/g, " ")}
                  </Badge>
                  <span className="font-semibold text-foreground">{formatCost(topFeature[1].cost)}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {topFeature[1].calls} calls · {topFeature[1].tokens.toLocaleString()} tokens
                </div>
                <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
                  <div
                    className="h-full bg-emerald-400/70"
                    style={{ width: `${Math.max(6, Math.min(100, totalCost > 0 ? (topFeature[1].cost / totalCost) * 100 : 0))}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No AI usage yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {stats && Object.keys(stats.byFeature).length > 0 && (
        <Card>
          <CardHeader className="border-b border-border/30 bg-muted/30">
            <CardTitle className="flex items-center gap-2 text-foreground text-base">
              <DollarSign size={18} className="text-success" />
              Cost Breakdown by Feature
            </CardTitle>
            <CardDescription className="text-muted-foreground text-sm">
              See how much each AI feature costs
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-3">
              {featureEntries.map(([feature, data]) => {
                const share = totalCost > 0 ? (data.cost / totalCost) * 100 : 0;
                const avgCost = data.calls > 0 ? data.cost / data.calls : 0;
                const avgTokens = data.calls > 0 ? data.tokens / data.calls : 0;

                return (
                  <div key={feature} className="p-3 rounded-lg bg-muted/30 border border-border/40 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary" className={getFeatureColor(feature)}>
                          {feature.replace(/_/g, " ")}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {data.calls} calls · {avgTokens.toFixed(0)} tokens/call
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-foreground">{formatCost(data.cost)}</div>
                        <div className="text-xs text-muted-foreground">{formatCost(avgCost)} per call</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-2 flex-1 rounded-full bg-muted/30 overflow-hidden">
                        <div
                          className="h-full bg-background/20"
                          style={{ width: `${Math.max(6, Math.min(100, share))}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">{share.toFixed(1)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

	      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border/30 bg-muted/30">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-foreground text-base">
                <Activity size={18} className="text-primary" />
                Recent AI Calls
              </CardTitle>
              <CardDescription className="text-muted-foreground text-sm">
                Last 100 AI API requests with user and cost info
              </CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  placeholder="Search user, feature, model..."
                  className="pl-9 bg-muted border-border text-foreground placeholder:text-muted-foreground w-[220px]"
                  data-testid="input-ai-usage-search"
                />
              </div>
              <Select value={providerFilter} onValueChange={setProviderFilter}>
                <SelectTrigger className="bg-muted border-border text-foreground w-[160px]" data-testid="select-ai-provider">
                  <SelectValue placeholder="All providers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All providers</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="other">Other providers</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/40 hover:bg-transparent">
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
                {filteredLogs.map((log) => (
                  <TableRow key={log.id} className="border-border/40" data-testid={`ai-log-${log.id}`}>
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
                        className={providerBadgeClass(log.provider)}
                      >
                        {formatProviderLabel(log.provider)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {log.model}
                    </TableCell>
                    <TableCell className="text-right text-foreground">
                      {log.totalTokens.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-success">
                      {formatCost(log.costMicroDollars)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {log.durationMs ? `${(log.durationMs / 1000).toFixed(1)}s` : "-"}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredLogs.length === 0 && (
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
  const [hasOpenAIKey, setHasOpenAIKey] = useState(false);
  const [hasPATKey, setHasPATKey] = useState(false);
  const [hasLocalLLM, setHasLocalLLM] = useState(false);
  const [localLLMUrl, setLocalLLMUrl] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<"openai" | "github" | "local">("openai");
  const [useEmarAgent, setUseEmarAgent] = useState(true);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [updatingEmar, setUpdatingEmar] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const providerRes = await fetch("/api/admin/ai-provider", { credentials: "include" });
      const emarRes = await fetch("/api/admin/emar-agent", { credentials: "include" });
      
      if (providerRes.ok) {
        const data = await providerRes.json();
        setHasOpenAIKey(Boolean(data.hasOpenAIKey));
        setHasPATKey(Boolean(data.hasPATKey));
        setHasLocalLLM(Boolean(data.hasLocalLLM));
        setLocalLLMUrl(data.localLLMUrl || "");
        setSelectedProvider(data.provider || "openai");
      }
      
      if (emarRes.ok) {
        const data = await emarRes.json();
        setUseEmarAgent(Boolean(data.useEmarAgent));
      }
    } catch (error) {
      console.error("Failed to fetch AI settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleProviderChange = async (newProvider: "openai" | "github" | "local") => {
    if (newProvider === selectedProvider) return;
    
    // Check if the target provider is available
    if (newProvider === "openai" && !hasOpenAIKey) {
      alert("OpenAI API key is not configured.");
      return;
    }
    if (newProvider === "github" && !hasPATKey) {
      alert("GitHub AI key (PAT_AI_KEY) is not configured.");
      return;
    }
    if (newProvider === "local" && !hasLocalLLM) {
      alert(`Local LLM not available at ${localLLMUrl}. Ensure the local-llm service is running.`);
      return;
    }
    
    setUpdating(true);
    try {
      const res = await fetch("/api/admin/ai-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ provider: newProvider }),
      });
      
      if (res.ok) {
        setSelectedProvider(newProvider);
      } else {
        const data = await res.json();
        alert(data.message || "Failed to update provider");
      }
    } catch (error) {
      console.error("Failed to update provider:", error);
      alert("Failed to update provider");
    } finally {
      setUpdating(false);
    }
  };

  const handleEmarAgentToggle = async () => {
    const newValue = !useEmarAgent;
    
    setUpdatingEmar(true);
    try {
      const res = await fetch("/api/admin/emar-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ useEmarAgent: newValue }),
      });
      
      if (res.ok) {
        setUseEmarAgent(newValue);
      } else {
        const data = await res.json();
        alert(data.message || "Failed to update EMAR agent preference");
      }
    } catch (error) {
      console.error("Failed to update EMAR agent:", error);
      alert("Failed to update EMAR agent preference");
    } finally {
      setUpdatingEmar(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="border-b border-border/30 bg-muted/30">
        <CardTitle className="flex items-center gap-2 text-foreground text-base">
          <Cpu size={18} className="text-purple-400" />
          AI Configuration
        </CardTitle>
        <CardDescription className="text-muted-foreground text-sm">
          Configure AI provider, EMAR analysis method, and model strategy. All settings take effect immediately.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        <div>
          <h4 className="text-sm font-medium text-foreground mb-3">AI Provider</h4>
          
          {/* Provider Selection */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* OpenAI Card */}
            <button
              onClick={() => handleProviderChange("openai")}
              disabled={updating || !hasOpenAIKey}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                selectedProvider === "openai" 
                  ? "border-emerald-500/50 bg-emerald-50" 
                  : hasOpenAIKey 
                    ? "border-border/40 bg-muted/30 hover:border-emerald-300" 
                    : "border-border/40 bg-muted/40 opacity-60 cursor-not-allowed"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  hasOpenAIKey ? "bg-emerald-500/20" : "bg-muted/50"
                }`}>
                  <Cpu size={20} className={hasOpenAIKey ? "text-emerald-400" : "text-muted-foreground/60"} />
                </div>
                <div>
                  <div className="font-medium text-foreground">OpenAI</div>
                  <div className="text-xs text-muted-foreground">
                    {hasOpenAIKey ? "API configured" : "Key not set"}
                  </div>
                </div>
              </div>
              <Badge
                variant="secondary"
                className={`mt-2 ${
                  selectedProvider === "openai"
                    ? "bg-emerald-500/20 text-emerald-600"
                    : hasOpenAIKey
                      ? "bg-muted/50 text-muted-foreground"
                      : "bg-yellow-100 text-yellow-600"
                }`}
              >
                {!hasOpenAIKey ? "Key Missing" : selectedProvider === "openai" ? "Active" : "Available"}
              </Badge>
            </button>
            
            {/* GitHub AI Card */}
            <button
              onClick={() => handleProviderChange("github")}
              disabled={updating || !hasPATKey}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                selectedProvider === "github" 
                  ? "border-purple-500/50 bg-purple-50" 
                  : hasPATKey 
                    ? "border-border/40 bg-muted/30 hover:border-purple-300" 
                    : "border-border/40 bg-muted/40 opacity-60 cursor-not-allowed"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  hasPATKey ? "bg-purple-500/20" : "bg-muted/50"
                }`}>
                  <Cpu size={20} className={hasPATKey ? "text-purple-400" : "text-muted-foreground/60"} />
                </div>
                <div>
                  <div className="font-medium text-foreground">GitHub AI</div>
                  <div className="text-xs text-muted-foreground">
                    {hasPATKey ? "PAT configured" : "PAT not set"}
                  </div>
                </div>
              </div>
              <Badge
                variant="secondary"
                className={`mt-2 ${
                  selectedProvider === "github"
                    ? "bg-purple-500/20 text-purple-600"
                    : hasPATKey
                      ? "bg-muted/50 text-muted-foreground"
                      : "bg-yellow-100 text-yellow-600"
                }`}
              >
                {!hasPATKey ? "Key Missing" : selectedProvider === "github" ? "Active" : "Available"}
              </Badge>
            </button>
            
            {/* Local LLM Card */}
            <button
              onClick={() => handleProviderChange("local")}
              disabled={updating || !hasLocalLLM}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                selectedProvider === "local" 
                  ? "border-sky-500/50 bg-sky-50" 
                  : hasLocalLLM 
                    ? "border-border/40 bg-muted/30 hover:border-sky-300" 
                    : "border-border/40 bg-muted/40 opacity-60 cursor-not-allowed"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  hasLocalLLM ? "bg-sky-500/20" : "bg-muted/50"
                }`}>
                  <Server size={20} className={hasLocalLLM ? "text-sky-400" : "text-muted-foreground/60"} />
                </div>
                <div>
                  <div className="font-medium text-foreground">Local (Qwen 2.5)</div>
                  <div className="text-xs text-muted-foreground">
                    {hasLocalLLM ? "LLM running" : "Not available"}
                  </div>
                </div>
              </div>
              <Badge
                variant="secondary"
                className={`mt-2 ${
                  selectedProvider === "local"
                    ? "bg-sky-500/20 text-sky-600"
                    : hasLocalLLM
                      ? "bg-muted/50 text-muted-foreground"
                      : "bg-yellow-100 text-yellow-600"
                }`}
              >
                {!hasLocalLLM ? "Offline" : selectedProvider === "local" ? "Active" : "Available"}
              </Badge>
            </button>
          </div>
          
          {updating && (
            <div className="flex items-center justify-center mt-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
              <span className="text-xs text-muted-foreground">Switching provider...</span>
            </div>
          )}
          
          {selectedProvider === "local" && (
            <div className="mt-3 p-3 bg-sky-500/10 rounded-lg border border-sky-500/20">
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Local LLM (Qwen 2.5 7B)</span> - All data stays on your servers. No external API calls. $0 cost. 128K context.
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border/30 pt-6">
          <h4 className="text-sm font-medium text-foreground mb-3">EMAR Analysis Method</h4>
          
          {/* EMAR Agent Toggle */}
          <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30 mb-3">
            <div className="flex items-center gap-3">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground">Use EMAR Agent</span>
                <span className="text-xs text-muted-foreground">
                  Advanced GPT-4.1-mini extraction for thorough discrepancy detection
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {updatingEmar && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              <Switch
                checked={useEmarAgent}
                onCheckedChange={handleEmarAgentToggle}
                disabled={updatingEmar}
              />
            </div>
          </div>
          
          <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
            <div className="text-xs text-muted-foreground space-y-1">
              <div className="flex items-start gap-2">
                <Badge variant="secondary" className="bg-primary/20 text-primary border-primary/30 shrink-0">
                  {useEmarAgent ? "GPT-4.1-mini" : "Standard"}
                </Badge>
                <span className="font-medium text-foreground">
                  {useEmarAgent 
                    ? "Using advanced EMAR agent for maximum accuracy and completeness"
                    : "Using standard extraction (faster, less thorough)"}
                </span>
              </div>
              {useEmarAgent && (
                <div className="ml-[66px] text-xs">
                  • 3-pass consensus extraction<br/>
                  • Drug interaction checks<br/>
                  • Enhanced metadata detection<br/>
                  • Comprehensive discrepancy analysis
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-border/30 pt-6">
          <h4 className="text-sm font-medium text-foreground mb-3">AI Model Strategy</h4>
          <div className="p-4 bg-purple-500/10 rounded-lg border border-purple-500/20">
            <div className="font-medium text-foreground mb-2">Optimized Tiered Approach</div>
            <div className="text-xs text-muted-foreground space-y-2">
              <div className="flex items-start gap-2">
                <Badge variant="secondary" className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30 shrink-0">GPT-4.1-mini</Badge>
                <span>Core EMAR extraction (accuracy critical)</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 shrink-0">GPT-4.1-mini</Badge>
                <span>Count validation, equivalence checks, drug interactions, validation passes (cost-efficient with temperature support)</span>
              </div>
            </div>
          </div>
        </div>

        <AIOptimizationSection />

        <div className="p-3 bg-muted/30 rounded-lg border border-border/40 text-xs text-muted-foreground">
          <strong className="text-foreground">Note:</strong> AI models are automatically selected based on task complexity. 
          Drug interaction checks are computed on each run to avoid reusing previous responses.
          Currently using: <strong className="text-foreground">{selectedProvider === "openai" ? "OpenAI" : selectedProvider === "github" ? "GitHub AI" : "Local (Qwen 2.5)"}</strong> provider
          {useEmarAgent ? " with advanced EMAR agent enabled" : " with standard EMAR extraction"}.
        </div>
      </CardContent>
    </Card>
  );
}

// AI Optimization Settings Component - reduces API calls and costs
function AIOptimizationSection() {
  const [useCache, setUseCache] = useState(true);
  const [useRulesFirst, setUseRulesFirst] = useState(true);
  const [liteMode, setLiteMode] = useState(false);
  const [cacheStats, setCacheStats] = useState<{
    size: number;
    hits: number;
    misses: number;
    hitRate: string;
    tokensSaved: number;
    estimatedCostSaved: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetchOptimizationSettings();
  }, []);

  const fetchOptimizationSettings = async () => {
    try {
      const res = await fetch("/api/admin/ai-optimization", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUseCache(data.useCache);
        setUseRulesFirst(data.useRulesFirst);
        setLiteMode(data.liteMode);
        setCacheStats(data.cacheStats);
      }
    } catch (error) {
      console.error("Failed to fetch AI optimization settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = async (key: string, value: boolean) => {
    setUpdating(true);
    try {
      const res = await fetch("/api/admin/ai-optimization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ [key]: value }),
      });
      if (res.ok) {
        const data = await res.json();
        setUseCache(data.useCache);
        setUseRulesFirst(data.useRulesFirst);
        setLiteMode(data.liteMode);
        setCacheStats(data.cacheStats);
      }
    } catch (error) {
      console.error("Failed to update AI optimization setting:", error);
    } finally {
      setUpdating(false);
    }
  };

  const clearCache = async () => {
    if (!confirm("Clear the entire AI response cache? This will force fresh API calls.")) return;
    setUpdating(true);
    try {
      const res = await fetch("/api/admin/ai-optimization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ clearCacheNow: true }),
      });
      if (res.ok) {
        const data = await res.json();
        setCacheStats(data.cacheStats);
      }
    } catch (error) {
      console.error("Failed to clear cache:", error);
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="border-t border-border/30 pt-6">
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-border/30 pt-6">
      <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
        <Zap size={16} className="text-amber-400" />
        AI Optimization (Cost Reduction)
      </h4>
      
      <div className="space-y-3">
        {/* Cache Toggle */}
        <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
          <div>
            <span className="text-sm font-medium text-foreground">Response Caching</span>
            <p className="text-xs text-muted-foreground">Cache identical AI requests (24h TTL)</p>
          </div>
          <Switch
            checked={useCache}
            onCheckedChange={(v) => { setUseCache(v); updateSetting("useCache", v); }}
            disabled={updating}
          />
        </div>

        {/* Rules-First Toggle */}
        <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
          <div>
            <span className="text-sm font-medium text-foreground">Rules-First Engine</span>
            <p className="text-xs text-muted-foreground">Use deterministic patterns before AI</p>
          </div>
          <Switch
            checked={useRulesFirst}
            onCheckedChange={(v) => { setUseRulesFirst(v); updateSetting("useRulesFirst", v); }}
            disabled={updating}
          />
        </div>

        {/* Lite Mode Toggle */}
        <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
          <div>
            <span className="text-sm font-medium text-foreground">Lite Mode</span>
            <p className="text-xs text-muted-foreground">Minimal prompts for faster/cheaper calls</p>
          </div>
          <Switch
            checked={liteMode}
            onCheckedChange={(v) => { setLiteMode(v); updateSetting("liteMode", v); }}
            disabled={updating}
          />
        </div>
      </div>

      {/* Cache Stats */}
      {cacheStats && (
        <div className="mt-4 p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-foreground">Cache Statistics</span>
            <button
              onClick={clearCache}
              disabled={updating}
              className="text-xs text-destructive hover:text-destructive/80 disabled:opacity-50"
            >
              Clear Cache
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-background/60 rounded p-2 text-center">
              <div className="font-semibold text-foreground">{cacheStats.hitRate}</div>
              <div className="text-muted-foreground">Hit Rate</div>
            </div>
            <div className="bg-background/60 rounded p-2 text-center">
              <div className="font-semibold text-foreground">{cacheStats.tokensSaved.toLocaleString()}</div>
              <div className="text-muted-foreground">Tokens Saved</div>
            </div>
            <div className="bg-background/60 rounded p-2 text-center">
              <div className="font-semibold text-emerald-600">{cacheStats.estimatedCostSaved}</div>
              <div className="text-muted-foreground">Cost Saved</div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-2 text-center">
            {cacheStats.size} entries in cache ({cacheStats.hits} hits / {cacheStats.misses} misses)
          </div>
        </div>
      )}
      
      {/* Feature Benefits Summary */}
      <div className="mt-4 p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
        <span className="text-xs font-medium text-foreground mb-2 block">Optimization Benefits</span>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Response Caching:</span>
            <span className={`font-medium ${useCache ? "text-emerald-600" : "text-muted-foreground"}`}>
              {useCache ? "~30% API cost reduction" : "Disabled"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Rules-First Engine:</span>
            <span className={`font-medium ${useRulesFirst ? "text-emerald-600" : "text-muted-foreground"}`}>
              {useRulesFirst ? "~40% fewer AI calls" : "Disabled"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Lite Mode:</span>
            <span className={`font-medium ${liteMode ? "text-emerald-600" : "text-muted-foreground"}`}>
              {liteMode ? "~25% smaller prompts" : "Disabled"}
            </span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-emerald-500/20">
            <span className="text-muted-foreground font-medium">Estimated Total Savings:</span>
            <span className="font-semibold text-emerald-600">
              ~{((useCache ? 30 : 0) + (useRulesFirst ? 40 : 0) + (liteMode ? 15 : 0))}%
            </span>
          </div>
        </div>
      </div>
    </div>
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
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
	    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/30 bg-muted/30">
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
              <TableRow className="border-border/30 hover:bg-transparent">
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
                <TableRow key={log.id} className="border-border/30 hover:bg-muted/20 transition-colors" data-testid={`row-risk-log-${log.id}`}>
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
                    <Badge variant="secondary" className="bg-success/20 text-success border border-success/30">
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
                      <span className="text-xs text-success">None skipped</span>
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
	      <CardFooter className="border-t py-3 border-border/30 bg-muted/30">
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
      <Card