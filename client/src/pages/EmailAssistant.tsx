import { useCallback, useState, useMemo } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Mail, Sparkles, Copy, RefreshCw, Check, History, FileText, Trash2, Clock, Heading, ArrowRight } from "lucide-react";
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
  const [generateSubject] = useState(true);
  const [history, setHistory] = useState<RewriteHistoryEntry[]>(loadHistory);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  usePageTitle("Email Assistant");

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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to rewrite email";
      toast({ title: "Error", description: message, variant: "destructive" });
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
    <div className="page-shell page-shell-compact max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 animate-slide-up stagger-1">
        <div className="flex items-start gap-4">
          <div className="h-11 w-11 rounded-xl bg-primary/8 border border-primary/15 flex items-center justify-center shrink-0">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <div className="space-y-1">
            <h1 className="page-title leading-tight">Email Assistant</h1>
            <p className="page-subtitle">Refine raw care notes into clear, professional correspondence.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setTemplateOpen(true)}>
            <FileText className="h-4 w-4 mr-1.5" />
            Templates
          </Button>
          <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)} className="relative">
            <History className="h-4 w-4 mr-1.5" />
            History
            {history.length > 0 && (
              <Badge className="absolute -top-1.5 -right-1.5 h-[18px] min-w-[18px] px-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full leading-none flex items-center justify-center">
                {history.length}
              </Badge>
            )}
          </Button>
          {(inputText || outputText) && (
            <Button variant="ghost" size="icon-sm" onClick={clearAll} aria-label="Clear all content" className="text-muted-foreground">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8 mt-6 h-full animate-slide-up stagger-2">
        {/* Input Section */}
        <Card className="app-surface flex flex-col h-full overflow-hidden">
          <CardHeader className="border-b border-border/30 pb-5">
            <CardTitle className="flex items-center gap-3">
              <span className="h-7 w-7 rounded-lg bg-muted/80 flex items-center justify-center text-[11px] font-bold text-muted-foreground tabular-nums border border-border/40">1</span>
              Draft Input
            </CardTitle>
            <CardDescription>
              Enter rough bullet points or draft notes below.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-[400px] pt-5 relative">
            <Textarea
              id="email-draft-input"
              placeholder="e.g. update Sarah about missing medication logs, request an update by Friday, and check in on how her holiday went."
              className="h-full resize-none p-5 text-sm leading-relaxed bg-muted/15 border-border/30 rounded-xl focus:bg-background"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            {inputText && (
              <div className="absolute bottom-2.5 right-5 flex gap-3 text-[10px] font-medium text-muted-foreground tabular-nums">
                <span>{wordCount.input} words</span>
                <span>{charCount.input} chars</span>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-3 px-5 py-4 bg-muted/10 border-t border-border/30">
            <div className="flex items-center gap-3 w-full">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 whitespace-nowrap">Tone</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger className="h-8 text-xs flex-1">
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
            "app-surface flex flex-col h-full overflow-hidden transition-all duration-500",
            outputText ? "border-primary/25" : "opacity-75"
          )}>
            <CardHeader className="border-b border-border/30 pb-5 bg-primary/[0.03]">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-3 text-primary">
                  <span className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Sparkles size={14} />
                  </span>
                  Refined Draft
                </CardTitle>
                <div className="flex items-center gap-2">
                  {outputText && (
                    <>
                      <span className="text-[10px] font-medium text-muted-foreground tabular-nums">{wordCount.output} words</span>
                      <Badge variant="outline" className="bg-primary/8 text-primary border-primary/20 rounded-md font-bold text-[10px] tracking-wider px-2 py-0.5">
                        READY
                      </Badge>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>

            {/* Subject Line */}
            {subjectLine && (
              <div className="px-6 pt-4 pb-3 border-b border-border/20 bg-muted/5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Heading className="h-3 w-3 text-muted-foreground/50" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Subject</span>
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
                <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-background/70 backdrop-blur-sm">
                  <div className="relative">
                    <RefreshCw className="h-8 w-8 animate-spin text-primary/25" />
                    <Sparkles className="h-4 w-4 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-5">Preparing draft…</p>
                </div>
              )}

              <Textarea
                readOnly
                aria-label="Generated email output"
                className="h-full w-full resize-none border-0 focus-visible:ring-0 p-8 text-sm font-medium leading-relaxed bg-transparent text-foreground"
                placeholder={isProcessing ? "" : "Synthesized professional correspondence will appear here."}
                value={outputText}
              />
            </CardContent>
            <CardFooter className="px-5 py-4 flex gap-3 border-t border-border/30">
              <Button
                onClick={handleRewrite}
                className="flex-1 h-10 font-semibold tracking-tight group"
                disabled={isProcessing}
              >
                {outputText ? (
                  <><RefreshCw className="mr-2 h-4 w-4 group-hover:rotate-180 transition-transform duration-500"/> Refine Draft</>
                ) : (
                  <><Sparkles className="mr-2 h-4 w-4 animate-pulse"/> Rewrite Email</>
                )}
              </Button>
              {outputText && (
                <Button variant="outline" onClick={copyToClipboard} className="h-10 px-5 font-medium tracking-tight">
                  {copied ? <Check className="mr-2 h-4 w-4 text-success" /> : <Copy className="mr-2 h-4 w-4" />}
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
          <div className="flex-1 overflow-y-auto space-y-5 py-3">
            {uniqueCategories.map(category => (
              <div key={category}>
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2.5 px-1">{category}</h4>
                <div className="space-y-1.5">
                  {EMAIL_TEMPLATES.filter(t => t.category === category).map(template => (
                    <button
                      key={template.id}
                      className="w-full text-left px-4 py-3 rounded-lg border border-transparent hover:bg-muted/40 hover:border-border/40 transition-all group"
                      onClick={() => loadTemplate(template)}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <h5 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{template.label}</h5>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary/60 group-hover:translate-x-0.5 transition-all" />
                      </div>
                      <p className="text-xs text-muted-foreground/70 leading-relaxed line-clamp-2">{template.inputText}</p>
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
          <div className="flex-1 overflow-y-auto space-y-1.5 py-3">
            {history.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <div className="h-12 w-12 rounded-xl bg-muted/40 flex items-center justify-center mx-auto mb-3">
                  <Clock className="h-5 w-5 text-muted-foreground/40" />
                </div>
                <p className="text-[0.8125rem] font-medium">No history yet</p>
                <p className="text-[11px] mt-1 text-muted-foreground/70">Rewritten emails will appear here.</p>
              </div>
            ) : (
              history.map(entry => (
                <button
                  key={entry.id}
                  className="w-full text-left px-4 py-3 rounded-lg border border-transparent hover:bg-muted/40 hover:border-border/40 transition-all group"
                  onClick={() => loadFromHistory(entry)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <Badge variant="outline" className="text-[9px] font-semibold capitalize h-5">{entry.tone}</Badge>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
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


