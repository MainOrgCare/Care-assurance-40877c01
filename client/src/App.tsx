import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Layout from "@/components/Layout";
import Homepage from "@/pages/Homepage";
import Dashboard from "@/pages/Dashboard";
import { AuthProvider } from "@/context/AuthContext";
import { TemporaryDataProvider } from "@/context/TemporaryDataContext";
import { SessionProvider } from "@/context/SessionContext";
import { SettingsProvider } from "@/context/SettingsContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminRoute from "@/components/AdminRoute";
import { TermsGuard } from "@/components/TermsGuard";
import TermsConditions from "@/pages/TermsConditions";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import { useAuth } from "@/context/AuthContext";
import { Redirect } from "wouter";
import React, { Suspense, useEffect } from "react";

// Lazy loaded pages for code splitting - reduces initial bundle size
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
const Compliance = React.lazy(() => import("@/pages/Compliance"));
const ROICalculator = React.lazy(() => import("@/pages/ROICalculator"));
const TestingFeatures = React.lazy(() => import("@/pages/TestingFeatures"));
const CareWorkerRotas = React.lazy(() => import("@/pages/CareWorkerRotas"));
const BillingTool = React.lazy(() => import("@/pages/BillingTool"));
const SystemLogs = React.lazy(() => import("@/pages/SystemLogs"));

// Preload common routes when browser is idle
const preloadRoutes = () => {
  const preload = (importFn: () => Promise<unknown>) => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => importFn(), { timeout: 3000 });
    } else {
      setTimeout(() => importFn(), 2000);
    }
  };
  
  // Preload most commonly visited pages after login
  preload(() => import("@/pages/EmailAssistant"));
  preload(() => import("@/pages/Compliance"));
  preload(() => import("@/pages/service-users/Upload"));
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
      <AdminRoute path="/rostering-studio" component={CareWorkerRotas} />
      <AdminRoute path="/system-logs" component={SystemLogs} />
      <AdminRoute path="/care-worker-rotas" component={CareWorkerRotas} />
      <AdminRoute path="/billing-tool" component={BillingTool} />
      <Route path="/admin/care-worker-rotas">
        <Redirect to="/care-worker-rotas" />
      </Route>
      <ProtectedRoute path="/settings" component={Settings} />

      {/* Homepage - shows landing page or redirects to dashboard */}
      <Route path="/" component={HomeRoute} />

      {/* Fallback */}
      <Route component={NotFound} />
    </Switch>
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
