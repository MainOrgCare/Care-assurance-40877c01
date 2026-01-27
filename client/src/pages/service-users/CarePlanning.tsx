import { useState, useMemo } from "react";
import { useTemporaryData } from "@/context/TemporaryDataContext";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Switch } from "@/components/ui/switch";
import { FileText, ArrowRight, AlertTriangle, Loader2, CheckCircle2, Sparkles, ChevronDown, ChevronUp, Copy, Check, Search } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

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
    onSuccess: ({ raw, scrubbed }) => {
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

  const toggleSection = (index: number) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const copySection = async (section: CarePlanSection, index: number) => {
    const scrubbedSection = carePlanScrubbed?.sections?.[index] || section;
    await navigator.clipboard.writeText(formatSectionForCopy(scrubbedSection));
    setCopiedSection(index);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const copyAllPlan = async () => {
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
  };

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
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-heading font-bold text-foreground" data-testid="text-page-title">Care Planning</h2>
          <p className="text-muted-foreground mt-2">
            Generate detailed, first-person care plans based on uploaded documentation.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isAdmin && (
            <div className="flex flex-col items-start gap-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Switch checked={allowSensitive} onCheckedChange={setAllowSensitive} />
                <span>Show full names (admin view)</span>
              </div>
              <span className="text-[11px] text-muted-foreground/80">Copies and saves use initials only.</span>
            </div>
          )}
          {carePlan && (
            <Button variant="outline" onClick={copyAllPlan} className="gap-2" data-testid="button-copy-all">
              <Copy size={16} /> Copy Full Plan
            </Button>
          )}
        </div>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText size={20} />
            Source Documents
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {serviceUserData.socialWork && (
            <div className="p-3 rounded-lg bg-background border border-border text-sm text-muted-foreground flex items-center gap-2" data-testid="text-social-work-doc">
              {serviceUserData.socialWork.isParsing ? (
                <Loader2 size={16} className="animate-spin text-blue-400" />
              ) : (
                <CheckCircle2 size={16} className="text-emerald-400" />
              )}
              <strong>Social Work:</strong> {serviceUserData.socialWork.name}
              {serviceUserData.socialWork.parseError && (
                <span className="text-xs text-red-400 ml-auto">Parsing failed</span>
              )}
              {serviceUserData.socialWork.content && !serviceUserData.socialWork.parseError && (
                <span className="text-xs text-muted-foreground ml-auto">
                  {serviceUserData.socialWork.content.length.toLocaleString()} chars
                </span>
              )}
            </div>
          )}
          {serviceUserData.initialAssessment && (
            <div className="p-3 rounded-lg bg-background border border-border text-sm text-muted-foreground flex items-center gap-2" data-testid="text-initial-assessment-doc">
              {serviceUserData.initialAssessment.isParsing ? (
                <Loader2 size={16} className="animate-spin text-blue-400" />
              ) : (
                <CheckCircle2 size={16} className="text-emerald-400" />
              )}
              <strong>Initial Assessment:</strong> {serviceUserData.initialAssessment.name}
              {serviceUserData.initialAssessment.parseError && (
                <span className="text-xs text-red-400 ml-auto">Parsing failed</span>
              )}
              {serviceUserData.initialAssessment.content && !serviceUserData.initialAssessment.parseError && (
                <span className="text-xs text-muted-foreground ml-auto">
                  {serviceUserData.initialAssessment.content.length.toLocaleString()} chars
                </span>
              )}
            </div>
          )}
          {parseErrors.length > 0 && (
            <div className="rounded-lg border border-red-900/40 bg-red-950/20 p-3 text-xs text-red-200/80">
              <div className="flex items-center gap-2 text-red-300 font-semibold">
                <AlertTriangle size={14} />
                Parsing issues detected
              </div>
              <div className="mt-2 space-y-1">
                {parseErrors.map((error) => (
                  <div key={error.label} className="flex items-start gap-2">
                    <span className="text-red-400">-</span>
                    <span>{error.label}: {error.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <Button 
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending || isAnyParsing()}
            className="w-full mt-4 gap-2"
            data-testid="button-generate-care-plan"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Generating Detailed Care Plan...
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Generate First-Person Care Plan
              </>
            )}
          </Button>

          {generateMutation.isPending && (
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
          
          {isAnyParsing() && (
            <p className="text-xs text-amber-400 text-center">
              Please wait for documents to finish parsing...
            </p>
          )}
        </CardContent>
      </Card>

      {carePlan && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold text-foreground" data-testid="text-care-plan-title">
              Care Plan for {carePlan.serviceUserInitials}
            </h3>
            <span className="text-sm text-muted-foreground">Generated: {carePlan.generatedDate}</span>
          </div>

          <Card className="bg-card border-border">
            <CardHeader className="space-y-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle>Plan Overview</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Showing {visibleSections.length} of {sectionStats.total} sections
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">Sections {sectionStats.total}</Badge>
                  <Badge variant="destructive">High {sectionStats.high}</Badge>
                  <Badge variant="warning">Medium {sectionStats.medium}</Badge>
                  <Badge variant="success">Low {sectionStats.low}</Badge>
                  <Badge variant="muted">Steps {sectionStats.steps}</Badge>
                  <Badge variant="muted">Risks {sectionStats.risks}</Badge>
                  <Badge variant="muted">Equipment {sectionStats.equipment}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search sections, steps, risks, or equipment..."
                    className="pl-9"
                    data-testid="input-care-plan-search"
                  />
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                  <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Priority</span>
                  <ToggleGroup
                    type="single"
                    value={priorityFilter}
                    onValueChange={(value) =>
                      setPriorityFilter((value as "all" | "high" | "medium" | "low") || "all")
                    }
                    variant="outline"
                    size="sm"
                    className="flex-wrap justify-start sm:justify-end"
                  >
                    <ToggleGroupItem value="all">All</ToggleGroupItem>
                    <ToggleGroupItem value="high">High</ToggleGroupItem>
                    <ToggleGroupItem value="medium">Medium</ToggleGroupItem>
                    <ToggleGroupItem value="low">Low</ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Sort</span>
                  <ToggleGroup
                    type="single"
                    value={sortMode}
                    onValueChange={(value) =>
                      setSortMode((value as "default" | "priority") || "default")
                    }
                    variant="outline"
                    size="sm"
                  >
                    <ToggleGroupItem value="default">Original</ToggleGroupItem>
                    <ToggleGroupItem value="priority">Priority First</ToggleGroupItem>
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
                    >
                      Reset Filters
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2">
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
                  >
                    Collapse All
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {visibleSections.length === 0 ? (
            <Card className="bg-card border-border border-dashed">
              <CardContent className="py-8 text-center space-y-3">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <AlertTriangle size={20} className="text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-foreground">No sections match your filters.</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Reset filters or adjust your search terms to see more results.
                  </p>
                </div>
                {hasActiveFilters && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearchQuery("");
                      setPriorityFilter("all");
                      setSortMode("default");
                    }}
                  >
                    Reset Filters
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            visibleSections.map(({ section, index }) => (
              <Card 
                key={index} 
                className={`bg-card border-border overflow-hidden ${section.priority === 'high' ? 'ring-1 ring-red-900/50' : ''}`}
                data-testid={`card-section-${index}`}
              >
                <CardHeader 
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleSection(index)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {section.title.toLowerCase().includes('warning') && (
                        <AlertTriangle size={20} className="text-red-400" />
                      )}
                      <CardTitle className="text-lg">{section.title}</CardTitle>
                      <span className={`text-xs px-2 py-1 rounded border ${getPriorityColor(section.priority)}`}>
                        {section.priority}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          copySection(section, index);
                        }}
                        className="h-8 w-8 p-0"
                        data-testid={`button-copy-section-${index}`}
                      >
                        {copiedSection === index ? <Check size={14} /> : <Copy size={14} />}
                      </Button>
                      {expandedSections.has(index) ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </div>
                  </div>
                </CardHeader>
                
                {expandedSections.has(index) && (
                  <CardContent className="pt-0 space-y-4">
                    <div className="prose prose-invert max-w-none">
                      <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap" data-testid={`text-section-content-${index}`}>
                        {section.content || "No content available for this section."}
                      </p>
                    </div>

                    {Array.isArray(section.steps) && section.steps.length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-sm font-semibold text-foreground mb-2">Step-by-Step Instructions:</h4>
                        <ol className="list-decimal list-inside space-y-2">
                          {section.steps.map((step, stepIndex) => (
                            <li key={stepIndex} className="text-sm text-muted-foreground" data-testid={`text-step-${index}-${stepIndex}`}>
                              {step}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-4 mt-4">
                      {Array.isArray(section.risks) && section.risks.length > 0 && (
                        <div className="flex-1 min-w-[200px]">
                          <h4 className="text-sm font-semibold text-red-400 mb-2">Risks:</h4>
                          <ul className="text-xs text-muted-foreground space-y-1">
                            {section.risks.map((risk, riskIndex) => (
                              <li key={riskIndex} className="flex items-start gap-1">
                                <AlertTriangle size={12} className="mt-0.5 text-red-400 flex-shrink-0" />
                                {risk}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {Array.isArray(section.equipment) && section.equipment.length > 0 && (
                        <div className="flex-1 min-w-[200px]">
                          <h4 className="text-sm font-semibold text-blue-400 mb-2">Equipment Needed:</h4>
                          <ul className="text-xs text-muted-foreground space-y-1">
                            {section.equipment.map((item, eqIndex) => (
                              <li key={eqIndex}>- {item}</li>
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

          {(carePlan.emergencyContacts || carePlan.gpDetails || carePlan.additionalNotes) && (
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle>Additional Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
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
