/**
 * Security Audit Logging
 *
 * Provides structured, compliance-grade logging for security-relevant events.
 * Events are persisted to both console and database (GDPR audit log / system log)
 * for UK GDPR audit trail compliance.
 *
 * @module server/utils/securityAudit
 */
import { storage } from "../storage";

export type SecurityEventType =
  | "PII_SCRUB"
  | "PII_RESTORE"
  | "AI_REQUEST"
  | "INPUT_VALIDATION"
  | "RATE_LIMIT"
  | "AUTH_FAILURE"
  | "SUSPICIOUS_INPUT"
  | "LOGIN_FAILED"
  | "LOGIN_BLOCKED"
  | "IP_BLOCKED"
  | "PASSWORD_CHANGED"
  | "PASSWORD_RESET"
  | "ACCOUNT_SUSPENDED"
  | "CSRF_BLOCKED"
  | "SESSION_CREATED";

export interface SecurityAuditLog {
  timestamp: string;
  eventType: SecurityEventType;
  endpoint: string;
  userId?: string | number | null;
  username?: string | null;
  ipAddress?: string;
  details: Record<string, unknown>;
}

/**
 * Log a security-relevant event for compliance and monitoring.
 *
 * In production (or when `SECURITY_AUDIT_LOG=true`) the event is written to
 * stdout as structured JSON.  GDPR-relevant and auth-related events are also
 * persisted to the database asynchronously (fire-and-forget) so that audit
 * queries do not block the request path.
 */
export function logSecurityEvent(
  event: Omit<SecurityAuditLog, "timestamp">,
): void {
  const log: SecurityAuditLog = {
    ...event,
    timestamp: new Date().toISOString(),
  };

  // Always log to console for immediate visibility
  if (
    process.env.NODE_ENV === "production" ||
    process.env.SECURITY_AUDIT_LOG === "true"
  ) {
    console.log(`[SECURITY] ${JSON.stringify(log)}`);
  }

  // Persist to database asynchronously (fire-and-forget for performance)
  const gdprEvents: string[] = [
    "PII_SCRUB",
    "PII_RESTORE",
    "AI_REQUEST",
    "DATA_EXPORT",
    "DATA_DELETE",
    "CONSENT_CHANGE",
  ];
  const authEvents: string[] = [
    "LOGIN_FAILED",
    "LOGIN_BLOCKED",
    "IP_BLOCKED",
    "PASSWORD_CHANGED",
    "PASSWORD_RESET",
    "CSRF_BLOCKED",
  ];

  if (gdprEvents.includes(event.eventType)) {
    storage
      .createGdprAuditLog({
        eventType: event.eventType,
        endpoint: event.endpoint,
        userId:
          typeof event.userId === "number"
            ? String(event.userId)
            : (event.userId as string | undefined) || undefined,
        username: (event.username as string | undefined) || undefined,
        ipAddress: event.ipAddress,
        piiCategories:
          (event.details?.categories as string[] | undefined) || undefined,
        piiItemCount:
          (event.details?.totalItems as number | undefined) || undefined,
        details: event.details,
      })
      .catch((err: Error) => {
        console.error(
          "[SECURITY] Failed to persist GDPR audit log:",
          err.message,
        );
      });
  }

  if (authEvents.includes(event.eventType)) {
    storage
      .createSystemLog({
        eventType: `security_${event.eventType.toLowerCase()}`,
        userId: event.userId ? String(event.userId) : null,
        username: (event.username as string | null) || null,
        serviceUserInitials: null,
        details: {
          ...event.details,
          endpoint: event.endpoint,
          ipAddress: event.ipAddress,
          timestamp: log.timestamp,
        },
      })
      .catch((err: Error) => {
        console.error(
          "[SECURITY] Failed to persist system log:",
          err.message,
        );
      });
  }
}
