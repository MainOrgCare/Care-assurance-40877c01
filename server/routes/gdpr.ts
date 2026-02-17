/**
 * UK GDPR Compliance Routes
 *
 * Consent management, data subject access requests (SAR), right to erasure,
 * data export, admin GDPR management, retention policies, and purge controls.
 *
 * Endpoints fall into two groups:
 * - `/api/gdpr/*`       — User-facing (requires auth)
 * - `/api/admin/gdpr/*` — Admin-only (requires auth + admin)
 *
 * @module server/routes/gdpr
 */

import type { Express, RequestHandler } from "express";
import { storage } from "../storage";
import { safeErrorMessage } from "../utils/safeError";

export interface GdprRouteDeps {
  requireAuth: RequestHandler;
  requireAdmin: RequestHandler;
}

export function registerGdprRoutes(
  app: Express,
  { requireAuth, requireAdmin }: GdprRouteDeps,
): void {
  // ── Consent Management ─────────────────────────────────────────

  // Get current user's consent status
  app.get("/api/gdpr/consent", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const consents = await storage.getConsentRecords(userId);
      const currentConsents: Record<string, boolean> = {};

      for (const type of ["ai_processing", "data_analytics"]) {
        const consent = await storage.getCurrentConsent(userId, type);
        currentConsents[type] = consent?.granted ?? false;
      }

      return res.json({
        currentConsents,
        history: consents,
      });
    } catch (error: unknown) {
      console.error("[GDPR] Error getting consent:", safeErrorMessage(error));
      return res.status(500).json({ message: "Failed to get consent status" });
    }
  });

  // Grant or update consent
  app.post("/api/gdpr/consent", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const username = req.user?.username;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { consentType, granted, version } = req.body;
      if (!consentType || typeof granted !== "boolean") {
        return res.status(400).json({ message: "consentType and granted required" });
      }

      const validTypes = ["ai_processing", "data_analytics"];
      if (!validTypes.includes(consentType)) {
        return res.status(400).json({ message: "Invalid consent type" });
      }

      // Withdraw existing consent if any
      await storage.withdrawConsent(userId, consentType);

      // Create new consent record
      const consent = await storage.createConsentRecord({
        userId,
        username,
        consentType,
        granted,
        version: version || "1.0",
        ipAddress:
          (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.ip,
        userAgent: req.headers["user-agent"],
      });

      await storage.createGdprAuditLog({
        eventType: "CONSENT_CHANGE",
        endpoint: "/api/gdpr/consent",
        userId,
        username,
        ipAddress:
          (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.ip,
        details: { consentType, granted, version: consent.version },
      });

      return res.json({ success: true, consent });
    } catch (error: unknown) {
      console.error("[GDPR] Error updating consent:", safeErrorMessage(error));
      return res.status(500).json({ message: "Failed to update consent" });
    }
  });

  // ── Data Subject Access Request (SAR) ──────────────────────────

  // Request data export (Right of Access)
  app.post("/api/gdpr/data-request/access", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const username = req.user?.username;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Calculate due date (30 days from now as per UK GDPR)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);

      const request = await storage.createDataRequest({
        requestType: "access",
        requesterId: userId,
        subjectId: userId,
        status: "pending",
        dueDate,
      });

      await storage.createGdprAuditLog({
        eventType: "DATA_EXPORT",
        endpoint: "/api/gdpr/data-request/access",
        userId,
        username,
        ipAddress:
          (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.ip,
        details: { requestId: request.id, requestType: "access" },
      });

      return res.json({
        success: true,
        request,
        message:
          "Your data access request has been submitted. You will receive your data within 30 days.",
      });
    } catch (error: unknown) {
      console.error("[GDPR] Error creating access request:", safeErrorMessage(error));
      return res.status(500).json({ message: "Failed to create data request" });
    }
  });

  // Request data deletion (Right to Erasure)
  app.post("/api/gdpr/data-request/erasure", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const username = req.user?.username;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);

      const request = await storage.createDataRequest({
        requestType: "erasure",
        requesterId: userId,
        subjectId: userId,
        status: "pending",
        dueDate,
      });

      await storage.createGdprAuditLog({
        eventType: "DATA_DELETE",
        endpoint: "/api/gdpr/data-request/erasure",
        userId,
        username,
        ipAddress:
          (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.ip,
        details: { requestId: request.id, requestType: "erasure" },
      });

      return res.json({
        success: true,
        request,
        message:
          "Your data erasure request has been submitted. Your request will be processed within 30 days.",
      });
    } catch (error: unknown) {
      console.error("[GDPR] Error creating erasure request:", safeErrorMessage(error));
      return res.status(500).json({ message: "Failed to create erasure request" });
    }
  });

  // Get user's own data export (immediate for logged-in users)
  app.get("/api/gdpr/my-data", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const username = req.user?.username;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const data = await storage.exportUserData(userId);

      // Sanitize sensitive fields
      if (data.user) {
        delete (data.user as any).password;
      }

      await storage.createGdprAuditLog({
        eventType: "DATA_EXPORT",
        endpoint: "/api/gdpr/my-data",
        userId,
        username,
        ipAddress:
          (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.ip,
        details: {
          immediate: true,
          recordCounts: {
            sessions: data.sessions.length,
            consents: data.consents.length,
            auditLogs: data.auditLogs.length,
            systemLogs: data.systemLogs.length,
            aiUsageLogs: data.aiUsageLogs.length,
            suspensions: data.suspensions.length,
            messages: data.messages.length,
          },
        },
      });

      return res.json(data);
    } catch (error: unknown) {
      console.error("[GDPR] Error exporting user data:", safeErrorMessage(error));
      return res.status(500).json({ message: "Failed to export data" });
    }
  });

  // ── Admin GDPR Management ─────────────────────────────────────

  // Get all data requests (admin)
  app.get("/api/admin/gdpr/data-requests", requireAuth, requireAdmin, async (_req, res) => {
    try {
      const requests = await storage.getAllDataRequests();
      return res.json(requests);
    } catch (error: any) {
      console.error("[GDPR Admin] Error getting requests:", safeErrorMessage(error));
      return res.status(500).json({ message: "Failed to get data requests" });
    }
  });

  // Get pending data requests (admin)
  app.get(
    "/api/admin/gdpr/data-requests/pending",
    requireAuth,
    requireAdmin,
    async (_req, res) => {
      try {
        const requests = await storage.getPendingDataRequests();
        return res.json(requests);
      } catch (error: any) {
        console.error("[GDPR Admin] Error getting pending requests:", safeErrorMessage(error));
        return res.status(500).json({ message: "Failed to get pending requests" });
      }
    },
  );

  // Process a data request (admin)
  app.post(
    "/api/admin/gdpr/data-requests/:id/process",
    requireAuth,
    requireAdmin,
    async (req: any, res) => {
      try {
        const { id } = req.params;
        const { action } = req.body; // 'approve' or 'reject'
        const adminId = req.user?.id;
        const adminUsername = req.user?.username;

        if (!["approve", "reject"].includes(action)) {
          return res
            .status(400)
            .json({ message: "Action must be 'approve' or 'reject'" });
        }

        const request = await storage.getDataRequest(id);
        if (!request) {
          return res.status(404).json({ message: "Request not found" });
        }

        if (action === "reject") {
          const { reason } = req.body;
          await storage.updateDataRequestStatus(
            id,
            "rejected",
            adminId,
            adminUsername,
            null,
            reason,
          );
          return res.json({ success: true, status: "rejected" });
        }

        // Process the request based on type
        let dataSummary: any = {};

        if (request.requestType === "access" && request.subjectId) {
          const userData = await storage.exportUserData(request.subjectId);
          if (userData.user) {
            delete (userData.user as any).password;
          }
          dataSummary = {
            exported: true,
            recordCounts: {
              sessions: userData.sessions.length,
              consents: userData.consents.length,
              auditLogs: userData.auditLogs.length,
              systemLogs: userData.systemLogs.length,
              aiUsageLogs: userData.aiUsageLogs.length,
              suspensions: userData.suspensions.length,
              messages: userData.messages.length,
            },
          };
        } else if (request.requestType === "erasure" && request.subjectId) {
          const deleteResult = await storage.deleteUserData(request.subjectId);
          dataSummary = {
            deleted: true,
            ...deleteResult,
          };
        }

        await storage.updateDataRequestStatus(
          id,
          "completed",
          adminId,
          adminUsername,
          dataSummary,
        );

        await storage.createGdprAuditLog({
          eventType:
            request.requestType === "erasure" ? "DATA_DELETE" : "DATA_EXPORT",
          endpoint: `/api/admin/gdpr/data-requests/${id}/process`,
          userId: adminId,
          username: adminUsername,
          details: {
            requestId: id,
            requestType: request.requestType,
            subjectId: request.subjectId,
            action: "approve",
            dataSummary,
          },
        });

        return res.json({ success: true, status: "completed", dataSummary });
      } catch (error: any) {
        console.error("[GDPR Admin] Error processing request:", safeErrorMessage(error));
        return res.status(500).json({ message: "Failed to process request" });
      }
    },
  );

  // Get GDPR audit logs (admin)
  app.get("/api/admin/gdpr/audit-logs", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { eventType, userId, startDate, endDate, limit } = req.query;

      const logs = await storage.getGdprAuditLogs({
        eventType: eventType as string,
        userId: userId as string,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
      });

      return res.json(logs);
    } catch (error: any) {
      console.error("[GDPR Admin] Error getting audit logs:", safeErrorMessage(error));
      return res.status(500).json({ message: "Failed to get audit logs" });
    }
  });

  // Get retention policies (admin)
  app.get(
    "/api/admin/gdpr/retention-policies",
    requireAuth,
    requireAdmin,
    async (_req, res) => {
      try {
        const policies = await storage.getRetentionPolicies();
        return res.json(policies);
      } catch (error: any) {
        console.error("[GDPR Admin] Error getting policies:", safeErrorMessage(error));
        return res.status(500).json({ message: "Failed to get retention policies" });
      }
    },
  );

  // Create/update retention policy (admin)
  app.post(
    "/api/admin/gdpr/retention-policies",
    requireAuth,
    requireAdmin,
    async (req: any, res) => {
      try {
        const { dataCategory, retentionDays, legalBasis, description } = req.body;

        if (!dataCategory || !retentionDays || !legalBasis) {
          return res
            .status(400)
            .json({ message: "dataCategory, retentionDays, and legalBasis required" });
        }

        const policy = await storage.upsertRetentionPolicy({
          dataCategory,
          retentionDays,
          legalBasis,
          description,
        });

        await storage.createGdprAuditLog({
          eventType: "CONSENT_CHANGE",
          endpoint: "/api/admin/gdpr/retention-policies",
          userId: req.user?.id,
          username: req.user?.username,
          details: { dataCategory, retentionDays, legalBasis },
        });

        return res.json(policy);
      } catch (error: any) {
        console.error("[GDPR Admin] Error updating policy:", safeErrorMessage(error));
        return res.status(500).json({ message: "Failed to update retention policy" });
      }
    },
  );

  // Run data purge for a category (admin)
  app.post(
    "/api/admin/gdpr/purge/:dataCategory",
    requireAuth,
    requireAdmin,
    async (req: any, res) => {
      try {
        const { dataCategory } = req.params;

        const deleted = await storage.purgeExpiredData(dataCategory);

        await storage.createGdprAuditLog({
          eventType: "DATA_DELETE",
          endpoint: `/api/admin/gdpr/purge/${dataCategory}`,
          userId: req.user?.id,
          username: req.user?.username,
          details: { dataCategory, deletedCount: deleted },
        });

        return res.json({
          success: true,
          dataCategory,
          deletedCount: deleted,
          message: `Purged ${deleted} expired records from ${dataCategory}`,
        });
      } catch (error: any) {
        console.error("[GDPR Admin] Error purging data:", safeErrorMessage(error));
        return res.status(500).json({ message: "Failed to purge data" });
      }
    },
  );
}
