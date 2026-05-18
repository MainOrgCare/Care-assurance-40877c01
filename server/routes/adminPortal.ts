/**
 * Admin Portal Routes
 *
 * Administrative endpoints for user session management, suspension
 * controls, IP blocking, audit trail access, and user presence
 * monitoring.
 *
 * @module server/routes/adminPortal
 */
import type { Express, RequestHandler } from "express";
import { storage } from "../storage";
import { safeErrorMessage } from "../utils/safeError";

const getRouteParamValue = (param: string | string[] | undefined): string =>
  Array.isArray(param) ? (param[0] ?? "") : (param ?? "");

export interface AdminPortalRouteDeps {
  requireAuth: RequestHandler;
  requireAdmin: RequestHandler;
  sendToUser: (userId: string, message: unknown) => void;
  sessionStore: { destroy(sid: string, callback: (err?: unknown) => void): void } | null;
}

export function registerAdminPortalRoutes(
  app: Express,
  { requireAuth, requireAdmin, sendToUser, sessionStore }: AdminPortalRouteDeps,
): void {
  // Get session history (admin only)
  app.get("/api/admin/session-history", requireAuth, requireAdmin, async (req, res) => {
    try {
      const history = await storage.getAllSessionHistory();
      return res.json(history);
    } catch (error: unknown) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load session history") });
    }
  });

  // Get suspension logs (admin only)
  app.get("/api/admin/suspension-logs", requireAuth, requireAdmin, async (req, res) => {
    try {
      const logs = await storage.getSuspensionLogs();
      return res.json(logs);
    } catch (error: unknown) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load suspension logs") });
    }
  });

  // Suspend a user (admin only)
  app.post("/api/admin/users/:id/suspend", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const { durationMinutes, reason } = req.body;
      const userId = getRouteParamValue(req.params.id);

      if (!durationMinutes || durationMinutes < 2 || durationMinutes > 1440) {
        return res.status(400).json({ message: "Duration must be between 2 and 1440 minutes" });
      }

      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      if (targetUser.role === "admin") {
        return res.status(403).json({ message: "Cannot suspend admin users" });
      }

      const now = new Date();
      const endsAt = new Date(now.getTime() + durationMinutes * 60 * 1000);

      await storage.suspendUser(userId, endsAt);

      await storage.createSuspensionLog({
        userId: targetUser.id,
        username: targetUser.username,
        adminId: req.user.id,
        adminUsername: req.user.username,
        durationMinutes,
        reason: reason || null,
        startsAt: now,
        endsAt,
      });

      await storage.deleteActiveSessionByUserId(userId);

      sendToUser(userId, {
        type: "FORCE_LOGOUT",
        message: `You have been suspended for ${durationMinutes} minutes.${reason ? ` Reason: ${reason}` : ""}`,
      });

      return res.json({ message: "User suspended", suspendedUntil: endsAt });
    } catch (error: unknown) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to suspend user") });
    }
  });

  // Reinstate a suspended user (admin only)
  app.post("/api/admin/users/:id/reinstate", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = getRouteParamValue(req.params.id);

      await storage.suspendUser(userId, null);

      const logs = await storage.getSuspensionLogsByUser(userId);
      if (logs.length > 0 && logs[0].endsAt > new Date()) {
        await storage.reinstateSuspension(logs[0].id);
      }

      return res.json({ message: "User reinstated" });
    } catch (error: unknown) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to reinstate user") });
    }
  });

  // Kick a user (force logout without suspension) (admin only)
  app.post("/api/admin/users/:id/kick", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const userId = getRouteParamValue(req.params.id);
      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      if (targetUser.role === "admin") {
        return res.status(403).json({ message: "Cannot kick admin users" });
      }

      const activeSession = await storage.getActiveSessionByUserId(userId);
      if (activeSession) {
        await storage.updateSessionLogout(activeSession.sessionId, true);
        await storage.deleteActiveSession(activeSession.sessionId);

        if (sessionStore) {
          sessionStore.destroy(activeSession.sessionId, (err: unknown) => {
            if (err) console.error("Failed to destroy session:", err);
          });
        }

        sendToUser(userId, {
          type: "FORCE_LOGOUT",
          message: "You have been logged out by an administrator.",
        });
      }

      return res.json({ message: "User kicked" });
    } catch (error: unknown) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to kick user") });
    }
  });

  // Update user name (admin only)
  app.patch("/api/admin/users/:id/name", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { firstName, lastName } = req.body;
      const user = await storage.updateUserName(getRouteParamValue(req.params.id), firstName || null, lastName || null);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      return res.json({
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
        jobTitle: user.jobTitle,
      });
    } catch (error: unknown) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to update user name") });
    }
  });

  // Get comprehensive audit trail (admin only)
  app.get("/api/admin/audit-trail", requireAuth, requireAdmin, async (req, res) => {
    try {
      const [riskLogs, discrepancies, suspensionLogs, sessionHistoryData] = await Promise.all([
        storage.getAllRiskAssessmentLogs(),
        storage.getAllDiscrepancies(),
        storage.getSuspensionLogs(),
        storage.getAllSessionHistory(),
      ]);

      return res.json({
        riskAssessments: riskLogs,
        discrepancies,
        suspensions: suspensionLogs,
        sessionHistory: sessionHistoryData,
      });
    } catch (error: unknown) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load audit trail") });
    }
  });

  // Get users with presence info (admin only)
  app.get("/api/admin/users-presence", requireAuth, requireAdmin, async (req, res) => {
    try {
      const [allUsers, activeSess] = await Promise.all([
        storage.getAllUsers(),
        storage.getAllActiveSessions(),
      ]);

      const activeUserIds = new Set(activeSess.map(s => s.userId));

      const usersWithPresence = allUsers.map(u => ({
        id: u.id,
        username: u.username,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        status: u.status,
        jobTitle: u.jobTitle,
        suspendedUntil: u.suspendedUntil,
        lastOnlineAt: u.lastOnlineAt,
        isOnline: activeUserIds.has(u.id),
        currentSession: activeSess.find(s => s.userId === u.id) || null,
      }));

      return res.json(usersWithPresence);
    } catch (error: unknown) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load user presence data") });
    }
  });

  // Get all blocked IPs (admin only)
  app.get("/api/admin/blocked-ips", requireAuth, requireAdmin, async (req, res) => {
    try {
      const blockedIps = await storage.getAllBlockedIps();
      return res.json(blockedIps);
    } catch (error: unknown) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load blocked IPs") });
    }
  });

  // Block an IP address (admin only)
  app.post("/api/admin/block-ip", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const { ipAddress, reason, username } = req.body;

      if (!ipAddress) {
        return res.status(400).json({ message: "IP address is required" });
      }

      // Check if already blocked
      const existing = await storage.getBlockedIpByAddress(ipAddress);
      if (existing) {
        return res.status(400).json({ message: "IP address is already blocked" });
      }

      const blocked = await storage.blockIp({
        ipAddress,
        blockedBy: req.user.username,
        reason: reason || null,
        username: username || null,
      });

      return res.json(blocked);
    } catch (error: unknown) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to block IP") });
    }
  });

  // Unblock an IP address (admin only)
  app.delete("/api/admin/blocked-ips/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.unblockIp(getRouteParamValue(req.params.id));
      return res.json({ success: true });
    } catch (error: unknown) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to unblock IP") });
    }
  });
}
