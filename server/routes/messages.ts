/**
 * User Messaging Routes
 *
 * Internal messaging portal endpoints — inbox, unread count, read/archive/
 * delete, and sending.  Used by Compli-ee, admin announcements, and
 * inter-staff communication.
 *
 * @module server/routes/messages
 */

import type { Express, RequestHandler } from "express";
import { storage } from "../storage";
import { safeErrorMessage } from "../utils/safeError";
import { createLogger } from "../utils/logger";
import {
  apiSuccess,
  apiNotFound,
  apiForbidden,
  apiBadRequest,
  apiInternalError,
} from "../utils/apiResponse";

const log = createLogger("messages");

export interface MessageRouteDeps {
  requireAuth: RequestHandler;
}

export function registerMessageRoutes(
  app: Express,
  { requireAuth }: MessageRouteDeps,
): void {
  // Get current user's messages
  app.get("/api/messages", requireAuth, async (req: any, res) => {
    try {
      const includeArchived = req.query.includeArchived === "true";
      const messages = await storage.getUserMessages(req.user.id, includeArchived);
      return apiSuccess(res, messages);
    } catch (error: unknown) {
      log.error("Failed to fetch messages", { userId: req.user.id, error: safeErrorMessage(error) });
      return apiInternalError(res, "Failed to fetch messages");
    }
  });

  // Get unread message count
  app.get("/api/messages/unread-count", requireAuth, async (req: any, res) => {
    try {
      const count = await storage.getUnreadUserMessageCount(req.user.id);
      // Short-lived client cache — this endpoint is polled frequently
      res.set("Cache-Control", "private, max-age=60");
      return apiSuccess(res, { count });
    } catch (error: unknown) {
      log.error("Failed to get unread count", { userId: req.user.id, error: safeErrorMessage(error) });
      return apiInternalError(res, "Failed to get unread count");
    }
  });

  // Get single message
  app.get("/api/messages/:id", requireAuth, async (req: any, res) => {
    try {
      const message = await storage.getUserMessage(req.params.id);
      if (!message) {
        return apiNotFound(res, "Message not found");
      }
      // Verify recipient is current user
      if (message.recipientId !== req.user.id) {
        return apiForbidden(res, "Access denied");
      }
      return apiSuccess(res, message);
    } catch (error: unknown) {
      log.error("Failed to fetch message", { messageId: req.params.id, error: safeErrorMessage(error) });
      return apiInternalError(res, "Failed to fetch message");
    }
  });

  // Mark message as read
  app.patch("/api/messages/:id/read", requireAuth, async (req: any, res) => {
    try {
      const message = await storage.getUserMessage(req.params.id);
      if (!message) {
        return apiNotFound(res, "Message not found");
      }
      if (message.recipientId !== req.user.id) {
        return apiForbidden(res, "Access denied");
      }
      const updated = await storage.markUserMessageRead(req.params.id);
      return apiSuccess(res, updated);
    } catch (error: unknown) {
      log.error("Failed to mark message as read", { messageId: req.params.id, error: safeErrorMessage(error) });
      return apiInternalError(res, "Failed to update message");
    }
  });

  // Archive message
  app.patch("/api/messages/:id/archive", requireAuth, async (req: any, res) => {
    try {
      const message = await storage.getUserMessage(req.params.id);
      if (!message) {
        return apiNotFound(res, "Message not found");
      }
      if (message.recipientId !== req.user.id) {
        return apiForbidden(res, "Access denied");
      }
      const updated = await storage.archiveUserMessage(req.params.id);
      return apiSuccess(res, updated);
    } catch (error: unknown) {
      log.error("Failed to archive message", { messageId: req.params.id, error: safeErrorMessage(error) });
      return apiInternalError(res, "Failed to archive message");
    }
  });

  // Delete message
  app.delete("/api/messages/:id", requireAuth, async (req: any, res) => {
    try {
      const message = await storage.getUserMessage(req.params.id);
      if (!message) {
        return apiNotFound(res, "Message not found");
      }
      if (message.recipientId !== req.user.id) {
        return apiForbidden(res, "Access denied");
      }
      await storage.deleteUserMessage(req.params.id);
      return apiSuccess(res, { success: true });
    } catch (error: unknown) {
      log.error("Failed to delete message", { messageId: req.params.id, error: safeErrorMessage(error) });
      return apiInternalError(res, "Failed to delete message");
    }
  });

  // Send message (internal API — used by Compli-ee and system)
  app.post("/api/messages/send", requireAuth, async (req: any, res) => {
    try {
      const { recipientId, subject, message, priority } = req.body;

      if (!recipientId || !subject || !message) {
        return apiBadRequest(res, "recipientId, subject, and message are required");
      }

      // Verify recipient exists
      const recipient = await storage.getUser(recipientId);
      if (!recipient) {
        return apiNotFound(res, "Recipient not found");
      }

      // Always derive senderName from session user to prevent impersonation
      const resolvedSenderName =
        `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() ||
        req.user.username;

      const newMessage = await storage.createUserMessage({
        recipientId,
        senderId: req.user.id,
        senderName: resolvedSenderName,
        subject: subject.slice(0, 200),
        message: message.slice(0, 10000),
        priority: priority || "normal",
      });

      log.info("Message sent", {
        from: req.user.username,
        to: recipientId,
        subject: subject.slice(0, 50),
      });
      return apiSuccess(res, newMessage);
    } catch (error: unknown) {
      log.error("Failed to send message", { error: safeErrorMessage(error) });
      return apiInternalError(res, "Failed to send message");
    }
  });
}
