/**
 * Input Validation & Sanitization
 *
 * Provides server-side input sanitization to prevent injection attacks and
 * structured request body validation with security event logging.
 *
 * @module server/utils/inputValidation
 */
import { logSecurityEvent } from "./securityAudit";

/**
 * Validate and sanitize a string input to prevent injection attacks.
 *
 * Strips null bytes and non-printable control characters.  Suspicious patterns
 * (script injection, prototype pollution, template injection) are logged as
 * security events but **not** rejected — this allows legitimate clinical text
 * that might coincidentally match a pattern while still maintaining an audit trail.
 *
 * @returns The sanitized string, or `null` if the input is not a string or
 *          exceeds `maxLength`.
 */
export function sanitizeStringInput(
  input: unknown,
  maxLength: number = 500_000,
): string | null {
  if (typeof input !== "string") return null;
  if (input.length > maxLength) return null;

  const suspiciousPatterns = [
    /<script\b/i,
    /javascript:/i,
    /on\w+\s*=/i, // onclick=, onerror=, etc.
    /\{\{.*\}\}/, // Template injection (but allow PII tokens)
    /\$\{.*\}/, // Template literal injection
    /__proto__/i,
    /constructor\s*\(/,
  ];

  const hasSuspicious = suspiciousPatterns.some((p) => p.test(input));
  if (hasSuspicious) {
    logSecurityEvent({
      eventType: "SUSPICIOUS_INPUT",
      endpoint: "input_validation",
      details: {
        inputLength: input.length,
        patterns: suspiciousPatterns
          .filter((p) => p.test(input))
          .map((p) => p.source),
      },
    });
  }

  // Remove null bytes and non-printable control characters (keep \n, \t, \r)
  return input.replace(/\0/g, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

type FieldType =
  | "string"
  | "boolean"
  | "number"
  | "array"
  | "object"
  | "optional";

/**
 * Validate JSON body fields with detailed, structured error messages.
 *
 * @returns `{ valid: true, errors: [] }` on success, or `{ valid: false, errors: [...] }`
 *          with per-field diagnostics.
 */
export function validateRequestBody<
  T extends Record<string, FieldType>,
>(
  body: unknown,
  schema: T,
  endpoint: string,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const [field, type] of Object.entries(schema)) {
    const value = (body as Record<string, unknown>)?.[field];
    const isOptional = type === "optional";

    if (value === undefined || value === null) {
      if (!isOptional) {
        errors.push(`Missing required field: ${field}`);
      }
      continue;
    }

    if (isOptional) continue;

    const actualType = Array.isArray(value) ? "array" : typeof value;
    if (actualType !== type) {
      errors.push(
        `Invalid type for ${field}: expected ${type}, got ${actualType}`,
      );
    }
  }

  if (errors.length > 0) {
    logSecurityEvent({
      eventType: "INPUT_VALIDATION",
      endpoint,
      details: { errors, fieldCount: Object.keys(schema).length },
    });
  }

  return { valid: errors.length === 0, errors };
}
