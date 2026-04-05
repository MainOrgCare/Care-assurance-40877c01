import { useState, useMemo, useCallback, memo, useEffect } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck,
  Heart,
  UserCheck,
  Lightbulb,
  Building2,
  RotateCcw,
  Download,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// CQC Key Lines of Enquiry (KLOEs) with prompts
const CQC_DOMAINS = [
  {
    id: "safe",
    title: "Safe",
    icon: <ShieldCheck className="text-success" size={18} />,
    color: "green",
    description: "People are protected from abuse and avoidable harm.",
    questions: [
      { id: "safe-1", text: "Are people protected from abuse and neglect?", hint: "Consider safeguarding policies, training records, incident tracking." },
      { id: "safe-2", text: "Is care and treatment provided in a safe way?", hint: "Consider infection control, medication management, risk assessments." },
      { id: "safe-3", text: "Are there enough staff to keep people safe?", hint: "Consider staffing levels, vacancy rates, agency use." },
      { id: "safe-4", text: "How are risks to people assessed and managed?", hint: "Consider individual risk assessments, environmental audits." },
      { id: "safe-5", text: "How well are safety incidents managed and lessons learned?", hint: "Consider incident reporting, root cause analysis, action plans." },
    ],
  },
  {
    id: "effective",
    title: "Effective",
    icon: <Lightbulb className="text-primary" size={18} />,
    color: "blue",
    description: "Care, treatment, and support achieves good outcomes.",
    questions: [
      { id: "eff-1", text: "Are people's needs and preferences assessed and care planned?", hint: "Consider person-centred care plans, regular reviews." },
      { id: "eff-2", text: "Does the service use evidence-based guidance?", hint: "Consider NICE guidelines, best practice adoption." },
      { id: "eff-3", text: "Are outcomes for people monitored?", hint: "Consider health outcomes, wellbeing scores, goal tracking." },
      { id: "eff-4", text: "Is staff training and competency maintained?", hint: "Consider mandatory training %, supervision records." },
      { id: "eff-5", text: "Do staff, teams, and services work together?", hint: "Consider multi-disciplinary working, handover processes." },
    ],
  },
  {
    id: "caring",
    title: "Caring",
    icon: <Heart className="text-secondary/70" size={18} />,
    color: "pink",
    description: "Staff treat people with compassion, kindness, dignity, and respect.",
    questions: [
      { id: "car-1", text: "Are people treated with kindness, respect, and compassion?", hint: "Consider feedback, observation records, complaints." },
      { id: "car-2", text: "Are people supported to express their views?", hint: "Consider advocacy, communication aids, engagement." },
      { id: "car-3", text: "Are people's privacy and dignity respected?", hint: "Consider confidentiality practices, personal care dignity." },
      { id: "car-4", text: "Are carers supported and involved?", hint: "Consider family engagement, carer support plans." },
    ],
  },
  {
    id: "responsive",
    title: "Responsive",
    icon: <UserCheck className="text-secondary" size={18} />,
    color: "purple",
    description: "Services are organised so they meet people's needs.",
    questions: [
      { id: "res-1", text: "Are services personalised to each person?", hint: "Consider person-centred approaches, flexible scheduling." },
      { id: "res-2", text: "Do people know how to raise concerns or complaints?", hint: "Consider complaints procedure, response times, outcomes." },
      { id: "res-3", text: "Are people's end of life needs met?", hint: "Consider advance care planning, palliative care training." },
      { id: "res-4", text: "Are services accessible to all who need them?", hint: "Consider equity, reasonable adjustments, waiting times." },
    ],
  },
  {
    id: "well-led",
    title: "Well-Led",
    icon: <Building2 className="text-warning" size={18} />,
    color: "amber",
    description: "Leadership, management, and governance assures high-quality care.",
    questions: [
      { id: "led-1", text: "Is there a clear vision and credible strategy?", hint: "Consider business plan, values, staff awareness." },
      { id: "led-2", text: "Are governance structures effective?", hint: "Consider audits, governance meetings, action tracking." },
      { id: "led-3", text: "Are leaders visible and promote a positive culture?", hint: "Consider staff engagement, open door policy, recognition." },
      { id: "led-4", text: "Is continuous learning and improvement embedded?", hint: "Consider quality improvement initiatives, innovation." },
      { id: "led-5", text: "Are partnerships and community relationships maintained?", hint: "Consider commissioner relationships, stakeholder engagement." },
    ],
  },
];

const RATING_OPTIONS = [
  { value: "outstanding", label: "Outstanding", color: "bg-success text-white" },
  { value: "good", label: "Good", color: "bg-success/80 text-white" },
  { value: "requires_improvement", label: "Requires Improvement", color: "bg-warning text-white" },
  { value: "inadequate", label: "Inadequate", color: "bg-destructive text-white" },
  { value: "not_assessed", label: "Not Assessed", color: "bg-muted text-muted-foreground" },
];

type Assessment = {
  ratings: Record<string, string>; // questionId -> rating value
  evidence: Record<string, string>; // questionId -> evidence notes
  lastUpdated: string;
};

const STORAGE_KEY = "cqc-self-assessment";

function loadAssessment(): Assessment {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { ratings: {}, evidence: {}, lastUpdated: new Date().toISOString() };
}

function saveAssessment(assessment: Assessment) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...assessment, lastUpdated: new Date().toISOString() }));
}

const RatingBadge = memo(function RatingBadge({ value }: { value: string }) {
  const opt = RATING_OPTIONS.find((o) => o.value === value);
  if (!opt) return null;
  return (
    <Badge className={`${opt.color} text-[10px] font-semibold`}>{opt.label}</Badge>
  );
});

function CQCSelfAssessment() {
  const { toast } = useToast();
  usePageTitle("CQC Self-Assessment");
  const [assessment, setAssessment] = useState<Assessment>(loadAssessment);
  const [expandedDomain, setExpandedDomain] = useState<string | null>("safe");

  // Auto-save whenever assessment changes
  useEffect(() => {
    saveAssessment(assessment);
  }, [assessment]);

  const setRating = useCallback((questionId: string, rating: string) => {
    setAssessment((prev) => ({
      ...prev,
      ratings: { ...prev.ratings, [questionId]: rating },
    }));
  }, []);

  const setEvidence = useCallback((questionId: string, text: string) => {
    setAssessment((prev) => ({
      ...prev,
      evidence: { ...prev.evidence, [questionId]: text },
    }));
  }, []);

  const resetAssessment = useCallback(() => {
    setAssessment({ ratings: {}, evidence: {}, lastUpdated: new Date().toISOString() });
    toast({ title: "Assessment Reset", description: "All ratings and evidence have been cleared." });
  }, [toast]);

  // Calculate domain scores
  const domainScores = useMemo(() => {
    const scoreMap: Record<string, { total: number; rated: number; score: number; overall: string }> = {};
    for (const domain of CQC_DOMAINS) {
      const questions = domain.questions;
      let rated = 0;
      let scoreSum = 0;
      for (const q of questions) {
        const r = assessment.ratings[q.id];
        if (r && r !== "not_assessed") {
          rated++;
          if (r === "outstanding") scoreSum += 4;
          else if (r === "good") scoreSum += 3;
          else if (r === "requires_improvement") scoreSum += 2;
          else if (r === "inadequate") scoreSum += 1;
        }
      }
      const avg = rated > 0 ? scoreSum / rated : 0;
      const overall = avg >= 3.5 ? "outstanding" : avg >= 2.5 ? "good" : avg >= 1.5 ? "requires_improvement" : rated > 0 ? "inadequate" : "not_assessed";
      scoreMap[domain.id] = { total: questions.length, rated, score: avg, overall };
    }
    return scoreMap;
  }, [assessment.ratings]);

  const totalQuestions = CQC_DOMAINS.reduce((sum, d) => sum + d.questions.length, 0);
  const answeredQuestions = Object.values(assessment.ratings).filter((r) => r && r !== "not_assessed").length;
  const completionPct = Math.round((answeredQuestions / totalQuestions) * 100);

  const exportAssessment = useCallback(() => {
    const lines: string[] = [
      "CQC SELF-ASSESSMENT REPORT",
      `Generated: ${new Date().toLocaleString("en-GB")}`,
      `Completion: ${answeredQuestions}/${totalQuestions} (${completionPct}%)`,
      "",
    ];
    for (const domain of CQC_DOMAINS) {
      const score = domainScores[domain.id];
      lines.push(`═══ ${domain.title.toUpperCase()} ═══`);
      lines.push(`Overall Rating: ${score.overall.replace("_", " ").toUpperCase()}`);
      lines.push(`Assessed: ${score.rated}/${score.total} questions`);
      lines.push("");
      for (const q of domain.questions) {
        const r = assessment.ratings[q.id] || "not_assessed";
        const e = assessment.evidence[q.id] || "";
        lines.push(`  Q: ${q.text}`);
        lines.push(`  Rating: ${r.replace("_", " ")}`);
        if (e) lines.push(`  Evidence: ${e}`);
        lines.push("");
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cqc-self-assessment-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: "Self-assessment report downloaded." });
  }, [assessment, domainScores, answeredQuestions, totalQuestions, completionPct, toast]);

  return (
      <div className="page-shell page-shell-compact">
        {/* Overview header */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <Card className="md:col-span-2">
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs font-medium text-muted-foreground">Completion</p>
              <p className="text-2xl font-bold">{completionPct}%</p>
              <Progress value={completionPct} className="mt-2 h-1.5" />
              <p className="text-[10px] text-muted-foreground mt-1">{answeredQuestions} of {totalQuestions} questions rated</p>
            </CardContent>
          </Card>
          {CQC_DOMAINS.map((d) => {
            const score = domainScores[d.id];
            return (
              <Card key={d.id}>
                <CardContent className="pt-4 pb-3 px-4 flex flex-col items-center text-center">
                  {d.icon}
                  <p className="text-xs font-semibold mt-1">{d.title}</p>
                  <RatingBadge value={score.overall} />
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 justify-end">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={resetAssessment}>
            <RotateCcw size={12} /> Reset
          </Button>
          <Button size="sm" className="gap-1.5" onClick={exportAssessment}>
            <Download size={12} /> Export Report
          </Button>
        </div>

        {/* Domain Sections */}
        <div className="space-y-3">
          {CQC_DOMAINS.map((domain) => {
            const isExpanded = expandedDomain === domain.id;
            const score = domainScores[domain.id];
            return (
              <Card key={domain.id}>
                <button
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/30 transition-colors rounded-t-lg"
                  onClick={() => setExpandedDomain(isExpanded ? null : domain.id)}
                >
                  <div className="flex items-center gap-3">
                    {domain.icon}
                    <div>
                      <h3 className="text-sm font-semibold">{domain.title}</h3>
                      <p className="text-xs text-muted-foreground">{domain.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <RatingBadge value={score.overall} />
                    <span className="text-xs text-muted-foreground">{score.rated}/{score.total}</span>
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </button>
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <CardContent className="pt-0 px-5 pb-5 space-y-4">
                        {domain.questions.map((q, idx) => (
                          <div key={q.id} className="space-y-2 border-t border-border/30 pt-3 first:border-0 first:pt-0">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <p className="text-sm font-medium">{idx + 1}. {q.text}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{q.hint}</p>
                              </div>
                              <Select
                                value={assessment.ratings[q.id] || "not_assessed"}
                                onValueChange={(v) => setRating(q.id, v)}
                              >
                                <SelectTrigger className="w-[180px] h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {RATING_OPTIONS.map((o) => (
                                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <Textarea
                              value={assessment.evidence[q.id] || ""}
                              onChange={(e) => setEvidence(q.id, e.target.value)}
                              placeholder="Evidence and supporting notes..."
                              rows={2}
                              className="text-xs"
                            />
                          </div>
                        ))}
                      </CardContent>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            );
          })}
        </div>

        {/* Auto-save indicator */}
        <p className="text-center text-[10px] text-muted-foreground">
          Auto-saved to browser · Last updated: {new Date(assessment.lastUpdated).toLocaleString("en-GB")}
        </p>
      </div>
  );
}

export default memo(CQCSelfAssessment);
