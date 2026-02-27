/**
 * Client Error Logging Route
 *
 * Receives client-side error reports (uncaught exceptions, React error
 * boundaries) and persists them as system log entries.  Auth is optional
 * so that errors occurring before login are still captured.
 *
 * @module server/routes/clientErrors
 */
import type { Express } from "express";
import { storage } from "../storage";

export function registerClientErrorRoutes(app: Express): void {
  const handleClientError = async (req: any, res: any) => {
    try {
      const {
        message,
        stack,
        componentStack,
        url,
        timestamp,
        source,
        type,
        requestId,
        userAgent,
      } = req.body || {};

      const truncate = (s: string | undefined, max: number) =>
        typeof s === "string" ? s.slice(0, max) : "";

      const normalizeTimestamp = (value: unknown): string => {
        if (typeof value !== "string" || !value.trim()) {
          return new Date().toISOString();
        }
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
      };

      // Limit body size to prevent abuse
      const bodyStr = JSON.stringify(req.body || {});
      if (bodyStr.length > 10_000) {
        return res
          .status(413)
          .json({ logged: false, reason: "Payload too large" });
      }

      const normalizedMessage = truncate(message, 1000);
      if (!normalizedMessage) {
        return res.status(400).json({ logged: false, reason: "Message is required" });
      }

      const incomingRequestId = truncate(req.get("x-request-id") || undefined, 128);
      const serverRequestId = truncate(req.requestId || undefined, 128);
      const payloadRequestId = truncate(requestId, 128);

      await storage.createSystemLog({
        eventType: "CLIENT_ERROR",
        userId: req.user?.id?.toString() || "anonymous",
        username: req.user?.username || "anonymous",
        details: {
          url: truncate(url, 500),
          message: normalizedMessage,
          stack: truncate(stack, 2000),
          componentStack: truncate(componentStack, 2000),
          source: truncate(source, 80),
          type: truncate(type, 80),
          userAgent: truncate(userAgent, 500),
          requestId: payloadRequestId || incomingRequestId || serverRequestId,
          incomingRequestId,
          serverRequestId,
          reportedAt: normalizeTimestamp(timestamp),
        },
      });

      return res.json({
        logged: true,
        requestId: payloadRequestId || incomingRequestId || serverRequestId || null,
      });
    } catch {
      // Error logging must never fail visibly
      return res.json({ logged: false });
    }
  };

  app.post("/api/client-errors", handleClientError);
  app.post("/api/log-client-error", handleClientError);
}
