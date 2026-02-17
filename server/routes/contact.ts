/**
 * Contact Form Routes
 *
 * Public contact form submission (no auth required) and admin-only
 * endpoints for listing, reading, archiving, and deleting contact messages.
 *
 * @module server/routes/contact
 */

import type { Express, RequestHandler } from "express";
import { storage } from "../storage";
import { safeErrorMessage } from "../utils/safeError";

export interface ContactRouteDeps {
  requireAuth: RequestHandler;
  requireAdmin: RequestHandler;
}

export function registerContactRoutes(
  app: Express,
  { requireAuth, requireAdmin }: ContactRouteDeps,
): void {
  // Contact form is always enabled (no SMTP required)
  app.get("/api/contact/status", async (_req, res) => {
    return res.json({ enabled: true });
  });

  // Submit contact form message (public endpoint — no auth)
  app.post("/api/contact", async (req, res) => {
    try {
      const { name, email, organisation, message } = req.body;

      // Validation
      if (!name || typeof name !== "string" || name.trim().length < 2) {
        return res.status(400).json({ message: "Please enter your name" });
      }
      if (!email || typeof email !== "string" || !email.includes("@")) {
        return res.status(400).json({ message: "Please enter a valid email address" });
      }
      if (!message || typeof message !== "string" || message.trim().length < 10) {
        return res
          .status(400)
          .json({ message: "Please enter a message (at least 10 characters)" });
      }

      // Sanitize inputs
      const sanitizedName = name.trim().slice(0, 100);
      const sanitizedEmail = email.trim().slice(0, 100);
      const sanitizedOrg = organisation
        ? String(organisation).trim().slice(0, 100)
        : null;
      const sanitizedMessage = message.trim().slice(0, 5000);

      await storage.createContactMessage({
        name: sanitizedName,
        email: sanitizedEmail,
        organisation: sanitizedOrg,
        message: sanitizedMessage,
      });

      console.log(
        `[Contact] Message saved from ${sanitizedEmail} (${sanitizedName})`,
      );

      return res.json({
        success: true,
        message: "Thank you for your message. We'll respond within 1 business day.",
      });
    } catch (error: any) {
      console.error("[Contact] Failed to save message:", safeErrorMessage(error));
      return res
        .status(500)
        .json({ message: "Failed to send message. Please try again later." });
    }
  });

  // Get all contact messages (admin only)
  app.get(
    "/api/contact/messages",
    requireAuth,
    requireAdmin,
    async (req: any, res: any) => {
      try {
        const includeArchived = req.query.includeArchived === "true";
        const messages = await storage.getContactMessages(includeArchived);
        return res.json(messages);
      } catch (error: any) {
        console.error("[Contact] Failed to fetch messages:", safeErrorMessage(error));
        return res.status(500).json({ message: "Failed to fetch messages" });
      }
    },
  );

  // Mark message as read (admin only)
  app.patch(
    "/api/contact/messages/:id/read",
    requireAuth,
    requireAdmin,
    async (req: any, res: any) => {
      try {
        const { id } = req.params;
        await storage.markContactMessageRead(id, req.user.username);
        return res.json({ success: true });
      } catch (error: any) {
        console.error("[Contact] Failed to mark message as read:", safeErrorMessage(error));
        return res.status(500).json({ message: "Failed to update message" });
      }
    },
  );

  // Archive message (admin only)
  app.patch(
    "/api/contact/messages/:id/archive",
    requireAuth,
    requireAdmin,
    async (req: any, res: any) => {
      try {
        const { id } = req.params;
        await storage.archiveContactMessage(id);
        return res.json({ success: true });
      } catch (error: any) {
        console.error("[Contact] Failed to archive message:", safeErrorMessage(error));
        return res.status(500).json({ message: "Failed to archive message" });
      }
    },
  );

  // Delete message (admin only)
  app.delete(
    "/api/contact/messages/:id",
    requireAuth,
    requireAdmin,
    async (req: any, res: any) => {
      try {
        const { id } = req.params;
        await storage.deleteContactMessage(id);
        return res.json({ success: true });
      } catch (error: any) {
        console.error("[Contact] Failed to delete message:", safeErrorMessage(error));
        return res.status(500).json({ message: "Failed to delete message" });
      }
    },
  );
}
