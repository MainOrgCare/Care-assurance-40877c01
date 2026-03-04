/**
 * Policy Acknowledgement Routes
 *
 * Endpoints for tracking user acknowledgement of organisational policies.
 * Staff members sign-off on policies (e.g. GDPR, Health & Safety) and
 * administrators can query compliance by policy or by user.
 *
 * @module server/routes/policyAcknowledgements
 */
import type { Express, RequestHandler } from "express";
import { storage } from "../storage";
import { safeErrorMessage } from "../utils/safeError";

export interface PolicyAcknowledgementRouteDeps {
  requireAuth: RequestHandler;
}

export function registerPolicyAcknowledgementRoutes(
  app: Express,
  { requireAuth }: PolicyAcknowledgementRouteDeps,
): void {
  app.get(
    "/api/policy-acknowledgements",
    requireAuth,
    async (_req: any, res) => {
      try {
        const acks = await storage.getAllPolicyAcknowledgements();
        return res.json(acks);
      } catch (error: unknown) {
        console.error(
          "[POLICY-ACK] Error fetching:",
          safeErrorMessage(error),
        );
        return res
          .status(500)
          .json({ message: "Failed to fetch acknowledgements" });
      }
    },
  );

  app.get(
    "/api/policy-acknowledgements/policy/:policyId",
    requireAuth,
    async (req: any, res) => {
      try {
        const acks = await storage.getPolicyAcknowledgements(
          req.params.policyId,
        );
        return res.json(acks);
      } catch (error: unknown) {
        console.error(
          "[POLICY-ACK] Error fetching:",
          safeErrorMessage(error),
        );
        return res
          .status(500)
          .json({ message: "Failed to fetch acknowledgements" });
      }
    },
  );

  app.get(
    "/api/policy-acknowledgements/user/:userId",
    requireAuth,
    async (req: any, res) => {
      try {
        const acks = await storage.getUserPolicyAcknowledgements(
          req.params.userId,
        );
        return res.json(acks);
      } catch (error: unknown) {
        console.error(
          "[POLICY-ACK] Error fetching:",
          safeErrorMessage(error),
        );
        return res
          .status(500)
          .json({ message: "Failed to fetch acknowledgements" });
      }
    },
  );

  app.post(
    "/api/policy-acknowledgements",
    requireAuth,
    async (req: any, res) => {
      try {
        const { policyId, signatureName } = req.body;
        if (!policyId || !signatureName) {
          return res
            .status(400)
            .json({ message: "policyId and signatureName are required" });
        }
        const ack = await storage.createPolicyAcknowledgement({
          policyId,
          userId: req.user.id,
          userName:
            `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() ||
            req.user.username,
          signatureName,
        });
        return res.status(201).json(ack);
      } catch (error: unknown) {
        console.error(
          "[POLICY-ACK] Error creating:",
          safeErrorMessage(error),
        );
        return res
          .status(500)
          .json({ message: "Failed to create acknowledgement" });
      }
    },
  );
}
