import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { Play } from "lucide-react";
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
  Timer,
  Target,
  HeartHandshake,
  Calculator,
  PoundSterling
} from "lucide-react";

export default function Homepage() {
  const [, setLocation] = useLocation();
  const { login, loginDemo } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [serviceUsers, setServiceUsers] = useState(20);

  const handleDemoLogin = async () => {
    setDemoLoading(true);
    const success = await loginDemo();
    setDemoLoading(false);
    if (success) {
      setLocation("/dashboard");
    }
  };

  // ROI Calculator constants
  const HOURLY_RATE = 14.50;
  const TASKS = {
    carePlan: { name: "Care Plans", manualMins: 90, aiSecs: 60, perYear: 12 },
    initialAssessment: { name: "Initial Assessments", manualMins: 150, aiSecs: 90, perYear: 1 },
    riskAssessment: { name: "Risk Assessments", manualMins: 180, aiSecs: 120, perYear: 2 },
    emar: { name: "EMAR Audits", manualMins: 45, aiSecs: 30, perYear: 48 },
    visitAudit: { name: "Visit Audits", manualMins: 30, aiSecs: 30, perYear: 48 },
  };

  const calculateROI = (users: number) => {
    let totalManualMins = 0;
    let totalAiMins = 0;
    
    Object.values(TASKS).forEach(task => {
      totalManualMins += task.manualMins * task.perYear * users;
      totalAiMins += (task.aiSecs / 60) * task.perYear * users;
    });
    
    const manualHours = totalManualMins / 60;
    const aiHours = totalAiMins / 60;
    const hoursSaved = manualHours - aiHours;
    const moneySaved = hoursSaved * HOURLY_RATE;
    
    return { manualHours, aiHours, hoursSaved, moneySaved };
  };

  const roi = calculateROI(serviceUsers);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const success = await login(username, password);
    setLoading(false);
    if (success) {
      setLoginOpen(false);
      setLocation("/dashboard");
    }
  };

  const features = [
    {
      icon: FileSearch,
      title: "EMAR Auditing",
      description: "Surface medication discrepancies you might not spot manually. Our AI helps analyse EMAR records, flagging potential issues and refusals for your review.",
      highlight: "AI-Assisted",
      benefit: "Faster record reviews"
    },
    {
      icon: Brain,
      title: "AI Care Plan Generator",
      description: "Generate draft care plans in minutes rather than hours. Our AI creates person-centred documentation across 11 sections for your review and approval.",
      highlight: "AI-Powered",
      benefit: "Streamlined documentation"
    },
    {
      icon: ClipboardCheck,
      title: "Compliance Dashboard",
      description: "Keep track of your compliance status in one place. Monitor key metrics and identify areas that may need attention before your next inspection.",
      highlight: "Centralised View",
      benefit: "Better visibility"
    },
    {
      icon: Users,
      title: "Staff Performance Analytics",
      description: "Track care worker metrics and identify potential training opportunities. Review performance patterns to support your team more effectively.",
      highlight: "Real-Time Insights",
      benefit: "Data-driven decisions"
    },
    {
      icon: TrendingUp,
      title: "Time Savings Calculator",
      description: "Estimate potential time savings based on your facility size. See how AI-assisted workflows may reduce administrative burden.",
      highlight: "Estimated Savings",
      benefit: "Plan your efficiency"
    },
    {
      icon: Lock,
      title: "Security Features",
      description: "Built with data protection in mind. Features include encryption, automatic PII handling, and audit trails to support your data governance.",
      highlight: "Privacy-Focused",
      benefit: "Data protection support"
    }
  ];

  const stats = [
    { value: "Minutes", label: "Not Hours Per Audit", icon: Clock },
    { value: "11", label: "Care Plan Sections", icon: FileText },
    { value: "UK", label: "Care-Focused Design", icon: Building2 },
    { value: "24/7", label: "Access Anytime", icon: ShieldCheck }
  ];

  const whyChoose = [
    {
      icon: Target,
      title: "Designed for UK Care",
      description: "Built with UK care facility workflows in mind. Features are shaped around the practical challenges care teams face with documentation and record-keeping."
    },
    {
      icon: Brain,
      title: "AI-Assisted Analysis",
      description: "Our multi-pass AI system helps surface potential discrepancies that may be difficult to spot when reviewing records manually."
    },
    {
      icon: Timer,
      title: "Quick to Get Started",
      description: "No lengthy setup required. Upload your first document and start exploring insights. Most users are up and running within a single session."
    },
    {
      icon: HeartHandshake,
      title: "UK-Based Support",
      description: "Our team understands the UK care sector. We provide hands-on support from people who know the challenges you face."
    }
  ];


  const howItWorks = [
    {
      step: "01",
      title: "Upload Your Records",
      description: "Simply drag and drop your EMAR sheets, care plans, or documentation. We support PDFs, images, and spreadsheets.",
      icon: FileSearch
    },
    {
      step: "02", 
      title: "AI-Assisted Analysis",
      description: "Our multi-pass AI reviews records and flags potential discrepancies for your attention, helping you focus on what matters.",
      icon: Brain
    },
    {
      step: "03",
      title: "Review and Act",
      description: "Review prioritised findings with severity ratings. Export reports and address issues with greater confidence.",
      icon: ClipboardCheck
    }
  ];

  const fadeInUp = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5 }
  };

  const staggerContainer = {
    animate: {
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-x-hidden bg-background">
      {/* Animated Gradient Background */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-muted/30 to-background" />
        <motion.div 
          className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-600/15 rounded-full blur-3xl"
          animate={{ 
            x: [0, 50, 0],
            y: [0, 30, 0],
            scale: [1, 1.1, 1]
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div 
          className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-violet-500/10 rounded-full blur-3xl"
          animate={{ 
            x: [0, -30, 0],
            y: [0, -50, 0],
            scale: [1, 1.15, 1]
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div 
          className="absolute top-1/2 right-0 w-[350px] h-[350px] bg-teal-500/15 rounded-full blur-3xl"
          animate={{ 
            x: [0, -40, 0],
            y: [0, 40, 0],
            scale: [1, 1.2, 1]
          }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* Grid Pattern Overlay */}
      <div 
        className="fixed inset-0 z-0 opacity-[0.02] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}
      />

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
                    className="bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-500 hover:to-teal-400 text-white font-medium shadow-lg shadow-blue-900/30"
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
                      className="w-full bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-500 hover:to-teal-400 text-white font-medium"
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
        <div className="max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <Badge variant="secondary" className="mb-6 px-4 py-1.5 text-sm bg-teal-500/10 text-teal-400 border-teal-500/20">
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              AI-Powered Care Compliance Tools
            </Badge>
          </motion.div>

          <motion.h1 
            className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-foreground mb-6 leading-[1.1] tracking-tight"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            Discover Issues Before{" "}
            <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-400 bg-clip-text text-transparent">
              Your Next Inspection
            </span>
          </motion.h1>

          <motion.p 
            className="text-lg sm:text-xl text-muted-foreground mb-6 max-w-3xl mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            CareAssurance uses AI to help surface compliance issues you might not spot manually. 
            Review your EMARs, generate draft care plans, and approach inspections with greater confidence.
          </motion.p>

          <motion.div 
            className="flex flex-wrap items-center justify-center gap-3 mb-10"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
          >
            <Badge variant="outline" className="text-xs px-3 py-1 border-green-500/30 text-green-400 bg-green-500/10">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Built for UK Care
            </Badge>
            <Badge variant="outline" className="text-xs px-3 py-1 border-blue-500/30 text-blue-400 bg-blue-500/10">
              <Lock className="h-3 w-3 mr-1" />
              Privacy-Focused
            </Badge>
          </motion.div>

          <motion.div 
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <Button 
              size="lg"
              className="bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-500 hover:to-teal-400 text-white font-semibold shadow-xl shadow-blue-900/40 px-8 h-12 text-base"
              data-testid="button-hero-login"
              onClick={() => setLoginOpen(true)}
            >
              Login
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button 
              variant="outline" 
              size="lg"
              className="h-12 px-6 text-base border-border/50 bg-background/50 backdrop-blur-sm"
              onClick={() => document.getElementById('roi-calculator')?.scrollIntoView({ behavior: 'smooth' })}
              data-testid="button-hero-roi"
            >
              <TrendingUp className="mr-2 h-5 w-5" />
              Calculate Your ROI
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Trusted By Section */}
      <section className="relative z-10 py-8 px-4 border-y border-border/30 bg-muted/10 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto">
          <motion.div
            className="text-center"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <p className="text-sm text-muted-foreground mb-6">
              Key features designed for UK care facilities
            </p>
            <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12">
              {["EMAR Analysis", "Care Plan Drafting", "Risk Assessments", "Visit Audits", "Staff Analytics"].map((feature, i) => (
                <div 
                  key={i}
                  className="flex items-center gap-2 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                >
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium text-sm">{feature}</span>
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
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
          >
            {stats.map((stat, index) => (
              <motion.div 
                key={index}
                className="text-center"
                variants={fadeInUp}
              >
                <div className="inline-flex items-center justify-center h-12 w-12 rounded-lg bg-gradient-to-br from-blue-500/20 to-teal-500/20 mb-3">
                  <stat.icon className="h-6 w-6 text-teal-400" />
                </div>
                <div className="text-3xl sm:text-4xl font-bold text-foreground mb-1 bg-gradient-to-r from-blue-400 to-teal-400 bg-clip-text text-transparent">
                  {stat.value}
                </div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
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
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <Badge variant="secondary" className="mb-4 px-3 py-1 text-xs bg-violet-500/10 text-violet-400 border-violet-500/20">
              <Award className="h-3 w-3 mr-1" />
              Why Choose Us
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Built Different. Built Better.
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              We're not another generic compliance tool. CareAssurance was built from the ground up 
              for UK care facilities by people who understand your challenges.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {whyChoose.map((item, index) => (
              <motion.div 
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <Card className="h-full border border-border/50 bg-card/30 backdrop-blur-xl">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center flex-shrink-0">
                        <item.icon className="h-6 w-6 text-violet-400" />
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
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {howItWorks.map((item, index) => (
              <motion.div 
                key={index}
                className="relative"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <Card className="h-full border border-border/50 bg-card/30 backdrop-blur-xl overflow-visible">
                  <CardContent className="p-6 pt-8">
                    <div className="absolute -top-4 left-6">
                      <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-600 to-teal-500 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-blue-900/30">
                        {item.step}
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-blue-500/10 to-teal-500/10 flex items-center justify-center mb-4">
                        <item.icon className="h-6 w-6 text-teal-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground mb-2">{item.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                    </div>
                  </CardContent>
                </Card>
                {index < howItWorks.length - 1 && (
                  <div className="hidden md:block absolute top-1/2 -right-4 transform -translate-y-1/2 z-10">
                    <ChevronRight className="h-6 w-6 text-border" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative z-10 py-20 sm:py-28 px-4">
        <div className="max-w-7xl mx-auto">
          <motion.div 
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <Badge variant="secondary" className="mb-4 px-3 py-1 text-xs bg-teal-500/10 text-teal-400 border-teal-500/20">
              <BarChart3 className="h-3 w-3 mr-1" />
              Complete Platform
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Tools to Support Your Compliance Workflow
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              A suite of features designed to help reduce administrative burden and give your team more time to focus on what matters: caring for residents.
            </p>
          </motion.div>

          <motion.div 
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
          >
            {features.map((feature, index) => (
              <motion.div key={index} variants={fadeInUp}>
                <Card className="h-full border border-border/50 bg-card/30 backdrop-blur-xl group hover:border-teal-500/30 transition-colors duration-300">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-blue-500/20 to-teal-500/20 flex items-center justify-center group-hover:from-blue-500/30 group-hover:to-teal-500/30 transition-colors duration-300 flex-shrink-0">
                        <feature.icon className="h-6 w-6 text-teal-400" />
                      </div>
                      <Badge variant="secondary" className="text-[10px] bg-green-500/10 text-green-400 border-green-500/20">
                        {feature.highlight}
                      </Badge>
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-3">{feature.description}</p>
                    <div className="flex items-center gap-1 text-xs text-teal-400">
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


      {/* ROI Calculator Section */}
      <section id="roi-calculator" className="relative z-10 py-20 sm:py-28 px-4">
        <div className="max-w-5xl mx-auto">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
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
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
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
                    onValueChange={(value) => setServiceUsers(value[0])}
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
                      <span className="text-sm text-red-400">Manual Time</span>
                    </div>
                    <div className="text-2xl font-bold text-foreground" data-testid="text-manual-hours">
                      {roi.manualHours.toLocaleString(undefined, { maximumFractionDigits: 0 })} hrs
                    </div>
                    <div className="text-xs text-muted-foreground">per year</div>
                  </div>

                  <div className="p-5 rounded-lg bg-teal-500/10 border border-teal-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className="h-4 w-4 text-teal-400" />
                      <span className="text-sm text-teal-400">With CareAssurance</span>
                    </div>
                    <div className="text-2xl font-bold text-foreground" data-testid="text-ai-hours">
                      {roi.aiHours.toLocaleString(undefined, { maximumFractionDigits: 0 })} hrs
                    </div>
                    <div className="text-xs text-muted-foreground">per year</div>
                  </div>

                  <div className="p-5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Timer className="h-4 w-4 text-blue-400" />
                      <span className="text-sm text-blue-400">Time Saved</span>
                    </div>
                    <div className="text-2xl font-bold text-foreground" data-testid="text-hours-saved">
                      {roi.hoursSaved.toLocaleString(undefined, { maximumFractionDigits: 0 })} hrs
                    </div>
                    <div className="text-xs text-muted-foreground">per year</div>
                  </div>

                  <div className="p-5 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/10 border border-green-500/30">
                    <div className="flex items-center gap-2 mb-2">
                      <PoundSterling className="h-4 w-4 text-green-400" />
                      <span className="text-sm text-green-400">Money Saved</span>
                    </div>
                    <div className="text-2xl font-bold text-green-400" data-testid="text-money-saved">
                      £{roi.moneySaved.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                    <div className="text-xs text-muted-foreground">per year at £14.50/hr*</div>
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
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
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
                
                <Button 
                  size="lg"
                  className="bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-500 hover:to-teal-400 text-white font-semibold shadow-xl shadow-blue-900/40 px-8 h-12"
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
            <span>2025 CareAssurance Software. All rights reserved.</span>
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
