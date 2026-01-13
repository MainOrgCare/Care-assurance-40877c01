import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, ChevronRight, Search, Users, FileText } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();
  const [careWorkers, setCareWorkers] = useState<CareWorkerFromAudits[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const res = await fetch("/api/audits/care-workers", { credentials: "include" });

      if (!res.ok) {
        throw new Error("Failed to fetch data");
      }

      const workers: CareWorkerFromAudits[] = await res.json();
      setCareWorkers(workers);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load care workers",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

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
          <h2 className="text-3xl font-heading font-bold text-foreground">Care Workers</h2>
          <p className="text-muted-foreground mt-2">
            Performance data extracted from saved audits.
          </p>
        </div>
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

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="text-amber-500" size={20} />
            Staff with Discrepancies
          </CardTitle>
          <CardDescription>Staff with recorded discrepancies from saved audits.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : filteredWorkersWithDiscrepancies.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchQuery ? "No staff found matching your search." : (
                <div className="space-y-2">
                  <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                  <p>No discrepancies found in saved audits.</p>
                  <p className="text-sm text-muted-foreground">Complete EMAR or Visit audits to see care worker data here.</p>
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
                    className="hover:bg-white/5 cursor-pointer group"
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
                                  className="p-3 rounded bg-white/5 border border-white/5 text-sm"
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
            <Users className="text-blue-500" size={20} />
            All Care Workers from Audits
          </CardTitle>
          <CardDescription>All care workers mentioned in saved audits.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : filteredAllWorkers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchQuery ? "No care workers found matching your search." : (
                <div className="space-y-2">
                  <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                  <p>No care workers found in saved audits.</p>
                  <p className="text-sm text-muted-foreground">Save EMAR or Visit audits to populate this list.</p>
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
                    className="hover:bg-white/5"
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
                        className={worker.discrepancyCount === 0 ? "bg-green-900/50 text-green-300 border-green-700" : ""}
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
