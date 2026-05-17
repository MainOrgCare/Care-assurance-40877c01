import { useAuth } from "@/context/AuthContext";
import { Redirect, Route } from "wouter";
import { AuthenticatedRouteShell } from "@/components/AuthenticatedRouteShell";
import { canAccessAppPath, getAuthenticatedHomePath } from "@shared/roles";

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

  if (!canAccessAppPath(user.role, path)) {
    return (
      <Route path={path}>
        <Redirect to={getAuthenticatedHomePath()} />
      </Route>
    );
  }

  return (
    <Route path={path}>
      {(params) => <AuthenticatedRouteShell component={Component} params={params} />}
    </Route>
  );
}
