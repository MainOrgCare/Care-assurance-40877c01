/**
 * Shift Handover Routes
 *
 * CRUD endpoints for shift handover notes that care workers create at the
 * end of each shift.  Supports acknowledgement tracking to ensure the
 * incoming team has reviewed the handover.
 *
 * @module server/routes/handovers
 */
import type { Express, RequestHandler } from "express";
import { storage } from "../storage";
import { safeErrorMessage } from "../utils/safeError";

export interface HandoverRouteDeps {
  requireAuth: RequestHandler;
}

export function registerHandoverRoutes(
  app: Express,
  { requireAuth }: HandoverRouteDeps,
): void {
  app.get("/api/shift-handovers", requireAuth, async (_req: any, res) => {
    try {
      const handovers = await storage.getAllShiftHandovers();
      return res.json(handovers);
    } catch (error) {
      console.error("[HANDOVERS] Error fetching:", safeErrorMessage(error));
      return res.status(500).json({ message: "Failed to fetch shift handovers" });
    }
  });

  app.post("/api/shift-handovers", requireAuth, async (req: any, res) => {
    try {
      const {
        shiftDate,
        shiftType,
        summary,
        keyEvents,
        medicationNotes,
        clientConcerns,
        staffingNotes,
        followUpRequired,
        followUpDetails,
        priority,
      } = req.body;

      if (!shiftDate || !shiftType || !summary) {
        return res
          .status(400)
          .json({ message: "shiftDate, shiftType, and summary are required" });
      }

      const handover = await storage.createShiftHandover({
        authorId: req.user.id,
        authorName:
          `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() ||
          req.user.username,
        shiftDate,
        shiftType,
        summary,
        keyEvents: keyEvents || null,
        medicationNotes: medicationNotes || null,
        clientConcerns: clientConcerns || null,
        staffingNotes: staffingNotes || null,
        followUpRequired: followUpRequired || false,
        followUpDetails: followUpDetails || null,
        priority: priority || "normal",
        acknowledgedBy: [],
      });

      return res.status(201).json(handover);
    } catch (error) {
      console.error("[HANDOVERS] Error creating:", safeErrorMessage(error));
      return res
        .status(500)
        .json({ message: "Failed to create shift handover" });
    }
  });

  app.post(
    "/api/shift-handovers/:id/acknowledge",
    requireAuth,
    async (req: any, res) => {
      try {
        const handover = await storage.acknowledgeShiftHandover(
          req.params.id,
          req.user.id,
        );
        if (!handover) {
          return res.status(404).json({ message: "Handover not found" });
        }
        return res.json(handover);
      } catch (error) {
        console.error(
          "[HANDOVERS] Error acknowledging:",
          safeErrorMessage(error),
        );
        return res
          .status(500)
          .json({ message: "Failed to acknowledge handover" });
      }
    },
  );

  app.delete(
    "/api/shift-handovers/:id",
    requireAuth,
    async (req: any, res) => {
      try {
        await storage.deleteShiftHandover(req.params.id);
        return res.json({ success: true });
      } catch (error) {
        console.error(
          "[HANDOVERS] Error deleting:",
          safeErrorMessage(error),
        );
        return res
          .status(500)
          .json({ message: "Failed to delete handover" });
      }
    },
  );
}
