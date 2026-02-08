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
  Menu,
  X,
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

const NAV_SECTIONS = [
  { id: "platform", label: "Platform" },
  { id: "compliance", label: "Compliance" },
  { id: "roi", label: "Savings" },
  { id: "contact", label: "Contact" },
] as const;

const HERO_ACTIVITY = [
  {
    title: "EMAR compliance audit",
    detail: "12 medication records reviewed • 0 discrepancies",
    tone: "success",
    icon: CheckCircle2,
  },
  {
    title: "Care plan generated",
    detail: "11 sections • inspection-ready format",
    tone: "success",
    icon: FileText,
  },
  {
    title: "Visit reconciliation",
    detail: "Analysing 48 visits • 2 variances flagged",
    tone: "info",
    icon: ClipboardCheck,
  },
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
    const controller = new AbortController();

    fetch("/api/contact/status", { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => setContactEnabled(Boolean(data.enabled)))
      .catch(() => setContactEnabled(false));

    return () => controller.abort();
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

  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<(typeof NAV_SECTIONS)[number]["id"]>("platform");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [headerScrolled, setHeaderScrolled] = useState(false);

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
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => setLoginOpen(true), 250);
  }, []);

  const scrollToSection = useCallback((id: string) => {
    setActiveSection(id as (typeof NAV_SECTIONS)[number]["id"]);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
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
            initial: { opacity: 0, y: 12 },
            whileInView: { opacity: 1, y: 0 },
            viewport: { once: true, margin: "-50px" },
            transition: {
              duration: 0.44,
              delay: Math.max(0, Math.min(delay, 0.34)),
            },
          },
    [prefersReducedMotion]
  );

  useEffect(() => {
    let rafId = 0;
    let ticking = false;

    const updateScrollState = () => {
      const nextScrolled = window.scrollY > 12;
      const viewportAnchor = window.scrollY + window.innerHeight * 0.35;
      let currentSection: (typeof NAV_SECTIONS)[number]["id"] = NAV_SECTIONS[0].id;

      NAV_SECTIONS.forEach((section) => {
        const element = document.getElementById(section.id);
        if (!element) return;
        if (element.offsetTop <= viewportAnchor) {
          currentSection = section.id;
        }
      });

      setHeaderScrolled((prev) => (prev === nextScrolled ? prev : nextScrolled));
      setActiveSection((prev) => (prev === currentSection ? prev : currentSection));
      ticking = false;
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      rafId = window.requestAnimationFrame(updateScrollState);
    };

    const closeMenuOnDesktop = () => {
      if (window.innerWidth >= 768) {
        setMobileMenuOpen(false);
      }
    };

    updateScrollState();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", closeMenuOnDesktop);

    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", closeMenuOnDesktop);
    };
  }, []);

  return (
    <div className="homepage-theme min-h-screen overflow-x-hidden">
      <div className="home-pattern fixed inset-0 pointer-events-none opacity-25" />

      <header className={`home-header ${headerScrolled ? "is-scrolled" : ""}`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl home-brand-mark flex items-center justify-center shadow-sm">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="home-brand-copy">
              <div className="text-base font-bold">CareAssurance</div>
              <div className="text-[11px] tracking-wide font-medium">Compliance Platform</div>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-2 text-sm font-medium">
            {NAV_SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`home-nav-link ${activeSection === section.id ? "is-active" : ""}`}
                onClick={() => scrollToSection(section.id)}
                aria-current={activeSection === section.id ? "true" : undefined}
              >
                {section.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="outline" className="home-outline hidden sm:inline-flex" onClick={() => scrollToSection("contact")}>
              Contact
            </Button>
            <Popover open={loginOpen} onOpenChange={setLoginOpen}>
              <PopoverTrigger asChild>
                <Button className="home-cta" data-testid="button-header-login">
                  Login
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 overflow-hidden border border-border/70 bg-card p-0 shadow-lg" align="end">
                <div className="p-4 border-b border-border/70">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl text-white flex items-center justify-center bg-primary">
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="font-semibold font-heading text-foreground">Welcome Back</h3>
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
            <Button
              variant="outline"
              size="icon"
              className="home-nav-toggle md:hidden"
              aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              onClick={() => setMobileMenuOpen((prev) => !prev)}
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden px-4 sm:px-6 lg:px-8 pb-4">
            <div className="home-mobile-menu p-3">
              {NAV_SECTIONS.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  className={`home-mobile-link ${activeSection === section.id ? "is-active" : ""}`}
                  onClick={() => {
                    setMobileMenuOpen(false);
                    scrollToSection(section.id);
                  }}
                >
                  {section.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="relative z-10">
        <section className="px-4 pt-8 pb-16 sm:pt-12 sm:pb-20">
          <div className="max-w-6xl mx-auto grid gap-12 lg:grid-cols-[1.05fr_0.95fr] items-center">
            <motion.div {...reveal()} className="text-center lg:text-left">
              <span className="home-eyebrow">Operational Assurance for UK Care</span>
              <h1 className="home-text-heading mt-5 text-3xl sm:text-4xl lg:text-[3.25rem] font-heading font-bold leading-[1.1]">
                Compliance reporting that feels calm, clear, and prepared.
              </h1>
              <p className="home-text-body mt-6 text-lg max-w-xl mx-auto lg:mx-0 leading-relaxed">
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
                    <div className="home-text-soft flex items-center gap-2 text-xs font-medium">
                      <stat.icon className="h-4 w-4 text-slate-700" />
                      {stat.label}
                    </div>
                    <div className="home-text-heading mt-2 text-xl font-bold">{stat.value}</div>
                    <div className="home-text-soft text-xs font-medium mt-0.5">{stat.detail}</div>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div {...reveal(0.1)} className="relative">
              <div className="home-card p-6">
                <div className="space-y-4">
                  {HERO_ACTIVITY.map((item) => (
                    <div key={item.title} className={`home-signal home-signal-${item.tone}`}>
                      <div className="home-signal-icon">
                        <item.icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="home-signal-title">{item.title}</p>
                        <p className="home-signal-detail">{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="home-card-soft p-3 home-mini-stat">
                    <p className="text-xs">Live audits reviewed</p>
                    <p className="text-lg font-semibold">248</p>
                  </div>
                  <div className="home-card-soft p-3 home-mini-stat">
                    <p className="text-xs">Open issues flagged</p>
                    <p className="text-lg font-semibold">7</p>
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
              <h2 className="home-text-heading mt-4 text-3xl sm:text-4xl font-heading font-bold leading-tight">
                One workspace for audits, plans, and care delivery checks.
              </h2>
              <p className="home-text-body mt-4 text-base leading-relaxed">
                Replace scattered spreadsheets with a structured flow for every document.
                CareAssurance unifies analysis, notes, and follow-up actions so teams can move fast.
              </p>
              <div className="mt-6 space-y-3">
                {OVERVIEW_BULLETS.map((bullet) => (
                  <div key={bullet} className="flex items-start gap-3 text-sm">
                    <span className="home-icon-chip mt-0.5 h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0">
                      <CheckCircle2 className="h-3 w-3" />
                    </span>
                    <span className="home-text-body">{bullet}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div {...reveal(0.1)} className="grid gap-4">
              <div className="home-card p-5">
                <p className="home-eyebrow">Audit snapshot</p>
                <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="home-text-soft">Service users</p>
                    <p className="home-text-heading text-2xl font-semibold">52</p>
                  </div>
                  <div>
                    <p className="home-text-soft">Flagged calls</p>
                    <p className="home-text-heading text-2xl font-semibold">13</p>
                  </div>
                  <div>
                    <p className="home-text-soft">Avg start drift</p>
                    <p className="home-text-heading text-2xl font-semibold">+1h 3m</p>
                  </div>
                  <div>
                    <p className="home-text-soft">Avg duration</p>
                    <p className="home-text-heading text-2xl font-semibold">122%</p>
                  </div>
                </div>
              </div>
              <div className="home-card-soft p-5">
                <p className="home-text-soft text-xs uppercase tracking-[0.2em]">Included modules</p>
                <div className="home-text-heading mt-3 grid grid-cols-2 gap-3 text-sm">
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
              <p className="home-eyebrow text-white/70">Compliance foundations</p>
              <h2 className="mt-4 text-3xl sm:text-4xl font-heading font-bold leading-tight">
                Evidence you can stand behind.
              </h2>
              <p className="mt-4 max-w-2xl mx-auto leading-relaxed">
                Built for regulated care environments with clear governance controls and consistent reporting.
              </p>
            </motion.div>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {CERTIFICATIONS.map((item) => (
                <motion.div key={item.title} {...reveal(0.1)} className="rounded-2xl border border-white/15 bg-white/[0.07] backdrop-blur-sm p-6">
                  <div className="h-11 w-11 rounded-xl bg-white/10 flex items-center justify-center">
                    <item.icon className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-white">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/75">{item.description}</p>
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
              <h2 className="mt-4 text-3xl sm:text-4xl font-heading font-bold leading-tight home-text-heading">
                Every workflow your compliance team needs.
              </h2>
              <p className="mt-4 text-base max-w-2xl mx-auto leading-relaxed home-text-soft">
                Designed for UK care operations, from medication audits to staff performance monitoring.
              </p>
            </motion.div>
            <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {PRIMARY_FEATURES.map((feature) => (
                <motion.div key={feature.title} {...reveal(0.05)} className="home-card p-6">
                  <div className="flex items-center justify-between">
                    <div className="h-10 w-10 rounded-xl flex items-center justify-center home-icon-chip">
                      <feature.icon className="h-5 w-5" />
                    </div>
                    <span className="home-pill">{feature.tag}</span>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold home-text-heading">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed home-text-body">{feature.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-12 sm:py-16 home-section-surface">
          <div className="max-w-6xl mx-auto">
            <motion.div {...reveal()} className="text-center">
              <span className="home-eyebrow">How it works</span>
              <h2 className="mt-4 text-3xl sm:text-4xl font-heading font-bold leading-tight home-text-heading">
                Three steps to audit-ready compliance.
              </h2>
              <p className="mt-4 text-base max-w-2xl mx-auto leading-relaxed home-text-soft">
                No complex setup. Upload your existing documents and get actionable insights within minutes.
              </p>
            </motion.div>
            <div className="mt-12 grid gap-8 md:grid-cols-3 home-workflow-grid">
              {WORKFLOW_STEPS.map((step, index) => (
                <motion.div
                  key={step.step}
                  {...reveal(0.1)}
                  className={`relative p-6 rounded-xl border border-border home-workflow-card ${index > 0 ? "home-workflow-step" : ""}`}
                >
                  <div className="flex items-center gap-4 mb-4">
                    <span className="text-4xl font-bold text-muted-foreground/40">
                      {step.step}
                    </span>
                    <step.icon className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2 home-text-heading">{step.title}</h3>
                  <p className="text-sm leading-relaxed home-text-soft">{step.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section id="roi" className="px-4 py-12 sm:py-16">
          <div className="max-w-6xl mx-auto">
            <motion.div {...reveal()} className="text-center">
              <span className="home-eyebrow">Savings estimator</span>
              <h2 className="mt-4 text-3xl sm:text-4xl font-heading font-bold leading-tight home-text-heading">
                Model time savings in minutes.
              </h2>
              <p className="mt-4 text-base max-w-2xl mx-auto leading-relaxed home-text-soft">
                Estimate the annual hours recovered when audits and plans are streamlined.
              </p>
            </motion.div>

            <motion.div {...reveal(0.1)} className="home-card p-6 sm:p-8 mt-10">
              <div className="flex items-center justify-between mb-4">
                <Label className="text-base font-semibold home-text-heading">Number of Service Users</Label>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <span className="text-2xl font-bold home-text-heading" data-testid="text-service-users-count">
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
              <div className="flex justify-between text-xs mt-2 home-text-soft">
                <span>1</span>
                <span>50</span>
                <span>100</span>
                <span>150</span>
                <span>200</span>
              </div>

              <div className="mt-8 grid gap-4 md:grid-cols-4">
                <div className="home-card-soft p-4">
                  <p className="text-xs font-medium home-text-soft">Manual time</p>
                  <p className="text-2xl font-bold home-text-heading" data-testid="text-manual-hours">
                    {roi.manualHours.toLocaleString(undefined, { maximumFractionDigits: 0 })} hrs
                  </p>
                  <p className="text-xs font-medium home-text-soft">per year</p>
                </div>
                <div className="home-card-soft p-4">
                  <p className="text-xs font-medium home-text-soft">With CareAssurance</p>
                  <p className="text-2xl font-bold home-text-heading" data-testid="text-ai-hours">
                    {roi.aiHours.toLocaleString(undefined, { maximumFractionDigits: 0 })} hrs
                  </p>
                  <p className="text-xs font-medium home-text-soft">per year</p>
                </div>
                <div className="home-card-soft p-4">
                  <p className="text-xs font-medium home-text-soft">Time saved</p>
                  <p className="text-2xl font-bold text-green-600" data-testid="text-hours-saved">
                    {roi.hoursSaved.toLocaleString(undefined, { maximumFractionDigits: 0 })} hrs
                  </p>
                  <p className="text-xs font-medium home-text-soft">per year</p>
                </div>
                <div className="home-card-soft p-4">
                  <p className="text-xs font-medium home-text-soft">Money saved</p>
                  <p className="text-2xl font-bold text-green-600" data-testid="text-money-saved">
                    £{roi.moneySaved.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-xs font-medium home-text-soft">per year at £14.50/hr*</p>
                </div>
              </div>

              <div className="mt-6">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium home-text-soft">Efficiency gain</span>
                  <span className="font-bold text-green-600">{savingsPercent}% faster</span>
                </div>
                <div className="mt-3 h-2.5 rounded-full overflow-hidden bg-muted">
                  <div
                    className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-blue-500 to-green-600"
                    style={{ width: `${savingsPercent}%` }}
                  />
                </div>
                <p className="mt-3 text-xs home-text-soft">
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
                  <h2 className="mt-4 text-3xl sm:text-4xl font-heading font-bold leading-tight home-text-heading">
                    Speak with the CareAssurance team.
                  </h2>
                  <p className="mt-4 text-base leading-relaxed home-text-soft">
                    Share your compliance priorities and we will respond with a tailored walkthrough.
                  </p>
                  <div className="mt-6 space-y-3 text-sm home-text-body">
                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4 text-primary" />
                      Private response within 1 business day.
                    </div>
                    <div className="flex items-center gap-3">
                      <MessageSquare className="h-4 w-4 text-primary" />
                      Share audit goals, EMAR challenges, or care plan needs.
                    </div>
                    <div className="flex items-center gap-3">
                      <Building2 className="h-4 w-4 text-primary" />
                      UK-based support for care facilities.
                    </div>
                  </div>
                </div>

                <div>
                  {contactSuccess ? (
                    <div className="home-card-soft p-6">
                      <div className="flex items-center gap-2 home-text-heading">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <span className="font-semibold">Message sent</span>
                      </div>
                      <p className="mt-2 text-sm home-text-soft">
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
                          <Label htmlFor="contact-name" className="text-sm home-text-heading">Name *</Label>
                          <Input
                            id="contact-name"
                            placeholder="Your name"
                            value={contactName}
                            onChange={(e) => setContactName(e.target.value)}
                            required
                            className="bg-muted/50 text-foreground"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="contact-email" className="text-sm home-text-heading">Email *</Label>
                          <Input
                            id="contact-email"
                            type="email"
                            placeholder="you@example.com"
                            value={contactEmail}
                            onChange={(e) => setContactEmail(e.target.value)}
                            required
                            className="bg-muted/50 text-foreground"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="contact-org" className="text-sm home-text-heading">Organisation</Label>
                        <Input
                          id="contact-org"
                          placeholder="Your care facility or company"
                          value={contactOrg}
                          onChange={(e) => setContactOrg(e.target.value)}
                          className="bg-muted/50 text-foreground"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="contact-message" className="text-sm home-text-heading">Message *</Label>
                        <Textarea
                          id="contact-message"
                          placeholder="Tell us what you are looking for..."
                          value={contactMessage}
                          onChange={(e) => setContactMessage(e.target.value)}
                          required
                          rows={4}
                          className="bg-muted/50 text-foreground resize-none"
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
                      <div className="flex items-center gap-2 home-text-heading">
                        <ClipboardCheck className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold">Contact form disabled</span>
                      </div>
                      <p className="mt-2 text-sm home-text-soft">
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

      <footer className="relative z-10 border-t border-border">
        <div className="max-w-6xl mx-auto px-4 py-10 flex flex-col md:flex-row items-center justify-between gap-6 text-sm">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl text-white flex items-center justify-center bg-blue-500">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <span className="font-semibold home-text-heading">CareAssurance</span>
              <span className="ml-2 home-text-soft">careassurance.uk</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-6 home-text-soft">
            <button
              type="button"
              className="bg-transparent p-0 font-medium hover:text-foreground transition-colors"
              onClick={() => scrollToSection("contact")}
            >
              Contact
            </button>
            <Link href="/terms" className="font-medium hover:text-foreground transition-colors">
              Terms & Conditions
            </Link>
            <Link href="/privacy" className="font-medium hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
