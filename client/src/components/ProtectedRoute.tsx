import { useAuth } from "@/context/AuthContext";
import { Redirect, Route } from "wouter";
import { AuthenticatedRouteShell } from "@/components/AuthenticatedRouteShell";

export default function ProtectedRoute({
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

  return (
    <Route path={path}>
      {(params) => <AuthenticatedRouteShell component={Component} params={params} />}
    </Route>
  );
}
