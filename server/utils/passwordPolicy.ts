/**
 * Password Validation & Login Attempt Tracking
 *
 * Implements NIST SP 800-63B compliant password policies with progressive
 * lockout protection against brute-force attacks.
 *
 * @module server/utils/passwordPolicy
 */
import { storage } from "../storage";
import { logSecurityEvent } from "./securityAudit";

// ── Password Policy ──────────────────────────────────────────────────────────
// The policy itself (constants + validation) lives in `@shared/passwordPolicy`
// so the client and server validate identically. Re-exported here to preserve
// the existing server-side import surface.
export {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  validatePassword,
} from "@shared/passwordPolicy";

// ── Login Attempt Tracking (Brute-Force Protection) ──────────────────────────
const LOGIN_ATTEMPT_WINDOW_MS = 2 * 60 * 1000;
const LOGIN_BLOCK_DURATION_MS = 2 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 8;

/** Progressive lockout multipliers: 2 min → 4 min → 8 min → 16 min → 32 min. */
const PROGRESSIVE_BLOCK_MULTIPLIERS = [1, 2, 4, 8, 16];
/** Suspend user account after this many consecutive lockout blocks. */
const AUTO_SUSPEND_AFTER_BLOCKS = 3;

interface LoginAttempt {
  count: number;
  firstAttemptAt: number;
  lastAttemptAt: number;
  blockedUntil?: number;
  /** Track how many times the IP/user has been blocked (progressive lockout). */
  blockCount?: number;
}

const loginAttempts = new Map<string, LoginAttempt>();

/**
 * Cap to prevent unbounded memory growth.
 */
const MAX_LOGIN_ATTEMPTS_MAP_SIZE = 10_000;

export function getLoginAttemptKey(
  ip: string | null,
  username?: string,
): string {
  if (ip && ip !== "unknown") return `ip:${ip}`;
  if (username) return `user:${username.toLowerCase()}`;
  return "unknown";
}

/** Prune stale entries to prevent unbounded memory growth. */
export function pruneLoginAttempts(): void {
  const now = Date.now();
  for (const [key, attempt] of loginAttempts.entries()) {
    const expired = now - attempt.lastAttemptAt > LOGIN_ATTEMPT_WINDOW_MS;
    const blockExpired =
      !attempt.blockedUntil || attempt.blockedUntil <= now;
    if (expired && blockExpired) {
      loginAttempts.delete(key);
    }
  }
  // Hard cap: if map still exceeds limit, evict oldest entries
  if (loginAttempts.size > MAX_LOGIN_ATTEMPTS_MAP_SIZE) {
    const excess = loginAttempts.size - MAX_LOGIN_ATTEMPTS_MAP_SIZE;
    let removed = 0;
    for (const key of loginAttempts.keys()) {
      if (removed >= excess) break;
      loginAttempts.delete(key);
      removed++;
    }
  }
}

// Periodic cleanup (every 5 minutes) — prevents unbounded growth
const _loginAttemptsCleanupInterval = setInterval(() => {
  pruneLoginAttempts();
}, 5 * 60 * 1000);
if (typeof _loginAttemptsCleanupInterval.unref === "function") {
  _loginAttemptsCleanupInterval.unref();
}

/** Returns remaining block seconds (0 when not blocked). */
export function getBlockedSeconds(key: string): number {
  const attempt = loginAttempts.get(key);
  if (!attempt?.blockedUntil) return 0;
  const remainingMs = attempt.blockedUntil - Date.now();
  if (remainingMs <= 0) {
    loginAttempts.delete(key);
    return 0;
  }
  return Math.ceil(remainingMs / 1000);
}

/** Record a failed login attempt and apply progressive lockout if threshold reached. */
export function recordLoginFailure(
  key: string,
  username?: string,
): void {
  const now = Date.now();
  const attempt = loginAttempts.get(key);

  if (!attempt || now - attempt.firstAttemptAt > LOGIN_ATTEMPT_WINDOW_MS) {
    loginAttempts.set(key, {
      count: 1,
      firstAttemptAt: now,
      lastAttemptAt: now,
      blockCount: 0,
    });
    return;
  }

  attempt.count += 1;
  attempt.lastAttemptAt = now;

  if (attempt.count >= MAX_LOGIN_ATTEMPTS) {
    const blockCount = (attempt.blockCount || 0) + 1;
    const multiplierIndex = Math.min(
      blockCount - 1,
      PROGRESSIVE_BLOCK_MULTIPLIERS.length - 1,
    );
    const blockDuration =
      LOGIN_BLOCK_DURATION_MS * PROGRESSIVE_BLOCK_MULTIPLIERS[multiplierIndex];
    attempt.blockedUntil = now + blockDuration;
    attempt.blockCount = blockCount;

    logSecurityEvent({
      eventType: "LOGIN_BLOCKED",
      endpoint: "/api/auth/login",
      username,
      details: {
        reason: "Progressive lockout",
        blockCount,
        blockDurationMinutes: Math.round(blockDuration / 60000),
        willAutoSuspend: blockCount >= AUTO_SUSPEND_AFTER_BLOCKS,
      },
    });

    // Auto-suspend non-admin accounts after repeated blocks
    if (username && blockCount >= AUTO_SUSPEND_AFTER_BLOCKS) {
      storage
        .getUserByUsername(username)
        .then(async (user) => {
          if (user && user.role !== "admin") {
            const suspendUntil = new Date(now + 24 * 60 * 60 * 1000);
            await storage.suspendUser(user.id, suspendUntil);
            logSecurityEvent({
              eventType: "ACCOUNT_SUSPENDED",
              endpoint: "/api/auth/login",
              userId: user.id,
              username: user.username,
              details: {
                reason:
                  "Auto-suspended due to repeated failed login attempts",
                blockCount,
                suspendedUntil: suspendUntil.toISOString(),
              },
            });
          }
        })
        .catch(() => {
          /* Silently fail if user lookup fails */
        });
    }
  }
}

export function clearLoginFailures(key: string): void {
  loginAttempts.delete(key);
}
