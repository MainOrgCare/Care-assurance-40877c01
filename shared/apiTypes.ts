/**
 * Shared API Response Types
 *
 * Canonical shapes returned by the server and consumed by the client.
 * Keeping them in `shared/` ensures both sides stay in sync.
 *
 * @module shared/apiTypes
 */

/* ── Success envelope ─────────────────────────────────────────────── */

/**
 * Standard success response wrapper.
 *
 * ```json
 * { "data": { ... }, "message": "Created" }
 * ```
 */
export interface ApiSuccessResponse<T = unknown> {
  data: T;
  message?: string;
}

/* ── Error envelope ───────────────────────────────────────────────── */

/**
 * Standard error response wrapper.
 *
 * ```json
 * { "message": "Validation failed", "code": "BAD_REQUEST", "errors": [...] }
 * ```
 */
export interface ApiErrorResponse {
  message: string;
  /** Machine-readable error code (e.g. `"NOT_FOUND"`, `"UNAUTHORIZED"`). */
  code?: string;
  /** Optional field-level validation errors. */
  errors?: ApiFieldError[];
}

export interface ApiFieldError {
  field: string;
  message: string;
}

/* ── Machine error codes ──────────────────────────────────────────── */

/**
 * Known machine-readable error codes used in `ApiErrorResponse.code`.
 * Route handlers can use the string literal directly — this type simply
 * documents the contract.
 */
export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "VALIDATION_ERROR"
  | "SERVICE_UNAVAILABLE";

/* ── Pagination ───────────────────────────────────────────────────── */

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T = unknown> {
  data: T[];
  pagination: PaginationMeta;
}

/* ── HTTP status constants ────────────────────────────────────────── */

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export type HttpStatusCode = (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS];
