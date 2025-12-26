import { useState, useEffect, useRef, memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Copy, ClipboardList, Check, X, AlertTriangle, Loader2, TableIcon } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import UploadDisclaimer from "@/components/UploadDisclaimer";
import { useAuth } from "@/context/AuthContext";
import { useTemporaryData } from "@/context/TemporaryDataContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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
    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleCopy} data-testid={`button-copy-${label?.toLowerCase().replace(/\s/g, '-') || 'text'}`}>
      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
    </Button>
  );
});

const TableCopyButton = memo(function TableCopyButton({ text, label }: { text: string; label?: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ 
      title: "Table Copied", 
      description: "Formatted for pasting into Access forms. Use Ctrl+V to paste." 
    });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button 
      variant="outline" 
      size="sm" 
      className="h-7 gap-1.5 text-xs bg-teal-500/10 border-teal-500/30 text-teal-400 hover:bg-teal-500/20" 
      onClick={handleCopy} 
      data-testid={`button-copy-table-${label?.toLowerCase().replace(/\s/g, '-') || 'text'}`}
    >
      {copied ? <Check size={12} /> : <TableIcon size={12} />}
      Copy as Table
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
                setProgress(data.percent);
                setProgressStatus(data.status);
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
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h2 className="text-3xl font-heading font-bold text-foreground">Visit Audit</h2>
        <p className="text-muted-foreground mt-2">
          Upload your visit logs and the AI will extract all details and check compliance (location 200m, 70% duration).
        </p>
      </div>

      {!analyzed ? (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Upload Visit Logs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Visit Log Content</Label>
              <Textarea
                placeholder="Paste your visit log data here or upload a file below...

The AI will automatically extract:
- Service user name
- Date range covered
- Each care call (carer, time, location, duration)
- Compliance status and discrepancies"
                value={documentContent}
                onChange={(e) => setDocumentContent(e.target.value)}
                className="bg-background min-h-[250px] font-mono text-sm"
                data-testid="textarea-visit-content"
              />
            </div>

            <div className="flex items-center gap-4">
              <Input 
                type="file" 
                onChange={handleFileChange} 
                accept=".pdf,.txt,.csv,.xlsx,.xls"
                className="max-w-xs bg-background" 
                data-testid="input-file-upload"
              />
              <Button onClick={processAudit} disabled={loading || !documentContent} data-testid="button-analyze">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Analyze Visits
                  </>
                )}
              </Button>
            </div>

            {loading && (
              <div className="space-y-3 p-4 bg-blue-950/20 border border-blue-900/30 rounded-lg" data-testid="progress-container">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin text-blue-400" />
                    <span className="text-sm text-muted-foreground">{progressStatus}</span>
                  </div>
                  <span className="text-sm font-medium text-foreground">{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}

            <div className="pt-4 border-t border-border">
              <UploadDisclaimer />
            </div>
          </CardContent>
        </Card>
      ) : result && (
        <div className="space-y-6">
          <Card className="bg-card border-border">
            <CardContent className="p-6">
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                <CopyableBox label="Service User" value={result.serviceUserName} />
                <CopyableBox label="Auditor" value={auditorDisplay} />
                <CopyableBox label="First Day of Audit" value={result.auditPeriodStart} />
                <CopyableBox label="Last Day of Audit" value={result.auditPeriodEnd} />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                Care Call Log
              </CardTitle>
              <div className="flex items-center gap-2">
                <TableCopyButton text={getCareCallsTableFormat()} label="care-calls-table" />
                <CopyButton text={getCareCallsText()} label="all-care-calls" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
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
                  <TableBody>
                    {result.careCalls.map((call, idx) => (
                      <TableRow key={idx} data-testid={`row-care-call-${idx}`}>
                        <TableCell className="text-foreground font-medium">{call.careWorkerName}</TableCell>
                        <TableCell className="text-muted-foreground">{call.date}</TableCell>
                        <TableCell className="text-center">
                          {call.locationOK ? (
                            <span className="text-green-400 font-bold">Yes</span>
                          ) : (
                            <span className="text-red-400 font-bold">No</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{call.expectedTime}</TableCell>
                        <TableCell className={call.percentageStayed >= 70 ? "text-green-400" : "text-red-400"}>
                          {call.actualTime} ({call.percentageStayed}%)
                        </TableCell>
                        <TableCell className="text-center">
                          {call.compliant ? (
                            <span className="text-green-400 font-bold">Yes</span>
                          ) : (
                            <span className="text-red-400 font-bold">No</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {call.comment === "NA" ? (
                            <span className="text-muted-foreground">NA</span>
                          ) : (
                            <span className="text-red-300">{call.comment}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground uppercase tracking-wider mb-1">Were there any discrepancies?</p>
                  <div className="flex items-center gap-2">
                    {result.hasDiscrepancies ? (
                      <span className="flex items-center gap-2 text-red-400 font-bold text-xl">
                        <X className="h-6 w-6" /> Yes
                      </span>
                    ) : (
                      <span className="flex items-center gap-2 text-green-400 font-bold text-xl">
                        <Check className="h-6 w-6" /> No
                      </span>
                    )}
                  </div>
                </div>
                <CopyButton text={result.hasDiscrepancies ? "Yes" : "No"} label="discrepancies-answer" />
              </div>
            </CardContent>
          </Card>

          {result.hasDiscrepancies && result.discrepancies.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-400" />
                  Discrepancies
                </CardTitle>
                <div className="flex items-center gap-2">
                  <TableCopyButton text={getDiscrepanciesTableFormat()} label="discrepancies-table" />
                  <CopyButton text={getAllDiscrepanciesText()} label="all-discrepancies" />
                </div>
              </CardHeader>
              <CardContent>
                {Object.entries(getDiscrepanciesByCarer()).map(([carerName, discrepancies], carerIdx) => (
                  <div key={carerIdx} className="mb-6 last:mb-0">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-lg font-semibold text-foreground">{carerName}</h4>
                      <CopyButton 
                        text={discrepancies.map(d => `${d.date}: ${d.issue}`).join('\n')} 
                        label={`carer-${carerIdx}`} 
                      />
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-24">Date</TableHead>
                          <TableHead>Issue</TableHead>
                          <TableHead>Actions Required</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {discrepancies.map((disc, idx) => (
                          <TableRow key={idx} data-testid={`row-discrepancy-${carerIdx}-${idx}`}>
                            <TableCell className="text-muted-foreground">{disc.date}</TableCell>
                            <TableCell className="text-red-300">{disc.issue}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {disc.actions.performanceNote && (
                                  <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded text-xs">Performance Note</span>
                                )}
                                {disc.actions.meeting === "phone" && (
                                  <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">Phone Meeting</span>
                                )}
                                {disc.actions.meeting === "in_person" && (
                                  <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-xs">In-Person Meeting</span>
                                )}
                                {disc.actions.referToManager && (
                                  <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs">Refer to Manager</span>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="grid md:grid-cols-2 gap-6">
            <Card className="bg-card border-border">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm">Themes & Trends</CardTitle>
                <CopyButton text={result.themesAndTrends} label="themes" />
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{result.themesAndTrends}</p>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm">Gaps in Knowledge</CardTitle>
                <CopyButton text={result.gapsInKnowledge} label="gaps" />
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{result.gapsInKnowledge}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-card border-border">
            <CardContent className="p-6">
              <CopyableBox label="Date of Audit" value={formatDate(new Date())} />
            </CardContent>
          </Card>
          
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => { setAnalyzed(false); setResult(null); }} data-testid="button-start-new-visit">
              Start New Audit
            </Button>
            <Button 
              onClick={saveAudit} 
              disabled={loading}
              data-testid="button-save-visit-audit"
            >
              {loading ? "Saving..." : "Save Audit"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
