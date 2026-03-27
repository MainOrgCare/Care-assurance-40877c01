import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Terminal, RefreshCw, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search, Download, AlertCircle } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { useDataExport } from "@/hooks/useDataExport";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface SystemLogEntry {
  id: string;
  eventType: string;
  username?: string | null;
  serviceUserInitials?: string | null;
  details?: {
    action?: string;
    target?: string;
    status?: string;
    alert?: string;
  };
  createdAt: string;
}

interface PaginatedResponse {
  logs: SystemLogEntry[];
  total: number;
  page: number;
  totalPages: number;
}

export default function SystemLogs() {
  const [logs, setLogs] = useState<SystemLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;

  const debouncedSearch = useDebounce(search, 300);
  const { toast } = useToast();

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
      if (!response.ok) throw new Error("Failed to fetch system logs");
      const data: PaginatedResponse = await response.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch system logs";
      console.error("Failed to fetch system logs:", error);
      setFetchError(message);
      setLogs([]);
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [page, limit, debouncedSearch, statusFilter, toast]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Reset to page 1 when search or filter changes
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  const goToPage = useCallback((newPage: number) => {
    setPage(Math.max(1, Math.min(newPage, totalPages)));
  }, [totalPages]);

  const { exportCSV } = useDataExport();

  const handleExportLogs = useCallback(() => {
    exportCSV(
      logs as unknown as Record<string, unknown>[],
      [
        { header: "Timestamp", accessor: "createdAt" },
        { header: "Event Type", accessor: "eventType" },
        { header: "Username", accessor: "username" },
        { header: "Service User", accessor: "serviceUserInitials" },
        { header: "Action", accessor: (row) => (row.details as SystemLogEntry["details"])?.action ?? "" },
        { header: "Target", accessor: (row) => (row.details as SystemLogEntry["details"])?.target ?? "" },
        { header: "Status", accessor: (row) => (row.details as SystemLogEntry["details"])?.status ?? "" },
      ],
      `system-logs-${new Date().toISOString().slice(0, 10)}`,
    );
  }, [logs, exportCSV]);

  return (
    <div className="page-shell space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 rounded-xl bg-purple-500/10 border border-purple-500/15 flex items-center justify-center shrink-0">
            <Terminal className="h-5 w-5 text-purple-500" />
          </div>
          <div>
            <h2 className="page-title text-2xl sm:text-3xl">
              System Logs
            </h2>
            <p className="page-subtitle mt-1">
              Full system activity log. Filter by action, target, or status.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={logs.length === 0 ? 0 : -1}>
                  <Button variant="outline" size="sm" onClick={handleExportLogs} disabled={logs.length === 0}>
                    <Download className="mr-2 h-4 w-4" />
                    Export CSV
                  </Button>
                </span>
              </TooltipTrigger>
              {logs.length === 0 && (
                <TooltipContent>
                  <p>No log entries to export</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          <Button variant="outline" onClick={fetchLogs} disabled={loading} aria-label="Refresh system logs">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Search across action, target, user, or alert text. Results update as you type.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[2fr_1fr]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search logs..."
              aria-label="Search system logs"
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
          <CardContent className="py-6">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                <AlertCircle className="h-4 w-4 text-destructive" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Failed to load logs</p>
                <p className="text-xs text-muted-foreground mt-0.5">{fetchError}</p>
              </div>
              <Button variant="outline" size="sm" onClick={fetchLogs}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" /> Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Activity Log</CardTitle>
          <CardDescription>
            Showing {logs.length} of {total} entries (page {page} of {totalPages}).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Alert</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                    No logs match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => {
                  const details = log.details || {};
                  const status = details.status || "System";
                  const action = details.action || log.eventType || "Action";
                  const target = details.target || log.serviceUserInitials || "-";
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell className="text-sm text-foreground">
                        {log.username || "Unknown"}
                      </TableCell>
                      <TableCell className="text-sm text-foreground">{action}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{target}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {details.alert || "-"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages} ({total} total logs)
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => goToPage(1)}
                  disabled={page === 1 || loading}
                  title="First page"
                  aria-label="First page"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => goToPage(page - 1)}
                  disabled={page === 1 || loading}
                  title="Previous page"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-3 text-sm font-medium">{page}</span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => goToPage(page + 1)}
                  disabled={page === totalPages || loading}
                  title="Next page"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => goToPage(totalPages)}
                  disabled={page === totalPages || loading}
                  title="Last page"
                  aria-label="Last page"
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
