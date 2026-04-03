import { useState, useRef, useMemo, useCallback, useEffect, memo } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import jsPDF from "jspdf";
import { useTemporaryData } from "@/context/TemporaryDataContext";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, ArrowRight, Loader2, Copy, Check, ChevronDown, ChevronUp, Columns, FileText, Download, Edit3, Send, Zap, Info, AlertTriangle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TemplateFiller } from "@/components/TemplateFiller";
import { Badge } from "@/components/ui/badge";
import { processVaultResponse } from "@/lib/pii-vault";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { consumeJsonSseStream } from "@/lib/sse";

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
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 mx-0.5 bg-warning/10 dark:bg-warning/30 text-warning rounded font-semibold text-xs border border-warning/30"
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

function countPlaceholders(text: string): number {
  const matches = text.match(/\[([^\]]+)\]/g);
  return matches ? matches.length : 0;
}

interface CarePlanTemplate {
  generationMode?: string;
  verificationQuestions?: string[];
  thisIsMe: {
    whoAmI: string;
    hobbiesInterests: string;
    whatMakesGoodDay: string;
  };
  goalSetting: {
    goals: { goal: string; howToAchieve: string; potentialBarriers: string; timeFrame: string }[];
    internetSupport: string;
    assistiveTechnology: string;
  };
  advanceDecisions: {
    advanceDecisionInPlace: string;
    dnrDetails: string;
    lastingPOA: string;
    poaType: string;
    poaContact: string;
  };
  myCarePlan: {
    capacityAndSafeguarding: string;
    healthAndWellbeing: string;
    triggerPoints: string;
    medicationRequirements: string;
    nutrition: string;
    personalCareNeeds: string;
    mobilityAndEquipment: string;
    houseworkAndSocial: string;
    financialArrangements: string;
  };
  riskSection1Health: Record<string, string>;
  riskSection2Medication: Record<string, string>;
  riskSection3Nutrition: Record<string, string>;
  riskSection4Equipment: { equipment: { name: string; fitForPurpose: string; supplier: string; nextService: string }[]; remedialAction: string; riskLevel: string; riskPrevention: string };
  riskSection5Mobility: Record<string, string>;
  riskSection6Appliances: Record<string, string>;
  riskSection7Fire: Record<string, string>;
  riskSection8COSHH: Record<string, string>;
  riskSection9External: Record<string, string>;
  riskSection10Security: Record<string, string>;
  section11Bands: Record<string, string>;
}

type PlanEnhancerResult = {
  raw: CarePlanTemplate;
  scrubbed: CarePlanTemplate;
};

const CopyButton = memo(function CopyButton({ text, label }: { text: string; label?: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: "Copied", description: label ? `${label} copied` : "Copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleCopy} data-testid={`button-copy-${label?.toLowerCase().replace(/\s/g, '-') || 'text'}`}>
      {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
    </Button>
  );
});

const FieldRow = memo(function FieldRow({ label, value, copyValue }: { label: string; value: string; copyValue?: string }) {
  if (!value || value === "N/A") return null;
  const valueToCopy = copyValue ?? value;
  return (
    <div className="flex justify-between items-start py-2 border-b border-border last:border-b-0">
      <span className="text-sm text-muted-foreground flex-shrink-0 mr-4">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm text-foreground text-right">{value}</span>
        <CopyButton text={valueToCopy} label={label} />
      </div>
    </div>
  );
});

const TextBlock = memo(function TextBlock({ label, value, copyValue }: { label: string; value: string; copyValue?: string }) {
  if (!value) return null;
  const valueToCopy = copyValue ?? value;
  const placeholderCount = countPlaceholders(value);
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium text-foreground">{label}</h4>
          {placeholderCount > 0 && (
            <Badge variant="secondary" className="bg-warning/10 dark:bg-warning/30 text-warning text-xs">
              <Edit3 size={10} className="mr-1" />
              {placeholderCount} fields
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {placeholderCount > 0 && (
            <TemplateFiller
              templateText={value}
              onComplete={() => {}}
              title={label}
              trigger={
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                  <Edit3 size={12} className="mr-1" />
                  Fill
                </Button>
              }
            />
          )}
          <CopyButton text={valueToCopy} label={label} />
        </div>
      </div>
      <div className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted rounded-lg p-3">
        {highlightPlaceholders(value)}
      </div>
    </div>
  );
});

const Section = memo(function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="app-surface bg-card border-border">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">{title}</CardTitle>
              {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {children}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
});

export default function PlanEnhancer() {
  usePageTitle("Plan Enhancer");
  const { serviceUserData, getAllDocumentContent, isAnyParsing } = useTemporaryData();
  const { user } = useAuth();
  const { toast } = useToast();
  const [resultRaw, setResultRaw] = useState<CarePlanTemplate | null>(null);
  const [resultScrubbed, setResultScrubbed] = useState<CarePlanTemplate | null>(null);
  const [originalContent, setOriginalContent] = useState<string>("");
  const [viewMode, setViewMode] = useState<"enhanced" | "comparison">("enhanced");
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState("");
  const [updateNotes, setUpdateNotes] = useState("");
  
  // Pre-analysis state (rule-based, no AI cost)
  const [preAnalysis, setPreAnalysis] = useState<{
    riskLevel: string;
    riskConfidence: number;
    extractedFields: Record<string, string>;
    qualityScore: number;
    qualityFeedback: string[];
    recommendedAssessments?: string[];
    aiNeeded: boolean;
    aiReason: string;
  } | null>(null);
  const [isPreAnalyzing, setIsPreAnalyzing] = useState(false);

  // Fetch active provider for dynamic token limits
  const [activeProvider, setActiveProvider] = useState<string>("github");
  useEffect(() => {
    fetch("/api/ai/status", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.provider) setActiveProvider(data.provider); })
      .catch(() => {});
  }, []);

  // Run quick pre-analysis when documents are ready (rule-based, no AI cost)
  const runPreAnalysis = useCallback(async () => {
    const docs = getAllDocumentContent();
    if (!docs || Object.values(docs).every((s) => !s || s.trim().length < 50)) {
      setPreAnalysis(null);
      return;
    }
    
    setIsPreAnalyzing(true);
    try {
      const content = Object.values(docs).filter(Boolean).join("\n\n");
      
      // Use extract-care-data for comprehensive extraction
      const response = await fetch("/api/extract-care-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ documentContent: content }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setPreAnalysis({
          riskLevel: data.overallRiskLevel || "Medium",
          riskConfidence: data.overallRiskConfidence || 0.5,
          extractedFields: data.sections ? Object.fromEntries(
            Object.entries(data.sections).map(([k, v]: [string, any]) => [k, v.content?.[0] || ""])
          ) : {},
          qualityScore: Math.round((data.extractionConfidence || 0.5) * 100),
          qualityFeedback: data.suggestAIEnhancement ? [data.aiEnhancementReason || "AI enhancement recommended"] : [],
          recommendedAssessments: data.recommendedAssessments || [],
          aiNeeded: data.suggestAIEnhancement || false,
          aiReason: data.aiEnhancementReason || "Sufficient data extracted"
        });
      }
    } catch (err) {
      console.error("Pre-analysis failed:", err);
    } finally {
      setIsPreAnalyzing(false);
    }
  }, [getAllDocumentContent]);

  // Auto-run pre-analysis when documents change
  useEffect(() => {
    const docs = getAllDocumentContent();
    const hasContent = docs && Object.values(docs).some((s) => s && s.trim().length > 50);
    if (hasContent && !isAnyParsing()) {
      const timer = setTimeout(runPreAnalysis, 500);
      return () => clearTimeout(timer);
    }
  }, [getAllDocumentContent, isAnyParsing, runPreAnalysis]);

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

  // Always use raw data with full names restored automatically via vault
  const displayResult = useMemo(
    () => resultRaw || resultScrubbed,
    [resultRaw, resultScrubbed]
  );
  const copyResult = resultScrubbed || resultRaw;
  const isRuleBasedOutput = displayResult?.generationMode === "rule-based";

  const recommendedTopics = useMemo(() => {
    if (!displayResult) return [];
    const topics = new Set<string>();

    const isMissing = (value?: string) => {
      if (!value) return true;
      const trimmed = value.trim();
      if (!trimmed) return true;
      const lower = trimmed.toLowerCase();
      return (
        lower === "n/a" ||
        lower === "na" ||
        lower.includes("not specified") ||
        lower.includes("not provided") ||
        lower.includes("unknown") ||
        lower.includes("not available") ||
        lower.includes("to be confirmed") ||
        lower.includes("not assessed") ||
        lower.includes("not documented") ||
        lower.includes("has not been provided") ||
        lower.includes("has not been specified") ||
        lower.includes("has not been documented")
      );
    };

    const missingAny = (values: Array<string | undefined>) => values.some(isMissing);

    if (missingAny([
      displayResult.thisIsMe?.whoAmI,
      displayResult.thisIsMe?.hobbiesInterests,
      displayResult.thisIsMe?.whatMakesGoodDay,
    ])) {
      topics.add("Personal background and preferences");
    }

    const goals = displayResult.goalSetting?.goals || [];
    if (
      goals.length === 0 ||
      goals.some((g) =>
        missingAny([g.goal, g.howToAchieve, g.potentialBarriers, g.timeFrame])
      ) ||
      missingAny([displayResult.goalSetting?.internetSupport, displayResult.goalSetting?.assistiveTechnology])
    ) {
      topics.add("Goal setting and support needs");
    }

    if (missingAny([
      displayResult.advanceDecisions?.advanceDecisionInPlace,
      displayResult.advanceDecisions?.dnrDetails,
      displayResult.advanceDecisions?.lastingPOA,
      displayResult.advanceDecisions?.poaType,
      displayResult.advanceDecisions?.poaContact,
    ])) {
      topics.add("Advance decisions and legal arrangements");
    }

    if (missingAny([
      displayResult.myCarePlan?.capacityAndSafeguarding,
      displayResult.myCarePlan?.healthAndWellbeing,
      displayResult.myCarePlan?.triggerPoints,
      displayResult.myCarePlan?.personalCareNeeds,
      displayResult.riskSection1Health?.speech,
      displayResult.riskSection1Health?.hearing,
      displayResult.riskSection1Health?.eyesight,
      displayResult.riskSection1Health?.memory,
    ])) {
      topics.add("Health, wellbeing and daily care");
    }

    if (missingAny([
      displayResult.myCarePlan?.mobilityAndEquipment,
      displayResult.riskSection5Mobility?.walking,
      displayResult.riskSection5Mobility?.weightBearing,
      displayResult.riskSection5Mobility?.transfers,
      displayResult.riskSection5Mobility?.moveInBed,
      displayResult.riskSection5Mobility?.canBeLeftAlone,
      displayResult.riskSection5Mobility?.proneToFalls,
    ])) {
      topics.add("Mobility, transfers and equipment");
    }

    if (missingAny([
      displayResult.myCarePlan?.medicationRequirements,
      displayResult.riskSection2Medication?.medicationStorage,
      displayResult.riskSection2Medication?.dosageSystem,
      displayResult.riskSection2Medication?.prnMedication,
      displayResult.riskSection2Medication?.controlledDrugs,
      displayResult.riskSection2Medication?.skinIntegrity,
    ])) {
      topics.add("Medication management and support");
    }

    if (missingAny([
      displayResult.myCarePlan?.nutrition,
      displayResult.riskSection3Nutrition?.normalDiet,
      displayResult.riskSection3Nutrition?.foodAllergies,
      displayResult.riskSection3Nutrition?.fluidIntake,
    ])) {
      topics.add("Nutrition, allergies and hydration");
    }

    if (missingAny([
      displayResult.riskSection6Appliances?.cooker,
      displayResult.riskSection6Appliances?.centralHeating,
      displayResult.riskSection7Fire?.smokeAlarmWorking,
      displayResult.riskSection7Fire?.canEvacuate,
    ])) {
      topics.add("Home safety and fire precautions");
    }

    if (missingAny([
      displayResult.riskSection1Health?.urinaryIncontinence,
      displayResult.riskSection1Health?.faecalIncontinence,
      displayResult.riskSection1Health?.sleepPattern,
      displayResult.riskSection1Health?.behaviours,
    ])) {
      topics.add("Continence, sleep and behaviour");
    }

    if (missingAny([
      displayResult.riskSection9External?.access,
      displayResult.riskSection10Security?.meansOfAccess,
      displayResult.riskSection10Security?.enterUsing,
    ])) {
      topics.add("Access, security and entry arrangements");
    }

    if (missingAny([
      displayResult.section11Bands?.personalCare,
      displayResult.section11Bands?.mentalHealth,
      displayResult.section11Bands?.physicalDisability,
    ])) {
      topics.add("Service user bands");
    }

    if (displayResult.verificationQuestions && displayResult.verificationQuestions.length > 0) {
      topics.add("Clarifications raised by the AI output");
    }

    return Array.from(topics).slice(0, 6);
  }, [displayResult]);

  // Calculate fields that will need verification when sent to extension
  const verificationStats = useMemo(() => {
    if (!displayResult) return { missing: 0, ambiguous: 0, total: 0 };
    
    let missing = 0;
    let ambiguous = 0;
    
    const checkValue = (value: unknown) => {
      if (typeof value !== 'string' || !value) return;
      const lower = value.toLowerCase().trim();
      
      // Check for missing info
      if (lower.includes('information is not provided') ||
          lower.includes('information not provided') ||
          lower.includes('not provided') ||
          lower.includes('no information') ||
          lower.includes('not specified in documents') ||
          lower.includes('has not been provided') ||
          lower.includes('has not been documented') ||
          lower === 'n/a' || lower === 'na' ||
          lower === 'unknown' || lower === '') {
        missing++;
        return;
      }
      
      // Check for needs-confirmation fields
      if (lower.includes('to be confirmed') ||
          lower.includes('not assessed') ||
          lower.includes('not documented')) {
        ambiguous++;
        return;
      }
      
      // Check for ambiguous yes/no
      if (lower.includes('yes') && lower.includes('no')) {
        ambiguous++;
      }
    };
    
    const checkObject = (obj: unknown) => {
      if (!obj || typeof obj !== 'object') return;
      for (const value of Object.values(obj as Record<string, unknown>)) {
        if (typeof value === 'string') {
          checkValue(value);
        } else if (Array.isArray(value)) {
          value.forEach(item => {
            if (typeof item === 'object') checkObject(item);
            else checkValue(item);
          });
        } else if (typeof value === 'object') {
          checkObject(value);
        }
      }
    };
    
    checkObject(displayResult);
    
    return { missing, ambiguous, total: missing + ambiguous };
  }, [displayResult]);

  const hasData = Boolean(
    serviceUserData.carePlan ||
    serviceUserData.socialWork ||
    serviceUserData.initialAssessment ||
    serviceUserData.movingHandling ||
    (serviceUserData.additionalDocuments && serviceUserData.additionalDocuments.length > 0) ||
    (serviceUserData.additionalNotes && serviceUserData.additionalNotes.trim().length > 0) ||
    updateNotes.trim().length > 0
  );

  const enhanceMutation = useMutation({
    retry: false, // Disable React Query retry - server handles retries for rate limits
    mutationFn: async () => {
      const supportingContent = getAllDocumentContent({ includeCarePlan: false });
      const updateContent = updateNotes.trim();
      const combinedSupporting = [
        supportingContent,
        updateContent ? `=== USER UPDATES (PLAN ENHANCER) ===\n${updateContent}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      const carePlanContent = serviceUserData.carePlan?.content;
      
      if (!combinedSupporting.trim() && !carePlanContent) {
        throw new Error("No document content available");
      }

      // CLIENT-SIDE TOKEN LIMIT CHECK
      // Estimate tokens (rough: ~4 chars per token) - matches server-side logic
      const estimateTokens = (text: string): number => Math.ceil(text.length / 4);
      
      const supportingTokens = estimateTokens(combinedSupporting);
      const carePlanTokens = carePlanContent ? estimateTokens(carePlanContent) : 0;
      const totalContentTokens = supportingTokens + carePlanTokens;
      
      // Token limits per provider (conservative to account for system prompt overhead)
      // GitHub Models: 8K-16K input tokens → use 10K to be safe
      // OpenAI/Local: 90K+ → use 80K to be safe
      const TOKEN_LIMITS: Record<string, number> = { github: 10000, openai: 80000, local: 40000 };
      const MAX_TOKENS = TOKEN_LIMITS[activeProvider] ?? 10000;
      
      if (totalContentTokens > MAX_TOKENS) {
        const excessTokens = totalContentTokens - MAX_TOKENS;
        const excessKB = Math.ceil((excessTokens * 4) / 1024);
        
        throw new Error(
          `Document content is too large (~${Math.ceil(totalContentTokens / 1000)}K tokens, limit is ${Math.ceil(MAX_TOKENS / 1000)}K tokens). ` +
          `Your content exceeds the limit by ~${excessKB}KB. ` +
          `\n\nPlease reduce content by:\n` +
          `• Uploading only the most relevant pages/sections\n` +
          `• Removing redundant or outdated documents\n` +
          `• Summarizing lengthy medical histories\n` +
          `• Splitting into multiple care plan generations\n\n` +
          `Or switch AI provider in Secret Admin Portal for higher limits.`
        );
      }
      
      // Warn if approaching limit (>80% of max)
      if (totalContentTokens > MAX_TOKENS * 0.8) {
        const percentUsed = Math.round((totalContentTokens / MAX_TOKENS) * 100);
        console.warn(
          `[PlanEnhancer] ⚠️  Content approaching token limit: ${percentUsed}% used ` +
          `(${totalContentTokens} / ${MAX_TOKENS} tokens). Server may truncate output.`
        );
      }

      // Store the original content for comparison view
      const combinedOriginal = [
        carePlanContent ? `=== Original Care Plan ===\n${carePlanContent}` : "",
        combinedSupporting ? `=== Supporting Documents ===\n${combinedSupporting}` : ""
      ].filter(Boolean).join("\n\n");
      setOriginalContent(combinedOriginal);
      setResultRaw(null);
      setResultScrubbed(null);

      setProgress(0);
      setProgressStatus("Preparing documents...");
      
      // Log final payload info for debugging
      const finalPayload = { 
        documentContent: combinedSupporting,
        existingPlanContent: carePlanContent,
        allowSensitive: true // Always request vault export for automatic restoration
      };
      const payloadJSON = JSON.stringify(finalPayload);
      const payloadSizeMB = (new Blob([payloadJSON]).size / (1024 * 1024)).toFixed(2);

      // 6-minute client timeout — must exceed server-side AI timeout (5 min) to
      // avoid aborting while the server is still generating the plan.
      const controller = new AbortController();
      const clientTimeout = setTimeout(() => controller.abort(), 360_000);

      let response: Response;
      try {
        response = await fetch("/api/ai/enhance-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          signal: controller.signal,
          body: payloadJSON,
        });
      } catch (err: any) {
        clearTimeout(clientTimeout);
        if (err.name === "AbortError") {
          throw new Error("The AI service took too long to respond. Please try again — shorter documents may help.");
        }
        throw err;
      }
      clearTimeout(clientTimeout);

      if (!response.ok) {
        const errorText = await response.text();
        try {
          const error = JSON.parse(errorText);
          const errorMsg = error.message || "";
          
          // Check for payload too large errors (413)
          if (response.status === 413 || errorMsg.toLowerCase().includes('too large') || errorMsg.toLowerCase().includes('payload')) {
            throw new Error(
              "Document content is too large for the server. Try: (1) Upload smaller or fewer documents, " +
              "(2) Summarize lengthy sections, or (3) Switch AI provider in Secret Admin Portal for higher token limits."
            );
          }
          
          // Check for provider-specific quota/permission errors
          if (errorMsg.includes("quota exceeded") || errorMsg.includes("API quota")) {
            throw new Error("AI provider quota exceeded. Your API token has hit its rate limit. Wait for quota to reset, use a different token, or switch provider in Secret Admin Portal.");
          }
          if (errorMsg.includes("models") && errorMsg.includes("permission")) {
            throw new Error("AI provider permission error. Your API token may need additional scopes. Check your token configuration or switch provider in Secret Admin Portal.");
          }
          if (response.status === 429 || errorMsg.includes('rate limit') || errorMsg.includes('429')) {
            throw new Error("AI service is busy (rate limited). Please wait 30-60 seconds and try again.");
          }
          throw new Error(errorMsg || "Failed to generate care plan");
        } catch (e: any) {
          if (e.message?.includes('AI service is busy') || e.message?.includes('quota exceeded') || e.message?.includes('permission') || e.message?.includes('too large')) throw e;
          // If 413 but couldn't parse JSON, throw generic payload error
          if (response.status === 413) {
            throw new Error("Document content is too large. Try uploading smaller or fewer documents.");
          }
          throw new Error("Failed to generate care plan");
        }
      }

      let resultRaw: CarePlanTemplate | null = null;
      let resultScrubbed: CarePlanTemplate | null = null;

      await consumeJsonSseStream(response, ({ eventType, data }) => {
        const payload = data as any;
        if (eventType === "progress") {
          const percent = typeof payload?.percent === "number" ? payload.percent : 0;
          const status = typeof payload?.status === "string" ? payload.status : "Generating care plan...";
          throttledSetProgress(percent, status);
          return;
        }
        if (eventType === "error") {
          throw new Error(payload?.message || "Plan enhancement failed");
        }
        if (eventType !== "result" || !payload || typeof payload !== "object") {
          return;
        }
        const { scrubbed, raw } = processVaultResponse<CarePlanTemplate>(
          payload,
          true // Always restore full names via vault
        );
        resultScrubbed = scrubbed;
        resultRaw = raw || scrubbed;
      });

      if (!resultRaw) {
        throw new Error("No result received from server");
      }

      return { raw: resultRaw, scrubbed: resultScrubbed || resultRaw };
    },
    onSuccess: ({ raw, scrubbed }: PlanEnhancerResult) => {
      setProgress(100);
      setProgressStatus("Complete!");
      setTimeout(() => {
        setProgress(0);
        setProgressStatus("");
      }, 500);
      setResultRaw(raw);
      setResultScrubbed(scrubbed);
      toast({
        title: "Care Plan Generated",
        description: "Complete template ready for copying into your forms.",
      });
    },
    onError: (error: Error) => {
      setProgress(0);
      setProgressStatus("");
      
      // Extract error info for better user guidance
      const errorMsg = error.message || "Plan generation failed";
      const isGitHubQuota = errorMsg.includes("quota") || errorMsg.includes("rate limit");
      const isGitHubPermission = errorMsg.includes("permission");
      
      let title = "Generation Failed";
      let duration = 8000;
      
      if (isGitHubQuota) {
        title = "AI Provider Quota Exceeded";
        duration = 12000;
      } else if (isGitHubPermission) {
        title = "AI Provider Permission Error";
        duration = 12000;
      }
      
      toast({
        title,
        description: errorMsg,
        variant: "destructive",
        duration,
      });
    },
  });

  const exportPlanPdf = () => {
    if (!displayResult) return;

    const doc = new jsPDF();
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 14;
    const maxWidth = pageWidth - marginX * 2;
    let y = 18;

    const ensureSpace = (lineHeight: number) => {
      if (y + lineHeight > pageHeight - 12) {
        doc.addPage();
        y = 18;
      }
    };

    const addLines = (
      text: string,
      opts?: { bold?: boolean; size?: number; lineHeight?: number; spacing?: number }
    ) => {
      const size = opts?.size ?? 11;
      const lineHeight = opts?.lineHeight ?? 6;
      doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(text, maxWidth) as string[];
      lines.forEach((line) => {
        ensureSpace(lineHeight);
        doc.text(String(line), marginX, y);
        y += lineHeight;
      });
      if (opts?.spacing) {
        y += opts.spacing;
      }
    };

    const safeValue = (value?: string) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : "Not specified in documents.";
    };

    const addHeading = (text: string) => {
      addLines(text, { bold: true, size: 14, lineHeight: 8, spacing: 2 });
    };

    const addSubheading = (text: string) => {
      addLines(text, { bold: true, size: 12, lineHeight: 7, spacing: 1 });
    };

    const addField = (label: string, value?: string) => {
      addLines(`${label}: ${safeValue(value)}`);
    };

    const addBlock = (label: string, value?: string) => {
      addLines(label, { bold: true, size: 11, lineHeight: 6 });
      addLines(safeValue(value), { spacing: 1 });
    };

    addHeading("Plan Enhancer Export");
    addLines(`Exported: ${new Date().toLocaleDateString("en-GB")}`, { size: 10, lineHeight: 5 });
    addLines(
      "View: Full output with restored names.",
      { size: 10, lineHeight: 5, spacing: 2 }
    );

    addHeading("This Is Me");
    addBlock("Who am I and what is important to me?", displayResult.thisIsMe?.whoAmI);
    addBlock("What hobbies and interests do I have?", displayResult.thisIsMe?.hobbiesInterests);
    addBlock("What makes a good day for me?", displayResult.thisIsMe?.whatMakesGoodDay);

    addHeading("My Goal Setting");
    const goals = displayResult.goalSetting?.goals || [];
    if (goals.length) {
      goals.forEach((goal, idx) => {
        addSubheading(`Goal ${idx + 1}`);
        addField("My Goal", goal.goal);
        addField("How I will achieve it", goal.howToAchieve);
        addField("Potential Barriers", goal.potentialBarriers);
        addField("Time Frame", goal.timeFrame);
      });
    } else {
      addLines("Goals: Not specified in documents.", { spacing: 1 });
    }
    addField("Internet Support Required", displayResult.goalSetting?.internetSupport);
    addField("Assistive Technology", displayResult.goalSetting?.assistiveTechnology);

    addHeading("Advance Decisions / DNR / Lasting Power of Attorney");
    addField("Advance Decision in Place", displayResult.advanceDecisions?.advanceDecisionInPlace);
    addField("DNR/Advance Decision Details", displayResult.advanceDecisions?.dnrDetails);
    addField("Lasting Power of Attorney", displayResult.advanceDecisions?.lastingPOA);
    addField("POA Type", displayResult.advanceDecisions?.poaType);
    addField("POA Contact", displayResult.advanceDecisions?.poaContact);

    addHeading("My Care Plan");
    addBlock("Capacity, Decision Making and Safeguarding", displayResult.myCarePlan?.capacityAndSafeguarding);
    addBlock("My Health and Current Wellbeing", displayResult.myCarePlan?.healthAndWellbeing);
    addBlock("Trigger Points to Alert to Potential Changes", displayResult.myCarePlan?.triggerPoints);
    addBlock("My Medication Requirements", displayResult.myCarePlan?.medicationRequirements);
    addBlock("Nutrition (Dietary needs or preferences)", displayResult.myCarePlan?.nutrition);
    addBlock("My Personal Care Needs", displayResult.myCarePlan?.personalCareNeeds);
    addBlock("Mobility and Equipment / Methods", displayResult.myCarePlan?.mobilityAndEquipment);
    addBlock("Housework/Shopping and Social Support", displayResult.myCarePlan?.houseworkAndSocial);
    addBlock("Financial Arrangements", displayResult.myCarePlan?.financialArrangements);

    addHeading("Risk Assessment Section 1: Mental and Physical Health");
    addSubheading("Communication");
    addField("Speech", displayResult.riskSection1Health?.speech);
    addField("Speech Details", displayResult.riskSection1Health?.speechDetails);
    addField("Hearing", displayResult.riskSection1Health?.hearing);
    addField("Hearing Details", displayResult.riskSection1Health?.hearingDetails);
    addField("Eyesight", displayResult.riskSection1Health?.eyesight);
    addField("Eyesight Details", displayResult.riskSection1Health?.eyesightDetails);
    addSubheading("General Health");
    addField("Breathlessness", displayResult.riskSection1Health?.breathlessness);
    addField("Details", displayResult.riskSection1Health?.breathlessnessDetails);
    addField("Urinary Incontinence", displayResult.riskSection1Health?.urinaryIncontinence);
    addField("Details", displayResult.riskSection1Health?.urinaryDetails);
    addField("Faecal Incontinence", displayResult.riskSection1Health?.faecalIncontinence);
    addField("Details", displayResult.riskSection1Health?.faecalDetails);
    addSubheading("Mental Health Assessment");
    addField("Memory", displayResult.riskSection1Health?.memory);
    addField("Moods", displayResult.riskSection1Health?.moods);
    addField("Orientation", displayResult.riskSection1Health?.orientation);
    addField("Sleep Pattern", displayResult.riskSection1Health?.sleepPattern);
    addField("Behaviours", displayResult.riskSection1Health?.behaviours);
    addSubheading("Mental Capacity Assessment");
    addField("Understands Information", displayResult.riskSection1Health?.understandsInfo);
    addField("Retains Information", displayResult.riskSection1Health?.retainsInfo);
    addField("Weighs Up Decision", displayResult.riskSection1Health?.weighsDecision);
    addField("Communicates Decision", displayResult.riskSection1Health?.communicatesDecision);
    addBlock("Capacity Details", displayResult.riskSection1Health?.capacityDetails);
    addSubheading("Risk");
    addField("Risk Level", displayResult.riskSection1Health?.riskLevel);
    addBlock("Risk Prevention", displayResult.riskSection1Health?.riskPrevention);

    addHeading("Risk Assessment Section 2: Medication");
    addField("Prescription Ordering", displayResult.riskSection2Medication?.prescriptionOrdering);
    addField("Dosage System", displayResult.riskSection2Medication?.dosageSystem);
    addField("System Maintainer", displayResult.riskSection2Medication?.systemMaintainer);
    addField("Medication Storage", displayResult.riskSection2Medication?.medicationStorage);
    addField("Current Investigations", displayResult.riskSection2Medication?.currentInvestigations);
    addField("Surplus Medication", displayResult.riskSection2Medication?.surplusMedication);
    addField("Medication Concerns", displayResult.riskSection2Medication?.medicationConcerns);
    addField("Homeopathic/OTC Meds", displayResult.riskSection2Medication?.homeopathicMeds);
    addField("PRN Medication", displayResult.riskSection2Medication?.prnMedication);
    addField("Covert Medication", displayResult.riskSection2Medication?.covertMedication);
    addSubheading("Medication Difficulties");
    addField("Picking Up Tablets", displayResult.riskSection2Medication?.pickingUpTablets);
    addField("Opening Boxes", displayResult.riskSection2Medication?.openingBoxes);
    addField("Pouring Liquids", displayResult.riskSection2Medication?.pouringLiquids);
    addField("Using Dosage System", displayResult.riskSection2Medication?.usingDosageSystem);
    addField("Applying Creams", displayResult.riskSection2Medication?.applyingCreams);
    addField("Swallowing Tablets", displayResult.riskSection2Medication?.swallowingTablets);
    addField("Understanding Instructions", displayResult.riskSection2Medication?.understandingInstructions);
    addField("Managing Inhalers", displayResult.riskSection2Medication?.managingInhalers);
    addField("Instilling Drops", displayResult.riskSection2Medication?.instillingDrops);
    addField("Controlled Drugs", displayResult.riskSection2Medication?.controlledDrugs);
    addField("Warfarin", displayResult.riskSection2Medication?.warfarin);
    addField("Skin Integrity Risk", displayResult.riskSection2Medication?.skinIntegrity);
    addBlock("Skin Details", displayResult.riskSection2Medication?.skinDetails);
    addSubheading("Risk");
    addField("Risk Level", displayResult.riskSection2Medication?.riskLevel);
    addBlock("Risk Prevention", displayResult.riskSection2Medication?.riskPrevention);

    addHeading("Risk Assessment Section 3: Nutrition");
    addField("Meal Assistance Required", displayResult.riskSection3Nutrition?.mealAssistance);
    addField("Normal Diet", displayResult.riskSection3Nutrition?.normalDiet);
    addField("Special Dietary Requirements", displayResult.riskSection3Nutrition?.specialDietary);
    addField("Food Allergies", displayResult.riskSection3Nutrition?.foodAllergies);
    addField("Soft Diet", displayResult.riskSection3Nutrition?.softDiet);
    addField("Food Intolerances", displayResult.riskSection3Nutrition?.foodIntolerances);
    addField("Tube Feed", displayResult.riskSection3Nutrition?.tubeFeed);
    addField("Supplementary Foods/Thickeners", displayResult.riskSection3Nutrition?.supplementaryFoods);
    addField("Foods I Like", displayResult.riskSection3Nutrition?.foodLikes);
    addField("Foods I Dislike", displayResult.riskSection3Nutrition?.foodDislikes);
    addField("Portion Size", displayResult.riskSection3Nutrition?.portionSize);
    addField("Preferred Main Meal Time", displayResult.riskSection3Nutrition?.mainMealTime);
    addField("Fluid Intake", displayResult.riskSection3Nutrition?.fluidIntake);
    addSubheading("Risk");
    addField("Risk Level", displayResult.riskSection3Nutrition?.riskLevel);
    addBlock("Risk Prevention", displayResult.riskSection3Nutrition?.riskPrevention);

    addHeading("Risk Assessment Section 4: Equipment");
    const equipmentList = displayResult.riskSection4Equipment?.equipment || [];
    if (equipmentList.length) {
      equipmentList.forEach((eq, idx) => {
        addSubheading(`Equipment ${idx + 1}`);
        addField("Equipment", eq.name);
        addField("Fit For Purpose", eq.fitForPurpose);
        addField("Supplier", eq.supplier);
        addField("Next Service Date", eq.nextService);
      });
    } else {
      addLines("Equipment: Not specified in documents.", { spacing: 1 });
    }
    addBlock("Remedial Action", displayResult.riskSection4Equipment?.remedialAction);
    addSubheading("Risk");
    addField("Risk Level", displayResult.riskSection4Equipment?.riskLevel);
    addBlock("Risk Prevention", displayResult.riskSection4Equipment?.riskPrevention);

    addHeading("Risk Assessment Section 5: Mobility");
    addField("Weight Bearing", displayResult.riskSection5Mobility?.weightBearing);
    addField("Details", displayResult.riskSection5Mobility?.weightBearingDetails);
    addField("Walking", displayResult.riskSection5Mobility?.walking);
    addField("Details", displayResult.riskSection5Mobility?.walkingDetails);
    addField("Stairs", displayResult.riskSection5Mobility?.stairs);
    addField("Details", displayResult.riskSection5Mobility?.stairsDetails);
    addField("Sit to Stand", displayResult.riskSection5Mobility?.sitToStand);
    addField("Details", displayResult.riskSection5Mobility?.sitToStandDetails);
    addField("Washing", displayResult.riskSection5Mobility?.washing);
    addField("Details", displayResult.riskSection5Mobility?.washingDetails);
    addField("Dressing", displayResult.riskSection5Mobility?.dressing);
    addField("Details", displayResult.riskSection5Mobility?.dressingDetails);
    addField("Oral Care", displayResult.riskSection5Mobility?.oralCare);
    addField("Details", displayResult.riskSection5Mobility?.oralCareDetails);
    addField("Bath/Shower", displayResult.riskSection5Mobility?.bathShower);
    addField("Toilet/Commode", displayResult.riskSection5Mobility?.toiletCommode);
    addField("Wheelchair", displayResult.riskSection5Mobility?.wheelchair);
    addField("Transfers", displayResult.riskSection5Mobility?.transfers);
    addField("Move in Bed", displayResult.riskSection5Mobility?.moveInBed);
    addField("In/Out of Bed", displayResult.riskSection5Mobility?.inOutOfBed);
    addField("Can Be Left Alone", displayResult.riskSection5Mobility?.canBeLeftAlone);
    addField("Prone to Falls", displayResult.riskSection5Mobility?.proneToFalls);
    addSubheading("Risk");
    addField("Risk Level", displayResult.riskSection5Mobility?.riskLevel);
    addBlock("Risk Prevention", displayResult.riskSection5Mobility?.riskPrevention);

    addHeading("Risk Assessment Section 6: Appliances/Equipment");
    addField("Cooker", displayResult.riskSection6Appliances?.cooker);
    addField("Microwave", displayResult.riskSection6Appliances?.microwave);
    addField("Iron", displayResult.riskSection6Appliances?.iron);
    addField("Kettle", displayResult.riskSection6Appliances?.kettle);
    addField("Toaster", displayResult.riskSection6Appliances?.toaster);
    addField("Tumble Dryer", displayResult.riskSection6Appliances?.tumbleDryer);
    addField("Floor Coverings", displayResult.riskSection6Appliances?.floorCoverings);
    addField("Hand/Grab Rails", displayResult.riskSection6Appliances?.handRails);
    addField("Electric Blanket", displayResult.riskSection6Appliances?.electricBlanket);
    addField("Bed", displayResult.riskSection6Appliances?.bed);
    addField("Washing Machine", displayResult.riskSection6Appliances?.washingMachine);
    addField("Central Heating/Boiler", displayResult.riskSection6Appliances?.centralHeating);
    addBlock("Actions Required", displayResult.riskSection6Appliances?.actionsRequired);

    addHeading("Risk Assessment Section 7: Fire Safety");
    addField("At Risk of Fire", displayResult.riskSection7Fire?.atRisk);
    addField("Risk Reason", displayResult.riskSection7Fire?.riskReason);
    addField("RAG Rating", displayResult.riskSection7Fire?.ragRating);
    addField("Plug Sockets", displayResult.riskSection7Fire?.plugSockets);
    addField("Electric Cables", displayResult.riskSection7Fire?.electricCables);
    addField("Smoking Policy Explained", displayResult.riskSection7Fire?.smokingPolicy);
    addField("Smoke Alarm Location", displayResult.riskSection7Fire?.smokeAlarmLocation);
    addField("Smoke Alarm Working", displayResult.riskSection7Fire?.smokeAlarmWorking);
    addField("CO Detector Location", displayResult.riskSection7Fire?.coDetectorLocation);
    addField("CO Detector Working", displayResult.riskSection7Fire?.coDetectorWorking);
    addField("Can Evacuate Without Assistance", displayResult.riskSection7Fire?.canEvacuate);
    addBlock("Actions and Safety Measures", displayResult.riskSection7Fire?.actionsAndSafety);

    addHeading("Risk Assessment Section 8: COSHH");
    addField("Cleaning Materials Storage", displayResult.riskSection8COSHH?.cleaningStorage);
    addField("RIDDOR Explained", displayResult.riskSection8COSHH?.riddorExplained);

    addHeading("Risk Assessment Section 9: External Safe Working");
    addField("Access", displayResult.riskSection9External?.access);
    addField("Clear Pathways", displayResult.riskSection9External?.clearPathways);
    addField("Handrails", displayResult.riskSection9External?.handrails);
    addField("Entrance Steps", displayResult.riskSection9External?.entranceSteps);
    addField("Lighting", displayResult.riskSection9External?.lighting);
    addField("Ramps", displayResult.riskSection9External?.ramps);
    addField("Personal Security", displayResult.riskSection9External?.personalSecurity);
    addField("Parking", displayResult.riskSection9External?.parking);
    addBlock("Actions Required", displayResult.riskSection9External?.actionsRequired);
    addSubheading("Risk");
    addField("Risk Level", displayResult.riskSection9External?.riskLevel);
    addBlock("Risk Prevention", displayResult.riskSection9External?.riskPrevention);

    addHeading("Risk Assessment Section 10: Security/Entry/Emergency Access");
    addField("Means of Access", displayResult.riskSection10Security?.meansOfAccess);
    addField("Property Type", displayResult.riskSection10Security?.propertyType);
    addField("Enter Using", displayResult.riskSection10Security?.enterUsing);
    addField("Keysafe Consent", displayResult.riskSection10Security?.keysafeConsent);
    addField("Gas Shut Off Location", displayResult.riskSection10Security?.gasShutOff);
    addField("Stop Tap/Mains Location", displayResult.riskSection10Security?.stopTap);
    addField("Fuse Box Location", displayResult.riskSection10Security?.fuseBox);
    addSubheading("Risk");
    addField("Risk Level", displayResult.riskSection10Security?.riskLevel);
    addBlock("Risk Prevention", displayResult.riskSection10Security?.riskPrevention);

    addHeading("Section 11: Service User Bands");
    addField("Personal Care", displayResult.section11Bands?.personalCare);
    addField("Mental Health", displayResult.section11Bands?.mentalHealth);
    addField("Physical Disability", displayResult.section11Bands?.physicalDisability);
    addField("Dementia", displayResult.section11Bands?.dementia);
    addField("Eating Disorder", displayResult.section11Bands?.eatingDisorder);
    addField("Sensory Impairment", displayResult.section11Bands?.sensoryImpairment);
    addField("Detained under MHA", displayResult.section11Bands?.detainedMHA);
    addField("Drug/Alcohol Misuse", displayResult.section11Bands?.drugAlcoholMisuse);
    addField("Learning Difficulties", displayResult.section11Bands?.learningDifficulties);

    if (displayResult.verificationQuestions && displayResult.verificationQuestions.length > 0) {
      addHeading("Verification Questions");
      displayResult.verificationQuestions.forEach((question, index) => {
        addLines(`${index + 1}. ${question}`, { spacing: 1 });
      });
    }

    const fileName = `plan-enhancer-${new Date().toISOString().split("T")[0]}.pdf`;
    doc.save(fileName);
  };

  // Send the enhanced plan data to the browser extension for autofill
  const sendToInitialAssessment = async () => {
    if (!displayResult) {
      toast({
        title: "No Data",
        description: "Please generate an enhanced plan first.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Build the comprehensive payload for the extension
      // The extension expects displayResult directly as initialAssessmentData
      // because it checks for data.thisIsMe to determine if mapping is needed
      const payload = {
        formType: "initialAssessment",
        initialAssessmentData: displayResult, // Send the raw displayResult with nested structure
        assessor: user?.firstName && user?.lastName 
          ? `${user.firstName} ${user.lastName}` 
          : user?.username || "",
        date: new Date().toISOString().split("T")[0],
      };

      // Try to send to extension via postMessage (for cross-origin communication)
      window.postMessage({
        type: "CA_EXTENSION_STORE_PAYLOAD",
        payload,
      }, "*");

      // Count fields that will need verification
      const countMissingFields = (obj: any): number => {
        if (!obj) return 0;
        let count = 0;
        for (const value of Object.values(obj)) {
          if (typeof value === 'string') {
            const lower = value.toLowerCase().trim();
            if (lower.includes('information is not provided') ||
                lower.includes('information not provided') ||
                lower.includes('not provided') ||
                lower === 'n/a' || lower === 'na' ||
                lower === 'unknown' || lower === '') {
              count++;
            }
            // Check for ambiguous yes/no
            if (lower.includes('yes') && lower.includes('no')) {
              count++;
            }
          } else if (typeof value === 'object' && value !== null) {
            count += countMissingFields(value);
          }
        }
        return count;
      };

      const pendingFields = countMissingFields(payload.initialAssessmentData);
      
      toast({
        title: "Sent to Extension",
        description: pendingFields > 0 
          ? `Plan data ready. ${pendingFields} field(s) will need verification.`
          : "Plan data is ready. Open the extension on the form to autofill.",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to send to extension",
        variant: "destructive",
      });
    }
  };

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-6 animate-in fade-in zoom-in duration-500">
        <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center">
          <Sparkles size={48} className="text-muted-foreground" />
        </div>
        <div className="max-w-md space-y-2">
          <h2 className="text-2xl font-semibold text-foreground" data-testid="text-no-data-title">No Data Available</h2>
          <p className="text-muted-foreground">
            Please upload documents or add text notes (including care plan updates) to generate the care plan template.
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
          <h1 className="page-title leading-tight" data-testid="text-page-title">Plan Enhancer</h1>
          <p className="page-subtitle">Synthesize complete care templates from multi-source documentation.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isRuleBasedOutput && (
            <Badge className="bg-success-100 text-success-800 border border-success-300 dark:bg-success-900/40 dark:text-success-200 dark:border-success-700">
              Secure Rule-Based Output
            </Badge>
          )}
          {/* Names are automatically restored from vault - no toggle needed */}
        </div>
      </div>

      <Card className="app-surface animate-slide-up stagger-2 mt-6 border-primary/20">
        <CardHeader className="border-b border-border/40 pb-3">
          <CardTitle className="text-sm">Suggested updates to add</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {recommendedTopics.length > 0 ? (
            <div className="flex flex-wrap gap-2 text-xs">
              {recommendedTopics.map((topic) => (
                <span
                  key={topic}
                  className="rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-muted-foreground"
                >
                  {topic}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Generate an output to see tailored suggestions for missing areas.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="app-surface animate-slide-up stagger-2 mt-6">
        <CardHeader className="border-b border-border/40 pb-4">
          <CardTitle className="text-base">Update Information (Optional)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          <p className="text-xs text-muted-foreground">
            Add clarifications or corrections here. This will be included in the next generation and used to resolve any uncertain details.
          </p>
          <Textarea
            value={updateNotes}
            onChange={(e) => setUpdateNotes(e.target.value)}
            placeholder="E.g. prefers afternoon visits, no allergies, uses a walking frame, has a weekly GP visit..."
            className="min-h-[120px] bg-background/60"
            data-testid="input-plan-enhancer-updates"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground/70">
            <span>{updateNotes.trim().length.toLocaleString()} chars</span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setUpdateNotes("")}
                disabled={!updateNotes.trim().length || enhanceMutation.isPending}
              >
                Clear updates
              </Button>
              <Button
                size="sm"
                className="gap-2"
                onClick={() => enhanceMutation.mutate()}
                disabled={enhanceMutation.isPending || isAnyParsing() || !hasData}
                data-testid="button-regenerate-plan"
              >
                {enhanceMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Update & Regenerate
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="app-surface animate-slide-up stagger-3 overflow-hidden mt-6">
        <CardHeader className="border-b border-border/40 pb-6">
          <CardTitle className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-md flex items-center justify-center bg-primary/8">
              <Sparkles size={18} className="text-primary" />
            </div>
            Pipeline Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {serviceUserData.carePlan && (
              <div className="p-4 rounded-xl bg-success/5 border border-success-500/20 text-sm flex items-center gap-3" data-testid="text-care-plan-doc">
                <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center text-success-500 shadow-sm">
                  <FileText size={16} />
                </div>
                <div>
                  <p className="font-semibold text-success-500 tracking-tight">Legacy Plan</p>
                  <p className="text-[10px] text-muted-foreground font-medium truncate max-w-[120px]">{serviceUserData.carePlan.name}</p>
                </div>
              </div>
            )}
            {serviceUserData.socialWork && (
              <div className="p-4 rounded-xl bg-muted/20 border border-border/40 text-sm flex items-center gap-3" data-testid="text-social-work-doc">
                <div className="h-8 w-8 rounded-lg bg-background border border-border/60 flex items-center justify-center text-muted-foreground">
                  <FileText size={16} />
                </div>
                <div>
                  <p className="font-semibold text-foreground tracking-tight">Social Work</p>
                  <p className="text-[10px] text-muted-foreground font-medium truncate max-w-[120px]">{serviceUserData.socialWork.name}</p>
                </div>
              </div>
            )}
            {serviceUserData.initialAssessment && (
              <div className="p-4 rounded-xl bg-muted/20 border border-border/40 text-sm flex items-center gap-3" data-testid="text-initial-assessment-doc">
                <div className="h-8 w-8 rounded-lg bg-background border border-border/60 flex items-center justify-center text-muted-foreground">
                  <FileText size={16} />
                </div>
                <div>
                  <p className="font-semibold text-foreground tracking-tight">Assessment</p>
                  <p className="text-[10px] text-muted-foreground font-medium truncate max-w-[120px]">{serviceUserData.initialAssessment.name}</p>
                </div>
              </div>
            )}
            {serviceUserData.movingHandling && (
              <div className="p-4 rounded-xl bg-muted/20 border border-border/40 text-sm flex items-center gap-3" data-testid="text-moving-handling-doc">
                <div className="h-8 w-8 rounded-lg bg-background border border-border/60 flex items-center justify-center text-muted-foreground">
                  <FileText size={16} />
                </div>
                <div>
                  <p className="font-semibold text-foreground tracking-tight">Moving & Handling</p>
                  <p className="text-[10px] text-muted-foreground font-medium truncate max-w-[120px]">{serviceUserData.movingHandling.name}</p>
                </div>
              </div>
            )}
            {serviceUserData.additionalDocuments && serviceUserData.additionalDocuments.length > 0 && (
              <div className="p-4 rounded-xl bg-muted/20 border border-border/40 text-sm flex items-center gap-3" data-testid="text-additional-docs">
                <div className="h-8 w-8 rounded-lg bg-background border border-border/60 flex items-center justify-center text-muted-foreground">
                  <FileText size={16} />
                </div>
                <div>
                  <p className="font-semibold text-foreground tracking-tight">Additional Docs</p>
                  <p className="text-[10px] text-muted-foreground font-medium">
                    {serviceUserData.additionalDocuments.length} file{serviceUserData.additionalDocuments.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
            )}
            {serviceUserData.additionalNotes && serviceUserData.additionalNotes.trim().length > 0 && (
              <div className="p-4 rounded-xl bg-muted/20 border border-border/40 text-sm flex items-center gap-3" data-testid="text-additional-notes">
                <div className="h-8 w-8 rounded-lg bg-background border border-border/60 flex items-center justify-center text-muted-foreground">
                  <FileText size={16} />
                </div>
                <div>
                  <p className="font-semibold text-foreground tracking-tight">Additional Notes</p>
                  <p className="text-[10px] text-muted-foreground font-medium">
                    {serviceUserData.additionalNotes.trim().length.toLocaleString()} chars
                  </p>
                </div>
              </div>
            )}
          </div>
          
          {/* Pre-Analysis Panel (Rule-based, no AI cost) */}
          {(preAnalysis || isPreAnalyzing) && (
            <div className="p-5 bg-gradient-to-br from-success/10 to-success/5 border border-success/20 rounded-xl">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-success-700 flex items-center gap-2">
                  <Zap size={12} />
                  Quick Analysis
                  <Badge variant="outline" className="text-[8px] bg-success-100 border-success-300">NO AI COST</Badge>
                </h4>
                {isPreAnalyzing && <Loader2 size={14} className="animate-spin text-success-600" />}
              </div>
              
              {preAnalysis && (
                <div className="space-y-3">
                  {/* Risk Level */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">Overall Risk:</span>
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={preAnalysis.riskLevel === "High" ? "destructive" : preAnalysis.riskLevel === "Medium" ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {preAnalysis.riskLevel}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        ({Math.round(preAnalysis.riskConfidence * 100)}% confidence)
                      </span>
                    </div>
                  </div>
                  
                  {/* Extraction Quality */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">Data Quality:</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all ${preAnalysis.qualityScore >= 70 ? "bg-success" : preAnalysis.qualityScore >= 50 ? "bg-warning" : "bg-destructive/10"}`}
                          style={{ width: `${preAnalysis.qualityScore}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-semibold">{preAnalysis.qualityScore}%</span>
                    </div>
                  </div>
                  
                  {/* Recommended Assessments */}
                  {preAnalysis.recommendedAssessments && preAnalysis.recommendedAssessments.length > 0 && (
                    <div>
                      <span className="text-xs font-semibold text-muted-foreground block mb-1">Recommended Assessments:</span>
                      <div className="flex flex-wrap gap-1">
                        {preAnalysis.recommendedAssessments.slice(0, 4).map((assessment, i) => (
                          <Badge key={i} variant="outline" className="text-[9px] py-0">
                            {assessment.replace(" Risk Assessment", "")}
                          </Badge>
                        ))}
                        {preAnalysis.recommendedAssessments.length > 4 && (
                          <Badge variant="outline" className="text-[9px] py-0">
                            +{preAnalysis.recommendedAssessments.length - 4} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* AI Recommendation */}
                  <div className="pt-2 border-t border-success-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {preAnalysis.aiNeeded ? (
                        <>
                          <Sparkles size={12} className="text-primary" />
                          <span className="text-[10px] text-muted-foreground">AI enhancement recommended</span>
                        </>
                      ) : (
                        <>
                          <Check size={12} className="text-success-600" />
                          <span className="text-[10px] text-success-600 font-semibold">Good extraction quality</span>
                        </>
                      )}
                    </div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info size={12} className="text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs max-w-[200px]">{preAnalysis.aiReason}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              )}
            </div>
          )}
          
          <div className="p-5 bg-primary/5 border border-primary/10 rounded-2xl">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-3">Intelligence Scope</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-y-3 gap-x-6">
              {[
                "Personal Biography",
                "Strategic Goal Mapping",
                "Clinical Care Vectors",
                "Legal & Advance Directives",
                "Full-Spectrum Risk Matrix",
                "Operational Tiering (Bands)"
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <div className="h-1 w-1 rounded-full bg-primary/50" />
                  {item}
                </div>
              ))}
            </div>
          </div>
          
          <Button 
            onClick={() => enhanceMutation.mutate()}
            disabled={enhanceMutation.isPending || isAnyParsing()}
            className="w-full mt-2 h-12 rounded-xl font-medium tracking-tight bg-primary border-0"
            data-testid="button-enhance-plan"
          >
            {enhanceMutation.isPending ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                SYNTHESIZING COMPOSITE TEMPLATE...
              </>
            ) : (
              <>
                <Sparkles size={18} />
                GENERATE ENHANCED TEMPLATE
              </>
            )}
          </Button>

          {enhanceMutation.isPending && (
            <div className="space-y-4 p-5 bg-primary/5 border border-primary/10 rounded-2xl animate-pulse" data-testid="progress-container">
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
          
          {isAnyParsing() && (
            <p className="text-[10px] font-semibold text-warning uppercase tracking-widest text-center mt-2 animate-pulse">
              System busy: extracting document context...
            </p>
          )}
        </CardContent>
      </Card>

      {displayResult && (
        <div className="space-y-6 animate-slide-up">
            {/* Input truncation warning (large documents) */}
            {(displayResult as any)?._inputTruncated && (
              <Card className="app-surface border-warning/40 bg-warning/10">
                <CardContent className="py-4 space-y-2">
                  <p className="text-sm font-semibold text-warning flex items-center gap-2">
                    <AlertTriangle size={16} />
                    Large Documents Detected
                  </p>
                  <p className="text-sm text-warning">
                    {(displayResult as any)?._inputTruncationWarning || "Your uploaded documents were very large and were automatically truncated to fit API limits."}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    💡 For best results with large documents:
                  </p>
                  <ul className="text-xs text-muted-foreground list-disc list-inside space-y-1 ml-2">
                    <li>Split into multiple smaller PDFs (&lt; 50 pages each)</li>
                    <li>Upload only the most relevant documents</li>
                    <li>Summarize lengthy sections before pasting</li>
                    <li>Consider switching AI provider in Secret Admin for higher token limits</li>
                  </ul>
                </CardContent>
              </Card>
            )}
            
            {/* Truncation / quality warning banner */}
            {(displayResult as any)?._truncated && (
              <Card className="app-surface border-destructive/40 bg-destructive/10">
                <CardContent className="py-4 space-y-2">
                  <p className="text-sm font-semibold text-destructive flex items-center gap-2">
                    <AlertTriangle size={16} />
                    Incomplete Output Warning
                  </p>
                  <p className="text-sm text-destructive/80">
                    {(displayResult as any)?._truncationWarning || "The AI response may be incomplete. Some sections could be missing or cut short."}
                  </p>
                  {(displayResult as any)?._missingSections?.length > 0 && (
                    <p className="text-xs text-destructive/70">
                      Missing sections: {(displayResult as any)._missingSections.join(", ")}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Try regenerating with shorter input documents, or provide updates in the update box to focus the output.
                  </p>
                </CardContent>
              </Card>
            )}
            {(displayResult as any)?._qualityScore != null && (displayResult as any)._qualityScore < 50 && !(displayResult as any)?._truncated && (
              <Card className="app-surface border-warning/30 bg-warning/10">
                <CardContent className="py-4">
                  <p className="text-sm font-semibold text-warning flex items-center gap-2">
                    <AlertTriangle size={16} />
                    Low Quality Score: {(displayResult as any)._qualityScore}/100
                  </p>
                  <p className="text-xs text-warning mt-1">
                    Several sections did not meet minimum word count thresholds. Consider providing more detailed input documents.
                  </p>
                </CardContent>
              </Card>
            )}
            <div className="flex flex-wrap items-center justify-between gap-4 px-1">
              <h3 className="text-xl font-black tracking-tight text-foreground flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-success/15 flex items-center justify-center text-success">
                  <Check size={18} />
                </div>
                Composite Output
              </h3>
            
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="gap-2"
                onClick={exportPlanPdf}
                disabled={!displayResult}
                data-testid="button-export-plan-pdf"
              >
                <Download size={14} />
                Export PDF
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="gap-2 relative"
                onClick={sendToInitialAssessment}
                disabled={!displayResult}
                data-testid="button-send-to-initial-assessment"
              >
                <Send size={14} />
                Send to IA Form
                {verificationStats.total > 0 && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge 
                          variant="secondary" 
                          className="absolute -top-2 -right-2 h-5 min-w-5 p-0 flex items-center justify-center text-[10px] bg-warning text-white border-0"
                        >
                          {verificationStats.total}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p className="font-medium">{verificationStats.total} field(s) will need verification:</p>
                        <ul className="text-xs mt-1">
                          {verificationStats.missing > 0 && <li>• {verificationStats.missing} with "Information not provided"</li>}
                          {verificationStats.ambiguous > 0 && <li>• {verificationStats.ambiguous} with ambiguous yes/no answers</li>}
                        </ul>
                        <p className="text-xs mt-1 text-muted-foreground">These will be highlighted yellow on the form.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </Button>
              <Tabs value={viewMode} onValueChange={(v: string) => setViewMode(v as "enhanced" | "comparison")} className="bg-muted/20 p-1 rounded-xl border border-border/40">
                <TabsList className="bg-transparent border-0 h-9 p-0">
                  <TabsTrigger value="enhanced" className="rounded-lg font-semibold text-[10px] uppercase gap-2 h-7" data-testid="tab-enhanced-view">
                    <FileText size={12} />
                    Enhanced
                  </TabsTrigger>
                  <TabsTrigger value="comparison" className="rounded-lg font-semibold text-[10px] uppercase gap-2 h-7" data-testid="tab-comparison-view">
                    <Columns size={12} />
                    Comparison
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            </div>

          {displayResult.verificationQuestions && displayResult.verificationQuestions.length > 0 && (
            <Card className="app-surface border-warning/30 bg-warning/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-warning">Verification Needed</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-warning">
                <p className="text-xs text-warning">
                  Please confirm the items below in the update box above, then regenerate.
                </p>
                <ul className="list-disc list-inside space-y-1">
                  {displayResult.verificationQuestions.map((question, index) => (
                    <li key={`${question}-${index}`}>{question}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {viewMode === "comparison" && originalContent && (
            <Card className="app-surface overflow-hidden border-primary/20">
              <CardHeader className="border-b border-border/40 pb-6 bg-primary/5">
                <CardTitle className="text-base font-semibold flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Columns size={16} className="text-primary" />
                  </div>
                  Diff Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 pb-2 border-b border-border">
                      <div className="w-3 h-3 rounded-full bg-warning" />
                      <h4 className="font-semibold text-foreground">Original Documents</h4>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-4 max-h-[500px] overflow-y-auto">
                      <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
                        {originalContent.slice(0, 5000)}
                        {originalContent.length > 5000 && "\n\n... (truncated for display)"}
                      </pre>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 pb-2 border-b border-border">
                      <div className="w-3 h-3 rounded-full bg-success" />
                      <h4 className="font-semibold text-foreground">Enhanced Output</h4>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-4 max-h-[500px] overflow-y-auto">
                      <div className="text-xs text-muted-foreground space-y-3">
                        {displayResult.thisIsMe && (
                          <div>
                            <strong className="text-foreground">This Is Me:</strong>
                            <p className="mt-1">{displayResult.thisIsMe.whoAmI}</p>
                          </div>
                        )}
                        {displayResult.myCarePlan && (
                          <div>
                            <strong className="text-foreground">My Care Plan:</strong>
                            <p className="mt-1">{displayResult.myCarePlan.healthAndWellbeing}</p>
                          </div>
                        )}
                        {displayResult.goalSetting?.goals?.length > 0 && (
                          <div>
                            <strong className="text-foreground">Goals:</strong>
                            {displayResult.goalSetting.goals.map((g, i) => (
                              <p key={i} className="mt-1">• {g.goal}</p>
                            ))}
                          </div>
                        )}
                        <p className="text-xs text-primary italic mt-4">
                          See full enhanced content in the sections below
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* This Is Me */}
          <Section title="This Is Me" defaultOpen={true}>
            <TextBlock label="Who am I and what is important to me?" value={displayResult.thisIsMe?.whoAmI || ""} copyValue={copyResult?.thisIsMe?.whoAmI || ""} />
            <TextBlock label="What hobbies and interests do I have?" value={displayResult.thisIsMe?.hobbiesInterests || ""} copyValue={copyResult?.thisIsMe?.hobbiesInterests || ""} />
            <TextBlock label="What makes a good day for me?" value={displayResult.thisIsMe?.whatMakesGoodDay || ""} copyValue={copyResult?.thisIsMe?.whatMakesGoodDay || ""} />
          </Section>

          {/* Goal Setting */}
          <Section title="My Goal Setting">
            {displayResult.goalSetting?.goals?.map((g, idx) => (
              <div key={idx} className="p-3 bg-muted rounded-lg space-y-2">
                <FieldRow label="My Goal" value={g.goal} copyValue={copyResult?.goalSetting?.goals?.[idx]?.goal || ""} />
                <FieldRow label="How I will achieve it" value={g.howToAchieve} copyValue={copyResult?.goalSetting?.goals?.[idx]?.howToAchieve || ""} />
                <FieldRow label="Potential Barriers" value={g.potentialBarriers} copyValue={copyResult?.goalSetting?.goals?.[idx]?.potentialBarriers || ""} />
                <FieldRow label="Time Frame" value={g.timeFrame} copyValue={copyResult?.goalSetting?.goals?.[idx]?.timeFrame || ""} />
              </div>
            ))}
            <FieldRow label="Internet Support Required" value={displayResult.goalSetting?.internetSupport || ""} copyValue={copyResult?.goalSetting?.internetSupport || ""} />
            <FieldRow label="Assistive Technology" value={displayResult.goalSetting?.assistiveTechnology || ""} copyValue={copyResult?.goalSetting?.assistiveTechnology || ""} />
          </Section>

          {/* Advance Decisions */}
          <Section title="Advance Decisions / DNR / Lasting Power of Attorney">
            <FieldRow label="Advance Decision in Place" value={displayResult.advanceDecisions?.advanceDecisionInPlace || ""} copyValue={copyResult?.advanceDecisions?.advanceDecisionInPlace || ""} />
            <FieldRow label="DNR/Advance Decision Details" value={displayResult.advanceDecisions?.dnrDetails || ""} copyValue={copyResult?.advanceDecisions?.dnrDetails || ""} />
            <FieldRow label="Lasting Power of Attorney" value={displayResult.advanceDecisions?.lastingPOA || ""} copyValue={copyResult?.advanceDecisions?.lastingPOA || ""} />
            <FieldRow label="POA Type" value={displayResult.advanceDecisions?.poaType || ""} copyValue={copyResult?.advanceDecisions?.poaType || ""} />
            <FieldRow label="POA Contact" value={displayResult.advanceDecisions?.poaContact || ""} copyValue={copyResult?.advanceDecisions?.poaContact || ""} />
          </Section>

          {/* My Care Plan */}
          <Section title="My Care Plan" defaultOpen={true}>
            <TextBlock label="Capacity, Decision Making and Safeguarding" value={displayResult.myCarePlan?.capacityAndSafeguarding || ""} copyValue={copyResult?.myCarePlan?.capacityAndSafeguarding || ""} />
            <TextBlock label="My Health and Current Wellbeing" value={displayResult.myCarePlan?.healthAndWellbeing || ""} copyValue={copyResult?.myCarePlan?.healthAndWellbeing || ""} />
            <TextBlock label="Trigger Points to Alert to Potential Changes" value={displayResult.myCarePlan?.triggerPoints || ""} copyValue={copyResult?.myCarePlan?.triggerPoints || ""} />
            <TextBlock label="My Medication Requirements" value={displayResult.myCarePlan?.medicationRequirements || ""} copyValue={copyResult?.myCarePlan?.medicationRequirements || ""} />
            <TextBlock label="Nutrition (Dietary needs or preferences)" value={displayResult.myCarePlan?.nutrition || ""} copyValue={copyResult?.myCarePlan?.nutrition || ""} />
            <TextBlock label="My Personal Care Needs" value={displayResult.myCarePlan?.personalCareNeeds || ""} copyValue={copyResult?.myCarePlan?.personalCareNeeds || ""} />
            <TextBlock label="Mobility and Equipment / Methods" value={displayResult.myCarePlan?.mobilityAndEquipment || ""} copyValue={copyResult?.myCarePlan?.mobilityAndEquipment || ""} />
            <TextBlock label="Housework/Shopping and Social Support" value={displayResult.myCarePlan?.houseworkAndSocial || ""} copyValue={copyResult?.myCarePlan?.houseworkAndSocial || ""} />
            <TextBlock label="Financial Arrangements" value={displayResult.myCarePlan?.financialArrangements || ""} copyValue={copyResult?.myCarePlan?.financialArrangements || ""} />
          </Section>

          {/* Risk Section 1: Mental and Physical Health */}
          <Section title="Risk Assessment Section 1: Mental and Physical Health">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="font-medium text-foreground">Communication</h4>
                <FieldRow label="Speech" value={displayResult.riskSection1Health?.speech || ""} copyValue={copyResult?.riskSection1Health?.speech || ""} />
                <FieldRow label="Speech Details" value={displayResult.riskSection1Health?.speechDetails || ""} copyValue={copyResult?.riskSection1Health?.speechDetails || ""} />
                <FieldRow label="Hearing" value={displayResult.riskSection1Health?.hearing || ""} copyValue={copyResult?.riskSection1Health?.hearing || ""} />
                <FieldRow label="Hearing Details" value={displayResult.riskSection1Health?.hearingDetails || ""} copyValue={copyResult?.riskSection1Health?.hearingDetails || ""} />
                <FieldRow label="Eyesight" value={displayResult.riskSection1Health?.eyesight || ""} copyValue={copyResult?.riskSection1Health?.eyesight || ""} />
                <FieldRow label="Eyesight Details" value={displayResult.riskSection1Health?.eyesightDetails || ""} copyValue={copyResult?.riskSection1Health?.eyesightDetails || ""} />
              </div>
              <div className="space-y-2">
                <h4 className="font-medium text-foreground">General Health</h4>
                <FieldRow label="Breathlessness" value={displayResult.riskSection1Health?.breathlessness || ""} copyValue={copyResult?.riskSection1Health?.breathlessness || ""} />
                <FieldRow label="Details" value={displayResult.riskSection1Health?.breathlessnessDetails || ""} copyValue={copyResult?.riskSection1Health?.breathlessnessDetails || ""} />
                <FieldRow label="Urinary Incontinence" value={displayResult.riskSection1Health?.urinaryIncontinence || ""} copyValue={copyResult?.riskSection1Health?.urinaryIncontinence || ""} />
                <FieldRow label="Details" value={displayResult.riskSection1Health?.urinaryDetails || ""} copyValue={copyResult?.riskSection1Health?.urinaryDetails || ""} />
                <FieldRow label="Faecal Incontinence" value={displayResult.riskSection1Health?.faecalIncontinence || ""} copyValue={copyResult?.riskSection1Health?.faecalIncontinence || ""} />
                <FieldRow label="Details" value={displayResult.riskSection1Health?.faecalDetails || ""} copyValue={copyResult?.riskSection1Health?.faecalDetails || ""} />
              </div>
            </div>
            <div className="space-y-2 mt-4">
              <h4 className="font-medium text-foreground">Mental Health Assessment</h4>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <FieldRow label="Memory" value={displayResult.riskSection1Health?.memory || ""} copyValue={copyResult?.riskSection1Health?.memory || ""} />
                  <FieldRow label="Moods" value={displayResult.riskSection1Health?.moods || ""} copyValue={copyResult?.riskSection1Health?.moods || ""} />
                  <FieldRow label="Orientation" value={displayResult.riskSection1Health?.orientation || ""} copyValue={copyResult?.riskSection1Health?.orientation || ""} />
                </div>
                <div>
                  <FieldRow label="Sleep Pattern" value={displayResult.riskSection1Health?.sleepPattern || ""} copyValue={copyResult?.riskSection1Health?.sleepPattern || ""} />
                  <FieldRow label="Behaviours" value={displayResult.riskSection1Health?.behaviours || ""} copyValue={copyResult?.riskSection1Health?.behaviours || ""} />
                </div>
              </div>
            </div>
            <div className="space-y-2 mt-4">
              <h4 className="font-medium text-foreground">Mental Capacity Assessment</h4>
              <FieldRow label="Understands Information" value={displayResult.riskSection1Health?.understandsInfo || ""} copyValue={copyResult?.riskSection1Health?.understandsInfo || ""} />
              <FieldRow label="Retains Information" value={displayResult.riskSection1Health?.retainsInfo || ""} copyValue={copyResult?.riskSection1Health?.retainsInfo || ""} />
              <FieldRow label="Weighs Up Decision" value={displayResult.riskSection1Health?.weighsDecision || ""} copyValue={copyResult?.riskSection1Health?.weighsDecision || ""} />
              <FieldRow label="Communicates Decision" value={displayResult.riskSection1Health?.communicatesDecision || ""} copyValue={copyResult?.riskSection1Health?.communicatesDecision || ""} />
              <TextBlock label="Capacity Details" value={displayResult.riskSection1Health?.capacityDetails || ""} copyValue={copyResult?.riskSection1Health?.capacityDetails || ""} />
            </div>
            <div className="mt-4 p-3 bg-warning/10 border border-warning/30 dark:bg-warning/20 dark:border-warning/30 rounded-lg">
              <FieldRow label="Risk Level" value={displayResult.riskSection1Health?.riskLevel || ""} copyValue={copyResult?.riskSection1Health?.riskLevel || ""} />
              <TextBlock label="Risk Prevention" value={displayResult.riskSection1Health?.riskPrevention || ""} copyValue={copyResult?.riskSection1Health?.riskPrevention || ""} />
            </div>
          </Section>

          {/* Risk Section 2: Medication */}
          <Section title="Risk Assessment Section 2: Medication">
            <FieldRow label="Prescription Ordering" value={displayResult.riskSection2Medication?.prescriptionOrdering || ""} copyValue={copyResult?.riskSection2Medication?.prescriptionOrdering || ""} />
            <FieldRow label="Dosage System" value={displayResult.riskSection2Medication?.dosageSystem || ""} copyValue={copyResult?.riskSection2Medication?.dosageSystem || ""} />
            <FieldRow label="System Maintainer" value={displayResult.riskSection2Medication?.systemMaintainer || ""} copyValue={copyResult?.riskSection2Medication?.systemMaintainer || ""} />
            <FieldRow label="Medication Storage" value={displayResult.riskSection2Medication?.medicationStorage || ""} copyValue={copyResult?.riskSection2Medication?.medicationStorage || ""} />
            <FieldRow label="Current Investigations" value={displayResult.riskSection2Medication?.currentInvestigations || ""} copyValue={copyResult?.riskSection2Medication?.currentInvestigations || ""} />
            <FieldRow label="Surplus Medication" value={displayResult.riskSection2Medication?.surplusMedication || ""} copyValue={copyResult?.riskSection2Medication?.surplusMedication || ""} />
            <FieldRow label="Medication Concerns" value={displayResult.riskSection2Medication?.medicationConcerns || ""} copyValue={copyResult?.riskSection2Medication?.medicationConcerns || ""} />
            <FieldRow label="Homeopathic/OTC Meds" value={displayResult.riskSection2Medication?.homeopathicMeds || ""} copyValue={copyResult?.riskSection2Medication?.homeopathicMeds || ""} />
            <FieldRow label="PRN Medication" value={displayResult.riskSection2Medication?.prnMedication || ""} copyValue={copyResult?.riskSection2Medication?.prnMedication || ""} />
            <FieldRow label="Covert Medication" value={displayResult.riskSection2Medication?.covertMedication || ""} copyValue={copyResult?.riskSection2Medication?.covertMedication || ""} />
            <div className="mt-4">
              <h4 className="font-medium text-foreground mb-2">Medication Difficulties</h4>
              <div className="grid md:grid-cols-3 gap-2">
                <FieldRow label="Picking Up Tablets" value={displayResult.riskSection2Medication?.pickingUpTablets || ""} copyValue={copyResult?.riskSection2Medication?.pickingUpTablets || ""} />
                <FieldRow label="Opening Boxes" value={displayResult.riskSection2Medication?.openingBoxes || ""} copyValue={copyResult?.riskSection2Medication?.openingBoxes || ""} />
                <FieldRow label="Pouring Liquids" value={displayResult.riskSection2Medication?.pouringLiquids || ""} copyValue={copyResult?.riskSection2Medication?.pouringLiquids || ""} />
                <FieldRow label="Using Dosage System" value={displayResult.riskSection2Medication?.usingDosageSystem || ""} copyValue={copyResult?.riskSection2Medication?.usingDosageSystem || ""} />
                <FieldRow label="Applying Creams" value={displayResult.riskSection2Medication?.applyingCreams || ""} copyValue={copyResult?.riskSection2Medication?.applyingCreams || ""} />
                <FieldRow label="Swallowing Tablets" value={displayResult.riskSection2Medication?.swallowingTablets || ""} copyValue={copyResult?.riskSection2Medication?.swallowingTablets || ""} />
                <FieldRow label="Understanding Instructions" value={displayResult.riskSection2Medication?.understandingInstructions || ""} copyValue={copyResult?.riskSection2Medication?.understandingInstructions || ""} />
                <FieldRow label="Managing Inhalers" value={displayResult.riskSection2Medication?.managingInhalers || ""} copyValue={copyResult?.riskSection2Medication?.managingInhalers || ""} />
                <FieldRow label="Instilling Drops" value={displayResult.riskSection2Medication?.instillingDrops || ""} copyValue={copyResult?.riskSection2Medication?.instillingDrops || ""} />
              </div>
            </div>
            <FieldRow label="Controlled Drugs" value={displayResult.riskSection2Medication?.controlledDrugs || ""} copyValue={copyResult?.riskSection2Medication?.controlledDrugs || ""} />
            <FieldRow label="Warfarin" value={displayResult.riskSection2Medication?.warfarin || ""} copyValue={copyResult?.riskSection2Medication?.warfarin || ""} />
            <FieldRow label="Skin Integrity Risk" value={displayResult.riskSection2Medication?.skinIntegrity || ""} copyValue={copyResult?.riskSection2Medication?.skinIntegrity || ""} />
            <TextBlock label="Skin Details" value={displayResult.riskSection2Medication?.skinDetails || ""} copyValue={copyResult?.riskSection2Medication?.skinDetails || ""} />
            <div className="mt-4 p-3 bg-warning/10 border border-warning/30 dark:bg-warning/20 dark:border-warning/30 rounded-lg">
              <FieldRow label="Risk Level" value={displayResult.riskSection2Medication?.riskLevel || ""} copyValue={copyResult?.riskSection2Medication?.riskLevel || ""} />
              <TextBlock label="Risk Prevention" value={displayResult.riskSection2Medication?.riskPrevention || ""} copyValue={copyResult?.riskSection2Medication?.riskPrevention || ""} />
            </div>
          </Section>

          {/* Risk Section 3: Nutrition */}
          <Section title="Risk Assessment Section 3: Nutrition">
            <FieldRow label="Meal Assistance Required" value={displayResult.riskSection3Nutrition?.mealAssistance || ""} copyValue={copyResult?.riskSection3Nutrition?.mealAssistance || ""} />
            <FieldRow label="Normal Diet" value={displayResult.riskSection3Nutrition?.normalDiet || ""} copyValue={copyResult?.riskSection3Nutrition?.normalDiet || ""} />
            <FieldRow label="Special Dietary Requirements" value={displayResult.riskSection3Nutrition?.specialDietary || ""} copyValue={copyResult?.riskSection3Nutrition?.specialDietary || ""} />
            <FieldRow label="Food Allergies" value={displayResult.riskSection3Nutrition?.foodAllergies || ""} copyValue={copyResult?.riskSection3Nutrition?.foodAllergies || ""} />
            <FieldRow label="Soft Diet" value={displayResult.riskSection3Nutrition?.softDiet || ""} copyValue={copyResult?.riskSection3Nutrition?.softDiet || ""} />
            <FieldRow label="Food Intolerances" value={displayResult.riskSection3Nutrition?.foodIntolerances || ""} copyValue={copyResult?.riskSection3Nutrition?.foodIntolerances || ""} />
            <FieldRow label="Tube Feed" value={displayResult.riskSection3Nutrition?.tubeFeed || ""} copyValue={copyResult?.riskSection3Nutrition?.tubeFeed || ""} />
            <FieldRow label="Supplementary Foods/Thickeners" value={displayResult.riskSection3Nutrition?.supplementaryFoods || ""} copyValue={copyResult?.riskSection3Nutrition?.supplementaryFoods || ""} />
            <FieldRow label="Foods I Like" value={displayResult.riskSection3Nutrition?.foodLikes || ""} copyValue={copyResult?.riskSection3Nutrition?.foodLikes || ""} />
            <FieldRow label="Foods I Dislike" value={displayResult.riskSection3Nutrition?.foodDislikes || ""} copyValue={copyResult?.riskSection3Nutrition?.foodDislikes || ""} />
            <FieldRow label="Portion Size" value={displayResult.riskSection3Nutrition?.portionSize || ""} copyValue={copyResult?.riskSection3Nutrition?.portionSize || ""} />
            <FieldRow label="Preferred Main Meal Time" value={displayResult.riskSection3Nutrition?.mainMealTime || ""} copyValue={copyResult?.riskSection3Nutrition?.mainMealTime || ""} />
            <FieldRow label="Fluid Intake" value={displayResult.riskSection3Nutrition?.fluidIntake || ""} copyValue={copyResult?.riskSection3Nutrition?.fluidIntake || ""} />
            <div className="mt-4 p-3 bg-warning/10 border border-warning/30 dark:bg-warning/20 dark:border-warning/30 rounded-lg">
              <FieldRow label="Risk Level" value={displayResult.riskSection3Nutrition?.riskLevel || ""} copyValue={copyResult?.riskSection3Nutrition?.riskLevel || ""} />
              <TextBlock label="Risk Prevention" value={displayResult.riskSection3Nutrition?.riskPrevention || ""} copyValue={copyResult?.riskSection3Nutrition?.riskPrevention || ""} />
            </div>
          </Section>

          {/* Risk Section 4: Equipment */}
          <Section title="Risk Assessment Section 4: Equipment">
            {displayResult.riskSection4Equipment?.equipment?.map((eq, idx) => (
              <div key={idx} className="p-3 bg-muted rounded-lg space-y-2">
                <FieldRow label="Equipment" value={eq.name} copyValue={copyResult?.riskSection4Equipment?.equipment?.[idx]?.name || ""} />
                <FieldRow label="Fit For Purpose" value={eq.fitForPurpose} copyValue={copyResult?.riskSection4Equipment?.equipment?.[idx]?.fitForPurpose || ""} />
                <FieldRow label="Supplier" value={eq.supplier} copyValue={copyResult?.riskSection4Equipment?.equipment?.[idx]?.supplier || ""} />
                <FieldRow label="Next Service Date" value={eq.nextService} copyValue={copyResult?.riskSection4Equipment?.equipment?.[idx]?.nextService || ""} />
              </div>
            ))}
            <TextBlock label="Remedial Action" value={displayResult.riskSection4Equipment?.remedialAction || ""} copyValue={copyResult?.riskSection4Equipment?.remedialAction || ""} />
            <div className="mt-4 p-3 bg-warning/10 border border-warning/30 dark:bg-warning/20 dark:border-warning/30 rounded-lg">
              <FieldRow label="Risk Level" value={displayResult.riskSection4Equipment?.riskLevel || ""} copyValue={copyResult?.riskSection4Equipment?.riskLevel || ""} />
              <TextBlock label="Risk Prevention" value={displayResult.riskSection4Equipment?.riskPrevention || ""} copyValue={copyResult?.riskSection4Equipment?.riskPrevention || ""} />
            </div>
          </Section>

          {/* Risk Section 5: Mobility */}
          <Section title="Risk Assessment Section 5: Mobility">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <FieldRow label="Weight Bearing" value={displayResult.riskSection5Mobility?.weightBearing || ""} copyValue={copyResult?.riskSection5Mobility?.weightBearing || ""} />
                <FieldRow label="Details" value={displayResult.riskSection5Mobility?.weightBearingDetails || ""} copyValue={copyResult?.riskSection5Mobility?.weightBearingDetails || ""} />
                <FieldRow label="Walking" value={displayResult.riskSection5Mobility?.walking || ""} copyValue={copyResult?.riskSection5Mobility?.walking || ""} />
                <FieldRow label="Details" value={displayResult.riskSection5Mobility?.walkingDetails || ""} copyValue={copyResult?.riskSection5Mobility?.walkingDetails || ""} />
                <FieldRow label="Stairs" value={displayResult.riskSection5Mobility?.stairs || ""} copyValue={copyResult?.riskSection5Mobility?.stairs || ""} />
                <FieldRow label="Details" value={displayResult.riskSection5Mobility?.stairsDetails || ""} copyValue={copyResult?.riskSection5Mobility?.stairsDetails || ""} />
                <FieldRow label="Sit to Stand" value={displayResult.riskSection5Mobility?.sitToStand || ""} copyValue={copyResult?.riskSection5Mobility?.sitToStand || ""} />
                <FieldRow label="Details" value={displayResult.riskSection5Mobility?.sitToStandDetails || ""} copyValue={copyResult?.riskSection5Mobility?.sitToStandDetails || ""} />
              </div>
              <div>
                <FieldRow label="Washing" value={displayResult.riskSection5Mobility?.washing || ""} copyValue={copyResult?.riskSection5Mobility?.washing || ""} />
                <FieldRow label="Details" value={displayResult.riskSection5Mobility?.washingDetails || ""} copyValue={copyResult?.riskSection5Mobility?.washingDetails || ""} />
                <FieldRow label="Dressing" value={displayResult.riskSection5Mobility?.dressing || ""} copyValue={copyResult?.riskSection5Mobility?.dressing || ""} />
                <FieldRow label="Details" value={displayResult.riskSection5Mobility?.dressingDetails || ""} copyValue={copyResult?.riskSection5Mobility?.dressingDetails || ""} />
                <FieldRow label="Oral Care" value={displayResult.riskSection5Mobility?.oralCare || ""} copyValue={copyResult?.riskSection5Mobility?.oralCare || ""} />
                <FieldRow label="Details" value={displayResult.riskSection5Mobility?.oralCareDetails || ""} copyValue={copyResult?.riskSection5Mobility?.oralCareDetails || ""} />
                <FieldRow label="Bath/Shower" value={displayResult.riskSection5Mobility?.bathShower || ""} copyValue={copyResult?.riskSection5Mobility?.bathShower || ""} />
                <FieldRow label="Toilet/Commode" value={displayResult.riskSection5Mobility?.toiletCommode || ""} copyValue={copyResult?.riskSection5Mobility?.toiletCommode || ""} />
              </div>
            </div>
            <FieldRow label="Wheelchair" value={displayResult.riskSection5Mobility?.wheelchair || ""} copyValue={copyResult?.riskSection5Mobility?.wheelchair || ""} />
            <FieldRow label="Transfers" value={displayResult.riskSection5Mobility?.transfers || ""} copyValue={copyResult?.riskSection5Mobility?.transfers || ""} />
            <FieldRow label="Move in Bed" value={displayResult.riskSection5Mobility?.moveInBed || ""} copyValue={copyResult?.riskSection5Mobility?.moveInBed || ""} />
            <FieldRow label="In/Out of Bed" value={displayResult.riskSection5Mobility?.inOutOfBed || ""} copyValue={copyResult?.riskSection5Mobility?.inOutOfBed || ""} />
            <FieldRow label="Can Be Left Alone" value={displayResult.riskSection5Mobility?.canBeLeftAlone || ""} copyValue={copyResult?.riskSection5Mobility?.canBeLeftAlone || ""} />
            <FieldRow label="Prone to Falls" value={displayResult.riskSection5Mobility?.proneToFalls || ""} copyValue={copyResult?.riskSection5Mobility?.proneToFalls || ""} />
            <div className="mt-4 p-3 bg-warning/10 border border-warning/30 dark:bg-warning/20 dark:border-warning/30 rounded-lg">
              <FieldRow label="Risk Level" value={displayResult.riskSection5Mobility?.riskLevel || ""} copyValue={copyResult?.riskSection5Mobility?.riskLevel || ""} />
              <TextBlock label="Risk Prevention" value={displayResult.riskSection5Mobility?.riskPrevention || ""} copyValue={copyResult?.riskSection5Mobility?.riskPrevention || ""} />
            </div>
          </Section>

          {/* Risk Section 6: Appliances */}
          <Section title="Risk Assessment Section 6: Appliances/Equipment">
            <div className="grid md:grid-cols-3 gap-4">
              <FieldRow label="Cooker" value={displayResult.riskSection6Appliances?.cooker || ""} copyValue={copyResult?.riskSection6Appliances?.cooker || ""} />
              <FieldRow label="Microwave" value={displayResult.riskSection6Appliances?.microwave || ""} copyValue={copyResult?.riskSection6Appliances?.microwave || ""} />
              <FieldRow label="Iron" value={displayResult.riskSection6Appliances?.iron || ""} copyValue={copyResult?.riskSection6Appliances?.iron || ""} />
              <FieldRow label="Kettle" value={displayResult.riskSection6Appliances?.kettle || ""} copyValue={copyResult?.riskSection6Appliances?.kettle || ""} />
              <FieldRow label="Toaster" value={displayResult.riskSection6Appliances?.toaster || ""} copyValue={copyResult?.riskSection6Appliances?.toaster || ""} />
              <FieldRow label="Tumble Dryer" value={displayResult.riskSection6Appliances?.tumbleDryer || ""} copyValue={copyResult?.riskSection6Appliances?.tumbleDryer || ""} />
            </div>
            <FieldRow label="Floor Coverings" value={displayResult.riskSection6Appliances?.floorCoverings || ""} copyValue={copyResult?.riskSection6Appliances?.floorCoverings || ""} />
            <FieldRow label="Hand/Grab Rails" value={displayResult.riskSection6Appliances?.handRails || ""} copyValue={copyResult?.riskSection6Appliances?.handRails || ""} />
            <FieldRow label="Electric Blanket" value={displayResult.riskSection6Appliances?.electricBlanket || ""} copyValue={copyResult?.riskSection6Appliances?.electricBlanket || ""} />
            <FieldRow label="Bed" value={displayResult.riskSection6Appliances?.bed || ""} copyValue={copyResult?.riskSection6Appliances?.bed || ""} />
            <FieldRow label="Washing Machine" value={displayResult.riskSection6Appliances?.washingMachine || ""} copyValue={copyResult?.riskSection6Appliances?.washingMachine || ""} />
            <FieldRow label="Central Heating/Boiler" value={displayResult.riskSection6Appliances?.centralHeating || ""} copyValue={copyResult?.riskSection6Appliances?.centralHeating || ""} />
            <TextBlock label="Actions Required" value={displayResult.riskSection6Appliances?.actionsRequired || ""} copyValue={copyResult?.riskSection6Appliances?.actionsRequired || ""} />
          </Section>

          {/* Risk Section 7: Fire Safety */}
          <Section title="Risk Assessment Section 7: Fire Safety">
            <FieldRow label="At Risk of Fire" value={displayResult.riskSection7Fire?.atRisk || ""} copyValue={copyResult?.riskSection7Fire?.atRisk || ""} />
            <FieldRow label="Risk Reason" value={displayResult.riskSection7Fire?.riskReason || ""} copyValue={copyResult?.riskSection7Fire?.riskReason || ""} />
            <FieldRow label="RAG Rating" value={displayResult.riskSection7Fire?.ragRating || ""} copyValue={copyResult?.riskSection7Fire?.ragRating || ""} />
            <FieldRow label="Plug Sockets" value={displayResult.riskSection7Fire?.plugSockets || ""} copyValue={copyResult?.riskSection7Fire?.plugSockets || ""} />
            <FieldRow label="Electric Cables" value={displayResult.riskSection7Fire?.electricCables || ""} copyValue={copyResult?.riskSection7Fire?.electricCables || ""} />
            <FieldRow label="Smoking Policy Explained" value={displayResult.riskSection7Fire?.smokingPolicy || ""} copyValue={copyResult?.riskSection7Fire?.smokingPolicy || ""} />
            <FieldRow label="Smoke Alarm Location" value={displayResult.riskSection7Fire?.smokeAlarmLocation || ""} copyValue={copyResult?.riskSection7Fire?.smokeAlarmLocation || ""} />
            <FieldRow label="Smoke Alarm Working" value={displayResult.riskSection7Fire?.smokeAlarmWorking || ""} copyValue={copyResult?.riskSection7Fire?.smokeAlarmWorking || ""} />
            <FieldRow label="CO Detector Location" value={displayResult.riskSection7Fire?.coDetectorLocation || ""} copyValue={copyResult?.riskSection7Fire?.coDetectorLocation || ""} />
            <FieldRow label="CO Detector Working" value={displayResult.riskSection7Fire?.coDetectorWorking || ""} copyValue={copyResult?.riskSection7Fire?.coDetectorWorking || ""} />
            <FieldRow label="Can Evacuate Without Assistance" value={displayResult.riskSection7Fire?.canEvacuate || ""} copyValue={copyResult?.riskSection7Fire?.canEvacuate || ""} />
            <TextBlock label="Actions and Safety Measures" value={displayResult.riskSection7Fire?.actionsAndSafety || ""} copyValue={copyResult?.riskSection7Fire?.actionsAndSafety || ""} />
          </Section>

          {/* Risk Section 8: COSHH */}
          <Section title="Risk Assessment Section 8: COSHH">
            <FieldRow label="Cleaning Materials Storage" value={displayResult.riskSection8COSHH?.cleaningStorage || ""} copyValue={copyResult?.riskSection8COSHH?.cleaningStorage || ""} />
            <FieldRow label="RIDDOR Explained" value={displayResult.riskSection8COSHH?.riddorExplained || ""} copyValue={copyResult?.riskSection8COSHH?.riddorExplained || ""} />
          </Section>

          {/* Risk Section 9: External Safety */}
          <Section title="Risk Assessment Section 9: External Safe Working">
            <FieldRow label="Access" value={displayResult.riskSection9External?.access || ""} copyValue={copyResult?.riskSection9External?.access || ""} />
            <FieldRow label="Clear Pathways" value={displayResult.riskSection9External?.clearPathways || ""} copyValue={copyResult?.riskSection9External?.clearPathways || ""} />
            <FieldRow label="Handrails" value={displayResult.riskSection9External?.handrails || ""} copyValue={copyResult?.riskSection9External?.handrails || ""} />
            <FieldRow label="Entrance Steps" value={displayResult.riskSection9External?.entranceSteps || ""} copyValue={copyResult?.riskSection9External?.entranceSteps || ""} />
            <FieldRow label="Lighting" value={displayResult.riskSection9External?.lighting || ""} copyValue={copyResult?.riskSection9External?.lighting || ""} />
            <FieldRow label="Ramps" value={displayResult.riskSection9External?.ramps || ""} copyValue={copyResult?.riskSection9External?.ramps || ""} />
            <FieldRow label="Personal Security" value={displayResult.riskSection9External?.personalSecurity || ""} copyValue={copyResult?.riskSection9External?.personalSecurity || ""} />
            <FieldRow label="Parking" value={displayResult.riskSection9External?.parking || ""} copyValue={copyResult?.riskSection9External?.parking || ""} />
            <TextBlock label="Actions Required" value={displayResult.riskSection9External?.actionsRequired || ""} copyValue={copyResult?.riskSection9External?.actionsRequired || ""} />
            <div className="mt-4 p-3 bg-warning/10 border border-warning/30 dark:bg-warning/20 dark:border-warning/30 rounded-lg">
              <FieldRow label="Risk Level" value={displayResult.riskSection9External?.riskLevel || ""} copyValue={copyResult?.riskSection9External?.riskLevel || ""} />
              <TextBlock label="Risk Prevention" value={displayResult.riskSection9External?.riskPrevention || ""} copyValue={copyResult?.riskSection9External?.riskPrevention || ""} />
            </div>
          </Section>

          {/* Risk Section 10: Security */}
          <Section title="Risk Assessment Section 10: Security/Entry/Emergency Access">
            <FieldRow label="Means of Access" value={displayResult.riskSection10Security?.meansOfAccess || ""} copyValue={copyResult?.riskSection10Security?.meansOfAccess || ""} />
            <FieldRow label="Property Type" value={displayResult.riskSection10Security?.propertyType || ""} copyValue={copyResult?.riskSection10Security?.propertyType || ""} />
            <FieldRow label="Enter Using" value={displayResult.riskSection10Security?.enterUsing || ""} copyValue={copyResult?.riskSection10Security?.enterUsing || ""} />
            <FieldRow label="Keysafe Consent" value={displayResult.riskSection10Security?.keysafeConsent || ""} copyValue={copyResult?.riskSection10Security?.keysafeConsent || ""} />
            <FieldRow label="Gas Shut Off Location" value={displayResult.riskSection10Security?.gasShutOff || ""} copyValue={copyResult?.riskSection10Security?.gasShutOff || ""} />
            <FieldRow label="Stop Tap/Mains Location" value={displayResult.riskSection10Security?.stopTap || ""} copyValue={copyResult?.riskSection10Security?.stopTap || ""} />
            <FieldRow label="Fuse Box Location" value={displayResult.riskSection10Security?.fuseBox || ""} copyValue={copyResult?.riskSection10Security?.fuseBox || ""} />
            <div className="mt-4 p-3 bg-warning/10 border border-warning/30 dark:bg-warning/20 dark:border-warning/30 rounded-lg">
              <FieldRow label="Risk Level" value={displayResult.riskSection10Security?.riskLevel || ""} copyValue={copyResult?.riskSection10Security?.riskLevel || ""} />
              <TextBlock label="Risk Prevention" value={displayResult.riskSection10Security?.riskPrevention || ""} copyValue={copyResult?.riskSection10Security?.riskPrevention || ""} />
            </div>
          </Section>

          {/* Section 11: Service User Bands */}
          <Section title="Section 11: Service User Bands">
            <div className="grid md:grid-cols-3 gap-4">
              <FieldRow label="Personal Care" value={displayResult.section11Bands?.personalCare || ""} copyValue={copyResult?.section11Bands?.personalCare || ""} />
              <FieldRow label="Mental Health" value={displayResult.section11Bands?.mentalHealth || ""} copyValue={copyResult?.section11Bands?.mentalHealth || ""} />
              <FieldRow label="Physical Disability" value={displayResult.section11Bands?.physicalDisability || ""} copyValue={copyResult?.section11Bands?.physicalDisability || ""} />
              <FieldRow label="Dementia" value={displayResult.section11Bands?.dementia || ""} copyValue={copyResult?.section11Bands?.dementia || ""} />
              <FieldRow label="Eating Disorder" value={displayResult.section11Bands?.eatingDisorder || ""} copyValue={copyResult?.section11Bands?.eatingDisorder || ""} />
              <FieldRow label="Sensory Impairment" value={displayResult.section11Bands?.sensoryImpairment || ""} copyValue={copyResult?.section11Bands?.sensoryImpairment || ""} />
              <FieldRow label="Detained under MHA" value={displayResult.section11Bands?.detainedMHA || ""} copyValue={copyResult?.section11Bands?.detainedMHA || ""} />
              <FieldRow label="Drug/Alcohol Misuse" value={displayResult.section11Bands?.drugAlcoholMisuse || ""} copyValue={copyResult?.section11Bands?.drugAlcoholMisuse || ""} />
              <FieldRow label="Learning Difficulties" value={displayResult.section11Bands?.learningDifficulties || ""} copyValue={copyResult?.section11Bands?.learningDifficulties || ""} />
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}
