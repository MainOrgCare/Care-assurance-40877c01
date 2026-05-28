/**
 * System Log Routes
 *
 * Admin endpoints for viewing and creating system-level event logs.
 * Supports paginated listing with search and status filters.
 *
 * @module server/routes/systemLogs
 */
import type { Express, RequestHandler } from "express";
import { storage } from "../storage";
import { safeErrorMessage } from "../utils/safeError";
import { insertSystemLogSchema } from "@shared/schema";

export interface SystemLogRouteDeps {
  requireAuth: RequestHandler;
  requireAdmin: RequestHandler;
  blockDemoWrites: RequestHandler;
}

export function registerSystemLogRoutes(
  app: Express,
  { requireAuth, requireAdmin, blockDemoWrites }: SystemLogRouteDeps,
): void {
  app.get("/api/system-logs", requireAuth, requireAdmin, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "10"), 10) || 10));
      const search = typeof req.query.search === "string" ? req.query.search : "";
      const status = typeof req.query.status === "string" ? req.query.status : "all";
      const includeAll = String(req.query.includeAll || "").toLowerCase() === "true";

      const result = await storage.getSystemLogsPaginated({ page, limit, search, status, includeAll });
      return res.json(result);
    } catch (error: unknown) {
      console.error("Failed to fetch system logs:", error);
      return res.status(500).json({ message: "Failed to fetch system logs" });
    }
  });

  app.post("/api/system-logs", requireAuth, requireAdmin, blockDemoWrites, async (req: any, res) => {
    try {
      const { eventType, action, target, status, alert, serviceUserInitials, details } = req.body || {};
      const payload = insertSystemLogSchema.parse({
        eventType: typeof eventType === "string" && eventType.trim() ? eventType : "action",
        userId: req.user?.id,
        username: req.user?.username,
        serviceUserInitials: serviceUserInitials || null,
        details: {
          action,
          target,
          status,
          alert,
          ...(details && typeof details === "object" ? details : {}),
        },
      });
      const log = await storage.createSystemLog(payload);
      return res.status(201).json(log);
    } catch (error: unknown) {
      console.error("Failed to create system log:", error);
      return res.status(400).json({ message: "Failed to create system log" });
    }
  });
}
