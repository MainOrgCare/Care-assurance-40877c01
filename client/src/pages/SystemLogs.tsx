import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Terminal, RefreshCw } from "lucide-react";

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

export default function SystemLogs() {
  const [logs, setLogs] = useState<SystemLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/system-logs", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch system logs");
      const data = await response.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to fetch system logs:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return logs.filter((log) => {
      const details = log.details || {};
      const action = (details.action || log.eventType || "").toLowerCase();
      const target = (details.target || log.serviceUserInitials || "").toLowerCase();
      const user = (log.username || "").toLowerCase();
      const alert = (details.alert || "").toLowerCase();
      const status = (details.status || "System").toLowerCase();

      const matchesSearch =
        !query ||
        action.includes(query) ||
        target.includes(query) ||
        user.includes(query) ||
        alert.includes(query);

      const matchesStatus =
        statusFilter === "all" || status === statusFilter.toLowerCase();

      return matchesSearch && matchesStatus;
    });
  }, [logs, search, statusFilter]);

  return (
    <div className="page-shell space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-heading font-bold text-foreground flex items-center gap-2">
            <Terminal className="h-6 w-6 text-purple-400" />
            System Logs
          </h2>
          <p className="text-muted-foreground mt-1">
            Full system activity log. Filter by action, target, or status.
          </p>
        </div>
        <Button variant="outline" onClick={fetchLogs} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Search across action, target, user, or alert text.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[2fr_1fr]">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search logs..."
          />
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

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Activity Log</CardTitle>
          <CardDescription>
            Showing {filteredLogs.length} of {logs.length} entries.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
              {filteredLogs.map((log) => {
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
              })}
              {filteredLogs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                    No logs match your filters.
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
