/**
 * Server Utilities — Barrel Export
 *
 * Re-exports all shared utility modules so route files can import from a
 * single path: `import { logSecurityEvent, validatePassword } from "../utils";`
 *
 * @module server/utils
 */

export {
  logSecurityEvent,
  type SecurityEventType,
  type SecurityAuditLog,
} from "./securityAudit";

export {
  validatePassword,
  getLoginAttemptKey,
  pruneLoginAttempts,
  getBlockedSeconds,
  recordLoginFailure,
  clearLoginFailures,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
} from "./passwordPolicy";

export {
  sanitizeStringInput,
  validateRequestBody,
} from "./inputValidation";

export { safeErrorMessage } from "./safeError";

export {
  apiSuccess,
  apiCreated,
  apiError,
  apiBadRequest,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiConflict,
  apiTooManyRequests,
  apiInternalError,
  type ApiErrorOptions,
} from "./apiResponse";

export { logger, createLogger } from "./logger";
