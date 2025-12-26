import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, ArrowRightLeft, CheckCircle2, AlertCircle, Download, RefreshCw, Lock } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/context/AuthContext";

// Mock data for results
const mockReconciliationResults = [
  { id: "C-1001", user: "Alice Johnson", scheduled: "09:00", actual: "09:05", type: "ECM Match", code: "OK", variance: "None" },
  { id: "C-1002", user: "Bob Smith", scheduled: "10:30", actual: "--:--", type: "Cancelled", code: "VAR-C01", variance: "Hospital Admission" },
  { id: "C-1003", user: "Charlie Brown", scheduled: "--:--", actual: "11:15", type: "Added", code: "VAR-A02", variance: "Emergency Cover" },
  { id: "C-1004", user: "Diana Prince", scheduled: "12:00", actual: "12:45", type: "ECM Match", code: "VAR-L01", variance: "Late Arrival (>30m)" },
  { id: "C-1005", user: "Evan Wright", scheduled: "14:00", actual: "13:55", type: "ECM Match", code: "OK", variance: "None" },
];

export default function CallReconciliation() {
  const { user } = useAuth();
  const [files, setFiles] = useState<{
    ecm: File | null;
    cancelled: File | null;
    added: File | null;
  }>({ ecm: null, cancelled: null, added: null });

  const [step, setStep] = useState<"upload" | "processing" | "results">("upload");

  // Access Control: Only admins can access
  if (user?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-6">
        <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center border border-border">
           <Lock size={40} className="text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">Access Restricted</h2>
          <p className="text-muted-foreground max-w-md">The Call Reconciliation tool contains sensitive operational data and is restricted to Administrators only.</p>
        </div>
        <Button variant="outline" className="border-border hover:bg-muted text-muted-foreground">Return to Dashboard</Button>
      </div>
    );
  }

  const handleFileChange = (type: "ecm" | "cancelled" | "added", file: File | undefined) => {
    if (file) {
      setFiles(prev => ({ ...prev, [type]: file }));
    }
  };

  const handleProcess = () => {
    setStep("processing");
    setTimeout(() => {
      setStep("results");
    }, 3000);
  };

  const UploadBox = ({ title, type, icon: Icon }: { title: string, type: "ecm" | "cancelled" | "added", icon: any }) => (
    <Card className={`glass-card border-2 border-dashed transition-all ${files[type] ? "border-primary/50 bg-primary/10" : "border-border bg-muted hover:border-primary/30 hover:bg-muted"}`}>
      <CardContent className="flex flex-col items-center justify-center p-6 text-center space-y-4 h-full min-h-[200px]">
        <div className={`h-12 w-12 rounded-full flex items-center justify-center ${files[type] ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
          {files[type] ? <CheckCircle2 size={24} /> : <Icon size={24} />}
        </div>
        <div>
          <h3 className="font-semibold text-sm text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {files[type] ? files[type]?.name : "Drag & drop Excel file"}
          </p>
        </div>
        <div className="relative">
          <Button variant={files[type] ? "outline" : "secondary"} size="sm" className="pointer-events-none bg-muted text-muted-foreground border-border">
            {files[type] ? "Change File" : "Select File"}
          </Button>
          <input 
            type="file" 
            accept=".xlsx,.xls,.csv"
            className="absolute inset-0 opacity-0 cursor-pointer"
            onChange={(e) => handleFileChange(type, e.target.files?.[0])}
          />
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-8 max-w-6xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-heading font-bold text-foreground">Call Monitoring Reconciliation</h2>
        <p className="text-muted-foreground">Match Electronic Call Monitoring (ECM) data against Added/Cancelled lists to assign variance codes.</p>
      </div>

      {step === "upload" && (
        <div className="space-y-8">
           <div className="grid md:grid-cols-3 gap-6">
             <UploadBox title="1. ECM Data (Master)" type="ecm" icon={FileSpreadsheet} />
             <UploadBox title="2. Cancelled Calls" type="cancelled" icon={AlertCircle} />
             <UploadBox title="3. Added Calls" type="added" icon={ArrowRightLeft} />
           </div>

           <div className="flex justify-center">
             <Button 
               size="lg" 
               className="w-full md:w-auto min-w-[200px] bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20" 
               disabled={!files.ecm || !files.cancelled || !files.added}
               onClick={handleProcess}
             >
               <RefreshCw className="mr-2 h-4 w-4" /> Run Reconciliation
             </Button>
           </div>
           
           <div className="glass-panel p-4 rounded-lg text-sm text-blue-300 border-blue-500/20 bg-blue-500/10 flex gap-3">
             <div className="mt-1"><CheckCircle2 size={16} /></div>
             <div>
               <strong>How it works:</strong> The system will match call IDs from the master ECM list. If a call is missing in ECM but present in "Added Calls", it will be flagged as an extra visit. If a call is in ECM but marked in "Cancelled Calls", it will be coded as a cancellation variance.
             </div>
           </div>
        </div>
      )}

      {step === "processing" && (
        <Card className="glass-card p-16 flex flex-col items-center justify-center text-center space-y-8">
          <div className="relative">
             <div className="h-20 w-20 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
             <div className="absolute inset-0 flex items-center justify-center text-primary">
                <ArrowRightLeft size={32} className="animate-pulse" />
             </div>
          </div>
          <div className="space-y-3 max-w-lg">
            <h3 className="text-2xl font-semibold text-foreground">Reconciling Data...</h3>
            <p className="text-muted-foreground">
              Matching 1,240 records... <br/>
              Cross-referencing cancellations... <br/>
              Assigning variance codes...
            </p>
          </div>
        </Card>
      )}

      {step === "results" && (
        <div className="space-y-6 animate-in slide-in-from-bottom-8 duration-500">
          <div className="grid md:grid-cols-4 gap-4">
             <Card className="glass-card border-emerald-500/30 bg-emerald-950/20">
                <CardContent className="p-6">
                   <div className="text-2xl font-bold text-emerald-400">98%</div>
                   <p className="text-xs text-emerald-500 font-medium">Match Rate</p>
                </CardContent>
             </Card>
             <Card className="glass-card">
                <CardContent className="p-6">
                   <div className="text-2xl font-bold text-foreground">12</div>
                   <p className="text-xs text-muted-foreground font-medium">Late Variations</p>
                </CardContent>
             </Card>
             <Card className="glass-card">
                <CardContent className="p-6">
                   <div className="text-2xl font-bold text-foreground">5</div>
                   <p className="text-xs text-muted-foreground font-medium">Unplanned Adds</p>
                </CardContent>
             </Card>
             <Card className="glass-card">
                <CardContent className="p-6">
                   <div className="text-2xl font-bold text-foreground">3</div>
                   <p className="text-xs text-muted-foreground font-medium">Cancellations</p>
                </CardContent>
             </Card>
          </div>

          <Card className="glass-card">
             <CardHeader className="flex flex-row items-center justify-between">
                <div>
                   <CardTitle>Reconciliation Report</CardTitle>
                   <CardDescription>Generated variances based on uploaded datasets.</CardDescription>
                </div>
                <Button variant="outline" className="border-border text-muted-foreground hover:bg-muted">
                   <Download className="mr-2 h-4 w-4" /> Export CSV
                </Button>
             </CardHeader>
             <CardContent>
                <Table>
                   <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                         <TableHead className="text-muted-foreground">Call ID</TableHead>
                         <TableHead className="text-muted-foreground">Service User</TableHead>
                         <TableHead className="text-muted-foreground">Scheduled</TableHead>
                         <TableHead className="text-muted-foreground">Actual</TableHead>
                         <TableHead className="text-muted-foreground">Type</TableHead>
                         <TableHead className="text-muted-foreground">Code</TableHead>
                         <TableHead className="text-muted-foreground">Variance Reason</TableHead>
                      </TableRow>
                   </TableHeader>
                   <TableBody>
                      {mockReconciliationResults.map((row) => (
                         <TableRow key={row.id} className="border-border hover:bg-muted">
                            <TableCell className="font-mono text-xs text-muted-foreground">{row.id}</TableCell>
                            <TableCell className="font-medium text-foreground">{row.user}</TableCell>
                            <TableCell className="text-muted-foreground">{row.scheduled}</TableCell>
                            <TableCell className="text-muted-foreground">{row.actual}</TableCell>
                            <TableCell>
                               <Badge variant={row.type === 'ECM Match' ? 'outline' : 'secondary'} className={
                                  row.type === 'Cancelled' ? 'bg-red-950/40 text-red-400 border-red-900/50' : 
                                  row.type === 'Added' ? 'bg-blue-950/40 text-blue-400 border-blue-900/50' : 
                                  'border-border text-muted-foreground'
                               }>
                                  {row.type}
                               </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs font-bold text-muted-foreground">{row.code}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{row.variance}</TableCell>
                         </TableRow>
                      ))}
                   </TableBody>
                </Table>
             </CardContent>
             <CardFooter className="border-t border-border p-4 flex justify-end">
                <Button variant="ghost" className="text-muted-foreground hover:text-foreground" onClick={() => { setStep("upload"); setFiles({ecm: null, cancelled: null, added: null}); }}>
                   Start New Reconciliation
                </Button>
             </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}
