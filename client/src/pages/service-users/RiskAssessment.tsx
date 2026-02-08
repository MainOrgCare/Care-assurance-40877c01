import { useState, useEffect, useMemo, useRef, useCallback } from "react";
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
import { ShieldAlert, ArrowRight, Loader2, AlertTriangle, CheckCircle, FileText, Info, Search, Copy, Check, X, Send, Edit3 } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import { TemplateFiller } from "@/components/TemplateFiller";
import { ClientPIIVault, VaultExport, restoreWithVault } from "@/lib/pii-vault";
import { consumeJsonSseStream } from "@/lib/sse";

/**
 * Count placeholders in text
 */
function countPlaceholders(text: string): number {
  const matches = text.match(/\[([^\]]+)\]/g);
  return matches ? matches.length : 0;
}

/**
 * Highlight template placeholders like [Name], [NHS Number] etc.
 */
function highlightPlaceholders(text: string): React.ReactNode {
  const placeholderPattern = /\[([^\]]+)\]/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = placeholderPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <span
        key={key++}
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 mx-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded font-semibold text-xs border border-amber-300 dark:border-amber-700"
        title={`Fill in: ${match[1]}`}
      >
        {match[0]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? parts : text;
}

interface RecommendedAssessment {
  name: string;
  isMandatory: boolean;
  reason: string;
  evidence?: string;
  evidenceSnippets?: string[];
}

interface RiskAnalysis {
  serviceUser: {
    initials: string;
    fullName?: string;
  };
  medicalConditions: string[];
  careActivities: string[];
  concerns: string[];
  equipment?: string[];
  communicationNeeds?: string[];
  environmentalFactors?: string[];
  recommendedAssessments: RecommendedAssessment[];
  documentSummary: string;
  generationMode?: string;
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
  generationMode?: string;
}

export default function RiskAssessment() {
  const { serviceUserData, getAllDocumentContent, isAnyParsing } = useTemporaryData();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisRaw, setAnalysisRaw] = useState<RiskAnalysis | null>(null);
  const [analysisScrubbed, setAnalysisScrubbed] = useState<RiskAnalysis | null>(null);
  const [analysisVaultExport, setAnalysisVaultExport] = useState<VaultExport | null>(null);
  const [selectedAssessments, setSelectedAssessments] = useState<Set<string>>(new Set());
  const [showWarnings, setShowWarnings] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAssessmentsRaw, setGeneratedAssessmentsRaw] = useState<GeneratedAssessment[]>([]);
  const [generatedAssessmentsScrubbed, setGeneratedAssessmentsScrubbed] = useState<GeneratedAssessment[]>([]);
  const [generatedVaultExport, setGeneratedVaultExport] = useState<VaultExport | null>(null);  const [step, setStep] = useState<"upload" | "analyze" | "select" | "generate" | "view">("upload");
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [assessmentFilter, setAssessmentFilter] = useState<"all" | "mandatory" | "optional">("all");
  const [sortMode, setSortMode] = useState<"default" | "mandatory">("default");
  const [copiedAssessment, setCopiedAssessment] = useState<number | null>(null);
  const [allowSensitive, setAllowSensitive] = useState(false);
  const [customAssessmentName, setCustomAssessmentName] = useState("");
  const [customAssessments, setCustomAssessments] = useState<RecommendedAssessment[]>([]);
  const [isRefreshingIdentity, setIsRefreshingIdentity] = useState(false);
  const [selectedForAcp, setSelectedForAcp] = useState<Set<number>>(new Set());

  // Throttle progress updates to reduce re-renders during SSE streaming
  const lastProgressUpdateRef = useRef<number>(0);
  const throttledSetProgress = useCallback((percent: number, status: string) => {
    const now = Date.now();
    // Always update at 0%, 100%, or if 100ms has passed
    if (percent === 0 || percent >= 100 || now - lastProgressUpdateRef.current >= 100) {
      lastProgressUpdateRef.current = now;
      setProgress(percent);
      setProgressStatus(status);
    }
  }, []);

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
  const generatedAssessmentsForCopy = useMemo(() => {
    if (showSensitive && generatedAssessmentsRaw.length > 0) return generatedAssessmentsRaw;
    if (generatedAssessmentsScrubbed.length > 0) return generatedAssessmentsScrubbed;
    return generatedAssessmentsRaw;
  }, [showSensitive, generatedAssessmentsRaw, generatedAssessmentsScrubbed]);
  const isRuleBasedAnalysis = useMemo(
    () =>
      analysis?.generationMode === "rule-based" ||
      analysisScrubbed?.generationMode === "rule-based" ||
      analysisRaw?.generationMode === "rule-based",
    [analysis, analysisScrubbed, analysisRaw]
  );
  const hasRuleBasedGeneratedAssessments = useMemo(
    () =>
      generatedAssessments.some((assessment) => assessment.generationMode === "rule-based") ||
      generatedAssessmentsForCopy.some((assessment) => assessment.generationMode === "rule-based"),
    [generatedAssessments, generatedAssessmentsForCopy]
  );
  const serviceUserDisplayName = useMemo(() => {
    const fullName = showSensitive ? analysisRaw?.serviceUser?.fullName : null;
    if (fullName && !/information not found/i.test(fullName)) return fullName.trim();
    const initials = analysisScrubbed?.serviceUser?.initials || analysisRaw?.serviceUser?.initials;
    return initials || "N.N.";
  }, [showSensitive, analysisRaw, analysisScrubbed]);
  const serviceUserLabel = useMemo(() => (showSensitive && analysisRaw?.serviceUser?.fullName ? "Service User Name" : "Service User Initials"), [showSensitive, analysisRaw]);
  const formatSignedBy = (assessment: GeneratedAssessment) => {
    const rawName = assessment.signedBy?.trim() || "";
    const name = rawName.replace(/\./g, " ").replace(/\s+/g, " ").trim();
    const title = assessment.jobTitle?.trim();
    if (name && title) return `${name} (${title})`;
    return name || title || "Staff member";
  };
  const getServiceUserDisplay = (fallbackInitials?: string) => {
    if (showSensitive && analysisRaw?.serviceUser?.fullName && !/information not found/i.test(analysisRaw.serviceUser.fullName)) {
      return analysisRaw.serviceUser.fullName.trim();
    }
    return fallbackInitials || serviceUserDisplayName || "N.N.";
  };

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

  const assessmentAliases: Record<string, string> = {
    "moving and handling": "Mobility & Moving and Handling",
    "moving & handling": "Mobility & Moving and Handling",
    "mobility and handling": "Mobility & Moving and Handling",
    "manual handling": "Mobility & Moving and Handling",
    "medication": "Medication Administration",
    "medication support": "Medication Administration",
    "meds administration": "Medication Administration",
    "nutrition and hydration": "Nutrition",
    "hydration": "Nutrition",
    "pressure area care": "Skin Integrity",
    "pressure care": "Skin Integrity",
    "pressure areas": "Skin Integrity",
    "falls": "Falls Prevention",
    "falls risk": "Falls Prevention",
    "mental health support": "Mental Health",
    "behaviour support": "Behavior Support",
    "behavioural support": "Behavior Support",
    "behavioral support": "Behavior Support",
    "communication needs": "Communication",
    "infection": "Infection Control",
    "fire": "Fire Safety",
    "environment": "Environmental Safety",
    "safeguarding adults": "Safeguarding",
    "coshh assessment": "COSHH",
    "diabetes": "Diabetes Management",
    "epilepsy": "Epilepsy Management",
    "continence": "Continence Care",
    "dementia": "Dementia Care",
    "end of life": "End of Life Care",
    "palliative care": "End of Life Care",
    "personal care support": "Personal Care",
  };

  const normalizeAssessmentKey = (value: string) => {
    const normalized = value.trim().toLowerCase().replace(/&/g, "and").replace(/\s+/g, " ");
    const alias = assessmentAliases[normalized];
    return (alias || normalized).toLowerCase();
  };

  const canonicalizeAssessmentName = (value: string) => {
    const normalized = value.trim().toLowerCase().replace(/&/g, "and").replace(/\s+/g, " ");
    const alias = assessmentAliases[normalized];
    return alias || value.trim();
  };

  const normalizeAssessmentName = (value: string) => canonicalizeAssessmentName(value).trim().replace(/\s+/g, " ");
  const assessmentRelevanceKeywords: Record<string, string[]> = {
    "Fire Safety": ["fire", "smoke", "cigarette", "smoking", "matches", "candles", "burns"],
    "Falls Prevention": ["fall", "falls", "unsteady", "trip", "balance", "dizziness", "slip"],
    "Medication Administration": ["medication", "medications", "meds", "tablets", "medicine", "prescribed", "administer"],
    "Mobility & Moving and Handling": ["mobility", "moving", "handling", "transfer", "hoist", "wheelchair", "standing", "walking"],
    "Skin Integrity": ["skin", "pressure", "ulcer", "pressure area", "wound", "tissue", "integrity"],
    "Nutrition": ["nutrition", "hydration", "food", "eating", "drinking", "diet", "weight", "malnutrition"],
    "Continence Care": ["continence", "incontinence", "toileting", "pads", "catheter", "urine", "bowel"],
    "Dementia Care": ["dementia", "cognitive", "memory", "confusion", "alzheim"],
    "Mental Health": ["mental health", "depression", "anxiety", "mood", "bipolar", "psychosis"],
    "Behavior Support": ["behavior", "behaviour", "agitation", "aggressive", "challenging", "self-harm"],
    "Communication": ["communication", "speech", "hearing", "vision", "aphasia", "language", "non verbal"],
    "Infection Control": ["infection", "infectious", "covid", "mrsa", "c diff", "c. diff", "flu", "sepsis"],
    "Safeguarding": ["safeguard", "abuse", "neglect", "financial", "exploitation"],
    "Environmental Safety": ["environment", "hazard", "unsafe", "clutter", "trip hazard", "lighting"],
    "Diabetes Management": ["diabetes", "insulin", "hypo", "hypergly", "blood sugar", "glucose"],
    "Epilepsy Management": ["epilepsy", "seizure", "fit", "convulsion"],
    "End of Life Care": ["end of life", "palliative", "hospice", "terminal"],
    "Personal Care": ["personal care", "washing", "bathing", "dressing", "hygiene", "shower"],
    "Lone Working": ["lone working", "alone", "single carer", "solo"],
    "COSHH": ["coshh", "hazardous", "chemicals", "cleaning products", "bleach"],
  };

  const isNegatedEvidence = (value?: string) => {
    if (!value) return false;
    const lower = value.toLowerCase();
    const patterns = [
      /\bno (known |documented |reported )?(risk|risks|concerns?)\b/,
      /\bno evidence\b/,
      /\bnot (reported|documented|noted|mentioned)\b/,
      /\bwithout (any |known )?(risk|risks|concerns?)\b/,
      /\bdenies\b/,
      /\bnone reported\b/,
      /\binformation not found\b/,
    ];
    return patterns.some((pattern) => pattern.test(lower));
  };

  const isAssessmentRelevant = (assessment: RecommendedAssessment) => {
    if (!assessment?.evidence || !assessment.evidence.trim()) return false;
    if (isNegatedEvidence(assessment.evidence) || isNegatedEvidence(assessment.reason)) return false;
    const key = canonicalizeAssessmentName(assessment.name);
    const keywords = assessmentRelevanceKeywords[key];
    if (!keywords || keywords.length === 0) return true;
    // Include ALL service user profile fields in the search haystack
    const haystack = [
      assessment.name,
      assessment.reason,
      assessment.evidence,
      ...(assessment.evidenceSnippets || []),
      analysis?.documentSummary,
      ...(analysis?.concerns || []),
      ...(analysis?.medicalConditions || []),
      ...(analysis?.careActivities || []),
      ...(analysis?.equipment || []),
      ...(analysis?.communicationNeeds || []),
      ...(analysis?.environmentalFactors || []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const matched = keywords.some((term) => haystack.includes(term));
    return matched;
  };

  const getAssessmentRelevanceMatch = (assessment: RecommendedAssessment) => {
    const key = canonicalizeAssessmentName(assessment.name);
    const keywords = assessmentRelevanceKeywords[key];
    if (!keywords || keywords.length === 0) return null;
    // Include ALL service user profile fields in the search haystack
    const haystack = [
      assessment.name,
      assessment.reason,
      assessment.evidence,
      analysis?.documentSummary,
      ...(analysis?.concerns || []),
      ...(analysis?.medicalConditions || []),
      ...(analysis?.careActivities || []),
      ...(analysis?.equipment || []),
      ...(analysis?.communicationNeeds || []),
      ...(analysis?.environmentalFactors || []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const match = keywords.find((term) => haystack.includes(term));
    return match || null;
  };
  const combinedAssessments = useMemo(() => {
    if (!analysis) return [];
    const combined: RecommendedAssessment[] = [];
    const seen = new Set<string>();
    analysis.recommendedAssessments.forEach((assessment) => {
      if (!assessment?.evidence || !assessment.evidence.trim()) return;
      if (!isAssessmentRelevant(assessment)) return;
      const key = normalizeAssessmentKey(assessment.name);
      if (!key || seen.has(key)) return;
      seen.add(key);
      combined.push({
        ...assessment,
        name: canonicalizeAssessmentName(assessment.name),
      });
    });
    customAssessments.forEach((assessment) => {
      const key = normalizeAssessmentKey(assessment.name);
      if (!key || seen.has(key)) return;
      seen.add(key);
      combined.push({
        ...assessment,
        name: canonicalizeAssessmentName(assessment.name),
      });
    });
    return combined;
  }, [analysis, customAssessments]);
  const customAssessmentKeys = useMemo(() => {
    return new Set(customAssessments.map((assessment) => normalizeAssessmentKey(assessment.name)));
  }, [customAssessments]);
  
  // Memoize relevance matches to avoid recomputing on every render
  const relevanceMatchMap = useMemo(() => {
    const map = new Map<string, string | null>();
    combinedAssessments.forEach((assessment) => {
      const key = canonicalizeAssessmentName(assessment.name);
      const keywords = assessmentRelevanceKeywords[key];
      if (!keywords || keywords.length === 0) {
        map.set(assessment.name, null);
        return;
      }
      const haystack = [
        assessment.name,
        assessment.reason,
        assessment.evidence,
        analysis?.documentSummary,
        ...(analysis?.concerns || []),
        ...(analysis?.medicalConditions || []),
        ...(analysis?.careActivities || []),
        ...(analysis?.equipment || []),
        ...(analysis?.communicationNeeds || []),
        ...(analysis?.environmentalFactors || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const match = keywords.find((term) => haystack.includes(term));
      map.set(assessment.name, match || null);
    });
    return map;
  }, [combinedAssessments, analysis]);
  
  const assessmentOptions = useMemo(() => {
    return combinedAssessments.map((assessment, index) => ({
      assessment,
      index,
      relevanceMatch: relevanceMatchMap.get(assessment.name) || null,
    }));
  }, [combinedAssessments, relevanceMatchMap]);
  const filteredAssessments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let filtered = assessmentOptions.filter(({ assessment }) => {
      if (assessmentFilter === "mandatory" && !assessment.isMandatory) return false;
      if (assessmentFilter === "optional" && assessment.isMandatory) return false;
      if (!query) return true;
      const haystack = [assessment.name, assessment.reason, assessment.evidence, ...(assessment.evidenceSnippets || [])]
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

  useEffect(() => {
    const hasFullName = Boolean(analysisRaw?.serviceUser?.fullName?.trim());
    if (!showSensitive || hasFullName || isRefreshingIdentity || !hasAllParsed) return;
    const refreshSensitiveIdentity = async () => {
      setIsRefreshingIdentity(true);
      try {
        const documentContent = getAllDocumentContent();
        if (!documentContent) return;
        const response = await fetch("/api/ai/analyze-risks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ documentContent, allowSensitive: true }),
        });
        if (!response.ok) return;
        let resultRaw: RiskAnalysis | null = null;
        let resultScrubbed: RiskAnalysis | null = null;

        await consumeJsonSseStream(response, ({ eventType, data }) => {
          if (eventType !== "result") return;
          if (!data || typeof data !== "object") return;
          const payload = data as RiskAnalysis & { scrubbedResult?: RiskAnalysis };
          resultRaw = payload;
          resultScrubbed = payload.scrubbedResult || payload;
        });

        if (resultRaw) {
          setAnalysisRaw(resultRaw);
          setAnalysisScrubbed(resultScrubbed || resultRaw);
        }
      } catch (error) {
        console.error("Sensitive identity refresh failed:", error);
      } finally {
        setIsRefreshingIdentity(false);
      }
    };
    refreshSensitiveIdentity();
  }, [showSensitive, analysisRaw, isRefreshingIdentity, hasAllParsed, getAllDocumentContent]);

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

      let resultRaw: RiskAnalysis | null = null;
      let resultScrubbed: RiskAnalysis | null = null;
      let resultVaultExport: VaultExport | null = null;

      await consumeJsonSseStream(response, ({ eventType, data }) => {
        const payload = data as any;
        if (eventType === "progress") {
          const percent = typeof payload?.percent === "number" ? payload.percent : 0;
          const status = typeof payload?.status === "string" ? payload.status : "Processing...";
          throttledSetProgress(percent, status);
          return;
        }
        if (eventType === "error") {
          throw new Error(payload?.message || "Analysis failed");
        }
        if (eventType !== "result" || !payload || typeof payload !== "object") {
          return;
        }

        const vaultExport = payload?.vaultExport as VaultExport | undefined;
        const rawWithTokens = payload?.rawWithTokens;

        if (vaultExport && rawWithTokens) {
          const vault = new ClientPIIVault(vaultExport);
          resultRaw = vault.restore(rawWithTokens);
          resultVaultExport = vaultExport;
        } else {
          resultRaw = payload;
        }

        const { vaultExport: _ve, rawWithTokens: _rwt, ...scrubbedData } = payload;
        resultScrubbed = scrubbedData;
      });

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
      setAnalysisVaultExport(resultVaultExport);
      setStep("select");
      
      // Auto-select mandatory assessments
      const finalAnalysis: RiskAnalysis = resultScrubbed ?? resultRaw;
      const mandatory = new Set<string>(
        finalAnalysis.recommendedAssessments
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
    const key = normalizeAssessmentKey(cleaned);
    const existing =
      combinedAssessments.find((assessment) => normalizeAssessmentKey(assessment.name) === key) ||
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
      name: canonicalizeAssessmentName(cleaned),
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
    const key = normalizeAssessmentKey(name);
    setCustomAssessments((prev) =>
      prev.filter((assessment) => normalizeAssessmentKey(assessment.name) !== key)
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
    const assessmentsArray = Array.from(selectedAssessments);
    const total = assessmentsArray.length;
    const errors: string[] = [];

    if (!documentContent || documentContent.trim().length < 50) {
      setIsGenerating(false);
      setProgress(0);
      setProgressStatus("");
      setStep("select");
      toast({
        title: "No document text detected",
        description: "Please upload readable documents before generating assessments.",
        variant: "destructive",
      });
      return;
    }

    if (total === 0) {
      setIsGenerating(false);
      setProgress(0);
      setProgressStatus("");
      setStep("select");
      toast({
        title: "No assessments selected",
        description: "Select at least one assessment to generate.",
        variant: "destructive",
      });
      return;
    }
    const generatedRawMap = new Map<string, GeneratedAssessment>();
    const generatedScrubbedMap = new Map<string, GeneratedAssessment>();
    const inFlightProgress = new Map<string, number>();
    let completed = 0;

    const updateOverallProgress = () => {
      if (total === 0) return;
      const inFlightTotal = Array.from(inFlightProgress.values()).reduce((sum, value) => sum + value, 0);
      const overall = ((completed + inFlightTotal / 100) / total) * 100;
      setProgress(Math.min(100, Math.max(0, overall)));
    };

    const runAssessment = async (assessmentName: string) => {
      inFlightProgress.set(assessmentName, 0);
      updateOverallProgress();
      setProgressStatus(`Generating ${assessmentName}... (${completed + 1}/${total})`);
      
      try {
        const assessmentEvidence =
          analysis?.recommendedAssessments?.find(
            (assessment) => normalizeAssessmentKey(assessment.name) === normalizeAssessmentKey(assessmentName)
          ) || null;
        const analysisContext = analysis
          ? {
              medicalConditions: analysis.medicalConditions,
              careActivities: analysis.careActivities,
              concerns: analysis.concerns,
              equipment: analysis.equipment,
              communicationNeeds: analysis.communicationNeeds,
              environmentalFactors: analysis.environmentalFactors,
              documentSummary: analysis.documentSummary,
            }
          : null;
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
            assessmentEvidence: assessmentEvidence
              ? {
                  name: assessmentEvidence.name,
                  reason: assessmentEvidence.reason,
                  evidence: assessmentEvidence.evidence,
                  evidenceSnippets: assessmentEvidence.evidenceSnippets,
                }
              : null,
            analysisContext,
          }),
        });

        if (!response.ok) {
          let message = `Failed to generate ${assessmentName}`;
          try {
            const data = await response.json();
            if (data?.message) message = data.message;
          } catch {
            // ignore
          }
          throw new Error(message);
        }

        let resultRaw: GeneratedAssessment | null = null;
        let resultScrubbed: GeneratedAssessment | null = null;

        await consumeJsonSseStream(response, ({ eventType, data }) => {
          const payload = data as any;
          if (eventType === "progress") {
            const percent = typeof payload?.percent === "number" ? payload.percent : 0;
            inFlightProgress.set(assessmentName, Math.min(100, Math.max(0, percent)));
            updateOverallProgress();
            return;
          }
          if (eventType === "error") {
            throw new Error(payload?.message || `Failed to generate ${assessmentName}`);
          }
          if (eventType !== "result" || !payload || typeof payload !== "object") {
            return;
          }

          const vaultExport = payload?.vaultExport as VaultExport | undefined;
          const rawWithTokens = payload?.rawWithTokens;

          if (vaultExport && rawWithTokens) {
            const vault = new ClientPIIVault(vaultExport);
            resultRaw = vault.restore(rawWithTokens);
          } else {
            resultRaw = payload;
          }

          const { vaultExport: _ve, rawWithTokens: _rwt, ...scrubbedData } = payload;
          resultScrubbed = scrubbedData;
        });

        if (resultRaw) {
          generatedRawMap.set(assessmentName, resultRaw);
          generatedScrubbedMap.set(assessmentName, resultScrubbed || resultRaw);
        } else {
          throw new Error(`No result received for ${assessmentName}`);
        }
      } catch (error: any) {
        console.error(`Failed to generate ${assessmentName}:`, error);
        errors.push(error?.message || `Failed to generate ${assessmentName}`);
      } finally {
        inFlightProgress.delete(assessmentName);
        completed += 1;
        updateOverallProgress();
      }
    };

    const queue = [...assessmentsArray];
    // Reduced concurrency to 1 to prevent API rate limits (429 errors)
    const maxConcurrency = 1;
    const workers = Array.from({ length: maxConcurrency }, () =>
      (async () => {
        while (queue.length > 0) {
          const next = queue.shift();
          if (!next) return;
          await runAssessment(next);
        }
      })()
    );
    await Promise.all(workers);

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

    const orderedRaw = assessmentsArray
      .map((name) => generatedRawMap.get(name))
      .filter(Boolean) as GeneratedAssessment[];
    const orderedScrubbed = assessmentsArray
      .map((name) => generatedScrubbedMap.get(name))
      .filter(Boolean) as GeneratedAssessment[];
    
    if (orderedRaw.length === 0) {
      setIsGenerating(false);
      setProgress(0);
      setProgressStatus("");
      setStep("select");
      toast({
        title: "Generation failed",
        description: errors[0] || "No assessments were generated. Please try again.",
        variant: "destructive",
      });
      return;
    }

    // Select all assessments for ACP by default
    setSelectedForAcp(new Set(orderedScrubbed.map((_, idx) => idx)));

    setGeneratedAssessmentsRaw(orderedRaw);
    setGeneratedAssessmentsScrubbed(orderedScrubbed);
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
      `Service User: ${getServiceUserDisplay(assessment.serviceUserInitials)}`,
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

    lines.push(`Signed By: ${formatSignedBy(assessment)}`);

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
      addParagraph(`Service User: ${getServiceUserDisplay(assessment.serviceUserInitials)}`);
      addParagraph(`Signed By: ${formatSignedBy(assessment)}`);
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

  const toggleAcpSelection = (index: number) => {
    setSelectedForAcp(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const selectAllForAcp = () => {
    setSelectedForAcp(new Set(generatedAssessmentsForCopy.map((_, idx) => idx)));
  };

  const deselectAllForAcp = () => {
    setSelectedForAcp(new Set());
  };

  const sendAssessmentsToExtension = async (assessmentsToSend?: GeneratedAssessment[]) => {
    // If no specific assessments provided, use the selected ones
    const assessments = assessmentsToSend && assessmentsToSend.length > 0
      ? assessmentsToSend
      : generatedAssessmentsForCopy.filter((_, idx) => selectedForAcp.has(idx));
    if (assessments.length === 0) {
      toast({
        title: "No assessments selected",
        description: "Please select at least one assessment to send to ACP.",
        variant: "destructive",
      });
      return;
    }
    if (typeof window === "undefined") return;

    const requestId =
      typeof window.crypto !== "undefined" && typeof window.crypto.randomUUID === "function"
        ? window.crypto.randomUUID()
        : String(Date.now());
    const payloadInitials =
      (showSensitive ? analysisRaw?.serviceUser?.initials : analysisScrubbed?.serviceUser?.initials) ||
      analysisRaw?.serviceUser?.initials ||
      "N.N.";
    const payload = {
      version: 1,
      createdAt: new Date().toISOString(),
      serviceUserDisplayName,
      serviceUserInitials: payloadInitials,
      assessments: assessments.map((assessment) => ({
        category: assessment.category,
        serviceUserInitials: assessment.serviceUserInitials,
        assessmentDate: assessment.assessmentDate,
        signedBy: assessment.signedBy,
        jobTitle: assessment.jobTitle,
        additionalNotes: assessment.additionalNotes,
        risks: assessment.risks.map((risk) => ({
          riskDefinition: risk.riskDefinition,
          initialRating: risk.initialRating,
          whoWillBeHarmed: risk.whoWillBeHarmed,
          howItsARisk: risk.howItsARisk,
          controlMeasures: risk.controlMeasures,
          ratingAfterControls: risk.ratingAfterControls,
        })),
      })),
    };

    try {
      const response = await new Promise<{ ok: boolean; error?: string }>((resolve, reject) => {
        let handler: ((event: MessageEvent) => void) | null = null;
        const timeoutId = window.setTimeout(() => {
          if (handler) window.removeEventListener("message", handler);
          reject(new Error("Edge extension not detected."));
        }, 1500);

        handler = (event: MessageEvent) => {
          if (event.source !== window) return;
          if (!event.data || event.data.type !== "CA_EXTENSION_ACK") return;
          if (event.data.requestId !== requestId) return;
          window.clearTimeout(timeoutId);
          window.removeEventListener("message", handler!);
          resolve({ ok: Boolean(event.data.ok), error: event.data.error });
        };

        window.addEventListener("message", handler);
        window.postMessage(
          {
            type: "CA_SEND_TO_ACP_EXTENSION",
            requestId,
            payload,
          },
          window.location.origin
        );
      });

      if (response.ok) {
        toast({
          title: "Sent to extension",
          description: `Queued ${assessments.length} assessment(s) for ACP autofill.`,
        });
      } else {
        toast({
          title: "Extension error",
          description: response.error || "Failed to send to extension.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Extension not detected",
        description: error?.message || "Could not reach the Edge extension.",
        variant: "destructive",
      });
    }
  };

  const sendSingleAssessmentToExtension = async (index: number) => {
    const assessment = generatedAssessmentsForCopy[index];
    if (!assessment) return;
    await sendAssessmentsToExtension([assessment]);
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
      <div className="page-shell animate-fade-in">
        <div className="space-y-1">
          <h1 className="page-title">Neural Risk Profiling</h1>
          <p className="page-subtitle max-w-2xl">
            Synthesizing clinical documentation to identify risk vectors and mandatory assessment frameworks.
          </p>
          {isAdmin && (
            <div className="mt-4 inline-flex items-center gap-3 rounded-xl border border-border/40 bg-muted/20 px-4 py-2 text-xs font-bold text-muted-foreground">
              <Switch checked={allowSensitive} onCheckedChange={setAllowSensitive} />
              <span className="uppercase tracking-tighter">Extended Identity Access (Admin Only)</span>
            </div>
          )}
        </div>

        <Card className="glass-card shadow-medium animate-slide-up stagger-2">
          <CardHeader className="border-b border-border/40 pb-6 mb-2">
            <CardTitle className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-xs">
                <FileText className="h-5 w-5" />
              </div>
              Payload Validation
            </CardTitle>
            <CardDescription>
              Confirm the integrity of extracted documentation before executing risk synthesis.
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
              <div className="space-y-3 p-4 bg-primary/5 border border-primary/20 rounded-lg" data-testid="progress-container">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin text-primary" />
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
      <div className="page-shell animate-fade-in">
        <div className="space-y-1">
          <h1 className="page-title">Risk Framework Selection</h1>
          <p className="page-subtitle max-w-2xl">
            Consensus recommendations for <span className="text-foreground font-black tracking-tight">{serviceUserDisplayName}</span> based on multi-document neural analysis.
          </p>
          {isAdmin && (
            <div className="mt-4 inline-flex items-center gap-3 rounded-xl border border-border/40 bg-muted/20 px-4 py-2 text-xs font-bold text-muted-foreground">
              <Switch checked={allowSensitive} onCheckedChange={setAllowSensitive} />
              <span className="uppercase tracking-tighter">Extended Identity Access (Admin Only)</span>
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
        {isRuleBasedAnalysis && (
          <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100">
            <Info className="h-4 w-4" />
            <AlertTitle>Secure Rule-Based Mode</AlertTitle>
            <AlertDescription>
              Analysis was generated using the local rule-based engine without external AI.
            </AlertDescription>
          </Alert>
        )}

        {/* Service User Info */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Service User Information</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div>
              <Label className="text-muted-foreground">Service User Initials</Label>
              <p className="text-foreground font-medium">{serviceUserDisplayName}</p>
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
          <Card className="glass-card">
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
        <Card className="glass-card">
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
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-300">
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
                {filteredAssessments.map(({ assessment, index, relevanceMatch }) => (
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
                          {!assessment.isMandatory && customAssessmentKeys.has(normalizeAssessmentKey(assessment.name)) && (
                            <Badge variant="outline" className="text-xs">Custom</Badge>
                          )}
                          {relevanceMatch && (
                            <Badge variant="success" className="text-xs">
                              Match: {relevanceMatch}
                            </Badge>
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
          <div className="w-full max-w-md space-y-3 p-4 bg-primary/5 border border-primary/20 rounded-lg" data-testid="progress-container">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Loader2 size={16} className="animate-spin text-primary" />
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
    // Count total placeholders across all assessments
    const totalPlaceholders = generatedAssessments.reduce((sum, assessment) => {
      let count = 0;
      assessment.risks.forEach(risk => {
        count += countPlaceholders(risk.riskDefinition);
        count += countPlaceholders(risk.howItsARisk);
        count += countPlaceholders(risk.whoWillBeHarmed);
        count += countPlaceholders(risk.controlMeasures);
      });
      if (assessment.additionalNotes) {
        count += countPlaceholders(assessment.additionalNotes);
      }
      return sum + count;
    }, 0);

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-3xl font-heading font-bold text-foreground">Risk Assessments</h2>
            <p className="text-muted-foreground mt-2">
              Generated {generatedAssessments.length} risk assessment{generatedAssessments.length !== 1 ? "s" : ""} for {serviceUserDisplayName}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasRuleBasedGeneratedAssessments && (
              <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-700">
                Secure Rule-Based Output
              </Badge>
            )}
            {totalPlaceholders > 0 && (
              <Badge variant="secondary" className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-bold">
                <Edit3 size={12} className="mr-1" />
                {totalPlaceholders} placeholder{totalPlaceholders !== 1 ? 's' : ''} to fill
              </Badge>
            )}
            {isAdmin && (
              <div className="flex flex-col items-start gap-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Switch checked={allowSensitive} onCheckedChange={setAllowSensitive} />
                  <span>Show full names (admin view)</span>
                </div>
                <span className="text-[11px] text-muted-foreground/80">Copies follow the admin view setting.</span>
              </div>
            )}
            <Button variant="outline" onClick={copyAllAssessments} data-testid="button-copy-all-assessments">
              <Copy size={16} /> Copy All
            </Button>
            {isAdmin && (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={selectedForAcp.size === generatedAssessments.length ? deselectAllForAcp : selectAllForAcp}
                  data-testid="button-toggle-all-acp"
                >
                  {selectedForAcp.size === generatedAssessments.length ? "Deselect All" : "Select All"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => sendAssessmentsToExtension()}
                  disabled={selectedForAcp.size === 0}
                  data-testid="button-send-acp-extension"
                >
                  <Send size={16} /> Send to ACP ({selectedForAcp.size})
                </Button>
              </div>
            )}
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
                setSelectedForAcp(new Set());
              }}
              data-testid="button-back-to-select"
            >
              Generate More
            </Button>
          </div>
        </div>

        {totalPlaceholders > 0 && (
          <Alert className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
            <Edit3 className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle className="text-amber-700 dark:text-amber-300">Template Output</AlertTitle>
            <AlertDescription className="text-amber-600 dark:text-amber-400">
              These assessments contain {totalPlaceholders} placeholder{totalPlaceholders !== 1 ? 's' : ''} shown as{' '}
              <span className="inline-flex items-center px-1 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded text-xs font-medium border border-amber-300 dark:border-amber-700">[Name]</span>,{' '}
              <span className="inline-flex items-center px-1 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded text-xs font-medium border border-amber-300 dark:border-amber-700">[NHS Number]</span>, etc.
              Copy the assessment and replace each placeholder with actual data before adding to the care record.
            </AlertDescription>
          </Alert>
        )}

        {generatedAssessments.map((assessment, idx) => (
          <Card key={idx} className={`glass-card print:bg-white print:text-black ${isAdmin && selectedForAcp.has(idx) ? 'ring-2 ring-primary/50' : ''}`}>
            <CardHeader className="border-b border-border">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  {isAdmin && (
                    <input
                      type="checkbox"
                      checked={selectedForAcp.has(idx)}
                      onChange={() => toggleAcpSelection(idx)}
                      className="h-5 w-5 rounded border-border text-primary focus:ring-primary cursor-pointer"
                      data-testid={`checkbox-acp-${idx}`}
                      title="Select for ACP"
                    />
                  )}
                  <div>
                    <CardTitle className="text-xl">{assessment.category}</CardTitle>
                    <CardDescription>Risk Assessment</CardDescription>
                  </div>
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
                  {countPlaceholders(formatAssessmentForCopy(assessment)) > 0 && (
                    <TemplateFiller
                      templateText={formatAssessmentForCopy(assessment)}
                      onComplete={(filledText) => {
                        navigator.clipboard.writeText(filledText);
                        toast({
                          title: "Copied",
                          description: `Filled ${assessment.category} copied to clipboard`,
                        });
                      }}
                      title={`Fill ${assessment.category} Template`}
                      trigger={
                        <Button variant="ghost" size="sm" data-testid={`button-fill-template-${idx}`}>
                          <Edit3 size={14} />
                          Fill
                        </Button>
                      }
                    />
                  )}
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => sendSingleAssessmentToExtension(idx)}
                      data-testid={`button-send-assessment-${idx}`}
                    >
                      <Send size={14} />
                      Send
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {/* Service User Header */}
              <div className="grid grid-cols-1 gap-4 mb-6 p-4 bg-muted rounded-lg">
                <div>
                  <Label className="text-muted-foreground text-xs">{serviceUserLabel}</Label>
                  <p className="text-foreground font-medium">{getServiceUserDisplay(assessment.serviceUserInitials)}</p>
                </div>
              </div>

              {/* Risk Rows */}
              <div className="space-y-4">
                {assessment.risks.map((risk, riskIdx) => (
                  <div key={riskIdx} className="border border-border rounded-lg overflow-hidden">
                    <div className="bg-muted px-4 py-2 border-b border-border">
                      <p className="font-medium text-foreground">Risk {riskIdx + 1}: {highlightPlaceholders(risk.riskDefinition)}</p>
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
                          <p className="text-foreground">{highlightPlaceholders(risk.whoWillBeHarmed)}</p>
                        </div>
                      </div>
                      
                      <div>
                        <Label className="text-muted-foreground text-xs">How It's a Risk</Label>
                        <p className="text-muted-foreground text-sm">{highlightPlaceholders(risk.howItsARisk)}</p>
                      </div>
                      
                      <div>
                        <Label className="text-muted-foreground text-xs">Control Measures</Label>
                        <p className="text-muted-foreground text-sm">{highlightPlaceholders(risk.controlMeasures)}</p>
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
                  <p className="text-muted-foreground text-sm mt-1">{highlightPlaceholders(assessment.additionalNotes)}</p>
                </div>
              )}

              {/* Signature */}
              <div className="mt-6 pt-4 border-t border-border">
                <Label className="text-muted-foreground text-xs">Signed By</Label>
                <p className="text-foreground font-medium">{formatSignedBy(assessment)}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return null;
}
