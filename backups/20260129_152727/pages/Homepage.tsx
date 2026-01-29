import "./homepage-theme.css";

import { useCallback, useMemo, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { motion, useReducedMotion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import {
  ShieldCheck,
  Lock,
  ClipboardCheck,
  ArrowRight,
  CheckCircle2,
  Users,
  Timer,
  FileText,
  BarChart3,
  FileSearch,
  Brain,
  ClipboardList,
  LayoutGrid,
  LineChart,
  Mail,
  MessageSquare,
  Send,
  ChevronRight,
  Loader2,
  Building2,
} from "lucide-react";

const HOURLY_RATE = 14.5;

const TASKS = {
  carePlan: { name: "Care Plans", manualMins: 90, aiSecs: 60, perYear: 12 },
  initialAssessment: { name: "Initial Assessments", manualMins: 150, aiSecs: 90, perYear: 1 },
  riskAssessment: { name: "Risk Assessments", manualMins: 180, aiSecs: 120, perYear: 2 },
  emar: { name: "EMAR Audits", manualMins: 45, aiSecs: 30, perYear: 48 },
  visitAudit: { name: "Visit Audits", manualMins: 30, aiSecs: 30, perYear: 48 },
} as const;

const HERO_STATS = [
  { label: "Avg audit time", value: "6 min", detail: "from 45 min", icon: Timer },
  { label: "Care plan sections", value: "11", detail: "auto-drafted", icon: FileText },
  { label: "Records parsed", value: "98%", detail: "structured capture", icon: BarChart3 },
  { label: "UK-ready", value: "CQC focus", detail: "audit trails", icon: ShieldCheck },
] as const;

const PRIMARY_FEATURES = [
  {
    icon: FileSearch,
    title: "EMAR Auditing",
    description: "Surface missed doses, PRN refusals, and non-administration codes fast.",
    tag: "Medication integrity",
  },
  {
    icon: Brain,
    title: "AI Care Plans",
    description: "Draft person-centred plans across 11 sections, ready for review.",
    tag: "Documentation speed",
  },
  {
    icon: ClipboardCheck,
    title: "Compliance Dashboard",
    description: "Track inspection readiness with live risk indicators and action queues.",
    tag: "Operational clarity",
  },
  {
    icon: ClipboardList,
    title: "Visit Audits",
    description: "Match planned and actual call data to detect drift and missed visits.",
    tag: "Service assurance",
  },
  {
    icon: LineChart,
    title: "Staff Analytics",
    description: "Spot patterns, coach teams, and document actions with evidence.",
    tag: "Performance insights",
  },
  {
    icon: LayoutGrid,
    title: "Call Reconciliation",
    description: "Process ECM call exports into clear variance summaries.",
    tag: "Finance-ready",
  },
] as const;

const CERTIFICATIONS = [
  {
    icon: ShieldCheck,
    title: "CQC-Aligned",
    description: "Workflows designed around inspection priorities and audit-ready reporting.",
  },
  {
    icon: Lock,
    title: "Privacy Focused",
    description: "Data minimisation, sealing, and role-based access built in.",
  },
  {
    icon: ClipboardCheck,
    title: "Audit Trails",
    description: "Every change is logged with time, user, and document context.",
  },
] as const;

const WORKFLOW_STEPS = [
  {
    step: "01",
    title: "Upload Records",
    description: "Drag and drop EMAR sheets, care plans, or visit logs. Supports PDF, CSV, and common care system exports.",
    icon: FileText,
  },
  {
    step: "02",
    title: "AI Analysis",
    description: "Our system parses documents, detects discrepancies, and highlights compliance risks automatically.",
    icon: Brain,
  },
  {
    step: "03",
    title: "Review & Action",
    description: "Clear summaries show what needs attention. Export reports or generate corrective action plans instantly.",
    icon: ClipboardCheck,
  },
] as const;

const OVERVIEW_BULLETS = [
  "Unified record review for EMARs, care plans, and audits.",
  "Automated checks highlight issues before inspections.",
  "Clear reports for managers, auditors, and care teams.",
] as const;

const calculateROI = (users: number) => {
  let totalManualMins = 0;
  let totalAiMins = 0;

  Object.values(TASKS).forEach((task) => {
    totalManualMins += task.manualMins * task.perYear * users;
    totalAiMins += (task.aiSecs / 60) * task.perYear * users;
  });

  const manualHours = totalManualMins / 60;
  const aiHours = totalAiMins / 60;
  const hoursSaved = manualHours - aiHours;
  const moneySaved = hoursSaved * HOURLY_RATE;

  return { manualHours, aiHours, hoursSaved, moneySaved };
};

export default function Homepage() {
  const [serviceUsers, setServiceUsers] = useState(20);
  const prefersReducedMotion = useReducedMotion();

  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactOrg, setContactOrg] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [contactLoading, setContactLoading] = useState(false);
  const [contactSuccess, setContactSuccess] = useState(false);
  const [contactError, setContactError] = useState("");
  const [contactEnabled, setContactEnabled] = useState(false);

  useEffect(() => {
    fetch("/api/contact/status")
      .then((res) => res.json())
      .then((data) => setContactEnabled(data.enabled))
      .catch(() => setContactEnabled(false));
  }, []);

  const handleContactSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setContactLoading(true);
      setContactError("");

      try {
        const res = await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: contactName,
            email: contactEmail,
            organisation: contactOrg,
            message: contactMessage,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          setContactError(data.message || "Failed to send message");
        } else {
          setContactSuccess(true);
          setContactName("");
          setContactEmail("");
          setContactOrg("");
          setContactMessage("");
        }
      } catch (err) {
        setContactError("Failed to send message. Please try again.");
      } finally {
        setContactLoading(false);
      }
    },
    [contactName, contactEmail, contactMessage, contactOrg]
  );

  const handleServiceUsersChange = useCallback((value: number[]) => {
    setServiceUsers(value[0]);
  }, []);

  const scrollToSection = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      const success = await login(username, password);
      setLoading(false);
      if (success) {
        setLoginOpen(false);
        setLocation("/dashboard");
      }
    },
    [username, password, login, setLocation]
  );

  const openLoginFromCTA = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => setLoginOpen(true), 250);
  }, []);

  const roi = useMemo(() => calculateROI(serviceUsers), [serviceUsers]);
  const savingsPercent = useMemo(() => {
    if (roi.manualHours <= 0) return 0;
    const percent = (roi.hoursSaved / roi.manualHours) * 100;
    return Math.min(100, Math.max(0, Math.round(percent)));
  }, [roi]);

  const reveal = useCallback(
    (delay = 0) =>
      prefersReducedMotion
        ? {}
        : {
            initial: { opacity: 0, y: 20 },
            whileInView: { opacity: 1, y: 0 },
            viewport: { once: true },
            transition: { duration: 0.6, delay },
          },
    [prefersReducedMotion]
  );

  return (
    <div className="homepage-theme min-h-screen overflow-x-hidden">
      <div className="home-pattern fixed inset-0 pointer-events-none opacity-25" />

      <header className="relative z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#3b82f6] text-white flex items-center justify-center shadow-sm">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="text-base font-bold" style={{ color: '#0f172a', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>CareAssurance</div>
              <div className="text-[11px] tracking-wide font-medium" style={{ color: '#64748b' }}>Compliance Platform</div>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
            <button
              type="button"
              className="bg-transparent p-0 text-sm font-medium transition-colors"
              style={{ color: '#64748b' }}
              onClick={() => scrollToSection("platform")}
            >
              Platform
            </button>
            <button
              type="button"
              className="bg-transparent p-0 text-sm font-medium transition-colors"
              style={{ color: '#64748b' }}
              onClick={() => scrollToSection("compliance")}
            >
              Compliance
            </button>
            <button
              type="button"
              className="bg-transparent p-0 text-sm font-medium transition-colors"
              style={{ color: '#64748b' }}
              onClick={() => scrollToSection("roi")}
            >
              Savings
            </button>
            <button
              type="button"
              className="bg-transparent p-0 text-sm font-medium transition-colors"
              style={{ color: '#64748b' }}
              onClick={() => scrollToSection("contact")}
            >
              Contact
            </button>
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="outline" className="home-outline" onClick={() => scrollToSection("contact")}>Contact</Button>
            <Popover open={loginOpen} onOpenChange={setLoginOpen}>
              <PopoverTrigger asChild>
                <Button className="home-cta" data-testid="button-header-login">
                  Login
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="end" style={{ backgroundColor: '#ffffff' }}>
                <div className="p-4" style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl text-white flex items-center justify-center" style={{ backgroundColor: '#3b82f6' }}>
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="font-semibold" style={{ color: '#0f172a', fontFamily: 'Inter, sans-serif' }}>Welcome Back</h3>
                      <p className="text-xs" style={{ color: '#64748b' }}>Sign in to your account</p>
                    </div>
                  </div>
                </div>
                <form onSubmit={handleLogin} className="p-4 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-username" className="text-sm" style={{ color: '#475569' }}>Username</Label>
                    <Input
                      id="login-username"
                      placeholder="Enter username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      autoComplete="username"
                      style={{ backgroundColor: '#f8fafc', color: '#0f172a' }}
                      data-testid="input-dropdown-username"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password" className="text-sm" style={{ color: '#475569' }}>Password</Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="Enter password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      style={{ backgroundColor: '#f8fafc', color: '#0f172a' }}
                      data-testid="input-dropdown-password"
                    />
                  </div>
                  <Button type="submit" className="home-cta w-full" disabled={loading}>
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="animate-spin h-4 w-4" /> Signing in...
                      </span>
                    ) : (
                      "Sign In"
                    )}
                  </Button>
                </form>
                <div className="px-4 pb-4 text-center">
                  <p className="text-xs" style={{ color: '#64748b' }}>Need access? Contact your administrator</p>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        <section className="px-4 pt-8 pb-16 sm:pt-12 sm:pb-20">
          <div className="max-w-6xl mx-auto grid gap-12 lg:grid-cols-[1.05fr_0.95fr] items-center">
            <motion.div {...reveal()} className="text-center lg:text-left">
              <span className="home-eyebrow">Operational Assurance for UK Care</span>
              <h1 className="mt-5 text-3xl sm:text-4xl lg:text-[3.25rem] font-heading font-bold leading-[1.1]" style={{ color: 'hsl(220, 25%, 10%)' }}>
                Compliance reporting that feels calm, clear, and prepared.
              </h1>
              <p className="mt-6 text-lg max-w-xl mx-auto lg:mx-0 leading-relaxed" style={{ color: 'hsl(220, 10%, 35%)' }}>
                CareAssurance streamlines EMAR audits, care plans, and visit reviews into one
                structured workspace. Detect risks earlier, document decisions faster, and walk
                into inspections with confidence.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3 sm:justify-center lg:justify-start">
                <Button className="home-cta w-full sm:w-auto" size="lg" onClick={() => setLoginOpen(true)}>
                  Login to platform
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="home-outline w-full sm:w-auto"
                  onClick={() => scrollToSection("roi")}
                >
                  Estimate savings
                </Button>
              </div>
              <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {HERO_STATS.map((stat) => (
                  <div key={stat.label} className="home-card-soft p-4 text-left">
                    <div className="flex items-center gap-2 text-xs font-medium" style={{ color: 'hsl(220, 10%, 50%)' }}>
                      <stat.icon className="h-4 w-4" style={{ color: 'hsl(220, 25%, 30%)' }} />
                      {stat.label}
                    </div>
                    <div className="mt-2 text-xl font-bold" style={{ color: 'hsl(220, 25%, 10%)' }}>{stat.value}</div>
                    <div className="text-xs font-medium mt-0.5" style={{ color: 'hsl(220, 10%, 50%)' }}>{stat.detail}</div>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div {...reveal(0.1)} className="relative">
              <div className="home-card p-6">
                <div className="space-y-4">
                  <div className="flex items-start gap-4 p-4 rounded-lg" style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                    <div className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#dcfce7' }}>
                      <CheckCircle2 className="h-5 w-5" style={{ color: '#16a34a' }} />
                    </div>
                    <div>
                      <p className="font-semibold text-sm" style={{ color: '#0f172a' }}>EMAR compliance audit</p>
                      <p className="text-xs mt-1" style={{ color: '#64748b' }}>12 medication records reviewed • 0 discrepancies</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 p-4 rounded-lg" style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                    <div className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#dcfce7' }}>
                      <FileText className="h-5 w-5" style={{ color: '#16a34a' }} />
                    </div>
                    <div>
                      <p className="font-semibold text-sm" style={{ color: '#0f172a' }}>Care plan generated</p>
                      <p className="text-xs mt-1" style={{ color: '#64748b' }}>11 sections • inspection-ready format</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 p-4 rounded-lg" style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe' }}>
                    <div className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#dbeafe' }}>
                      <ClipboardCheck className="h-5 w-5" style={{ color: '#3b82f6' }} />
                    </div>
                    <div>
                      <p className="font-semibold text-sm" style={{ color: '#0f172a' }}>Visit reconciliation</p>
                      <p className="text-xs mt-1" style={{ color: '#64748b' }}>Analysing 48 visits • 2 variances flagged</p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="home-card-soft p-3">
                    <p className="text-xs" style={{ color: '#64748b' }}>Live audits reviewed</p>
                    <p className="text-lg font-semibold" style={{ color: '#0f172a' }}>248</p>
                  </div>
                  <div className="home-card-soft p-3">
                    <p className="text-xs" style={{ color: '#64748b' }}>Open issues flagged</p>
                    <p className="text-lg font-semibold" style={{ color: '#0f172a' }}>7</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section id="platform" className="px-4 py-12 sm:py-16">
          <div className="max-w-6xl mx-auto grid gap-12 lg:grid-cols-[0.95fr_1.05fr] items-center">
            <motion.div {...reveal()}>
              <span className="home-eyebrow">Platform overview</span>
              <h2 className="mt-4 text-3xl sm:text-4xl font-heading font-bold leading-tight" style={{ color: 'hsl(220, 25%, 10%)' }}>
                One workspace for audits, plans, and care delivery checks.
              </h2>
              <p className="mt-4 text-base leading-relaxed" style={{ color: 'hsl(220, 10%, 35%)' }}>
                Replace scattered spreadsheets with a structured flow for every document.
                CareAssurance unifies analysis, notes, and follow-up actions so teams can move fast.
              </p>
              <div className="mt-6 space-y-3">
                {OVERVIEW_BULLETS.map((bullet) => (
                  <div key={bullet} className="flex items-start gap-3 text-sm">
                    <span className="mt-0.5 h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                      <CheckCircle2 className="h-3 w-3" style={{ color: '#3b82f6' }} />
                    </span>
                    <span style={{ color: '#334155' }}>{bullet}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div {...reveal(0.1)} className="grid gap-4">
              <div className="home-card p-5">
                <p className="home-eyebrow">Audit snapshot</p>
                <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p style={{ color: '#64748b' }}>Service users</p>
                    <p className="text-2xl font-semibold" style={{ color: '#0f172a' }}>52</p>
                  </div>
                  <div>
                    <p style={{ color: '#64748b' }}>Flagged calls</p>
                    <p className="text-2xl font-semibold" style={{ color: '#0f172a' }}>13</p>
                  </div>
                  <div>
                    <p style={{ color: '#64748b' }}>Avg start drift</p>
                    <p className="text-2xl font-semibold" style={{ color: '#0f172a' }}>+1h 3m</p>
                  </div>
                  <div>
                    <p style={{ color: '#64748b' }}>Avg duration</p>
                    <p className="text-2xl font-semibold" style={{ color: '#0f172a' }}>122%</p>
                  </div>
                </div>
              </div>
              <div className="home-card-soft p-5">
                <p className="text-xs uppercase tracking-[0.2em]" style={{ color: '#64748b' }}>Included modules</p>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm" style={{ color: '#0f172a' }}>
                  <span>EMAR audits</span>
                  <span>Care plan drafts</span>
                  <span>Visit audits</span>
                  <span>Risk assessments</span>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section id="compliance" className="home-band">
          <div className="max-w-6xl mx-auto px-4 py-16">
            <motion.div {...reveal()} className="text-center">
              <p className="home-eyebrow" style={{ color: 'rgba(255,255,255,0.7)' }}>Compliance foundations</p>
              <h2 className="mt-4 text-3xl sm:text-4xl font-heading font-bold leading-tight" style={{ color: '#ffffff' }}>
                Evidence you can stand behind.
              </h2>
              <p className="mt-4 max-w-2xl mx-auto leading-relaxed" style={{ color: 'rgba(255,255,255,0.8)' }}>
                Built for regulated care environments with clear governance controls and consistent reporting.
              </p>
            </motion.div>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {CERTIFICATIONS.map((item) => (
                <motion.div key={item.title} {...reveal(0.1)} className="rounded-2xl border border-white/15 bg-white/[0.07] backdrop-blur-sm p-6">
                  <div className="h-11 w-11 rounded-xl bg-white/10 flex items-center justify-center">
                    <item.icon className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold" style={{ color: '#ffffff' }}>{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}>{item.description}</p>
                </motion.div>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <span className="home-band-pill">CQC-Aligned</span>
              <span className="home-band-pill">Privacy Focused</span>
            </div>
          </div>
        </section>

        <section className="px-4 py-12 sm:py-16">
          <div className="max-w-6xl mx-auto">
            <motion.div {...reveal()} className="text-center">
              <span className="home-eyebrow">Platform highlights</span>
              <h2 className="mt-4 text-3xl sm:text-4xl font-heading font-bold leading-tight" style={{ color: 'hsl(220, 25%, 10%)' }}>
                Every workflow your compliance team needs.
              </h2>
              <p className="mt-4 text-base max-w-2xl mx-auto leading-relaxed" style={{ color: 'hsl(220, 10%, 35%)' }}>
                Designed for UK care operations, from medication audits to staff performance monitoring.
              </p>
            </motion.div>
            <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {PRIMARY_FEATURES.map((feature) => (
                <motion.div key={feature.title} {...reveal(0.05)} className="home-card p-6">
                  <div className="flex items-center justify-between">
                    <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
                      <feature.icon className="h-5 w-5" style={{ color: '#3b82f6' }} />
                    </div>
                    <span className="home-pill">{feature.tag}</span>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold" style={{ color: '#0f172a' }}>{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: '#475569' }}>{feature.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-12 sm:py-16" style={{ backgroundColor: '#ffffff' }}>
          <div className="max-w-6xl mx-auto">
            <motion.div {...reveal()} className="text-center">
              <span className="home-eyebrow">How it works</span>
              <h2 className="mt-4 text-3xl sm:text-4xl font-heading font-bold leading-tight" style={{ color: '#0f172a' }}>
                Three steps to audit-ready compliance.
              </h2>
              <p className="mt-4 text-base max-w-2xl mx-auto leading-relaxed" style={{ color: '#64748b' }}>
                No complex setup. Upload your existing documents and get actionable insights within minutes.
              </p>
            </motion.div>
            <div className="mt-12 grid gap-8 md:grid-cols-3">
              {WORKFLOW_STEPS.map((step) => (
                <motion.div
                  key={step.step}
                  {...reveal(0.1)}
                  className="relative p-6 rounded-xl border"
                  style={{ backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }}
                >
                  <div className="flex items-center gap-4 mb-4">
                    <span 
                      className="text-4xl font-bold"
                      style={{ color: '#cbd5e1' }}
                    >
                      {step.step}
                    </span>
                    <step.icon className="h-8 w-8" style={{ color: '#3b82f6' }} />
                  </div>
                  <h3 className="text-lg font-semibold mb-2" style={{ color: '#0f172a' }}>{step.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: '#64748b' }}>{step.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section id="roi" className="px-4 py-12 sm:py-16">
          <div className="max-w-6xl mx-auto">
            <motion.div {...reveal()} className="text-center">
              <span className="home-eyebrow">Savings estimator</span>
              <h2 className="mt-4 text-3xl sm:text-4xl font-heading font-bold leading-tight" style={{ color: 'hsl(220, 25%, 10%)' }}>
                Model time savings in minutes.
              </h2>
              <p className="mt-4 text-base max-w-2xl mx-auto leading-relaxed" style={{ color: 'hsl(220, 10%, 35%)' }}>
                Estimate the annual hours recovered when audits and plans are streamlined.
              </p>
            </motion.div>

            <motion.div {...reveal(0.1)} className="home-card p-6 sm:p-8 mt-10">
              <div className="flex items-center justify-between mb-4">
                <Label className="text-base font-semibold" style={{ color: '#0f172a' }}>Number of Service Users</Label>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5" style={{ color: '#3b82f6' }} />
                  <span className="text-2xl font-bold" style={{ color: '#0f172a' }} data-testid="text-service-users-count">
                    {serviceUsers}
                  </span>
                </div>
              </div>
              <Slider
                value={[serviceUsers]}
                onValueChange={handleServiceUsersChange}
                min={1}
                max={200}
                step={1}
                className="w-full"
                data-testid="slider-service-users"
              />
              <div className="flex justify-between text-xs mt-2" style={{ color: '#64748b' }}>
                <span>1</span>
                <span>50</span>
                <span>100</span>
                <span>150</span>
                <span>200</span>
              </div>

              <div className="mt-8 grid gap-4 md:grid-cols-4">
                <div className="home-card-soft p-4">
                  <p className="text-xs font-medium" style={{ color: '#64748b' }}>Manual time</p>
                  <p className="text-2xl font-bold" style={{ color: '#0f172a' }} data-testid="text-manual-hours">
                    {roi.manualHours.toLocaleString(undefined, { maximumFractionDigits: 0 })} hrs
                  </p>
                  <p className="text-xs font-medium" style={{ color: '#64748b' }}>per year</p>
                </div>
                <div className="home-card-soft p-4">
                  <p className="text-xs font-medium" style={{ color: '#64748b' }}>With CareAssurance</p>
                  <p className="text-2xl font-bold" style={{ color: '#0f172a' }} data-testid="text-ai-hours">
                    {roi.aiHours.toLocaleString(undefined, { maximumFractionDigits: 0 })} hrs
                  </p>
                  <p className="text-xs font-medium" style={{ color: '#64748b' }}>per year</p>
                </div>
                <div className="home-card-soft p-4">
                  <p className="text-xs font-medium" style={{ color: '#64748b' }}>Time saved</p>
                  <p className="text-2xl font-bold" style={{ color: '#16a34a' }} data-testid="text-hours-saved">
                    {roi.hoursSaved.toLocaleString(undefined, { maximumFractionDigits: 0 })} hrs
                  </p>
                  <p className="text-xs font-medium" style={{ color: '#64748b' }}>per year</p>
                </div>
                <div className="home-card-soft p-4">
                  <p className="text-xs font-medium" style={{ color: '#64748b' }}>Money saved</p>
                  <p className="text-2xl font-bold" style={{ color: '#16a34a' }} data-testid="text-money-saved">
                    £{roi.moneySaved.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-xs font-medium" style={{ color: '#64748b' }}>per year at £14.50/hr*</p>
                </div>
              </div>

              <div className="mt-6">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium" style={{ color: '#64748b' }}>Efficiency gain</span>
                  <span className="font-bold" style={{ color: '#16a34a' }}>{savingsPercent}% faster</span>
                </div>
                <div className="mt-3 h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: '#e2e8f0' }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${savingsPercent}%`, background: 'linear-gradient(90deg, #3b82f6, #16a34a)' }}
                  />
                </div>
                <p className="mt-3 text-xs" style={{ color: '#64748b' }}>
                  *Estimates are based on typical task durations and may vary.
                </p>
              </div>
            </motion.div>
          </div>
        </section>

        <section id="contact" className="px-4 pb-16 sm:pb-20">
          <div className="max-w-6xl mx-auto">
            <motion.div {...reveal()} className="home-card p-6 sm:p-8">
              <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
                <div>
                  <span className="home-eyebrow">Contact</span>
                  <h2 className="mt-4 text-3xl sm:text-4xl font-heading font-bold leading-tight" style={{ color: 'hsl(220, 25%, 10%)' }}>
                    Speak with the CareAssurance team.
                  </h2>
                  <p className="mt-4 text-base leading-relaxed" style={{ color: 'hsl(220, 10%, 35%)' }}>
                    Share your compliance priorities and we will respond with a tailored walkthrough.
                  </p>
                  <div className="mt-6 space-y-3 text-sm" style={{ color: '#334155' }}>
                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4" style={{ color: '#3b82f6' }} />
                      Private response within 1 business day.
                    </div>
                    <div className="flex items-center gap-3">
                      <MessageSquare className="h-4 w-4" style={{ color: '#3b82f6' }} />
                      Share audit goals, EMAR challenges, or care plan needs.
                    </div>
                    <div className="flex items-center gap-3">
                      <Building2 className="h-4 w-4" style={{ color: '#3b82f6' }} />
                      UK-based support for care facilities.
                    </div>
                  </div>
                </div>

                <div>
                  {contactSuccess ? (
                    <div className="home-card-soft p-6">
                      <div className="flex items-center gap-2" style={{ color: '#0f172a' }}>
                        <CheckCircle2 className="h-5 w-5" style={{ color: '#16a34a' }} />
                        <span className="font-semibold">Message sent</span>
                      </div>
                      <p className="mt-2 text-sm" style={{ color: '#64748b' }}>
                        Thank you for getting in touch. We will respond within 1 business day.
                      </p>
                      <Button variant="outline" className="home-outline mt-4 w-full" onClick={() => setContactSuccess(false)}>
                        Send another message
                      </Button>
                    </div>
                  ) : contactEnabled ? (
                    <form onSubmit={handleContactSubmit} className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="contact-name" className="text-sm" style={{ color: '#0f172a' }}>Name *</Label>
                          <Input
                            id="contact-name"
                            placeholder="Your name"
                            value={contactName}
                            onChange={(e) => setContactName(e.target.value)}
                            required
                            style={{ backgroundColor: '#f8fafc', color: '#0f172a' }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="contact-email" className="text-sm" style={{ color: '#0f172a' }}>Email *</Label>
                          <Input
                            id="contact-email"
                            type="email"
                            placeholder="you@example.com"
                            value={contactEmail}
                            onChange={(e) => setContactEmail(e.target.value)}
                            required
                            style={{ backgroundColor: '#f8fafc', color: '#0f172a' }}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="contact-org" className="text-sm" style={{ color: '#0f172a' }}>Organisation</Label>
                        <Input
                          id="contact-org"
                          placeholder="Your care facility or company"
                          value={contactOrg}
                          onChange={(e) => setContactOrg(e.target.value)}
                          style={{ backgroundColor: '#f8fafc', color: '#0f172a' }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="contact-message" className="text-sm" style={{ color: '#0f172a' }}>Message *</Label>
                        <Textarea
                          id="contact-message"
                          placeholder="Tell us what you are looking for..."
                          value={contactMessage}
                          onChange={(e) => setContactMessage(e.target.value)}
                          required
                          rows={4}
                          style={{ backgroundColor: '#f8fafc', color: '#0f172a', resize: 'none' }}
                        />
                      </div>
                      {contactError && (
                        <div className="rounded-lg border border-red-400/40 bg-red-100/60 px-4 py-2 text-sm text-red-600">
                          {contactError}
                        </div>
                      )}
                      <Button type="submit" className="home-cta w-full" disabled={contactLoading}>
                        {contactLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4" />
                            Send message
                          </>
                        )}
                      </Button>
                    </form>
                  ) : (
                    <div className="home-card-soft p-6">
                      <div className="flex items-center gap-2" style={{ color: '#0f172a' }}>
                        <ClipboardCheck className="h-4 w-4" style={{ color: '#3b82f6' }} />
                        <span className="text-sm font-semibold">Contact form disabled</span>
                      </div>
                      <p className="mt-2 text-sm" style={{ color: '#64748b' }}>
                        This site currently does not accept messages via email. If you already have access, please sign in.
                      </p>
                      <Button className="home-cta mt-4 w-full" onClick={openLoginFromCTA}>
                        Login
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      <footer className="relative z-10" style={{ borderTop: '1px solid #e2e8f0' }}>
        <div className="max-w-6xl mx-auto px-4 py-10 flex flex-col md:flex-row items-center justify-between gap-6 text-sm">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl text-white flex items-center justify-center" style={{ backgroundColor: '#3b82f6' }}>
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <span className="font-semibold" style={{ color: '#0f172a' }}>CareAssurance</span>
              <span className="ml-2" style={{ color: '#64748b' }}>careassurance.uk</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-6" style={{ color: '#64748b' }}>
            <button
              type="button"
              className="bg-transparent p-0 font-medium hover:text-[#0f172a] transition-colors"
              onClick={() => scrollToSection("contact")}
            >
              Contact
            </button>
            <Link href="/terms" className="font-medium hover:text-[#0f172a] transition-colors">
              Terms & Conditions
            </Link>
            <Link href="/privacy" className="font-medium hover:text-[#0f172a] transition-colors">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
