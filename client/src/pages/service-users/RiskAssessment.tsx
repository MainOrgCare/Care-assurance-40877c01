import { useState, useEffect, useRef } from "react";
import { useTemporaryData } from "@/context/TemporaryDataContext";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { ShieldAlert, ArrowRight, Loader2, AlertTriangle, CheckCircle, FileText, Info } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

interface RecommendedAssessment {
  name: string;
  isMandatory: boolean;
  reason: string;
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
  const [analysis, setAnalysis] = useState<RiskAnalysis | null>(null);
  const [selectedAssessments, setSelectedAssessments] = useState<Set<string>>(new Set());
  const [showWarnings, setShowWarnings] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAssessments, setGeneratedAssessments] = useState<GeneratedAssessment[]>([]);
  const [step, setStep] = useState<"upload" | "analyze" | "select" | "generate" | "view">("upload");
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState("");

  const hasData = serviceUserData.initialAssessment || serviceUserData.socialWork || serviceUserData.carePlan;
  const hasAllParsed = hasData && !isAnyParsing();

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

      const response = await fetch("/api/ai/analyze-risks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ documentContent }),
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
      let result: RiskAnalysis | null = null;

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

      setProgress(100);
      setProgressStatus("Complete!");
      setAnalysis(result);
      setStep("select");
      
      // Auto-select mandatory assessments
      const mandatory = new Set<string>(
        result.recommendedAssessments
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
      const all = new Set(analysis.recommendedAssessments.map(a => a.name));
      setSelectedAssessments(all);
    }
  };

  const deselectAll = () => {
    setSelectedAssessments(new Set());
  };

  const getMandatoryNotSelected = (): string[] => {
    if (!analysis) return [];
    return analysis.recommendedAssessments
      .filter(a => a.isMandatory && !selectedAssessments.has(a.name))
      .map(a => a.name);
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
    const generated: GeneratedAssessment[] = [];
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
            serviceUserInitials: analysis?.serviceUser.initials,
            performedBy: user?.username,
            performedByJobTitle: user?.jobTitle || "Care Staff",
          }),
        });

        if (response.ok) {
          const reader = response.body?.getReader();
          if (reader) {
            const decoder = new TextDecoder();
            let buffer = "";
            let result: GeneratedAssessment | null = null;

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
                    result = data;
                  }
                }
              }
            }

            if (result) {
              generated.push(result);
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
          serviceUserInitials: analysis?.serviceUser.initials || "N.N.",
          performedBy: user?.username || "Unknown",
          performedByJobTitle: user?.jobTitle,
          offeredAssessments: analysis?.recommendedAssessments.map(a => a.name) || [],
          selectedAssessments: Array.from(selectedAssessments),
          skippedMandatory: getMandatoryNotSelected(),
          documentSummary: analysis?.documentSummary,
        }),
      });
    } catch (error) {
      console.error("Failed to log risk assessment:", error);
    }

    setGeneratedAssessments(generated);
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
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-muted-foreground">{serviceUserData.socialWork.name}</span>
                </div>
              )}
              {serviceUserData.initialAssessment && (
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-muted-foreground">{serviceUserData.initialAssessment.name}</span>
                </div>
              )}
              {serviceUserData.carePlan && (
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-muted-foreground">{serviceUserData.carePlan.name}</span>
                </div>
              )}
            </div>

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
        </div>

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

        {/* Assessment Selection */}
        <Card className="bg-card border-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recommended Risk Assessments</CardTitle>
                <CardDescription>
                  Select the assessments to generate. Mandatory assessments are pre-selected.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAll} data-testid="button-select-all">
                  Select All
                </Button>
                <Button variant="ghost" size="sm" onClick={deselectAll} data-testid="button-deselect-all">
                  Deselect All
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {analysis.recommendedAssessments.map((assessment, i) => (
                <div
                  key={i}
                  className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors ${
                    selectedAssessments.has(assessment.name)
                      ? "bg-blue-500/10 border-blue-500/30"
                      : "bg-muted border-border hover:border-muted-foreground/30"
                  }`}
                >
                  <Checkbox
                    id={`assessment-${i}`}
                    checked={selectedAssessments.has(assessment.name)}
                    onCheckedChange={() => toggleAssessment(assessment.name)}
                    data-testid={`checkbox-assessment-${i}`}
                  />
                  <div className="flex-1 min-w-0">
                    <Label
                      htmlFor={`assessment-${i}`}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <span className="text-foreground font-medium">{assessment.name}</span>
                      {assessment.isMandatory && (
                        <Badge variant="destructive" className="text-xs">Mandatory</Badge>
                      )}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">{assessment.reason}</p>
                  </div>
                </div>
              ))}
            </div>

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
              Selected: {selectedAssessments.size} of {analysis.recommendedAssessments.length} assessments
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
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-heading font-bold text-foreground">Risk Assessments</h2>
            <p className="text-muted-foreground mt-2">
              Generated {generatedAssessments.length} risk assessment{generatedAssessments.length !== 1 ? "s" : ""} for {analysis?.serviceUser.initials}
            </p>
          </div>
          <Button 
            variant="outline" 
            onClick={() => {
              setStep("select");
              setGeneratedAssessments([]);
            }}
            data-testid="button-back-to-select"
          >
            Generate More
          </Button>
        </div>

        {generatedAssessments.map((assessment, idx) => (
          <Card key={idx} className="bg-card border-border print:bg-white print:text-black">
            <CardHeader className="border-b border-border">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl">{assessment.category}</CardTitle>
                  <CardDescription>Risk Assessment</CardDescription>
                </div>
                <Badge variant="outline" className="text-lg">
                  {assessment.assessmentDate}
                </Badge>
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
