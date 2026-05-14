import { describe, expect, it } from "vitest";

import { buildJsonSseRequest, DEFAULT_AI_STREAM_TIMEOUT_MS, isAbortError } from "../sse";

describe("sse helpers", () => {
  it("builds JSON SSE requests with streaming headers and a long timeout", () => {
    const request = buildJsonSseRequest({ hello: "world" });
    const headers = new Headers(request.headers);

    expect(request.method).toBe("POST");
    expect(request.credentials).toBe("include");
    expect(request.body).toBe(JSON.stringify({ hello: "world" }));
    expect(request.timeoutMs).toBe(DEFAULT_AI_STREAM_TIMEOUT_MS);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Accept")).toBe("text/event-stream");
  });

  it("preserves custom headers and timeout overrides", () => {
    const request = buildJsonSseRequest(
      { test: true },
      {
        timeoutMs: 1234,
        headers: { "X-Test": "yes" },
      },
    );
    const headers = new Headers(request.headers);

    expect(request.timeoutMs).toBe(1234);
    expect(headers.get("X-Test")).toBe("yes");
    expect(headers.get("Accept")).toBe("text/event-stream");
  });

  it("detects abort errors", () => {
    expect(isAbortError(new DOMException("Request timed out", "AbortError"))).toBe(true);
    expect(isAbortError(new Error("Something else"))).toBe(false);
  });
});
