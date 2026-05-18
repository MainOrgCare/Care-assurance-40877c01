import { useCallback, useEffect, useMemo, useState } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Shield,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  Download,
  AlertCircle,
  LogIn,
  LogOut,
  UserX,
  KeyRound,
  FileEdit,
  Trash2,
  Settings,
  Eye,
  Globe,
  ChevronDown,
  Activity,
  ShieldAlert,
  Database,
  User,
  Clock,
} from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { useDataExport } from "@/hooks/useDataExport";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface SystemLogEntry {
  id: string;
  eventType: string;
  username?: string | null;
  userId?: string | null;
  serviceUserInitials?: string | null;
  details?: {
    action?: string;
    target?: string;
    status?: string;
    alert?: string;
    ipAddress?: string;
    method?: string;
    path?: string;
    statusCode?: number;
    role?: string;
    endpoint?: string;
    reason?: string;
    resource?: string;
    resourceId?: string;
    [key: string]: unknown;
  };
  createdAt: string;
}

interface PaginatedResponse {
  logs: SystemLogEntry[];
  total: number;
  page: number;
  totalPages: number;
}

// --- Event categorization ---

type EventCategory = "auth" | "security" | "admin" | "data" | "system";
type EventSeverity = "info" | "warning" | "critical";

interface EventMeta {
  category: EventCategory;
  severity: EventSeverity;
  label: string;
  icon: React.ReactNode;
}

function getEventMeta(eventType: string, details?: SystemLogEntry["details"]): EventMeta {
  const status = details?.status?.toLowerCase() || "";
  const type = eventType.toLowerCase();

  if (type === "user_login") {
    return { category: "auth", severity: "info", label: "Login", icon: <LogIn className="h-3.5 w-3.5" /> };
  }
  if (type === "user_logout" || type === "session_disconnect") {
    return { category: "auth", severity: "info", label: "Logout", icon: <LogOut className="h-3.5 w-3.5" /> };
  }
  if (type.startsWith("security_login_failed")) {
    return { category: "security", severity: "warning", label: "Login Failed", icon: <UserX className="h-3.5 w-3.5" /> };
  }
  if (type.startsWith("security_login_blocked") || type.startsWith("security_ip_blocked")) {
    return { category: "security", severity: "critical", label: "Blocked", icon: <ShieldAlert className="h-3.5 w-3.5" /> };
  }
  if (type.startsWith("security_csrf")) {
    return { category: "security", severity: "critical", label: "CSRF Blocked", icon: <ShieldAlert className="h-3.5 w-3.5" /> };
  }
  if (type.startsWith("security_password")) {
    return { category: "security", severity: "warning", label: "Password Change", icon: <KeyRound className="h-3.5 w-3.5" /> };
  }
  if (type.startsWith("security_")) {
    return { category: "security", severity: "warning", label: "Security Event", icon: <Shield className="h-3.5 w-3.5" /> };
  }
  if (type === "admin_action" || type === "admin_action_failed") {
    const method = details?.method || "";
    if (method === "DELETE") {
      return { category: "admin", severity: "warning", label: "Admin Delete", icon: <Trash2 className="h-3.5 w-3.5" /> };
    }
    if (method === "POST" || method === "PUT" || method === "PATCH") {
      return { category: "admin", severity: "info", label: "Admin Change", icon: <FileEdit className="h-3.5 w-3.5" /> };
    }
    return { category: "admin", severity: "info", label: "Admin Action", icon: <Settings className="h-3.5 w-3.5" /> };
  }
  if (type === "audit_completed" || type === "audit_started") {
    return { category: "data", severity: "info", label: "Audit", icon: <Eye className="h-3.5 w-3.5" /> };
  }
  if (type === "data_export") {
    return { category: "data", severity: "info", label: "Data Export", icon: <Download className="h-3.5 w-3.5" /> };
  }
  if (type === "data_mutation") {
    return { category: "data", severity: "info", label: "Data Change", icon: <Database className="h-3.5 w-3.5" /> };
  }
  if (status === "blocked" || status === "flagged") {
    return { category: "security", severity: "critical", label: eventType, icon: <ShieldAlert className="h-3.5 w-3.5" /> };
  }
  return { category: "system", severity: "info", label: eventType.replace(/_/g, " "), icon: <Activity className="h-3.5 w-3.5" /> };
}

function getSeverityColor(severity: EventSeverity): string {
  switch (severity) {
    case "critical": return "text-red-600 dark:text-red-400";
    case "warning": return "text-amber-600 dark:text-amber-400";
    case "info": return "text-muted-foreground";
  }
}

function getCategoryBadge(category: EventCategory) {
  switch (category) {
    case "auth":
      return <Badge variant="outline" className="text-[10px] border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300">Auth</Badge>;
    case "security":
      return <Badge variant="outline" className="text-[10px] border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">Security</Badge>;
    case "admin":
      return <Badge variant="outline" className="text-[10px] border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300">Admin</Badge>;
    case "data":
      return <Badge variant="outline" className="text-[10px] border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Data</Badge>;
    case "system":
      return <Badge variant="outline" className="text-[10px]">System</Badge>;
  }
}

function formatTimestamp(iso: string): { date: string; time: string; relative: string } {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  let relative: string;
  if (diffMin < 1) relative = "Just now";
  else if (diffMin < 60) relative = `${diffMin}m ago`;
  else if (diffMin < 1440) relative = `${Math.floor(diffMin / 60)}h ago`;
  else relative = `${Math.floor(diffMin / 1440)}d ago`;
  return { date, time, relative };
}

export default function SystemLogs() {
  const [logs, setLogs] = useState<SystemLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const limit = 25;

  const debouncedSearch = useDebounce(search, 300);
  const { toast } = useToast();
  usePageTitle("Audit Trail");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        search: debouncedSearch,
        status: statusFilter,
      });
      const response = await fetch(`/api/system-logs?${params}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch audit logs");
      const data: PaginatedResponse = await response.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch audit logs";
      setFetchError(message);
      setLogs([]);
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [page, limit, debouncedSearch, statusFilter, toast]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter, categoryFilter]);

  const goToPage = useCallback((newPage: number) => {
    setPage(Math.max(1, Math.min(newPage, totalPages)));
  }, [totalPages]);

  const toggleRow = useCallback((id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const filteredLogs = useMemo(() => {
    if (categoryFilter === "all") return logs;
    return logs.filter((log) => {
      const meta = getEventMeta(log.eventType, log.details);
      return meta.category === categoryFilter;
    });
  }, [logs, categoryFilter]);

  const stats = useMemo(() => {
    const counts = { auth: 0, security: 0, admin: 0, data: 0, system: 0 };
    for (const log of logs) {
      const meta = getEventMeta(log.eventType, log.details);
      counts[meta.category]++;
    }
    return counts;
  }, [logs]);

  const { exportCSV } = useDataExport();

  const handleExportLogs = useCallback(() => {
    exportCSV(
      filteredLogs as unknown as Record<string, unknown>[],
      [
        { header: "Timestamp", accessor: "createdAt" },
        { header: "Event Type", accessor: "eventType" },
        { header: "Username", accessor: "username" },
        { header: "Service User", accessor: "serviceUserInitials" },
        { header: "Action", accessor: (row) => (row.details as SystemLogEntry["details"])?.action ?? "" },
        { header: "Target", accessor: (row) => (row.details as SystemLogEntry["details"])?.target ?? "" },
        { header: "IP Address", accessor: (row) => (row.details as SystemLogEntry["details"])?.ipAddress ?? "" },
        { header: "Status", accessor: (row) => (row.details as SystemLogEntry["details"])?.status ?? "" },
        { header: "Method", accessor: (row) => (row.details as SystemLogEntry["details"])?.method ?? "" },
        { header: "Path", accessor: (row) => (row.details as SystemLogEntry["details"])?.path ?? "" },
      ],
      `audit-trail-${new Date().toISOString().slice(0, 10)}`,
    );
  }, [filteredLogs, exportCSV]);

  return (
    <div className="page-shell space-y-4">
      <div className="page-header">
        <div className="page-header-copy">
          <div className="page-header-icon">
            <Shield className="h-5 w-5" />
          </div>
          <div className="page-header-copy-body">
            <h2 className="page-title">Audit Trail</h2>
            <p className="page-subtitle">
              Comprehensive activity and security audit log for compliance and governance.
            </p>
          </div>
        </div>
        <div className="page-header-actions">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={filteredLogs.length === 0 ? 0 : -1}>
                  <Button variant="outline" size="sm" onClick={handleExportLogs} disabled={filteredLogs.length === 0}>
                    <Download className="mr-2 h-4 w-4" />
                    Export
                  </Button>
                </span>
              </TooltipTrigger>
              {filteredLogs.length === 0 && (
                <TooltipContent><p>No entries to export</p></TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          <Button variant="outline" onClick={fetchLogs} disabled={loading} aria-label="Refresh audit trail">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary stat chips */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {([
          { key: "auth", label: "Auth", icon: <LogIn className="h-3.5 w-3.5" />, count: stats.auth, color: "text-blue-600" },
          { key: "security", label: "Security", icon: <ShieldAlert className="h-3.5 w-3.5" />, count: stats.security, color: "text-red-600" },
          { key: "admin", label: "Admin", icon: <Settings className="h-3.5 w-3.5" />, count: stats.admin, color: "text-purple-600" },
          { key: "data", label: "Data", icon: <Database className="h-3.5 w-3.5" />, count: stats.data, color: "text-emerald-600" },
          { key: "system", label: "System", icon: <Activity className="h-3.5 w-3.5" />, count: stats.system, color: "text-muted-foreground" },
        ] as const).map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setCategoryFilter(categoryFilter === s.key ? "all" : s.key)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted/50 ${
              categoryFilter === s.key ? "border-primary/40 bg-primary/5" : "border-border"
            }`}
          >
            <span className={s.color}>{s.icon}</span>
            <div className="min-w-0">
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{s.label}</div>
              <div className="text-sm font-bold">{s.count}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-3 grid gap-3 md:grid-cols-[2fr_1fr]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by user, action, target, IP, or event type..."
              aria-label="Search audit trail"
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="authorized">Authorized</SelectItem>
              <SelectItem value="flagged">Flagged</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {fetchError && !loading && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                <AlertCircle className="h-4 w-4 text-destructive" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Failed to load audit trail</p>
                <p className="text-xs text-muted-foreground mt-0.5">{fetchError}</p>
              </div>
              <Button variant="outline" size="sm" onClick={fetchLogs}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" /> Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main audit table */}
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">
              {categoryFilter !== "all" && <span className="capitalize">{categoryFilter} </span>}
              Events
            </CardTitle>
            <CardDescription className="text-xs">
              {filteredLogs.length} of {total} entries • Page {page}/{totalPages}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-8" />
                  <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">When</TableHead>
                  <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Category</TableHead>
                  <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Event</TableHead>
                  <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">User</TableHead>
                  <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Resource</TableHead>
                  <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">IP</TableHead>
                  <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 10 }, (_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                      No audit events match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((log) => {
                    const meta = getEventMeta(log.eventType, log.details);
                    const ts = formatTimestamp(log.createdAt);
                    const details = log.details || {};
                    const ip = details.ipAddress || "";
                    const resource = details.path || details.target || log.serviceUserInitials || "-";
                    const status = details.status || (details.statusCode ? String(details.statusCode) : "");
                    const isExpanded = expandedRows.has(log.id);
                    const hasDetails = Object.keys(details).length > 0;

                    return (
                      <Collapsible key={log.id} open={isExpanded} onOpenChange={() => toggleRow(log.id)} asChild>
                        <>
                          <CollapsibleTrigger asChild>
                            <TableRow
                              className={`cursor-pointer transition-colors ${
                                meta.severity === "critical" ? "bg-red-50/50 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-950/30" :
                                meta.severity === "warning" ? "hover:bg-amber-50/50 dark:hover:bg-amber-950/20" :
                                ""
                              }`}
                            >
                              <TableCell className="w-8 px-2">
                                {hasDetails && (
                                  <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                                )}
                              </TableCell>
                              <TableCell>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="flex items-center gap-1.5">
                                        <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                                        <span className="text-xs text-muted-foreground whitespace-nowrap">{ts.relative}</span>
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="text-xs">
                                      <p>{ts.date} {ts.time}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </TableCell>
                              <TableCell>{getCategoryBadge(meta.category)}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1.5">
                                  <span className={getSeverityColor(meta.severity)}>{meta.icon}</span>
                                  <span className="text-xs font-medium capitalize">{meta.label}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1.5">
                                  <User className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span className="text-xs font-medium">{log.username || "System"}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <span className="text-xs text-muted-foreground font-mono truncate max-w-[180px] block" title={typeof resource === "string" ? resource : ""}>
                                  {typeof resource === "string" && resource.length > 32 ? `...${resource.slice(-30)}` : resource}
                                </span>
                              </TableCell>
                              <TableCell>
                                {ip && (
                                  <div className="flex items-center gap-1">
                                    <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
                                    <span className="text-[10px] text-muted-foreground font-mono">{String(ip).slice(0, 15)}</span>
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                {status && (
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] ${
                                      status === "Blocked" || status === "Flagged" || (Number(status) >= 400)
                                        ? "border-red-200 text-red-700 dark:border-red-800 dark:text-red-300"
                                        : status === "Authorized" || (Number(status) >= 200 && Number(status) < 300)
                                        ? "border-emerald-200 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300"
                                        : ""
                                    }`}
                                  >
                                    {status}
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          </CollapsibleTrigger>
                          <CollapsibleContent asChild>
                            <TableRow className="bg-muted/30 hover:bg-muted/40">
                              <TableCell colSpan={8} className="p-0">
                                <div className="px-6 py-3 space-y-2">
                                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Full Event Details</div>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1.5 text-xs">
                                    <div>
                                      <span className="text-muted-foreground">Event Type:</span>{" "}
                                      <span className="font-mono text-foreground">{log.eventType}</span>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">Timestamp:</span>{" "}
                                      <span className="font-mono text-foreground">{ts.date} {ts.time}</span>
                                    </div>
                                    {details.method && (
                                      <div>
                                        <span className="text-muted-foreground">Method:</span>{" "}
                                        <span className="font-mono font-semibold text-foreground">{details.method}</span>
                                      </div>
                                    )}
                                    {details.path && (
                                      <div>
                                        <span className="text-muted-foreground">Path:</span>{" "}
                                        <span className="font-mono text-foreground">{String(details.path)}</span>
                                      </div>
                                    )}
                                    {details.statusCode && (
                                      <div>
                                        <span className="text-muted-foreground">HTTP Status:</span>{" "}
                                        <span className={`font-mono font-semibold ${Number(details.statusCode) >= 400 ? "text-red-600" : "text-emerald-600"}`}>
                                          {details.statusCode}
                                        </span>
                                      </div>
                                    )}
                                    {details.ipAddress && (
                                      <div>
                                        <span className="text-muted-foreground">IP Address:</span>{" "}
                                        <span className="font-mono text-foreground">{String(details.ipAddress)}</span>
                                      </div>
                                    )}
                                    {details.role && (
                                      <div>
                                        <span className="text-muted-foreground">Role:</span>{" "}
                                        <span className="text-foreground capitalize">{String(details.role)}</span>
                                      </div>
                                    )}
                                    {details.action && (
                                      <div>
                                        <span className="text-muted-foreground">Action:</span>{" "}
                                        <span className="text-foreground">{String(details.action)}</span>
                                      </div>
                                    )}
                                    {log.userId && (
                                      <div>
                                        <span className="text-muted-foreground">User ID:</span>{" "}
                                        <span className="font-mono text-foreground text-[10px]">{log.userId}</span>
                                      </div>
                                    )}
                                    {details.reason && (
                                      <div className="col-span-2">
                                        <span className="text-muted-foreground">Reason:</span>{" "}
                                        <span className="text-foreground">{String(details.reason)}</span>
                                      </div>
                                    )}
                                    {details.alert && (
                                      <div className="col-span-2">
                                        <span className="text-muted-foreground">Alert:</span>{" "}
                                        <span className="text-amber-600 font-medium">{String(details.alert)}</span>
                                      </div>
                                    )}
                                  </div>
                                  {log.serviceUserInitials && (
                                    <div className="text-xs">
                                      <span className="text-muted-foreground">Service User:</span>{" "}
                                      <span className="font-medium text-foreground">{log.serviceUserInitials}</span>
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          </CollapsibleContent>
                        </>
                      </Collapsible>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <p className="text-xs text-muted-foreground">
                Page {page} of {totalPages} ({total} total)
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => goToPage(1)} disabled={page === 1 || loading} title="First page">
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => goToPage(page - 1)} disabled={page === 1 || loading} title="Previous">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="px-2 text-xs font-medium">{page}</span>
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => goToPage(page + 1)} disabled={page === totalPages || loading} title="Next">
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => goToPage(totalPages)} disabled={page === totalPages || loading} title="Last page">
                  <ChevronsRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
