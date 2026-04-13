import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "leaflet/dist/leaflet.css";
import { AUTH_EXPIRED_EVENT, REQUEST_ID_HEADER, randomRequestId } from "@/lib/queryClient";
import { reportClientError } from "@/lib/clientErrorReporter";
import { toast } from "@/hooks/use-toast";

const AUTH_EXPIRED_EXCLUDE_PATTERN = /\/api\/auth\/(login|register|demo|logout)\b/i;
let lastGlobalErrorToastAt = 0;

const showGlobalErrorToast = (message: string): void => {
	const now = Date.now();
	// Prevent toast storms from repeated uncaught errors.
	if (now - lastGlobalErrorToastAt < 10_000) {
		return;
	}
	lastGlobalErrorToastAt = now;

	toast({
		title: "Unexpected error",
		description: message || "An unexpected issue occurred. Please retry your last action.",
		variant: "destructive",
	});
};

const shouldNotifyAuthExpired = (response: Response): boolean => {
	if (response.status !== 401) {
		return false;
	}

	let pathname = "";
	try {
		pathname = new URL(response.url, window.location.origin).pathname;
	} catch {
		return false;
	}

	if (!pathname.startsWith("/api") || AUTH_EXPIRED_EXCLUDE_PATTERN.test(pathname)) {
		return false;
	}

	return true;
};

const emitAuthExpired = (response: Response): void => {
	window.dispatchEvent(
		new CustomEvent(AUTH_EXPIRED_EVENT, {
			detail: {
				status: 401,
				url: response.url,
				pathname: new URL(response.url, window.location.origin).pathname,
			},
		})
	);
};

window.addEventListener("error", (event) => {
	const message = event.error?.message || event.message || "Unknown client error";
	showGlobalErrorToast(message);
	reportClientError({
		message,
		stack: event.error?.stack,
		url: event.filename || window.location.href,
		source: "window.error",
		type: "error",
	});
});

window.addEventListener("unhandledrejection", (event) => {
	const reason = event.reason;
	const message =
		typeof reason === "string"
			? reason
			: reason?.message || "Unhandled promise rejection";
	showGlobalErrorToast(message);
	reportClientError({
		message,
		stack: reason?.stack,
		source: "unhandledrejection",
		type: "promise",
	});
});

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "");
const API_REQUEST_TIMEOUT_MS = 30_000;
const API_STREAM_REQUEST_TIMEOUT_MS = 180_000;
const EVENT_STREAM_ACCEPT_PATTERN = /\btext\/event-stream\b/i;
const originalFetch = window.fetch.bind(window);

type ExtendedRequestInit = RequestInit & {
	timeoutMs?: number;
};

const withRequestId = (headers?: HeadersInit): Headers => {
	const finalHeaders = new Headers(headers || undefined);
	if (!finalHeaders.has(REQUEST_ID_HEADER)) {
		finalHeaders.set(REQUEST_ID_HEADER, randomRequestId());
	}
	return finalHeaders;
};

const resolveApiUrl = (input: RequestInfo | URL): URL | null => {
	if (typeof input === "string") {
		if (!input.startsWith("/api")) return null;
		return new URL(input, window.location.origin);
	}

	if (input instanceof URL) {
		if (input.origin !== window.location.origin || !input.pathname.startsWith("/api")) {
			return null;
		}
		return input;
	}

	if (input instanceof Request) {
		const url = new URL(input.url, window.location.origin);
		if (url.origin !== window.location.origin || !url.pathname.startsWith("/api")) {
			return null;
		}
		return url;
	}

	return null;
};

const resolveApiRequestTimeoutMs = (input: RequestInfo | URL, init?: RequestInit): number => {
	const explicitTimeoutMs = (init as ExtendedRequestInit | undefined)?.timeoutMs;
	if (typeof explicitTimeoutMs === "number" && Number.isFinite(explicitTimeoutMs)) {
		return Math.max(0, explicitTimeoutMs);
	}

	const requestHeaders = new Headers(
		init?.headers ?? (input instanceof Request ? input.headers : undefined),
	);
	const acceptHeader = requestHeaders.get("Accept") || "";
	if (EVENT_STREAM_ACCEPT_PATTERN.test(acceptHeader)) {
		return API_STREAM_REQUEST_TIMEOUT_MS;
	}

	return API_REQUEST_TIMEOUT_MS;
};

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
	const apiUrl = resolveApiUrl(input);
	if (!apiUrl) {
		return originalFetch(input, init);
	}

	const finalUrl = apiBaseUrl
		? `${apiBaseUrl}${apiUrl.pathname}${apiUrl.search}`
		: `${apiUrl.pathname}${apiUrl.search}`;

	const requestHeaders = withRequestId(
		init?.headers ?? (input instanceof Request ? input.headers : undefined),
	);

	const controller = new AbortController();
	const requestTimeoutMs = resolveApiRequestTimeoutMs(input, init);
	const timeout = requestTimeoutMs > 0
		? setTimeout(
				() => controller.abort(new DOMException("Request timed out", "AbortError")),
				requestTimeoutMs,
		  )
		: null;

	const sourceSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
	let signal: AbortSignal = controller.signal;
	if (typeof AbortSignal.any === "function") {
		signal = sourceSignal ? AbortSignal.any([sourceSignal, controller.signal]) : controller.signal;
	} else if (sourceSignal) {
		sourceSignal.addEventListener("abort", () => controller.abort(sourceSignal.reason), { once: true });
	}

	if (sourceSignal?.aborted) {
		if (timeout !== null) {
			clearTimeout(timeout);
		}
		throw sourceSignal.reason ?? new DOMException("Aborted", "AbortError");
	}

	const finalInit: RequestInit = {
		...init,
		credentials: init?.credentials ?? (input instanceof Request ? input.credentials : "include") ?? "include",
		headers: requestHeaders,
		signal,
	};

	try {
		const response = await originalFetch(finalUrl, finalInit);
		if (shouldNotifyAuthExpired(response)) {
			emitAuthExpired(response);
		}
		return response;
	} finally {
		if (timeout !== null) {
			clearTimeout(timeout);
		}
	}
};

const rootElement = document.getElementById("root");
if (!rootElement) {
	throw new Error("Root element #root not found in document");
}

createRoot(rootElement).render(
	<StrictMode>
		<App />
	</StrictMode>
);
