/**
 * Request Logging Middleware
 *
 * Structured HTTP request/response logging for the Care Assurance platform.
 * Replaces inline logging previously in server/index.ts with a cleaner,
 * reusable module.
 *
 * - Captures JSON response bodies for dev-mode introspection
 * - Suppresses noisy static-asset and health-check paths
 * - Includes request ID correlation for production tracing
 * - Uses structured logger (JSON in prod, human-readable in dev)
 */

import type { Request, Response, NextFunction } from "express";
import { createLogger } from "../utils/logger";

const httpLog = createLogger("http");

// ── Configuration ─────────────────────────────────────────────────────

/** Paths excluded from logging entirely */
const SILENT_PATHS = new Set(["/healthz", "/readyz", "/favicon.ico"]);

/** Prefix-based exclusion (static assets) */
const SILENT_PREFIXES = ["/assets/", "/static/"];

/** Maximum characters of response body to log in dev mode */
const MAX_BODY_LOG_LENGTH = 1500;

// ── Helpers ───────────────────────────────────────────────────────────

function shouldLog(path: string): boolean {
  if (SILENT_PATHS.has(path)) return false;
  return !SILENT_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function safeStringify(payload: unknown, maxLength = MAX_BODY_LOG_LENGTH): string {
  try {
    const json = JSON.stringify(payload);
    if (json.length <= maxLength) return json;
    return `${json.slice(0, maxLength)}... [truncated]`;
  } catch {
    return "[unserializable]";
  }
}

// ── Middleware ─────────────────────────────────────────────────────────

/**
 * Express middleware that logs each HTTP request with timing, request ID,
 * and optional response body capture (dev mode only).
 *
 * @example
 * ```ts
 * import { requestLogger } from "./middleware/requestLogger";
 * app.use(requestLogger);
 * ```
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const path = req.path;
  if (!shouldLog(path)) {
    next();
    return;
  }

  const start = Date.now();
  let capturedJsonBody: Record<string, any> | undefined;

  // Intercept res.json() to capture response body for dev logging
  if (process.env.NODE_ENV !== "production") {
    const originalJson = res.json;
    res.json = function (this: Response, body: any) {
      capturedJsonBody = body;
      return originalJson.call(this, body);
    };
  }

  res.on("finish", () => {
    // Only log API routes to avoid noise from vite/static middleware
    if (!path.startsWith("/api")) return;

    const duration = Date.now() - start;
    const requestId = (req as any).requestId || "no-request-id";
    const { method } = req;
    const { statusCode } = res;

    if (process.env.NODE_ENV === "production") {
      const userId = (req as any).user?.id;
      httpLog.info("request", {
        request_id: requestId,
        method,
        path,
        status: statusCode,
        duration_ms: duration,
        user_id: userId,
        ip: req.ip,
      });
    } else {
      let logLine = `[${requestId}] ${method} ${path} ${statusCode} in ${duration}ms`;
      if (capturedJsonBody) {
        logLine += ` :: ${safeStringify(capturedJsonBody)}`;
      }
      httpLog.info(logLine);
    }
  });

  next();
}
