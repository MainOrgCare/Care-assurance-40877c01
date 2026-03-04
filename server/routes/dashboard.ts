/**
 * Dashboard Routes
 *
 * Endpoints for the main application dashboard: 24-hour statistics,
 * activity feed, and per-user widget preference management.
 *
 * @module server/routes/dashboard
 */
import type { Express, RequestHandler } from "express";
import { storage } from "../storage";
import { safeErrorMessage } from "../utils/safeError";

export interface DashboardRouteDeps {
  requireAuth: RequestHandler;
  blockDemoWrites: RequestHandler;
}

export function registerDashboardRoutes(
  app: Express,
  { requireAuth, blockDemoWrites }: DashboardRouteDeps,
): void {
  // Get dashboard stats for last 24 hours
  app.get("/api/dashboard/stats", requireAuth, async (req, res) => {
    try {
      const stats = await storage.getDashboardStats24h();
      const recentAlerts = await storage.getRecentAlerts24h();
      return res.json({ stats, recentAlerts });
    } catch (error: unknown) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to get dashboard stats") });
    }
  });

  // Get recent activity feed for dashboard
  app.get("/api/dashboard/activity", requireAuth, async (req: any, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      const [audits, alerts] = await Promise.all([
        storage.getAllAudits(),
        storage.getRecentAlerts24h(),
      ]);

      type ActivityItem = {
        id: string;
        type: "audit" | "alert" | "care_plan" | "system";
        title: string;
        description: string;
        timestamp: string;
        severity?: "info" | "warning" | "critical";
        actor?: string;
      };

      const activities: ActivityItem[] = [];

      // Add recent audits
      for (const audit of (audits || []).slice(0, 10)) {
        activities.push({
          id: `audit-${audit.id}`,
          type: "audit",
          title: "Audit Completed",
          description: `${(audit as any).auditType || "EMAR"} audit processed${(audit as any).careWorkerName ? ` for ${(audit as any).careWorkerName}` : ""}`,
          timestamp: ((audit as any).createdAt instanceof Date ? (audit as any).createdAt.toISOString() : (audit as any).createdAt) || new Date().toISOString(),
          severity: "info",
          actor: (audit as any).careWorkerName || undefined,
        });
      }

      // Add alerts
      for (const alert of (alerts || []).slice(0, 10)) {
        activities.push({
          id: `alert-${alert.id}`,
          type: "alert",
          title: "Compliance Alert",
          description: alert.message,
          timestamp: alert.createdAt instanceof Date ? alert.createdAt.toISOString() : String(alert.createdAt),
          severity: "warning",
          actor: alert.careWorkerName,
        });
      }

      // Sort by timestamp descending
      activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      return res.json(activities.slice(0, limit));
    } catch (error: unknown) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load activities") });
    }
  });

  // Get user's dashboard widget preferences
  app.get("/api/dashboard/widgets", requireAuth, async (req: any, res) => {
    try {
      const widgets = await storage.getDashboardWidgets(req.user.id);
      return res.json({ widgets: widgets || null });
    } catch (error: unknown) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load widget preferences") });
    }
  });

  // Save user's dashboard widget preferences
  app.put("/api/dashboard/widgets", requireAuth, blockDemoWrites, async (req: any, res) => {
    try {
      const { widgets } = req.body;
      if (!Array.isArray(widgets)) {
        return res.status(400).json({ message: "widgets must be an array" });
      }
      await storage.updateDashboardWidgets(req.user.id, widgets);
      return res.json({ message: "Dashboard preferences saved", widgets });
    } catch (error: unknown) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to save widget preferences") });
    }
  });
}
