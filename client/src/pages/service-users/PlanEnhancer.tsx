import { useState, useRef, useMemo } from "react";
import { useTemporaryData } from "@/context/TemporaryDataContext";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Sparkles, ArrowRight, Loader2, Copy, Check, ChevronDown, ChevronUp, Columns, FileText } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface CarePlanTemplate {
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

function CopyButton({ text, label }: { text: string; label?: string }) {
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
      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
    </Button>
  );
}

function FieldRow({ label, value, copyValue }: { label: string; value: string; copyValue?: string }) {
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
}

function TextBlock({ label, value, copyValue }: { label: string; value: string; copyValue?: string }) {
  if (!value) return null;
  const valueToCopy = copyValue ?? value;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground">{label}</h4>
        <CopyButton text={valueToCopy} label={label} />
      </div>
      <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted rounded-lg p-3">{value}</p>
    </div>
  );
}

function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="bg-card border-border">
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
}

export default function PlanEnhancer() {
  const { serviceUserData, getAllDocumentContent, isAnyParsing } = useTemporaryData();
  const { user } = useAuth();
  const { toast } = useToast();
  const [resultRaw, setResultRaw] = useState<CarePlanTemplate | null>(null);
  const [resultScrubbed, setResultScrubbed] = useState<CarePlanTemplate | null>(null);
  const [originalContent, setOriginalContent] = useState<string>("");
  const [viewMode, setViewMode] = useState<"enhanced" | "comparison">("enhanced");
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState("");
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [allowSensitive, setAllowSensitive] = useState(false);

  const isAdmin = user?.role === "admin";
  const showSensitive = isAdmin && allowSensitive;
  const displayResult = useMemo(
    () => (showSensitive && resultRaw ? resultRaw : resultScrubbed),
    [showSensitive, resultRaw, resultScrubbed]
  );
  const copyResult = resultScrubbed || resultRaw;

  const hasData = serviceUserData.carePlan || serviceUserData.socialWork || serviceUserData.initialAssessment;

  const enhanceMutation = useMutation({
    mutationFn: async () => {
      const documentContent = getAllDocumentContent();
      const carePlanContent = serviceUserData.carePlan?.content;
      
      if (!documentContent.trim() && !carePlanContent) {
        throw new Error("No document content available");
      }

      // Store the original content for comparison view
      const combinedOriginal = [
        carePlanContent ? `=== Original Care Plan ===\n${carePlanContent}` : "",
        documentContent ? `=== Supporting Documents ===\n${documentContent}` : ""
      ].filter(Boolean).join("\n\n");
      setOriginalContent(combinedOriginal);
      setResultRaw(null);
      setResultScrubbed(null);

      setProgress(0);
      setProgressStatus("Preparing documents...");

      const response = await fetch("/api/ai/enhance-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ 
          documentContent,
          existingPlanContent: carePlanContent,
          allowSensitive: isAdmin && allowSensitive
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

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response stream available");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let resultRaw: CarePlanTemplate | null = null;
      let resultScrubbed: CarePlanTemplate | null = null;

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

      return { raw: resultRaw, scrubbed: resultScrubbed || resultRaw };
    },
    onSuccess: ({ raw, scrubbed }) => {
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
      toast({
        title: "Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-6 animate-in fade-in zoom-in duration-500">
        <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center">
          <Sparkles size={48} className="text-muted-foreground" />
        </div>
        <div className="max-w-md space-y-2">
          <h2 className="text-2xl font-bold text-foreground" data-testid="text-no-data-title">No Data Available</h2>
          <p className="text-muted-foreground">
            Please upload documents to generate the care plan template.
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
      <div>
        <h2 className="text-3xl font-heading font-bold text-foreground" data-testid="text-page-title">Plan Enhancer</h2>
        <p className="text-muted-foreground mt-2">
          Generate a complete Initial Assessment/Care Plan template from uploaded documents.
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
            <Sparkles size={20} />
            Documents to Process
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {serviceUserData.carePlan && (
            <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-900/50 text-sm text-muted-foreground flex items-center gap-2" data-testid="text-care-plan-doc">
              {serviceUserData.carePlan.isParsing ? (
                <Loader2 size={16} className="animate-spin text-blue-400" />
              ) : (
                <Sparkles size={16} className="text-emerald-400" />
              )}
              <strong className="text-emerald-400">Care Plan:</strong> {serviceUserData.carePlan.name}
            </div>
          )}
          {serviceUserData.socialWork && (
            <div className="p-3 rounded-lg bg-background border border-border text-sm text-muted-foreground flex items-center gap-2" data-testid="text-social-work-doc">
              <strong>Social Work:</strong> {serviceUserData.socialWork.name}
            </div>
          )}
          {serviceUserData.initialAssessment && (
            <div className="p-3 rounded-lg bg-background border border-border text-sm text-muted-foreground flex items-center gap-2" data-testid="text-initial-assessment-doc">
              <strong>Initial Assessment:</strong> {serviceUserData.initialAssessment.name}
            </div>
          )}
          
          <div className="p-3 bg-blue-950/20 border border-blue-900/30 rounded-lg text-sm text-blue-300">
            <p>This will generate content for the complete care plan template:</p>
            <ul className="mt-2 space-y-1 text-xs grid grid-cols-2 gap-x-4">
              <li>• This Is Me section</li>
              <li>• My Goal Setting</li>
              <li>• My Care Plan</li>
              <li>• Advance Decisions</li>
              <li>• Risk Assessment Sections 1-11</li>
              <li>• Service User Bands</li>
            </ul>
          </div>
          
          <Button 
            onClick={() => enhanceMutation.mutate()}
            disabled={enhanceMutation.isPending || isAnyParsing()}
            className="w-full mt-4 gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-95 transition-opacity"
            data-testid="button-enhance-plan"
          >
            {enhanceMutation.isPending ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Generating Complete Template...
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Generate Care Plan Template
              </>
            )}
          </Button>

          {enhanceMutation.isPending && (
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

      {displayResult && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h3 className="text-xl font-semibold text-foreground flex items-center gap-2">
              <Check className="text-green-400" size={20} />
              Generated Care Plan Template
            </h3>
            
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "enhanced" | "comparison")}>
              <TabsList>
                <TabsTrigger value="enhanced" className="gap-2" data-testid="tab-enhanced-view">
                  <FileText size={14} />
                  Enhanced Only
                </TabsTrigger>
                <TabsTrigger value="comparison" className="gap-2" data-testid="tab-comparison-view">
                  <Columns size={14} />
                  Compare Before/After
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {viewMode === "comparison" && originalContent && (
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Columns size={18} />
                  Side-by-Side Comparison
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 pb-2 border-b border-border">
                      <div className="w-3 h-3 rounded-full bg-amber-500" />
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
                      <div className="w-3 h-3 rounded-full bg-green-500" />
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
                        <p className="text-xs text-blue-400 italic mt-4">
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
            <div className="mt-4 p-3 bg-amber-950/20 border border-amber-900/30 rounded-lg">
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
            <div className="mt-4 p-3 bg-amber-950/20 border border-amber-900/30 rounded-lg">
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
            <div className="mt-4 p-3 bg-amber-950/20 border border-amber-900/30 rounded-lg">
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
            <div className="mt-4 p-3 bg-amber-950/20 border border-amber-900/30 rounded-lg">
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
            <div className="mt-4 p-3 bg-amber-950/20 border border-amber-900/30 rounded-lg">
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
            <div className="mt-4 p-3 bg-amber-950/20 border border-amber-900/30 rounded-lg">
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
            <div className="mt-4 p-3 bg-amber-950/20 border border-amber-900/30 rounded-lg">
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
