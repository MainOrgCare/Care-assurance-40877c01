import { QueryClient, QueryFunction, type QueryFunctionContext } from "@tanstack/react-query";

export const REQUEST_ID_HEADER = "X-Request-ID";
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

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
    return await fetch(input, {
      ...init,
      headers: withRequestIdHeader(init?.headers),
      signal: composedSignal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function throwIfResNotOk(res: Response): Promise<void> {
  if (!res.ok) {
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
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }: QueryFunctionContext) => {
    const path = (queryKey as readonly string[]).join("/");
    const res = await fetchWithTimeout(path, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await parseApiResponse(res);
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      // Keep data reasonably fresh without forcing a visible loading state on navigation.
      // When cached data exists, React Query will show it immediately and refetch in the background.
      staleTime: 5 * 60_000, // 5 minutes
      gcTime: 15 * 60_000, // 15 minutes
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
