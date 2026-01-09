import { useAuth } from "@/context/AuthContext";
import { Redirect, Route } from "wouter";
import Layout from "./Layout";

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
        <Layout>
          <Component {...params} />
        </Layout>
      )}
    </Route>
  );
}