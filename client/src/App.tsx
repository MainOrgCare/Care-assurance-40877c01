import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Layout from "@/components/Layout";
import Homepage from "@/pages/Homepage";
import Dashboard from "@/pages/Dashboard";
import Login from "@/pages/Login";
import SecretAdminPortal from "@/pages/SecretAdminPortal";
import CallReconciliation from "@/pages/CallReconciliation";
import EmailAssistant from "@/pages/EmailAssistant";
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

// New Pages
import ServiceUserUpload from "@/pages/service-users/Upload";
import CarePlanning from "@/pages/service-users/CarePlanning";
import RiskAssessment from "@/pages/service-users/RiskAssessment";
import PlanEnhancer from "@/pages/service-users/PlanEnhancer";
import CarersList from "@/pages/care-workers/CarersList";
import EMARAudit from "@/pages/care-workers/EMARAudit";
import VisitAudit from "@/pages/care-workers/VisitAudit";
import Performance from "@/pages/care-workers/Performance";
import Settings from "@/pages/Settings";
import Compliance from "@/pages/Compliance";
import ROICalculator from "@/pages/ROICalculator";
import TestingFeatures from "@/pages/TestingFeatures";
import CareWorkerRotas from "@/pages/CareWorkerRotas";

function HomeRoute() {
  const { user } = useAuth();
  if (user) {
    return <Redirect to="/dashboard" />;
  }
  return <Homepage />;
}

function Router() {
  return (
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
      <AdminRoute path="/shadow-admin-portal" component={SecretAdminPortal} />
      <ProtectedRoute path="/call-reconciliation" component={CallReconciliation} />
      <ProtectedRoute path="/email-assistant" component={EmailAssistant} />
      <ProtectedRoute path="/compliance" component={Compliance} />
      <AdminRoute path="/roi-calculator" component={ROICalculator} />
      <AdminRoute path="/testing-features" component={TestingFeatures} />
      <AdminRoute path="/care-worker-rotas" component={CareWorkerRotas} />
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
