import { storage } from "./storage";

const CLEANUP_INTERVAL_MS = Number.parseInt(process.env.CLEANUP_INTERVAL_MS || "21600000", 10); // 6 hours

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

const startWorker = async () => {
  log(`Worker started. Cleanup interval: ${CLEANUP_INTERVAL_MS}ms`);
  await runCleanup();
  setInterval(runCleanup, CLEANUP_INTERVAL_MS);
};

startWorker();
