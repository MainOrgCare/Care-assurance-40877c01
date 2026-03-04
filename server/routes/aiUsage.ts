/**
 * AI Usage Routes — Admin AI Monitoring
 *
 * Endpoints for administrators to monitor AI usage, costs, and request logs
 * across the platform.
 */

import type { Express } from "express";
import { storage, type AiUsageLogQueryOptions } from "../storage";
import { safeErrorMessage } from "../utils/safeError";

interface AiUsageRouteDeps {
  requireAuth: any;
  requireAdmin: any;
}

export const parseDateParam = (value: unknown): Date | undefined => {
  if (typeof value !== "string" || value.trim().length === 0) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

export const parsePositiveIntParam = (value: unknown, fallback: number): number => {
  if (typeof value !== "string") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
};

const parseOptionalStringParam = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const buildAiUsageQueryOptionsFromQuery = (
  query: Record<string, unknown>
): AiUsageLogQueryOptions & { page: number; limit: number } => {
  const page = parsePositiveIntParam(query.page, 1);
  const limit = Math.min(parsePositiveIntParam(query.limit, 25), 200);
  const retryState: AiUsageLogQueryOptions["retryState"] =
    query.retryState === "with_retries" || query.retryState === "no_retries"
      ? query.retryState
      : "all";

  let startDate = parseDateParam(query.startDate);
  let endDate = parseDateParam(query.endDate);

  if (startDate && endDate && startDate > endDate) {
    // Keep query behavior predictable when date inputs are accidentally inverted.
    const previousStart = startDate;
    startDate = endDate;
    endDate = previousStart;
  }

  return {
    page,
    limit,
    searchQuery: parseOptionalStringParam(query.search),
    username: parseOptionalStringParam(query.user),
    endpoint: parseOptionalStringParam(query.endpoint),
    provider: parseOptionalStringParam(query.provider),
    featureName: parseOptionalStringParam(query.feature),
    retryState,
    startDate,
    endDate,
  };
};

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
    } catch (error: unknown) {
      console.error("AI usage fetch error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to fetch AI usage") });
    }
  });

  // Get detailed AI request logs (admin-only)
  app.get("/api/admin/ai-logs", requireAuth, requireAdmin, async (req, res) => {
    try {
      const queryOptions = buildAiUsageQueryOptionsFromQuery(req.query as Record<string, unknown>);

      const [paginated, retryReasonSummary, providerRetryStats, filterOptions] = await Promise.all([
        storage.getAiUsageLogsPaginated(queryOptions),
        storage.getAiUsageRetryReasonSummary(queryOptions),
        storage.getAiUsageProviderRetryStats(queryOptions),
        storage.getAiUsageFilterOptions(queryOptions),
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
        filterOptions,
      });
    } catch (error: unknown) {
      console.error("AI request logs fetch error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to fetch AI request logs") });
    }
  });
}
