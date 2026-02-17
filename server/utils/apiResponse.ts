/**
 * Standardised API Response Helpers
 *
 * Provides consistent response shapes across all endpoints so the client
 * can rely on a predictable contract:
 *
 * **Success:**
 * ```json
 * { "data": <T>, "message"?: "optional description" }
 * ```
 *
 * **Error:**
 * ```json
 * { "message": "human-readable error", "code"?: "MACHINE_CODE", "errors"?: [...] }
 * ```
 *
 * Existing route handlers that already return `{ message }` are compatible —
 * these helpers simply reduce boilerplate and enforce the shape.
 *
 * @module server/utils/apiResponse
 */

import type { Response } from "express";

/* ── Success helpers ──────────────────────────────────────────────── */

/**
 * Send a standard JSON success response.
 *
 * @param res   Express response object
 * @param data  Payload to return under `data`
 * @param opts  Optional status code (default 200) and message
 */
export function apiSuccess<T>(
  res: Response,
  data: T,
  opts?: { status?: number; message?: string },
): void {
  const status = opts?.status ?? 200;
  const body: Record<string, unknown> = { data };
  if (opts?.message) body.message = opts.message;
  res.status(status).json(body);
}

/**
 * 201 Created shorthand.
 */
export function apiCreated<T>(
  res: Response,
  data: T,
  message = "Created successfully",
): void {
  apiSuccess(res, data, { status: 201, message });
}

/* ── Error helpers ────────────────────────────────────────────────── */

export interface ApiErrorOptions {
  /** Machine-readable error code (e.g. `"INVALID_INPUT"`, `"NOT_FOUND"`) */
  code?: string;
  /** Field-level validation errors */
  errors?: Array<{ field: string; message: string }>;
}

/**
 * Send a standard JSON error response.
 *
 * @param res      Express response object
 * @param status   HTTP status code (4xx / 5xx)
 * @param message  Human-readable error message
 * @param opts     Optional machine code and field errors
 */
export function apiError(
  res: Response,
  status: number,
  message: string,
  opts?: ApiErrorOptions,
): void {
  const body: Record<string, unknown> = { message };
  if (opts?.code) body.code = opts.code;
  if (opts?.errors) body.errors = opts.errors;
  res.status(status).json(body);
}

/* ── Common error shortcuts ───────────────────────────────────────── */

export function apiBadRequest(
  res: Response,
  message = "Bad request",
  opts?: ApiErrorOptions,
): void {
  apiError(res, 400, message, { code: "BAD_REQUEST", ...opts });
}

export function apiUnauthorized(
  res: Response,
  message = "Unauthorized",
): void {
  apiError(res, 401, message, { code: "UNAUTHORIZED" });
}

export function apiForbidden(
  res: Response,
  message = "Forbidden",
): void {
  apiError(res, 403, message, { code: "FORBIDDEN" });
}

export function apiNotFound(
  res: Response,
  message = "Not found",
): void {
  apiError(res, 404, message, { code: "NOT_FOUND" });
}

export function apiConflict(
  res: Response,
  message = "Conflict",
): void {
  apiError(res, 409, message, { code: "CONFLICT" });
}

export function apiTooManyRequests(
  res: Response,
  message = "Too many requests",
  retryAfterSeconds?: number,
): void {
  if (retryAfterSeconds) {
    res.setHeader("Retry-After", String(retryAfterSeconds));
  }
  apiError(res, 429, message, { code: "RATE_LIMITED" });
}

export function apiInternalError(
  res: Response,
  message = "Internal server error",
): void {
  apiError(res, 500, message, { code: "INTERNAL_ERROR" });
}
