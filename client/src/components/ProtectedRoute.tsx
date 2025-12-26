import { useAuth } from "@/context/AuthContext";
import { Redirect, Route } from "wouter";
import Layout from "./Layout";
import { Loader2 } from "lucide-react";

export default function ProtectedRoute({
  component: Component,
  path,
}: {
  component: React.ComponentType<any>;
  path: string;
}) {
  const { user } = useAuth();

  // If we don't know the user status yet (e.g. initial load), we might show a loader
  // But here our mock auth is synchronous, so user is either null or defined immediately.
  // In a real app with async auth check:
  // if (isLoading) return <Loader2 className="animate-spin" />;

  if (!user) {
    return (
      <Route path={path}>
        <Redirect to="/" />
      </Route>
    );
  }

  return (
    <Route path={path}>
      {(params) => (
        <Layout>
          <Component {...params} />
        </Layout>
      )}
    </Route>
  );
}
