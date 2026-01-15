import "./homepage-theme.css";

import { useCallback, useMemo, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
    title: "CQC Compliant",
    description: "Workflows aligned to inspection priorities and audit-ready reporting.",
  },
  {
    icon: Lock,
    title: "GDPR Certified",
    description: "Data minimisation, sealing, and role-based access built in.",
  },
  {
    icon: ClipboardCheck,
    title: "Audit Trails",
    description: "Every change is logged with time, user, and document context.",
  },
] as const;

const PROJECT_TILES = [
  {
    title: "EMAR Audit Reports",
    subtitle: "Medication compliance snapshots",
    accent: "from-[#f0e7db] to-[#d8c7b1]",
  },
  {
    title: "Care Plan Generator",
    subtitle: "11-section drafts in minutes",
    accent: "from-[#f3efe7] to-[#d4ddda]",
  },
  {
    title: "Visit Audit Review",
    subtitle: "Planned vs actual insights",
    accent: "from-[#e8ecf0] to-[#c9d3dc]",
  },
  {
    title: "Staff Performance",
    subtitle: "Coaching-ready patterns",
    accent: "from-[#f1e9e0] to-[#d5c3b1]",
  },
  {
    title: "Risk Assessment",
    subtitle: "Structured, consistent scoring",
    accent: "from-[#edf0ea] to-[#ccd6c6]",
  },
  {
    title: "Call Reconciliation",
    subtitle: "Variance summaries for billing",
    accent: "from-[#f0ebe6] to-[#d6cfc4]",
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
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
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
    [login, password, setLocation, username]
  );

  const handleServiceUsersChange = useCallback((value: number[]) => {
    setServiceUsers(value[0]);
  }, []);

  const scrollToSection = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }, []);

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
    <div className="homepage-theme min-h-screen">
      <div className="home-pattern fixed inset-0 pointer-events-none opacity-40" />

      <header className="relative z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-foreground text-background flex items-center justify-center shadow-[0_12px_24px_rgba(22,20,18,0.18)]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="text-lg font-heading font-semibold text-foreground">CareAssurance</div>
              <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Compliance Platform</div>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <button type="button" onClick={() => scrollToSection("platform")}>
              Platform
            </button>
            <button type="button" onClick={() => scrollToSection("compliance")}>
              Compliance
            </button>
            <button type="button" onClick={() => scrollToSection("roi")}>Savings</button>
            <button type="button" onClick={() => scrollToSection("contact")}>
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
              <PopoverContent className="w-80 p-0" align="end">
                <div className="p-4 border-b border-border/70">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-xl bg-foreground text-background flex items-center justify-center">
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">Welcome Back</h3>
                      <p className="text-xs text-muted-foreground">Sign in to your account</p>
                    </div>
                  </div>
                </div>
                <form onSubmit={handleLogin} className="p-4 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-username" className="text-sm text-muted-foreground">Username</Label>
                    <Input
                      id="login-username"
                      placeholder="Enter username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      autoComplete="username"
                      className="bg-background"
                      data-testid="input-dropdown-username"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password" className="text-sm text-muted-foreground">Password</Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="Enter password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="bg-background"
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
                  <p className="text-xs text-muted-foreground">Need access? Contact your administrator</p>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        <section className="px-4 pt-8 pb-16 sm:pt-12 sm:pb-20">
          <div className="max-w-6xl mx-auto grid gap-12 lg:grid-cols-[1.05fr_0.95fr] items-center">
            <motion.div {...reveal()}>
              <span className="home-eyebrow">Operational Assurance for UK Care</span>
              <h1 className="mt-4 text-4xl sm:text-5xl lg:text-6xl font-heading text-foreground">
                Compliance reporting that feels calm, clear, and prepared.
              </h1>
              <p className="mt-5 text-lg text-muted-foreground max-w-xl">
                CareAssurance streamlines EMAR audits, care plans, and visit reviews into one
                structured workspace. Detect risks earlier, document decisions faster, and walk
                into inspections with confidence.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Button className="home-cta" size="lg" onClick={() => setLoginOpen(true)}>
                  Login to platform
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="lg" className="home-outline" onClick={() => scrollToSection("roi")}> 
                  Estimate savings
                </Button>
              </div>
              <div className="mt-10 grid grid-cols-2 gap-4">
                {HERO_STATS.map((stat) => (
                  <div key={stat.label} className="home-card-soft p-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <stat.icon className="h-4 w-4" />
                      {stat.label}
                    </div>
                    <div className="mt-2 text-lg font-semibold text-foreground">{stat.value}</div>
                    <div className="text-[11px] text-muted-foreground">{stat.detail}</div>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div {...reveal(0.1)} className="relative">
              <div className="home-card p-4">
                <img
                  src="/opengraph.jpg"
                  alt="CareAssurance platform preview"
                  className="w-full rounded-2xl border border-border object-cover"
                />
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="home-card-soft p-3">
                    <p className="text-xs text-muted-foreground">Live audits reviewed</p>
                    <p className="text-lg font-semibold text-foreground">248</p>
                  </div>
                  <div className="home-card-soft p-3">
                    <p className="text-xs text-muted-foreground">Open issues flagged</p>
                    <p className="text-lg font-semibold text-foreground">7</p>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-8 -left-6 hidden lg:block">
                <div className="home-card px-4 py-3">
                  <p className="text-xs text-muted-foreground">Average start drift</p>
                  <p className="text-lg font-semibold text-foreground">+12 min</p>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section id="platform" className="px-4 py-16">
          <div className="max-w-6xl mx-auto grid gap-12 lg:grid-cols-[0.95fr_1.05fr] items-center">
            <motion.div {...reveal()}>
              <span className="home-eyebrow">Platform overview</span>
              <h2 className="mt-4 text-3xl sm:text-4xl font-heading text-foreground">
                One workspace for audits, plans, and care delivery checks.
              </h2>
              <p className="mt-4 text-muted-foreground">
                Replace scattered spreadsheets with a structured flow for every document.
                CareAssurance unifies analysis, notes, and follow-up actions so teams can move fast.
              </p>
              <div className="mt-6 space-y-3">
                {OVERVIEW_BULLETS.map((bullet) => (
                  <div key={bullet} className="flex items-start gap-3 text-sm text-muted-foreground">
                    <span className="mt-1 h-6 w-6 rounded-full border border-border flex items-center justify-center">
                      <CheckCircle2 className="h-3.5 w-3.5 text-foreground" />
                    </span>
                    <span>{bullet}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div {...reveal(0.1)} className="grid gap-4">
              <div className="home-card p-5">
                <p className="home-eyebrow">Audit snapshot</p>
                <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Service users</p>
                    <p className="text-2xl font-semibold text-foreground">52</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Flagged calls</p>
                    <p className="text-2xl font-semibold text-foreground">13</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Avg start drift</p>
                    <p className="text-2xl font-semibold text-foreground">+1h 3m</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Avg duration</p>
                    <p className="text-2xl font-semibold text-foreground">122%</p>
                  </div>
                </div>
              </div>
              <div className="home-card-soft p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Included modules</p>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-foreground">
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
              <p className="home-eyebrow text-white/60">Compliance foundations</p>
              <h2 className="mt-4 text-3xl sm:text-4xl font-heading text-white">
                Evidence you can stand behind.
              </h2>
              <p className="mt-3 text-white/70 max-w-2xl mx-auto">
                Built for regulated care environments with clear governance controls and consistent reporting.
              </p>
            </motion.div>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {CERTIFICATIONS.map((item) => (
                <motion.div key={item.title} {...reveal(0.1)} className="rounded-2xl border border-white/10 bg-white/5 p-6">
                  <div className="h-11 w-11 rounded-2xl bg-white/10 flex items-center justify-center">
                    <item.icon className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-white">{item.title}</h3>
                  <p className="mt-2 text-sm text-white/70">{item.description}</p>
                </motion.div>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <span className="home-band-pill">CQC Compliant</span>
              <span className="home-band-pill">GDPR Certified</span>
            </div>
          </div>
        </section>

        <section className="px-4 py-16">
          <div className="max-w-6xl mx-auto">
            <motion.div {...reveal()} className="text-center">
              <span className="home-eyebrow">Platform highlights</span>
              <h2 className="mt-4 text-3xl sm:text-4xl font-heading text-foreground">
                Every workflow your compliance team needs.
              </h2>
              <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
                Designed for UK care operations, from medication audits to staff performance monitoring.
              </p>
            </motion.div>
            <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {PRIMARY_FEATURES.map((feature) => (
                <motion.div key={feature.title} {...reveal(0.05)} className="home-card p-6">
                  <div className="flex items-center justify-between">
                    <feature.icon className="h-6 w-6 text-foreground" />
                    <Badge variant="outline" className="text-[10px]">{feature.tag}</Badge>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-foreground">{feature.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{feature.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-16">
          <div className="max-w-6xl mx-auto">
            <motion.div {...reveal()} className="text-center">
              <span className="home-eyebrow">Recent projects</span>
              <h2 className="mt-4 text-3xl sm:text-4xl font-heading text-foreground">
                Compliance outputs that teams can act on.
              </h2>
            </motion.div>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {PROJECT_TILES.map((tile) => (
                <motion.div key={tile.title} {...reveal(0.05)} className={`home-card p-6 bg-gradient-to-br ${tile.accent}`}>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Case study</p>
                  <h3 className="mt-3 text-lg font-semibold text-foreground">{tile.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{tile.subtitle}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section id="roi" className="px-4 py-16">
          <div className="max-w-6xl mx-auto">
            <motion.div {...reveal()} className="text-center">
              <span className="home-eyebrow">Savings estimator</span>
              <h2 className="mt-4 text-3xl sm:text-4xl font-heading text-foreground">
                Model time savings in minutes.
              </h2>
              <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
                Estimate the annual hours recovered when audits and plans are streamlined.
              </p>
            </motion.div>

            <motion.div {...reveal(0.1)} className="home-card p-8 mt-10">
              <div className="flex items-center justify-between mb-4">
                <Label className="text-lg font-medium text-foreground">Number of Service Users</Label>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-foreground" />
                  <span className="text-2xl font-semibold text-foreground" data-testid="text-service-users-count">
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
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>1</span>
                <span>50</span>
                <span>100</span>
                <span>150</span>
                <span>200</span>
              </div>

              <div className="mt-8 grid gap-4 md:grid-cols-4">
                <div className="home-card-soft p-4">
                  <p className="text-xs text-muted-foreground">Manual time</p>
                  <p className="text-2xl font-semibold text-foreground" data-testid="text-manual-hours">
                    {roi.manualHours.toLocaleString(undefined, { maximumFractionDigits: 0 })} hrs
                  </p>
                  <p className="text-xs text-muted-foreground">per year</p>
                </div>
                <div className="home-card-soft p-4">
                  <p className="text-xs text-muted-foreground">With CareAssurance</p>
                  <p className="text-2xl font-semibold text-foreground" data-testid="text-ai-hours">
                    {roi.aiHours.toLocaleString(undefined, { maximumFractionDigits: 0 })} hrs
                  </p>
                  <p className="text-xs text-muted-foreground">per year</p>
                </div>
                <div className="home-card-soft p-4">
                  <p className="text-xs text-muted-foreground">Time saved</p>
                  <p className="text-2xl font-semibold text-foreground" data-testid="text-hours-saved">
                    {roi.hoursSaved.toLocaleString(undefined, { maximumFractionDigits: 0 })} hrs
                  </p>
                  <p className="text-xs text-muted-foreground">per year</p>
                </div>
                <div className="home-card-soft p-4">
                  <p className="text-xs text-muted-foreground">Money saved</p>
                  <p className="text-2xl font-semibold text-foreground" data-testid="text-money-saved">
                    £{roi.moneySaved.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-xs text-muted-foreground">per year at £14.50/hr*</p>
                </div>
              </div>

              <div className="mt-6">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Efficiency gain</span>
                  <span className="text-foreground font-semibold">{savingsPercent}% faster</span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-muted/60 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-foreground"
                    style={{ width: `${savingsPercent}%` }}
                  />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  *Estimates are based on typical task durations and may vary.
                </p>
              </div>
            </motion.div>
          </div>
        </section>

        <section id="contact" className="px-4 pb-20">
          <div className="max-w-6xl mx-auto">
            <motion.div {...reveal()} className="home-card p-8 sm:p-10">
              <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
                <div>
                  <span className="home-eyebrow">Contact</span>
                  <h2 className="mt-4 text-3xl sm:text-4xl font-heading text-foreground">
                    Speak with the CareAssurance team.
                  </h2>
                  <p className="mt-3 text-muted-foreground">
                    Share your compliance priorities and we will respond with a tailored walkthrough.
                  </p>
                  <div className="mt-6 space-y-3 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-foreground" />
                      Private response within 1 business day.
                    </div>
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-foreground" />
                      Share audit goals, EMAR challenges, or care plan needs.
                    </div>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-foreground" />
                      UK-based support for care facilities.
                    </div>
                  </div>
                </div>

                <div>
                  {contactSuccess ? (
                    <div className="home-card-soft p-6">
                      <div className="flex items-center gap-2 text-foreground">
                        <CheckCircle2 className="h-5 w-5" />
                        <span className="font-semibold">Message sent</span>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
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
                          <Label htmlFor="contact-name" className="text-sm text-foreground">Name *</Label>
                          <Input
                            id="contact-name"
                            placeholder="Your name"
                            value={contactName}
                            onChange={(e) => setContactName(e.target.value)}
                            required
                            className="bg-background"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="contact-email" className="text-sm text-foreground">Email *</Label>
                          <Input
                            id="contact-email"
                            type="email"
                            placeholder="you@example.com"
                            value={contactEmail}
                            onChange={(e) => setContactEmail(e.target.value)}
                            required
                            className="bg-background"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="contact-org" className="text-sm text-foreground">Organisation</Label>
                        <Input
                          id="contact-org"
                          placeholder="Your care facility or company"
                          value={contactOrg}
                          onChange={(e) => setContactOrg(e.target.value)}
                          className="bg-background"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="contact-message" className="text-sm text-foreground">Message *</Label>
                        <Textarea
                          id="contact-message"
                          placeholder="Tell us what you are looking for..."
                          value={contactMessage}
                          onChange={(e) => setContactMessage(e.target.value)}
                          required
                          rows={4}
                          className="bg-background resize-none"
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
                      <div className="flex items-center gap-2 text-foreground">
                        <ClipboardCheck className="h-4 w-4" />
                        <span className="text-sm font-semibold">Contact form disabled</span>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
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

      <footer className="relative z-10 border-t border-border/70">
        <div className="max-w-6xl mx-auto px-4 py-10 flex flex-col md:flex-row items-center justify-between gap-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-2xl bg-foreground text-background flex items-center justify-center">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <span className="text-foreground font-semibold">CareAssurance</span>
              <span className="ml-2 text-muted-foreground">careassurance.uk</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <button type="button" onClick={() => scrollToSection("contact")}>
              Contact
            </button>
            <Link href="/terms">Terms & Conditions</Link>
            <Link href="/privacy">Privacy Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
