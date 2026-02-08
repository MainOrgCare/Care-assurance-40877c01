import { useCallback, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Mail, Sparkles, Copy, RefreshCw, Check, History, FileText, Trash2, Clock, Heading, LetterText, ChevronDown, BookTemplate, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface RewriteHistoryEntry {
  id: string;
  inputText: string;
  outputText: string;
  tone: string;
  timestamp: Date;
  subjectLine?: string;
}

const EMAIL_TEMPLATES = [
  {
    id: "medication-update",
    label: "Medication Update",
    category: "Clinical",
    inputText: "Update about medication changes for [Service User]. New medication prescribed by GP. Need to coordinate with pharmacy and update EMAR records.",
  },
  {
    id: "incident-report",
    label: "Incident Report Follow-Up",
    category: "Compliance",
    inputText: "Following up on incident report from [date]. Summary of what happened, actions taken, and preventive measures put in place. No injuries sustained.",
  },
  {
    id: "family-update",
    label: "Family Update",
    category: "Communication",
    inputText: "Providing regular update to family about [Service User]'s wellbeing. Progress with care plan goals, recent activities, and any concerns to discuss.",
  },
  {
    id: "staff-rota",
    label: "Rota Change Notification",
    category: "Operations",
    inputText: "Informing about upcoming rota changes for next week. Shift swaps needed, new staff joining, and any cover requirements for annual leave.",
  },
  {
    id: "gp-referral",
    label: "GP Referral Request",
    category: "Clinical",
    inputText: "Requesting GP review for [Service User]. Presenting symptoms, changes in condition, and current interventions. Urgency level and preferred appointment time.",
  },
  {
    id: "training-invitation",
    label: "Training Invitation",
    category: "Operations",
    inputText: "Inviting staff to mandatory training session on [topic]. Date, time, location, duration, and what to prepare. Attendance is required for compliance.",
  },
  {
    id: "safeguarding-alert",
    label: "Safeguarding Alert",
    category: "Compliance",
    inputText: "Raising safeguarding concern regarding [Service User]. Nature of concern, observations made, actions already taken, and requesting guidance on next steps.",
  },
  {
    id: "complaint-response",
    label: "Complaint Acknowledgement",
    category: "Communication",
    inputText: "Acknowledging complaint received from [person]. Summary of their concerns, investigation being undertaken, expected timeline for resolution, and apology for any distress.",
  },
];

const TONE_OPTIONS = [
  { value: "professional", label: "Professional", description: "Formal business language" },
  { value: "direct", label: "Direct", description: "Clear and concise" },
  { value: "empathetic", label: "Empathetic", description: "Warm and supportive" },
  { value: "formal", label: "Formal", description: "Official and ceremonial" },
  { value: "urgent", label: "Urgent", description: "Time-critical emphasis" },
];

const HISTORY_KEY = "careassurance-email-history";

function loadHistory(): RewriteHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw).map((e: any) => ({ ...e, timestamp: new Date(e.timestamp) }));
  } catch { return []; }
}

function saveHistory(entries: RewriteHistoryEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, 50)));
}

export default function EmailAssistant() {
  const [inputText, setInputText] = useState("");
  const [tone, setTone] = useState("professional");
  const [isProcessing, setIsProcessing] = useState(false);
  const [outputText, setOutputText] = useState("");
  const [subjectLine, setSubjectLine] = useState("");
  const [generateSubject, setGenerateSubject] = useState(true);
  const [history, setHistory] = useState<RewriteHistoryEntry[]>(loadHistory);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const wordCount = useMemo(() => {
    const input = inputText.trim().split(/\s+/).filter(Boolean).length;
    const output = outputText.trim().split(/\s+/).filter(Boolean).length;
    return { input, output };
  }, [inputText, outputText]);

  const charCount = useMemo(() => ({
    input: inputText.length,
    output: outputText.length,
  }), [inputText, outputText]);

  const handleRewrite = useCallback(async () => {
    if (!inputText.trim()) {
      toast({ title: "Input Required", description: "Please enter some text to rewrite.", variant: "destructive" });
      return;
    }

    setIsProcessing(true);
    setCopied(false);

    try {
      const response = await fetch("/api/ai/rewrite-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ inputText, tone, generateSubject }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to rewrite email");
      }

      const data = await response.json();
      const rewritten = data.rewrittenEmail;

      // Try to extract subject line if present
      let extractedSubject = "";
      let emailBody = rewritten;
      const subjectMatch = rewritten.match(/^Subject:\s*(.+?)(?:\n|$)/i);
      if (subjectMatch) {
        extractedSubject = subjectMatch[1].trim();
        emailBody = rewritten.replace(/^Subject:\s*(.+?)(?:\n|$)/i, "").trim();
      }

      setOutputText(emailBody);
      if (extractedSubject) setSubjectLine(extractedSubject);

      // Save to history
      const entry: RewriteHistoryEntry = {
        id: Date.now().toString(),
        inputText: inputText.slice(0, 200),
        outputText: emailBody,
        tone,
        timestamp: new Date(),
        subjectLine: extractedSubject || undefined,
      };
      const updated = [entry, ...history].slice(0, 50);
      setHistory(updated);
      saveHistory(updated);

      toast({ title: "Email Rewritten", description: `Your text has been polished with a ${tone} tone.` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to rewrite email", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  }, [inputText, tone, generateSubject, toast, history]);

  const copyToClipboard = useCallback(() => {
    const fullText = subjectLine ? `Subject: ${subjectLine}\n\n${outputText}` : outputText;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    toast({ title: "Copied", description: "Email text copied to clipboard." });
    setTimeout(() => setCopied(false), 2000);
  }, [outputText, subjectLine, toast]);

  const loadFromHistory = useCallback((entry: RewriteHistoryEntry) => {
    setInputText(entry.inputText);
    setOutputText(entry.outputText);
    setTone(entry.tone);
    if (entry.subjectLine) setSubjectLine(entry.subjectLine);
    setHistoryOpen(false);
    toast({ title: "Loaded", description: "Previous draft restored from history." });
  }, [toast]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    saveHistory([]);
    toast({ title: "Cleared", description: "Email history has been cleared." });
  }, [toast]);

  const loadTemplate = useCallback((template: typeof EMAIL_TEMPLATES[0]) => {
    setInputText(template.inputText);
    setOutputText("");
    setSubjectLine("");
    setTemplateOpen(false);
    toast({ title: "Template Loaded", description: `"${template.label}" template applied.` });
  }, [toast]);

  const clearAll = useCallback(() => {
    setInputText("");
    setOutputText("");
    setSubjectLine("");
    setCopied(false);
  }, []);

  const uniqueCategories = useMemo(() => [...new Set(EMAIL_TEMPLATES.map(t => t.category))], []);

  return (
    <div className="page-shell max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 animate-slide-up stagger-1">
        <div className="space-y-1">
          <h1 className="page-title leading-tight">Email Assistant</h1>
          <p className="page-subtitle">Refine raw care notes into clear, professional correspondence.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setTemplateOpen(true)}>
            <FileText className="h-4 w-4 mr-2" />
            Templates
          </Button>
          <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)} className="relative">
            <History className="h-4 w-4 mr-2" />
            History
            {history.length > 0 && (
              <Badge className="absolute -top-2 -right-2 h-5 min-w-[1.25rem] px-1 bg-primary text-primary-foreground text-[10px] font-bold">
                {history.length}
              </Badge>
            )}
          </Button>
          {(inputText || outputText) && (
            <Button variant="ghost" size="sm" onClick={clearAll} className="text-muted-foreground">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
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
              Enter rough bullet points or draft notes below.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-[400px] pt-6 relative">
            <Textarea
              placeholder="e.g. update Sarah about missing medication logs, request an update by Friday, and check in on how her holiday went."
              className="h-full resize-none p-5 text-sm font-medium leading-relaxed bg-muted/20 border-border/40 rounded-2xl"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            {inputText && (
              <div className="absolute bottom-2 right-4 flex gap-3 text-[10px] font-semibold text-muted-foreground">
                <span>{wordCount.input} words</span>
                <span>{charCount.input} chars</span>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-4 p-5 bg-muted/20 border-t border-border/40">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground whitespace-nowrap">Tone:</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONE_OPTIONS.map(t => (
                    <SelectItem key={t.value} value={t.value}>
                      <div className="flex flex-col">
                        <span className="font-medium">{t.label}</span>
                        <span className="text-[10px] text-muted-foreground">{t.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  Refined Draft
                </CardTitle>
                <div className="flex items-center gap-2">
                  {outputText && (
                    <>
                      <span className="text-[10px] font-semibold text-muted-foreground">{wordCount.output} words</span>
                      <Badge className="bg-primary/15 text-primary border-primary/20 rounded-lg font-black text-[10px] tracking-widest px-2.5">
                        READY
                      </Badge>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>

            {/* Subject Line */}
            {subjectLine && (
              <div className="px-6 pt-4 pb-2 border-b border-border/30 bg-muted/10">
                <div className="flex items-center gap-2 mb-1">
                  <Heading className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Subject Line</span>
                </div>
                <Input
                  value={subjectLine}
                  onChange={e => setSubjectLine(e.target.value)}
                  className="border-0 bg-transparent p-0 h-auto text-sm font-semibold text-foreground focus-visible:ring-0 shadow-none"
                />
              </div>
            )}

            <CardContent className="flex-1 p-0 relative min-h-[360px]">
              {isProcessing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center glass-card z-10 border-0 rounded-none bg-background/60 backdrop-blur-md">
                  <div className="relative">
                    <RefreshCw className="h-10 w-10 animate-spin text-primary opacity-30" />
                    <Sparkles className="h-5 w-5 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-primary mt-6">Preparing draft...</p>
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
                className="flex-1 h-12 rounded-xl font-medium tracking-tight shadow-glow group"
                disabled={isProcessing}
              >
                {outputText ? (
                  <><RefreshCw className="mr-2.5 h-4 w-4 group-hover:rotate-180 transition-transform duration-700"/> Refine Draft</>
                ) : (
                  <><Sparkles className="mr-2.5 h-4 w-4 animate-pulse"/> Rewrite Email</>
                )}
              </Button>
              {outputText && (
                <Button variant="outline" onClick={copyToClipboard} className="h-12 px-6 rounded-xl border-border/60 font-medium tracking-tight hover:bg-muted/50 transition-all">
                  {copied ? <Check className="mr-2.5 h-4 w-4 text-success" /> : <Copy className="mr-2.5 h-4 w-4" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              )}
            </CardFooter>
          </Card>
        </div>
      </div>

      {/* Templates Dialog */}
      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent className="sm:max-w-xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Email Templates
            </DialogTitle>
            <DialogDescription>Quick-start with pre-written templates for common care communications.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-6 py-4">
            {uniqueCategories.map(category => (
              <div key={category}>
                <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 px-1">{category}</h4>
                <div className="space-y-2">
                  {EMAIL_TEMPLATES.filter(t => t.category === category).map(template => (
                    <button
                      key={template.id}
                      className="w-full text-left p-4 rounded-xl border border-border/50 bg-muted/10 hover:bg-muted/30 hover:border-primary/30 transition-all group"
                      onClick={() => loadTemplate(template)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <h5 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{template.label}</h5>
                        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{template.inputText}</p>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              Rewrite History
            </DialogTitle>
            <DialogDescription>Your recent email rewrites (stored locally).</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-2 py-4">
            {history.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Clock className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">No history yet</p>
                <p className="text-xs mt-1">Rewritten emails will appear here.</p>
              </div>
            ) : (
              history.map(entry => (
                <button
                  key={entry.id}
                  className="w-full text-left p-4 rounded-xl border border-border/50 bg-muted/10 hover:bg-muted/30 hover:border-primary/30 transition-all group"
                  onClick={() => loadFromHistory(entry)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <Badge variant="outline" className="text-[9px] font-bold capitalize">{entry.tone}</Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(entry.timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  {entry.subjectLine && (
                    <p className="text-xs font-semibold text-primary mt-1">{entry.subjectLine}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{entry.inputText}</p>
                </button>
              ))
            )}
          </div>
          {history.length > 0 && (
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={clearHistory} className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Clear History
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}


