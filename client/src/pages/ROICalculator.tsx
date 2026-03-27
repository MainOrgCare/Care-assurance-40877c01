import { useEffect } from "react";
import { useLocation } from "wouter";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Clock, Shield, Lock, FileCheck, Heart, ClipboardCheck, AlertTriangle,
  Timer, CheckCircle, XCircle, Cpu, ScanLine, KeyRound, FileX2, Scale,
  Zap, Users, TrendingUp, Brain, Eye, Pill, MapPin, Sparkles, ArrowRight, Download
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const TASK_DATA = [
  { name: "EMAR Audit", manualMinutes: 45, appSeconds: 60, costPence: 4 },
  { name: "Visit Audit", manualMinutes: 30, appSeconds: 20, costPence: 1 },
  { name: "Risk Assessment", manualMinutes: 180, appSeconds: 45, costPence: 4 },
  { name: "Plan Enhancer", manualMinutes: 120, appSeconds: 90, costPence: 9 },
  { name: "Care Planner", manualMinutes: 90, appSeconds: 45, costPence: 5 },
];

const CORE_FEATURES = [
  {
    icon: Pill,
    title: "EMAR Analysis",
    subtitle: "Medication Record Auditing",
    description: "Upload medication records and instantly detect discrepancies, missed doses, and refusals. AI identifies patterns, generates PRN protocols, and flags issues for review.",
    highlights: ["Discrepancy detection", "PRN protocol generation", "Refusal tracking", "Dose verification"],
    timeSaving: "45 min → 60 sec",
    costPence: 4,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  {
    icon: FileCheck,
    title: "Care Planner",
    subtitle: "Person-Centred Plan Generation",
    description: "Generate comprehensive care plans written in first-person perspective. Creates personalised content based on individual needs, preferences, and risk factors.",
    highlights: ["First-person perspective", "Personalised content", "Risk-aware planning", "Structured format"],
    timeSaving: "90 min → 45 sec",
    costPence: 5,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
  },
  {
    icon: Sparkles,
    title: "Plan Enhancer",
    subtitle: "11-Section Enhancement",
    description: "Transform basic care plans into comprehensive documents covering all aspects of care. Generates content across personal care, nutrition, mobility, communication, and more.",
    highlights: ["11 care sections", "Detailed guidance", "Staff instructions", "Outcome tracking"],
    timeSaving: "2 hr → 90 sec",
    costPence: 9,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
  },
  {
    icon: AlertTriangle,
    title: "Risk Assessment",
    subtitle: "Proactive Risk Identification",
    description: "Analyse service user information to identify potential risks before they become incidents. Generates mitigation strategies and monitoring recommendations.",
    highlights: ["Early warning detection", "Mitigation strategies", "Monitoring plans", "Evidence-based"],
    timeSaving: "3 hr → 45 sec",
    costPence: 4,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
  },
  {
    icon: MapPin,
    title: "Visit Auditing",
    subtitle: "Domiciliary Care Verification",
    description: "Verify visit times, durations, and care delivery for domiciliary services. Cross-reference scheduled vs actual visits and identify discrepancies.",
    highlights: ["Time verification", "Duration tracking", "Schedule comparison", "Gap detection"],
    timeSaving: "30 min → 20 sec",
    costPence: 1,
    color: "text-rose-500",
    bgColor: "bg-rose-500/10",
  },
];

const IMPACT_METRICS = [
  {
    icon: Clock,
    value: "Faster",
    label: "Record Reviews",
    description: "Minutes instead of hours",
  },
  {
    icon: Eye,
    value: "Thorough",
    label: "Analysis",
    description: "AI reviews every entry systematically",
  },
  {
    icon: Scale,
    value: "UK",
    label: "Care-Focused",
    description: "Designed for UK care workflows",
  },
  {
    icon: Heart,
    value: "More",
    label: "Care Time",
    description: "Staff freed for direct patient care",
  },
];

const EXTENSION_ADMIN_BENEFITS = [
  {
    icon: Zap,
    title: "Faster Handover",
    description: "Send generated assessments into the ACP extension flow without extra export steps.",
  },
  {
    icon: Shield,
    title: "Admin-Gated Access",
    description: "Package download is restricted to authenticated admin controls for safer rollout.",
  },
  {
    icon: FileCheck,
    title: "Consistent Setup",
    description: "Install teams from one CareAssurance source to reduce version drift across devices.",
  },
];

const COMPARISON_DATA = {
  manual: [
    { text: "Hours spent cross-checking medication records", icon: Clock },
    { text: "Risk of missing discrepancies due to fatigue", icon: Eye },
    { text: "Inconsistent care plan quality between staff", icon: Users },
    { text: "Delayed identification of care concerns", icon: AlertTriangle },
    { text: "Administrative burden reduces care time", icon: Heart },
    { text: "Uncertainty before inspections", icon: Scale },
  ],
  careassurance: [
    { text: "Complete analysis in under a minute", icon: Zap },
    { text: "Every entry reviewed systematically", icon: CheckCircle },
    { text: "Standardised, high-quality documentation", icon: FileCheck },
    { text: "Immediate flagging of potential issues", icon: Brain },
    { text: "More time for meaningful patient interaction", icon: Heart },
    { text: "Better-organised documentation", icon: Shield },
  ],
};

const SECURITY_CATEGORIES = [
  {
    title: "Data Processing",
    description: "How your data is handled",
    features: [
      { icon: Cpu, title: "Memory-Only Processing", description: "Documents processed in RAM, never written to disk" },
      { icon: FileX2, title: "No Retention", description: "Source files deleted immediately after analysis" },
      { icon: Timer, title: "Auto-Expiry", description: "Sensitive data automatically redacted over time" },
    ],
  },
  {
    title: "Access Control",
    description: "Who can see what",
    features: [
      { icon: KeyRound, title: "Role-Based Permissions", description: "Staff and admin see different data levels" },
      { icon: Lock, title: "Session Encryption", description: "All connections secured end-to-end" },
      { icon: Users, title: "Audit Trail", description: "All access logged for accountability" },
    ],
  },
  {
    title: "Compliance",
    description: "Meeting regulatory requirements",
    features: [
      { icon: Scale, title: "GDPR Aligned", description: "Built with UK data protection in mind" },
      { icon: ScanLine, title: "Malware Scanning", description: "Every upload scanned before processing" },
      { icon: Shield, title: "PII Scrubbing", description: "Personal identifiers automatically removed" },
    ],
  },
];

export default function ROICalculator() {
  const { user } = useAuth();
  usePageTitle("Features & Benefits");
  const [, setLocation] = useLocation();
  
  useEffect(() => {
    if (user && user.role !== 'admin') {
      setLocation('/');
    }
  }, [user, setLocation]);

  if (!user || user.role !== 'admin') {
    return null;
  }

  return (
    <div className="page-shell max-w-7xl mx-auto" data-testid="features-benefits-page">
      {/* Hero Header */}
      <div className="text-center space-y-6 py-8">
        <Badge variant="secondary" className="gap-1 mb-4">
          <Brain className="h-3 w-3" />
          AI-Powered Care Administration
        </Badge>
        <h1 className="text-4xl md:text-5xl font-heading font-bold leading-tight text-foreground" data-testid="page-title">
          Less Paperwork.<br />
          <span className="text-muted-foreground">More Care.</span>
        </h1>
        <p className="text-lg max-w-2xl mx-auto text-muted-foreground" data-testid="page-subtitle">
          CareAssurance handles the administrative burden so your team can focus on what matters most: providing exceptional care to those who need it.
        </p>
      </div>

      {/* Impact Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {IMPACT_METRICS.map((metric) => (
          <Card key={metric.label} className="text-center" data-testid={`metric-${metric.label.toLowerCase().replace(/\s+/g, '-')}`}>
            <CardContent className="pt-6 pb-4">
              <div className="mx-auto w-10 h-10 rounded-full flex items-center justify-center mb-3 bg-primary/10 text-primary">
                <metric.icon className="h-5 w-5" />
              </div>
              <div className="text-2xl font-semibold text-foreground">{metric.value}</div>
              <div className="text-sm font-medium text-foreground">{metric.label}</div>
              <div className="text-xs mt-1 text-muted-foreground">{metric.description}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Admin Extension Direct Add */}
      <section data-testid="admin-extension-direct-add-section">
        <Card className="border-primary/20">
          <CardHeader>
            <Badge variant="outline" className="w-fit gap-1">
              <Lock className="h-3 w-3" />
              Administrator Controls
            </Badge>
            <CardTitle className="mt-3 flex items-center gap-2 text-2xl text-foreground">
              <Download className="h-5 w-5 text-primary" />
              Download Edge Extension
            </CardTitle>
            <CardDescription>
              Download the ACP Autofill Edge package directly from your admin Features & Benefits workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              {EXTENSION_ADMIN_BENEFITS.map((benefit) => (
                <div key={benefit.title} className="rounded-lg border border-border/50 bg-muted/20 p-4">
                  <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <benefit.icon className="h-4 w-4" />
                  </div>
                  <div className="text-sm font-medium text-foreground">{benefit.title}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{benefit.description}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button asChild className="gap-2" data-testid="button-direct-add-extension">
                <a href={`${(import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "")}/api/admin/extension/package?fresh=1`} target="_blank" rel="noopener noreferrer">
                  <Download className="h-4 w-4" />
                  Download Edge Extension (.zip)
                </a>
              </Button>
              <p className="text-xs text-muted-foreground">
                Downloads the latest Edge ACP Autofill package for installation or update.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Core Features */}
      <section data-testid="feature-benefits-section">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-heading font-bold mb-3 text-foreground">
            Powerful Tools for Modern Care
          </h2>
          <p className="max-w-2xl mx-auto text-muted-foreground">
            Each feature is designed to eliminate hours of manual work while improving accuracy and consistency.
          </p>
        </div>
        <div className="space-y-6">
          {CORE_FEATURES.map((feature, index) => (
            <Card 
              key={feature.title} 
              className="overflow-visible"
              data-testid={`feature-card-${feature.title.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <CardContent className="p-6">
                <div className="flex flex-col lg:flex-row lg:items-start gap-6">
                  <div className={`w-14 h-14 rounded-xl ${feature.bgColor} flex items-center justify-center shrink-0 ${feature.color}`}>
                    <feature.icon className="h-7 w-7" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-2">
                      <h3 className="text-xl font-semibold text-foreground">{feature.title}</h3>
                      <Badge variant="outline" className="w-fit text-xs gap-1">
                        <Clock className="h-3 w-3" />
                        {feature.timeSaving}
                      </Badge>
                      <Badge variant="secondary" className="w-fit text-xs gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                        {feature.costPence}p per use
                      </Badge>
                    </div>
                    <p className="text-sm mb-1 text-muted-foreground">{feature.subtitle}</p>
                    <p className="mb-4 text-muted-foreground">{feature.description}</p>
                    <div className="flex flex-wrap gap-2">
                      {feature.highlights.map((highlight) => (
                        <Badge key={highlight} variant="secondary" className="text-xs">
                          {highlight}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Time Savings Summary */}
      <Card data-testid="time-savings-summary">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2 text-2xl text-foreground">
            <TrendingUp className="h-6 w-6 text-emerald-500" />
            Time Savings at a Glance
          </CardTitle>
          <CardDescription>See how much time you save on every task</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {TASK_DATA.map((task) => (
              <div key={task.name} className="text-center p-5 rounded-xl bg-muted/30 border border-border">
                <div className="text-sm font-medium mb-3 text-muted-foreground">{task.name}</div>
                <div className="flex items-center justify-center gap-2 mb-3">
                  <div>
                    <div className="text-xl font-semibold text-foreground">
                      {task.manualMinutes >= 60 
                        ? `${Math.floor(task.manualMinutes / 60)}h ${task.manualMinutes % 60 > 0 ? `${task.manualMinutes % 60}m` : ''}`
                        : `${task.manualMinutes}m`
                      }
                    </div>
                    <div className="text-xs text-muted-foreground">manual</div>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-emerald-500" />
                  <div>
                    <div className="text-xl font-semibold text-emerald-600 dark:text-emerald-400">{task.appSeconds}s</div>
                    <div className="text-xs text-muted-foreground">automated</div>
                  </div>
                </div>
                <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{task.costPence}p per use</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Comparison Section */}
      <section data-testid="comparison-section">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-heading font-bold mb-3 text-foreground">
            The Difference is Clear
          </h2>
          <p className="text-muted-foreground">
            See how CareAssurance transforms daily operations
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="border-red-500/20" data-testid="manual-process-card">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <XCircle className="h-5 w-5" />
                Without CareAssurance
              </CardTitle>
              <CardDescription>The daily reality of manual administration</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-4">
                {COMPARISON_DATA.manual.map((item, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-red-500/10">
                      <item.icon className="h-4 w-4 text-red-600 dark:text-red-400" />
                    </div>
                    <span className="text-sm pt-1 text-muted-foreground">{item.text}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card className="border-emerald-500/20" data-testid="careassurance-card">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <CheckCircle className="h-5 w-5" />
                With CareAssurance
              </CardTitle>
              <CardDescription>How your day could look instead</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-4">
                {COMPARISON_DATA.careassurance.map((item, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-emerald-500/10">
                      <item.icon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <span className="text-sm pt-1 text-muted-foreground">{item.text}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Security Section */}
      <section data-testid="safety-security-section">
        <div className="text-center mb-10">
          <div className="mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-4 bg-primary/10">
            <Shield className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-3xl font-heading font-bold mb-3 text-foreground">
            Security You Can Trust
          </h2>
          <p className="max-w-2xl mx-auto text-muted-foreground">
            Your data never leaves your control. We've built CareAssurance with privacy at its core.
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          {SECURITY_CATEGORIES.map((category) => (
            <Card key={category.title} data-testid={`security-category-${category.title.toLowerCase().replace(/\s+/g, '-')}`}>
              <CardHeader>
                <CardTitle className="text-lg text-foreground">{category.title}</CardTitle>
                <CardDescription>{category.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {category.features.map((feature) => (
                  <div key={feature.title} className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-primary/10">
                      <feature.icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <div className="font-medium text-sm text-foreground">{feature.title}</div>
                      <div className="text-xs text-muted-foreground">{feature.description}</div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

    </div>
  );
}
