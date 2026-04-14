import { storage } from "./storage";

const DEFAULT_CLEANUP_INTERVAL_MS = 21_600_000; // 6 hours
const SESSION_CLEANUP_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const IP_BLOCK_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SYSTEM_LOG_ARCHIVE_THRESHOLD_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

type MaintenanceStartOptions = {
  source?: string;
};

let cleanupInterval: ReturnType<typeof setInterval> | null = null;
let activeRun: Promise<void> | null = null;

const hasDatabaseUrl = () => Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());

const getCleanupIntervalMs = () => {
  const configuredInterval = Number(process.env.CLEANUP_INTERVAL_MS);
  return Number.isFinite(configuredInterval) && configuredInterval > 0
    ? configuredInterval
    : DEFAULT_CLEANUP_INTERVAL_MS;
};

const log = (message: string, source = "maintenance") => {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
};

const runDataCleanup = async (source: string) => {
  try {
    const result = await storage.cleanupAllExpiredData();
    const total = Object.values(result).reduce((sum, value) => sum + value, 0);
    log(
      `Data cleanup: ${total} expired records removed (users: ${result.serviceUsers}, workers: ${result.careWorkers}, calls: ${result.calls}, orders: ${result.orders}, templates: ${result.templates}, recommendations: ${result.recommendations})`,
      source,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("self-signed certificate")) {
      console.error(`[${source}] Data cleanup failed: self-signed certificate. Set PGSSLREJECTUNAUTHORIZED=false for Render DB.`);
      return;
    }
    console.error(`[${source}] Data cleanup failed:`, error);
  }
};

const runSessionCleanup = async (source: string) => {
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
      log(`Session cleanup: Removed ${removedCount} stale sessions (inactive 7+ days)`, source);
    }
  } catch (error) {
    console.error(`[${source}] Session cleanup failed:`, error);
  }
};

const runSuspensionReset = async (source: string) => {
  try {
    const suspensions = await storage.getSuspensionLogs();
    const now = new Date();
    let reinstatedCount = 0;

    for (const suspension of suspensions) {
      if (suspension.reinstatedEarly) continue;

      const suspendedUntil = new Date(suspension.endsAt);
      if (now > suspendedUntil) {
        const user = await storage.getUser(suspension.userId);
        if (user) {
          await storage.suspendUser(suspension.userId, null);
          await storage.reinstateSuspension(suspension.id);
          reinstatedCount++;
        }
      }
    }

    if (reinstatedCount > 0) {
      log(`Suspension reset: Auto-reinstated ${reinstatedCount} users (suspension period expired)`, source);
    }
  } catch (error) {
    console.error(`[${source}] Suspension reset failed:`, error);
  }
};

const runIpBlockCleanup = async (source: string) => {
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
      log(`IP block cleanup: Removed ${removedCount} expired blocks (older than 30 days)`, source);
    }
  } catch (error) {
    console.error(`[${source}] IP block cleanup failed:`, error);
  }
};

const runSystemLogArchival = async (source: string) => {
  try {
    const logs = await storage.getSystemLogs();
    const now = Date.now();
    let archivedCount = 0;

    for (const entry of logs) {
      const logTime = new Date(entry.createdAt).getTime();
      const ageMs = now - logTime;

      if (ageMs > SYSTEM_LOG_ARCHIVE_THRESHOLD_MS) {
        archivedCount++;
      }
    }

    if (archivedCount > 0) {
      log(`System log archival: ${archivedCount} logs eligible for archival (older than 90 days)`, source);
    }
  } catch (error) {
    console.error(`[${source}] System log archival failed:`, error);
  }
};

const runMaintenanceCycle = async (source: string) => {
  if (activeRun) {
    log("Previous maintenance cycle is still running; skipping overlapping run.", source);
    return activeRun;
  }

  activeRun = (async () => {
    log("Starting background maintenance tasks...", source);
    const startTime = Date.now();

    await runDataCleanup(source);
    await runSessionCleanup(source);
    await runSuspensionReset(source);
    await runIpBlockCleanup(source);
    await runSystemLogArchival(source);

    const duration = Date.now() - startTime;
    log(`Background maintenance completed in ${duration}ms`, source);
  })();

  try {
    await activeRun;
  } finally {
    activeRun = null;
  }
};

export async function startBackgroundMaintenance(options: MaintenanceStartOptions = {}) {
  const source = options.source || "maintenance";

  if (cleanupInterval) {
    log("Background maintenance already running; skipping duplicate start.", source);
    return;
  }

  if (!hasDatabaseUrl()) {
    log("DATABASE_URL is missing. Background maintenance is disabled.", source);
    return;
  }

  const intervalMs = getCleanupIntervalMs();
  log(
    `Background maintenance enabled. Interval: ${intervalMs}ms (${(intervalMs / 1000 / 60 / 60).toFixed(1)} hours)`,
    source,
  );
  log(
    "Maintenance tasks: data cleanup, session cleanup, suspension reset, IP block cleanup, system log archival",
    source,
  );

  await runMaintenanceCycle(source);
  cleanupInterval = setInterval(() => {
    void runMaintenanceCycle(source);
  }, intervalMs);
  log("Background maintenance scheduler ready.", source);
}

export function stopBackgroundMaintenance(source = "maintenance") {
  if (!cleanupInterval) return;

  clearInterval(cleanupInterval);
  cleanupInterval = null;
  log("Background maintenance scheduler stopped.", source);
}
