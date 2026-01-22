import { useMemo, useState } from "react";
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
  totalHoursInRange?: number | null;
  warnings?: string[];
};

type BillingSegment = {
  id: string;
  startDate: string;
  endDate: string;
  days: number;
  weeklyHoursTotal: number;
  totalHours: number;
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

  const handleFilesAdded = (selected: FileList | null) => {
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
  };

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== index));
    setAnalysis(null);
  };

  const handleClearFiles = () => {
    setFiles([]);
    setAnalysis(null);
  };

  const handleStatusChange = (value: string) => {
    const current = value === "current";
    setIsCurrent(current);
    if (current) {
      setEndDate("");
    }
  };

  const handleAnalyze = async () => {
    if (!canAnalyze) return;
    setStatus("processing");
    setError(null);

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
  };

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
                    <Badge variant="secondary" className="text-xs">
                      Range total {formatHours(segment.totalHours)}
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
                        <TableHead>Range hours</TableHead>
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
                          <TableCell>{formatHours(row.totalHoursInRange ?? null)}</TableCell>
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
                        <TableCell>{formatHours(segment.totalHours)}</TableCell>
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
