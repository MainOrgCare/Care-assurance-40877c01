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
  app.post("/api/log-client-error", async (req: any, res) => {
    try {
      const { message, stack, componentStack, url, timestamp } =
        req.body || {};

      const truncate = (s: string | undefined, max: number) =>
        typeof s === "string" ? s.slice(0, max) : "";

      // Limit body size to prevent abuse
      const bodyStr = JSON.stringify(req.body || {});
      if (bodyStr.length > 10_000) {
        return res
          .status(413)
          .json({ logged: false, reason: "Payload too large" });
      }

      storage.createSystemLog({
        eventType: "CLIENT_ERROR",
        userId: req.user?.id?.toString() || "anonymous",
        username: req.user?.username || "anonymous",
        details: {
          url: truncate(url, 500),
          message: truncate(message, 500),
          stack: truncate(stack, 2000),
          componentStack: truncate(componentStack, 1000),
          reportedAt: timestamp,
        },
      });

      return res.json({ logged: true });
    } catch {
      // Error logging must never fail visibly
      return res.json({ logged: false });
    }
  });
}
