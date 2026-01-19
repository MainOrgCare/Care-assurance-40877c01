import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, Sparkles, Copy, RefreshCw, Send, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";

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
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-heading font-bold" style={{ color: '#0f172a' }}>Email Professionalizer</h2>
        <p style={{ color: '#64748b' }}>Turn rough notes into polished, professional correspondence instantly.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-8 h-full">
        {/* Input Section */}
        <Card className="flex flex-col h-full shadow-sm" style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2" style={{ color: '#0f172a' }}>
              <span className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#f1f5f9', color: '#64748b' }}>1</span>
              Draft Your Message
            </CardTitle>
            <CardDescription style={{ color: '#64748b' }}>
              Enter your bullet points, rough notes, or draft text here.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-[300px]">
            <Textarea 
              placeholder="e.g. update Sarah about missing medication logs, request an update by Friday, and check in on how her holiday went."
              className="h-full resize-none p-4 text-base"
              style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', color: '#0f172a' }}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row gap-4 p-4" style={{ borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
             <div className="flex items-center gap-2 w-full">
               <Label className="text-xs whitespace-nowrap" style={{ color: '#64748b' }}>Tone:</Label>
               <Tabs defaultValue="professional" value={tone} onValueChange={setTone} className="w-full">
                <TabsList className="w-full grid grid-cols-3">
                  <TabsTrigger value="professional">Professional</TabsTrigger>
                  <TabsTrigger value="direct">Direct</TabsTrigger>
                  <TabsTrigger value="empathetic">Empathetic</TabsTrigger>
                </TabsList>
              </Tabs>
             </div>
          </CardFooter>
        </Card>

        {/* Output Section */}
        <div className="flex flex-col gap-4 h-full">
           <div className="flex justify-center items-center h-12 lg:hidden">
              <Button size="icon" variant="ghost" onClick={handleRewrite}>
                 <ArrowRightLeft className="rotate-90" />
              </Button>
           </div>
           
           <Card className="flex flex-col h-full shadow-md transition-all duration-500" style={{ backgroundColor: outputText ? '#ffffff' : '#f8fafc', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
            <CardHeader className="pb-4" style={{ backgroundColor: 'rgba(59, 130, 246, 0.05)', borderBottom: '1px solid rgba(59, 130, 246, 0.1)' }}>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2" style={{ color: '#3b82f6' }}>
                  <Sparkles size={18} /> Polished Output
                </CardTitle>
                {outputText && (
                  <Badge variant="outline" style={{ backgroundColor: '#ffffff', color: '#3b82f6', borderColor: 'rgba(59, 130, 246, 0.2)' }}>
                    Ready to Send
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0 relative">
              {isProcessing ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center backdrop-blur-sm z-10" style={{ backgroundColor: 'rgba(255, 255, 255, 0.5)' }}>
                  <RefreshCw className="h-8 w-8 animate-spin mb-4" style={{ color: '#3b82f6' }} />
                  <p className="text-sm font-medium animate-pulse" style={{ color: '#64748b' }}>Refining language...</p>
                </div>
              ) : null}
              
              <Textarea 
                readOnly
                className="h-full w-full resize-none border-0 focus-visible:ring-0 p-6 text-base leading-relaxed bg-transparent"
                style={{ color: '#0f172a' }}
                placeholder={isProcessing ? "" : "Your polished email will appear here..."}
                value={outputText}
              />
            </CardContent>
            <CardFooter className="p-4 flex gap-3" style={{ borderTop: '1px solid #e2e8f0', backgroundColor: '#ffffff' }}>
              <Button 
                onClick={handleRewrite} 
                className="flex-1 text-white" 
                style={{ backgroundColor: '#3b82f6' }}
                disabled={isProcessing}
              >
                {outputText ? <><RefreshCw className="mr-2 h-4 w-4"/> Try Again</> : <><Sparkles className="mr-2 h-4 w-4"/> Rewrite Magic</>}
              </Button>
              {outputText && (
                <Button variant="outline" onClick={copyToClipboard} style={{ borderColor: '#e2e8f0', color: '#334155' }}>
                  <Copy className="mr-2 h-4 w-4" /> Copy
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
