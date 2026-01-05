import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, ArrowRightLeft, CheckCircle2, Download, RefreshCw, Lock, Info } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/AuthContext";

const mockReconciliationResults = [
  { id: "C-1001", user: "Alice Johnson", scheduled: "09:00", actual: "09:05", type: "ECM Match", code: "OK", variance: "None" },
  { id: "C-1002", user: "Bob Smith", scheduled: "10:30", actual: "--:--", type: "Cancelled", code: "VAR-C01", variance: "Hospital Admission" },
  { id: "C-1003", user: "Charlie Brown", scheduled: "--:--", actual: "11:15", type: "Added", code: "VAR-A02", variance: "Emergency Cover" },
  { id: "C-1004", user: "Diana Prince", scheduled: "12:00", actual: "12:45", type: "ECM Match", code: "VAR-L01", variance: "Late Arrival (>30m)" },
  { id: "C-1005", user: "Evan Wright", scheduled: "14:00", actual: "13:55", type: "ECM Match", code: "OK", variance: "None" },
];

export default function CallReconciliation() {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<"upload" | "processing" | "results">("upload");

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

  const handleFileChange = (selectedFile: File | undefined) => {
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const handleProcess = () => {
    setStep("processing");
    setTimeout(() => {
      setStep("results");
    }, 3000);
  };

  const handleReset = () => {
    setStep("upload");
    setFile(null);
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-heading font-bold text-foreground">Call Monitoring Reconciliation</h2>
        <p className="text-muted-foreground">Upload your ECM data file to match against scheduled calls and identify variances.</p>
      </div>

      {step === "upload" && (
        <div className="space-y-8">
           <Card className={`glass-card border-2 border-dashed transition-all max-w-2xl mx-auto ${file ? "border-primary/50 bg-primary/10" : "border-border bg-muted hover:border-primary/30"}`}>
             <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-6">
               <div className={`h-20 w-20 rounded-full flex items-center justify-center ${file ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20 text-muted-foreground"}`}>
                 {file ? <CheckCircle2 size={40} /> : <FileSpreadsheet size={40} />}
               </div>
               <div className="space-y-2">
                 <h3 className="font-semibold text-lg text-foreground">
                   {file ? "File Ready" : "Upload ECM Data File"}
                 </h3>
                 <p className="text-sm text-muted-foreground">
                   {file ? file.name : "Excel file with ECM data, cancelled calls, and added calls"}
                 </p>
                 {file && (
                   <p className="text-xs text-muted-foreground">
                     {(file.size / 1024).toFixed(1)} KB
                   </p>
                 )}
               </div>
               <div className="relative">
                 <Button variant={file ? "outline" : "default"} className={file ? "border-border" : ""}>
                   <Upload className="mr-2 h-4 w-4" />
                   {file ? "Change File" : "Select Excel File"}
                 </Button>
                 <input 
                   type="file" 
                   accept=".xlsx,.xls"
                   className="absolute inset-0 opacity-0 cursor-pointer"
                   onChange={(e) => handleFileChange(e.target.files?.[0])}
                   data-testid="input-file-upload"
                 />
               </div>
             </CardContent>
           </Card>

           <div className="flex justify-center">
             <Button 
               size="lg" 
               className="w-full md:w-auto min-w-[200px] bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20" 
               disabled={!file}
               onClick={handleProcess}
               data-testid="button-run-reconciliation"
             >
               <RefreshCw className="mr-2 h-4 w-4" /> Run Reconciliation
             </Button>
           </div>
           
           <Card className="glass-card border-blue-500/20 bg-blue-500/5 max-w-2xl mx-auto">
             <CardContent className="p-4">
               <div className="flex gap-3">
                 <div className="mt-0.5 text-blue-400"><Info size={18} /></div>
                 <div className="space-y-3 text-sm">
                   <div>
                     <strong className="text-foreground">Expected File Format:</strong>
                     <p className="text-muted-foreground mt-1">Your Excel file should contain the following sheets:</p>
                   </div>
                   <ul className="text-muted-foreground space-y-1 list-disc list-inside">
                     <li><span className="text-foreground font-medium">ECM Data</span> - Master list of all scheduled calls</li>
                     <li><span className="text-foreground font-medium">Cancelled</span> - Calls that were cancelled with reasons</li>
                     <li><span className="text-foreground font-medium">Added</span> - Unscheduled calls that were added</li>
                   </ul>
                   <p className="text-xs text-muted-foreground">
                     Each sheet should include: Call ID, Service User, Scheduled Time, Actual Time, and Reason (where applicable).
                   </p>
                 </div>
               </div>
             </CardContent>
           </Card>
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
              Reading Excel sheets... <br/>
              Matching ECM records... <br/>
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
                   <div className="text-2xl font-bold text-emerald-400" data-testid="text-match-rate">98%</div>
                   <p className="text-xs text-emerald-500 font-medium">Match Rate</p>
                </CardContent>
             </Card>
             <Card className="glass-card">
                <CardContent className="p-6">
                   <div className="text-2xl font-bold text-foreground" data-testid="text-late-variations">12</div>
                   <p className="text-xs text-muted-foreground font-medium">Late Variations</p>
                </CardContent>
             </Card>
             <Card className="glass-card">
                <CardContent className="p-6">
                   <div className="text-2xl font-bold text-foreground" data-testid="text-unplanned-adds">5</div>
                   <p className="text-xs text-muted-foreground font-medium">Unplanned Adds</p>
                </CardContent>
             </Card>
             <Card className="glass-card">
                <CardContent className="p-6">
                   <div className="text-2xl font-bold text-foreground" data-testid="text-cancellations">3</div>
                   <p className="text-xs text-muted-foreground font-medium">Cancellations</p>
                </CardContent>
             </Card>
          </div>

          <Card className="glass-card">
             <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
                <div>
                   <CardTitle>Reconciliation Report</CardTitle>
                   <CardDescription>Generated variances based on uploaded data.</CardDescription>
                </div>
                <Button variant="outline" className="border-border text-muted-foreground hover:bg-muted" data-testid="button-export-csv">
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
                         <TableRow key={row.id} className="border-border hover:bg-muted" data-testid={`row-result-${row.id}`}>
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
                <Button variant="ghost" className="text-muted-foreground hover:text-foreground" onClick={handleReset} data-testid="button-new-reconciliation">
                   Start New Reconciliation
                </Button>
             </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}
