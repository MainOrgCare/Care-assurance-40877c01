import { useCallback, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, ArrowRightLeft, CheckCircle2, Download, Lock, Info, AlertCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

export default function CallReconciliation() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<"upload" | "processing" | "complete">("upload");
  const [error, setError] = useState<string | null>(null);

  if (user?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-6">
        <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center border border-border">
           <Lock size={40} className="text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-foreground">Access Restricted</h2>
          <p className="text-muted-foreground max-w-md">The Call Reconciliation tool contains sensitive operational data and is restricted to Administrators only.</p>
        </div>
        <Link href="/">
          <Button variant="outline" className="border-border hover:bg-muted text-muted-foreground">Return to Dashboard</Button>
        </Link>
      </div>
    );
  }

  const handleFileChange = useCallback((selectedFile: File | undefined) => {
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
    }
  }, []);

  const handleProcess = useCallback(async () => {
    if (!file) return;
    
    setStep("processing");
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/reconciliation/analyze", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to process file");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reconciled_${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      setStep("complete");
      toast({
        title: "Reconciliation Complete",
        description: "Your processed Excel file has been downloaded.",
      });
    } catch (err: any) {
      console.error("Reconciliation error:", err);
      setError(err.message || "An error occurred while processing the file");
      setStep("upload");
      toast({
        title: "Processing Failed",
        description: err.message || "An error occurred",
        variant: "destructive",
      });
    }
  }, [file, toast]);

  const handleReset = useCallback(() => {
    setStep("upload");
    setFile(null);
    setError(null);
  }, []);

  return (
    <div className="page-shell max-w-6xl mx-auto">
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 rounded-xl bg-primary/8 border border-primary/15 flex items-center justify-center shrink-0">
          <ArrowRightLeft className="h-5 w-5 text-primary" />
        </div>
        <div className="space-y-1">
          <h2 className="page-title">Call Monitoring Reconciliation</h2>
          <p className="page-subtitle">Upload your ECM data file to process cancellation reasons and generate variation codes.</p>
        </div>
      </div>

      {step === "upload" && (
        <div className="space-y-8">
           {error && (
             <Card className="glass-card border-red-500/30 bg-red-500/10 max-w-2xl mx-auto">
               <CardContent className="p-4 flex gap-3">
                 <AlertCircle className="text-red-400 shrink-0 mt-0.5" size={18} />
                 <p className="text-sm text-red-300">{error}</p>
               </CardContent>
             </Card>
           )}

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
                   {file ? file.name : "Excel or CSV file with all ECM call data"}
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
                   {file ? "Change File" : "Select File"}
                 </Button>
                 <input 
                   type="file" 
                   accept=".xlsx,.xls,.csv"
                   className="absolute inset-0 opacity-0 cursor-pointer"
                   onChange={(e) => handleFileChange(e.target.files?.[0])}
                   data-testid="input-file-upload"
                   aria-label="Upload spreadsheet file"
                 />
               </div>
             </CardContent>
           </Card>

           <div className="flex justify-center">
             <Button 
               size="lg" 
               className="w-full md:w-auto min-w-[200px] bg-primary hover:bg-primary/90 text-primary-foreground" 
               disabled={!file}
               onClick={handleProcess}
               data-testid="button-run-reconciliation"
             >
               <ArrowRightLeft className="mr-2 h-4 w-4" /> Process and Download
             </Button>
           </div>
           
           <Card className="glass-card border-blue-500/20 bg-blue-500/5 max-w-2xl mx-auto">
             <CardContent className="p-4">
               <div className="flex gap-3">
                 <div className="mt-0.5 text-blue-400"><Info size={18} /></div>
                 <div className="space-y-3 text-sm">
                   <div>
                     <strong className="text-foreground">What this tool does:</strong>
                   </div>
                   <ul className="text-muted-foreground space-y-1 list-disc list-inside">
                     <li>Removes unnecessary columns from your ECM data</li>
                     <li>Converts cancellation reasons to variation codes:
                       <ul className="ml-4 mt-1 space-y-0.5">
                         <li><span className="font-mono text-foreground">L1</span> = Hospital</li>
                         <li><span className="font-mono text-foreground">L4</span> = More than 24 hours notice</li>
                         <li><span className="font-mono text-foreground">L5</span> = Less than 24 hours / Capacity</li>
                       </ul>
                     </li>
                     <li>Marks rows with no service requirement as <span className="font-mono text-foreground">A1</span></li>
                     <li>Creates a new "Variation Reason" column with the codes</li>
                   </ul>
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
            <h3 className="text-2xl font-semibold text-foreground">Processing Data...</h3>
            <p className="text-muted-foreground">
              Reading Excel file... <br/>
              Removing unnecessary columns... <br/>
              Mapping cancellation reasons to codes... <br/>
              Generating output file...
            </p>
          </div>
        </Card>
      )}

      {step === "complete" && (
        <div className="space-y-6 animate-in slide-in-from-bottom-8 duration-500">
          <Card className="glass-card p-12 flex flex-col items-center justify-center text-center space-y-6 max-w-2xl mx-auto">
            <div className="h-20 w-20 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 size={40} className="text-emerald-400" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-semibold text-foreground">Reconciliation Complete</h3>
              <p className="text-muted-foreground">
                Your processed Excel file has been downloaded with variation codes applied.
              </p>
            </div>
            <div className="flex gap-4 flex-wrap justify-center">
              <Button 
                variant="outline" 
                className="border-border"
                onClick={handleReset}
                data-testid="button-new-reconciliation"
              >
                Process Another File
              </Button>
            </div>
          </Card>

          <Card className="glass-card border-blue-500/20 bg-blue-500/5 max-w-2xl mx-auto">
            <CardContent className="p-4">
              <div className="flex gap-3">
                <div className="mt-0.5 text-blue-400"><Download size={18} /></div>
                <div className="text-sm">
                  <strong className="text-foreground">File Downloaded</strong>
                  <p className="text-muted-foreground mt-1">
                    Check your downloads folder for the reconciled Excel file. The new "Variation Reason" column contains the mapped codes.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
