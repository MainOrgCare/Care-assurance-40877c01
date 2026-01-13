import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { Loader2, FileText, AlertTriangle, CheckCircle, Clock, BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

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
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">Failed to load compliance data. Please try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const auditList = audits || [];
  
  const emarAudits = auditList.filter(a => a.auditType === "EMAR");
  const visitAudits = auditList.filter(a => a.auditType === "Visit");
  
  const totalDiscrepancies = auditList.reduce((sum, audit) => {
    const results = audit.results as any;
    return sum + (results?.discrepancies?.length || 0);
  }, 0);

  const totalWarnings = auditList.reduce((sum, audit) => {
    const results = audit.results as any;
    return sum + (results?.warnings?.length || 0);
  }, 0);

  const auditTypeData = [
    { name: "EMAR Audits", value: emarAudits.length, color: "#3b82f6" },
    { name: "Visit Audits", value: visitAudits.length, color: "#10b981" },
  ];

  const monthlyData = getMonthlyAuditData(auditList);

  return (
    <div className="page-shell max-w-7xl mx-auto" data-testid="compliance-page">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-heading font-bold text-foreground">Compliance Overview</h2>
        <p className="text-muted-foreground">View audit history, discrepancies, and compliance metrics across all service users.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="stat-total-audits">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Audits</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{auditList.length}</div>
            <p className="text-xs text-muted-foreground">
              {emarAudits.length} EMAR, {visitAudits.length} Visit
            </p>
          </CardContent>
        </Card>

        <Card data-testid="stat-discrepancies">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Discrepancies Found</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalDiscrepancies}</div>
            <p className="text-xs text-muted-foreground">
              Across all audits
            </p>
          </CardContent>
        </Card>

        <Card data-testid="stat-warnings">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Warnings</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalWarnings}</div>
            <p className="text-xs text-muted-foreground">
              Items requiring attention
            </p>
          </CardContent>
        </Card>

        <Card data-testid="stat-compliance-rate">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Compliance Rate</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {auditList.length > 0 ? Math.round(100 - (totalDiscrepancies / Math.max(auditList.length, 1) * 10)) : 100}%
            </div>
            <p className="text-xs text-muted-foreground">
              Based on audit results
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Audits by Month
            </CardTitle>
            <CardDescription>Monthly audit activity over time</CardDescription>
          </CardHeader>
          <CardContent>
            {monthlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs" tick={{ fill: 'currentColor' }} />
                  <YAxis className="text-xs" tick={{ fill: 'currentColor' }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                No audit data available
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Audit Type Distribution</CardTitle>
            <CardDescription>Breakdown of EMAR vs Visit audits</CardDescription>
          </CardHeader>
          <CardContent>
            {auditList.length > 0 ? (
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
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                No audit data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Audits
          </CardTitle>
          <CardDescription>Latest audit reports across all service users</CardDescription>
        </CardHeader>
        <CardContent>
          {auditList.length > 0 ? (
            <div className="space-y-4">
              {auditList.slice(0, 10).map((audit) => {
                const results = audit.results as any;
                const discrepancyCount = results?.discrepancies?.length || 0;
                const warningCount = results?.warnings?.length || 0;
                
                return (
                  <div 
                    key={audit.id} 
                    className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    data-testid={`audit-row-${audit.id}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{audit.serviceUserName}</p>
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
  
  audits.forEach(audit => {
    const date = new Date(audit.createdAt);
    const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    monthCounts[monthKey] = (monthCounts[monthKey] || 0) + 1;
  });

  return Object.entries(monthCounts)
    .map(([month, count]) => ({ month, count }))
    .slice(-6);
}
