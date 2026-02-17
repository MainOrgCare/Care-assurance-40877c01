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
      return res.json(messages);
    } catch (error: any) {
      console.error("[Messages] Failed to fetch messages:", safeErrorMessage(error));
      return res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // Get unread message count
  app.get("/api/messages/unread-count", requireAuth, async (req: any, res) => {
    try {
      const count = await storage.getUnreadUserMessageCount(req.user.id);
      return res.json({ count });
    } catch (error: any) {
      console.error("[Messages] Failed to get unread count:", safeErrorMessage(error));
      return res.status(500).json({ message: "Failed to get unread count" });
    }
  });

  // Get single message
  app.get("/api/messages/:id", requireAuth, async (req: any, res) => {
    try {
      const message = await storage.getUserMessage(req.params.id);
      if (!message) {
        return res.status(404).json({ message: "Message not found" });
      }
      // Verify recipient is current user
      if (message.recipientId !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      return res.json(message);
    } catch (error: any) {
      console.error("[Messages] Failed to fetch message:", safeErrorMessage(error));
      return res.status(500).json({ message: "Failed to fetch message" });
    }
  });

  // Mark message as read
  app.patch("/api/messages/:id/read", requireAuth, async (req: any, res) => {
    try {
      const message = await storage.getUserMessage(req.params.id);
      if (!message) {
        return res.status(404).json({ message: "Message not found" });
      }
      if (message.recipientId !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      const updated = await storage.markUserMessageRead(req.params.id);
      return res.json(updated);
    } catch (error: any) {
      console.error("[Messages] Failed to mark message as read:", safeErrorMessage(error));
      return res.status(500).json({ message: "Failed to update message" });
    }
  });

  // Archive message
  app.patch("/api/messages/:id/archive", requireAuth, async (req: any, res) => {
    try {
      const message = await storage.getUserMessage(req.params.id);
      if (!message) {
        return res.status(404).json({ message: "Message not found" });
      }
      if (message.recipientId !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      const updated = await storage.archiveUserMessage(req.params.id);
      return res.json(updated);
    } catch (error: any) {
      console.error("[Messages] Failed to archive message:", safeErrorMessage(error));
      return res.status(500).json({ message: "Failed to archive message" });
    }
  });

  // Delete message
  app.delete("/api/messages/:id", requireAuth, async (req: any, res) => {
    try {
      const message = await storage.getUserMessage(req.params.id);
      if (!message) {
        return res.status(404).json({ message: "Message not found" });
      }
      if (message.recipientId !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      await storage.deleteUserMessage(req.params.id);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("[Messages] Failed to delete message:", safeErrorMessage(error));
      return res.status(500).json({ message: "Failed to delete message" });
    }
  });

  // Send message (internal API — used by Compli-ee and system)
  app.post("/api/messages/send", requireAuth, async (req: any, res) => {
    try {
      const { recipientId, subject, message, priority } = req.body;

      if (!recipientId || !subject || !message) {
        return res.status(400).json({ message: "recipientId, subject, and message are required" });
      }

      // Verify recipient exists
      const recipient = await storage.getUser(recipientId);
      if (!recipient) {
        return res.status(404).json({ message: "Recipient not found" });
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

      console.log(
        `[Messages] Message sent from ${req.user.username} to user ${recipientId}: "${subject}"`,
      );
      return res.json(newMessage);
    } catch (error: any) {
      console.error("[Messages] Failed to send message:", safeErrorMessage(error));
      return res.status(500).json({ message: "Failed to send message" });
    }
  });
}
