/**
 * AI Usage Routes — Admin AI Monitoring
 *
 * Endpoints for administrators to monitor AI usage, costs, and request logs
 * across the platform.
 */

import type { Express } from "express";
import { storage } from "../storage";
import { safeErrorMessage } from "../utils/safeError";

interface AiUsageRouteDeps {
  requireAuth: any;
  requireAdmin: any;
}

export function registerAiUsageRoutes(
  app: Express,
  deps: AiUsageRouteDeps
): void {
  const { requireAuth, requireAdmin } = deps;

  // Get AI usage logs and stats (admin-only)
  app.get("/api/ai-usage", requireAuth, requireAdmin, async (req, res) => {
    try {
      const logs = await storage.getAiUsageLogs({ limit: 100 });
      const stats = await storage.getAiUsageStats();

      return res.json({ logs, stats });
    } catch (error: any) {
      console.error("AI usage fetch error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to fetch AI usage") });
    }
  });

  // Get detailed AI request logs (admin-only)
  app.get("/api/admin/ai-logs", requireAuth, requireAdmin, async (req, res) => {
    try {
      const logs = await storage.getAiUsageLogs({ limit: 500 });

      const enrichedLogs = logs.map((log: any) => ({
        id: log.id,
        userId: log.userId,
        username: log.username,
        endpoint: `/api/${log.featureName}`,
        featureName: log.featureName,
        retryCount: typeof log.requestPayload?.retryCount === "number" ? log.requestPayload.retryCount : 0,
        lastRetryReason: typeof log.requestPayload?.lastRetryReason === "string" ? log.requestPayload.lastRetryReason : null,
        requestBody: log.requestPayload || {
          note: "Request payload not available for this log entry",
          model: log.model,
          provider: log.provider
        },
        inputTokens: log.inputTokens,
        outputTokens: log.outputTokens,
        totalTokens: log.totalTokens,
        costMicroDollars: log.costMicroDollars,
        model: log.model,
        provider: log.provider,
        createdAt: log.createdAt
      }));

      return res.json({ logs: enrichedLogs });
    } catch (error: any) {
      console.error("AI request logs fetch error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to fetch AI request logs") });
    }
  });
}
