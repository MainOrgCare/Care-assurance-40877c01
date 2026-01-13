import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <Card className="w-full max-w-lg">
            <CardContent className="pt-8 pb-7 space-y-4">
              <div className="flex items-center gap-3 text-destructive">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-destructive/15 ring-1 ring-destructive/25">
                  <AlertTriangle size={22} />
                </div>
                <div>
                  <h1 className="text-xl font-heading font-semibold text-foreground">Something went wrong</h1>
                  <p className="text-sm text-muted-foreground">The application encountered a critical error.</p>
                </div>
              </div>
              <pre className="max-h-40 overflow-auto rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                {this.state.error?.message}
              </pre>
              <Button className="w-full" variant="destructive" onClick={() => window.location.reload()}>
                Reload application
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
