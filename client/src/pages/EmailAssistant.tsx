import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, Sparkles, Copy, RefreshCw, Send, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export default function EmailAssistant() {
  const [inputText, setInputText] = useState("");
  const [tone, setTone] = useState("professional");
  const [isProcessing, setIsProcessing] = useState(false);
  const [outputText, setOutputText] = useState("");
  const { toast } = useToast();

  const handleRewrite = async () => {
    if (!inputText.trim()) {
      toast({
        title: "Input Required",
        description: "Please enter some text to rewrite.",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    
    try {
      const response = await fetch("/api/ai/rewrite-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ inputText, tone }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to rewrite email");
      }

      const data = await response.json();
      setOutputText(data.rewrittenEmail);
      
      toast({
        title: "Email Rewritten",
        description: `Your text has been polished with a ${tone} tone.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to rewrite email",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(outputText);
    toast({
      title: "Copied",
      description: "Email text copied to clipboard.",
    });
  };

  return (
    <div className="page-shell max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 animate-slide-up stagger-1">
        <div className="space-y-1">
          <h1 className="page-title leading-tight">Email Intelligence</h1>
          <p className="page-subtitle">Refine raw care notes into professional, high-fidelity correspondence.</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8 mt-6 h-full animate-slide-up stagger-2">
        {/* Input Section */}
        <Card className="glass-card flex flex-col h-full overflow-hidden">
          <CardHeader className="border-b border-border/40 pb-6">
            <CardTitle className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center border border-border/60 text-[10px] font-black">1</div>
              Draft Input
            </CardTitle>
            <CardDescription className="text-xs font-medium">
              Enter rough bullet points or conversational notes below.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-[400px] pt-6">
            <Textarea 
              placeholder="e.g. update Sarah about missing medication logs, request an update by Friday, and check in on how her holiday went."
              className="h-full resize-none p-5 text-sm font-medium leading-relaxed bg-muted/20 border-border/40 rounded-2xl"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
          </CardContent>
          <CardFooter className="flex flex-col gap-4 p-5 bg-muted/20 border-t border-border/40">
             <div className="flex items-center gap-4 w-full">
               <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground whitespace-nowrap">Tone Selection:</Label>
               <Tabs defaultValue="professional" value={tone} onValueChange={setTone} className="w-full">
                <TabsList className="w-full grid grid-cols-3 bg-background/50 border border-border/60 rounded-xl p-1 h-10">
                  <TabsTrigger value="professional" className="rounded-lg font-bold text-[10px] uppercase">Professional</TabsTrigger>
                  <TabsTrigger value="direct" className="rounded-lg font-bold text-[10px] uppercase">Direct</TabsTrigger>
                  <TabsTrigger value="empathetic" className="rounded-lg font-bold text-[10px] uppercase">Empathetic</TabsTrigger>
                </TabsList>
              </Tabs>
             </div>
          </CardFooter>
        </Card>

        {/* Output Section */}
        <div className="flex flex-col gap-4 h-full">
           <Card className={cn(
             "glass-card flex flex-col h-full overflow-hidden transition-all duration-700",
             outputText ? "border-primary/30 shadow-primary/5" : "opacity-80"
           )}>
            <CardHeader className="border-b border-border/40 pb-6 bg-primary/5">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-3 text-primary">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Sparkles size={16} />
                  </div>
                  Polished Intelligence
                </CardTitle>
                {outputText && (
                  <Badge className="bg-primary/15 text-primary border-primary/20 rounded-lg font-black text-[10px] tracking-widest px-2.5">
                    OPTIMIZED
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0 relative min-h-[400px]">
              {isProcessing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center glass-card z-10 border-0 rounded-none bg-background/60 backdrop-blur-md">
                  <div className="relative">
                    <RefreshCw className="h-10 w-10 animate-spin text-primary opacity-30" />
                    <Sparkles className="h-5 w-5 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-primary mt-6">Reconstructing Language...</p>
                </div>
              )}
              
              <Textarea 
                readOnly
                className="h-full w-full resize-none border-0 focus-visible:ring-0 p-8 text-sm font-medium leading-relaxed bg-transparent text-foreground"
                placeholder={isProcessing ? "" : "Synthesized professional correspondence will appear here."}
                value={outputText}
              />
            </CardContent>
            <CardFooter className="p-5 flex gap-4 bg-background border-t border-border/40">
              <Button 
                onClick={handleRewrite} 
                className="flex-1 h-12 rounded-xl font-bold tracking-tight shadow-glow group"
                disabled={isProcessing}
              >
                {outputText ? (
                  <><RefreshCw className="mr-2.5 h-4 w-4 group-hover:rotate-180 transition-transform duration-700"/> RE-REWRITE</>
                ) : (
                  <><Sparkles className="mr-2.5 h-4 w-4 animate-pulse"/> REWRITE magic</>
                )}
              </Button>
              {outputText && (
                <Button variant="outline" onClick={copyToClipboard} className="h-12 px-6 rounded-xl border-border/60 font-bold tracking-tight hover:bg-muted/50 transition-all">
                  <Copy className="mr-2.5 h-4 w-4" /> COPY
                </Button>
              )}
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Helper icon
function ArrowRightLeft({ className }: { className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="m16 3 4 4-4 4"/>
      <path d="M20 7H4"/>
      <path d="m8 21-4-4 4-4"/>
      <path d="M4 17h16"/>
    </svg>
  )
}
