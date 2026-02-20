import { storage } from "./storage";

const CLEANUP_INTERVAL_MS = Number(process.env.CLEANUP_INTERVAL_MS) || 21_600_000; // 6 hours

const log = (message: string) => {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [worker] ${message}`);
};

const runCleanup = async () => {
  try {
    const result = await storage.cleanupAllExpiredData();
    const total = Object.values(result).reduce((sum, value) => sum + value, 0);
    log(`Cleanup completed: ${total} expired records removed.`);
  } catch (error) {
    console.error("[worker] Cleanup failed:", error);
  }
};

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

const startWorker = async () => {
  log(`Worker started. Cleanup interval: ${CLEANUP_INTERVAL_MS}ms`);
  await runCleanup();
  cleanupInterval = setInterval(runCleanup, CLEANUP_INTERVAL_MS);
  // Allow the process to exit naturally if this is the only timer left
  cleanupInterval.unref();
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
