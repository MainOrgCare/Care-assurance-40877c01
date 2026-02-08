import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/context/AuthContext";
import { TemporaryDataProvider } from "@/context/TemporaryDataContext";
import { SessionProvider } from "@/context/SessionContext";
import { SettingsProvider } from "@/context/SettingsContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminRoute from "@/components/AdminRoute";
import { TermsGuard } from "@/components/TermsGuard";
import { useAuth } from "@/context/AuthContext";
import { Redirect } from "wouter";
import React, { Suspense, useEffect } from "react";
import { Loader2 } from "lucide-react";

// Lazy loaded pages for code splitting - reduces initial bundle size
const NotFound = React.lazy(() => import("@/pages/not-found"));
const Homepage = React.lazy(() => import("@/pages/Homepage"));
const Dashboard = React.lazy(() => import("@/pages/Dashboard"));
const TermsConditions = React.lazy(() => import("@/pages/TermsConditions"));
const PrivacyPolicy = React.lazy(() => import("@/pages/PrivacyPolicy"));
const SecretAdminPortal = React.lazy(() => import("@/pages/SecretAdminPortal"));
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
const BillingTool = React.lazy(() => import("@/pages/BillingTool"));
const SystemLogs = React.lazy(() => import("@/pages/SystemLogs"));

function RouteFallback() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-6">
      <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-card/90 px-4 py-3 text-sm text-muted-foreground shadow-[0_12px_24px_-18px_rgba(15,23,42,0.35)]">
        <Loader2 className="h-4.5 w-4.5 animate-spin text-primary" />
        Loading workspace...
      </div>
    </div>
  );
}

// Preload common routes when browser is idle
const preloadRoutes = () => {
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  const shouldLimitPreload =
    connection?.saveData ||
    connection?.effectiveType === "slow-2g" ||
    connection?.effectiveType === "2g";

  if (shouldLimitPreload) return;

  const preload = (importFn: () => Promise<unknown>) => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => importFn(), { timeout: 4500 });
    } else {
      setTimeout(() => importFn(), 2500);
    }
  };
  
  // Preload highest-frequency pages only to avoid over-downloading.
  preload(() => import("@/components/Layout"));
  preload(() => import("@/pages/Dashboard"));
  preload(() => import("@/pages/EmailAssistant"));
  preload(() => import("@/pages/Settings"));
};

function HomeRoute() {
  const { user } = useAuth();
  
  // Preload common routes when user is logged in
  useEffect(() => {
    if (user) {
      preloadRoutes();
    }
  }, [user]);
  
  if (user) {
    return <Redirect to="/dashboard" />;
  }
  return <Homepage />;
}

function Router() {
  return (
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
        <ProtectedRoute path="/call-reconciliation" component={CallReconciliation} />
        <ProtectedRoute path="/email-assistant" component={EmailAssistant} />
        <ProtectedRoute path="/compliance" component={Compliance} />
        <AdminRoute path="/roi-calculator" component={ROICalculator} />
        <AdminRoute path="/testing-features" component={TestingFeatures} />
        <AdminRoute path="/system-logs" component={SystemLogs} />
        <AdminRoute path="/rostering-unified" component={RosteringStudioUnified} />
        <Route path="/rostering-studio">
          <Redirect to="/rostering-unified" />
        </Route>
        <Route path="/rostering-hub">
          <Redirect to="/rostering-unified" />
        </Route>
        <AdminRoute path="/billing-tool" component={BillingTool} />
        <Route path="/admin/care-worker-rotas">
          <Redirect to="/rostering-unified" />
        </Route>
        <Route path="/care-worker-rotas">
          <Redirect to="/rostering-unified" />
        </Route>
        <ProtectedRoute path="/settings" component={Settings} />
        <ProtectedRoute path="/messages" component={Messages} />

        {/* Homepage - shows landing page or redirects to dashboard */}
        <Route path="/" component={HomeRoute} />

        {/* Fallback */}
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SessionProvider>
          <SettingsProvider>
            <TemporaryDataProvider>
              <TermsGuard>
                <Router />
              </TermsGuard>
              <Toaster />
            </TemporaryDataProvider>
          </SettingsProvider>
        </SessionProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
