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

  const parseDate = (value: unknown): Date | undefined => {
    if (typeof value !== "string" || value.trim().length === 0) return undefined;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  };

  const parsePositiveInt = (value: unknown, fallback: number): number => {
    if (typeof value !== "string") return fallback;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return parsed;
  };

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
      const page = parsePositiveInt(req.query.page, 1);
      const limit = Math.min(parsePositiveInt(req.query.limit, 25), 200);
      const retryState =
        req.query.retryState === "with_retries" || req.query.retryState === "no_retries"
          ? req.query.retryState
          : "all";

      const queryOptions = {
        page,
        limit,
        searchQuery: typeof req.query.search === "string" ? req.query.search : undefined,
        username: typeof req.query.user === "string" ? req.query.user : undefined,
        endpoint: typeof req.query.endpoint === "string" ? req.query.endpoint : undefined,
        provider: typeof req.query.provider === "string" ? req.query.provider : undefined,
        featureName: typeof req.query.feature === "string" ? req.query.feature : undefined,
        retryState,
        startDate: parseDate(req.query.startDate),
        endDate: parseDate(req.query.endDate),
      };

      const [paginated, retryReasonSummary, providerRetryStats] = await Promise.all([
        storage.getAiUsageLogsPaginated(queryOptions),
        storage.getAiUsageRetryReasonSummary(queryOptions),
        storage.getAiUsageProviderRetryStats(queryOptions),
      ]);

      const logs = paginated.logs;

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

      const providerTotals = providerRetryStats.reduce(
        (acc, row) => {
          acc.requests += row.requests;
          acc.retried += row.retried;
          acc.retries += row.retries;
          return acc;
        },
        { requests: 0, retried: 0, retries: 0 }
      );

      const retryRatePercent =
        providerTotals.requests > 0 ? (providerTotals.retried / providerTotals.requests) * 100 : 0;

      return res.json({
        logs: enrichedLogs,
        pagination: {
          page: paginated.page,
          limit: paginated.limit,
          total: paginated.total,
          totalPages: paginated.totalPages,
        },
        analytics: {
          retryReasonSummary,
          providerRetryStats,
          retriedRequestCount: providerTotals.retried,
          totalRetryAttempts: providerTotals.retries,
          retryRatePercent,
        },
      });
    } catch (error: any) {
      console.error("AI request logs fetch error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to fetch AI request logs") });
    }
  });
}
