import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { motion } from "framer-motion";
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
  AlertTriangle,
  User,
  KeyRound,
  Loader2
} from "lucide-react";

export default function Homepage() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

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
      description: "AI-powered medication administration record analysis with automated discrepancy detection and refusal tracking",
      highlight: "3-Pass Consensus"
    },
    {
      icon: Brain,
      title: "Smart Care Plans",
      description: "Generate comprehensive, person-centred care plans with AI assistance across 11 key sections",
      highlight: "AI-Powered"
    },
    {
      icon: ClipboardCheck,
      title: "CQC Compliance",
      description: "Stay inspection-ready with automated compliance tracking, documentation, and audit trails",
      highlight: "Always Ready"
    },
    {
      icon: Users,
      title: "Staff Performance",
      description: "Track care worker performance metrics and identify training opportunities proactively",
      highlight: "Real-Time"
    },
    {
      icon: TrendingUp,
      title: "ROI Analytics",
      description: "Measure cost savings, demonstrate value, and calculate return on investment",
      highlight: "Data-Driven"
    },
    {
      icon: Lock,
      title: "Privacy First",
      description: "Enterprise-grade security with automatic PII protection, data sealing, and file scanning",
      highlight: "GDPR Compliant"
    }
  ];

  const stats = [
    { value: "80%", label: "Time Saved on Audits", icon: Clock },
    { value: "99.9%", label: "Accuracy Rate", icon: CheckCircle2 },
    { value: "24/7", label: "Compliance Monitoring", icon: ShieldCheck },
    { value: "11", label: "Care Plan Sections", icon: FileText }
  ];

  const howItWorks = [
    {
      step: "01",
      title: "Upload Your Records",
      description: "Simply upload EMAR sheets or care documentation. Our system handles PDFs, images, and spreadsheets.",
      icon: FileSearch
    },
    {
      step: "02", 
      title: "AI Analysis",
      description: "Our advanced AI analyses records using multi-pass consensus, catching discrepancies humans might miss.",
      icon: Brain
    },
    {
      step: "03",
      title: "Review & Action",
      description: "Get clear, actionable insights with severity ratings. Export reports for CQC inspections instantly.",
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
              Trusted by UK Care Facilities
            </Badge>
          </motion.div>

          <motion.h1 
            className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-foreground mb-6 leading-[1.1] tracking-tight"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            Smarter Care Compliance,{" "}
            <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-400 bg-clip-text text-transparent">
              Powered by AI
            </span>
          </motion.h1>

          <motion.p 
            className="text-lg sm:text-xl text-muted-foreground mb-10 max-w-3xl mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Transform your EMAR auditing with AI that catches what humans miss. Generate intelligent care plans 
            and reduce administrative burden by up to 80%.
          </motion.p>

          <motion.div 
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12"
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
              Get Started
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Link href="/terms">
              <Button 
                variant="outline" 
                size="lg"
                className="h-12 px-6 text-base border-border/50 bg-background/50 backdrop-blur-sm"
              >
                View Terms
              </Button>
            </Link>
          </motion.div>

        </div>
      </section>

      {/* Stats Section */}
      <section className="relative z-10 py-12 px-4 border-y border-border/30 bg-muted/20 backdrop-blur-sm">
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
                <div className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-teal-500/20 mb-3">
                  <stat.icon className="h-5 w-5 text-teal-400" />
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

      {/* How It Works Section */}
      <section className="relative z-10 py-20 sm:py-28 px-4">
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
              Simple Process
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              How It Works
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Get started in minutes with our streamlined workflow designed for care professionals.
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
      <section className="relative z-10 py-20 sm:py-28 px-4 bg-muted/10">
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
              Everything You Need for Care Excellence
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Comprehensive tools designed to streamline compliance, improve care quality, and reduce administrative burden.
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
                    <div className="flex items-start justify-between mb-4">
                      <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-blue-500/20 to-teal-500/20 flex items-center justify-center group-hover:from-blue-500/30 group-hover:to-teal-500/30 transition-colors duration-300">
                        <feature.icon className="h-6 w-6 text-teal-400" />
                      </div>
                      <Badge variant="secondary" className="text-[10px] bg-muted/50 text-muted-foreground border-border/50">
                        {feature.highlight}
                      </Badge>
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
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
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center mx-auto mb-6 shadow-xl shadow-teal-500/20">
                  <ShieldCheck className="h-8 w-8 text-white" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">
                  Ready to Transform Your Care Facility?
                </h2>
                <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
                  Join care facilities across the UK who are saving time, improving compliance, and delivering better outcomes with CareAssurance.
                </p>
                <Button 
                    size="lg"
                    className="bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-500 hover:to-teal-400 text-white font-semibold shadow-xl shadow-blue-900/40 px-8 h-12"
                    data-testid="button-cta-login"
                    onClick={() => setLoginOpen(true)}
                  >
                    Get Started Today
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
          
          <div className="mt-8 pt-6 border-t border-border/30 flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <span>2024 CareAssurance Software. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
