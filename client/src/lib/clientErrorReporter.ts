import { REQUEST_ID_HEADER, randomRequestId } from "@/lib/queryClient";

export type ClientErrorPayload = {
  message: string;
  stack?: string;
  componentStack?: string;
  url?: string;
  source?: "window.error" | "unhandledrejection" | "react.error-boundary" | "manual";
  type?: string;
  timestamp?: string;
  requestId?: string;
};

const truncate = (value: string | undefined, max: number): string | undefined => {
  if (typeof value !== "string") return undefined;
  return value.slice(0, max);
};

export const reportClientError = (payload: ClientErrorPayload): void => {
  const requestId = payload.requestId || randomRequestId();
  const body = {
    message: truncate(payload.message, 1000) || "Unknown client error",
    stack: truncate(payload.stack, 4000),
    componentStack: truncate(payload.componentStack, 3000),
    url: truncate(payload.url || window.location.href, 1000),
    source: payload.source || "manual",
    type: payload.type || "runtime",
    timestamp: payload.timestamp || new Date().toISOString(),
    requestId,
    userAgent: navigator.userAgent,
  };

  fetch("/api/client-errors", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [REQUEST_ID_HEADER]: requestId,
    },
    credentials: "include",
    keepalive: true,
    body: JSON.stringify(body),
  }).catch(() => {
    // Intentionally swallow to avoid cascading failures.
  });
};
