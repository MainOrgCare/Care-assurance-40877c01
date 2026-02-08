import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "leaflet/dist/leaflet.css";

const REQUEST_ID_HEADER = "X-Request-ID";
const randomRequestId = (): string =>
	(typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
		? crypto.randomUUID()
		: `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const reportClientError = (payload: {
	message: string;
	stack?: string;
	componentStack?: string;
	url?: string;
}): void => {
	const body = {
		message: payload.message,
		stack: payload.stack,
		componentStack: payload.componentStack,
		url: payload.url || window.location.href,
		timestamp: new Date().toISOString(),
	};

	fetch("/api/log-client-error", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		credentials: "include",
		keepalive: true,
		body: JSON.stringify(body),
	}).catch(() => {
		/* never throw from reporter */
	});
};

window.addEventListener("error", (event) => {
	const message = event.error?.message || event.message || "Unknown client error";
	reportClientError({
		message,
		stack: event.error?.stack,
		url: event.filename || window.location.href,
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

createRoot(document.getElementById("root")!).render(<App />);
