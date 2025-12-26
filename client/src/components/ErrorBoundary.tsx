import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

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
        <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
          <div className="max-w-md w-full bg-white p-6 rounded-lg shadow-lg border border-red-200">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <AlertTriangle size={32} />
              <h1 className="text-xl font-bold">Something went wrong</h1>
            </div>
            <p className="text-gray-600 mb-4">The application encountered a critical error.</p>
            <pre className="bg-gray-100 p-3 rounded text-xs font-mono overflow-auto max-h-40 text-red-800">
              {this.state.error?.message}
            </pre>
            <button 
              className="mt-4 w-full bg-red-600 text-white py-2 rounded hover:bg-red-700 transition"
              onClick={() => window.location.reload()}
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
