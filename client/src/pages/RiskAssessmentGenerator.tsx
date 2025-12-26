import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ShieldAlert, FileCheck, ArrowRight, Loader2, ClipboardCheck, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/AuthContext";

const templates = [
  { id: "falls", name: "Falls Risk Assessment (FRA-1)", description: "Standard comprehensive falls risk evaluation." },
  { id: "bedrails", name: "Bed Rails Safety Assessment", description: "Compliance check for bed rail usage." },
  { id: "moving", name: "Moving & Handling Profile", description: "Assessment of mobility needs and equipment." },
  { id: "skin", name: "Waterlow Score (Skin Integrity)", description: "Pressure ulcer risk assessment tool." },
  { id: "nutrition", name: "MUST (Malnutrition Universal Screening Tool)", description: "Nutritional status screening." },
];

const residents = [
  { id: "1", name: "Eleanor Rigby" },
  { id: "2", name: "Robert Smith" },
  { id: "3", name: "Mary Williams" },
];

export default function RiskAssessmentGenerator() {
  const { user } = useAuth();
  const [selectedResident, setSelectedResident] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAssessment, setGeneratedAssessment] = useState<null | any>(null);
  const [generationType, setGenerationType] = useState<"standard" | "enhanced">("standard");
  const [clickCount, setClickCount] = useState(0);
  const { toast } = useToast();

  const handleGenerate = () => {
    if (!selectedResident || !selectedTemplate) {
      toast({
        title: "Selection Missing",
        description: "Please select both a resident and a template type.",
        variant: "destructive"
      });
      return;
    }

    // Logic for double click detection for Admins
    if (user?.role === 'admin') {
      setClickCount(prev => prev + 1);
      
      // If it's the first click, set a timeout to reset
      if (clickCount === 0) {
        setTimeout(() => {
          setClickCount(0); // Reset after 1.5s
        }, 1500);
      }

      // If clicked twice within the window
      if (clickCount >= 1) { // This is the 2nd click
         setGenerationType("enhanced");
         setClickCount(0);
         proceedToGeneration("enhanced");
         return;
      }
    }

    // Default behavior
    setGenerationType("standard");
    proceedToGeneration("standard");
  };

  const proceedToGeneration = (type: "standard" | "enhanced") => {
    setIsGenerating(true);
    // Simulate AI generation delay
    setTimeout(() => {
      setIsGenerating(false);
      
      // Mock generated content based on type
      if (type === "enhanced") {
          // Full Assessment (Admin Secret)
          setGeneratedAssessment({
            resident: residents.find(r => r.id === selectedResident)?.name,
            type: templates.find(t => t.id === selectedTemplate)?.name,
            date: new Date().toLocaleDateString(),
            score: "High Risk (18/25)",
            isFull: true,
            content: `**AUTOMATED PRE-FILL BASED ON CARE PLAN DATA**

**1. History of Falls:** YES (2 in last 6 months)
*Source: Incident Log #442, #491*

**2. Secondary Diagnoses:**
- Type 2 Diabetes (Active)
- Early-stage Dementia (Active)
- Osteoarthritis (Active)

**3. Ambulatory Aid:**
- Uses Zimmer Frame (Constant)
- Furniture walking observed in room

**4. Mental Status:**
- Forgetful of limitations
- Oriented to person, but not always time/place

**RISK FACTOR ANALYSIS:**
The resident's combination of mobility impairment and cognitive decline significantly increases fall probability. Polypharmacy (4+ meds) is also a contributing factor noted in the Medication Plan.

**RECOMMENDED CONTROLS:**
- Sensor mat to be placed by bedside.
- Low-profiling bed setting at night.
- Hourly checks during active hours.
- Footwear review completed (Safe).`
          });
      } else {
          // Bullet Points Suggestions (Standard/Non-Admin)
          setGeneratedAssessment({
            resident: residents.find(r => r.id === selectedResident)?.name,
            type: templates.find(t => t.id === selectedTemplate)?.name,
            date: new Date().toLocaleDateString(),
            score: "Analysis Complete",
            isFull: false,
            content: `Based on the resident's records, the AI suggests considering the following points for your assessment:

*   **Falls History:** Check incident logs for recent falls (2 potential incidents found).
*   **Diagnoses:** Consider the impact of Diabetes and Dementia on balance and safety awareness.
*   **Equipment:** Verify if the Zimmer Frame is still suitable or if a review is needed.
*   **Mental State:** Note any recent confusion or forgetfulness regarding safety limitations.
*   **Controls to Consider:** 
    *   Sensor mats?
    *   Low-profiling beds?
    *   Review of footwear?`
          });
      }

      toast({
        title: "Assessment Generated",
        description: type === "enhanced" ? "Draft created successfully." : "Suggestions generated.",
      });
    }, 2000);
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-heading font-bold text-foreground">Risk Assessment Generator</h2>
        <p className="text-muted-foreground">Auto-generate comprehensive risk assessments by pulling data directly from service user care plans.</p>
      </div>
      
      {!generatedAssessment ? (
        <Card className="glass-card border-primary/20 shadow-lg">
          <CardHeader className="bg-primary/10 border-b border-primary/20">
            <CardTitle className="flex items-center gap-2 text-primary-foreground">
              <ShieldAlert className="text-primary" /> New Assessment Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Select Service User</Label>
                <Select onValueChange={setSelectedResident} value={selectedResident}>
                  <SelectTrigger className="bg-muted border-border text-foreground">
                    <SelectValue placeholder="Search resident..." />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border text-foreground">
                    {residents.map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">Assessment Template</Label>
                <Select onValueChange={setSelectedTemplate} value={selectedTemplate}>
                  <SelectTrigger className="bg-muted border-border text-foreground">
                    <SelectValue placeholder="Choose template..." />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border text-foreground">
                    {templates.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        <div className="flex flex-col items-start">
                          <span className="font-medium">{t.name}</span>
                          <span className="text-xs text-muted-foreground">{t.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="bg-blue-900/20 p-4 rounded-lg border border-blue-500/20 text-sm text-blue-300 flex gap-3">
              <FileCheck size={18} className="flex-shrink-0 mt-0.5" />
              <p>
                <strong>Smart-Fill Active:</strong> The system will scan the selected resident's Care Plan, Medical History, and Incident Logs to pre-populate this assessment with relevant evidence.
              </p>
            </div>
          </CardContent>
          <CardFooter className="bg-black/20 border-t border-white/5 p-6">
            <Button size="lg" className="w-full sm:w-auto ml-auto" onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing Care Data...
                </>
              ) : (
                <>
                  <ShieldAlert className="mr-2 h-4 w-4" /> Generate Assessment
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <div className="space-y-6 animate-in slide-in-from-bottom-8 duration-500">
           <Card className="glass-card border-emerald-500/30 shadow-md">
             <CardHeader className="bg-emerald-900/20 border-b border-emerald-500/20 pb-4">
               <div className="flex justify-between items-center">
                 <div className="space-y-1">
                   <CardTitle className="text-emerald-400">{generatedAssessment.isFull ? "Draft Generated Successfully" : "AI Suggestions Ready"}</CardTitle>
                   <CardDescription className="text-emerald-500/80">{generatedAssessment.isFull ? "Please review the auto-populated data before finalizing." : "Review these suggestions to help write your assessment."}</CardDescription>
                 </div>
                 <Badge variant="outline" className="border-emerald-500 text-emerald-400 bg-emerald-950/30">
                    {generatedAssessment.score}
                 </Badge>
               </div>
             </CardHeader>
             <CardContent className="pt-6 space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm mb-4 border-b border-border pb-4 text-muted-foreground">
                   <div>
                     <span className="text-muted-foreground">Resident:</span>
                     <p className="font-medium text-lg text-foreground">{generatedAssessment.resident}</p>
                   </div>
                   <div>
                     <span className="text-muted-foreground">Assessment Type:</span>
                     <p className="font-medium text-lg text-foreground">{generatedAssessment.type}</p>
                   </div>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-muted-foreground">{generatedAssessment.isFull ? "Assessment Content (Editable)" : "Suggested Points (Copy/Paste)"}</Label>
                  <Textarea 
                    value={generatedAssessment.content} 
                    className={`min-h-[300px] font-mono text-sm leading-relaxed bg-muted border-border text-foreground ${!generatedAssessment.isFull ? "opacity-90" : ""}`}
                    readOnly={!generatedAssessment.isFull}
                  />
                  {!generatedAssessment.isFull && (
                      <p className="text-xs text-muted-foreground mt-2 italic">
                          * These are AI-generated prompts. Please write the final assessment in your own professional voice.
                      </p>
                  )}
                </div>
             </CardContent>
             <CardFooter className="gap-3 pt-6 border-t border-border">
               {generatedAssessment.isFull ? (
                   <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                     <ClipboardCheck className="mr-2 h-4 w-4" /> Finalize & Sign
                   </Button>
               ) : (
                   <Button className="flex-1 bg-muted hover:bg-muted/80 text-foreground" disabled>
                     <Lock className="mr-2 h-4 w-4" /> Auto-Fill Locked
                   </Button>
               )}
               <Button variant="outline" className="flex-1 border-border text-muted-foreground hover:bg-muted" onClick={() => { setGeneratedAssessment(null); setClickCount(0); }}>
                 Discard & Restart
               </Button>
             </CardFooter>
           </Card>
        </div>
      )}
    </div>
  );
}
