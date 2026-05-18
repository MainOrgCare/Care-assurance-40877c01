/**
 * Audit Trail Middleware
 *
 * Automatically logs mutation requests (POST, PUT, PATCH, DELETE) to the system_logs table.
 * Captures user identity, IP address, HTTP method, path, and response status.
 *
 * This middleware provides a compliance-grade audit trail that works alongside
 * the existing admin action logging. It targets important user-facing endpoints
 * (not internal/system endpoints) to create a meaningful security audit record.
 *
 * @module server/middleware/auditTrail
 */

import type { Request, Response, NextFunction } from "express";

// Paths that should NOT be audited (high-frequency, low-value, or system-internal)
const SKIP_PATHS = new Set([
  "/api/system-logs",       // Avoid recursive logging
  "/api/health",
  "/api/active-sessions",   // Session heartbeat
]);

const SKIP_PREFIXES = [
  "/api/admin/rostering-recommendations", // Frequent automated reads
];

// Only log mutations on these important paths
const AUDIT_PATH_PATTERNS = [
  /^\/api\/login$/,
  /^\/api\/logout$/,
  /^\/api\/register$/,
  /^\/api\/users/,
  /^\/api\/admin\/users/,
  /^\/api\/admin\/settings/,
  /^\/api\/admin\/api-keys/,
  /^\/api\/service-users/,
  /^\/api\/care-plans/,
  /^\/api\/risk-assessments/,
  /^\/api\/audits/,
  /^\/api\/audit-discrepancies/,
  /^\/api\/admin\/rostering/,
  /^\/api\/emar/,
  /^\/api\/admin\/platform-controls/,
  /^\/api\/password/,
  /^\/api\/2fa/,
];

interface AuditStorageInterface {
  createSystemLog(log: {
    eventType: string;
    userId: string | null;
    username: string | null;
    serviceUserInitials: string | null;
    details: Record<string, unknown>;
  }): Promise<unknown>;
}

/**
 * Creates the audit trail middleware.
 * Must be applied AFTER authentication middleware so req.user is available.
 */
export function createAuditTrailMiddleware(storage: AuditStorageInterface) {
  return function auditTrailMiddleware(req: Request, res: Response, next: NextFunction): void {
    // Only audit mutations
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      next();
      return;
    }

    const path = (req.originalUrl || req.path || "").split("?")[0];

    // Skip excluded paths
    if (SKIP_PATHS.has(path)) {
      next();
      return;
    }
    if (SKIP_PREFIXES.some((p) => path.startsWith(p))) {
      next();
      return;
    }

    // Only audit paths that match important patterns
    const isImportantPath = AUDIT_PATH_PATTERNS.some((pattern) => pattern.test(path));
    if (!isImportantPath) {
      next();
      return;
    }

    // Skip if admin middleware will already log this (avoid duplicates)
    if (res.locals.__adminAuditHookAttached) {
      next();
      return;
    }

    // Mark to prevent double-logging
    res.locals.__auditTrailHookAttached = true;

    const startTime = Date.now();

    res.once("finish", () => {
      const duration = Date.now() - startTime;
      const user = (req as any).user;
      const statusCode = res.statusCode;

      // Determine event type based on outcome
      let eventType: string;
      if (statusCode >= 500) {
        eventType = "mutation_error";
      } else if (statusCode >= 400) {
        eventType = "mutation_rejected";
      } else if (req.method === "DELETE") {
        eventType = "data_delete";
      } else if (req.method === "POST") {
        eventType = "data_create";
      } else {
        eventType = "data_update";
      }

      // Extract resource info from path
      const pathParts = path.split("/").filter(Boolean);
      const resource = pathParts.slice(1, 3).join("/"); // e.g. "admin/users", "service-users"

      const ipAddress = req.ip || req.socket?.remoteAddress || "unknown";

      // Fire-and-forget DB write
      storage.createSystemLog({
        eventType,
        userId: user?.id ?? null,
        username: user?.username ?? null,
        serviceUserInitials: null,
        details: {
          method: req.method,
          path,
          resource,
          statusCode,
          durationMs: duration,
          ipAddress,
          status: statusCode < 400 ? "Authorized" : statusCode < 500 ? "Flagged" : "System",
          action: `${req.method} ${resource}`,
          target: path,
        },
      }).catch((err) => {
        console.error("[AUDIT] Failed to persist audit trail entry:", (err as Error).message);
      });
    });

    next();
  };
}
