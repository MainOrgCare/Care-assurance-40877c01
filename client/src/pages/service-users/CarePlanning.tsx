import { useState, useMemo, useCallback } from "react";
import { useTemporaryData } from "@/context/TemporaryDataContext";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Switch } from "@/components/ui/switch";
import { FileText, ArrowRight, AlertTriangle, Loader2, CheckCircle2, Sparkles, ChevronDown, ChevronUp, Copy, Check, Search, Clock, Activity, Shield, Zap } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface CarePlanSection {
  title: string;
  priority: "high" | "medium" | "low";
  content: string;
  steps: string[];
  risks: string[];
  equipment: string[];
}

interface CarePlanResult {
  serviceUserInitials: string;
  generatedDate: string;
  sections: CarePlanSection[];
  emergencyContacts: string;
  gpDetails: string;
  additionalNotes: string;
}

type CarePlanMutationResult = {
  raw: CarePlanResult;
  scrubbed: CarePlanResult;
};

export default function CarePlanning() {
  const { serviceUserData, getAllDocumentContent, isAnyParsing } = useTemporaryData();
  const { user } = useAuth();
  const { toast } = useToast();
  const [carePlanRaw, setCarePlanRaw] = useState<CarePlanResult | null>(null);
  const [carePlanScrubbed, setCarePlanScrubbed] = useState<CarePlanResult | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());
  const [copiedSection, setCopiedSection] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [sortMode, setSortMode] = useState<"default" | "priority">("default");
  const [allowSensitive, setAllowSensitive] = useState(false);

  const isAdmin = user?.role === "admin";
  const showSensitive = isAdmin && allowSensitive;
  const carePlan = useMemo(
    () => (showSensitive && carePlanRaw ? carePlanRaw : carePlanScrubbed),
    [showSensitive, carePlanRaw, carePlanScrubbed]
  );

  const hasData = serviceUserData.socialWork || serviceUserData.initialAssessment;
  const sectionsWithIndex = useMemo(() => {
    if (!carePlan?.sections) return [];
    return carePlan.sections
      .map((section, index) => ({ section, index }))
      .filter(({ section }) => section != null);
  }, [carePlan?.sections]);
  const sectionStats = useMemo(() => {
    const summary = {
      total: sectionsWithIndex.length,
      high: 0,
      medium: 0,
      low: 0,
      steps: 0,
      risks: 0,
      equipment: 0,
    };

    sectionsWithIndex.forEach(({ section }) => {
      if (section.priority === "high") summary.high += 1;
      if (section.priority === "medium") summary.medium += 1;
      if (section.priority === "low") summary.low += 1;
      summary.steps += Array.isArray(section.steps) ? section.steps.length : 0;
      summary.risks += Array.isArray(section.risks) ? section.risks.length : 0;
      summary.equipment += Array.isArray(section.equipment) ? section.equipment.length : 0;
    });

    return summary;
  }, [sectionsWithIndex]);
  const visibleSections = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let filtered = sectionsWithIndex.filter(({ section }) => {
      if (priorityFilter !== "all" && section.priority !== priorityFilter) {
        return false;
      }
      if (!query) return true;

      const haystack = [
        section.title,
        section.content,
        ...(section.steps || []),
        ...(section.risks || []),
        ...(section.equipment || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });

    if (sortMode === "priority") {
      const priorityRank = { high: 0, medium: 1, low: 2 } as const;
      filtered = [...filtered].sort((a, b) => {
        const rankA = priorityRank[a.section.priority] ?? 3;
        const rankB = priorityRank[b.section.priority] ?? 3;
        if (rankA !== rankB) return rankA - rankB;
        return a.index - b.index;
      });
    }

    return filtered;
  }, [sectionsWithIndex, priorityFilter, searchQuery, sortMode]);
  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    priorityFilter !== "all" ||
    sortMode !== "default";
  const parseErrors = [
    serviceUserData.socialWork?.parseError
      ? { label: "Social Work", message: serviceUserData.socialWork.parseError }
      : null,
    serviceUserData.initialAssessment?.parseError
      ? { label: "Initial Assessment", message: serviceUserData.initialAssessment.parseError }
      : null,
  ].filter(Boolean) as { label: string; message: string }[];

  const generateMutation = useMutation({
    mutationFn: async () => {
      const documentContent = getAllDocumentContent();
      if (!documentContent.trim()) {
        throw new Error("No document content available");
      }

      setProgress(0);
      setProgressStatus("Preparing documents...");

      // Clear any existing care plan and prepare for incremental updates
      setCarePlanRaw(null);
      setCarePlanScrubbed(null);
      setExpandedSections(new Set());
      setSearchQuery("");
      setPriorityFilter("all");
      setSortMode("default");
      const sectionsInProgressRaw: CarePlanSection[] = [];
      const sectionsInProgressScrubbed: CarePlanSection[] = [];

      const response = await fetch("/api/ai/generate-care-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ documentContent, allowSensitive: isAdmin && allowSensitive }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        try {
          const error = JSON.parse(errorText);
          throw new Error(error.message || "Failed to generate care plan");
        } catch {
          throw new Error("Failed to generate care plan");
        }
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response stream available");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let resultRaw: CarePlanResult | null = null;
      let resultScrubbed: CarePlanResult | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        
        const messages = buffer.split("\n\n");
        buffer = messages.pop() || "";

        for (const message of messages) {
          if (!message.trim() || message.startsWith(":")) continue;
          const lines = message.split("\n");
          let eventType = "";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventType = line.substring(6).trim();
            } else if (line.startsWith("data:")) {
              dataStr = line.substring(5).trim();
            }
          }
          if (eventType && dataStr) {
            try {
              const data = JSON.parse(dataStr);
              if (eventType === "progress") {
                console.log("[CarePlan] Progress update:", data.percent, data.status);
                setProgress(data.percent);
                setProgressStatus(data.status);
              } else if (eventType === "section") {
                // New section arrived - add it to the list immediately
                console.log("[CarePlan] Section received:", data.index, data.section?.title, "keys:", Object.keys(data.section || {}));
                if (data.section && typeof data.index === "number") {
                  const sectionScrubbed = data.scrubbedSection || data.section;
                  sectionsInProgressRaw[data.index] = data.section;
                  sectionsInProgressScrubbed[data.index] = sectionScrubbed;
                  // Filter out undefined entries (sparse array)
                  const validSectionsRaw = sectionsInProgressRaw.filter((s): s is CarePlanSection => s !== undefined);
                  const validSectionsScrubbed = sectionsInProgressScrubbed.filter((s): s is CarePlanSection => s !== undefined);
                  // Update care plan in real-time so user sees progress
                  setCarePlanRaw(prev => ({
                    serviceUserInitials: prev?.serviceUserInitials || "N.N.",
                    generatedDate: prev?.generatedDate || new Date().toLocaleDateString("en-GB"),
                    sections: validSectionsRaw,
                    emergencyContacts: prev?.emergencyContacts || "Loading...",
                    gpDetails: prev?.gpDetails || "Loading...",
                    additionalNotes: prev?.additionalNotes || "Loading...",
                  }));
                  setCarePlanScrubbed(prev => ({
                    serviceUserInitials: prev?.serviceUserInitials || "N.N.",
                    generatedDate: prev?.generatedDate || new Date().toLocaleDateString("en-GB"),
                    sections: validSectionsScrubbed,
                    emergencyContacts: prev?.emergencyContacts || "Loading...",
                    gpDetails: prev?.gpDetails || "Loading...",
                    additionalNotes: prev?.additionalNotes || "Loading...",
                  }));
                  // Auto-expand the new section
                  setExpandedSections(prev => {
                    const newSet = new Set(prev);
                    newSet.add(data.index);
                    return newSet;
                  });
                }
              } else if (eventType === "result") {
                console.log("[CarePlan] Final result received, sections count:", data?.sections?.length, "keys:", Object.keys(data || {}));
                resultRaw = data;
                resultScrubbed = data?.scrubbedResult || data;
              } else if (eventType === "error") {
                throw new Error(data.message);
              }
            } catch (parseErr) {
              console.error("SSE parse error:", parseErr, "data:", dataStr.substring(0, 100));
            }
          }
        }
      }

      if (!resultRaw) {
        throw new Error("No result received from server");
      }

      return { raw: resultRaw, scrubbed: resultScrubbed || resultRaw };
    },
    onSuccess: ({ raw, scrubbed }: CarePlanMutationResult) => {
      console.log("[CarePlan] onSuccess called with data:", JSON.stringify(raw).substring(0, 500));
      setProgress(100);
      setProgressStatus("Complete!");
      setTimeout(() => {
        setProgress(0);
        setProgressStatus("");
      }, 500);
      
      // Ensure sections is always an array
      const safeSectionsRaw = Array.isArray(raw?.sections) ? raw.sections : [];
      const safeSectionsScrubbed = Array.isArray(scrubbed?.sections) ? scrubbed.sections : [];
      const safeDataRaw: CarePlanResult = {
        serviceUserInitials: raw?.serviceUserInitials || "N.N.",
        generatedDate: raw?.generatedDate || new Date().toLocaleDateString("en-GB"),
        sections: safeSectionsRaw,
        emergencyContacts: raw?.emergencyContacts || "",
        gpDetails: raw?.gpDetails || "",
        additionalNotes: raw?.additionalNotes || "",
      };
      const safeDataScrubbed: CarePlanResult = {
        serviceUserInitials: scrubbed?.serviceUserInitials || "N.N.",
        generatedDate: scrubbed?.generatedDate || new Date().toLocaleDateString("en-GB"),
        sections: safeSectionsScrubbed,
        emergencyContacts: scrubbed?.emergencyContacts || "",
        gpDetails: scrubbed?.gpDetails || "",
        additionalNotes: scrubbed?.additionalNotes || "",
      };
      
      setCarePlanRaw(safeDataRaw);
      setCarePlanScrubbed(safeDataScrubbed);
      setExpandedSections(new Set(safeSectionsScrubbed.map((_: CarePlanSection, i: number) => i)));
      setSearchQuery("");
      setPriorityFilter("all");
      setSortMode("default");
      toast({
        title: "Care Plan Generated",
        description: "Your detailed first-person care plan is ready.",
      });
    },
    onError: (error: Error) => {
      setProgress(0);
      setProgressStatus("");
      toast({
        title: "Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const formatSectionForCopy = (section: CarePlanSection) => {
    const steps = Array.isArray(section.steps) ? section.steps.filter(Boolean) : [];
    const risks = Array.isArray(section.risks) ? section.risks.filter(Boolean) : [];
    const equipment = Array.isArray(section.equipment) ? section.equipment.filter(Boolean) : [];
    const lines = [section.title, "", section.content || "No content available for this section."];

    if (steps.length > 0) {
      lines.push("", "Steps:");
      lines.push(...steps.map((step, i) => `${i + 1}. ${step}`));
    }

    if (risks.length > 0) {
      lines.push("", `Risks: ${risks.join(", ")}`);
    }

    if (equipment.length > 0) {
      lines.push("", `Equipment: ${equipment.join(", ")}`);
    }

    return lines.join("\n");
  };

  const toggleSection = useCallback((index: number) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  }, []);

  const copySection = useCallback(async (section: CarePlanSection, index: number) => {
    const scrubbedSection = carePlanScrubbed?.sections?.[index] || section;
    await navigator.clipboard.writeText(formatSectionForCopy(scrubbedSection));
    setCopiedSection(index);
    setTimeout(() => setCopiedSection(null), 2000);
  }, [carePlanScrubbed]);

  const copyAllPlan = useCallback(async () => {
    const copySource = carePlanScrubbed || carePlan;
    if (!copySource) return;

    const sectionsText = copySource.sections
      .filter((section): section is CarePlanSection => section != null)
      .map((section) => formatSectionForCopy(section))
      .join("\n\n---\n\n");
    const metadataText = `Care Plan for ${copySource.serviceUserInitials}\nGenerated: ${copySource.generatedDate}`;
    const additionalDetails: string[] = [];

    if (copySource.emergencyContacts && copySource.emergencyContacts !== "Information not found in documents") {
      additionalDetails.push(`Emergency Contacts: ${copySource.emergencyContacts}`);
    }
    if (copySource.gpDetails && copySource.gpDetails !== "Information not found in documents") {
      additionalDetails.push(`GP Details: ${copySource.gpDetails}`);
    }
    if (copySource.additionalNotes && copySource.additionalNotes !== "Information not found in documents") {
      additionalDetails.push(`Additional Notes: ${copySource.additionalNotes}`);
    }

    const additionalText =
      additionalDetails.length > 0
        ? `\n\n---\n\nAdditional Information\n${additionalDetails.join("\n")}`
        : "";
    const fullPlan = `${metadataText}\n\n${sectionsText}${additionalText}`.trim();

    await navigator.clipboard.writeText(fullPlan);
    toast({
      title: "Copied",
      description: "Full care plan copied to clipboard",
    });
  }, [carePlanScrubbed, carePlan, toast]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return "text-red-400 bg-red-950/30 border-red-900/50";
      case "medium": return "text-amber-400 bg-amber-950/30 border-amber-900/50";
      case "low": return "text-emerald-400 bg-emerald-950/30 border-emerald-900/50";
      default: return "text-muted-foreground bg-muted/50 border-border";
    }
  };

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-6 animate-in fade-in zoom-in duration-500">
        <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center">
          <FileText size={48} className="text-muted-foreground" />
        </div>
        <div className="max-w-md space-y-2">
          <h2 className="text-2xl font-bold text-foreground" data-testid="text-no-data-title">No Data Available</h2>
          <p className="text-muted-foreground">
            Please upload Social Work documents or an Initial Assessment to generate a Care Plan.
          </p>
        </div>
        <Link href="/service-users/upload">
          <Button className="gap-2" data-testid="button-go-upload">
            Go to Upload <ArrowRight size={16} />
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 animate-slide-up stagger-1">
        <div className="space-y-1">
          <h1 className="page-title leading-tight" data-testid="text-page-title">Care Planning</h1>
          <p className="page-subtitle">Generate detailed, first-person care plans based on uploaded documentation.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isAdmin && (
            <div className="flex flex-col items-start gap-1 rounded-xl border border-border/50 bg-muted/20 px-4 py-2 text-xs text-muted-foreground glass-card">
              <div className="flex items-center gap-3">
                <Switch checked={allowSensitive} onCheckedChange={setAllowSensitive} />
                <span className="font-semibold tracking-tight">Show full names (admin view)</span>
              </div>
              <span className="text-[10px] text-muted-foreground/60 font-medium">Copies and saves use initials only.</span>
            </div>
          )}
          {carePlan && (
            <Button variant="outline" onClick={copyAllPlan} className="gap-2.5 rounded-xl border-border/60 font-bold tracking-tight shadow-sm" data-testid="button-copy-all">
              <Copy size={16} /> Copy Full Plan
            </Button>
          )}
        </div>
      </div>

      <Card className="glass-card animate-slide-up stagger-2 overflow-hidden">
        <CardHeader className="border-b border-border/40 pb-6">
          <CardTitle className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center bg-primary/10 shadow-xs">
              <FileText size={18} className="text-primary" />
            </div>
            Source Documents
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          {serviceUserData.socialWork && (
            <div className="p-4 rounded-xl bg-muted/20 border border-border/40 text-sm text-foreground flex items-center gap-3 group transition-colors hover:bg-muted/30" data-testid="text-social-work-doc">
              <div className="h-8 w-8 rounded-lg bg-background flex items-center justify-center border border-border/50 shadow-xs">
                {serviceUserData.socialWork.isParsing ? (
                  <Loader2 size={16} className="animate-spin text-primary" />
                ) : (
                  <CheckCircle2 size={16} className="text-success" />
                )}
              </div>
              <div>
                <p className="font-bold tracking-tight">Social Work</p>
                <p className="text-xs text-muted-foreground font-medium">{serviceUserData.socialWork.name}</p>
              </div>
              {serviceUserData.socialWork.parseError && (
                <span className="text-xs text-destructive font-bold ml-auto bg-destructive/10 px-2 py-1 rounded-lg">Parsing failed</span>
              )}
              {serviceUserData.socialWork.content && !serviceUserData.socialWork.parseError && (
                <span className="text-xs font-bold text-muted-foreground ml-auto bg-muted/40 px-2.5 py-1 rounded-lg tracking-tighter">
                  {serviceUserData.socialWork.content.length.toLocaleString()} CHR
                </span>
              )}
            </div>
          )}
          {serviceUserData.initialAssessment && (
            <div className="p-4 rounded-xl bg-muted/20 border border-border/40 text-sm text-foreground flex items-center gap-3 group transition-colors hover:bg-muted/30" data-testid="text-initial-assessment-doc">
              <div className="h-8 w-8 rounded-lg bg-background flex items-center justify-center border border-border/50 shadow-xs">
                {serviceUserData.initialAssessment.isParsing ? (
                  <Loader2 size={16} className="animate-spin text-primary" />
                ) : (
                  <CheckCircle2 size={16} className="text-success" />
                )}
              </div>
              <div>
                <p className="font-bold tracking-tight">Initial Assessment</p>
                <p className="text-xs text-muted-foreground font-medium">{serviceUserData.initialAssessment.name}</p>
              </div>
              {serviceUserData.initialAssessment.parseError && (
                <span className="text-xs text-destructive font-bold ml-auto bg-destructive/10 px-2 py-1 rounded-lg">Parsing failed</span>
              )}
              {serviceUserData.initialAssessment.content && !serviceUserData.initialAssessment.parseError && (
                <span className="text-xs font-bold text-muted-foreground ml-auto bg-muted/40 px-2.5 py-1 rounded-lg tracking-tighter">
                  {serviceUserData.initialAssessment.content.length.toLocaleString()} CHR
                </span>
              )}
            </div>
          )}
          {parseErrors.length > 0 && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-xs text-destructive/80">
              <div className="flex items-center gap-2 text-destructive font-bold uppercase tracking-wider mb-2">
                <AlertTriangle size={14} />
                Parsing issues detected
              </div>
              <div className="space-y-1">
                {parseErrors.map((error) => (
                  <div key={error.label} className="flex items-start gap-2 font-medium">
                    <span className="text-destructive">•</span>
                    <span>{error.label}: {error.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <Button 
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending || isAnyParsing()}
            className="w-full mt-2 gap-2.5 h-12 rounded-xl font-bold tracking-tight shadow-glow"
            data-testid="button-generate-care-plan"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Generating Operational Directives...
              </>
            ) : (
              <>
                <Sparkles size={18} />
                Generate Intelligence-Led Care Plan
              </>
            )}
          </Button>

          {generateMutation.isPending && (
            <div className="space-y-4 p-5 bg-primary/5 border border-primary/10 rounded-xl" data-testid="progress-container">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-xs font-bold uppercase tracking-widest text-primary">{progressStatus}</span>
                </div>
                <span className="text-sm font-black text-primary">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-1.5 bg-primary/10" />
            </div>
          )}
          
          {isAnyParsing() && (
            <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest text-center mt-2 animate-pulse">
              System busy: parsing baseline documents...
            </p>
          )}
        </CardContent>
      </Card>

      {carePlan && (
        <div className="space-y-6 animate-slide-up">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xl font-black tracking-tight text-foreground" data-testid="text-care-plan-title">
              Operational Plan: {carePlan.serviceUserInitials}
            </h3>
            <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-muted/40 px-3 py-1 rounded-full border border-border/40">
              <Clock size={12} className="text-primary" />
              TIMESTAMP: {carePlan.generatedDate}
            </div>
          </div>

          <Card className="glass-card overflow-hidden">
            <CardHeader className="border-b border-border/40 pb-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="text-lg">Intelligence Feed</CardTitle>
                  <CardDescription className="text-xs font-medium">
                    Showing {visibleSections.length} of {sectionStats.total} mapped operational vectors.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="rounded-lg font-bold">TOTAL {sectionStats.total}</Badge>
                  <Badge className="rounded-lg font-bold bg-destructive/15 text-destructive border-destructive/20">HIGH {sectionStats.high}</Badge>
                  <Badge className="rounded-lg font-bold bg-amber-500/15 text-amber-500 border-amber-500/20">MED {sectionStats.medium}</Badge>
                  <Badge className="rounded-lg font-bold bg-success/15 text-success border-success/20">LOW {sectionStats.low}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="grid gap-4 lg:grid-cols-[1.8fr_1fr]">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted-foreground/60" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter vectors by keywords, risks, or gear..."
                    className="pl-11 h-11 rounded-xl bg-muted/20 border-border/40 font-medium"
                    data-testid="input-care-plan-search"
                  />
                </div>
                <div className="flex flex-col gap-2 justify-center">
                  <ToggleGroup
                    type="single"
                    value={priorityFilter}
                    onValueChange={(value: string) =>
                      setPriorityFilter((value as "all" | "high" | "medium" | "low") || "all")
                    }
                    variant="outline"
                    size="sm"
                    className="justify-start sm:justify-end"
                  >
                    <ToggleGroupItem value="all" className="rounded-lg font-bold text-[10px]">ALL</ToggleGroupItem>
                    <ToggleGroupItem value="high" className="rounded-lg font-bold text-[10px]">HIGH</ToggleGroupItem>
                    <ToggleGroupItem value="medium" className="rounded-lg font-bold text-[10px]">MED</ToggleGroupItem>
                    <ToggleGroupItem value="low" className="rounded-lg font-bold text-[10px]">LOW</ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-border/40">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Sequence</span>
                  <ToggleGroup
                    type="single"
                    value={sortMode}
                    onValueChange={(value: string) =>
                      setSortMode((value as "default" | "priority") || "default")
                    }
                    variant="outline"
                    size="sm"
                  >
                    <ToggleGroupItem value="default" className="rounded-lg font-bold text-[10px]">LOGICAL</ToggleGroupItem>
                    <ToggleGroupItem value="priority" className="rounded-lg font-bold text-[10px]">CRITICAL FIRST</ToggleGroupItem>
                  </ToggleGroup>
                  {hasActiveFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSearchQuery("");
                        setPriorityFilter("all");
                        setSortMode("default");
                      }}
                      className="text-[10px] font-bold text-primary uppercase tracking-widest"
                    >
                      Reset Directives
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setExpandedSections(prev => {
                        const next = new Set(prev);
                        visibleSections.forEach(({ index }) => next.add(index));
                        return next;
                      });
                    }}
                    className="rounded-lg font-bold text-[10px] uppercase border-border/60"
                  >
                    Expand All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setExpandedSections(prev => {
                        const next = new Set(prev);
                        visibleSections.forEach(({ index }) => next.delete(index));
                        return next;
                      });
                    }}
                    className="rounded-lg font-bold text-[10px] uppercase text-muted-foreground"
                  >
                    Collapse All
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-5">
            {visibleSections.length === 0 ? (
              <div className="py-20 text-center glass-card rounded-2xl border-dashed">
                <div className="h-16 w-16 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-6">
                  <Search size={24} className="text-muted-foreground/40" />
                </div>
                <p className="text-lg font-bold text-foreground mb-1">No vectors found</p>
                <p className="text-sm text-muted-foreground font-medium max-w-xs mx-auto">
                  Adjust your search parameters or priority filters to find directives.
                </p>
                {hasActiveFilters && (
                  <Button
                    variant="link"
                    onClick={() => {
                      setSearchQuery("");
                      setPriorityFilter("all");
                      setSortMode("default");
                    }}
                    className="mt-4 font-bold tracking-tight text-primary uppercase text-xs"
                  >
                    Clear Search Directives
                  </Button>
                )}
              </div>
            ) : (
              visibleSections.map(({ section, index }) => (
                <Card
                  key={index}
                  className={cn(
                    "glass-card-interactive group overflow-hidden transition-all duration-500",
                    section.priority === 'high' ? 'border-destructive/30 shadow-destructive/5' : '',
                    expandedSections.has(index) ? 'shadow-medium' : ''
                  )}
                  data-testid={`card-section-${index}`}
                >
                  <CardHeader
                    className="cursor-pointer py-5"
                    onClick={() => toggleSection(index)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "h-10 w-10 rounded-xl flex items-center justify-center border transition-all duration-500 group-hover:scale-110 shadow-xs",
                          section.priority === 'high' ? 'bg-destructive/10 border-destructive/20 text-destructive' :
                          section.priority === 'medium' ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' :
                          'bg-success/10 border-success/20 text-success'
                        )}>
                          {section.title.toLowerCase().includes('warning') || section.priority === 'high' ? (
                            <AlertTriangle size={20} />
                          ) : (
                            <Sparkles size={18} />
                          )}
                        </div>
                        <div>
                          <CardTitle className="text-base font-bold tracking-tight group-hover:text-primary transition-colors">{section.title}</CardTitle>
                          <span className={cn(
                            "text-[10px] font-black uppercase tracking-widest",
                            section.priority === 'high' ? 'text-destructive' :
                            section.priority === 'medium' ? 'text-amber-500' :
                            'text-success'
                          )}>
                            PRIORITY: {section.priority}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            copySection(section, index);
                          }}
                          className="h-9 w-9 p-0 rounded-lg border-border/60 hover:bg-muted/50"
                          data-testid={`button-copy-section-${index}`}
                        >
                          {copiedSection === index ? <Check size={14} className="text-success" /> : <Copy size={14} className="text-muted-foreground" />}
                        </Button>
                        <div className={cn(
                          "h-9 w-9 rounded-lg border border-border/60 flex items-center justify-center transition-transform duration-500",
                          expandedSections.has(index) ? "rotate-180 bg-muted/50" : ""
                        )}>
                          <ChevronDown size={18} className="text-muted-foreground" />
                        </div>
                      </div>
                    </div>
                  </CardHeader>

                  {expandedSections.has(index) && (
                    <CardContent className="pt-2 pb-8 px-6 space-y-6 animate-slide-up">
                      <div className="relative">
                        <div className="absolute -left-4 top-0 bottom-0 w-1 bg-primary/20 rounded-full" />
                        <p className="text-sm font-medium text-foreground leading-relaxed whitespace-pre-wrap pl-2" data-testid={`text-section-content-${index}`}>
                          {section.content || "No content available for this section."}
                        </p>
                      </div>

                      {Array.isArray(section.steps) && section.steps.length > 0 && (
                        <div className="bg-muted/20 rounded-2xl p-5 border border-border/40">
                          <h4 className="text-xs font-black uppercase tracking-widest text-foreground mb-4 flex items-center gap-2">
                            <Activity size={14} className="text-primary" />
                            Operational Protocol
                          </h4>
                          <div className="space-y-4">
                            {section.steps.map((step, stepIndex) => (
                              <div key={stepIndex} className="flex gap-4 group/step" data-testid={`text-step-${index}-${stepIndex}`}>
                                <div className="h-6 w-6 rounded-full bg-background border border-border/60 flex items-center justify-center shrink-0 text-[10px] font-black group-hover/step:border-primary group-hover/step:text-primary transition-colors">
                                  {stepIndex + 1}
                                </div>
                                <p className="text-sm font-medium text-muted-foreground leading-snug pt-0.5">{step}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="grid gap-5 md:grid-cols-2">
                        {Array.isArray(section.risks) && section.risks.length > 0 && (
                          <div className="bg-destructive/5 rounded-2xl p-5 border border-destructive/10">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-destructive mb-3 flex items-center gap-2">
                              <Shield size={14} />
                              Risk Vectors
                            </h4>
                            <ul className="space-y-2.5">
                              {section.risks.map((risk, riskIndex) => (
                                <li key={riskIndex} className="flex items-start gap-3">
                                  <div className="h-1.5 w-1.5 rounded-full bg-destructive mt-1.5 shrink-0 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                                  <p className="text-xs font-semibold text-destructive/80 leading-relaxed">{risk}</p>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {Array.isArray(section.equipment) && section.equipment.length > 0 && (
                          <div className="bg-blue-500/5 rounded-2xl p-5 border border-blue-500/10">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-500 mb-3 flex items-center gap-2">
                              <Zap size={14} />
                              Logistics Needed
                            </h4>
                            <ul className="space-y-2.5">
                              {section.equipment.map((item, eqIndex) => (
                                <li key={eqIndex} className="flex items-start gap-3">
                                  <div className="h-1.5 w-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                                  <p className="text-xs font-semibold text-blue-500/80 leading-relaxed">{item}</p>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))
            )}
          </div>

          {(carePlan.emergencyContacts || carePlan.gpDetails || carePlan.additionalNotes) && (
            <Card className="glass-card overflow-hidden">
              <CardHeader className="border-b border-border/40">
                <CardTitle className="text-base">Logistical Meta-Data</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-6 text-sm">
                {carePlan.emergencyContacts && carePlan.emergencyContacts !== "Information not found in documents" && (
                  <div>
                    <strong className="text-foreground">Emergency Contacts:</strong> {carePlan.emergencyContacts}
                  </div>
                )}
                {carePlan.gpDetails && carePlan.gpDetails !== "Information not found in documents" && (
                  <div>
                    <strong className="text-foreground">GP Details:</strong> {carePlan.gpDetails}
                  </div>
                )}
                {carePlan.additionalNotes && carePlan.additionalNotes !== "Information not found in documents" && (
                  <div>
                    <strong className="text-foreground">Additional Notes:</strong> {carePlan.additionalNotes}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
