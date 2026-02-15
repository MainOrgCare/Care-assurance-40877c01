import { useState, useEffect, useRef, memo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Copy, ClipboardList, Check, X, AlertTriangle, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import UploadDisclaimer from "@/components/UploadDisclaimer";
import TableCopyButton from "@/components/TableCopyButton";
import { useAuth } from "@/context/AuthContext";
import { useTemporaryData } from "@/context/TemporaryDataContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface DiscrepancyAction {
  performanceNote: boolean;
  meeting: "none" | "phone" | "in_person";
  referToManager: boolean;
}

interface Discrepancy {
  careWorkerName: string;
  date: string;
  issue: string;
  actions: DiscrepancyAction;
}

interface CareCall {
  careWorkerName: string;
  date: string;
  locationOK: boolean;
  expectedTime: string;
  actualTime: string;
  percentageStayed: number;
  compliant: boolean;
  justification: string;
  comment: string;
}

interface VisitAnalysisResult {
  serviceUserName: string;
  auditPeriodStart: string;
  auditPeriodEnd: string;
  hasDiscrepancies: boolean;
  careCalls: CareCall[];
  discrepancies: Discrepancy[];
  themesAndTrends: string;
  gapsInKnowledge: string;
}

function formatDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatCarerName(name: string): string {
  if (!name) return name;
  
  const initialsPattern = /^[A-Z]\.?[A-Z]\.?$/i;
  if (initialsPattern.test(name.replace(/\s/g, ''))) {
    return name;
  }
  
  if (/^[A-Z]\.[A-Z][a-z]+$/i.test(name)) {
    return name;
  }
  
  const parts = name.trim().split(/[\s]+/).filter(p => p.length > 0);
  
  if (parts.length >= 2) {
    const firstName = parts[0];
    const lastName = parts[parts.length - 1];
    const formattedLastName = lastName.charAt(0).toUpperCase() + lastName.slice(1).toLowerCase();
    return `${firstName.charAt(0).toUpperCase()}.${formattedLastName}`;
  }
  
  return name;
}

const CopyButton = memo(function CopyButton({ text, label }: { text: string; label?: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: "Copied", description: label ? `${label} copied to clipboard` : "Copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleCopy} aria-label={label ? `Copy ${label}` : 'Copy to clipboard'} data-testid={`button-copy-${label?.toLowerCase().replace(/\s/g, '-') || 'text'}`}>
      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
    </Button>
  );
});

const CopyableBox = memo(function CopyableBox({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={`bg-muted rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
        <CopyButton text={value} label={label} />
      </div>
      <p className="text-foreground font-medium">{value}</p>
    </div>
  );
});

export default function VisitAudit() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { resetTimer } = useTemporaryData();
  const [file, setFile] = useState<File | null>(null);
  const [documentContent, setDocumentContent] = useState("");
  const [analyzed, setAnalyzed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VisitAnalysisResult | null>(null);
  const prevContentRef = useRef("");
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState("");

  // Throttle progress updates to reduce re-renders during SSE streaming
  const lastProgressUpdateRef = useRef<number>(0);
  const throttledSetProgress = useCallback((percent: number, status: string) => {
    const now = Date.now();
    if (percent === 0 || percent >= 100 || now - lastProgressUpdateRef.current >= 100) {
      lastProgressUpdateRef.current = now;
      setProgress(percent);
      setProgressStatus(status);
    }
  }, []);

  useEffect(() => {
    if (documentContent && !prevContentRef.current) {
      resetTimer();
    }
    prevContentRef.current = documentContent;
  }, [documentContent, resetTimer]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      
      if (selectedFile.type === "application/pdf") {
        setLoading(true);
        try {
          const formData = new FormData();
          formData.append("file", selectedFile);
          
          const res = await fetch("/api/parse-pdf", {
            method: "POST",
            credentials: "include",
            body: formData,
          });
          
          if (!res.ok) {
            throw new Error("Failed to parse PDF");
          }
          
          const data = await res.json();
          setDocumentContent(data.text);
          resetTimer();
          toast({ title: "PDF Loaded", description: "Document content extracted successfully." });
        } catch (error: any) {
          toast({
            title: "PDF Error",
            description: error.message || "Failed to read PDF file",
            variant: "destructive",
          });
        } finally {
          setLoading(false);
        }
      } else {
        const reader = new FileReader();
        reader.onload = (event) => {
          const content = event.target?.result as string;
          setDocumentContent(content);
          resetTimer();
        };
        reader.readAsText(selectedFile);
      }
    }
  };

  const processAudit = async () => {
    if (!documentContent) {
      toast({ 
        title: "Missing Information", 
        description: "Please upload or paste visit log content",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    setProgress(0);
    setProgressStatus("Preparing document...");
    
    try {
      const res = await fetch("/api/ai/analyze-visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ documentContent }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Analysis failed");
      }

      // Handle SSE streaming response
      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error("Failed to get response reader");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let analysisResult = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Parse complete SSE messages (event: type\ndata: {...}\n\n)
        const messages = buffer.split("\n\n");
        buffer = messages.pop() || ""; // Keep incomplete message in buffer
        
        for (const message of messages) {
          if (!message.trim()) continue;
          
          const lines = message.split("\n");
          let eventType = "";
          let dataStr = "";
          
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.substring(7).trim();
            } else if (line.startsWith("data: ")) {
              dataStr = line.substring(6);
            }
          }
          
          if (eventType && dataStr) {
            try {
              const data = JSON.parse(dataStr);
              if (eventType === "progress") {
                throttledSetProgress(data.percent, data.status);
              } else if (eventType === "result") {
                setProgress(100);
                setProgressStatus("Complete!");
                analysisResult = data;
              } else if (eventType === "error") {
                throw new Error(data.message);
              }
            } catch (e) {
              if (eventType === "error") {
                throw new Error("Analysis failed");
              }
            }
          }
        }
      }

      // Process any remaining buffer after stream ends
      if (buffer.trim()) {
        const lines = buffer.split("\n");
        let eventType = "";
        let dataStr = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.substring(7).trim();
          } else if (line.startsWith("data: ")) {
            dataStr = line.substring(6);
          }
        }
        if (eventType === "result" && dataStr) {
          try {
            const data = JSON.parse(dataStr);
            setProgress(100);
            setProgressStatus("Complete!");
            analysisResult = data;
          } catch { /* ignore parse errors */ }
        }
      }

      if (!analysisResult) {
        throw new Error("No result received from analysis");
      }
      
      const formattedResult = {
        ...analysisResult,
        careCalls: analysisResult.careCalls?.map((call: CareCall) => ({
          ...call,
          careWorkerName: formatCarerName(call.careWorkerName),
        })) || [],
        discrepancies: analysisResult.discrepancies?.map((disc: Discrepancy) => ({
          ...disc,
          careWorkerName: formatCarerName(disc.careWorkerName),
        })) || [],
      };
      
      setResult(formattedResult);
      setAnalyzed(true);
      setLoading(false);
      // Keep 100% visible briefly before hiding
      setTimeout(() => {
        setProgress(0);
        setProgressStatus("");
      }, 1000);
      toast({ title: "Analysis Complete", description: "Visit logs processed successfully." });
    } catch (error: any) {
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to analyze document",
        variant: "destructive",
      });
      setLoading(false);
      setProgress(0);
      setProgressStatus("");
    }
  };

  const saveAudit = async () => {
    if (!user || !result) return;
    
    try {
      setLoading(true);

      const auditData = {
        serviceUserName: result.serviceUserName,
        auditor: user.username,
        auditType: "Visit",
        periodStart: result.auditPeriodStart,
        periodEnd: result.auditPeriodEnd,
        results: result,
      };

      const auditRes = await fetch("/api/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(auditData),
      });

      if (!auditRes.ok) throw new Error("Failed to save audit");

      toast({ 
        title: "Audit Saved", 
        description: "Audit results have been recorded." 
      });

      setAnalyzed(false);
      setFile(null);
      setDocumentContent("");
      setResult(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save audit",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getActionsText = (actions: DiscrepancyAction): string => {
    const parts: string[] = [];
    if (actions.performanceNote) parts.push("Performance Note");
    if (actions.meeting === "phone") parts.push("Phone Meeting");
    if (actions.meeting === "in_person") parts.push("In-Person Meeting");
    if (actions.referToManager) parts.push("Refer to Registered Manager");
    return parts.join(", ") || "None";
  };

  const getDiscrepanciesByCarer = () => {
    if (!result?.discrepancies) return {};
    const grouped: { [key: string]: Discrepancy[] } = {};
    result.discrepancies.forEach(d => {
      if (!grouped[d.careWorkerName]) {
        grouped[d.careWorkerName] = [];
      }
      grouped[d.careWorkerName].push(d);
    });
    return grouped;
  };

  const getAllDiscrepanciesText = () => {
    if (!result?.discrepancies) return "";
    const grouped = getDiscrepanciesByCarer();
    return Object.entries(grouped).map(([carer, discs]) => {
      const discLines = discs.map(d => `  - ${d.date}: ${d.issue} [${getActionsText(d.actions)}]`).join('\n');
      return `${carer}:\n${discLines}`;
    }).join('\n\n');
  };

  const getDiscrepanciesTableFormat = () => {
    if (!result?.discrepancies) return "";
    const header = "Care Worker\tDate\tIssue\tActions Required";
    const rows = result.discrepancies.map(d => 
      `${d.careWorkerName}\t${d.date}\t${d.issue}\t${getActionsText(d.actions)}`
    );
    return [header, ...rows].join('\n');
  };

  const getCareCallsTableFormat = () => {
    if (!result?.careCalls) return "";
    const header = "Care Worker\tDate\tLocation OK\tExpected Time\tActual Time\tStayed %\tCompliant\tComments";
    const rows = result.careCalls.map(call => 
      `${call.careWorkerName}\t${call.date}\t${call.locationOK ? 'Yes' : 'No'}\t${call.expectedTime}\t${call.actualTime}\t${call.percentageStayed}%\t${call.compliant ? 'Yes' : 'No'}\t${call.comment}`
    );
    return [header, ...rows].join('\n');
  };

  const getCareCallsText = () => {
    if (!result?.careCalls) return "";
    return result.careCalls.map(call => 
      `${call.careWorkerName} | ${call.date} | Location: ${call.locationOK ? 'Yes' : 'No'} | ${call.expectedTime} -> ${call.actualTime} (${call.percentageStayed}%) | ${call.compliant ? 'Compliant' : 'Non-compliant'} | ${call.comment}`
    ).join('\n');
  };

  const auditorDisplay = user?.jobTitle 
    ? `${user.username} (${user.jobTitle})` 
    : `${user?.username} (${user?.role === 'admin' ? 'Admin' : 'Staff'})`;

  return (
    <div className="page-shell max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 animate-slide-up stagger-1">
        <div className="space-y-1">
          <h1 className="page-title leading-tight">Visit Audit</h1>
          <p className="page-subtitle max-w-prose">
            Autonomous verification of care delivery through GPS and duration telemetry.
          </p>
        </div>
      </div>

      {!analyzed ? (
        <Card className="animate-slide-up stagger-2 mt-6">
          <CardHeader className="border-b border-border/40 pb-6">
            <CardTitle className="flex items-center gap-3">
              <div className="h-7 w-7 rounded-md flex items-center justify-center bg-primary/8">
                <ClipboardList className="h-3.5 w-3.5 text-primary" />
              </div>
              Intelligence Intake
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="space-y-3">
              <Label htmlFor="visit-log-content" className="text-xs font-black uppercase tracking-widest text-muted-foreground px-1">Raw Telemetry / Log Data</Label>
              <Textarea
                id="visit-log-content"
                placeholder="Paste your visit log data here or upload a file below...

The AI will automatically extract:
- Service user identity
- Operational window (date range)
- Care call vectors (carer, time, GPS status)
- Compliance score and discrepancy map"
                value={documentContent}
                onChange={(e) => setDocumentContent(e.target.value)}
                className="bg-muted/20 border-border/40 min-h-[300px] font-mono text-xs leading-relaxed rounded-2xl resize-none focus:ring-primary/20"
                data-testid="textarea-visit-content"
              />
            </div>

            <div className="flex flex-wrap items-center gap-4 p-4 rounded-2xl bg-muted/20 border border-border/40">
              <div className="flex-1 min-w-[240px]">
                <Input
                  type="file"
                  onChange={handleFileChange}
                  accept=".pdf,.txt,.csv,.xlsx,.xls"
                  className="bg-background border-border/60 rounded-xl"
                  data-testid="input-file-upload"
                />
              </div>
              <Button onClick={processAudit} disabled={loading || !documentContent} className="h-12 px-8 rounded-xl font-medium tracking-tight shadow-glow group" data-testid="button-analyze">
                {loading ? (
                  <>
                    <Loader2 className="mr-2.5 h-4.5 w-4.5 animate-spin" />
                    DECODING...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2.5 h-4.5 w-4.5" />
                    PROCESS AUDIT
                  </>
                )}
              </Button>
            </div>

            {loading && (
              <div className="space-y-4 p-5 bg-primary/5 border border-primary/10 rounded-xl" data-testid="progress-container" aria-live="polite" role="status">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-primary animate-ping" />
                    <span className="text-xs font-semibold uppercase tracking-widest text-primary">{progressStatus}</span>
                  </div>
                  <span className="text-sm font-black text-primary">{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-1.5 bg-primary/10" />
              </div>
            )}

            <div className="pt-4 border-t border-border/40">
              <UploadDisclaimer />
            </div>
          </CardContent>
        </Card>
      ) : result && (
        <div className="space-y-6 animate-slide-up">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <CopyableBox label="Service User" value={result.serviceUserName} className="border-border/40 rounded-xl" />
            <CopyableBox label="Auditor" value={auditorDisplay} className="border-border/40 rounded-xl" />
            <CopyableBox label="Operational Start" value={result.auditPeriodStart} className="border-border/40 rounded-xl" />
            <CopyableBox label="Operational End" value={result.auditPeriodEnd} className="border-border/40 rounded-xl" />
          </div>

          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 pb-6">
              <CardTitle className="flex items-center gap-3">
                <div className="h-7 w-7 rounded-md flex items-center justify-center bg-primary/8">
                  <ClipboardList className="h-3.5 w-3.5 text-primary" />
                </div>
                Operational Telemetry
              </CardTitle>
              <div className="flex items-center gap-3">
                <TableCopyButton text={getCareCallsTableFormat()} label="care-calls-table" />
                <CopyButton text={getCareCallsText()} label="all-care-calls" />
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="overflow-x-auto rounded-xl border border-border/40">
                <Table aria-label="Care calls audit results">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Care Worker</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-center">Location OK?</TableHead>
                      <TableHead>Expected</TableHead>
                      <TableHead>Actual</TableHead>
                      <TableHead className="text-center">Compliant?</TableHead>
                      <TableHead>Comments</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="bg-muted/5">
                    {result.careCalls.map((call, idx) => (
                      <TableRow key={`${call.careWorkerName}-${call.date}-${call.expectedTime}`} data-testid={`row-care-call-${idx}`} className="hover:bg-muted/10 transition-colors border-border/30">
                        <TableCell className="text-foreground font-medium tracking-tight">{call.careWorkerName}</TableCell>
                        <TableCell className="text-muted-foreground font-medium text-xs">{call.date}</TableCell>
                        <TableCell className="text-center">
                          {call.locationOK ? (
                            <span className="inline-flex items-center gap-1.5 text-success font-black text-[10px] uppercase tracking-widest bg-success/10 px-2 py-0.5 rounded-full border border-success/20">
                              <Check className="h-2.5 w-2.5" /> GPS OK
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-destructive font-black text-[10px] uppercase tracking-widest bg-destructive/10 px-2 py-0.5 rounded-full border border-destructive/20">
                              <X className="h-2.5 w-2.5" /> DRIFT
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground font-medium text-xs">{call.expectedTime}</TableCell>
                        <TableCell className={cn("font-semibold text-xs", call.percentageStayed >= 70 ? "text-success" : "text-destructive")}>
                          {call.actualTime} <span className="text-[10px] opacity-70">({call.percentageStayed}%)</span>
                        </TableCell>
                        <TableCell className="text-center">
                          {call.compliant ? (
                            <div className="h-6 w-6 rounded-full bg-success/15 flex items-center justify-center mx-auto">
                              <Check className="h-3.5 w-3.5 text-success" />
                            </div>
                          ) : (
                            <div className="h-6 w-6 rounded-full bg-destructive/15 flex items-center justify-center mx-auto">
                              <X className="h-3.5 w-3.5 text-destructive" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {call.comment === "NA" ? (
                            <span className="text-muted-foreground font-medium italic">NO LOGS</span>
                          ) : (
                            <span className="text-foreground font-semibold">{call.comment}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-2">Compliance Status Summary</p>
                  <div className="flex items-center gap-4">
                    {result.hasDiscrepancies ? (
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-xl bg-destructive/10 flex items-center justify-center border border-destructive/20 shadow-sm">
                          <X className="h-6 w-6 text-destructive" />
                        </div>
                        <div>
                          <p className="text-xl font-black tracking-tight text-destructive">INCIDENTS DETECTED</p>
                          <p className="text-xs font-semibold text-muted-foreground">Action required for compliance restoration.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-xl bg-success/10 flex items-center justify-center border border-success/20 shadow-sm">
                          <Check className="h-6 w-6 text-success" />
                        </div>
                        <div>
                          <p className="text-xl font-black tracking-tight text-success">TOTAL COMPLIANCE</p>
                          <p className="text-xs font-semibold text-muted-foreground">No operational drift detected in this window.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <CopyButton text={result.hasDiscrepancies ? "Yes" : "No"} label="discrepancies-answer" />
              </div>
            </CardContent>
          </Card>

          {result.hasDiscrepancies && result.discrepancies.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 pb-6">
                <CardTitle className="flex items-center gap-3">
                  <div className="h-7 w-7 rounded-md flex items-center justify-center bg-destructive/8">
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                  </div>
                  Incident Reports
                </CardTitle>
                <div className="flex items-center gap-3">
                  <TableCopyButton text={getDiscrepanciesTableFormat()} label="discrepancies-table" />
                  <CopyButton text={getAllDiscrepanciesText()} label="all-discrepancies" />
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                {Object.entries(getDiscrepanciesByCarer()).map(([carerName, discrepancies], carerIdx) => (
                  <div key={carerIdx} className="mb-8 last:mb-0 p-5 rounded-2xl bg-destructive/5 border border-destructive/10">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-lg font-black tracking-tight text-destructive">{carerName}</h4>
                      <CopyButton 
                        text={discrepancies.map(d => `${d.date}: ${d.issue}`).join('\n')} 
                        label={`carer-${carerIdx}`} 
                      />
                    </div>
                    <div className="overflow-hidden rounded-xl border border-destructive/20 shadow-sm">
                      <Table aria-label="Discrepancy details">
                        <TableHeader className="bg-destructive/10">
                          <TableRow className="border-destructive/20">
                            <TableHead className="w-24 text-destructive/80 font-semibold uppercase text-[10px] tracking-widest">Date</TableHead>
                            <TableHead className="text-destructive/80 font-semibold uppercase text-[10px] tracking-widest">Incident Details</TableHead>
                            <TableHead className="text-destructive/80 font-semibold uppercase text-[10px] tracking-widest">Mitigation Directives</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="bg-background/40">
                          {discrepancies.map((disc, idx) => (
                            <TableRow key={`${disc.date}-${disc.issue}`} data-testid={`row-discrepancy-${carerIdx}-${idx}`} className="border-destructive/10 hover:bg-destructive/5 transition-colors">
                              <TableCell className="text-muted-foreground font-semibold text-xs">{disc.date}</TableCell>
                              <TableCell className="text-foreground font-semibold text-xs leading-relaxed">{disc.issue}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1.5">
                                  {disc.actions.performanceNote && (
                                    <span className="px-2 py-1 bg-amber-500/15 text-amber-500 border border-amber-500/20 rounded-lg text-[10px] font-black uppercase tracking-tighter shadow-sm">Note</span>
                                  )}
                                  {disc.actions.meeting === "phone" && (
                                    <span className="px-2 py-1 bg-blue-500/15 text-blue-400 border border-blue-400/20 rounded-lg text-[10px] font-black uppercase tracking-tighter shadow-sm">Phone</span>
                                  )}
                                  {disc.actions.meeting === "in_person" && (
                                    <span className="px-2 py-1 bg-purple-500/15 text-purple-400 border border-purple-400/20 rounded-lg text-[10px] font-black uppercase tracking-tighter shadow-sm">1-to-1</span>
                                  )}
                                  {disc.actions.referToManager && (
                                    <span className="px-2 py-1 bg-destructive/15 text-destructive border border-destructive/20 rounded-lg text-[10px] font-black uppercase tracking-tighter shadow-sm">Manager</span>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="grid md:grid-cols-2 gap-6">
            <Card className="overflow-hidden">
              <CardHeader className="border-b border-border/40 pb-4 flex flex-row items-center justify-between">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-primary">Strategic Intelligence</CardTitle>
                <CopyButton text={result.themesAndTrends} label="themes" />
              </CardHeader>
              <CardContent className="pt-4">
                <p className="text-sm font-medium text-foreground/80 leading-relaxed">{result.themesAndTrends}</p>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader className="border-b border-border/40 pb-4 flex flex-row items-center justify-between">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-primary">Training Vectors</CardTitle>
                <CopyButton text={result.gapsInKnowledge} label="gaps" />
              </CardHeader>
              <CardContent className="pt-4">
                <p className="text-sm font-medium text-foreground/80 leading-relaxed">{result.gapsInKnowledge}</p>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pt-6 border-t border-border/40">
            <div className="flex-1 w-full max-w-sm">
              <CopyableBox label="Audit Finalization Date" value={formatDate(new Date())} className="border-border/40 rounded-xl" />
            </div>
            <div className="flex gap-4 w-full sm:w-auto">
              <Button variant="outline" onClick={() => { setAnalyzed(false); setResult(null); }} className="flex-1 sm:flex-initial h-12 px-8 rounded-xl font-medium tracking-tight border-border/60" data-testid="button-start-new-visit">
                RESET AUDIT
              </Button>
              <Button
                onClick={saveAudit}
                disabled={loading}
                className="flex-1 sm:flex-initial h-12 px-8 rounded-xl font-medium tracking-tight shadow-glow"
                data-testid="button-save-visit-audit"
              >
                {loading ? "SAVING..." : "COMMIT AUDIT"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
