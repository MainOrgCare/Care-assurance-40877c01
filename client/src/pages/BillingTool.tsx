import { useCallback, useMemo, useState } from "react";
import jsPDF from "jspdf";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  FileImage,
   FileText,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";

const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const dayKeys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

type DayCounts = Record<(typeof dayKeys)[number], number>;

type BillingRow = {
  id: string;
  startDate: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
  durationText: string | null;
  occursEveryWeeks: number;
  serviceType: string | null;
  dayCounts: DayCounts;
  weeklyHours: number | null;
  warnings?: string[];
};

type BillingSegment = {
  id: string;
  startDate: string;
  endDate: string;
  days: number;
  weeklyHoursTotal: number;
  rows: BillingRow[];
};

type BillingAnalysis = {
  summary: {
    imageCount: number;
    rowCount: number;
    segmentsCount: number;
    analysisEndDate?: string | null;
    warnings?: string[];
    skippedRows?: number;
  };
  segments: BillingSegment[];
};

type SupportPlanComparison = {
  sourceFile: string;
  extractionWarnings?: string[];
  plan: {
    provider: string | null;
    providerValid: boolean;
    startDate: string | null;
    endDate: string | null;
    times: string[];
    weeklyHours: number | null;
  };
  comparison: {
    provider: string | null;
    providerValid: boolean;
    planDates: { start: string | null; end: string | null };
    serviceDates: { start: string | null; end: string | null };
    planTimes: string[];
    serviceTimes: string[];
    weeklyHours: { supportPlan: number | null; serviceOrder: number };
    weeklyHourChanges: Array<{ date: string; from: number; to: number }>;
    discrepancies: string[];
  };
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

const formatHours = (hours: number | null | undefined) => {
  if (hours == null || Number.isNaN(hours)) return "—";
  const rounded = Math.round(hours * 100) / 100;
  if (rounded === 0) return "0h";
  if (rounded % 1 === 0) return `${rounded.toFixed(0)}h`;
  return `${rounded.toFixed(2)}h`;
};

const formatDuration = (minutes: number | null, fallback?: string | null) => {
  if (!minutes && minutes !== 0) return fallback || "—";
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
};

export default function BillingTool() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [isCurrent, setIsCurrent] = useState(true);
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState<"idle" | "processing" | "complete">("idle");
  const [analysis, setAnalysis] = useState<BillingAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supportPlanFile, setSupportPlanFile] = useState<File | null>(null);
  const [supportPlanStatus, setSupportPlanStatus] = useState<"idle" | "processing" | "complete">("idle");
  const [supportPlanResult, setSupportPlanResult] = useState<SupportPlanComparison | null>(null);
  const [supportPlanError, setSupportPlanError] = useState<string | null>(null);

  const totalBytes = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);
  const canAnalyze = files.length > 0 && (isCurrent || Boolean(endDate)) && status !== "processing";

  if (user?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-6">
        <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center border border-border">
          <AlertCircle size={40} className="text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">Access Restricted</h2>
          <p className="text-muted-foreground max-w-md">
            The Billing Tool is restricted to Administrators only.
          </p>
        </div>
        <Button variant="outline" className="border-border hover:bg-muted text-muted-foreground">
          Return to Dashboard
        </Button>
      </div>
    );
  }

  const handleFilesAdded = useCallback((selected: FileList | null) => {
    if (!selected) return;
    const incoming = Array.from(selected);
    const accepted = incoming.filter(
      (file) => file.type === "image/png" || file.name.toLowerCase().endsWith(".png")
    );
    const rejectedCount = incoming.length - accepted.length;
    if (rejectedCount > 0) {
      toast({
        title: "Only PNG files are supported",
        description: `${rejectedCount} file${rejectedCount === 1 ? "" : "s"} skipped.`,
        variant: "destructive",
      });
    }
    if (accepted.length === 0) return;
    setFiles((prev) => {
      const existingKeys = new Set(prev.map((file) => `${file.name}-${file.size}-${file.lastModified}`));
      const next = [...prev];
      accepted.forEach((file) => {
        const key = `${file.name}-${file.size}-${file.lastModified}`;
        if (!existingKeys.has(key)) {
          next.push(file);
          existingKeys.add(key);
        }
      });
      return next;
    });
    setAnalysis(null);
    setError(null);
  }, [toast]);

  const handleRemoveFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== index));
    setAnalysis(null);
  }, []);

  const handleClearFiles = useCallback(() => {
    setFiles([]);
    setAnalysis(null);
  }, []);

  const handleStatusChange = useCallback((value: string) => {
    const current = value === "current";
    setIsCurrent(current);
    if (current) {
      setEndDate("");
    }
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!canAnalyze) return;
    setStatus("processing");
    setError(null);
    setSupportPlanResult(null);
    setSupportPlanError(null);

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("images", file));
      formData.append("isCurrent", String(isCurrent));
      formData.append("asOfDate", new Date().toISOString().slice(0, 10));
      if (!isCurrent && endDate) {
        formData.append("endDate", endDate);
      }

      const response = await fetch("/api/billing-tool/analyze", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to analyze service order images");
      }

      const data = (await response.json()) as BillingAnalysis;
      setAnalysis(data);
      setStatus("complete");
      toast({
        title: "Billing analysis complete",
        description: `Processed ${data.summary.rowCount} rows across ${data.summary.segmentsCount} date ranges.`,
      });
    } catch (err: any) {
      console.error("Billing tool analysis error:", err);
      setError(err.message || "An error occurred while processing images");
      setStatus("idle");
      toast({
        title: "Analysis failed",
        description: err.message || "An error occurred while processing images",
        variant: "destructive",
      });
    }
  }, [canAnalyze, files, isCurrent, endDate, toast]);

  const handleSupportPlanSelect = useCallback((selected: FileList | null) => {
    if (!selected || selected.length === 0) return;
    const candidate = selected[0];
    const lower = candidate.name.toLowerCase();
    const isAllowed =
      lower.endsWith(".pdf") || lower.endsWith(".docx") || lower.endsWith(".doc") ||
      candidate.type === "application/pdf" ||
      candidate.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      candidate.type === "application/msword";
    if (!isAllowed) {
      toast({
        title: "Unsupported file type",
        description: "Please upload a PDF or Word support plan.",
        variant: "destructive",
      });
      return;
    }
    setSupportPlanFile(candidate);
    setSupportPlanResult(null);
    setSupportPlanError(null);
  }, [toast]);

  const handleCompareSupportPlan = useCallback(async () => {
    if (!analysis || !supportPlanFile) return;
    setSupportPlanStatus("processing");
    setSupportPlanError(null);

    try {
      const earliestStart = analysis.segments[0]?.startDate || null;
      const latestEnd = analysis.segments[analysis.segments.length - 1]?.endDate || null;
      const totalWeeklyHours = analysis.segments.reduce((sum, seg) => sum + seg.weeklyHoursTotal, 0);

      const payload = {
        summary: { earliestStart, latestEnd, totalWeeklyHours },
        segments: analysis.segments.map((seg) => ({
          startDate: seg.startDate,
          endDate: seg.endDate,
          weeklyHoursTotal: seg.weeklyHoursTotal,
          rows: seg.rows.map((row) => ({
            startTime: row.startTime,
            endTime: row.endTime,
            serviceType: row.serviceType,
          })),
        })),
      };

      const formData = new FormData();
      formData.append("supportPlan", supportPlanFile);
      formData.append("serviceOrders", JSON.stringify(payload));

      const response = await fetch("/api/support-plan/compare", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to compare support plan");
      }

      const data = (await response.json()) as SupportPlanComparison;
      setSupportPlanResult(data);
      setSupportPlanStatus("complete");
      toast({
        title: "Support plan checked",
        description: data.comparison.discrepancies.length
          ? `${data.comparison.discrepancies.length} discrepancy${data.comparison.discrepancies.length === 1 ? "" : "ies"} found.`
          : "No discrepancies detected.",
      });
    } catch (err: any) {
      setSupportPlanStatus("idle");
      setSupportPlanError(err.message || "Failed to compare support plan");
      toast({
        title: "Comparison failed",
        description: err.message || "Failed to compare support plan",
        variant: "destructive",
      });
    }
  }, [analysis, supportPlanFile, toast]);

  const handleExportPdf = useCallback(() => {
    if (!analysis) return;

    const doc = new jsPDF();
    const marginLeft = 14;
    let cursorY = 20;

    const ensureSpace = (needed = 14) => {
      if (cursorY + needed > 280) {
        doc.addPage();
        cursorY = 20;
      }
    };

    const line = (text: string, opts?: { bold?: boolean; size?: number }) => {
      ensureSpace();
      const fontSize = opts?.size || 10;
      doc.setFontSize(fontSize);
      doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
      const wrapped = doc.splitTextToSize(text, 180);
      doc.text(wrapped, marginLeft, cursorY);
      cursorY += (Array.isArray(wrapped) ? wrapped.length : 1) * (fontSize * 0.5 + 1);
    };

    const renderTable = (headers: string[], rows: string[][]) => {
      const pageWidth = (doc as any).internal?.pageSize?.getWidth?.() ?? 210;
      const usableWidth = pageWidth - marginLeft * 2;
      const colRatios = [0.30, 0.32, 0.26, 0.12];
      const colWidths = colRatios.map((ratio) => Math.floor(usableWidth * ratio));
      // Ensure exact fit (fix rounding drift)
      const drift = usableWidth - colWidths.reduce((sum, w) => sum + w, 0);
      colWidths[0] += drift;

      const colStarts = colWidths.reduce<number[]>((acc, _width, idx) => {
        if (idx === 0) return [marginLeft];
        acc.push(marginLeft + colWidths.slice(0, idx).reduce((a, b) => a + b, 0));
        return acc;
      }, []);

      const cellPaddingX = 2;
      const cellPaddingY = 2;
      const lineHeight = 4.5;

      const wrapCell = (text: string, colWidth: number): string[] => {
        const maxWidth = Math.max(10, colWidth - cellPaddingX * 2);
        const parts = doc.splitTextToSize(text || "", maxWidth);
        return Array.isArray(parts) ? parts : [String(parts)];
      };

      const drawGridRow = (cells: string[], opts?: { isHeader?: boolean }) => {
        const wrappedCells = cells.map((cell, idx) => wrapCell(cell, colWidths[idx]));
        const maxLines = Math.max(1, ...wrappedCells.map((lines) => lines.length));
        const rowHeight = cellPaddingY * 2 + maxLines * lineHeight;

        ensureSpace(rowHeight + 4);

        // Header styling
        if (opts?.isHeader) {
          doc.setFillColor(240, 242, 245);
          doc.setDrawColor(180, 185, 195);
          doc.rect(marginLeft, cursorY - 4.5, usableWidth, rowHeight + 1.5, "FD");
          doc.setFont("helvetica", "bold");
        } else {
          doc.setDrawColor(200, 205, 215);
          doc.setFont("helvetica", "normal");
        }

        // Cell borders + text
        for (let i = 0; i < colWidths.length; i += 1) {
          const x = colStarts[i];
          const w = colWidths[i];
          // Border
          doc.rect(x, cursorY - 4.5, w, rowHeight + 1.5);

          // Text
          doc.setTextColor(30, 30, 30);
          const textX = x + cellPaddingX;
          const textYStart = cursorY;
          wrappedCells[i].slice(0, maxLines).forEach((txt, lineIdx) => {
            doc.text(String(txt), textX, textYStart + lineIdx * lineHeight);
          });
        }

        cursorY += rowHeight + 3;
      };

      const originalFontSize = doc.getFontSize();
      doc.setFontSize(9);

      drawGridRow(headers, { isHeader: true });
      rows.forEach((row) => drawGridRow(row));

      doc.setFontSize(originalFontSize);
      cursorY += 2;
    };

    const dayNameMap: Record<(typeof dayKeys)[number], string> = {
      mon: "Monday",
      tue: "Tuesday",
      wed: "Wednesday",
      thu: "Thursday",
      fri: "Friday",
      sat: "Saturday",
      sun: "Sunday",
    };

    const earliestStart = analysis.segments[0]?.startDate ?? "";
    const latestEnd = analysis.segments[analysis.segments.length - 1]?.endDate ?? "";
    const dateRangeLabel = isCurrent ? `${earliestStart} to current` : `${earliestStart} to ${latestEnd}`;

    // Filter to only show important warnings in PDF
    const importantWarningPatterns = [
      /weekly.*hours?/i,
      /discrepan/i,
      /mismatch/i,
      /missing.*duration/i,
      /no.*day.*quantities/i,
    ];
    const filterImportantWarnings = (warnings: string[] | undefined) => {
      if (!warnings) return [];
      return warnings.filter((w) => 
        importantWarningPatterns.some((pattern) => pattern.test(w))
      );
    };

    doc.setTextColor(30, 30, 30);
    line("Billing Analysis Export", { bold: true, size: 16 });

    line(dateRangeLabel, { bold: true, size: 12 });
    line(`Images: ${analysis.summary.imageCount}  •  Rows: ${analysis.summary.rowCount}`, { size: 10 });
    
    // Only show important warnings in PDF export
    const importantWarnings = filterImportantWarnings(analysis.summary.warnings);
    if (importantWarnings.length > 0) {
      line(`Warnings: ${importantWarnings.join(" | ")}`, { size: 10 });
    }
    cursorY += 4;

    if (supportPlanResult) {
      const cmp = supportPlanResult.comparison;
      line("Support Plan Check", { bold: true, size: 12 });
      line(`File: ${supportPlanResult.sourceFile}`, { size: 10 });
      
      // Only show extraction warnings if critical
      const importantExtWarnings = filterImportantWarnings(supportPlanResult.extractionWarnings);
      if (importantExtWarnings.length > 0) {
        line(`Warnings: ${importantExtWarnings.join(" | ")}`, { size: 10 });
      }
      
      if (cmp.provider) {
        line(`Provider: ${cmp.provider}${cmp.providerValid ? " (valid)" : " (not Lawson/Newcastle)"}`, { size: 10 });
      }
      line(
        `Plan dates: ${cmp.planDates.start || "?"} to ${cmp.planDates.end || "?"}  •  Service order: ${cmp.serviceDates.start || "?"} to ${cmp.serviceDates.end || "?"}`,
        { size: 10 }
      );
      line(
        `Plan times: ${cmp.planTimes.length ? cmp.planTimes.join(", ") : "not detected"}  •  Service order times: ${cmp.serviceTimes.length ? cmp.serviceTimes.join(", ") : "none"}`,
        { size: 10 }
      );
      
      // Highlight weekly hours comparison prominently
      const planHours = cmp.weeklyHours.supportPlan;
      const serviceHours = cmp.weeklyHours.serviceOrder;
      const hoursDiff = planHours != null ? Math.abs(planHours - serviceHours) : 0;
      const hoursMatch = planHours != null && hoursDiff < 0.5;
      
      line(
        `Weekly hours: Plan ${planHours != null ? `${planHours}h` : "not specified"} vs Service order ${serviceHours.toFixed(2)}h${!hoursMatch && planHours != null ? ` (DIFFERENCE: ${hoursDiff.toFixed(2)}h)` : ""}`,
        { size: 10, bold: !hoursMatch && planHours != null }
      );
      
      if (cmp.weeklyHourChanges?.length) {
        line(`Weekly hour changes: ${cmp.weeklyHourChanges.map((change) => `${change.date} ${formatHours(change.from)} → ${formatHours(change.to)}`).join(" | ")}`, { size: 10 });
      }
      if (cmp.discrepancies.length === 0) {
        line("Discrepancies: None detected", { size: 10 });
      } else {
        line("Discrepancies:", { size: 10, bold: true });
        cmp.discrepancies.forEach((d) => line(`  • ${d}`, { size: 10 }));
      }
      cursorY += 6;
    }

    type Group = {
      service: string;
      startTime: string;
      endTime: string;
      durationLabel: string;
      occursEveryWeeks: number;
      dayTotals: Record<(typeof dayKeys)[number], number>;
      weeklyHours: number;
    };

    analysis.segments.forEach((segment) => {
      line(`${segment.startDate} to ${segment.endDate} (${segment.days} days)`, { bold: true, size: 11 });
      line(`Weekly total: ${formatHours(segment.weeklyHoursTotal)}`, { size: 10 });

      const groups = new Map<string, Group>();

      segment.rows.forEach((row) => {
        const service = row.serviceType || "Service order";
        const durationLabel = formatDuration(row.durationMinutes, row.durationText) || "";
        const key = [service, row.startTime || "", row.endTime || "", durationLabel].join("|");
        if (!groups.has(key)) {
          groups.set(key, {
            service,
            startTime: row.startTime || "—",
            endTime: row.endTime || "—",
            durationLabel,
            occursEveryWeeks: row.occursEveryWeeks,
            dayTotals: {
              mon: 0,
              tue: 0,
              wed: 0,
              thu: 0,
              fri: 0,
              sat: 0,
              sun: 0,
            },
            weeklyHours: 0,
          });
        }
        const group = groups.get(key)!;
        dayKeys.forEach((day) => {
          group.dayTotals[day] += row.dayCounts[day] || 0;
        });
        group.weeklyHours += row.weeklyHours || 0;
      });

      const tableRows = Array.from(groups.values())
        .sort((a, b) => a.service.localeCompare(b.service))
        .map((group) => {
          const dayParts = dayKeys
            .filter((day) => group.dayTotals[day] > 0)
            .map((day) => {
              const count = group.dayTotals[day];
              return `${dayNameMap[day]}${count > 1 ? ` x${count}` : ""}`;
            });

          const timeWindow = `${group.startTime}–${group.endTime}`;
          const durationText = group.durationLabel ? ` • ${group.durationLabel}` : "";
          const occursText = group.occursEveryWeeks > 1 ? ` • every ${group.occursEveryWeeks} weeks` : "";
          const daysCell = dayParts.length ? dayParts.join(", ") : "No day quantities";

          return [
            group.service,
            `${timeWindow}${durationText}${occursText}`,
            daysCell,
            formatHours(group.weeklyHours),
          ];
        });

      renderTable(["Service", "Time bracket", "Days", "Weekly hrs"], tableRows);
    });

    doc.save("billing-analysis.pdf");
  }, [analysis]);

  return (
    <div className="page-shell max-w-6xl mx-auto" data-testid="billing-tool-page">
      <div className="space-y-2">
        <h2 className="text-3xl font-heading font-bold text-foreground">Billing Tool</h2>
        <p className="text-muted-foreground">
          Upload service order screenshots to calculate weekly hours across active date ranges.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <Card className="glass-card border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileImage className="h-5 w-5 text-primary" />
              Service Order Photos
            </CardTitle>
            <CardDescription>
              Upload as many photos as needed. We will combine all rows into one billing schedule.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className={cn(
                "flex items-center justify-between rounded-xl border border-dashed bg-muted/40 px-4 py-6 transition-colors",
                dragOver ? "border-primary/60 bg-primary/10" : "border-border/70"
              )}
              onDragOver={(e) => {
                e.preventDefault();
                if (status !== "processing") setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (status === "processing") return;
                handleFilesAdded(e.dataTransfer.files);
              }}
            >
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Drop photos here or browse</p>
                <p className="text-xs text-muted-foreground">
                  PNG screenshots of the Service Requirement Details table.
                </p>
              </div>
              <div className="relative">
                <Button variant="outline" className="border-border" disabled={status === "processing"}>
                  <Upload className="mr-2 h-4 w-4" />
                  Add Photos
                </Button>
                <input
                  type="file"
                  accept="image/png"
                  multiple
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={(e) => {
                    handleFilesAdded(e.target.files);
                    e.currentTarget.value = "";
                  }}
                  data-testid="input-billing-photos"
                />
              </div>
            </div>

            {files.length === 0 ? (
              <div className="rounded-xl border border-border/60 bg-card/50 px-4 py-6 text-center text-sm text-muted-foreground">
                No photos selected yet.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{files.length} photo{files.length === 1 ? "" : "s"} selected</span>
                  <span>{formatBytes(totalBytes)} total</span>
                </div>
                <div className="space-y-2">
                  {files.map((file, index) => (
                    <div
                      key={`${file.name}-${file.size}-${file.lastModified}`}
                      className="flex items-center justify-between rounded-lg border border-border/60 bg-card/40 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground truncate max-w-[240px]">
                          {file.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatBytes(file.size)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => handleRemoveFile(index)}
                        disabled={status === "processing"}
                        aria-label={`Remove ${file.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={handleClearFiles}
                  disabled={status === "processing"}
                >
                  Clear all photos
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass-card border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Analysis Settings</CardTitle>
            <CardDescription>
              Choose whether the service order is current. If not, enter an end date for rows without one.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup
              value={isCurrent ? "current" : "not-current"}
              onValueChange={handleStatusChange}
              className="space-y-3"
            >
              <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-2">
                <RadioGroupItem value="current" id="billing-current" />
                <Label htmlFor="billing-current" className="text-sm font-medium">
                  Current service order
                </Label>
              </div>
              <div className="space-y-2 rounded-lg border border-border/60 bg-card/40 px-3 py-2">
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="not-current" id="billing-not-current" />
                  <Label htmlFor="billing-not-current" className="text-sm font-medium">
                    Not current (closed)
                  </Label>
                </div>
                <div className={cn("space-y-1", isCurrent && "opacity-50")}> 
                  <Label htmlFor="billing-end-date" className="text-xs text-muted-foreground">
                    End date for open-ended rows
                  </Label>
                  <Input
                    id="billing-end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    disabled={isCurrent}
                  />
                  {!isCurrent && !endDate && (
                    <p className="text-[11px] text-amber-200">
                      Please enter an end date to enable analysis.
                    </p>
                  )}
                </div>
              </div>
            </RadioGroup>

            <div className="rounded-lg border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
              If any row is missing an end date (like KV1), we will apply the date above for billing.
            </div>

            <Button
              className="w-full bg-primary text-primary-foreground shadow-lg shadow-primary/20"
              size="lg"
              onClick={handleAnalyze}
              disabled={!canAnalyze}
              data-testid="button-billing-analyze"
            >
              {status === "processing" ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Analyzing photos...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Upload className="h-4 w-4" /> Analyze Service Orders
                </span>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {error && (
        <Card className="border-red-500/30 bg-red-500/10">
          <CardContent className="p-4 flex gap-3">
            <AlertCircle className="text-red-400 shrink-0 mt-0.5" size={18} />
            <p className="text-sm text-red-200">{error}</p>
          </CardContent>
        </Card>
      )}

      {analysis && (
        <div className="space-y-6">
          <Card className="glass-card border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                Billing Summary
              </CardTitle>
              <CardDescription>
                {analysis.summary.segmentsCount} active date range{analysis.summary.segmentsCount === 1 ? "" : "s"} detected.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Photos</p>
                <p className="text-2xl font-semibold text-foreground">{analysis.summary.imageCount}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Rows</p>
                <p className="text-2xl font-semibold text-foreground">{analysis.summary.rowCount}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Date Ranges</p>
                <p className="text-2xl font-semibold text-foreground">{analysis.summary.segmentsCount}</p>
              </div>
              {analysis.summary.analysisEndDate && (
                <div className="sm:col-span-3 text-sm text-muted-foreground">
                  Analysis end date applied: <span className="text-foreground font-medium">{analysis.summary.analysisEndDate}</span>
                </div>
              )}
              {analysis.summary.warnings && analysis.summary.warnings.length > 0 && (
                <div className="sm:col-span-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                  <ul className="list-disc list-inside space-y-1">
                    {analysis.summary.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button variant="secondary" onClick={handleExportPdf} disabled={!analysis}>
              Export PDF
            </Button>
          </div>

          <Card className="glass-card border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Support Plan Comparison (optional)
              </CardTitle>
              <CardDescription>
                Upload the social worker support plan (PDF or Word) to cross-check provider, dates, and visit times against the service order.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-dashed border-border/70 bg-muted/40 px-4 py-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">Support plan file</p>
                  <p className="text-xs text-muted-foreground">PDF, DOCX, or DOC up to 40 MB.</p>
                  {supportPlanFile && (
                    <p className="text-xs text-foreground">{supportPlanFile.name}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Button variant="outline" className="border-border" disabled={supportPlanStatus === "processing"}>
                      <Upload className="mr-2 h-4 w-4" />
                      Choose file
                    </Button>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="absolute inset-0 cursor-pointer opacity-0"
                      onChange={(e) => {
                        handleSupportPlanSelect(e.target.files);
                        e.currentTarget.value = "";
                      }}
                    />
                  </div>
                  {supportPlanFile && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setSupportPlanFile(null);
                        setSupportPlanResult(null);
                      }}
                      disabled={supportPlanStatus === "processing"}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  className="bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                  onClick={handleCompareSupportPlan}
                  disabled={!supportPlanFile || !analysis || supportPlanStatus === "processing"}
                >
                  {supportPlanStatus === "processing" ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Comparing...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" /> Compare support plan
                    </span>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground">Requires a completed service order analysis above.</p>
              </div>

              {supportPlanError && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-200">
                  {supportPlanError}
                </div>
              )}

              {supportPlanResult && (
                <div className="space-y-3 rounded-xl border border-border/60 bg-card/50 p-4">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{supportPlanResult.sourceFile}</p>
                      <p className="text-xs text-muted-foreground">Provider must be Lawson or Newcastle.</p>
                    </div>
                    <Badge variant={supportPlanResult.comparison.providerValid ? "success" : "destructive"}>
                      {supportPlanResult.comparison.providerValid
                        ? supportPlanResult.comparison.provider || "Provider found"
                        : supportPlanResult.comparison.provider || "Provider missing"}
                    </Badge>
                  </div>

                  {supportPlanResult.extractionWarnings?.length ? (
                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
                      <p className="text-xs uppercase tracking-[0.15em] text-amber-600 dark:text-amber-400 mb-1">Extraction warnings</p>
                      <ul className="list-disc list-inside space-y-1">
                        {supportPlanResult.extractionWarnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                      <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Dates</p>
                      <p className="text-foreground">
                        Support plan: {supportPlanResult.comparison.planDates.start || "?"} to {supportPlanResult.comparison.planDates.end || "?"}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        Service order: {supportPlanResult.comparison.serviceDates.start || "?"} to {supportPlanResult.comparison.serviceDates.end || "?"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                      <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Times</p>
                      <p className="text-foreground">Plan: {supportPlanResult.comparison.planTimes.length ? supportPlanResult.comparison.planTimes.join(", ") : "none detected"}</p>
                      <p className="text-muted-foreground text-xs">
                        Service order: {supportPlanResult.comparison.serviceTimes.length ? supportPlanResult.comparison.serviceTimes.join(", ") : "none"}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                    <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Weekly hours</p>
                    <p className="text-foreground">
                      Support plan: {supportPlanResult.comparison.weeklyHours.supportPlan != null ? `${supportPlanResult.comparison.weeklyHours.supportPlan}h` : "not specified"}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Service order: {supportPlanResult.comparison.weeklyHours.serviceOrder.toFixed(2)}h
                    </p>
                    {supportPlanResult.comparison.weeklyHourChanges?.length ? (
                      <div className="mt-2 text-xs text-muted-foreground space-y-1">
                        {supportPlanResult.comparison.weeklyHourChanges.map((change) => (
                          <p key={`${change.date}-${change.from}-${change.to}`}>
                            Change on {change.date}: {formatHours(change.from)} → {formatHours(change.to)}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Discrepancies</p>
                    {supportPlanResult.comparison.discrepancies.length === 0 ? (
                      <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
                        No discrepancies detected.
                      </div>
                    ) : (
                      <ul className="space-y-2 text-sm">
                        {supportPlanResult.comparison.discrepancies.map((item) => (
                          <li key={item} className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-800 dark:text-amber-200">
                            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            {analysis.segments.map((segment) => (
              <Collapsible key={segment.id} defaultOpen className="rounded-2xl border border-border/60 bg-card/60">
                <CollapsibleTrigger className="w-full flex items-center justify-between px-5 py-4 text-left">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {segment.startDate} → {segment.endDate}
                    </p>
                    <p className="text-xs text-muted-foreground">{segment.days} day{segment.days === 1 ? "" : "s"} active</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-xs">
                      Weekly total {formatHours(segment.weeklyHoursTotal)}
                    </Badge>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="px-5 pb-5">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Start</TableHead>
                        <TableHead>End</TableHead>
                        <TableHead>Start time</TableHead>
                        <TableHead>End time</TableHead>
                        <TableHead>Duration</TableHead>
                        {dayLabels.map((day) => (
                          <TableHead key={day} className="text-center">
                            {day}
                          </TableHead>
                        ))}
                        <TableHead>Weekly hours</TableHead>
                        <TableHead>Service & visit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {segment.rows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{row.startDate}</TableCell>
                          <TableCell>{row.endDate || "—"}</TableCell>
                          <TableCell>{row.startTime || "—"}</TableCell>
                          <TableCell>{row.endTime || "—"}</TableCell>
                          <TableCell>{formatDuration(row.durationMinutes, row.durationText)}</TableCell>
                          {dayKeys.map((dayKey) => (
                            <TableCell key={dayKey} className="text-center">
                              <span
                                className={cn(
                                  "inline-flex min-w-[20px] justify-center",
                                  row.dayCounts[dayKey] > 0 ? "text-foreground" : "text-muted-foreground/50"
                                )}
                              >
                                {row.dayCounts[dayKey] || 0}
                              </span>
                            </TableCell>
                          ))}
                          <TableCell>{formatHours(row.weeklyHours)}</TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <p className="text-sm font-medium text-foreground">
                                {row.serviceType || "Service order"}
                              </p>
                              {row.occursEveryWeeks > 1 && (
                                <p className="text-[11px] text-muted-foreground">
                                  Occurs every {row.occursEveryWeeks} weeks
                                </p>
                              )}
                              {row.warnings && row.warnings.length > 0 && (
                                <Badge variant="warning" className="mt-1">
                                  Needs review
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={4}>Totals</TableCell>
                        <TableCell></TableCell>
                        <TableCell colSpan={dayKeys.length}></TableCell>
                        <TableCell>{formatHours(segment.weeklyHoursTotal)}</TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
