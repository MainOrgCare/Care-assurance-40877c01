import { useAuth } from "@/context/AuthContext";
import { Redirect, Route } from "wouter";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";

const Layout = lazy(() => import("./Layout"));

export default function AdminRoute({
  component: Component,
  path,
}: {
  component: React.ComponentType<any>;
  path: string;
}) {
  const { user } = useAuth();

  if (!user) {
    return (
      <Route path={path}>
        <Redirect to="/" />
      </Route>
    );
  }

  if (user.role !== "admin") {
    return (
      <Route path={path}>
        <Redirect to="/dashboard" />
      </Route>
    );
  }

  return (
    <Route path={path}>
      {(params) => (
        <Suspense
          fallback={
            <div className="min-h-screen w-full flex items-center justify-center bg-background text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          }
        >
          <Layout>
            <Component {...params} />
          </Layout>
        </Suspense>
      )}
    </Route>
  );
}
