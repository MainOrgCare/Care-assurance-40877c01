import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { Loader2, FileText, AlertTriangle, CheckCircle, Clock, BarChart3, Download } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Button } from "@/components/ui/button";
import { useDataExport } from "@/hooks/useDataExport";

interface AuditResults {
  discrepancies?: { length: number }[];
  warnings?: { length: number }[];
  [key: string]: unknown;
}

interface Audit {
  id: string;
  serviceUserName: string;
  auditor: string;
  auditType: string;
  periodStart: string;
  periodEnd: string;
  results: AuditResults | null;
  createdAt: string;
}

export default function Compliance() {
  const { data: audits, isLoading, error } = useQuery<Audit[]>({
    queryKey: ["/api/audits"],
    queryFn: async () => {
      const res = await fetch("/api/audits", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch audits");
      return res.json();
    },
  });

  const { exportCSV } = useDataExport();

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
        <p className="text-sm text-muted-foreground">Loading compliance data&hellip;</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <Card className="border-destructive/30 bg-card">
          <CardContent className="pt-6 flex flex-col items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-destructive/50" />
            <p className="text-sm font-medium text-destructive">Failed to load compliance data. Please try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const auditList: Audit[] = audits ?? [];
  
  const emarAudits = auditList.filter((a: Audit) => a.auditType === "EMAR");
  const visitAudits = auditList.filter((a: Audit) => a.auditType === "Visit");
  
  const totalDiscrepancies = auditList.reduce((sum: number, audit: Audit) => {
    const results = audit.results;
    return sum + (results?.discrepancies?.length || 0);
  }, 0);

  const totalWarnings = auditList.reduce((sum: number, audit: Audit) => {
    const results = audit.results;
    return sum + (results?.warnings?.length || 0);
  }, 0);

  const auditTypeData = [
    { name: "EMAR Audits", value: emarAudits.length, color: "hsl(var(--primary))" },
    { name: "Visit Audits", value: visitAudits.length, color: "hsl(142, 71%, 45%)" },
  ];

  const monthlyData = getMonthlyAuditData(auditList);

  return (
    <div className="page-shell max-w-7xl mx-auto" data-testid="compliance-page">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 className="page-title">Compliance Overview</h2>
          <p className="page-subtitle max-w-lg">View audit history, discrepancies, and compliance metrics across all service users.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={auditList.length === 0}
          onClick={() =>
            exportCSV(
              auditList as unknown as Record<string, unknown>[],
              [
                { header: "Service User", accessor: "serviceUserName" },
                { header: "Auditor", accessor: "auditor" },
                { header: "Audit Type", accessor: "auditType" },
                { header: "Period Start", accessor: "periodStart" },
                { header: "Period End", accessor: "periodEnd" },
                { header: "Created At", accessor: "createdAt" },
              ],
              `compliance-report-${new Date().toISOString().slice(0, 10)}`,
            )
          }
        >
          <Download className="mr-2 h-4 w-4" />
          Export Report
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="stat-total-audits">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
            <CardTitle className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Audits</CardTitle>
            <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-primary/10 shadow-sm">
              <FileText className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent className="pt-0.5">
            <div className="text-[1.625rem] font-bold tracking-tight text-foreground tabular-nums">{auditList.length}</div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {emarAudits.length} EMAR, {visitAudits.length} Visit
            </p>
          </CardContent>
        </Card>

        <Card data-testid="stat-discrepancies">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
            <CardTitle className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Discrepancies Found</CardTitle>
            <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-amber-500/10 shadow-sm">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
          </CardHeader>
          <CardContent className="pt-0.5">
            <div className="text-[1.625rem] font-bold tracking-tight text-foreground tabular-nums">{totalDiscrepancies}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Across all audits</p>
          </CardContent>
        </Card>

        <Card data-testid="stat-warnings">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
            <CardTitle className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Warnings</CardTitle>
            <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-yellow-500/10 shadow-sm">
              <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            </div>
          </CardHeader>
          <CardContent className="pt-0.5">
            <div className="text-[1.625rem] font-bold tracking-tight text-foreground tabular-nums">{totalWarnings}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Items requiring attention</p>
          </CardContent>
        </Card>

        <Card data-testid="stat-compliance-rate">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
            <CardTitle className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Compliance Rate</CardTitle>
            <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-emerald-500/10 shadow-sm">
              <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          </CardHeader>
          <CardContent className="pt-0.5">
            <div className="text-[1.625rem] font-bold tracking-tight text-foreground tabular-nums">
              {auditList.length > 0 ? Math.round(100 - (totalDiscrepancies / Math.max(auditList.length, 1) * 10)) : 100}%
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Based on audit results</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="border-b border-border/30 pb-3 mb-3">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-md bg-primary/8 flex items-center justify-center">
                <BarChart3 className="h-3 w-3 text-primary" />
              </div>
              <div>
                <CardTitle className="text-xs font-semibold">Audits by Month</CardTitle>
                <CardDescription className="text-[10px]">Monthly audit activity over time</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {monthlyData.length > 0 ? (
              <div role="img" aria-label="Bar chart showing monthly audit activity over time">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" className="text-xs" tick={{ fill: 'currentColor', className: 'fill-muted-foreground' }} />
                  <YAxis className="text-xs" tick={{ fill: 'currentColor', className: 'fill-muted-foreground' }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      color: 'hsl(var(--foreground))'
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    itemStyle={{ color: 'hsl(var(--muted-foreground))' }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              </div>
            ) : <div className="flex items-center justify-center h-[250px] text-muted-foreground">No audit data available</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border/30 pb-3 mb-3">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-md bg-secondary/8 flex items-center justify-center">
                <BarChart3 className="h-3 w-3 text-secondary" />
              </div>
              <div>
                <CardTitle className="text-xs font-semibold">Audit Type Distribution</CardTitle>
                <CardDescription className="text-[10px]">Breakdown of EMAR vs Visit audits</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {auditList.length > 0 ? (
              <div role="img" aria-label="Pie chart showing breakdown of EMAR vs Visit audits">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={auditTypeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {auditTypeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }} />
                </PieChart>
              </ResponsiveContainer>
              </div>
            ) : <div className="flex items-center justify-center h-[250px] text-muted-foreground">No audit data available</div>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b border-border/30 pb-3 mb-2">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-primary/8 flex items-center justify-center">
              <Clock className="h-3 w-3 text-primary" />
            </div>
            <div>
              <CardTitle className="text-xs font-semibold">Recent Audits</CardTitle>
              <CardDescription className="text-[10px]">Latest audit reports across all service users</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {auditList.length > 0 ? (
            <div className="space-y-4">
              {auditList.slice(0, 10).map((audit: Audit) => {
                const results = audit.results;
                const discrepancyCount = results?.discrepancies?.length || 0;
                const warningCount = results?.warnings?.length || 0;
                
                return (
                  <div 
                    key={audit.id} 
                    className="flex items-center justify-between p-4 rounded-xl transition-all duration-150 bg-muted/30 hover:bg-muted/50 hover:shadow-sm"
                    data-testid={`audit-row-${audit.id}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-8 w-8 rounded-md flex items-center justify-center bg-primary/8">
                        <FileText className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{audit.serviceUserName}</p>
                        <p className="text-sm text-muted-foreground">
                          {audit.periodStart} - {audit.periodEnd} • Auditor: {audit.auditor}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={audit.auditType === "EMAR" ? "default" : "secondary"}>
                        {audit.auditType}
                      </Badge>
                      {discrepancyCount > 0 && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {discrepancyCount}
                        </Badge>
                      )}
                      {warningCount > 0 && (
                        <Badge variant="outline" className="gap-1 border-yellow-500 text-yellow-600">
                          {warningCount} warnings
                        </Badge>
                      )}
                      {discrepancyCount === 0 && warningCount === 0 && (
                        <Badge variant="outline" className="gap-1 border-green-500 text-green-600">
                          <CheckCircle className="h-3 w-3" />
                          Clean
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <div className="h-14 w-14 mx-auto mb-4 rounded-2xl bg-muted/40 flex items-center justify-center">
                <FileText className="h-6 w-6 text-muted-foreground/30" />
              </div>
              <p className="text-sm font-semibold text-foreground/70">No audits recorded</p>
              <p className="text-xs mt-1.5 text-muted-foreground max-w-xs mx-auto">Complete an EMAR or Visit audit to see compliance results here</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function getMonthlyAuditData(audits: Audit[]) {
  const monthCounts: { [key: string]: number } = {};
  
  audits.forEach((audit: Audit) => {
    const date = new Date(audit.createdAt);
    const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    monthCounts[monthKey] = (monthCounts[monthKey] || 0) + 1;
  });

  return Object.entries(monthCounts)
    .map(([month, count]) => ({ month, count }))
    .slice(-6);
}
