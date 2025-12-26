import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FileText, Sparkles, ArrowRight, RefreshCw, Wand2, Check, User, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";

export default function CarePlanEnhancer() {
  const { user } = useAuth();
  const [step, setStep] = useState<"upload" | "processing" | "review">("upload");
  const [generationType, setGenerationType] = useState<"standard" | "enhanced">("standard");
  const [clickCount, setClickCount] = useState(0);
  const { toast } = useToast();

  const handleEnhance = () => {
    // Logic for double click detection for Admins
    if (user?.role === 'admin') {
      setClickCount(prev => prev + 1);
      
      // If it's the first click, set a timeout to reset
      if (clickCount === 0) {
        setTimeout(() => {
          setClickCount(0); // Reset after 1.5s
          // If only clicked once in this window, proceed as standard (simulated by not returning early here, but actual processing happens below)
        }, 1500);
      }

      // If clicked twice within the window
      if (clickCount >= 1) { // This is the 2nd click (0 -> 1)
         setGenerationType("enhanced");
         setClickCount(0); // Reset immediately
         proceedToProcessing("enhanced");
         return;
      }
    }

    // Default behavior (single click or non-admin)
    // We delay slightly to see if a second click comes in for admins
    if (user?.role === 'admin') {
       // Wait slightly to ensure it's not a double click
       // In a real app we might debounce, but for this prototype we'll just let the "Standard" trigger if no second click happens quickly. 
       // For better UX in prototype, let's just trigger standard immediately on first click, and if they double click, we override/restart? 
       // Or simpler: Standard triggers on click. Double click is handled by the user clicking again quickly.
       setGenerationType("standard");
       proceedToProcessing("standard");
    } else {
       setGenerationType("standard");
       proceedToProcessing("standard");
    }
  };

  const proceedToProcessing = (type: "standard" | "enhanced") => {
    setStep("processing");
    setTimeout(() => {
      setStep("review");
      toast({
        title: type === "enhanced" ? "Enhancement Complete (Admin Mode)" : "Suggestions Generated",
        description: type === "enhanced" ? "Care plan rewritten to first-person narrative." : "AI suggestions ready for review.",
      });
    }, 3000);
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-heading font-bold text-foreground">AI Care Plan Enhancer</h2>
        <p className="text-muted-foreground">Upload existing care plans (PDF/Word) to automatically expand them into detailed, person-centered narratives.</p>
      </div>
      
      {step === "upload" && (
        <Card className={`glass-card border-2 border-dashed p-16 flex flex-col items-center justify-center text-center space-y-6 transition-colors border-border hover:bg-muted cursor-pointer`} onClick={handleEnhance}>
          <div className="h-20 w-20 bg-primary/10 text-primary rounded-full flex items-center justify-center shadow-sm">
            <Sparkles size={40} />
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl font-semibold text-foreground">Upload Current Care Plan</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Drag & drop your PDF or Docx file here. Our AI will analyze clinical notes and suggest person-centered improvements.
            </p>
          </div>
          <Button size="lg" className="gap-2">
            <Upload size={18} /> Select Document
          </Button>
        </Card>
      )}

      {step === "processing" && (
        <Card className="glass-card p-16 flex flex-col items-center justify-center text-center space-y-8">
          <div className="relative">
             <div className="h-20 w-20 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
             <div className="absolute inset-0 flex items-center justify-center text-primary">
                <Wand2 size={32} className="animate-pulse" />
             </div>
          </div>
          <div className="space-y-3 max-w-lg">
            <h3 className="text-2xl font-semibold text-foreground">Analyzing Content...</h3>
            <p className="text-muted-foreground">
              Scanning clinical terminology... <br/>
              Identifying key care needs... <br/>
              Generating improvement suggestions...
            </p>
          </div>
        </Card>
      )}

      {step === "review" && (
        <div className="grid lg:grid-cols-2 gap-6 animate-in slide-in-from-bottom-8 duration-500">
          {/* Original Source */}
          <Card className="glass-card border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-muted-foreground">
                <FileText size={18} /> Original Input (Excerpt)
              </CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground">
              <div className="p-4 bg-muted rounded-md border border-border text-sm font-mono leading-relaxed opacity-80 text-muted-foreground">
                <p><strong>Diagnosis:</strong> Dementia, T2 Diabetes.</p>
                <p><strong>Mobility:</strong> Needs zimmer frame. Fall risk high.</p>
                <p><strong>Nutrition:</strong> Low sugar diet. Assistance req for cutting food.</p>
                <p><strong>Personal Care:</strong> Full assist AM/PM. Prefers bath.</p>
                <p><strong>Social:</strong> Likes music. Family visits Sundays.</p>
                <p className="mt-4 text-xs italic opacity-50">[...extracted from uploaded PDF]</p>
              </div>
            </CardContent>
          </Card>

          {/* Enhanced Output - Conditional Rendering */}
          <Card className="glass-card border-primary/30 ring-1 ring-primary/10 shadow-lg">
            <CardHeader className="bg-primary/5 border-b border-primary/10 pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-primary">
                   <User size={20} /> {generationType === "enhanced" ? "Enhanced Person-Centered Plan" : "AI Improvement Suggestions"}
                </CardTitle>
                <Badge variant="outline" className="bg-transparent text-primary border-primary/30 gap-1">
                  <Check size={12} /> {generationType === "enhanced" ? "Human Tone Verified" : "Key Points Identified"}
                </Badge>
              </div>
              <CardDescription className="pt-2 text-muted-foreground">
                {generationType === "enhanced" 
                  ? "Rewritten in first-person to respect dignity and individuality." 
                  : "Consider incorporating these points into the care plan."}
              </CardDescription>
            </CardHeader>
            <CardContent className="prose prose-slate dark:prose-invert max-w-none pt-6 text-foreground">
              {generationType === "enhanced" ? (
                // ADMIN SECRET MODE: First Person Narrative
                <div className="space-y-4">
                  <div>
                    <h4 className="text-lg font-semibold text-foreground mb-2">My Mobility & Safety</h4>
                    <p className="leading-relaxed">
                      "I value my independence but understand I need a little support to stay safe. I use my <strong>zimmer frame</strong> to get around the home, which helps me feel steady. Please ensure it's always within my reach. Because I can be a bit unsteady on my feet, I appreciate having a staff member nearby when I'm moving about, just to offer a reassuring arm if I need it."
                    </p>
                  </div>
                  
                  <div className="bg-teal-950/30 p-4 rounded-lg border border-teal-900/50">
                    <h4 className="text-lg font-semibold text-teal-300 mb-2">My Meals & Drinking</h4>
                    <p className="leading-relaxed">
                      "To manage my diabetes, I follow a <strong>low-sugar diet</strong>, but I still enjoy my food! I'd appreciate it if you could <strong>cut up my meat and vegetables</strong> for me before serving, as it helps me eat independently and with dignity. I don't need to be fed, just given a little setup help."
                    </p>
                  </div>
  
                  <div>
                    <h4 className="text-lg font-semibold text-foreground mb-2">My Personal Routines</h4>
                    <p className="leading-relaxed">
                      "I prefer to have a <strong>bath</strong> rather than a shower, usually in the evenings as it helps me relax before bed. I need full assistance with washing and dressing to ensure I look and feel my best."
                    </p>
                  </div>
                </div>
              ) : (
                // STANDARD MODE: Bullet Points (AI Perspective)
                <div className="space-y-6">
                  <div>
                    <h4 className="text-lg font-semibold text-foreground mb-2">Mobility Considerations</h4>
                    <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                      <li>The resident uses a zimmer frame; ensure it is always accessible.</li>
                      <li>Consider mentioning their feelings about independence vs. safety.</li>
                      <li>High fall risk suggests staff should be nearby for support during transfers.</li>
                    </ul>
                  </div>

                  <div className="bg-muted p-4 rounded-lg border border-border">
                     <h4 className="text-lg font-semibold text-blue-300 mb-2">Dietary Needs</h4>
                     <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                        <li>Strict low-sugar diet due to T2 Diabetes.</li>
                        <li><strong>Action:</strong> Staff to assist with cutting food to promote independence.</li>
                        <li>Avoid feeding the resident unless necessary; focus on enablement.</li>
                     </ul>
                  </div>

                  <div>
                     <h4 className="text-lg font-semibold text-foreground mb-2">Personal Care Preferences</h4>
                     <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                        <li>Prefers baths over showers (evening routine suggested).</li>
                        <li>Requires full assistance for washing/dressing.</li>
                     </ul>
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter className="bg-muted border-t border-border pt-6 flex gap-3">
              <Button className="flex-1" onClick={() => toast({ title: "Saved", description: "Notes saved to profile."})}>
                Save Notes
              </Button>
              <Button variant="outline" className="flex-1 border-border text-muted-foreground hover:bg-muted" onClick={() => { setStep("upload"); setClickCount(0); }}>
                <RefreshCw className="mr-2 h-4 w-4" /> Start Over
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}
