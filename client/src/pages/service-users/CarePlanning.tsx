import { useState, useEffect, useRef } from "react";
import { useTemporaryData } from "@/context/TemporaryDataContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, ArrowRight, AlertTriangle, Loader2, CheckCircle2, Sparkles, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";
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
  const { toast } = useToast();
  const [carePlan, setCarePlan] = useState<CarePlanResult | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());
  const [copiedSection, setCopiedSection] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState("");
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const hasData = serviceUserData.socialWork || serviceUserData.initialAssessment;

  const generateMutation = useMutation({
    mutationFn: async () => {
      const documentContent = getAllDocumentContent();
      if (!documentContent.trim()) {
        throw new Error("No document content available");
      }

      setProgress(0);
      setProgressStatus("Preparing documents...");
      
      // Clear any existing care plan and prepare for incremental updates
      setCarePlan(null);
      const sectionsInProgress: CarePlanSection[] = [];

      const response = await fetch("/api/ai/generate-care-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ documentContent }),
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
      let result: CarePlanResult | null = null;

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
                console.log("[CarePlan] Section received:", data.section?.title);
                if (data.section && typeof data.index === 'number') {
                  sectionsInProgress[data.index] = data.section;
                  // Filter out undefined entries (sparse array)
                  const validSections = sectionsInProgress.filter((s): s is CarePlanSection => s !== undefined);
                  // Update care plan in real-time so user sees progress
                  setCarePlan(prev => ({
                    serviceUserInitials: prev?.serviceUserInitials || "N.N.",
                    generatedDate: prev?.generatedDate || new Date().toLocaleDateString("en-GB"),
                    sections: validSections,
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
                console.log("[CarePlan] Final result received");
                result = data;
              } else if (eventType === "error") {
                throw new Error(data.message);
              }
            } catch (parseErr) {
              console.error("SSE parse error:", parseErr, "data:", dataStr.substring(0, 100));
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
      console.log("[CarePlan] onSuccess called with data:", JSON.stringify(data).substring(0, 500));
      setProgress(100);
      setProgressStatus("Complete!");
      setTimeout(() => {
        setProgress(0);
        setProgressStatus("");
      }, 500);
      
      // Ensure sections is always an array
      const safeSections = Array.isArray(data?.sections) ? data.sections : [];
      const safeData: CarePlanResult = {
        serviceUserInitials: data?.serviceUserInitials || "N.N.",
        generatedDate: data?.generatedDate || new Date().toLocaleDateString("en-GB"),
        sections: safeSections,
        emergencyContacts: data?.emergencyContacts || "",
        gpDetails: data?.gpDetails || "",
        additionalNotes: data?.additionalNotes || "",
      };
      
      setCarePlan(safeData);
      setExpandedSections(new Set(safeSections.map((_: CarePlanSection, i: number) => i)));
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
    const text = `${section.title}\n\n${section.content}\n\nSteps:\n${section.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
    await navigator.clipboard.writeText(text);
    setCopiedSection(index);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const copyAllPlan = async () => {
    if (!carePlan) return;
    
    const fullPlan = carePlan.sections.map(section => 
      `=== ${section.title.toUpperCase()} ===\n\n${section.content}\n\nSteps:\n${section.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n${section.risks.length > 0 ? `Risks: ${section.risks.join(', ')}\n` : ''}${section.equipment.length > 0 ? `Equipment: ${section.equipment.join(', ')}\n` : ''}`
    ).join('\n\n---\n\n');
    
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-heading font-bold text-foreground" data-testid="text-page-title">Care Planning</h2>
          <p className="text-muted-foreground mt-2">
            Generate detailed, first-person care plans based on uploaded documentation.
          </p>
        </div>
        {carePlan && (
          <Button variant="outline" onClick={copyAllPlan} className="gap-2" data-testid="button-copy-all">
            <Copy size={16} /> Copy Full Plan
          </Button>
        )}
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
              {serviceUserData.socialWork.content && (
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
              {serviceUserData.initialAssessment.content && (
                <span className="text-xs text-muted-foreground ml-auto">
                  {serviceUserData.initialAssessment.content.length.toLocaleString()} chars
                </span>
              )}
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

          {Array.isArray(carePlan.sections) && carePlan.sections.filter(s => s != null).map((section, index) => (
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
                            <li key={eqIndex}>• {item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          ))}

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
