import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/clientErrorReporter";

const IS_PRODUCTION = import.meta.env.PROD;

interface Props {
  children: ReactNode;
  /** Optional custom fallback UI. Receives error + reset callback. */
  fallback?: (props: { error: Error; reset: () => void }) => ReactNode;
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
    // Report to server (fire-and-forget — error logging must never block UI)
    try {
      reportClientError({
        message: error.message,
        stack: error.stack,
        // componentStack is string | null in React 18; reporter expects string | undefined
        componentStack: errorInfo.componentStack ?? undefined,
        url: window.location.href,
        source: "react.error-boundary",
        type: "render",
      });
    } catch { /* swallow */ }
  }

  public reset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError && this.state.error) {
      // Allow consumers to supply a custom fallback
      if (this.props.fallback) {
        return this.props.fallback({ error: this.state.error, reset: this.reset });
      }

      return (
        <div className="flex flex-1 items-center justify-center p-6" role="alert">
          <Card className="w-full max-w-lg">
            <CardContent className="pt-8 pb-7 space-y-4">
              <div className="flex items-center gap-3 text-destructive">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-destructive/15 ring-1 ring-destructive/25">
                  <AlertTriangle size={22} />
                </div>
                <div>
                  <h1 className="text-xl font-heading font-semibold text-foreground">Something went wrong</h1>
                  <p className="text-sm text-muted-foreground">An unexpected error occurred. You can retry rendering this section or reload the page.</p>
                </div>
              </div>
              {!IS_PRODUCTION && (
                <details className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Technical details</summary>
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs text-destructive font-mono">
                    {this.state.error?.message}
                  </pre>
                </details>
              )}
              <div className="flex items-center gap-3">
                <Button variant="outline" className="flex-1 gap-2" onClick={this.reset}>
                  <RefreshCw size={14} />
                  Retry
                </Button>
                <Button className="flex-1" variant="destructive" onClick={() => window.location.reload()}>
                  Reload Page
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
