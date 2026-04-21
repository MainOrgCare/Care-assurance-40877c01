import { useState, useEffect, useRef, memo, useCallback } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
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
import { SafeXLSX } from "@/lib/safe-xlsx";
import {
  findVisitColumnIndex,
  normalizeVisitHeaderKey,
  sanitizeVisitCellValue,
  toVisitInitialLast,
  toVisitInitials,
} from "./visitAuditUtils";

interface DiscrepancyAction {
  performanceNote: boolean;
  meeting: "none" | "phone" | "in_person";
  referToManager: boolean;
}

interface Discrepancy {
  careWorkerName: string;
  date: string;
  issue: string;
  evidence?: string;
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

interface VisitInputSummary {
  sourceLabel: string;
  methodLabel: string;
  rowCount?: number;
  sheetName?: string;
  matchedColumns: string[];
}

interface VisitWorkbookExtraction {
  content: string;
  rowCount: number;
  sheetName: string;
  matchedColumns: string[];
  usedCompactMapping: boolean;
}

const VISIT_SERVICE_USER_KEYS = [
  "service user",
  "service user name",
  "customer name",
  "client name",
  "service location name",
  "service location",
  "resident",
  "patient",
];
const VISIT_PLANNED_START_KEYS = [
  "planned start date and time",
  "planned start time",
  "planned start",
];
const VISIT_PLANNED_DURATION_KEYS = [
  "planned duration",
  "scheduled duration",
  "planned time",
];
const VISIT_ACTUAL_START_KEYS = [
  "actual start date and time",
  "actual start time",
  "actual start",
];
const VISIT_ACTUAL_DURATION_KEYS = [
  "actual duration",
  "delivered duration",
  "actual time",
];
const VISIT_SERVICE_REQ_START_KEYS = [
  "service requirement start date and time",
  "service requirement start time",
  "service requirement time",
];
const VISIT_SERVICE_REQ_DURATION_KEYS = ["service requirement duration"];
const VISIT_ACTUAL_WORKER_KEYS = [
  "actual employee name",
  "actual employee",
  "actual worker",
  "actual carer",
  "delivered worker",
];
const VISIT_LOCATION_KEYS = [
  "actual location analysis",
  "planned location analysis",
  "service requirement location analysis",
  "location analysis",
];
const VISIT_NOTES_KEYS = [
  "notes",
  "timesheet notes",
  "service duty notes",
  "service duty timesheet notes",
  "actual booked on notes",
  "actual booked off notes",
];
const VISIT_MAX_COMPACT_CHARS = 180000;

function extractVisitWorkbookContent(workbook: any): VisitWorkbookExtraction | null {
  if (!workbook?.SheetNames?.length) return null;

  const sheetName = String(workbook.SheetNames[0] || "Sheet 1");
  const worksheet = workbook.Sheets?.[sheetName];
  if (!worksheet) return null;

  const data = SafeXLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, raw: true });
  if (!Array.isArray(data) || data.length === 0) return null;

  const headers = Array.isArray(data[0]) ? data[0].map((cell) => normalizeVisitHeaderKey(cell)) : [];
  const columns = {
    serviceUser: findVisitColumnIndex(headers, VISIT_SERVICE_USER_KEYS),
    plannedStart: findVisitColumnIndex(headers, VISIT_PLANNED_START_KEYS),
    plannedDuration: findVisitColumnIndex(headers, VISIT_PLANNED_DURATION_KEYS),
    actualStart: findVisitColumnIndex(headers, VISIT_ACTUAL_START_KEYS),
    actualDuration: findVisitColumnIndex(headers, VISIT_ACTUAL_DURATION_KEYS),
    serviceReqStart: findVisitColumnIndex(headers, VISIT_SERVICE_REQ_START_KEYS),
    serviceReqDuration: findVisitColumnIndex(headers, VISIT_SERVICE_REQ_DURATION_KEYS),
    actualWorker: findVisitColumnIndex(headers, VISIT_ACTUAL_WORKER_KEYS),
    location: findVisitColumnIndex(headers, VISIT_LOCATION_KEYS),
    notes: findVisitColumnIndex(headers, VISIT_NOTES_KEYS),
  };

  const matchedColumns = [
    columns.serviceUser >= 0 ? "Service user" : null,
    columns.actualWorker >= 0 ? "Care worker" : null,
    columns.serviceReqStart >= 0 || columns.actualStart >= 0 || columns.plannedStart >= 0 ? "Visit date" : null,
    columns.serviceReqDuration >= 0 || columns.plannedDuration >= 0 ? "Expected duration" : null,
    columns.actualDuration >= 0 ? "Actual duration" : null,
    columns.location >= 0 ? "Location" : null,
    columns.notes >= 0 ? "Notes" : null,
  ].filter((value): value is string => Boolean(value));

  const fallbackContent = SafeXLSX.utils.sheet_to_csv(worksheet).trim();
  if (matchedColumns.length < 2) {
    if (!fallbackContent) return null;
    return {
      content: fallbackContent,
      rowCount: Math.max(data.length - 1, 0),
      sheetName,
      matchedColumns,
      usedCompactMapping: false,
    };
  }

  const buildCompactLines = (includeNotes: boolean) => {
    const baseColumns: Array<{ label: string; value: (row: any[]) => string }> = [];

    if (columns.serviceUser >= 0) {
      baseColumns.push({ label: "SU", value: (row) => toVisitInitials(row[columns.serviceUser]) });
    }
    if (columns.actualWorker >= 0) {
      baseColumns.push({ label: "CWa", value: (row) => toVisitInitialLast(row[columns.actualWorker]) });
    }
    baseColumns.push({
      label: "Date",
      value: (row) => {
        const candidates = [columns.actualStart, columns.serviceReqStart, columns.plannedStart].filter((index) => index >= 0);
        for (const index of candidates) {
          const value = sanitizeVisitCellValue(row[index]);
          if (value) return value.split("@")[0];
        }
        return "";
      },
    });

    if (columns.serviceReqDuration >= 0 || columns.plannedDuration >= 0) {
      baseColumns.push({
        label: "ExpDur",
        value: (row) => {
          const primary = columns.serviceReqDuration >= 0 ? sanitizeVisitCellValue(row[columns.serviceReqDuration]) : "";
          if (primary) return primary;
          return columns.plannedDuration >= 0 ? sanitizeVisitCellValue(row[columns.plannedDuration]) : "";
        },
      });
    }

    if (columns.actualDuration >= 0) {
      baseColumns.push({ label: "ActDur", value: (row) => sanitizeVisitCellValue(row[columns.actualDuration]) });
    }
    if (columns.location >= 0) {
      baseColumns.push({ label: "Loc", value: (row) => sanitizeVisitCellValue(row[columns.location]) });
    }

    const columnDefs = includeNotes && columns.notes >= 0
      ? [
          ...baseColumns,
          {
            label: "Notes",
            value: (row: any[]) => {
              let value = sanitizeVisitCellValue(row[columns.notes]);
              if (value.length > 80) value = `${value.slice(0, 77)}...`;
              return value;
            },
          },
        ]
      : baseColumns;

    const lines: string[] = [];
    lines.push(`Columns:${columnDefs.map((column) => column.label).join("|")}`);

    for (let rowIndex = 1; rowIndex < data.length; rowIndex += 1) {
      const row = Array.isArray(data[rowIndex]) ? data[rowIndex] : [];
      const values = columnDefs.map((column) => column.value(row));
      const hasContent = values.some((value) => value && String(value).trim().length > 0);
      if (!hasContent) continue;
      lines.push(values.map((value) => value || "").join("|"));
    }

    return lines;
  };

  let compactLines = buildCompactLines(true);
  let compactContent = compactLines.join("\n").trim();
  if (compactContent.length > VISIT_MAX_COMPACT_CHARS && columns.notes >= 0) {
    compactLines = buildCompactLines(false);
    compactContent = compactLines.join("\n").trim();
  }

  if (compactLines.length <= 1 || !compactContent) {
    if (!fallbackContent) return null;
    return {
      content: fallbackContent,
      rowCount: Math.max(data.length - 1, 0),
      sheetName,
      matchedColumns,
      usedCompactMapping: false,
    };
  }

  return {
    content: compactContent,
    rowCount: compactLines.length - 1,
    sheetName,
    matchedColumns,
    usedCompactMapping: true,
  };
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
      {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
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
  usePageTitle("Visit Audit");
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
  const [inputSummary, setInputSummary] = useState<VisitInputSummary | null>(null);
  const [auditContext, setAuditContext] = useState({
    serviceUserName: "",
    auditPeriodStart: "",
    auditPeriodEnd: "",
    notes: "",
  });

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
      const lowerName = selectedFile.name.toLowerCase();
      const isPdfFile = selectedFile.type === "application/pdf" || lowerName.endsWith(".pdf");
      const isCsvFile = selectedFile.type === "text/csv" || lowerName.endsWith(".csv");
      const isSpreadsheetFile = lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls");

      setFile(selectedFile);
      setAnalyzed(false);
      setResult(null);
      setDocumentContent("");
      setInputSummary(null);
      setLoading(true);
      setProgress(12);
      setProgressStatus(
        isPdfFile
          ? "Extracting PDF text..."
          : isCsvFile || isSpreadsheetFile
          ? "Preparing workbook data..."
          : "Loading source file..."
      );

      try {
        if (isPdfFile) {
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
          setInputSummary({
            sourceLabel: "PDF",
            methodLabel: "Extracted text from uploaded PDF",
            matchedColumns: [],
          });
          resetTimer();
          toast({ title: "PDF Loaded", description: "Document content extracted successfully." });
          return;
        }

        if (isCsvFile || isSpreadsheetFile) {
          const workbook = isCsvFile
            ? SafeXLSX.read(await selectedFile.text(), { type: "string", cellDates: true })
            : SafeXLSX.read(await selectedFile.arrayBuffer(), { type: "array", cellDates: true });
          const extraction = extractVisitWorkbookContent(workbook);

          if (!extraction?.content) {
            throw new Error("No usable visit audit data was found in the uploaded workbook.");
          }

          setDocumentContent(extraction.content);
          setInputSummary({
            sourceLabel: isCsvFile ? "CSV" : "Spreadsheet",
            methodLabel: extraction.usedCompactMapping
              ? "Mapped into compact visit-audit rows"
              : "Loaded sheet as raw table text",
            rowCount: extraction.rowCount,
            sheetName: extraction.sheetName,
            matchedColumns: extraction.matchedColumns,
          });
          resetTimer();
          toast({
            title: isCsvFile ? "CSV Loaded" : "Spreadsheet Loaded",
            description: extraction.usedCompactMapping
              ? `Prepared ${extraction.rowCount} visit row${extraction.rowCount === 1 ? "" : "s"} for audit analysis.`
              : `Loaded ${extraction.rowCount} row${extraction.rowCount === 1 ? "" : "s"} from ${extraction.sheetName}.`,
          });
          return;
        }

        const content = await selectedFile.text();
        setDocumentContent(content);
        setInputSummary({
          sourceLabel: "Text",
          methodLabel: "Loaded raw text file",
          matchedColumns: [],
        });
        resetTimer();
        toast({ title: "File Loaded", description: "Text content is ready for audit analysis." });
      } catch (error: any) {
        setDocumentContent("");
        setInputSummary(null);
        toast({
          title: "File Error",
          description: error.message || "Failed to read uploaded file",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
        setProgress(0);
        setProgressStatus("");
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
        body: JSON.stringify({
          documentContent,
          auditContext: {
            serviceUserName: auditContext.serviceUserName.trim(),
            auditPeriodStart: auditContext.auditPeriodStart.trim(),
            auditPeriodEnd: auditContext.auditPeriodEnd.trim(),
            notes: auditContext.notes.trim(),
          },
        }),
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
      setInputSummary(null);
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

  const hasDiscrepancyEvidence = Boolean(
    result?.discrepancies?.some((disc) => Boolean(disc.evidence))
  );

  return (
    <div className="page-shell page-shell-compact max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 animate-slide-up stagger-1">
        <div className="space-y-1">
          <h1 className="page-title leading-tight">Visit Audit</h1>
          <p className="page-subtitle max-w-prose">
            Autonomous verification of care delivery through GPS and duration telemetry.
          </p>
        </div>
      </div>

      {!analyzed ? (
        <Card className="app-surface animate-slide-up stagger-2 mt-6">
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
                className="bg-muted/20 border-border/40 min-h-[300px] font-mono text-xs leading-relaxed rounded-xl resize-none focus:ring-primary/20"
                data-testid="textarea-visit-content"
              />
            </div>

            <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl bg-muted/20 border border-border/40">
              <div className="flex-1 min-w-[240px]">
                <Input
                  type="file"
                  onChange={handleFileChange}
                  accept=".pdf,.txt,.csv,.xlsx,.xls"
                  className="bg-background border-border/60 rounded-xl"
                  data-testid="input-file-upload"
                />
              </div>
              <Button onClick={processAudit} disabled={loading || !documentContent} className="h-12 px-8 rounded-xl font-medium tracking-tight shadow-sm group" data-testid="button-analyze">
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

            {file && inputSummary && (
              <div className="rounded-xl border border-border/40 bg-background/80 p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-semibold text-foreground">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{inputSummary.methodLabel}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center rounded-full border border-border/50 bg-muted/30 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      {inputSummary.sourceLabel}
                    </span>
                    {typeof inputSummary.rowCount === "number" && (
                      <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">
                        {inputSummary.rowCount} row{inputSummary.rowCount === 1 ? "" : "s"}
                      </span>
                    )}
                    {inputSummary.sheetName && (
                      <span className="inline-flex items-center rounded-full border border-border/50 bg-muted/30 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        {inputSummary.sheetName}
                      </span>
                    )}
                  </div>
                </div>

                {inputSummary.matchedColumns.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Mapped fields: {inputSummary.matchedColumns.join(", ")}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No structured visit-audit columns were detected, so the uploaded content was loaded as raw text.
                  </p>
                )}
              </div>
            )}

            <div className="rounded-xl border border-border/40 bg-muted/20 p-5 space-y-4">
              <div className="space-y-1">
                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Audit Context (Optional)</p>
                <p className="text-xs text-muted-foreground">
                  Provide known details to improve extraction when logs are messy or incomplete.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="audit-service-user" className="text-xs text-muted-foreground">Service user initials or name</Label>
                  <Input
                    id="audit-service-user"
                    value={auditContext.serviceUserName}
                    onChange={(e) => setAuditContext((prev) => ({ ...prev, serviceUserName: e.target.value }))}
                    placeholder="e.g., K.S. or Kieran Smith"
                    className="bg-background border-border/60 rounded-xl"
                    data-testid="input-audit-service-user"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="audit-period-start" className="text-xs text-muted-foreground">Audit start date</Label>
                  <Input
                    id="audit-period-start"
                    value={auditContext.auditPeriodStart}
                    onChange={(e) => setAuditContext((prev) => ({ ...prev, auditPeriodStart: e.target.value }))}
                    placeholder="DD/MM/YYYY"
                    className="bg-background border-border/60 rounded-xl"
                    data-testid="input-audit-start"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="audit-period-end" className="text-xs text-muted-foreground">Audit end date</Label>
                  <Input
                    id="audit-period-end"
                    value={auditContext.auditPeriodEnd}
                    onChange={(e) => setAuditContext((prev) => ({ ...prev, auditPeriodEnd: e.target.value }))}
                    placeholder="DD/MM/YYYY"
                    className="bg-background border-border/60 rounded-xl"
                    data-testid="input-audit-end"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="audit-notes" className="text-xs text-muted-foreground">Operational notes</Label>
                <Textarea
                  id="audit-notes"
                  value={auditContext.notes}
                  onChange={(e) => setAuditContext((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="e.g., GPS issues on 12/02 or approved early departures"
                  className="bg-background border-border/60 rounded-xl min-h-[90px]"
                  data-testid="textarea-audit-notes"
                />
              </div>
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

          <Card className="app-surface overflow-hidden">
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

          <Card className="app-surface overflow-hidden">
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
            <Card className="app-surface overflow-hidden">
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
                  <div key={carerIdx} className="mb-8 last:mb-0 p-5 rounded-xl bg-destructive/5 border border-destructive/10">
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
                            {hasDiscrepancyEvidence && (
                              <TableHead className="text-destructive/80 font-semibold uppercase text-[10px] tracking-widest">Evidence</TableHead>
                            )}
                            <TableHead className="text-destructive/80 font-semibold uppercase text-[10px] tracking-widest">Mitigation Directives</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="bg-background/40">
                          {discrepancies.map((disc, idx) => (
                            <TableRow key={`${disc.date}-${disc.issue}`} data-testid={`row-discrepancy-${carerIdx}-${idx}`} className="border-destructive/10 hover:bg-destructive/5 transition-colors">
                              <TableCell className="text-muted-foreground font-semibold text-xs">{disc.date}</TableCell>
                              <TableCell className="text-foreground font-semibold text-xs leading-relaxed">{disc.issue}</TableCell>
                              {hasDiscrepancyEvidence && (
                                <TableCell className="text-xs text-muted-foreground">
                                  {disc.evidence || "-"}
                                </TableCell>
                              )}
                              <TableCell>
                                <div className="flex flex-wrap gap-1.5">
                                  {disc.actions.performanceNote && (
                                    <span className="px-2 py-1 bg-warning/15 text-warning border border-warning/20 rounded-lg text-[10px] font-black uppercase tracking-tighter shadow-sm">Note</span>
                                  )}
                                  {disc.actions.meeting === "phone" && (
                                    <span className="px-2 py-1 bg-primary/15 text-primary border border-primary/20 rounded-lg text-[10px] font-black uppercase tracking-tighter shadow-sm">Phone</span>
                                  )}
                                  {disc.actions.meeting === "in_person" && (
                                    <span className="px-2 py-1 bg-primary/15 text-primary border border-primary/20 rounded-lg text-[10px] font-black uppercase tracking-tighter shadow-sm">1-to-1</span>
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
            <Card className="app-surface overflow-hidden">
              <CardHeader className="border-b border-border/40 pb-4 flex flex-row items-center justify-between">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-primary">Strategic Intelligence</CardTitle>
                <CopyButton text={result.themesAndTrends} label="themes" />
              </CardHeader>
              <CardContent className="pt-4">
                <p className="text-sm font-medium text-foreground/80 leading-relaxed">{result.themesAndTrends}</p>
              </CardContent>
            </Card>

            <Card className="app-surface overflow-hidden">
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
                className="flex-1 sm:flex-initial h-12 px-8 rounded-xl font-medium tracking-tight shadow-sm"
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
