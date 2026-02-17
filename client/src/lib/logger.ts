/**
 * Client-Side Logger
 *
 * Centralised logging abstraction for the CareAssurance client.
 * Wraps `console.*` methods with:
 *  - Configurable log levels (debug, info, warn, error)
 *  - Automatic silencing of debug/info in production
 *  - Structured metadata support
 *  - Source tagging for tracing log origin
 *
 * Usage:
 * ```ts
 * import { logger, createClientLogger } from "@/lib/logger";
 *
 * logger.info("Application started");
 * logger.error("Failed to fetch", { endpoint: "/api/foo", status: 500 });
 *
 * const authLog = createClientLogger("auth");
 * authLog.warn("Session expired");
 * ```
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogMeta {
  [key: string]: unknown;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Minimum log level threshold.
 * - Production: only warnings and errors
 * - Development: everything
 */
const MIN_LEVEL: LogLevel =
  typeof import.meta !== "undefined" && (import.meta as any).env?.PROD
    ? "warn"
    : "debug";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[MIN_LEVEL];
}

function formatPrefix(source: string, level: LogLevel): string {
  const timestamp = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  return `${timestamp} [${source}] [${level.toUpperCase()}]`;
}

export interface ClientLogger {
  debug(message: string, meta?: LogMeta): void;
  info(message: string, meta?: LogMeta): void;
  warn(message: string, meta?: LogMeta): void;
  error(message: string, meta?: LogMeta): void;
}

/**
 * Create a logger scoped to a particular source/module.
 *
 * @param source - Short identifier for the logging source (e.g. "auth", "api", "ui")
 */
export function createClientLogger(source: string): ClientLogger {
  const log = (level: LogLevel, message: string, meta?: LogMeta) => {
    if (!shouldLog(level)) return;

    const prefix = formatPrefix(source, level);
    const consoleFn =
      level === "debug"
        ? console.debug
        : level === "info"
          ? console.info
          : level === "warn"
            ? console.warn
            : console.error;

    if (meta && Object.keys(meta).length > 0) {
      consoleFn(prefix, message, meta);
    } else {
      consoleFn(prefix, message);
    }
  };

  return {
    debug: (message, meta) => log("debug", message, meta),
    info: (message, meta) => log("info", message, meta),
    warn: (message, meta) => log("warn", message, meta),
    error: (message, meta) => log("error", message, meta),
  };
}

/** Default application-wide logger instance */
export const logger = createClientLogger("app");
