import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "leaflet/dist/leaflet.css";
import { AUTH_EXPIRED_EVENT, REQUEST_ID_HEADER, randomRequestId } from "@/lib/queryClient";
import { reportClientError } from "@/lib/clientErrorReporter";

const AUTH_EXPIRED_EXCLUDE_PATTERN = /\/api\/auth\/(login|register|demo|logout)\b/i;

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
	reportClientError({
		message,
		stack: reason?.stack,
		source: "unhandledrejection",
		type: "promise",
	});
});

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "");
if (apiBaseUrl) {
	const originalFetch = window.fetch.bind(window);
	const withRequestId = (headers?: HeadersInit): Headers => {
		const finalHeaders = new Headers(headers || undefined);
		if (!finalHeaders.has(REQUEST_ID_HEADER)) {
			finalHeaders.set(REQUEST_ID_HEADER, randomRequestId());
		}
		return finalHeaders;
	};
	window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
		const withApiDefaults = (requestInit?: RequestInit): RequestInit => ({
			...requestInit,
			credentials: requestInit?.credentials ?? "include",
			headers: withRequestId(requestInit?.headers),
		});

		if (typeof input === "string" && input.startsWith("/api")) {
			return originalFetch(`${apiBaseUrl}${input}`, withApiDefaults(init));
		}
		if (input instanceof Request) {
			const url = new URL(input.url);
			if (url.origin === window.location.origin && url.pathname.startsWith("/api")) {
				const nextUrl = `${apiBaseUrl}${url.pathname}${url.search}`;
				const rewrittenRequest = new Request(nextUrl, input);
				return originalFetch(
					rewrittenRequest,
					withApiDefaults({ ...init, credentials: init?.credentials ?? input.credentials })
				);
			}
		}
		return originalFetch(input, init);
	};
}

const fetchForAuthMonitor = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
	const response = await fetchForAuthMonitor(input, init);
	if (shouldNotifyAuthExpired(response)) {
		emitAuthExpired(response);
	}
	return response;
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
