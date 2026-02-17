/**
 * Structured Logger
 *
 * Provides consistent, structured log output for the server.  In production
 * logs emit JSON for easy ingestion by log aggregators (Datadog, CloudWatch,
 * etc.).  In development logs emit a human-friendly format.
 *
 * Usage:
 * ```ts
 * import { logger } from "../utils/logger";
 * logger.info("Server started", { port: 5000 });
 * logger.warn("Rate limit approaching", { ip, count });
 * logger.error("DB query failed", { query, error });
 * ```
 *
 * @module server/utils/logger
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const isProduction = process.env.NODE_ENV === "production";
const minLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || (isProduction ? "info" : "debug");

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[minLevel];
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatForHuman(
  level: LogLevel,
  source: string,
  message: string,
  meta?: Record<string, unknown>,
): string {
  const time = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  const tag = level.toUpperCase().padEnd(5);
  const metaStr = meta && Object.keys(meta).length > 0
    ? ` ${JSON.stringify(meta)}`
    : "";
  return `${time} [${source}] ${tag} ${message}${metaStr}`;
}

function formatForJSON(
  level: LogLevel,
  source: string,
  message: string,
  meta?: Record<string, unknown>,
): string {
  const entry: Record<string, unknown> = {
    timestamp: formatTimestamp(),
    level,
    source,
    message,
    ...meta,
  };

  // Serialize errors properly
  if (meta?.error instanceof Error) {
    entry.error = {
      name: meta.error.name,
      message: meta.error.message,
      stack: meta.error.stack?.split("\n").slice(0, 5).join("\n"),
    };
  }

  try {
    return JSON.stringify(entry);
  } catch {
    return JSON.stringify({ timestamp: formatTimestamp(), level, source, message });
  }
}

function emit(
  level: LogLevel,
  source: string,
  message: string,
  meta?: Record<string, unknown>,
): void {
  if (!shouldLog(level)) return;

  const output = isProduction
    ? formatForJSON(level, source, message, meta)
    : formatForHuman(level, source, message, meta);

  switch (level) {
    case "error":
      console.error(output);
      break;
    case "warn":
      console.warn(output);
      break;
    default:
      console.log(output);
  }
}

/**
 * Create a child logger pre-bound to a source name.
 *
 * ```ts
 * const log = createLogger("auth");
 * log.info("Login succeeded", { username });
 * ```
 */
export function createLogger(source: string) {
  return {
    debug: (message: string, meta?: Record<string, unknown>) =>
      emit("debug", source, message, meta),
    info: (message: string, meta?: Record<string, unknown>) =>
      emit("info", source, message, meta),
    warn: (message: string, meta?: Record<string, unknown>) =>
      emit("warn", source, message, meta),
    error: (message: string, meta?: Record<string, unknown>) =>
      emit("error", source, message, meta),
  };
}

/** Default logger instance bound to "app" */
export const logger = createLogger("app");
