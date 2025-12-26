import { useState, useRef } from "react";
import { useTemporaryData } from "@/context/TemporaryDataContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight, Loader2, Copy, Check, ChevronDown, ChevronUp } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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

function FieldRow({ label, value }: { label: string; value: string }) {
  if (!value || value === "N/A") return null;
  return (
    <div className="flex justify-between items-start py-2 border-b border-border last:border-b-0">
      <span className="text-sm text-muted-foreground flex-shrink-0 mr-4">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm text-foreground text-right">{value}</span>
        <CopyButton text={value} label={label} />
      </div>
    </div>
  );
}

function TextBlock({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground">{label}</h4>
        <CopyButton text={value} label={label} />
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
  const { toast } = useToast();
  const [result, setResult] = useState<CarePlanTemplate | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState("");
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const hasData = serviceUserData.carePlan || serviceUserData.socialWork || serviceUserData.initialAssessment;

  const enhanceMutation = useMutation({
    mutationFn: async () => {
      const documentContent = getAllDocumentContent();
      const carePlanContent = serviceUserData.carePlan?.content;
      
      if (!documentContent.trim() && !carePlanContent) {
        throw new Error("No document content available");
      }

      setProgress(0);
      setProgressStatus("Preparing documents...");

      const response = await fetch("/api/ai/enhance-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ 
          documentContent,
          existingPlanContent: carePlanContent 
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
      let result: CarePlanTemplate | null = null;

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
              result = data;
            } else if (eventType === "error") {
              throw new Error(data.message);
            }
          }
        }
      }

      if (!result) {
        throw new Error("No result received from server");
      }

      return result;
    },
    onSuccess: (data) => {
      setProgress(100);
      setProgressStatus("Complete!");
      setTimeout(() => {
        setProgress(0);
        setProgressStatus("");
      }, 500);
      setResult(data);
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
            className="w-full mt-4 gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
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

      {result && (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Check className="text-green-400" size={20} />
            Generated Care Plan Template
          </h3>

          {/* This Is Me */}
          <Section title="This Is Me" defaultOpen={true}>
            <TextBlock label="Who am I and what is important to me?" value={result.thisIsMe?.whoAmI || ""} />
            <TextBlock label="What hobbies and interests do I have?" value={result.thisIsMe?.hobbiesInterests || ""} />
            <TextBlock label="What makes a good day for me?" value={result.thisIsMe?.whatMakesGoodDay || ""} />
          </Section>

          {/* Goal Setting */}
          <Section title="My Goal Setting">
            {result.goalSetting?.goals?.map((g, idx) => (
              <div key={idx} className="p-3 bg-muted rounded-lg space-y-2">
                <FieldRow label="My Goal" value={g.goal} />
                <FieldRow label="How I will achieve it" value={g.howToAchieve} />
                <FieldRow label="Potential Barriers" value={g.potentialBarriers} />
                <FieldRow label="Time Frame" value={g.timeFrame} />
              </div>
            ))}
            <FieldRow label="Internet Support Required" value={result.goalSetting?.internetSupport || ""} />
            <FieldRow label="Assistive Technology" value={result.goalSetting?.assistiveTechnology || ""} />
          </Section>

          {/* Advance Decisions */}
          <Section title="Advance Decisions / DNR / Lasting Power of Attorney">
            <FieldRow label="Advance Decision in Place" value={result.advanceDecisions?.advanceDecisionInPlace || ""} />
            <FieldRow label="DNR/Advance Decision Details" value={result.advanceDecisions?.dnrDetails || ""} />
            <FieldRow label="Lasting Power of Attorney" value={result.advanceDecisions?.lastingPOA || ""} />
            <FieldRow label="POA Type" value={result.advanceDecisions?.poaType || ""} />
            <FieldRow label="POA Contact" value={result.advanceDecisions?.poaContact || ""} />
          </Section>

          {/* My Care Plan */}
          <Section title="My Care Plan" defaultOpen={true}>
            <TextBlock label="Capacity, Decision Making and Safeguarding" value={result.myCarePlan?.capacityAndSafeguarding || ""} />
            <TextBlock label="My Health and Current Wellbeing" value={result.myCarePlan?.healthAndWellbeing || ""} />
            <TextBlock label="Trigger Points to Alert to Potential Changes" value={result.myCarePlan?.triggerPoints || ""} />
            <TextBlock label="My Medication Requirements" value={result.myCarePlan?.medicationRequirements || ""} />
            <TextBlock label="Nutrition (Dietary needs or preferences)" value={result.myCarePlan?.nutrition || ""} />
            <TextBlock label="My Personal Care Needs" value={result.myCarePlan?.personalCareNeeds || ""} />
            <TextBlock label="Mobility and Equipment / Methods" value={result.myCarePlan?.mobilityAndEquipment || ""} />
            <TextBlock label="Housework/Shopping and Social Support" value={result.myCarePlan?.houseworkAndSocial || ""} />
            <TextBlock label="Financial Arrangements" value={result.myCarePlan?.financialArrangements || ""} />
          </Section>

          {/* Risk Section 1: Mental and Physical Health */}
          <Section title="Risk Assessment Section 1: Mental and Physical Health">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="font-medium text-foreground">Communication</h4>
                <FieldRow label="Speech" value={result.riskSection1Health?.speech || ""} />
                <FieldRow label="Speech Details" value={result.riskSection1Health?.speechDetails || ""} />
                <FieldRow label="Hearing" value={result.riskSection1Health?.hearing || ""} />
                <FieldRow label="Hearing Details" value={result.riskSection1Health?.hearingDetails || ""} />
                <FieldRow label="Eyesight" value={result.riskSection1Health?.eyesight || ""} />
                <FieldRow label="Eyesight Details" value={result.riskSection1Health?.eyesightDetails || ""} />
              </div>
              <div className="space-y-2">
                <h4 className="font-medium text-foreground">General Health</h4>
                <FieldRow label="Breathlessness" value={result.riskSection1Health?.breathlessness || ""} />
                <FieldRow label="Details" value={result.riskSection1Health?.breathlessnessDetails || ""} />
                <FieldRow label="Urinary Incontinence" value={result.riskSection1Health?.urinaryIncontinence || ""} />
                <FieldRow label="Details" value={result.riskSection1Health?.urinaryDetails || ""} />
                <FieldRow label="Faecal Incontinence" value={result.riskSection1Health?.faecalIncontinence || ""} />
                <FieldRow label="Details" value={result.riskSection1Health?.faecalDetails || ""} />
              </div>
            </div>
            <div className="space-y-2 mt-4">
              <h4 className="font-medium text-foreground">Mental Health Assessment</h4>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <FieldRow label="Memory" value={result.riskSection1Health?.memory || ""} />
                  <FieldRow label="Moods" value={result.riskSection1Health?.moods || ""} />
                  <FieldRow label="Orientation" value={result.riskSection1Health?.orientation || ""} />
                </div>
                <div>
                  <FieldRow label="Sleep Pattern" value={result.riskSection1Health?.sleepPattern || ""} />
                  <FieldRow label="Behaviours" value={result.riskSection1Health?.behaviours || ""} />
                </div>
              </div>
            </div>
            <div className="space-y-2 mt-4">
              <h4 className="font-medium text-foreground">Mental Capacity Assessment</h4>
              <FieldRow label="Understands Information" value={result.riskSection1Health?.understandsInfo || ""} />
              <FieldRow label="Retains Information" value={result.riskSection1Health?.retainsInfo || ""} />
              <FieldRow label="Weighs Up Decision" value={result.riskSection1Health?.weighsDecision || ""} />
              <FieldRow label="Communicates Decision" value={result.riskSection1Health?.communicatesDecision || ""} />
              <TextBlock label="Capacity Details" value={result.riskSection1Health?.capacityDetails || ""} />
            </div>
            <div className="mt-4 p-3 bg-amber-950/20 border border-amber-900/30 rounded-lg">
              <FieldRow label="Risk Level" value={result.riskSection1Health?.riskLevel || ""} />
              <TextBlock label="Risk Prevention" value={result.riskSection1Health?.riskPrevention || ""} />
            </div>
          </Section>

          {/* Risk Section 2: Medication */}
          <Section title="Risk Assessment Section 2: Medication">
            <FieldRow label="Prescription Ordering" value={result.riskSection2Medication?.prescriptionOrdering || ""} />
            <FieldRow label="Dosage System" value={result.riskSection2Medication?.dosageSystem || ""} />
            <FieldRow label="System Maintainer" value={result.riskSection2Medication?.systemMaintainer || ""} />
            <FieldRow label="Medication Storage" value={result.riskSection2Medication?.medicationStorage || ""} />
            <FieldRow label="Current Investigations" value={result.riskSection2Medication?.currentInvestigations || ""} />
            <FieldRow label="Surplus Medication" value={result.riskSection2Medication?.surplusMedication || ""} />
            <FieldRow label="Medication Concerns" value={result.riskSection2Medication?.medicationConcerns || ""} />
            <FieldRow label="Homeopathic/OTC Meds" value={result.riskSection2Medication?.homeopathicMeds || ""} />
            <FieldRow label="PRN Medication" value={result.riskSection2Medication?.prnMedication || ""} />
            <FieldRow label="Covert Medication" value={result.riskSection2Medication?.covertMedication || ""} />
            <div className="mt-4">
              <h4 className="font-medium text-foreground mb-2">Medication Difficulties</h4>
              <div className="grid md:grid-cols-3 gap-2">
                <FieldRow label="Picking Up Tablets" value={result.riskSection2Medication?.pickingUpTablets || ""} />
                <FieldRow label="Opening Boxes" value={result.riskSection2Medication?.openingBoxes || ""} />
                <FieldRow label="Pouring Liquids" value={result.riskSection2Medication?.pouringLiquids || ""} />
                <FieldRow label="Using Dosage System" value={result.riskSection2Medication?.usingDosageSystem || ""} />
                <FieldRow label="Applying Creams" value={result.riskSection2Medication?.applyingCreams || ""} />
                <FieldRow label="Swallowing Tablets" value={result.riskSection2Medication?.swallowingTablets || ""} />
                <FieldRow label="Understanding Instructions" value={result.riskSection2Medication?.understandingInstructions || ""} />
                <FieldRow label="Managing Inhalers" value={result.riskSection2Medication?.managingInhalers || ""} />
                <FieldRow label="Instilling Drops" value={result.riskSection2Medication?.instillingDrops || ""} />
              </div>
            </div>
            <FieldRow label="Controlled Drugs" value={result.riskSection2Medication?.controlledDrugs || ""} />
            <FieldRow label="Warfarin" value={result.riskSection2Medication?.warfarin || ""} />
            <FieldRow label="Skin Integrity Risk" value={result.riskSection2Medication?.skinIntegrity || ""} />
            <TextBlock label="Skin Details" value={result.riskSection2Medication?.skinDetails || ""} />
            <div className="mt-4 p-3 bg-amber-950/20 border border-amber-900/30 rounded-lg">
              <FieldRow label="Risk Level" value={result.riskSection2Medication?.riskLevel || ""} />
              <TextBlock label="Risk Prevention" value={result.riskSection2Medication?.riskPrevention || ""} />
            </div>
          </Section>

          {/* Risk Section 3: Nutrition */}
          <Section title="Risk Assessment Section 3: Nutrition">
            <FieldRow label="Meal Assistance Required" value={result.riskSection3Nutrition?.mealAssistance || ""} />
            <FieldRow label="Normal Diet" value={result.riskSection3Nutrition?.normalDiet || ""} />
            <FieldRow label="Special Dietary Requirements" value={result.riskSection3Nutrition?.specialDietary || ""} />
            <FieldRow label="Food Allergies" value={result.riskSection3Nutrition?.foodAllergies || ""} />
            <FieldRow label="Soft Diet" value={result.riskSection3Nutrition?.softDiet || ""} />
            <FieldRow label="Food Intolerances" value={result.riskSection3Nutrition?.foodIntolerances || ""} />
            <FieldRow label="Tube Feed" value={result.riskSection3Nutrition?.tubeFeed || ""} />
            <FieldRow label="Supplementary Foods/Thickeners" value={result.riskSection3Nutrition?.supplementaryFoods || ""} />
            <FieldRow label="Foods I Like" value={result.riskSection3Nutrition?.foodLikes || ""} />
            <FieldRow label="Foods I Dislike" value={result.riskSection3Nutrition?.foodDislikes || ""} />
            <FieldRow label="Portion Size" value={result.riskSection3Nutrition?.portionSize || ""} />
            <FieldRow label="Preferred Main Meal Time" value={result.riskSection3Nutrition?.mainMealTime || ""} />
            <FieldRow label="Fluid Intake" value={result.riskSection3Nutrition?.fluidIntake || ""} />
            <div className="mt-4 p-3 bg-amber-950/20 border border-amber-900/30 rounded-lg">
              <FieldRow label="Risk Level" value={result.riskSection3Nutrition?.riskLevel || ""} />
              <TextBlock label="Risk Prevention" value={result.riskSection3Nutrition?.riskPrevention || ""} />
            </div>
          </Section>

          {/* Risk Section 4: Equipment */}
          <Section title="Risk Assessment Section 4: Equipment">
            {result.riskSection4Equipment?.equipment?.map((eq, idx) => (
              <div key={idx} className="p-3 bg-muted rounded-lg space-y-2">
                <FieldRow label="Equipment" value={eq.name} />
                <FieldRow label="Fit For Purpose" value={eq.fitForPurpose} />
                <FieldRow label="Supplier" value={eq.supplier} />
                <FieldRow label="Next Service Date" value={eq.nextService} />
              </div>
            ))}
            <TextBlock label="Remedial Action" value={result.riskSection4Equipment?.remedialAction || ""} />
            <div className="mt-4 p-3 bg-amber-950/20 border border-amber-900/30 rounded-lg">
              <FieldRow label="Risk Level" value={result.riskSection4Equipment?.riskLevel || ""} />
              <TextBlock label="Risk Prevention" value={result.riskSection4Equipment?.riskPrevention || ""} />
            </div>
          </Section>

          {/* Risk Section 5: Mobility */}
          <Section title="Risk Assessment Section 5: Mobility">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <FieldRow label="Weight Bearing" value={result.riskSection5Mobility?.weightBearing || ""} />
                <FieldRow label="Details" value={result.riskSection5Mobility?.weightBearingDetails || ""} />
                <FieldRow label="Walking" value={result.riskSection5Mobility?.walking || ""} />
                <FieldRow label="Details" value={result.riskSection5Mobility?.walkingDetails || ""} />
                <FieldRow label="Stairs" value={result.riskSection5Mobility?.stairs || ""} />
                <FieldRow label="Details" value={result.riskSection5Mobility?.stairsDetails || ""} />
                <FieldRow label="Sit to Stand" value={result.riskSection5Mobility?.sitToStand || ""} />
                <FieldRow label="Details" value={result.riskSection5Mobility?.sitToStandDetails || ""} />
              </div>
              <div>
                <FieldRow label="Washing" value={result.riskSection5Mobility?.washing || ""} />
                <FieldRow label="Details" value={result.riskSection5Mobility?.washingDetails || ""} />
                <FieldRow label="Dressing" value={result.riskSection5Mobility?.dressing || ""} />
                <FieldRow label="Details" value={result.riskSection5Mobility?.dressingDetails || ""} />
                <FieldRow label="Oral Care" value={result.riskSection5Mobility?.oralCare || ""} />
                <FieldRow label="Details" value={result.riskSection5Mobility?.oralCareDetails || ""} />
                <FieldRow label="Bath/Shower" value={result.riskSection5Mobility?.bathShower || ""} />
                <FieldRow label="Toilet/Commode" value={result.riskSection5Mobility?.toiletCommode || ""} />
              </div>
            </div>
            <FieldRow label="Wheelchair" value={result.riskSection5Mobility?.wheelchair || ""} />
            <FieldRow label="Transfers" value={result.riskSection5Mobility?.transfers || ""} />
            <FieldRow label="Move in Bed" value={result.riskSection5Mobility?.moveInBed || ""} />
            <FieldRow label="In/Out of Bed" value={result.riskSection5Mobility?.inOutOfBed || ""} />
            <FieldRow label="Can Be Left Alone" value={result.riskSection5Mobility?.canBeLeftAlone || ""} />
            <FieldRow label="Prone to Falls" value={result.riskSection5Mobility?.proneToFalls || ""} />
            <div className="mt-4 p-3 bg-amber-950/20 border border-amber-900/30 rounded-lg">
              <FieldRow label="Risk Level" value={result.riskSection5Mobility?.riskLevel || ""} />
              <TextBlock label="Risk Prevention" value={result.riskSection5Mobility?.riskPrevention || ""} />
            </div>
          </Section>

          {/* Risk Section 6: Appliances */}
          <Section title="Risk Assessment Section 6: Appliances/Equipment">
            <div className="grid md:grid-cols-3 gap-4">
              <FieldRow label="Cooker" value={result.riskSection6Appliances?.cooker || ""} />
              <FieldRow label="Microwave" value={result.riskSection6Appliances?.microwave || ""} />
              <FieldRow label="Iron" value={result.riskSection6Appliances?.iron || ""} />
              <FieldRow label="Kettle" value={result.riskSection6Appliances?.kettle || ""} />
              <FieldRow label="Toaster" value={result.riskSection6Appliances?.toaster || ""} />
              <FieldRow label="Tumble Dryer" value={result.riskSection6Appliances?.tumbleDryer || ""} />
            </div>
            <FieldRow label="Floor Coverings" value={result.riskSection6Appliances?.floorCoverings || ""} />
            <FieldRow label="Hand/Grab Rails" value={result.riskSection6Appliances?.handRails || ""} />
            <FieldRow label="Electric Blanket" value={result.riskSection6Appliances?.electricBlanket || ""} />
            <FieldRow label="Bed" value={result.riskSection6Appliances?.bed || ""} />
            <FieldRow label="Washing Machine" value={result.riskSection6Appliances?.washingMachine || ""} />
            <FieldRow label="Central Heating/Boiler" value={result.riskSection6Appliances?.centralHeating || ""} />
            <TextBlock label="Actions Required" value={result.riskSection6Appliances?.actionsRequired || ""} />
          </Section>

          {/* Risk Section 7: Fire Safety */}
          <Section title="Risk Assessment Section 7: Fire Safety">
            <FieldRow label="At Risk of Fire" value={result.riskSection7Fire?.atRisk || ""} />
            <FieldRow label="Risk Reason" value={result.riskSection7Fire?.riskReason || ""} />
            <FieldRow label="RAG Rating" value={result.riskSection7Fire?.ragRating || ""} />
            <FieldRow label="Plug Sockets" value={result.riskSection7Fire?.plugSockets || ""} />
            <FieldRow label="Electric Cables" value={result.riskSection7Fire?.electricCables || ""} />
            <FieldRow label="Smoking Policy Explained" value={result.riskSection7Fire?.smokingPolicy || ""} />
            <FieldRow label="Smoke Alarm Location" value={result.riskSection7Fire?.smokeAlarmLocation || ""} />
            <FieldRow label="Smoke Alarm Working" value={result.riskSection7Fire?.smokeAlarmWorking || ""} />
            <FieldRow label="CO Detector Location" value={result.riskSection7Fire?.coDetectorLocation || ""} />
            <FieldRow label="CO Detector Working" value={result.riskSection7Fire?.coDetectorWorking || ""} />
            <FieldRow label="Can Evacuate Without Assistance" value={result.riskSection7Fire?.canEvacuate || ""} />
            <TextBlock label="Actions and Safety Measures" value={result.riskSection7Fire?.actionsAndSafety || ""} />
          </Section>

          {/* Risk Section 8: COSHH */}
          <Section title="Risk Assessment Section 8: COSHH">
            <FieldRow label="Cleaning Materials Storage" value={result.riskSection8COSHH?.cleaningStorage || ""} />
            <FieldRow label="RIDDOR Explained" value={result.riskSection8COSHH?.riddorExplained || ""} />
          </Section>

          {/* Risk Section 9: External Safety */}
          <Section title="Risk Assessment Section 9: External Safe Working">
            <FieldRow label="Access" value={result.riskSection9External?.access || ""} />
            <FieldRow label="Clear Pathways" value={result.riskSection9External?.clearPathways || ""} />
            <FieldRow label="Handrails" value={result.riskSection9External?.handrails || ""} />
            <FieldRow label="Entrance Steps" value={result.riskSection9External?.entranceSteps || ""} />
            <FieldRow label="Lighting" value={result.riskSection9External?.lighting || ""} />
            <FieldRow label="Ramps" value={result.riskSection9External?.ramps || ""} />
            <FieldRow label="Personal Security" value={result.riskSection9External?.personalSecurity || ""} />
            <FieldRow label="Parking" value={result.riskSection9External?.parking || ""} />
            <TextBlock label="Actions Required" value={result.riskSection9External?.actionsRequired || ""} />
            <div className="mt-4 p-3 bg-amber-950/20 border border-amber-900/30 rounded-lg">
              <FieldRow label="Risk Level" value={result.riskSection9External?.riskLevel || ""} />
              <TextBlock label="Risk Prevention" value={result.riskSection9External?.riskPrevention || ""} />
            </div>
          </Section>

          {/* Risk Section 10: Security */}
          <Section title="Risk Assessment Section 10: Security/Entry/Emergency Access">
            <FieldRow label="Means of Access" value={result.riskSection10Security?.meansOfAccess || ""} />
            <FieldRow label="Property Type" value={result.riskSection10Security?.propertyType || ""} />
            <FieldRow label="Enter Using" value={result.riskSection10Security?.enterUsing || ""} />
            <FieldRow label="Keysafe Consent" value={result.riskSection10Security?.keysafeConsent || ""} />
            <FieldRow label="Gas Shut Off Location" value={result.riskSection10Security?.gasShutOff || ""} />
            <FieldRow label="Stop Tap/Mains Location" value={result.riskSection10Security?.stopTap || ""} />
            <FieldRow label="Fuse Box Location" value={result.riskSection10Security?.fuseBox || ""} />
            <div className="mt-4 p-3 bg-amber-950/20 border border-amber-900/30 rounded-lg">
              <FieldRow label="Risk Level" value={result.riskSection10Security?.riskLevel || ""} />
              <TextBlock label="Risk Prevention" value={result.riskSection10Security?.riskPrevention || ""} />
            </div>
          </Section>

          {/* Section 11: Service User Bands */}
          <Section title="Section 11: Service User Bands">
            <div className="grid md:grid-cols-3 gap-4">
              <FieldRow label="Personal Care" value={result.section11Bands?.personalCare || ""} />
              <FieldRow label="Mental Health" value={result.section11Bands?.mentalHealth || ""} />
              <FieldRow label="Physical Disability" value={result.section11Bands?.physicalDisability || ""} />
              <FieldRow label="Dementia" value={result.section11Bands?.dementia || ""} />
              <FieldRow label="Eating Disorder" value={result.section11Bands?.eatingDisorder || ""} />
              <FieldRow label="Sensory Impairment" value={result.section11Bands?.sensoryImpairment || ""} />
              <FieldRow label="Detained under MHA" value={result.section11Bands?.detainedMHA || ""} />
              <FieldRow label="Drug/Alcohol Misuse" value={result.section11Bands?.drugAlcoholMisuse || ""} />
              <FieldRow label="Learning Difficulties" value={result.section11Bands?.learningDifficulties || ""} />
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}
