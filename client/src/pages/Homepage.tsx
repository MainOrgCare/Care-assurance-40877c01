import { useCallback, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { motion, useReducedMotion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { 
  ShieldCheck, 
  FileSearch, 
  Brain, 
  ClipboardCheck, 
  Users, 
  TrendingUp,
  Lock,
  ArrowRight,
  CheckCircle2,
  Zap,
  Clock,
  Award,
  Sparkles,
  ChevronRight,
  BarChart3,
  FileText,
  User,
  KeyRound,
  Loader2,
  Building2,
  Activity,
  Timer,
  Target,
  AlertTriangle,
  HeartHandshake,
  Calculator,
  PoundSterling
} from "lucide-react";

const HOURLY_RATE = 14.5;

const TASKS = {
  carePlan: { name: "Care Plans", manualMins: 90, aiSecs: 60, perYear: 12 },
  initialAssessment: { name: "Initial Assessments", manualMins: 150, aiSecs: 90, perYear: 1 },
  riskAssessment: { name: "Risk Assessments", manualMins: 180, aiSecs: 120, perYear: 2 },
  emar: { name: "EMAR Audits", manualMins: 45, aiSecs: 30, perYear: 48 },
  visitAudit: { name: "Visit Audits", manualMins: 30, aiSecs: 30, perYear: 48 },
} as const;

const FEATURES = [
  {
    icon: FileSearch,
    title: "EMAR Auditing",
    description: "Surface medication discrepancies you might not spot manually. Our AI helps analyse EMAR records, flagging potential issues and refusals for your review.",
    highlight: "AI-Assisted",
    benefit: "Faster record reviews",
  },
  {
    icon: Brain,
    title: "AI Care Plan Generator",
    description: "Generate draft care plans in minutes rather than hours. Our AI creates person-centred documentation across 11 sections for your review and approval.",
    highlight: "AI-Powered",
    benefit: "Streamlined documentation",
  },
  {
    icon: ClipboardCheck,
    title: "Compliance Dashboard",
    description: "Keep track of your compliance status in one place. Monitor key metrics and identify areas that may need attention before your next inspection.",
    highlight: "Centralised View",
    benefit: "Better visibility",
  },
  {
    icon: Users,
    title: "Staff Performance Analytics",
    description: "Track care worker metrics and identify potential training opportunities. Review performance patterns to support your team more effectively.",
    highlight: "Real-Time Insights",
    benefit: "Data-driven decisions",
  },
  {
    icon: TrendingUp,
    title: "Time Savings Calculator",
    description: "Estimate potential time savings based on your facility size. See how AI-assisted workflows may reduce administrative burden.",
    highlight: "Estimated Savings",
    benefit: "Plan your efficiency",
  },
  {
    icon: Lock,
    title: "Security Features",
    description: "Built with data protection in mind. Features include encryption, automatic PII handling, and audit trails to support your data governance.",
    highlight: "Privacy-Focused",
    benefit: "Data protection support",
  },
] as const;

const STATS = [
  { value: "Minutes", label: "Not Hours Per Audit", icon: Clock },
  { value: "11", label: "Care Plan Sections", icon: FileText },
  { value: "UK", label: "Care-Focused Design", icon: Building2 },
  { value: "24/7", label: "Access Anytime", icon: ShieldCheck },
] as const;

const WHY_CHOOSE = [
  {
    icon: Target,
    title: "Designed for UK Care",
    description: "Built with UK care facility workflows in mind. Features are shaped around the practical challenges care teams face with documentation and record-keeping.",
  },
  {
    icon: Brain,
    title: "AI-Assisted Analysis",
    description: "Our multi-pass AI system helps surface potential discrepancies that may be difficult to spot when reviewing records manually.",
  },
  {
    icon: Timer,
    title: "Quick to Get Started",
    description: "No lengthy setup required. Upload your first document and start exploring insights. Most users are up and running within a single session.",
  },
  {
    icon: HeartHandshake,
    title: "UK-Based Support",
    description: "Our team understands the UK care sector. We provide hands-on support from people who know the challenges you face.",
  },
] as const;

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Upload Your Records",
    description: "Simply drag and drop your EMAR sheets, care plans, or documentation. We support PDFs, images, and spreadsheets.",
    icon: FileSearch,
  },
  {
    step: "02",
    title: "AI-Assisted Analysis",
    description: "Our multi-pass AI reviews records and flags potential discrepancies for your attention, helping you focus on what matters.",
    icon: Brain,
  },
  {
    step: "03",
    title: "Review and Act",
    description: "Review prioritised findings with severity ratings. Export reports and address issues with greater confidence.",
    icon: ClipboardCheck,
  },
] as const;

const FEATURE_STYLES = [
  {
    accent: "from-emerald-500/20 via-emerald-500/5 to-transparent",
    icon: "text-emerald-300",
    badge: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  },
  {
    accent: "from-sky-500/20 via-sky-500/5 to-transparent",
    icon: "text-sky-300",
    badge: "bg-sky-500/10 text-sky-300 border-sky-500/20",
  },
  {
    accent: "from-amber-500/20 via-amber-500/5 to-transparent",
    icon: "text-amber-300",
    badge: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  },
  {
    accent: "from-teal-500/20 via-teal-500/5 to-transparent",
    icon: "text-teal-300",
    badge: "bg-teal-500/10 text-teal-300 border-teal-500/20",
  },
  {
    accent: "from-cyan-500/20 via-cyan-500/5 to-transparent",
    icon: "text-cyan-300",
    badge: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20",
  },
  {
    accent: "from-rose-500/20 via-rose-500/5 to-transparent",
    icon: "text-rose-300",
    badge: "bg-rose-500/10 text-rose-300 border-rose-500/20",
  },
] as const;

const WHY_STYLES = [
  {
    accent: "from-emerald-500/20 via-emerald-500/5 to-transparent",
    icon: "text-emerald-300",
    iconBg: "from-emerald-500/20 to-emerald-500/10",
  },
  {
    accent: "from-sky-500/20 via-sky-500/5 to-transparent",
    icon: "text-sky-300",
    iconBg: "from-sky-500/20 to-sky-500/10",
  },
  {
    accent: "from-amber-500/20 via-amber-500/5 to-transparent",
    icon: "text-amber-300",
    iconBg: "from-amber-500/20 to-amber-500/10",
  },
  {
    accent: "from-teal-500/20 via-teal-500/5 to-transparent",
    icon: "text-teal-300",
    iconBg: "from-teal-500/20 to-teal-500/10",
  },
] as const;

const FADE_IN_UP = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 },
} as const;

const STAGGER_CONTAINER = {
  animate: {
    transition: {
      staggerChildren: 0.1,
    },
  },
} as const;

const TRUSTED_FEATURES = [
  "EMAR Analysis",
  "Care Plan Drafting",
  "Risk Assessments",
  "Visit Audits",
  "Staff Analytics",
] as const;

const HERO_METRICS = [
  { label: "Avg audit time", value: "6 min", detail: "from 45 min", icon: Timer },
  { label: "Care plan sections", value: "11", detail: "auto-drafted", icon: FileText },
  { label: "Records parsed", value: "98%", detail: "structured capture", icon: BarChart3 },
  { label: "UK-ready", value: "CQC focus", detail: "audit trails", icon: ShieldCheck },
] as const;

const AUDIT_SIGNALS = [
  { label: "Missed doses", value: "2", tone: "rose", icon: AlertTriangle },
  { label: "PRN refusals", value: "1", tone: "amber", icon: Activity },
  { label: "Late entries", value: "3", tone: "sky", icon: Clock },
] as const;

const AUDIT_FINDINGS = [
  { title: "Lansoprazole", detail: "Thu 04 Dec • 08:00", severity: "high" },
  { title: "Paracetamol PRN", detail: "Wed 03 Dec • 20:30", severity: "medium" },
  { title: "Amlodipine", detail: "Tue 02 Dec • 08:00", severity: "low" },
] as const;

const INSIGHT_BULLETS = [
  {
    title: "Auto-prioritised risks",
    description: "Surface refusals, omissions, and PRN patterns with severity scoring.",
    icon: AlertTriangle,
  },
  {
    title: "Inspection-ready evidence",
    description: "Export clear audit trails with timestamps, staff initials, and notes.",
    icon: ClipboardCheck,
  },
  {
    title: "Trend monitoring",
    description: "Track recurring issues and spot areas that need coaching.",
    icon: BarChart3,
  },
] as const;

const READINESS_TREND = [68, 74, 71, 80, 86, 92] as const;
const READINESS_SCORE = 92;

const RISK_BREAKDOWN = [
  { label: "High", value: 2, tone: "rose" },
  { label: "Medium", value: 4, tone: "amber" },
  { label: "Low", value: 7, tone: "emerald" },
] as const;

const ACTION_QUEUE = [
  { title: "PRN refusal follow-up", detail: "Paracetamol • Tue 02 Dec", severity: "medium" },
  { title: "Missed morning dose", detail: "Lisinopril • Thu 04 Dec", severity: "high" },
  { title: "Late entry review", detail: "Amlodipine • Wed 03 Dec", severity: "low" },
] as const;

const SIGNAL_TONE_STYLES = {
  rose: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  sky: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
} as const;

const FINDING_STYLES = {
  high: "border-rose-500/30 bg-rose-500/10 text-rose-200",
  medium: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  low: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
} as const;

const PARTICLE_COUNT = 16;

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

const generateParticleStyles = () =>
  Array.from({ length: PARTICLE_COUNT }, () => ({
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    animationDelay: `${Math.random() * 20}s`,
    animationDuration: `${10 + Math.random() * 15}s`,
  }));

export default function Homepage() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [serviceUsers, setServiceUsers] = useState(20);
  const prefersReducedMotion = useReducedMotion();

  const roi = useMemo(() => calculateROI(serviceUsers), [serviceUsers]);
  const savingsPercent = useMemo(() => {
    if (roi.manualHours <= 0) return 0;
    const percent = (roi.hoursSaved / roi.manualHours) * 100;
    return Math.min(100, Math.max(0, Math.round(percent)));
  }, [roi]);
  const particleStyles = useMemo(
    () => (prefersReducedMotion ? [] : generateParticleStyles()),
    [prefersReducedMotion]
  );

  const getRevealProps = useCallback(
    (delay = 0) =>
      prefersReducedMotion
        ? {}
        : {
            initial: { opacity: 0, y: 30 },
            animate: { opacity: 1, y: 0 },
            transition: { duration: 0.6, delay },
          },
    [prefersReducedMotion]
  );

  const getInViewProps = useCallback(
    (delay = 0, offset = 20) =>
      prefersReducedMotion
        ? {}
        : {
            initial: { opacity: 0, y: offset },
            whileInView: { opacity: 1, y: 0 },
            viewport: { once: true },
            transition: { duration: 0.5, delay },
          },
    [prefersReducedMotion]
  );

  const listMotionConfig = useMemo(
    () =>
      prefersReducedMotion
        ? {}
        : { initial: "initial", whileInView: "animate", viewport: { once: true } },
    [prefersReducedMotion]
  );

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const success = await login(username, password);
    setLoading(false);
    if (success) {
      setLoginOpen(false);
      setLocation("/dashboard");
    }
  }, [login, password, setLocation, username]);

  const handleServiceUsersChange = useCallback((value: number[]) => {
    setServiceUsers(value[0]);
  }, []);

  return (
    <div className="min-h-screen flex flex-col relative overflow-x-hidden bg-background">
      {/* Animated Gradient Background */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-muted/30 to-background" />
        <motion.div 
          className="hidden sm:block absolute top-10 left-[18%] w-[420px] h-[420px] bg-blue-600/12 rounded-full blur-3xl"
          animate={prefersReducedMotion ? undefined : { 
            x: [0, 24, 0],
            y: [0, 18, 0]
          }}
          transition={prefersReducedMotion ? undefined : { duration: 28, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div 
          className="hidden sm:block absolute bottom-10 right-[12%] w-[360px] h-[360px] bg-teal-500/12 rounded-full blur-3xl"
          animate={prefersReducedMotion ? undefined : { 
            x: [0, -20, 0],
            y: [0, -18, 0]
          }}
          transition={prefersReducedMotion ? undefined : { duration: 30, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* Grid Pattern Overlay */}
      <div 
        className="fixed inset-0 z-0 opacity-[0.015] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}
      />

      {/* Floating Particles */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden hidden md:block">
        {particleStyles.map((style, i) => (
          <div key={i} className="particle-field" style={style} />
        ))}
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border/50 backdrop-blur-xl bg-background/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-teal-500/20">
                <ShieldCheck className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl text-foreground">
                <span className="font-bold">Care</span><span className="font-normal">Assurance</span>
              </span>
            </div>

            <div className="flex items-center gap-3">
              <Popover open={loginOpen} onOpenChange={setLoginOpen}>
                <PopoverTrigger asChild>
                  <Button 
                    className="bg-gradient-to-r from-blue-600 to-teal-500 hover:opacity-95 text-white font-medium shadow-lg shadow-blue-900/30 transition-opacity"
                    data-testid="button-header-login"
                  >
                    Login
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0 border-border/50 bg-card/95 backdrop-blur-xl" align="end">
                  <div className="p-4 border-b border-border/50">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center">
                        <ShieldCheck className="h-4 w-4 text-white" />
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
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                          id="login-username"
                          placeholder="Enter username"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          required
                          autoComplete="username"
                          className="pl-10 bg-muted/50 border-border/50"
                          data-testid="input-dropdown-username"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="login-password" className="text-sm text-muted-foreground">Password</Label>
                      <div className="relative">
                        <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                          id="login-password"
                          type="password"
                          placeholder="Enter password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          autoComplete="current-password"
                          className="pl-10 bg-muted/50 border-border/50"
                          data-testid="input-dropdown-password"
                        />
                      </div>
                    </div>
                    <Button 
                      type="submit"
                      className="w-full bg-gradient-to-r from-blue-600 to-teal-500 hover:opacity-95 text-white font-medium transition-opacity"
                      disabled={loading}
                      data-testid="button-dropdown-submit"
                    >
                      {loading ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="animate-spin h-4 w-4" /> Signing in...
                        </span>
                      ) : "Sign In"}
                    </Button>
                  </form>
                  <div className="px-4 pb-4 text-center">
                    <p className="text-xs text-muted-foreground">
                      Need access? Contact your administrator
                    </p>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 px-4 pt-16 pb-20 sm:pt-24 sm:pb-28">
        <div className="max-w-6xl mx-auto">
          <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="text-center lg:text-left">
              <motion.div {...getRevealProps()}>
                <Badge variant="secondary" className="mb-6 px-4 py-1.5 text-xs uppercase tracking-[0.3em] bg-teal-500/10 text-teal-300 border-teal-500/20">
                  <Sparkles className="h-3 w-3 mr-2" />
                  AI Compliance Copilot
                </Badge>
              </motion.div>

              <motion.h1 
                className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-foreground mb-6 leading-[1.05] tracking-tight"
                {...getRevealProps(0.1)}
              >
                Spot Compliance Risks{" "}
                <span className="gradient-text">
                  Before They Escalate
                </span>
              </motion.h1>

              <motion.p 
                className="text-lg sm:text-xl text-muted-foreground mb-6 max-w-2xl lg:max-w-none leading-relaxed"
                {...getRevealProps(0.2)}
              >
                CareAssurance brings your EMARs, care plans, and audits into one intelligent flow.
                See high-risk patterns sooner, respond faster, and walk into inspections prepared.
              </motion.p>

              <motion.div 
                className="flex flex-wrap items-center justify-center lg:justify-start gap-3 mb-10"
                {...getRevealProps(0.25)}
              >
                <Badge variant="outline" className="text-xs px-3 py-1 border-emerald-500/30 text-emerald-300 bg-emerald-500/10">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Built for UK Care
                </Badge>
                <Badge variant="outline" className="text-xs px-3 py-1 border-sky-500/30 text-sky-300 bg-sky-500/10">
                  <Lock className="h-3 w-3 mr-1" />
                  Privacy-First Processing
                </Badge>
                <Badge variant="outline" className="text-xs px-3 py-1 border-blue-500/30 text-blue-300 bg-blue-500/10">
                  <ShieldCheck className="h-3 w-3 mr-1" />
                  Audit-Ready Trails
                </Badge>
              </motion.div>

              <motion.div 
                className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 mb-4"
                {...getRevealProps(0.3)}
              >
                <Button 
                  size="lg"
                  className="bg-gradient-to-r from-blue-600 to-teal-500 hover:opacity-95 text-white font-semibold shadow-xl shadow-blue-900/40 px-8 h-12 text-base relative overflow-hidden group transition-opacity"
                  data-testid="button-hero-login"
                  onClick={() => setLoginOpen(true)}
                >
                  <span className="relative z-10">Login</span>
                  <ArrowRight className="ml-2 h-5 w-5 relative z-10 group-hover:translate-x-1 transition-transform" />
                </Button>
                <Button 
                  variant="outline" 
                  size="lg"
                  className="h-12 px-6 text-base border-border/50 bg-background/50 backdrop-blur-sm hover:bg-background/80 transition-all duration-300"
                  onClick={() => document.getElementById('roi-calculator')?.scrollIntoView({ behavior: 'smooth' })}
                  data-testid="button-hero-roi"
                >
                  <TrendingUp className="mr-2 h-5 w-5" />
                  Calculate Your ROI
                </Button>
              </motion.div>

              <motion.div
                className="flex flex-wrap items-center justify-center lg:justify-start gap-3 text-xs text-muted-foreground mb-8"
                {...getRevealProps(0.35)}
              >
                <Link
                  href="/terms"
                  className="hover:text-foreground transition-colors"
                  data-testid="link-hero-terms"
                >
                  Terms & Conditions
                </Link>
                <span className="text-muted-foreground/60">•</span>
                <Link
                  href="/privacy"
                  className="hover:text-foreground transition-colors"
                  data-testid="link-hero-privacy"
                >
                  Privacy Policy
                </Link>
              </motion.div>

              <motion.div 
                className="grid grid-cols-2 gap-4 sm:grid-cols-4"
                {...getRevealProps(0.4)}
              >
                {HERO_METRICS.map((metric) => (
                  <div key={metric.label} className="rounded-xl border border-border/50 bg-card/40 px-4 py-3 text-left">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <metric.icon className="h-4 w-4 text-teal-300" />
                      {metric.label}
                    </div>
                    <div className="mt-2 text-lg font-semibold text-foreground">{metric.value}</div>
                    <div className="text-[11px] text-muted-foreground/80">{metric.detail}</div>
                  </div>
                ))}
              </motion.div>
            </div>

            <motion.div 
              className="relative"
              {...getRevealProps(0.45)}
            >
              <div className="absolute -inset-6 rounded-[32px] bg-gradient-to-br from-blue-600/25 via-teal-500/10 to-emerald-500/20 blur-3xl opacity-70" />
              <Card className="relative border border-border/60 bg-card/40 backdrop-blur-xl">
                <CardContent className="p-6 sm:p-7">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Live Audit</p>
                      <h3 className="mt-2 text-xl font-semibold text-foreground">Freda O'Neill</h3>
                      <p className="text-xs text-muted-foreground">7-day snapshot • Week 48</p>
                    </div>
                    <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20">
                      Live
                    </Badge>
                  </div>

                  <div className="mt-6 grid grid-cols-3 gap-3">
                    {AUDIT_SIGNALS.map((signal) => (
                      <div
                        key={signal.label}
                        className={`rounded-lg border px-3 py-3 text-center ${SIGNAL_TONE_STYLES[signal.tone]}`}
                      >
                        <signal.icon className="mx-auto mb-2 h-4 w-4" />
                        <div className="text-lg font-semibold">{signal.value}</div>
                        <div className="text-[11px] text-muted-foreground/80">{signal.label}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 space-y-3">
                    {AUDIT_FINDINGS.map((finding) => (
                      <div
                        key={finding.title}
                        className="flex items-center gap-3 rounded-lg border border-border/50 bg-background/40 px-3 py-2.5"
                      >
                        <div className={`h-2 w-2 rounded-full ${finding.severity === "high" ? "bg-rose-300 shadow-[0_0_12px_rgba(251,113,133,0.5)]" : finding.severity === "medium" ? "bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.5)]" : "bg-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.5)]"}`} />
                        <div>
                          <div className="text-sm font-medium text-foreground">{finding.title}</div>
                          <div className="text-xs text-muted-foreground">{finding.detail}</div>
                        </div>
                        <Badge
                          variant="outline"
                          className={`ml-auto text-[10px] uppercase tracking-wide ${FINDING_STYLES[finding.severity]}`}
                        >
                          {finding.severity}
                        </Badge>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.6)]" />
                      Updated 2 mins ago
                    </span>
                    <span className="flex items-center gap-2">
                      <Activity className="h-3.5 w-3.5 text-teal-300" />
                      Auto-triage enabled
                    </span>
                  </div>
                </CardContent>
              </Card>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border/50 bg-background/40 px-4 py-3">
                  <div className="text-xs text-muted-foreground">Compliance Score</div>
                  <div className="mt-1 text-lg font-semibold text-foreground">92%</div>
                </div>
                <div className="rounded-lg border border-border/50 bg-background/40 px-4 py-3">
                  <div className="text-xs text-muted-foreground">Next Review</div>
                  <div className="mt-1 text-lg font-semibold text-foreground">21 days</div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Trusted By Section */}
      <section className="relative z-10 py-8 px-4 border-y border-border/30 bg-muted/10 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto">
          <motion.div
            className="text-center"
            {...getInViewProps(0, 0)}
          >
            <p className="text-sm text-muted-foreground mb-6">
              Key features designed for UK care facilities
            </p>
            <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12">
              {TRUSTED_FEATURES.map((feature, i) => (
                <div 
                  key={i}
                  className="flex items-center gap-2 rounded-full border border-border/40 bg-background/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70 transition-colors hover:text-foreground"
                >
                  <CheckCircle2 className="h-4 w-4 text-teal-300" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="relative z-10 py-16 px-4 bg-muted/20 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto">
          <motion.div 
            className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8"
            variants={STAGGER_CONTAINER}
            {...listMotionConfig}
          >
            {STATS.map((stat, index) => (
              <motion.div 
                key={index}
                className="rounded-2xl border border-border/50 bg-card/40 p-6 text-center backdrop-blur-xl shadow-[0_20px_60px_rgba(10,20,40,0.25)]"
                variants={FADE_IN_UP}
              >
                <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-500/20 to-teal-500/20 mb-4">
                  <stat.icon className="h-6 w-6 text-teal-300" />
                </div>
                <div className="text-3xl sm:text-4xl font-bold text-foreground mb-1 bg-gradient-to-r from-blue-400 to-teal-400 bg-clip-text text-transparent">
                  {stat.value}
                </div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground/80">{stat.label}</div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Why Choose Section */}
      <section className="relative z-10 py-20 sm:py-28 px-4">
        <div className="max-w-6xl mx-auto">
          <motion.div 
            className="text-center mb-16"
            {...getInViewProps()}
          >
            <Badge variant="secondary" className="mb-4 px-3 py-1 text-xs bg-sky-500/10 text-sky-300 border-sky-500/20">
              <Award className="h-3 w-3 mr-1" />
              Why Choose Us
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Built Different. Built Better.
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Purpose-built for UK care homes, CareAssurance keeps documentation, audits, and follow-ups in sync.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {WHY_CHOOSE.map((item, index) => (
              <motion.div 
                key={index}
                {...getInViewProps(index * 0.1)}
              >
                <Card className="relative h-full overflow-hidden border border-border/50 bg-card/30 backdrop-blur-xl">
                  <div className={`absolute inset-0 bg-gradient-to-br ${WHY_STYLES[index % WHY_STYLES.length].accent} opacity-60`} />
                  <div className="absolute -right-16 -top-16 h-32 w-32 rounded-full bg-white/5 blur-2xl" />
                  <CardContent className="relative z-10 p-6">
                    <div className="flex items-start gap-4">
                      <div className={`h-12 w-12 rounded-2xl bg-gradient-to-br ${WHY_STYLES[index % WHY_STYLES.length].iconBg} flex items-center justify-center flex-shrink-0`}>
                        <item.icon className={`h-6 w-6 ${WHY_STYLES[index % WHY_STYLES.length].icon}`} />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-foreground mb-2">{item.title}</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="relative z-10 py-20 sm:py-28 px-4 bg-muted/10">
        <div className="max-w-6xl mx-auto">
          <motion.div 
            className="text-center mb-16"
            {...getInViewProps()}
          >
            <Badge variant="secondary" className="mb-4 px-3 py-1 text-xs bg-blue-500/10 text-blue-400 border-blue-500/20">
              <Zap className="h-3 w-3 mr-1" />
              Quick Start
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Up and Running in Minutes
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              No complex setup. No lengthy training. Start seeing results from day one.
            </p>
          </motion.div>

          <div className="relative">
            <div className="pointer-events-none absolute left-6 right-6 top-1/2 hidden h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-border/60 to-transparent md:block" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
              {HOW_IT_WORKS.map((item, index) => (
                <motion.div 
                  key={index}
                  className="relative"
                  {...getInViewProps(index * 0.1)}
                >
                  <Card className="h-full border border-border/50 bg-card/30 backdrop-blur-xl overflow-visible">
                    <CardContent className="p-6 pt-8">
                      <div className="absolute -top-4 left-6">
                        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-600 to-teal-500 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-blue-900/30">
                          {item.step}
                        </div>
                      </div>
                      <div className="mt-4">
                        <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-500/10 to-teal-500/10 flex items-center justify-center mb-4">
                          <item.icon className="h-6 w-6 text-teal-300" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground mb-2">{item.title}</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                      </div>
                    </CardContent>
                  </Card>
                  {index < HOW_IT_WORKS.length - 1 && (
                    <div className="hidden md:block absolute top-1/2 -right-4 transform -translate-y-1/2 z-10">
                      <ChevronRight className="h-6 w-6 text-border" />
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Operational Readiness Section */}
      <section className="relative z-10 py-20 sm:py-28 px-4">
        <div className="max-w-6xl mx-auto">
          <motion.div 
            className="text-center mb-14"
            {...getInViewProps()}
          >
            <Badge variant="secondary" className="mb-4 px-3 py-1 text-xs bg-emerald-500/10 text-emerald-300 border-emerald-500/20">
              <ClipboardCheck className="h-3 w-3 mr-1" />
              Operational Readiness
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Turn Records Into Inspection-Ready Evidence
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Get a live view of compliance risk, action queues, and trends without manual checks.
            </p>
          </motion.div>

          <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
            <motion.div {...getInViewProps(0.1)} className="space-y-6">
              <Card className="border border-border/50 bg-card/30 backdrop-blur-xl">
                <CardContent className="p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-4">What you gain</h3>
                  <div className="space-y-4">
                    {INSIGHT_BULLETS.map((bullet) => (
                      <div key={bullet.title} className="flex items-start gap-3">
                        <div className="mt-1 h-7 w-7 rounded-full border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center">
                          <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{bullet.title}</p>
                          <p className="text-sm text-muted-foreground">{bullet.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-border/50 bg-card/30 backdrop-blur-xl">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Risk Breakdown</p>
                      <h3 className="text-lg font-semibold text-foreground">Open issues</h3>
                    </div>
                    <Badge variant="outline" className="text-[10px] border-border/50 text-muted-foreground">
                      Last 7 days
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {RISK_BREAKDOWN.map((risk) => (
                      <div
                        key={risk.label}
                        className={`rounded-xl border px-3 py-3 text-center ${SIGNAL_TONE_STYLES[risk.tone]}`}
                      >
                        <div className="text-lg font-semibold">{risk.value}</div>
                        <div className="text-[11px] text-muted-foreground/80">{risk.label}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div {...getInViewProps(0.15)} className="space-y-6">
              <Card className="border border-border/50 bg-card/30 backdrop-blur-xl">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Readiness Trend</p>
                      <h3 className="text-lg font-semibold text-foreground">Compliance score</h3>
                    </div>
                    <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20">
                      +14% this week
                    </Badge>
                  </div>
                  <div className="mt-6 flex items-end gap-3 h-28">
                    {READINESS_TREND.map((value, index) => (
                      <div key={`${value}-${index}`} className="flex-1">
                        <div className="h-full rounded-full bg-muted/30 flex items-end">
                          <div
                            className="w-full rounded-full bg-gradient-to-t from-teal-400/80 to-sky-400/80"
                            style={{ height: `${value}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Mon</span>
                    <span>Tue</span>
                    <span>Wed</span>
                    <span>Thu</span>
                    <span>Fri</span>
                    <span>Sat</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-border/50 bg-card/30 backdrop-blur-xl">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Action Queue</p>
                      <h3 className="text-lg font-semibold text-foreground">Next steps</h3>
                    </div>
                    <Badge variant="outline" className="text-[10px] border-border/50 text-muted-foreground">
                      3 tasks
                    </Badge>
                  </div>
                  <div className="space-y-3">
                    {ACTION_QUEUE.map((item) => (
                      <div
                        key={item.title}
                        className="flex items-center gap-3 rounded-lg border border-border/50 bg-background/40 px-3 py-2.5"
                      >
                        <div className="h-2 w-2 rounded-full bg-teal-300 shadow-[0_0_12px_rgba(45,212,191,0.6)]" />
                        <div>
                          <div className="text-sm font-medium text-foreground">{item.title}</div>
                          <div className="text-xs text-muted-foreground">{item.detail}</div>
                        </div>
                        <Badge
                          variant="outline"
                          className={`ml-auto text-[10px] uppercase tracking-wide ${FINDING_STYLES[item.severity]}`}
                        >
                          {item.severity}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative z-10 py-20 sm:py-28 px-4">
        <div className="max-w-7xl mx-auto">
          <motion.div 
            className="text-center mb-16"
            {...getInViewProps()}
          >
            <Badge variant="secondary" className="mb-4 px-3 py-1 text-xs bg-teal-500/10 text-teal-400 border-teal-500/20">
              <BarChart3 className="h-3 w-3 mr-1" />
              Complete Platform
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Everything Your Team Needs in One Place
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Bring auditing, care planning, and staff insights together so your team spends less time on paperwork.
            </p>
          </motion.div>

          <motion.div 
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            variants={STAGGER_CONTAINER}
            {...listMotionConfig}
          >
            {FEATURES.map((feature, index) => (
              <motion.div key={index} variants={FADE_IN_UP}>
                <Card className="relative h-full overflow-hidden border border-border/50 bg-card/30 backdrop-blur-xl group transition-all duration-300 hover:border-teal-500/30">
                  <div className={`absolute inset-0 bg-gradient-to-br ${FEATURE_STYLES[index % FEATURE_STYLES.length].accent} opacity-0 transition-opacity duration-300 group-hover:opacity-100`} />
                  <CardContent className="p-6 relative z-10">
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-500/10 to-teal-500/10 flex items-center justify-center transition-opacity duration-200 flex-shrink-0">
                        <feature.icon className={`h-6 w-6 ${FEATURE_STYLES[index % FEATURE_STYLES.length].icon} transition-colors`} />
                      </div>
                      <Badge variant="secondary" className={`text-[10px] ${FEATURE_STYLES[index % FEATURE_STYLES.length].badge}`}>
                        {feature.highlight}
                      </Badge>
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2 group-hover:text-teal-200 transition-colors">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-3">{feature.description}</p>
                    <div className="flex items-center gap-1 text-xs text-teal-400 group-hover:text-teal-300 transition-colors">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>{feature.benefit}</span>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Inspection Snapshot Section */}
      <section className="relative z-10 py-20 sm:py-28 px-4 bg-muted/5">
        <div className="max-w-6xl mx-auto grid gap-12 lg:grid-cols-[0.95fr_1.05fr] items-center">
          <motion.div {...getInViewProps()}>
            <Badge variant="secondary" className="mb-4 px-3 py-1 text-xs bg-emerald-500/10 text-emerald-300 border-emerald-500/20">
              <ShieldCheck className="h-3 w-3 mr-1" />
              Inspection Snapshot
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Stay audit-ready without the scramble.
            </h2>
            <p className="text-muted-foreground max-w-xl">
              A clear, weekly readiness view that makes it easier to explain decisions,
              resolve issues quickly, and keep staff aligned.
            </p>

            <div className="mt-8 space-y-4">
              {INSIGHT_BULLETS.map((bullet) => (
                <div
                  key={bullet.title}
                  className="flex gap-4 rounded-2xl border border-border/50 bg-card/30 p-4 backdrop-blur-xl"
                >
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500/10 to-teal-500/10 flex items-center justify-center">
                    <bullet.icon className="h-5 w-5 text-teal-300" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground">{bullet.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{bullet.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div {...getInViewProps(0.15)}>
            <Card className="relative border border-border/60 bg-card/40 backdrop-blur-xl">
              <CardContent className="p-6 sm:p-8 space-y-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Readiness Report</p>
                    <h3 className="mt-2 text-xl font-semibold text-foreground">Week 48 Overview</h3>
                    <p className="text-xs text-muted-foreground">7 days • 14 medications</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-300 bg-emerald-500/10">
                    Updated today
                  </Badge>
                </div>

                <div className="rounded-2xl border border-border/50 bg-background/40 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Readiness score</span>
                    <span className="text-xl font-semibold text-foreground">{READINESS_SCORE}%</span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-muted/40 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-teal-400 to-sky-400 transition-all duration-500"
                      style={{ width: `${READINESS_SCORE}%` }}
                    />
                  </div>
                  <div className="mt-3 flex items-end gap-2">
                    {READINESS_TREND.map((value, index) => (
                      <div
                        key={`${value}-${index}`}
                        className="flex-1 rounded-sm bg-emerald-500/20"
                        style={{ height: `${value}%` }}
                      />
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {RISK_BREAKDOWN.map((item) => (
                    <div
                      key={item.label}
                      className={`rounded-xl border px-3 py-3 text-center ${SIGNAL_TONE_STYLES[item.tone]}`}
                    >
                      <div className="text-lg font-semibold">{item.value}</div>
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground/80">{item.label}</div>
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  {ACTION_QUEUE.map((item) => (
                    <div
                      key={item.title}
                      className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/40 px-3 py-2.5"
                    >
                      <div className="h-2 w-2 rounded-full bg-teal-300 shadow-[0_0_12px_rgba(45,212,191,0.6)]" />
                      <div>
                        <div className="text-sm font-medium text-foreground">{item.title}</div>
                        <div className="text-xs text-muted-foreground">{item.detail}</div>
                      </div>
                      <Badge
                        variant="outline"
                        className={`ml-auto text-[10px] uppercase tracking-wide ${FINDING_STYLES[item.severity]}`}
                      >
                        {item.severity}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>


      {/* ROI Calculator Section */}
      <section id="roi-calculator" className="relative z-10 py-20 sm:py-28 px-4">
        <div className="max-w-5xl mx-auto">
          <motion.div
            className="text-center mb-12"
            {...getInViewProps()}
          >
            <Badge variant="secondary" className="mb-4 px-3 py-1 text-xs bg-green-500/10 text-green-400 border-green-500/20">
              <Calculator className="h-3 w-3 mr-1" />
              Savings Estimator
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Estimate Your Potential Savings
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              See estimated time savings based on typical task durations. Actual results may vary.
            </p>
          </motion.div>

          <motion.div
            {...getInViewProps(0.1)}
          >
            <Card className="border border-border/50 bg-card/30 backdrop-blur-xl">
              <CardContent className="p-8">
                {/* Slider Section */}
                <div className="mb-10">
                  <div className="flex items-center justify-between mb-4">
                    <Label className="text-lg font-medium text-foreground">Number of Service Users</Label>
                    <div className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-teal-400" />
                      <span className="text-2xl font-bold text-teal-400" data-testid="text-service-users-count">{serviceUsers}</span>
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
                  <div className="flex justify-between text-sm text-muted-foreground mt-2">
                    <span>1</span>
                    <span>50</span>
                    <span>100</span>
                    <span>150</span>
                    <span>200</span>
                  </div>
                </div>

                {/* Results Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                  <div className="p-5 rounded-lg bg-red-500/10 border border-red-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-red-400" />
                  <span className="text-sm text-red-300">Manual Time</span>
                    </div>
                    <div className="text-2xl font-bold text-foreground" data-testid="text-manual-hours">
                      {roi.manualHours.toLocaleString(undefined, { maximumFractionDigits: 0 })} hrs
                    </div>
                <div className="text-xs text-muted-foreground/80">per year</div>
                  </div>

                  <div className="p-5 rounded-lg bg-teal-500/10 border border-teal-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="h-4 w-4 text-teal-300" />
                  <span className="text-sm text-teal-300">With CareAssurance</span>
                    </div>
                    <div className="text-2xl font-bold text-foreground" data-testid="text-ai-hours">
                      {roi.aiHours.toLocaleString(undefined, { maximumFractionDigits: 0 })} hrs
                    </div>
                <div className="text-xs text-muted-foreground/80">per year</div>
                  </div>

                  <div className="p-5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Timer className="h-4 w-4 text-blue-300" />
                  <span className="text-sm text-blue-300">Time Saved</span>
                    </div>
                    <div className="text-2xl font-bold text-foreground" data-testid="text-hours-saved">
                      {roi.hoursSaved.toLocaleString(undefined, { maximumFractionDigits: 0 })} hrs
                    </div>
                <div className="text-xs text-muted-foreground/80">per year</div>
                  </div>

                  <div className="p-5 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/10 border border-green-500/30">
                <div className="flex items-center gap-2 mb-2">
                  <PoundSterling className="h-4 w-4 text-green-300" />
                  <span className="text-sm text-green-300">Money Saved</span>
                    </div>
                    <div className="text-2xl font-bold text-green-400" data-testid="text-money-saved">
                      £{roi.moneySaved.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                <div className="text-xs text-muted-foreground/80">per year at £14.50/hr*</div>
                  </div>
                </div>

                <div className="mb-8 rounded-2xl border border-border/50 bg-background/40 p-5">
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Efficiency gain</span>
                    <span className="text-foreground font-semibold">{savingsPercent}% faster</span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-muted/40 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-teal-400 to-sky-400 transition-all duration-500"
                      style={{ width: `${savingsPercent}%` }}
                    />
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Based on typical admin tasks across your selected service user count.
                  </div>
                </div>

                {/* Task Breakdown */}
                <div className="border-t border-border/50 pt-6">
                  <h4 className="text-sm font-medium text-muted-foreground mb-4">Estimated Annual Task Breakdown (per service user)</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    {Object.entries(TASKS).map(([key, task]) => (
                      <div key={key} className="p-3 rounded-lg bg-background/50 border border-border/30">
                        <div className="text-xs text-muted-foreground mb-1">{task.name}</div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-sm font-medium text-foreground">{task.perYear}x</span>
                          <span className="text-xs text-muted-foreground">/year</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs">
                          <span className="text-red-400">{task.manualMins}m</span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <span className="text-teal-400">{task.aiSecs}s</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Disclaimer */}
                <div className="border-t border-border/50 pt-4 mt-6">
                  <p className="text-xs text-muted-foreground/70">
                    *Estimates are based on typical task durations and may vary depending on facility size, complexity of records, and other factors. 
                    The figures shown are for illustrative purposes only and do not constitute a guarantee of savings.
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="relative z-10 py-20 sm:py-28 px-4">
        <div className="max-w-4xl mx-auto">
          <motion.div
            {...getInViewProps()}
          >
            <Card className="border border-border/50 bg-gradient-to-br from-blue-600/10 via-card/50 to-teal-600/10 backdrop-blur-xl overflow-hidden">
              <CardContent className="p-8 sm:p-12 text-center relative">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-500" />
                
                <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">
                  Ready to See What You Might Be Missing?
                </h2>
                <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
                  CareAssurance helps surface potential compliance issues in your records. 
                  Sign in to explore the platform and see how it can support your team.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
                  <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-300 bg-emerald-500/10">
                    EMAR audits
                  </Badge>
                  <Badge variant="outline" className="text-xs border-sky-500/30 text-sky-300 bg-sky-500/10">
                    Care plans
                  </Badge>
                  <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-300 bg-amber-500/10">
                    Risk insights
                  </Badge>
                </div>
                
                <Button 
                  size="lg"
                  className="bg-gradient-to-r from-blue-600 to-teal-500 hover:opacity-95 text-white font-semibold shadow-xl shadow-blue-900/40 px-8 h-12 transition-opacity"
                  data-testid="button-cta-login"
                  onClick={() => setLoginOpen(true)}
                >
                  Sign In
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/50 py-10 px-4 backdrop-blur-sm bg-background/50">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center">
                <ShieldCheck className="h-4 w-4 text-white" />
              </div>
              <div>
                <span className="text-foreground font-medium">
                  <span className="font-bold">Care</span>Assurance
                </span>
                <span className="text-muted-foreground text-sm ml-2">careassurance.uk</span>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <Link href="/terms" className="hover:text-foreground transition-colors" data-testid="link-footer-terms">
                Terms & Conditions
              </Link>
              <Link href="/privacy" className="hover:text-foreground transition-colors" data-testid="link-footer-privacy">
                Privacy Policy
              </Link>
            </div>
          </div>
          
          <div className="mt-8 pt-6 border-t border-border/30 flex flex-col sm:flex-row items-center justify-center gap-4 text-xs text-muted-foreground">
            <span>2026 CareAssurance Software. All rights reserved.</span>
            <div className="flex items-center gap-4">
              <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-400">
                <Lock className="h-2.5 w-2.5 mr-1" />
                256-bit SSL Secured
              </Badge>
              <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400">
                <ShieldCheck className="h-2.5 w-2.5 mr-1" />
                Privacy-Focused
              </Badge>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
