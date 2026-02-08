import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { Loader2, FileText, AlertTriangle, CheckCircle, Clock, BarChart3, Download } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Button } from "@/components/ui/button";
import { useDataExport } from "@/hooks/useDataExport";

interface Audit {
  id: string;
  serviceUserName: string;
  auditor: string;
  auditType: string;
  periodStart: string;
  periodEnd: string;
  results: any;
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <Card className="border-red-400/55 bg-card">
          <CardContent className="pt-6">
            <p className="text-red-600">Failed to load compliance data. Please try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const auditList: Audit[] = audits ?? [];
  const { exportCSV } = useDataExport();
  
  const emarAudits = auditList.filter((a: Audit) => a.auditType === "EMAR");
  const visitAudits = auditList.filter((a: Audit) => a.auditType === "Visit");
  
  const totalDiscrepancies = auditList.reduce((sum: number, audit: Audit) => {
    const results = audit.results as any;
    return sum + (results?.discrepancies?.length || 0);
  }, 0);

  const totalWarnings = auditList.reduce((sum: number, audit: Audit) => {
    const results = audit.results as any;
    return sum + (results?.warnings?.length || 0);
  }, 0);

  const auditTypeData = [
    { name: "EMAR Audits", value: emarAudits.length, color: "hsl(var(--primary))" },
    { name: "Visit Audits", value: visitAudits.length, color: "hsl(142, 71%, 45%)" },
  ];

  const monthlyData = getMonthlyAuditData(auditList);

  return (
    <div className="page-shell max-w-7xl mx-auto" data-testid="compliance-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h2 className="text-3xl font-heading font-bold text-foreground">Compliance Overview</h2>
          <p className="text-muted-foreground">View audit history, discrepancies, and compliance metrics across all service users.</p>
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
        <Card data-testid="stat-total-audits" className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Audits</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{auditList.length}</div>
            <p className="text-xs text-muted-foreground">
              {emarAudits.length} EMAR, {visitAudits.length} Visit
            </p>
          </CardContent>
        </Card>

        <Card data-testid="stat-discrepancies" className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Discrepancies Found</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{totalDiscrepancies}</div>
            <p className="text-xs text-muted-foreground">
              Across all audits
            </p>
          </CardContent>
        </Card>

        <Card data-testid="stat-warnings" className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Warnings</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{totalWarnings}</div>
            <p className="text-xs text-muted-foreground">
              Items requiring attention
            </p>
          </CardContent>
        </Card>

        <Card data-testid="stat-compliance-rate" className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Compliance Rate</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {auditList.length > 0 ? Math.round(100 - (totalDiscrepancies / Math.max(auditList.length, 1) * 10)) : 100}%
            </div>
            <p className="text-xs text-muted-foreground">
              Based on audit results
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <BarChart3 className="h-5 w-5 text-primary" />
              Audits by Month
            </CardTitle>
            <CardDescription>Monthly audit activity over time</CardDescription>
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

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-foreground">Audit Type Distribution</CardTitle>
            <CardDescription>Breakdown of EMAR vs Visit audits</CardDescription>
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

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Clock className="h-5 w-5 text-primary" />
            Recent Audits
          </CardTitle>
          <CardDescription>Latest audit reports across all service users</CardDescription>
        </CardHeader>
        <CardContent>
          {auditList.length > 0 ? (
            <div className="space-y-4">
              {auditList.slice(0, 10).map((audit: Audit) => {
                const results = audit.results as any;
                const discrepancyCount = results?.discrepancies?.length || 0;
                const warningCount = results?.warnings?.length || 0;
                
                return (
                  <div 
                    key={audit.id} 
                    className="flex items-center justify-between p-4 rounded-lg transition-colors bg-muted/35 hover:bg-muted/55"
                    data-testid={`audit-row-${audit.id}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full flex items-center justify-center bg-primary/10">
                        <FileText className="h-5 w-5 text-primary" />
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
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No audits found</p>
              <p className="text-sm">Complete an EMAR or Visit audit to see results here</p>
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
