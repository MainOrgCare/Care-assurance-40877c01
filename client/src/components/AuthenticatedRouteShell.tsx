import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const Layout = lazy(() => import("./Layout"));

type AuthenticatedRouteShellProps = {
  component: React.ComponentType<any>;
  params: Record<string, string | undefined>;
};

function AuthenticatedRouteFallback() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}

export function AuthenticatedRouteShell({
  component: Component,
  params,
}: AuthenticatedRouteShellProps) {
  return (
    <Suspense fallback={<AuthenticatedRouteFallback />}>
      <Layout>
        <ErrorBoundary>
          <Component {...params} />
        </ErrorBoundary>
      </Layout>
    </Suspense>
  );
}
