import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, ChevronRight, Search, Users, FileText, Loader2, Download } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useQuery } from "@tanstack/react-query";
import { useDataExport } from "@/hooks/useDataExport";

interface CareWorkerDiscrepancy {
  date: string;
  type: string;
  issue: string;
  auditId: string;
}

interface CareWorkerFromAudits {
  name: string;
  auditCount: number;
  discrepancyCount: number;
  discrepancies: CareWorkerDiscrepancy[];
  lastSeen: string;
}

export default function CarersList() {
  const [searchQuery, setSearchQuery] = useState("");
  const { exportCSV } = useDataExport();

  const { data: careWorkers = [], isLoading: loading } = useQuery<CareWorkerFromAudits[]>({
    queryKey: ["/api/audits/care-workers"],
    queryFn: async () => {
      const res = await fetch("/api/audits/care-workers", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch data");
      return res.json();
    },
  });

  const workersWithDiscrepancies = careWorkers.filter(w => w.discrepancyCount > 0);
  const allWorkers = careWorkers;

  const filteredWorkersWithDiscrepancies = workersWithDiscrepancies.filter(worker => {
    if (searchQuery === "") return true;
    const query = searchQuery.toLowerCase();
    return worker.name.toLowerCase().includes(query);
  });

  const filteredAllWorkers = allWorkers.filter(worker => {
    if (searchQuery === "") return true;
    const query = searchQuery.toLowerCase();
    return worker.name.toLowerCase().includes(query);
  });

  const getPrimaryType = (worker: CareWorkerFromAudits): string => {
    const typeCounts = new Map<string, number>();
    worker.discrepancies.forEach(d => {
      typeCounts.set(d.type, (typeCounts.get(d.type) || 0) + 1);
    });
    
    let maxCount = 0;
    let primaryType = "";
    typeCounts.forEach((count, type) => {
      if (count > maxCount) {
        maxCount = count;
        primaryType = type;
      }
    });
    
    return primaryType;
  };

  return (
    <div className="page-shell">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="page-title">Care Workers</h2>
          <p className="page-subtitle mt-1">
            Performance data extracted from saved audits.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={careWorkers.length === 0}
            onClick={() =>
              exportCSV(
                careWorkers as unknown as Record<string, unknown>[],
                [
                  { header: "Name", accessor: "name" },
                  { header: "Audit Count", accessor: "auditCount" },
                  { header: "Discrepancy Count", accessor: "discrepancyCount" },
                  { header: "Last Seen", accessor: "lastSeen" },
                ],
                `care-workers-${new Date().toISOString().slice(0, 10)}`,
              )
            }
          >
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <div className="relative w-full md:w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <Input 
            placeholder="Search by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-card border-border"
            data-testid="input-search-carers"
          />
          </div>
        </div>
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="text-amber-500 dark:text-amber-400" size={20} />
            Staff with Discrepancies
          </CardTitle>
          <CardDescription>Staff with recorded discrepancies from saved audits.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading care workers...
            </div>
          ) : filteredWorkersWithDiscrepancies.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {searchQuery ? (
                <div className="space-y-2">
                  <Search className="mx-auto h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm font-medium text-foreground/70">No staff found matching your search</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="h-14 w-14 mx-auto mb-3 rounded-2xl bg-muted/40 flex items-center justify-center">
                    <FileText className="h-6 w-6 text-muted-foreground/30" />
                  </div>
                  <p className="text-sm font-semibold text-foreground/70">No discrepancies found</p>
                  <p className="text-xs text-muted-foreground/60 max-w-xs mx-auto">Complete EMAR or Visit audits to see care worker data here.</p>
                </div>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff Name</TableHead>
                  <TableHead>Last Seen</TableHead>
                  <TableHead>Active Discrepancies</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredWorkersWithDiscrepancies.map((worker) => (
                  <TableRow 
                    key={worker.name} 
                    className="hover:bg-muted/50 cursor-pointer group"
                    data-testid={`row-worker-${worker.name.replace(/\s/g, '-')}`}
                  >
                    <TableCell className="font-medium text-foreground" data-testid={`text-worker-name-${worker.name.replace(/\s/g, '-')}`}>
                      {worker.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {worker.lastSeen || "N/A"}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={worker.discrepancyCount >= 3 ? "destructive" : "secondary"} 
                        className="gap-1"
                        data-testid={`badge-discrepancy-count-${worker.name.replace(/\s/g, '-')}`}
                      >
                        {worker.discrepancyCount >= 3 && <AlertTriangle size={12} />}
                        {worker.discrepancyCount} ({getPrimaryType(worker)})
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Sheet>
                        <SheetTrigger asChild>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            data-testid={`button-view-details-${worker.name.replace(/\s/g, '-')}`}
                          >
                            View Details <ChevronRight size={16} />
                          </Button>
                        </SheetTrigger>
                        <SheetContent>
                          <SheetHeader>
                            <SheetTitle>Discrepancy Log: {worker.name}</SheetTitle>
                          </SheetHeader>
                          <div className="mt-6 space-y-4">
                            {worker.discrepancyCount >= 3 && (
                              <div 
                                className="p-4 bg-red-950/20 border border-red-900/50 rounded-lg flex gap-3 text-red-400 text-sm"
                                data-testid={`alert-threshold-${worker.name.replace(/\s/g, '-')}`}
                              >
                                <AlertTriangle className="shrink-0" />
                                <div>
                                  <strong>High Discrepancy Count</strong>
                                  <p>This staff member has {worker.discrepancyCount} discrepancies recorded in audits.</p>
                                </div>
                              </div>
                            )}
                            
                            <div className="space-y-2">
                              <h4 className="text-sm font-medium text-foreground">Recorded Issues</h4>
                              {worker.discrepancies.map((disc, idx) => (
                                <div 
                                  key={idx} 
                                  className="p-3 rounded-lg text-sm bg-muted/40 border border-border/60"
                                  data-testid={`card-discrepancy-${idx}`}
                                >
                                  <div className="flex justify-between text-muted-foreground text-xs mb-1">
                                    <span>{disc.date}</span>
                                    <span>{disc.type} Audit</span>
                                  </div>
                                  <p className="text-muted-foreground">
                                    {disc.issue}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </SheetContent>
                      </Sheet>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="text-blue-500 dark:text-blue-400" size={20} />
            All Care Workers from Audits
          </CardTitle>
          <CardDescription>All care workers mentioned in saved audits.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading care workers...
            </div>
          ) : filteredAllWorkers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {searchQuery ? (
                <div className="space-y-2">
                  <Search className="mx-auto h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm font-medium text-foreground/70">No care workers found matching your search</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="h-14 w-14 mx-auto mb-3 rounded-2xl bg-muted/40 flex items-center justify-center">
                    <Users className="h-6 w-6 text-muted-foreground/30" />
                  </div>
                  <p className="text-sm font-semibold text-foreground/70">No care workers found</p>
                  <p className="text-xs text-muted-foreground/60 max-w-xs mx-auto">Save EMAR or Visit audits to populate this list.</p>
                </div>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Last Seen</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAllWorkers.map((worker) => (
                  <TableRow 
                    key={worker.name} 
                    className="hover:bg-muted/50"
                    data-testid={`row-all-worker-${worker.name.replace(/\s/g, '-')}`}
                  >
                    <TableCell className="font-medium text-foreground" data-testid={`text-all-worker-name-${worker.name.replace(/\s/g, '-')}`}>
                      {worker.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {worker.lastSeen || "N/A"}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={worker.discrepancyCount === 0 ? "default" : "secondary"}
                        className={worker.discrepancyCount === 0 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" : ""}
                        data-testid={`badge-worker-status-${worker.name.replace(/\s/g, '-')}`}
                      >
                        {worker.discrepancyCount === 0 ? "Compliant" : `${worker.discrepancyCount} issues`}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
