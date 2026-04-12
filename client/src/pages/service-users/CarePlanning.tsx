import { useState, useMemo, useCallback, useRef } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useTemporaryData } from "@/context/TemporaryDataContext";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Switch } from "@/components/ui/switch";
import { FileText, ArrowRight, AlertTriangle, Loader2, CheckCircle2, Sparkles, ChevronDown, ChevronUp, Copy, Check, Search, Clock, Activity, Shield, Zap, Edit3 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { TemplateFiller } from "@/components/TemplateFiller";
import { processVaultResponse } from "@/lib/pii-vault";
import { consumeJsonSseStream } from "@/lib/sse";

/**
 * Highlight template placeholders like [Name], [NHS Number] etc.
 * Returns JSX with placeholders styled distinctly
 */
function highlightPlaceholders(text: string): React.ReactNode {
  const placeholderPattern = /\[([^\]]+)\]/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = placeholderPattern.exec(text)) !== null) {
    // Add text before placeholder
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    // Add highlighted placeholder
    parts.push(
      <span
        key={key++}
        className="inline-flex items-center gap-1 px-2 py-0.5 mx-0.5 bg-warning/10 dark:bg-warning/30 text-warning rounded-md font-semibold text-xs border border-warning/30 cursor-pointer hover:bg-warning/20 dark:hover:bg-warning/10 transition-colors"
        title={`Click to fill in: ${match[1]}`}
      >
        <Edit3 size={10} />
        {match[0]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? parts : text;
}

/**
 * Count placeholders in text
 */
function countPlaceholders(text: string): number {
  const matches = text.match(/\[([^\]]+)\]/g);
  return matches ? matches.length : 0;
}

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
  callType?: string;
  generationMode?: string;
  content?: string; // New simplified format
  sections?: CarePlanSection[]; // Legacy format
  emergencyContacts?: string;
  gpDetails?: string;
  additionalNotes?: string;
}

interface CallTypeInfo {
  callType: string;
  timeBand?: string;
  daysPerWeek?: number;
  duration?: number;
  carersRequired?: number;
}

const GENERAL_CALL_TYPE = "General";

type CarePlanMutationResult = {
  callType: string;
  raw: CarePlanResult;
  scrubbed: CarePlanResult;
};

export default function CarePlanning() {
  const { serviceUserData, getAllDocumentContent, isAnyParsing } = useTemporaryData();
  const { user } = useAuth();
  const { toast } = useToast();
  usePageTitle("Care Planning");
  
  // Call type management
  const [availableCallTypes, setAvailableCallTypes] = useState<string[]>([]);
  const [callTypeDetails, setCallTypeDetails] = useState<CallTypeInfo[]>([]);
  const [selectedCallType, setSelectedCallType] = useState<string | null>(null);
  const [loadingCallTypes, setLoadingCallTypes] = useState(false);
  
  // Care plans by call type
  const [carePlansByTypeRaw, setCarePlansByTypeRaw] = useState<Map<string, CarePlanResult>>(new Map());
  const [carePlansByTypeScrubbed, setCarePlansByTypeScrubbed] = useState<Map<string, CarePlanResult>>(new Map());
  
  // Legacy single care plan state (for backward compatibility)
  const [carePlanRaw, setCarePlanRaw] = useState<CarePlanResult | null>(null);
  const [carePlanScrubbed, setCarePlanScrubbed] = useState<CarePlanResult | null>(null);
  
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());
  const [copiedSection, setCopiedSection] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [sortMode, setSortMode] = useState<"default" | "priority">("default");
  const effectiveCallType = selectedCallType || GENERAL_CALL_TYPE;

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

  // Get current care plan based on selected call type or fall back to legacy single plan
  const currentCarePlanRaw = selectedCallType ? carePlansByTypeRaw.get(selectedCallType) : carePlanRaw;
  const currentCarePlanScrubbed = selectedCallType ? carePlansByTypeScrubbed.get(selectedCallType) : carePlanScrubbed;
  
  // Always use raw data with full names restored automatically via vault
  const carePlan = useMemo(
    () => currentCarePlanRaw || currentCarePlanScrubbed,
    [currentCarePlanRaw, currentCarePlanScrubbed]
  );
  const isRuleBasedCarePlan = carePlan?.generationMode === "rule-based";

  const hasData = Boolean(
    serviceUserData.socialWork ||
    serviceUserData.initialAssessment ||
    (serviceUserData.additionalNotes && serviceUserData.additionalNotes.trim().length > 0)
  );
  
  // Handle both new simplified format (content field) and legacy format (sections array)
  const isSimplifiedFormat = !!(carePlan?.content && !carePlan?.sections);
  
  const sectionsWithIndex = useMemo(() => {
    if (isSimplifiedFormat) {
      // New format - single content block
      return [];
    }
    if (!carePlan?.sections) return [];
    return carePlan.sections
      .map((section, index) => ({ section, index }))
      .filter(({ section }) => section != null);
  }, [carePlan?.sections, carePlan?.content, isSimplifiedFormat]);
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

  // Fetch call types from database for this service user
  const fetchCallTypes = useCallback(async () => {
    setLoadingCallTypes(true);
    try {
      // Extract service user name from documents
      const documentContent = getAllDocumentContent();
      const nameMatch = documentContent.match(/(?:Name|Known as|Full name)[:;]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);
      const serviceUserName = nameMatch?.[1] || "Unknown";

      const response = await fetch("/api/service-user/call-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ serviceUserName }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch call types");
      }

      const data = await response.json();
      
      if (data.callTypes && data.callTypes.length > 0) {
        setAvailableCallTypes(data.callTypes);
        setCallTypeDetails(data.orders || []);
        setSelectedCallType(data.callTypes[0]); // Auto-select first
        
        toast({
          title: "Call Types Found",
          description: `Found ${data.callTypes.length} call type(s): ${data.callTypes.join(", ")}`,
        });
      } else {
        setSelectedCallType(GENERAL_CALL_TYPE);
        toast({
          title: "No Call Types Found",
          description: "Service user not found in database. You can still generate a general care plan.",
          variant: "default",
        });
      }
    } catch (error: any) {
      console.error("Fetch call types error:", error);
      toast({
        title: "Error Fetching Call Types",
        description: error.message || "Failed to fetch call types from database.",
        variant: "destructive",
      });
    } finally {
      setLoadingCallTypes(false);
    }
  }, [getAllDocumentContent, toast]);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const documentContent = getAllDocumentContent();
      if (!documentContent.trim()) {
        throw new Error("No document content available");
      }

      const requestedCallType = effectiveCallType;

      setProgress(0);
      setProgressStatus(`Preparing ${requestedCallType} care plan...`);

      // Don't clear existing plans - we're building up a collection
      const sectionsInProgressRaw: CarePlanSection[] = [];
      const sectionsInProgressScrubbed: CarePlanSection[] = [];

      const response = await fetch("/api/ai/generate-care-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ 
          documentContent, 
          callType: requestedCallType,
          allowSensitive: true // Always request vault export for automatic restoration
        }),
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

      let resultRaw: CarePlanResult | null = null;
      let resultScrubbed: CarePlanResult | null = null;

      await consumeJsonSseStream(response, ({ eventType, data }) => {
        const payload = data as any;
        if (eventType === "progress") {
          const percent = typeof payload?.percent === "number" ? payload.percent : 0;
          const status = typeof payload?.status === "string" ? payload.status : "Generating care plan...";
          throttledSetProgress(percent, status);
          return;
        }
        if (eventType === "section") {
          if (!payload?.section || typeof payload.index !== "number") return;
          const sectionScrubbed = payload.scrubbedSection || payload.section;
          sectionsInProgressRaw[payload.index] = payload.section;
          sectionsInProgressScrubbed[payload.index] = sectionScrubbed;
          const validSectionsRaw = sectionsInProgressRaw.filter((s): s is CarePlanSection => s !== undefined);
          const validSectionsScrubbed = sectionsInProgressScrubbed.filter((s): s is CarePlanSection => s !== undefined);
          setCarePlanRaw((prev) => ({
            serviceUserInitials: prev?.serviceUserInitials || "N.N.",
            generatedDate: prev?.generatedDate || new Date().toLocaleDateString("en-GB"),
            sections: validSectionsRaw,
            emergencyContacts: prev?.emergencyContacts || "Loading...",
            gpDetails: prev?.gpDetails || "Loading...",
            additionalNotes: prev?.additionalNotes || "Loading...",
          }));
          setCarePlanScrubbed((prev) => ({
            serviceUserInitials: prev?.serviceUserInitials || "N.N.",
            generatedDate: prev?.generatedDate || new Date().toLocaleDateString("en-GB"),
            sections: validSectionsScrubbed,
            emergencyContacts: prev?.emergencyContacts || "Loading...",
            gpDetails: prev?.gpDetails || "Loading...",
            additionalNotes: prev?.additionalNotes || "Loading...",
          }));
          setExpandedSections((prev) => {
            const next = new Set(prev);
            next.add(payload.index);
            return next;
          });
          return;
        }
        if (eventType === "error") {
          throw new Error(payload?.message || "Care plan generation failed");
        }
        if (eventType !== "result" || !payload || typeof payload !== "object") {
          return;
        }

        const { scrubbed, raw } = processVaultResponse<CarePlanResult>(
          payload,
          true // Always restore full names via vault
        );
        resultScrubbed = scrubbed;
        resultRaw = raw || scrubbed;
      });

      if (!resultRaw) {
        throw new Error("No result received from server");
      }

      return { callType: requestedCallType, raw: resultRaw, scrubbed: resultScrubbed || resultRaw };
    },
    onSuccess: ({ callType, raw, scrubbed }: CarePlanMutationResult) => {
      setProgress(100);
      setProgressStatus("Complete!");
      setTimeout(() => {
        setProgress(0);
        setProgressStatus("");
      }, 500);
      setSelectedCallType(callType);
      
      // Store in call-type-specific maps
      setCarePlansByTypeRaw(prev => {
        const next = new Map(prev);
        next.set(callType, raw);
        return next;
      });
      setCarePlansByTypeScrubbed(prev => {
        const next = new Map(prev);
        next.set(callType, scrubbed || raw);
        return next;
      });

      // Also update legacy single state for backward compatibility
      if (raw.sections) {
        // Legacy format with sections
        const safeSectionsRaw = Array.isArray(raw.sections) ? raw.sections : [];
        const safeSectionsScrubbed = Array.isArray(scrubbed?.sections) ? scrubbed.sections : [];
        const safeDataRaw: CarePlanResult = {
          serviceUserInitials: raw.serviceUserInitials || "N.N.",
          generatedDate: raw.generatedDate || new Date().toLocaleDateString("en-GB"),
          sections: safeSectionsRaw,
          emergencyContacts: raw.emergencyContacts || "",
          gpDetails: raw.gpDetails || "",
          additionalNotes: raw.additionalNotes || "",
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
      } else {
        // New simplified format with content block
        setCarePlanRaw(raw);
        setCarePlanScrubbed(scrubbed || raw);
      }

      setSearchQuery("");
      setPriorityFilter("all");
      setSortMode("default");
      
      toast({
        title: `${callType} Care Plan Generated`,
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

    const sectionsText = (copySource.sections || [])
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
      case "high": return "text-destructive bg-destructive/10 border-destructive/30";
      case "medium": return "text-warning bg-warning/30 border-warning/30";
      case "low": return "text-success bg-success/10 border-success/30";
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
          <h2 className="text-2xl font-semibold text-foreground" data-testid="text-no-data-title">No Data Available</h2>
          <p className="text-muted-foreground">
            Please upload Social Work documents, an Initial Assessment, or add text notes to generate a Care Plan.
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
    <div className="page-shell page-shell-compact">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 animate-slide-up stagger-1">
        <div className="space-y-1">
          <h1 className="page-title leading-tight" data-testid="text-page-title">Care Planning</h1>
          <p className="page-subtitle">Generate detailed, first-person care plans based on uploaded documentation.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isRuleBasedCarePlan && (
            <Badge className="bg-success/10 text-success border border-success/30 dark:bg-success/10 dark:text-success dark:border-success/30">
              Secure Rule-Based Output
            </Badge>
          )}
          {/* Names are automatically restored from vault - no toggle needed */}
          {carePlan && (
            <Button variant="outline" onClick={copyAllPlan} className="gap-2.5 rounded-xl border-border/60 font-medium tracking-tight shadow-sm" data-testid="button-copy-all">
              <Copy size={16} /> Copy Full Plan
            </Button>
          )}
        </div>
      </div>

      <Card className="app-surface animate-slide-up stagger-2 overflow-hidden">
        <CardHeader className="border-b border-border/40 pb-6">
          <CardTitle className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-lg flex items-center justify-center bg-primary/8">
              <FileText size={18} className="text-primary" />
            </div>
            Source Documents
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          {serviceUserData.socialWork && (
            <div className="p-4 rounded-xl bg-muted/20 border border-border/40 text-sm text-foreground flex items-center gap-3 group transition-colors hover:bg-muted/30" data-testid="text-social-work-doc">
              <div className="h-8 w-8 rounded-lg bg-background flex items-center justify-center border border-border/50">
                {serviceUserData.socialWork.isParsing ? (
                  <Loader2 size={16} className="animate-spin text-primary" />
                ) : (
                  <CheckCircle2 size={16} className="text-success" />
                )}
              </div>
              <div>
                <p className="font-medium tracking-tight">Social Work</p>
                <p className="text-xs text-muted-foreground font-medium">{serviceUserData.socialWork.name}</p>
              </div>
              {serviceUserData.socialWork.parseError && (
                <span className="text-xs text-destructive font-semibold ml-auto bg-destructive/10 px-2 py-1 rounded-lg">Parsing failed</span>
              )}
              {serviceUserData.socialWork.content && !serviceUserData.socialWork.parseError && (
                <span className="text-xs font-semibold text-muted-foreground ml-auto bg-muted/40 px-2.5 py-1 rounded-lg tracking-tighter">
                  {serviceUserData.socialWork.content.length.toLocaleString()} CHR
                </span>
              )}
            </div>
          )}
          {serviceUserData.initialAssessment && (
            <div className="p-4 rounded-xl bg-muted/20 border border-border/40 text-sm text-foreground flex items-center gap-3 group transition-colors hover:bg-muted/30" data-testid="text-initial-assessment-doc">
              <div className="h-8 w-8 rounded-lg bg-background flex items-center justify-center border border-border/50">
                {serviceUserData.initialAssessment.isParsing ? (
                  <Loader2 size={16} className="animate-spin text-primary" />
                ) : (
                  <CheckCircle2 size={16} className="text-success" />
                )}
              </div>
              <div>
                <p className="font-medium tracking-tight">Initial Assessment</p>
                <p className="text-xs text-muted-foreground font-medium">{serviceUserData.initialAssessment.name}</p>
              </div>
              {serviceUserData.initialAssessment.parseError && (
                <span className="text-xs text-destructive font-semibold ml-auto bg-destructive/10 px-2 py-1 rounded-lg">Parsing failed</span>
              )}
              {serviceUserData.initialAssessment.content && !serviceUserData.initialAssessment.parseError && (
                <span className="text-xs font-semibold text-muted-foreground ml-auto bg-muted/40 px-2.5 py-1 rounded-lg tracking-tighter">
                  {serviceUserData.initialAssessment.content.length.toLocaleString()} CHR
                </span>
              )}
            </div>
          )}
          {parseErrors.length > 0 && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-xs text-destructive/80">
              <div className="flex items-center gap-2 text-destructive font-semibold uppercase tracking-wider mb-2">
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
          
          {/* Call Type Selection */}
          {!availableCallTypes.length && (
            <Button 
              onClick={fetchCallTypes}
              disabled={loadingCallTypes || isAnyParsing()}
              variant="outline"
              className="w-full mt-2 gap-2.5 h-11 rounded-xl font-medium tracking-tight border-primary/30 hover:bg-primary/5"
            >
              {loadingCallTypes ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Finding Call Types...
                </>
              ) : (
                <>
                  <Search size={16} />
                  Find Call Types for This Service User
                </>
              )}
            </Button>
          )}

          {availableCallTypes.length > 0 && (
            <div className="space-y-3 mt-2 p-4 rounded-xl bg-primary/5 border border-primary/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-widest text-primary">Select Call Type:</span>
                <Badge variant="outline" className="text-[10px]">
                  {carePlansByTypeRaw.size}/{availableCallTypes.length} Generated
                </Badge>
              </div>
              <ToggleGroup 
                type="single"
                value={selectedCallType || ""}
                onValueChange={(value) => setSelectedCallType(value || null)}
                className="grid grid-cols-2 sm:grid-cols-3 gap-2"
              >
                {availableCallTypes.map(callType => {
                  const hasGenerated = carePlansByTypeRaw.has(callType);
                  const details = callTypeDetails.find(d => d.callType === callType);
                  return (
                    <ToggleGroupItem 
                      key={callType} 
                      value={callType}
                      className={cn(
                        "relative flex flex-col items-start h-auto py-3 px-4",
                        hasGenerated && "border-success/50 bg-success/5"
                      )}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="font-semibold text-sm">{callType}</span>
                        {hasGenerated && (
                          <CheckCircle2 size={14} className="text-success" />
                        )}
                      </div>
                      {details && (
                        <div className="text-[10px] text-muted-foreground font-medium text-left">
                          {details.duration}min • {details.carersRequired ?? 1} carer{(details.carersRequired ?? 1) > 1 ? 's' : ''}
                          {details.timeBand && (
                            <div className="text-[9px] opacity-70">{details.timeBand}</div>
                          )}
                        </div>
                      )}
                    </ToggleGroupItem>
                  );
                })}
              </ToggleGroup>
            </div>
          )}
          
          <Button 
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending || isAnyParsing()}
            className="w-full mt-2 gap-2.5 h-12 rounded-xl font-medium tracking-tight shadow-glow"
            data-testid="button-generate-care-plan"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Generating {effectiveCallType} Plan...
              </>
            ) : (
              <>
                <Sparkles size={18} />
                Generate {effectiveCallType} Care Plan
              </>
            )}
          </Button>

          {generateMutation.isPending && (
            <div className="space-y-4 p-5 bg-primary/5 border border-primary/10 rounded-xl" data-testid="progress-container">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-xs font-semibold uppercase tracking-widest text-primary">{progressStatus}</span>
                </div>
                <span className="text-sm font-black text-primary">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-1.5 bg-primary/10" />
            </div>
          )}
          
          {isAnyParsing() && (
            <p className="text-[10px] font-semibold text-warning uppercase tracking-widest text-center mt-2 animate-pulse">
              System busy: parsing baseline documents...
            </p>
          )}
        </CardContent>
      </Card>

      {carePlan && (
        <div className="space-y-6 animate-slide-up">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xl font-black tracking-tight text-foreground" data-testid="text-care-plan-title">
              {carePlan.callType ? `${carePlan.callType} Care Plan` : "Operational Plan"}: {carePlan.serviceUserInitials}
            </h3>
            <div className="flex items-center gap-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest bg-muted/40 px-3 py-1 rounded-full border border-border/40">
              <Clock size={12} className="text-primary" />
              TIMESTAMP: {carePlan.generatedDate}
            </div>
          </div>

          {/* Call Type Tabs - show if multiple plans generated */}
          {carePlansByTypeRaw.size > 0 && (
            <Card className="app-surface overflow-hidden">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-sm font-semibold text-muted-foreground">Generated Plans:</span>
                  <Badge variant="outline">{carePlansByTypeRaw.size} available</Badge>
                </div>
                <ToggleGroup
                  type="single"
                  value={selectedCallType || ""}
                  onValueChange={(value) => setSelectedCallType(value || null)}
                  className="flex flex-wrap gap-2"
                >
                  {Array.from(carePlansByTypeRaw.keys()).map(callType => (
                    <ToggleGroupItem
                      key={callType}
                      value={callType}
                      className="font-semibold"
                    >
                      {callType}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </CardContent>
            </Card>
          )}

          {/* New Simplified Format Display - Single Content Block */}
          {isSimplifiedFormat && carePlan.content && (
            <Card className="app-surface overflow-hidden">
              <CardHeader className="border-b border-border/40 pb-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      {carePlan.callType && (
                        <Badge variant="outline" className="font-semibold">{carePlan.callType}</Badge>
                      )}
                      Person-Centred Care Plan
                    </CardTitle>
                    <CardDescription className="text-xs font-medium mt-1">
                      CQC 2024 compliant • First-person narrative • Template output
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {carePlan.content && countPlaceholders(carePlan.content) > 0 && (
                      <>
                        <Badge variant="secondary" className="bg-warning/10 dark:bg-warning/30 text-warning font-semibold">
                          <Edit3 size={12} className="mr-1" />
                          {countPlaceholders(carePlan.content)} fields to complete
                        </Badge>
                        <TemplateFiller
                          templateText={carePlan.content}
                          onComplete={(filledText) => {
                            navigator.clipboard.writeText(filledText);
                            toast({
                              title: "Template Completed",
                              description: "Filled care plan copied to clipboard",
                            });
                          }}
                          title={`Complete ${carePlan.callType || "Care"} Plan`}
                        />
                      </>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(carePlan.content || "");
                        toast({
                          title: "Copied to Clipboard",
                          description: `${carePlan.callType} care plan template copied`,
                        });
                      }}
                      className="gap-2.5 rounded-xl border-border/60 font-medium tracking-tight shadow-sm"
                    >
                      <Copy size={16} /> Copy Raw
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                {carePlan.content && countPlaceholders(carePlan.content) > 0 && (
                  <div className="mb-4 p-3 bg-warning/10 border border-warning/30 dark:border-warning/30 rounded-lg">
                    <p className="text-xs text-warning font-medium flex items-center gap-2">
                      <Edit3 size={14} />
                      <span>
                        <strong>Template Output:</strong> This plan contains {countPlaceholders(carePlan.content)} placeholder fields highlighted in yellow.
                        Copy the template and replace each [placeholder] with actual data before saving to the care record.
                      </span>
                    </p>
                  </div>
                )}
                <div className="prose prose-sm max-w-none">
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground bg-muted/20 p-6 rounded-xl border border-border/40">
                    {carePlan.content ? highlightPlaceholders(carePlan.content) : carePlan.content}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Legacy Sections Format Display */}
          {!isSimplifiedFormat && sectionsWithIndex.length > 0 && (
          <Card className="app-surface overflow-hidden">
            <CardHeader className="border-b border-border/40 pb-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="text-lg">Intelligence Feed</CardTitle>
                  <CardDescription className="text-xs font-medium">
                    Showing {visibleSections.length} of {sectionStats.total} mapped operational vectors.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="rounded-lg font-semibold">TOTAL {sectionStats.total}</Badge>
                  <Badge className="rounded-lg font-semibold bg-destructive/15 text-destructive border-destructive/20">HIGH {sectionStats.high}</Badge>
                  <Badge className="rounded-lg font-semibold bg-warning/100/15 text-warning border-warning/20">MED {sectionStats.medium}</Badge>
                  <Badge className="rounded-lg font-semibold bg-success/15 text-success border-success/20">LOW {sectionStats.low}</Badge>
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
                    <ToggleGroupItem value="all" className="rounded-lg font-medium text-[10px]">ALL</ToggleGroupItem>
                    <ToggleGroupItem value="high" className="rounded-lg font-medium text-[10px]">HIGH</ToggleGroupItem>
                    <ToggleGroupItem value="medium" className="rounded-lg font-medium text-[10px]">MED</ToggleGroupItem>
                    <ToggleGroupItem value="low" className="rounded-lg font-medium text-[10px]">LOW</ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-border/40">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-1">Sequence</span>
                  <ToggleGroup
                    type="single"
                    value={sortMode}
                    onValueChange={(value: string) =>
                      setSortMode((value as "default" | "priority") || "default")
                    }
                    variant="outline"
                    size="sm"
                  >
                    <ToggleGroupItem value="default" className="rounded-lg font-medium text-[10px]">LOGICAL</ToggleGroupItem>
                    <ToggleGroupItem value="priority" className="rounded-lg font-medium text-[10px]">CRITICAL FIRST</ToggleGroupItem>
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
                      className="text-[10px] font-semibold text-primary uppercase tracking-widest"
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
                    className="rounded-lg font-medium text-[10px] uppercase border-border/60"
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
                    className="rounded-lg font-medium text-[10px] uppercase text-muted-foreground"
                  >
                    Collapse All
                  </Button>
                </div>
              </div>

              <div className="grid gap-5">
                {visibleSections.length === 0 ? (
              <div className="py-20 text-center rounded-2xl border-dashed">
                <div className="h-16 w-16 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-6">
                  <Search size={24} className="text-muted-foreground/60" />
                </div>
                <p className="text-lg font-semibold text-foreground mb-1">No vectors found</p>
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
                    className="mt-4 font-medium tracking-tight text-primary uppercase text-xs"
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
                    "group overflow-hidden transition-all duration-500",
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
                          "h-10 w-10 rounded-xl flex items-center justify-center border transition-all duration-500",
                          section.priority === 'high' ? 'bg-destructive/10 border-destructive/20 text-destructive' :
                          section.priority === 'medium' ? 'bg-warning/100/10 border-warning/20 text-warning' :
                          'bg-success/10 border-success/20 text-success'
                        )}>
                          {section.title.toLowerCase().includes('warning') || section.priority === 'high' ? (
                            <AlertTriangle size={20} />
                          ) : (
                            <Sparkles size={18} />
                          )}
                        </div>
                        <div>
                          <CardTitle className="text-base font-medium tracking-tight group-hover:text-primary transition-colors">{section.title}</CardTitle>
                          <span className={cn(
                            "text-[10px] font-black uppercase tracking-widest",
                            section.priority === 'high' ? 'text-destructive' :
                            section.priority === 'medium' ? 'text-warning' :
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
                          <div className="bg-primary/5 rounded-2xl p-5 border border-primary/20">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-primary mb-3 flex items-center gap-2">
                              <Zap size={14} />
                              Logistics Needed
                            </h4>
                            <ul className="space-y-2.5">
                              {section.equipment.map((item, eqIndex) => (
                                <li key={eqIndex} className="flex items-start gap-3">
                                  <div className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0 shadow-none" />
                                  <p className="text-xs font-semibold text-primary/80 leading-relaxed">{item}</p>
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
        </CardContent>
      </Card>
          )}

          {/* Meta-data section - only show for legacy format with these fields */}
          {!isSimplifiedFormat && (carePlan.emergencyContacts || carePlan.gpDetails || carePlan.additionalNotes) && (
            <Card className="app-surface overflow-hidden">
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
