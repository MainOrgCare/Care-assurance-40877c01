import { storage } from "./storage";

const CLEANUP_INTERVAL_MS = Number(process.env.CLEANUP_INTERVAL_MS) || 21_600_000; // 6 hours
const hasDatabaseUrl = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());

// Session cleanup: remove stale active sessions (inactive for 7+ days)
const SESSION_CLEANUP_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// IP block cleanup: remove blocks older than 30 days
const IP_BLOCK_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const log = (message: string) => {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [worker] ${message}`);
};

/**
 * Clean up expired data from the database (service users, care workers, calls, etc.)
 * This frees up database storage and keeps analytics clean.
 */
const runDataCleanup = async () => {
  try {
    const result = await storage.cleanupAllExpiredData();
    const total = Object.values(result).reduce((sum, value) => sum + value, 0);
    log(`✓ Data cleanup: ${total} expired records removed (users: ${result.serviceUsers}, workers: ${result.careWorkers}, calls: ${result.calls}, orders: ${result.orders}, templates: ${result.templates}, recommendations: ${result.recommendations})`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("self-signed certificate")) {
      console.error("[worker] Data cleanup failed: self-signed certificate. Set PGSSLREJECTUNAUTHORIZED=false for Render DB.");
      return;
    }
    console.error("[worker] Data cleanup failed:", error);
  }
};

/**
 * Clean up stale sessions — remove active sessions that haven't been updated in 7+ days.
 * This prevents accumulation of zombie sessions in the database.
 */
const runSessionCleanup = async () => {
  try {
    const allSessions = await storage.getAllActiveSessions();
    const now = Date.now();
    let removedCount = 0;

    for (const session of allSessions) {
      const lastActivityTime = new Date(session.lastActivity).getTime();
      const ageMs = now - lastActivityTime;

      if (ageMs > SESSION_CLEANUP_THRESHOLD_MS) {
        await storage.deleteActiveSession(session.sessionId);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      log(`✓ Session cleanup: Removed ${removedCount} stale sessions (inactive 7+ days)`);
    }
  } catch (error) {
    console.error("[worker] Session cleanup failed:", error);
  }
};

/**
 * Reset expired user suspensions — automatically reinstate users whose suspension period has elapsed.
 * This ensures compliance with disciplinary policies that have time-limited suspensions.
 */
const runSuspensionReset = async () => {
  try {
    const suspensions = await storage.getSuspensionLogs();
    const now = new Date();
    let reinstatedCount = 0;

    for (const suspension of suspensions) {
      if (suspension.reinstatedEarly) continue; // Already reinstated

      const suspendedUntil = new Date(suspension.endsAt);
      if (now > suspendedUntil) {
        // Auto-reinstate the user
        const user = await storage.getUser(suspension.userId);
        if (user) {
          await storage.suspendUser(suspension.userId, null);
          await storage.reinstateSuspension(suspension.id);
          reinstatedCount++;
        }
      }
    }

    if (reinstatedCount > 0) {
      log(`✓ Suspension reset: Auto-reinstated ${reinstatedCount} users (suspension period expired)`);
    }
  } catch (error) {
    console.error("[worker] Suspension reset failed:", error);
  }
};

/**
 * Clean up expired IP blocks — remove blocks older than 30 days to prevent permanent de-facto blocks.
 * Long-term blocks should be explicitly renewed or managed via admin tools.
 */
const runIpBlockCleanup = async () => {
  try {
    const blockedIps = await storage.getAllBlockedIps();
    const now = Date.now();
    let removedCount = 0;

    for (const ipRecord of blockedIps) {
      const blockTime = new Date(ipRecord.createdAt).getTime();
      const ageMs = now - blockTime;

      if (ageMs > IP_BLOCK_RETENTION_MS) {
        await storage.unblockIp(ipRecord.id);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      log(`✓ IP block cleanup: Removed ${removedCount} expired blocks (older than 30 days)`);
    }
  } catch (error) {
    console.error("[worker] IP block cleanup failed:", error);
  }
};

/**
 * Archive old system logs — move logs older than 90 days to archive status to keep the
 * system log table performant while retaining long-term audit trail in archived state.
 */
const runSystemLogArchival = async () => {
  try {
    const logs = await storage.getSystemLogs();
    const now = Date.now();
    const archiveThreshold = 90 * 24 * 60 * 60 * 1000; // 90 days
    let archivedCount = 0;

    for (const log of logs) {
      // Only attempt to archive if created recently enough to skip
      const logTime = new Date(log.createdAt).getTime();
      const ageMs = now - logTime;

      if (ageMs > archiveThreshold) {
        // In a real system, you'd update the archive_status column or mark as archived
        // For now, this is a placeholder that logs the finding
        archivedCount++;
      }
    }

    if (archivedCount > 0) {
      log(`✓ System log archival: ${archivedCount} logs eligible for archival (older than 90 days)`);
    }
  } catch (error) {
    console.error("[worker] System log archival failed:", error);
  }
};

/**
 * Main worker task — runs all background jobs in sequence.
 * Executed on startup and then periodically based on CLEANUP_INTERVAL_MS.
 */
const runAllWorkerTasks = async () => {
  log("Starting background maintenance tasks...");
  const startTime = Date.now();

  // Run all tasks in sequence (not parallel) to avoid database contention
  await runDataCleanup();
  await runSessionCleanup();
  await runSuspensionReset();
  await runIpBlockCleanup();
  await runSystemLogArchival();

  const duration = Date.now() - startTime;
  log(`Background maintenance completed in ${duration}ms`);
};

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

const startWorker = async () => {
  if (!hasDatabaseUrl) {
    log("DATABASE_URL is missing. Worker cannot start without a database connection.");
    process.exit(1);
  }
  log(`Worker started. Maintenance interval: ${CLEANUP_INTERVAL_MS}ms (${(CLEANUP_INTERVAL_MS / 1000 / 60 / 60).toFixed(1)} hours)`);
  log("Background tasks: data cleanup, session cleanup, suspension reset, IP block cleanup, system log archival");
  
  // Run immediately on startup
  await runAllWorkerTasks();
  
  // Then run periodically
  cleanupInterval = setInterval(runAllWorkerTasks, CLEANUP_INTERVAL_MS);
  log("Worker ready. Waiting for next maintenance cycle...");
  // Keep the process alive — Render requires long-lived worker processes
};

// Graceful shutdown: clear the interval and let the process exit cleanly
const shutdown = (signal: string) => {
  log(`${signal} received. Shutting down worker...`);
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

startWorker();
