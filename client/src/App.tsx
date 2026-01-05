import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Layout from "@/components/Layout";
import React, { Suspense, lazy } from "react";
const Homepage = lazy(() => import("@/pages/Homepage"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Login = lazy(() => import("@/pages/Login"));
const SecretAdminPortal = lazy(() => import("@/pages/SecretAdminPortal"));
const CallReconciliation = lazy(() => import("@/pages/CallReconciliation"));
const EmailAssistant = lazy(() => import("@/pages/EmailAssistant"));
import { AuthProvider } from "@/context/AuthContext";
import { TemporaryDataProvider } from "@/context/TemporaryDataContext";
import { SessionProvider } from "@/context/SessionContext";
import { SettingsProvider } from "@/context/SettingsContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { TermsGuard } from "@/components/TermsGuard";
import TermsConditions from "@/pages/TermsConditions";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import { useAuth } from "@/context/AuthContext";
import { Redirect } from "wouter";

// New Pages
const ServiceUserUpload = lazy(() => import("@/pages/service-users/Upload"));
const CarePlanning = lazy(() => import("@/pages/service-users/CarePlanning"));
const RiskAssessment = lazy(() => import("@/pages/service-users/RiskAssessment"));
const PlanEnhancer = lazy(() => import("@/pages/service-users/PlanEnhancer"));
const CarersList = lazy(() => import("@/pages/care-workers/CarersList"));
const EMARAudit = lazy(() => import("@/pages/care-workers/EMARAudit"));
const VisitAudit = lazy(() => import("@/pages/care-workers/VisitAudit"));
const Performance = lazy(() => import("@/pages/care-workers/Performance"));
const Settings = lazy(() => import("@/pages/Settings"));
const Compliance = lazy(() => import("@/pages/Compliance"));
const ROICalculator = lazy(() => import("@/pages/ROICalculator"));

function HomeRoute() {
  const { user } = useAuth();
  if (user) {
    return <Redirect to="/dashboard" />;
  }
  return <Homepage />;
}

function Router() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Switch>
        <Route path="/login" component={Login} />
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
        <ProtectedRoute path="/shadow-admin-portal" component={SecretAdminPortal} />
        <ProtectedRoute path="/call-reconciliation" component={CallReconciliation} />
        <ProtectedRoute path="/email-assistant" component={EmailAssistant} />
        <ProtectedRoute path="/compliance" component={Compliance} />
        <ProtectedRoute path="/roi-calculator" component={ROICalculator} />
        <ProtectedRoute path="/settings" component={Settings} />

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