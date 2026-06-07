import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/context/AuthContext";
import { TemporaryDataProvider } from "@/context/TemporaryDataContext";
import { SessionProvider } from "@/context/SessionContext";
import { SettingsProvider, useSettings } from "@/context/SettingsContext";
import { MotionConfig } from "framer-motion";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminRoute from "@/components/AdminRoute";
import { TermsGuard } from "@/components/TermsGuard";
import { useAuth } from "@/context/AuthContext";
import React, { Suspense, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageLoadingBar } from "@/components/PageLoadingBar";
import { getAuthenticatedHomePath } from "@shared/roles";

// Lazy loaded pages for code splitting - reduces initial bundle size
const NotFound = React.lazy(() => import("@/pages/not-found"));
const Homepage = React.lazy(() => import("@/pages/Homepage"));
const Dashboard = React.lazy(() => import("@/pages/Dashboard"));
const TermsConditions = React.lazy(() => import("@/pages/TermsConditions"));
const PrivacyPolicy = React.lazy(() => import("@/pages/PrivacyPolicy"));
const SecretAdminPortal = React.lazy(() => import("@/pages/SecretAdminPortal"));
const ExtensionManager = React.lazy(() => import("@/pages/ExtensionManager"));
const CallReconciliation = React.lazy(() => import("@/pages/CallReconciliation"));
const EmailAssistant = React.lazy(() => import("@/pages/EmailAssistant"));
const ServiceUserUpload = React.lazy(() => import("@/pages/service-users/Upload"));
const CarePlanning = React.lazy(() => import("@/pages/service-users/CarePlanning"));
const RiskAssessment = React.lazy(() => import("@/pages/service-users/RiskAssessment"));
const PlanEnhancer = React.lazy(() => import("@/pages/service-users/PlanEnhancer"));
const CarersList = React.lazy(() => import("@/pages/care-workers/CarersList"));
const EMARAudit = React.lazy(() => import("@/pages/care-workers/EMARAudit"));
const VisitAudit = React.lazy(() => import("@/pages/care-workers/VisitAudit"));
const Performance = React.lazy(() => import("@/pages/care-workers/Performance"));
const Settings = React.lazy(() => import("@/pages/Settings"));
const Messages = React.lazy(() => import("@/pages/Messages"));
const Compliance = React.lazy(() => import("@/pages/Compliance"));
const ROICalculator = React.lazy(() => import("@/pages/ROICalculator"));
const TestingFeatures = React.lazy(() => import("@/pages/TestingFeatures"));
const RosteringStudioUnified = React.lazy(() => import("@/pages/RosteringStudioUnified"));
const RosteringRuns = React.lazy(() => import("@/pages/RosteringRuns"));
const BillingTool = React.lazy(() => import("@/pages/BillingTool"));
const SystemLogs = React.lazy(() => import("@/pages/SystemLogs"));
const CQCSelfAssessment = React.lazy(() => import("@/pages/CQCSelfAssessment"));
const PolicyAcknowledgement = React.lazy(() => import("@/pages/PolicyAcknowledgement"));

function RouteFallback() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-6">
      <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/90 px-4.5 py-3.5 text-sm text-muted-foreground shadow-[var(--shadow-medium)] backdrop-blur-sm">
        <Loader2 className="h-4.5 w-4.5 animate-spin text-primary" />
        Preparing your portal...
      </div>
    </div>
  );
}

// Preload common routes when browser is idle (runs at most once)
let hasPreloaded = false;
const preloadRoutes = () => {
  if (hasPreloaded) return;

  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
    deviceMemory?: number;
  }).connection;

  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const shouldLimitPreload =
    connection?.saveData ||
    connection?.effectiveType === "3g" ||
    connection?.effectiveType === "slow-2g" ||
    connection?.effectiveType === "2g" ||
    (typeof deviceMemory === "number" && deviceMemory <= 4);

  if (shouldLimitPreload) return;
  hasPreloaded = true;

  const preloadQueue: Array<() => Promise<unknown>> = [
    () => import("@/pages/Dashboard"),
    () => import("@/pages/EmailAssistant"),
    () => import("@/pages/Settings"),
  ];

  preloadQueue.forEach((importFn, index) => {
    const timeout = 4500 + index * 900;
    if ("requestIdleCallback" in window) {
      requestIdleCallback(() => {
        void importFn();
      }, { timeout });
      return;
    }
    setTimeout(() => {
      void importFn();
    }, 2200 + index * 700);
  });
};

function HomeRoute() {
  const { user } = useAuth();

  // Preload common routes when user is logged in
  useEffect(() => {
    if (user) {
      const timer = setTimeout(() => {
        preloadRoutes();
      }, 1200);

      return () => clearTimeout(timer);
    }
  }, [user]);

  if (user) {
    return <Redirect to={getAuthenticatedHomePath()} />;
  }
  return <Homepage />;
}

function Router() {
  return (
    <ErrorBoundary>
      <PageLoadingBar />
      <Suspense fallback={<RouteFallback />}>
        <Switch>
          <Route path="/terms" component={TermsConditions} />
          <Route path="/privacy" component={PrivacyPolicy} />
          <ProtectedRoute path="/dashboard" component={Dashboard} />

          {/* Service Users Dropdown */}
          <ProtectedRoute path="/service-users/upload" component={ServiceUserUpload} />
          <ProtectedRoute path="/service-users/care-planning" component={CarePlanning} />
          <ProtectedRoute path="/service-users/risk-assessment" component={RiskAssessment} />
          <ProtectedRoute path="/service-users/plan-enhancer" component={PlanEnhancer} />

          {/* Care Workers Dropdown */}
          <ProtectedRoute path="/care-workers/list" component={CarersList} />
          <ProtectedRoute path="/care-workers/emar-audit" component={EMARAudit} />
          <ProtectedRoute path="/care-workers/visit-audit" component={VisitAudit} />
          <ProtectedRoute path="/care-workers/performance" component={Performance} />

          {/* Admin Dropdown */}
          <AdminRoute path="/shadow-admin-portal" component={SecretAdminPortal} />
          <AdminRoute path="/admin/extension-manager" component={ExtensionManager} />
          <AdminRoute path="/call-reconciliation" component={CallReconciliation} />
          <ProtectedRoute path="/email-assistant" component={EmailAssistant} />
          <ProtectedRoute path="/compliance" component={Compliance} />
          <ProtectedRoute path="/cqc-assessment" component={CQCSelfAssessment} />
          <ProtectedRoute path="/policy-acknowledgement" component={PolicyAcknowledgement} />
          <AdminRoute path="/roi-calculator" component={ROICalculator} />
          <ProtectedRoute path="/rostering/runs" component={RosteringRuns} />
          <ProtectedRoute path="/rostering/:tab" component={TestingFeatures} />
          <AdminRoute path="/system-logs" component={SystemLogs} />
          <AdminRoute path="/rostering-unified" component={RosteringStudioUnified} />
          <AdminRoute path="/billing-tool" component={BillingTool} />

          {/* Legacy path redirects */}
          {([
            ["/rostering", "/rostering/data"],
            ["/testing-features", "/rostering/data"],
            ["/rostering-tool", "/rostering/data"],
            ["/rostering-studio", "/rostering-unified"],
            ["/rostering-hub", "/rostering-unified"],
            ["/admin/care-worker-rotas", "/rostering-unified"],
            ["/care-worker-rotas", "/rostering-unified"],
          ] as const).map(([from, to]) => (
            <Route key={from} path={from}>
              <Redirect to={to} />
            </Route>
          ))}

          <ProtectedRoute path="/settings" component={Settings} />
          <ProtectedRoute path="/messages" component={Messages} />

          {/* Homepage - shows landing page or redirects to dashboard */}
          <Route path="/" component={HomeRoute} />

          {/* Fallback */}
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </ErrorBoundary>
  );
}

function MotionPreferenceProvider({ children }: { children: React.ReactNode }) {
  const { reduceMotion } = useSettings();
  // Bridges the in-app "Reduce motion" setting to framer-motion. "always" makes every
  // motion component skip transform/layout animations (opacity-only); "user" defers to the
  // OS prefers-reduced-motion preference. Without this, the toggle only affected CSS
  // animations, leaving JS-driven framer-motion movement (sidebar, dialogs, etc.) running.
  return (
    <MotionConfig reducedMotion={reduceMotion ? "always" : "user"}>{children}</MotionConfig>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <MotionPreferenceProvider>
          <AuthProvider>
            <SessionProvider>
              <TemporaryDataProvider>
                <TermsGuard>
                  <Router />
                </TermsGuard>
                <Toaster />
              </TemporaryDataProvider>
            </SessionProvider>
          </AuthProvider>
        </MotionPreferenceProvider>
      </SettingsProvider>
    </QueryClientProvider>
  );
}

export default App;
