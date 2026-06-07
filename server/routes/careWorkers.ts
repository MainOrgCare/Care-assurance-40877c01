/**
 * Care Worker & Discrepancy Routes
 *
 * CRUD endpoints for managing care workers and tracking discrepancies.
 * Automatically triggers admin alerts when a care worker reaches 3+
 * discrepancies of the same type.
 *
 * @module server/routes/careWorkers
 */
import type { Express, RequestHandler } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { safeErrorMessage } from "../utils/safeError";
import { insertCareWorkerSchema, insertDiscrepancySchema } from "@shared/schema";
import { createLogger } from "../utils/logger";
import {
  apiSuccess,
  apiCreated,
  apiNotFound,
  apiBadRequest,
  apiInternalError,
} from "../utils/apiResponse";

const log = createLogger("care-workers");

const getRouteParamValue = (param: string | string[] | undefined): string =>
  Array.isArray(param) ? (param[0] ?? "") : (param ?? "");

export interface CareWorkerRouteDeps {
  requireAuth: RequestHandler;
  requireAdmin: RequestHandler;
  blockDemoWrites: RequestHandler;
}

export function registerCareWorkerRoutes(
  app: Express,
  { requireAuth, requireAdmin, blockDemoWrites }: CareWorkerRouteDeps,
): void {
  // ── Care Workers ──────────────────────────────────────────────────

  // Get all care workers
  app.get("/api/care-workers", requireAuth, async (req, res) => {
    try {
      const workers = await storage.getAllCareWorkers();
      return apiSuccess(res, workers);
    } catch (error: unknown) {
      log.error("Failed to load care workers", { error: safeErrorMessage(error) });
      return apiInternalError(res, safeErrorMessage(error, "Failed to load care workers"));
    }
  });

  // Create care worker (admin only)
  app.post("/api/care-workers", requireAuth, requireAdmin, blockDemoWrites, async (req, res) => {
    try {
      const validatedData = insertCareWorkerSchema.parse(req.body);
      const worker = await storage.createCareWorker(validatedData);
      log.info("Care worker created", { workerId: worker.id, name: worker.name });
      return apiCreated(res, worker);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return apiBadRequest(res, "Validation error", { errors: error.issues.map(e => ({ field: e.path.join('.'), message: e.message })) });
      }
      log.error("Failed to create care worker", { error: safeErrorMessage(error) });
      return apiInternalError(res, safeErrorMessage(error, "Failed to create care worker"));
    }
  });

  // Get all care workers for map display (includes address & coordinates)
  app.get("/api/care-workers/map/locations", requireAuth, async (req, res) => {
    try {
      const workers = await storage.getAllCareWorkers();
      // Filter to only those with addresses or coordinates
      const mapWorkers = workers.filter(w => w.address || (w.latitude && w.longitude));
      return apiSuccess(res, mapWorkers);
    } catch (error: unknown) {
      log.error("Failed to load care worker map locations", { error: safeErrorMessage(error) });
      return apiInternalError(res, safeErrorMessage(error, "Failed to load care worker map locations"));
    }
  });

  // Get care worker with discrepancies
  app.get("/api/care-workers/:id", requireAuth, async (req, res) => {
    try {
      const workerId = getRouteParamValue(req.params.id);
      const worker = await storage.getCareWorker(workerId);
      if (!worker) {
        return apiNotFound(res, "Care worker not found");
      }

      const discrepancies = await storage.getDiscrepanciesByCareWorker(workerId);

      return apiSuccess(res, { ...worker, discrepancies });
    } catch (error: unknown) {
      log.error("Failed to load care worker", { workerId: getRouteParamValue(req.params.id), error: safeErrorMessage(error) });
      return apiInternalError(res, safeErrorMessage(error, "Failed to load care worker"));
    }
  });

  // ── Discrepancies ─────────────────────────────────────────────────

  // Get all discrepancies with care worker info
  app.get("/api/discrepancies", requireAuth, async (req, res) => {
    try {
      const discrepancies = await storage.getAllDiscrepancies();
      return apiSuccess(res, discrepancies);
    } catch (error: unknown) {
      log.error("Failed to load discrepancies", { error: safeErrorMessage(error) });
      return apiInternalError(res, safeErrorMessage(error, "Failed to load discrepancies"));
    }
  });

  // Create discrepancy (and check for alert threshold)
  app.post("/api/discrepancies", requireAuth, blockDemoWrites, async (req, res) => {
    try {
      const validatedData = insertDiscrepancySchema.parse(req.body);
      const discrepancy = await storage.createDiscrepancy(validatedData);

      // Check if this triggers an admin alert (3+ discrepancies of same type)
      const count = await storage.getDiscrepancyCountByType(
        validatedData.careWorkerId,
        validatedData.type,
      );

      if (count >= 3) {
        const worker = await storage.getCareWorker(validatedData.careWorkerId);
        if (worker) {
          await storage.createAdminAlert({
            careWorkerId: worker.id,
            careWorkerName: worker.name,
            message: `${worker.name} has reached ${count} discrepancies of type "${validatedData.type}"`,
            discrepancyType: validatedData.type,
            discrepancyCount: count,
            isRead: false,
          });
          log.warn("Admin alert triggered", { workerId: worker.id, type: validatedData.type, count });
        }
      }

      return apiCreated(res, discrepancy);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return apiBadRequest(res, "Validation error", { errors: error.issues.map(e => ({ field: e.path.join('.'), message: e.message })) });
      }
      log.error("Failed to create discrepancy", { error: safeErrorMessage(error) });
      return apiInternalError(res, safeErrorMessage(error, "Failed to create discrepancy"));
    }
  });
}
