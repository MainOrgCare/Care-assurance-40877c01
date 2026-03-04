/**
 * Staff Training Routes
 *
 * CRUD endpoints for tracking care worker training records, certifications,
 * and compliance requirements.  Supports filtering by staff member and
 * training category.
 *
 * @module server/routes/training
 */
import type { Express, RequestHandler } from "express";
import { storage } from "../storage";
import { safeErrorMessage } from "../utils/safeError";

export interface TrainingRouteDeps {
  requireAuth: RequestHandler;
}

export function registerTrainingRoutes(
  app: Express,
  { requireAuth }: TrainingRouteDeps,
): void {
  app.get("/api/staff-training", requireAuth, async (_req: any, res) => {
    try {
      const records = await storage.getAllStaffTraining();
      return res.json(records);
    } catch (error: unknown) {
      console.error("[TRAINING] Error fetching:", safeErrorMessage(error));
      return res
        .status(500)
        .json({ message: "Failed to fetch training records" });
    }
  });

  app.get(
    "/api/staff-training/user/:userId",
    requireAuth,
    async (req: any, res) => {
      try {
        const records = await storage.getStaffTrainingByStaff(
          req.params.userId,
        );
        return res.json(records);
      } catch (error: unknown) {
        console.error(
          "[TRAINING] Error fetching user training:",
          safeErrorMessage(error),
        );
        return res
          .status(500)
          .json({ message: "Failed to fetch training records" });
      }
    },
  );

  app.post("/api/staff-training", requireAuth, async (req: any, res) => {
    try {
      const {
        staffId,
        staffName,
        courseName,
        category,
        provider,
        completedDate,
        expiryDate,
        status,
        certificateRef,
        notes,
      } = req.body;

      if (!staffId || !staffName || !courseName) {
        return res
          .status(400)
          .json({ message: "staffId, staffName, and courseName are required" });
      }

      const record = await storage.createStaffTraining({
        staffId,
        staffName,
        courseName,
        category: category || "mandatory",
        provider: provider || null,
        completedDate: completedDate || null,
        expiryDate: expiryDate || null,
        status: status || "pending",
        certificateRef: certificateRef || null,
        notes: notes || null,
      });

      return res.status(201).json(record);
    } catch (error: unknown) {
      console.error("[TRAINING] Error creating:", safeErrorMessage(error));
      return res
        .status(500)
        .json({ message: "Failed to create training record" });
    }
  });

  app.patch(
    "/api/staff-training/:id",
    requireAuth,
    async (req: any, res) => {
      try {
        const record = await storage.updateStaffTraining(
          req.params.id,
          req.body,
        );
        if (!record) {
          return res
            .status(404)
            .json({ message: "Training record not found" });
        }
        return res.json(record);
      } catch (error: unknown) {
        console.error("[TRAINING] Error updating:", safeErrorMessage(error));
        return res
          .status(500)
          .json({ message: "Failed to update training record" });
      }
    },
  );

  app.delete(
    "/api/staff-training/:id",
    requireAuth,
    async (req: any, res) => {
      try {
        await storage.deleteStaffTraining(req.params.id);
        return res.json({ success: true });
      } catch (error: unknown) {
        console.error("[TRAINING] Error deleting:", safeErrorMessage(error));
        return res
          .status(500)
          .json({ message: "Failed to delete training record" });
      }
    },
  );
}
