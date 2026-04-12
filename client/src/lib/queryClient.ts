import { QueryClient, QueryFunction, MutationCache, type QueryFunctionContext } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

export const REQUEST_ID_HEADER = "X-Request-ID";
export const AUTH_EXPIRED_EVENT = "care-assurance:auth-expired";
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const SENSITIVE_ENDPOINT_PATTERN = /\/api\/(ai|parse-pdf|gdpr|client-errors)\b/i;

export const randomRequestId = (): string =>
  (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

class ApiError extends Error {
  status: number;
  body: string;
  requestId?: string;

  constructor(status: number, body: string, requestId?: string) {
    super(requestId ? `${status} [${requestId}]: ${body}` : `${status}: ${body}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    this.requestId = requestId;
  }
}

/**
 * Extracts a user-friendly error message from any thrown value.
 * Handles ApiError HTTP semantics and falls back gracefully for plain Errors.
 */
export function getApiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return "Too many requests — please wait a moment and try again.";
    if (error.status === 503) return "Service temporarily unavailable. Please try again shortly.";
    if (error.status === 401) return "Your session has expired. Please sign in again.";
    if (error.status === 403) return "You do not have permission to perform this action.";
    if (error.status >= 500) return "A server error occurred. Please try again or contact support.";
    // Use the parsed body message for 4xx errors (they usually have helpful text)
    return error.body || error.message || "An unexpected error occurred.";
  }
  if (error instanceof Error) {
    // Suppress noise from aborted requests (e.g. navigating away mid-request)
    if (error.name === "AbortError") return "Request was cancelled.";
    return error.message || "An unexpected error occurred.";
  }
  return "An unexpected error occurred.";
}

export const normalizeApiPayload = <T>(payload: unknown): T => {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
};

export async function parseApiResponse<T>(res: Response): Promise<T> {
  const payload = await res.json();
  return normalizeApiPayload<T>(payload);
}

const withRequestIdHeader = (headers?: HeadersInit): Headers => {
  const nextHeaders = new Headers(headers || undefined);
  if (!nextHeaders.has(REQUEST_ID_HEADER)) {
    nextHeaders.set(REQUEST_ID_HEADER, randomRequestId());
  }
  return nextHeaders;
};

const AUTH_EXPIRED_EXCLUDE_PATTERN = /\/api\/auth\/(login|register|demo|logout)\b/i;

const notifyAuthExpired = (res: Response): void => {
  if (res.status !== 401 || typeof window === "undefined") {
    return;
  }

  let pathname = "";
  try {
    pathname = new URL(res.url, window.location.origin).pathname;
  } catch {
    return;
  }

  if (!pathname.startsWith("/api") || AUTH_EXPIRED_EXCLUDE_PATTERN.test(pathname)) {
    return;
  }

  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT, {
    detail: {
      status: 401,
      url: res.url,
      pathname,
    },
  }));
};

const isSensitiveApiUrl = (input: RequestInfo | URL): boolean => {
  let target = "";
  if (typeof input === "string") {
    target = input;
  } else if (input instanceof URL) {
    target = input.pathname;
  } else if (input instanceof Request) {
    target = input.url;
  }
  return SENSITIVE_ENDPOINT_PATTERN.test(target);
};

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  // Compose caller's signal with the timeout signal so either can abort.
  // AbortSignal.any() is available in modern browsers; fall back gracefully.
  const callerSignal = init?.signal;
  let composedSignal: AbortSignal;
  if (typeof AbortSignal.any === "function") {
    composedSignal = callerSignal
      ? AbortSignal.any([callerSignal, controller.signal])
      : controller.signal;
  } else if (callerSignal) {
    // Fallback: link caller signal to timeout controller manually
    composedSignal = controller.signal;
    callerSignal.addEventListener(
      "abort",
      () => controller.abort(callerSignal.reason),
      { once: true },
    );
  } else {
    composedSignal = controller.signal;
  }

  // If the caller already aborted before we even start, clean up immediately.
  if (callerSignal?.aborted) {
    clearTimeout(timeout);
    throw callerSignal.reason ?? new DOMException("Aborted", "AbortError");
  }

  try {
    const headers = withRequestIdHeader(init?.headers);
    const isSensitive = isSensitiveApiUrl(input);
    if (isSensitive) {
      headers.set("Cache-Control", "no-store");
      headers.set("Pragma", "no-cache");
      headers.set("Expires", "0");
    }

    return await fetch(input, {
      ...init,
      headers,
      cache: isSensitive ? "no-store" : init?.cache,
      signal: composedSignal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function throwIfResNotOk(res: Response): Promise<void> {
  if (!res.ok) {
    notifyAuthExpired(res);

    const text = (await res.text()) || res.statusText;
    const requestIdFromHeader = res.headers.get(REQUEST_ID_HEADER) || undefined;
    let message = text;
    let requestId = requestIdFromHeader;

    try {
      const parsed = JSON.parse(text) as {
        message?: string;
        error?: string;
        requestId?: string;
      };
      if (parsed?.message && typeof parsed.message === "string") {
        message = parsed.message;
      } else if (parsed?.error && typeof parsed.error === "string") {
        message = parsed.error;
      }
      if (parsed?.requestId && typeof parsed.requestId === "string") {
        requestId = parsed.requestId;
      }
    } catch {
      // Non-JSON error response; keep raw text.
    }

    throw new ApiError(res.status, message || res.statusText, requestId);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetchWithTimeout(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export function getQueryFn<T>(options: { on401: "throw" }): QueryFunction<T>;
export function getQueryFn<T>(options: { on401: "returnNull" }): QueryFunction<T | null>;
export function getQueryFn<T>(
  { on401: unauthorizedBehavior }: { on401: UnauthorizedBehavior },
): QueryFunction<T | null> {
  return async ({ queryKey }: QueryFunctionContext) => {
    const path = (queryKey as readonly string[]).join("/");
    const res = await fetchWithTimeout(path, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      notifyAuthExpired(res);
      return null;
    }

    await throwIfResNotOk(res);
    return await parseApiResponse<T>(res);
  };
}

export const queryClient = new QueryClient({
  // Global fallback for mutations that don't supply their own onError handler.
  // This prevents silent failures — any unhandled mutation error surfaces as a toast.
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.options.onError) {
        // Mutation already handles its own errors — skip global handler.
        return;
      }
      // 401 is handled globally by the auth-expired event; don't double-toast.
      if (error instanceof ApiError && error.status === 401) return;

      toast({
        title: "Action failed",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  }),
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      // Keep data reasonably fresh without forcing a visible loading state on navigation.
      // When cached data exists, React Query will show it immediately and refetch in the background.
      staleTime: 60 * 60_000, // 1 hour (cost saving mode)
      gcTime: 65 * 60_000, // 65 minutes 
      placeholderData: (previousData: unknown) => previousData,
      retry: (failureCount: number, error: unknown) => {
        if (failureCount >= 2) return false;
        if (error instanceof ApiError) {
          if (error.status === 401 || error.status === 403 || error.status === 404) return false;
          return error.status >= 500 || error.status === 429;
        }
        // Network / abort / unknown runtime errors can be transient.
        return true;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
