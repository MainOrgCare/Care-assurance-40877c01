import { useState, useEffect, useMemo } from "react";
import { useTemporaryData } from "@/context/TemporaryDataContext";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { ShieldAlert, ArrowRight, Loader2, AlertTriangle, CheckCircle, FileText, Info, Search, Copy, Check, X } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";

interface RecommendedAssessment {
  name: string;
  isMandatory: boolean;
  reason: string;
  evidence?: string;
}

interface RiskAnalysis {
  serviceUser: {
    initials: string;
  };
  medicalConditions: string[];
  careActivities: string[];
  concerns: string[];
  recommendedAssessments: RecommendedAssessment[];
  documentSummary: string;
}

interface RiskRow {
  riskDefinition: string;
  initialRating: string;
  howItsARisk: string;
  whoWillBeHarmed: string;
  controlMeasures: string;
  ratingAfterControls: string;
}

interface GeneratedAssessment {
  category: string;
  serviceUserInitials: string;
  assessmentDate: string;
  risks: RiskRow[];
  signedBy: string;
  jobTitle: string;
  additionalNotes: string;
}

export default function RiskAssessment() {
  const { serviceUserData, getAllDocumentContent, isAnyParsing } = useTemporaryData();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisRaw, setAnalysisRaw] = useState<RiskAnalysis | null>(null);
  const [analysisScrubbed, setAnalysisScrubbed] = useState<RiskAnalysis | null>(null);
  const [selectedAssessments, setSelectedAssessments] = useState<Set<string>>(new Set());
  const [showWarnings, setShowWarnings] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAssessmentsRaw, setGeneratedAssessmentsRaw] = useState<GeneratedAssessment[]>([]);
  const [generatedAssessmentsScrubbed, setGeneratedAssessmentsScrubbed] = useState<GeneratedAssessment[]>([]);
  const [step, setStep] = useState<"upload" | "analyze" | "select" | "generate" | "view">("upload");
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [assessmentFilter, setAssessmentFilter] = useState<"all" | "mandatory" | "optional">("all");
  const [sortMode, setSortMode] = useState<"default" | "mandatory">("default");
  const [copiedAssessment, setCopiedAssessment] = useState<number | null>(null);
  const [allowSensitive, setAllowSensitive] = useState(false);
  const [customAssessmentName, setCustomAssessmentName] = useState("");
  const [customAssessments, setCustomAssessments] = useState<RecommendedAssessment[]>([]);

  const isAdmin = user?.role === "admin";
  const showSensitive = isAdmin && allowSensitive;
  const analysis = useMemo(
    () => (showSensitive && analysisRaw ? analysisRaw : analysisScrubbed),
    [showSensitive, analysisRaw, analysisScrubbed]
  );
  const generatedAssessments = useMemo(
    () => (showSensitive && generatedAssessmentsRaw.length > 0 ? generatedAssessmentsRaw : generatedAssessmentsScrubbed),
    [showSensitive, generatedAssessmentsRaw, generatedAssessmentsScrubbed]
  );
  const generatedAssessmentsForCopy = generatedAssessmentsScrubbed.length > 0 ? generatedAssessmentsScrubbed : generatedAssessmentsRaw;

  const hasData = serviceUserData.initialAssessment || serviceUserData.socialWork || serviceUserData.carePlan;
  const hasAllParsed = hasData && !isAnyParsing();
  const parseErrors = [
    serviceUserData.socialWork?.parseError
      ? { label: "Social Work", message: serviceUserData.socialWork.parseError }
      : null,
    serviceUserData.initialAssessment?.parseError
      ? { label: "Initial Assessment", message: serviceUserData.initialAssessment.parseError }
      : null,
    serviceUserData.carePlan?.parseError
      ? { label: "Care Plan", message: serviceUserData.carePlan.parseError }
      : null,
  ].filter(Boolean) as { label: string; message: string }[];

  const normalizeAssessmentName = (value: string) => value.trim().replace(/\s+/g, " ");
  const combinedAssessments = useMemo(() => {
    if (!analysis) return [];
    const combined: RecommendedAssessment[] = [];
    const seen = new Set<string>();
    analysis.recommendedAssessments.forEach((assessment) => {
      if (!assessment?.evidence || !assessment.evidence.trim()) return;
      const key = normalizeAssessmentName(assessment.name).toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      combined.push(assessment);
    });
    customAssessments.forEach((assessment) => {
      const key = normalizeAssessmentName(assessment.name).toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      combined.push(assessment);
    });
    return combined;
  }, [analysis, customAssessments]);
  const customAssessmentKeys = useMemo(() => {
    return new Set(customAssessments.map((assessment) => normalizeAssessmentName(assessment.name).toLowerCase()));
  }, [customAssessments]);
  const assessmentOptions = useMemo(() => {
    return combinedAssessments.map((assessment, index) => ({
      assessment,
      index,
    }));
  }, [combinedAssessments]);
  const filteredAssessments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let filtered = assessmentOptions.filter(({ assessment }) => {
      if (assessmentFilter === "mandatory" && !assessment.isMandatory) return false;
      if (assessmentFilter === "optional" && assessment.isMandatory) return false;
      if (!query) return true;
      const haystack = [assessment.name, assessment.reason, assessment.evidence]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });

    if (sortMode === "mandatory") {
      filtered = [...filtered].sort((a, b) => {
        const rankA = a.assessment.isMandatory ? 0 : 1;
        const rankB = b.assessment.isMandatory ? 0 : 1;
        if (rankA !== rankB) return rankA - rankB;
        return a.assessment.name.localeCompare(b.assessment.name);
      });
    }

    return filtered;
  }, [assessmentOptions, assessmentFilter, searchQuery, sortMode]);
  const selectionStats = useMemo(() => {
    if (!analysis) {
      return {
        total: 0,
        mandatory: 0,
        optional: 0,
        selected: 0,
        mandatorySelected: 0,
      };
    }
    const mandatoryNames = combinedAssessments
      .filter((assessment) => assessment.isMandatory)
      .map((assessment) => assessment.name);
    const mandatorySet = new Set(mandatoryNames);
    let mandatorySelected = 0;
    selectedAssessments.forEach((name) => {
      if (mandatorySet.has(name)) mandatorySelected += 1;
    });

    return {
      total: combinedAssessments.length,
      mandatory: mandatoryNames.length,
      optional: combinedAssessments.length - mandatoryNames.length,
      selected: selectedAssessments.size,
      mandatorySelected,
    };
  }, [analysis, combinedAssessments, selectedAssessments]);
  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    assessmentFilter !== "all" ||
    sortMode !== "default";

  useEffect(() => {
    if (hasAllParsed && step === "upload") {
      setStep("analyze");
    }
  }, [hasAllParsed, step]);

  const analyzeDocuments = async () => {
    setIsAnalyzing(true);
    setProgress(0);
    setProgressStatus("Preparing documents...");
    
    try {
      const documentContent = getAllDocumentContent();
      if (!documentContent) {
        throw new Error("No document content available");
      }
      setAnalysisRaw(null);
      setAnalysisScrubbed(null);

      const response = await fetch("/api/ai/analyze-risks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ documentContent, allowSensitive: isAdmin && allowSensitive }),
      });

      if (!response.ok) {
        throw new Error("Failed to analyze documents");
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response stream available");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let resultRaw: RiskAnalysis | null = null;
      let resultScrubbed: RiskAnalysis | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const messages = buffer.split("\n\n");
        buffer = messages.pop() || "";

        for (const message of messages) {
          if (!message.trim()) continue;
          const lines = message.split("\n");
          let eventType = "";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.substring(7).trim();
            else if (line.startsWith("data: ")) dataStr = line.substring(6);
          }
          if (eventType && dataStr) {
            const data = JSON.parse(dataStr);
            if (eventType === "progress") {
              setProgress(data.percent);
              setProgressStatus(data.status);
            } else if (eventType === "result") {
              resultRaw = data;
              resultScrubbed = data?.scrubbedResult || data;
            } else if (eventType === "error") {
              throw new Error(data.message);
            }
          }
        }
      }

      if (!resultRaw) {
        throw new Error("No result received from server");
      }

      setProgress(100);
      setProgressStatus("Complete!");
      setSearchQuery("");
      setAssessmentFilter("all");
      setSortMode("default");
      setCustomAssessments([]);
      setCustomAssessmentName("");
      setAnalysisRaw(resultRaw);
      setAnalysisScrubbed(resultScrubbed || resultRaw);
      setStep("select");
      
      // Auto-select mandatory assessments
      const mandatory = new Set<string>(
        (resultScrubbed || resultRaw).recommendedAssessments
          .filter((a: RecommendedAssessment) => a.isMandatory)
          .map((a: RecommendedAssessment) => a.name)
      );
      setSelectedAssessments(mandatory);
    } catch (error: any) {
      console.error("Analysis error:", error);
      toast({
        title: "Analysis Failed",
        description: error.message || "Could not analyze documents",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
      setProgress(0);
      setProgressStatus("");
    }
  };

  const toggleAssessment = (name: string) => {
    const newSelected = new Set(selectedAssessments);
    if (newSelected.has(name)) {
      newSelected.delete(name);
    } else {
      newSelected.add(name);
    }
    setSelectedAssessments(newSelected);
  };

  const selectAll = () => {
    if (analysis) {
      const all = new Set(combinedAssessments.map(a => a.name));
      setSelectedAssessments(all);
    }
  };

  const deselectAll = () => {
    setSelectedAssessments(new Set());
  };

  const selectMandatory = () => {
    if (analysis) {
      const mandatory = new Set(
        combinedAssessments
          .filter((assessment) => assessment.isMandatory)
          .map((assessment) => assessment.name)
      );
      setSelectedAssessments(mandatory);
    }
  };

  const getMandatoryNotSelected = (): string[] => {
    if (!analysis) return [];
    return combinedAssessments
      .filter(a => a.isMandatory && !selectedAssessments.has(a.name))
      .map(a => a.name);
  };

  const addCustomAssessment = () => {
    if (!analysis) return;
    const cleaned = normalizeAssessmentName(customAssessmentName);
    if (!cleaned) return;
    const key = cleaned.toLowerCase();
    const existing =
      combinedAssessments.find((assessment) => normalizeAssessmentName(assessment.name).toLowerCase() === key) ||
      null;
    if (existing) {
      const nextSelected = new Set(selectedAssessments);
      nextSelected.add(existing.name);
      setSelectedAssessments(nextSelected);
      setCustomAssessmentName("");
      toast({
        title: "Already listed",
        description: `${existing.name} is already available and has been selected.`,
      });
      return;
    }
    const nextAssessment: RecommendedAssessment = {
      name: cleaned,
      isMandatory: false,
      reason: "Added manually by assessor.",
    };
    setCustomAssessments((prev) => [...prev, nextAssessment]);
    const nextSelected = new Set(selectedAssessments);
    nextSelected.add(cleaned);
    setSelectedAssessments(nextSelected);
    setCustomAssessmentName("");
  };

  const removeCustomAssessment = (name: string) => {
    const key = normalizeAssessmentName(name).toLowerCase();
    setCustomAssessments((prev) =>
      prev.filter((assessment) => normalizeAssessmentName(assessment.name).toLowerCase() !== key)
    );
    const nextSelected = new Set(selectedAssessments);
    nextSelected.delete(name);
    setSelectedAssessments(nextSelected);
  };

  const handleProceed = () => {
    const skipped = getMandatoryNotSelected();
    if (skipped.length > 0 && !showWarnings) {
      setShowWarnings(true);
      return;
    }
    generateAssessments();
  };

  const generateAssessments = async () => {
    setIsGenerating(true);
    setStep("generate");
    setProgress(0);
    setProgressStatus("Starting generation...");
    
    const documentContent = getAllDocumentContent();
    const generatedRaw: GeneratedAssessment[] = [];
    const generatedScrubbed: GeneratedAssessment[] = [];
    const assessmentsArray = Array.from(selectedAssessments);
    const total = assessmentsArray.length;

    for (let i = 0; i < assessmentsArray.length; i++) {
      const assessmentName = assessmentsArray[i];
      setProgressStatus(`Generating ${assessmentName}... (${i + 1}/${total})`);
      
      try {
        const response = await fetch("/api/ai/generate-risk-assessment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            documentContent,
            assessmentCategory: assessmentName,
            serviceUserInitials: analysisScrubbed?.serviceUser.initials || analysis?.serviceUser.initials,
            performedBy: user?.username,
            performedByJobTitle: user?.jobTitle || "Care Staff",
            allowSensitive: isAdmin && allowSensitive,
          }),
        });

        if (response.ok) {
          const reader = response.body?.getReader();
          if (reader) {
            const decoder = new TextDecoder();
            let buffer = "";
            let resultRaw: GeneratedAssessment | null = null;
            let resultScrubbed: GeneratedAssessment | null = null;

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const messages = buffer.split("\n\n");
              buffer = messages.pop() || "";

              for (const message of messages) {
                if (!message.trim()) continue;
                const lines = message.split("\n");
                let eventType = "";
                let dataStr = "";
                for (const line of lines) {
                  if (line.startsWith("event: ")) eventType = line.substring(7).trim();
                  else if (line.startsWith("data: ")) dataStr = line.substring(6);
                }
                if (eventType && dataStr) {
                  const data = JSON.parse(dataStr);
                  if (eventType === "progress") {
                    const basePercent = Math.round((i / total) * 100);
                    const itemPercent = Math.round((data.percent / 100) * (100 / total));
                    setProgress(basePercent + itemPercent);
                  } else if (eventType === "result") {
                    resultRaw = data;
                    resultScrubbed = data?.scrubbedResult || data;
                  }
                }
              }
            }

            if (resultRaw) {
              generatedRaw.push(resultRaw);
              generatedScrubbed.push(resultScrubbed || resultRaw);
            }
          }
        }
      } catch (error) {
        console.error(`Failed to generate ${assessmentName}:`, error);
      }
    }

    // Log the risk assessment selections
    try {
          await fetch("/api/risk-assessment-logs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              serviceUserInitials: analysisScrubbed?.serviceUser.initials || analysis?.serviceUser.initials || "N.N.",
              performedBy: user?.username || "Unknown",
              performedByJobTitle: user?.jobTitle,
              offeredAssessments: combinedAssessments.map(a => a.name),
              selectedAssessments: Array.from(selectedAssessments),
              skippedMandatory: getMandatoryNotSelected(),
              documentSummary: analysisScrubbed?.documentSummary || analysis?.documentSummary,
            }),
          });
    } catch (error) {
      console.error("Failed to log risk assessment:", error);
    }

    setGeneratedAssessmentsRaw(generatedRaw);
    setGeneratedAssessmentsScrubbed(generatedScrubbed);
    setIsGenerating(false);
    setProgress(0);
    setProgressStatus("");
    setStep("view");
  };

  const getRatingColor = (rating: string) => {
    switch (rating.toLowerCase()) {
      case "high": return "text-red-500 bg-red-500/10 border-red-500/30";
      case "medium": return "text-orange-500 bg-orange-500/10 border-orange-500/30";
      case "low": return "text-green-500 bg-green-500/10 border-green-500/30";
      default: return "text-muted-foreground bg-muted/50 border-border";
    }
  };

  const formatAssessmentForCopy = (assessment: GeneratedAssessment) => {
    const lines: string[] = [
      `Risk Assessment: ${assessment.category}`,
      `Date: ${assessment.assessmentDate}`,
      `Service User: ${assessment.serviceUserInitials}`,
      "",
    ];

    assessment.risks.forEach((risk, index) => {
      lines.push(`Risk ${index + 1}: ${risk.riskDefinition}`);
      lines.push(`Initial Rating: ${risk.initialRating}`);
      lines.push(`Who Will Be Harmed: ${risk.whoWillBeHarmed}`);
      lines.push(`How It's a Risk: ${risk.howItsARisk}`);
      lines.push(`Control Measures: ${risk.controlMeasures}`);
      lines.push(`Rating After Controls: ${risk.ratingAfterControls}`);
      lines.push("");
    });

    if (
      assessment.additionalNotes &&
      assessment.additionalNotes !== "I'm not aware of additional information based on the documents provided"
    ) {
      lines.push("Additional Notes:");
      lines.push(assessment.additionalNotes);
      lines.push("");
    }

    lines.push(`Signed By: ${assessment.signedBy}`);
    lines.push(`Job Title: ${assessment.jobTitle}`);

    return lines.join("\n").trim();
  };

  const copyAssessment = async (index: number) => {
    const assessment = generatedAssessmentsForCopy[index];
    if (!assessment) return;
    await navigator.clipboard.writeText(formatAssessmentForCopy(assessment));
    setCopiedAssessment(index);
    toast({
      title: "Copied",
      description: `${assessment.category} copied to clipboard`,
    });
    setTimeout(() => setCopiedAssessment(null), 2000);
  };

  const copyAllAssessments = async () => {
    if (generatedAssessmentsForCopy.length === 0) return;
    const combined = generatedAssessmentsForCopy.map(formatAssessmentForCopy).join("\n\n---\n\n");
    await navigator.clipboard.writeText(combined);
    toast({
      title: "Copied",
      description: "All risk assessments copied to clipboard",
    });
  };

  const exportAssessmentsPdf = () => {
    if (generatedAssessmentsForCopy.length === 0) return;
    const doc = new jsPDF();
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 14;
    const maxWidth = pageWidth - marginX * 2;
    let y = 18;

    const addLines = (lines: string[], lineHeight = 6) => {
      for (const line of lines) {
        if (y + lineHeight > pageHeight - 12) {
          doc.addPage();
          y = 18;
        }
        doc.text(line, marginX, y);
        y += lineHeight;
      }
    };

    const addParagraph = (text: string, lineHeight = 6) => {
      const lines = doc.splitTextToSize(text, maxWidth);
      addLines(lines, lineHeight);
    };

    generatedAssessmentsForCopy.forEach((assessment, index) => {
      if (index > 0) {
        doc.addPage();
        y = 18;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      addParagraph(`${assessment.category} Risk Assessment`, 8);
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      addParagraph(`Date: ${assessment.assessmentDate}`);
      addParagraph(`Service User: ${assessment.serviceUserInitials}`);
      addParagraph(`Signed By: ${assessment.signedBy}`);
      addParagraph(`Job Title: ${assessment.jobTitle}`);
      y += 2;

      assessment.risks.forEach((risk, idx) => {
        doc.setFont("helvetica", "bold");
        addParagraph(`Risk ${idx + 1}: ${risk.riskDefinition}`, 7);
        doc.setFont("helvetica", "normal");
        addParagraph(`Initial Rating: ${risk.initialRating}`);
        addParagraph(`Who Will Be Harmed: ${risk.whoWillBeHarmed}`);
        addParagraph(`How It's a Risk: ${risk.howItsARisk}`);
        addParagraph(`Control Measures: ${risk.controlMeasures}`);
        addParagraph(`Rating After Controls: ${risk.ratingAfterControls}`);
        y += 2;
      });

      if (
        assessment.additionalNotes &&
        assessment.additionalNotes !== "I'm not aware of additional information based on the documents provided"
      ) {
        doc.setFont("helvetica", "bold");
        addParagraph("Additional Notes", 7);
        doc.setFont("helvetica", "normal");
        addParagraph(assessment.additionalNotes);
      }
    });

    const fileName = `Risk_Assessments_${new Date().toISOString().split("T")[0]}.pdf`;
    doc.save(fileName);
  };

  // Step 1: No data uploaded
  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-6 animate-in fade-in zoom-in duration-500">
        <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center">
          <ShieldAlert size={48} className="text-muted-foreground" />
        </div>
        <div className="max-w-md space-y-2">
          <h2 className="text-2xl font-bold text-foreground">No Documents Uploaded</h2>
          <p className="text-muted-foreground">
            Please upload documents (Initial Assessment, Social Work docs, or Care Plan) to generate risk assessments.
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

  // Step 2: Waiting for parsing
  if (isAnyParsing()) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-6 animate-in fade-in duration-500">
        <Loader2 size={48} className="text-blue-500 animate-spin" />
        <div className="max-w-md space-y-2">
          <h2 className="text-2xl font-bold text-foreground">Processing Documents</h2>
          <p className="text-muted-foreground">
            Please wait while we extract information from your uploaded documents...
          </p>
        </div>
      </div>
    );
  }

  // Step 3: Ready to analyze
  if (step === "analyze") {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div>
          <h2 className="text-3xl font-heading font-bold text-foreground">Risk Assessment</h2>
          <p className="text-muted-foreground mt-2">
            Analyze uploaded documents to identify required risk assessments.
          </p>
          {isAdmin && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <Switch checked={allowSensitive} onCheckedChange={setAllowSensitive} />
              <span>Show full names (admin view). Copies use initials only.</span>
            </div>
          )}
        </div>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="text-blue-400" />
              Documents Ready for Analysis
            </CardTitle>
            <CardDescription>
              The following documents will be analyzed to identify service user risks and required assessments.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              {serviceUserData.socialWork && (
                <div className="flex items-center gap-2 text-sm">
                  {serviceUserData.socialWork.parseError ? (
                    <AlertTriangle className="h-4 w-4 text-red-400" />
                  ) : (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  )}
                  <span className="text-muted-foreground">{serviceUserData.socialWork.name}</span>
                  {serviceUserData.socialWork.parseError && (
                    <Badge variant="destructive" className="text-[10px]">Parsing failed</Badge>
                  )}
                </div>
              )}
              {serviceUserData.initialAssessment && (
                <div className="flex items-center gap-2 text-sm">
                  {serviceUserData.initialAssessment.parseError ? (
                    <AlertTriangle className="h-4 w-4 text-red-400" />
                  ) : (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  )}
                  <span className="text-muted-foreground">{serviceUserData.initialAssessment.name}</span>
                  {serviceUserData.initialAssessment.parseError && (
                    <Badge variant="destructive" className="text-[10px]">Parsing failed</Badge>
                  )}
                </div>
              )}
              {serviceUserData.carePlan && (
                <div className="flex items-center gap-2 text-sm">
                  {serviceUserData.carePlan.parseError ? (
                    <AlertTriangle className="h-4 w-4 text-red-400" />
                  ) : (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  )}
                  <span className="text-muted-foreground">{serviceUserData.carePlan.name}</span>
                  {serviceUserData.carePlan.parseError && (
                    <Badge variant="destructive" className="text-[10px]">Parsing failed</Badge>
                  )}
                </div>
              )}
            </div>

            {parseErrors.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Parsing issues detected</AlertTitle>
                <AlertDescription>
                  Some documents could not be fully parsed. The analysis will use only the content that was successfully extracted.
                </AlertDescription>
              </Alert>
            )}

            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Document-Only Analysis</AlertTitle>
              <AlertDescription>
                The AI will ONLY use information explicitly stated in your documents. It will not make assumptions or add information that isn't in the uploaded files.
              </AlertDescription>
            </Alert>

            <Button 
              onClick={analyzeDocuments} 
              disabled={isAnalyzing}
              className="w-full"
              data-testid="button-analyze"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing Documents...
                </>
              ) : (
                <>
                  <ShieldAlert className="mr-2 h-4 w-4" />
                  Analyze for Risk Assessments
                </>
              )}
            </Button>

            {isAnalyzing && (
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
          </CardContent>
        </Card>
      </div>
    );
  }

  // Step 4: Select assessments
  if (step === "select" && analysis) {
    const mandatorySkipped = getMandatoryNotSelected();

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div>
          <h2 className="text-3xl font-heading font-bold text-foreground">Select Risk Assessments</h2>
          <p className="text-muted-foreground mt-2">
            Based on the documents, we recommend the following assessments for{" "}
            <span className="text-foreground font-medium">{analysis.serviceUser.initials}</span>
          </p>
          {isAdmin && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <Switch checked={allowSensitive} onCheckedChange={setAllowSensitive} />
              <span>Show full names (admin view). Copies use initials only.</span>
            </div>
          )}
        </div>

        {parseErrors.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Some documents failed to parse</AlertTitle>
            <AlertDescription>
              Results are based on the content that was successfully extracted.
              <ul className="mt-2 space-y-1">
                {parseErrors.map((error) => (
                  <li key={error.label} className="text-xs text-destructive/80">
                    {error.label}: {error.message}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Service User Info */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Service User Information</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div>
              <Label className="text-muted-foreground">Service User Initials</Label>
              <p className="text-foreground font-medium">{analysis.serviceUser.initials}</p>
            </div>
            {analysis.medicalConditions.length > 0 && (
              <div className="md:col-span-2">
                <Label className="text-muted-foreground">Medical Conditions</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {analysis.medicalConditions.map((condition, i) => (
                    <Badge key={i} variant="secondary">{condition}</Badge>
                  ))}
                </div>
              </div>
            )}
            {analysis.careActivities.length > 0 && (
              <div className="md:col-span-2">
                <Label className="text-muted-foreground">Care Activities We Provide</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {analysis.careActivities.map((activity, i) => (
                    <Badge key={i} variant="outline">{activity}</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {(analysis.documentSummary || analysis.concerns.length > 0) && (
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle>Document Summary</CardTitle>
              <CardDescription>
                Highlights detected in the uploaded documents.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {analysis.documentSummary && (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {analysis.documentSummary}
                </p>
              )}
              {analysis.concerns.length > 0 && (
                <div>
                  <Label className="text-muted-foreground">Key Concerns</Label>
                  <ul className="mt-2 space-y-1">
                    {analysis.concerns.map((concern, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <AlertTriangle size={12} className="mt-0.5 text-amber-400 flex-shrink-0" />
                        <span>{concern}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Assessment Selection */}
        <Card className="bg-card border-border">
          <CardHeader className="space-y-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle>Recommended Risk Assessments</CardTitle>
                <CardDescription>
                  Select the assessments to generate. Mandatory assessments are pre-selected.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">Total {selectionStats.total}</Badge>
                <Badge variant="destructive">Mandatory {selectionStats.mandatory}</Badge>
                <Badge variant="muted">Optional {selectionStats.optional}</Badge>
                <Badge variant="success">Selected {selectionStats.selected}</Badge>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={selectAll} data-testid="button-select-all">
                Select All
              </Button>
              <Button variant="outline" size="sm" onClick={selectMandatory} data-testid="button-select-mandatory">
                Mandatory Only
              </Button>
              <Button variant="ghost" size="sm" onClick={deselectAll} data-testid="button-deselect-all">
                Clear All
              </Button>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchQuery("");
                    setAssessmentFilter("all");
                    setSortMode("default");
                  }}
                >
                  Reset Filters
                </Button>
              )}
            </div>
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Assessments without supporting evidence are not auto-listed. Add them manually below if needed.
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <Label className="text-sm font-medium">Add a custom risk assessment</Label>
              <p className="text-xs text-muted-foreground mt-1">
                If a specific assessment is missing (e.g., Breathing), add it here and it will be generated.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  value={customAssessmentName}
                  onChange={(e) => setCustomAssessmentName(e.target.value)}
                  placeholder="e.g., Breathing risk assessment"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomAssessment();
                    }
                  }}
                  data-testid="input-custom-assessment"
                />
                <Button
                  type="button"
                  onClick={addCustomAssessment}
                  disabled={!customAssessmentName.trim()}
                  data-testid="button-add-custom-assessment"
                >
                  Add
                </Button>
              </div>
              {customAssessments.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {customAssessments.map((assessment) => (
                    <div
                      key={assessment.name}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground"
                    >
                      <span>{assessment.name}</span>
                      <button
                        type="button"
                        onClick={() => removeCustomAssessment(assessment.name)}
                        className="ml-1 text-muted-foreground hover:text-foreground"
                        aria-label={`Remove ${assessment.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search assessments, reasons, or evidence..."
                  className="pl-9"
                  data-testid="input-assessment-search"
                />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Filter</span>
                <ToggleGroup
                  type="single"
                  value={assessmentFilter}
                  onValueChange={(value) =>
                    setAssessmentFilter((value as "all" | "mandatory" | "optional") || "all")
                  }
                  variant="outline"
                  size="sm"
                  className="flex-wrap justify-start sm:justify-end"
                >
                  <ToggleGroupItem value="all">All</ToggleGroupItem>
                  <ToggleGroupItem value="mandatory">Mandatory</ToggleGroupItem>
                  <ToggleGroupItem value="optional">Optional</ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Sort</span>
                <ToggleGroup
                  type="single"
                  value={sortMode}
                  onValueChange={(value) =>
                    setSortMode((value as "default" | "mandatory") || "default")
                  }
                  variant="outline"
                  size="sm"
                >
                  <ToggleGroupItem value="default">Original</ToggleGroupItem>
                  <ToggleGroupItem value="mandatory">Mandatory First</ToggleGroupItem>
                </ToggleGroup>
              </div>
              <span className="text-xs text-muted-foreground">
                Showing {filteredAssessments.length} of {selectionStats.total}
              </span>
            </div>

            {filteredAssessments.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No assessments match your filters.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredAssessments.map(({ assessment, index }) => (
                  <div
                    key={assessment.name}
                    className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors ${
                      selectedAssessments.has(assessment.name)
                        ? "bg-blue-500/10 border-blue-500/30"
                        : "bg-muted border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <Checkbox
                      id={`assessment-${index}`}
                      checked={selectedAssessments.has(assessment.name)}
                      onCheckedChange={() => toggleAssessment(assessment.name)}
                      data-testid={`checkbox-assessment-${index}`}
                    />
                    <div className="flex-1 min-w-0">
                      <Label
                        htmlFor={`assessment-${index}`}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <span className="text-foreground font-medium">{assessment.name}</span>
                        {assessment.isMandatory && (
                          <Badge variant="destructive" className="text-xs">Mandatory</Badge>
                        )}
                        {!assessment.isMandatory && customAssessmentKeys.has(normalizeAssessmentName(assessment.name).toLowerCase()) && (
                          <Badge variant="outline" className="text-xs">Custom</Badge>
                        )}
                      </Label>
                      <p className="text-xs text-muted-foreground mt-1">{assessment.reason}</p>
                      {assessment.evidence && (
                        <p className="text-xs text-muted-foreground/80 mt-1">
                          Evidence: {assessment.evidence}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Warnings for skipped mandatory */}
            {showWarnings && mandatorySkipped.length > 0 && (
              <Alert variant="destructive" className="mt-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Mandatory Assessments Skipped</AlertTitle>
                <AlertDescription>
                  You have not selected the following mandatory risk assessments: 
                  <strong> {mandatorySkipped.join(", ")}</strong>. 
                  This will be logged. Are you sure you want to proceed?
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-3 mt-6">
              <Button
                onClick={handleProceed}
                disabled={selectedAssessments.size === 0}
                className="flex-1"
                data-testid="button-generate"
              >
                {showWarnings && mandatorySkipped.length > 0 ? (
                  "Proceed Anyway"
                ) : (
                  `Generate ${selectedAssessments.size} Assessment${selectedAssessments.size !== 1 ? "s" : ""}`
                )}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground mt-3 text-center">
              Selected: {selectionStats.selected} of {selectionStats.total} assessments. Mandatory selected: {selectionStats.mandatorySelected} of {selectionStats.mandatory}.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Step 5: Generating
  if (step === "generate") {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-6 animate-in fade-in duration-500">
        <Loader2 size={48} className="text-blue-500 animate-spin" />
        <div className="max-w-md space-y-2">
          <h2 className="text-2xl font-bold text-foreground">Generating Risk Assessments</h2>
          <p className="text-muted-foreground">
            Creating {selectedAssessments.size} risk assessment{selectedAssessments.size !== 1 ? "s" : ""}. This may take a moment...
          </p>
        </div>
        {isGenerating && (
          <div className="w-full max-w-md space-y-3 p-4 bg-blue-950/20 border border-blue-900/30 rounded-lg" data-testid="progress-container">
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
      </div>
    );
  }

  // Step 6: View generated assessments
  if (step === "view" && generatedAssessments.length > 0) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-3xl font-heading font-bold text-foreground">Risk Assessments</h2>
            <p className="text-muted-foreground mt-2">
              Generated {generatedAssessments.length} risk assessment{generatedAssessments.length !== 1 ? "s" : ""} for {analysis?.serviceUser.initials}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <div className="flex flex-col items-start gap-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Switch checked={allowSensitive} onCheckedChange={setAllowSensitive} />
                  <span>Show full names (admin view)</span>
                </div>
                <span className="text-[11px] text-muted-foreground/80">Copies use initials only.</span>
              </div>
            )}
            <Button variant="outline" onClick={copyAllAssessments} data-testid="button-copy-all-assessments">
              <Copy size={16} /> Copy All
            </Button>
            <Button variant="outline" onClick={exportAssessmentsPdf} data-testid="button-export-risk-pdf">
              <FileText size={16} /> Export PDF
            </Button>
            <Button 
              variant="outline" 
              onClick={() => {
                setStep("select");
                setGeneratedAssessmentsRaw([]);
                setGeneratedAssessmentsScrubbed([]);
                setCopiedAssessment(null);
              }}
              data-testid="button-back-to-select"
            >
              Generate More
            </Button>
          </div>
        </div>

        {generatedAssessments.map((assessment, idx) => (
          <Card key={idx} className="bg-card border-border print:bg-white print:text-black">
            <CardHeader className="border-b border-border">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-xl">{assessment.category}</CardTitle>
                  <CardDescription>Risk Assessment</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-sm">
                    {assessment.assessmentDate}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyAssessment(idx)}
                    data-testid={`button-copy-assessment-${idx}`}
                  >
                    {copiedAssessment === idx ? <Check size={14} /> : <Copy size={14} />}
                    Copy
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {/* Service User Header */}
              <div className="grid grid-cols-1 gap-4 mb-6 p-4 bg-muted rounded-lg">
                <div>
                  <Label className="text-muted-foreground text-xs">Service User Initials</Label>
                  <p className="text-foreground font-medium">{assessment.serviceUserInitials}</p>
                </div>
              </div>

              {/* Risk Rows */}
              <div className="space-y-4">
                {assessment.risks.map((risk, riskIdx) => (
                  <div key={riskIdx} className="border border-border rounded-lg overflow-hidden">
                    <div className="bg-muted px-4 py-2 border-b border-border">
                      <p className="font-medium text-foreground">Risk {riskIdx + 1}: {risk.riskDefinition}</p>
                    </div>
                    <div className="p-4 grid gap-4">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div>
                          <Label className="text-muted-foreground text-xs">Initial Risk Rating</Label>
                          <div className={`inline-flex px-3 py-1 rounded-full text-sm font-medium border ${getRatingColor(risk.initialRating)}`}>
                            {risk.initialRating}
                          </div>
                        </div>
                        <div className="md:col-span-2">
                          <Label className="text-muted-foreground text-xs">Who Will Be Harmed</Label>
                          <p className="text-foreground">{risk.whoWillBeHarmed}</p>
                        </div>
                      </div>
                      
                      <div>
                        <Label className="text-muted-foreground text-xs">How It's a Risk</Label>
                        <p className="text-muted-foreground text-sm">{risk.howItsARisk}</p>
                      </div>
                      
                      <div>
                        <Label className="text-muted-foreground text-xs">Control Measures</Label>
                        <p className="text-muted-foreground text-sm">{risk.controlMeasures}</p>
                      </div>
                      
                      <div>
                        <Label className="text-muted-foreground text-xs">Risk Rating After Controls</Label>
                        <div className={`inline-flex px-3 py-1 rounded-full text-sm font-medium border ${getRatingColor(risk.ratingAfterControls)}`}>
                          {risk.ratingAfterControls}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Additional Notes */}
              {assessment.additionalNotes && assessment.additionalNotes !== "I'm not aware of additional information based on the documents provided" && (
                <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                  <Label className="text-muted-foreground text-xs">Additional Notes</Label>
                  <p className="text-muted-foreground text-sm mt-1">{assessment.additionalNotes}</p>
                </div>
              )}

              {/* Signature */}
              <div className="mt-6 pt-4 border-t border-border grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground text-xs">Signed By</Label>
                  <p className="text-foreground font-medium">{assessment.signedBy}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Job Title</Label>
                  <p className="text-foreground font-medium">{assessment.jobTitle}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return null;
}
