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

// ── Password Policy Constants ────────────────────────────────────────────────
export const MIN_PASSWORD_LENGTH = 12; // NIST recommends 12+
export const MAX_PASSWORD_LENGTH = 128; // Prevent DoS via very long passwords

/** At least one lowercase, uppercase, digit, and special character. */
const PASSWORD_COMPLEXITY_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).+$/;

/** Top 20 most commonly observed weak passwords — all lower-cased for comparison. */
const COMMON_PASSWORDS = new Set([
  "password123",
  "password1",
  "12345678",
  "qwerty123",
  "admin123",
  "letmein123",
  "welcome123",
  "monkey123",
  "dragon123",
  "master123",
  "sunshine1",
  "princess1",
  "football1",
  "iloveyou1",
  "shadow123",
  "baseball1",
  "trustno1!",
  "michael1",
  "jennifer1",
  "password!",
]);

/**
 * Validate a password against the platform's policy.
 *
 * @returns `null` when valid, or a human-readable error string.
 */
export function validatePassword(
  password: string,
  username?: string,
): string | null {
  if (!password || typeof password !== "string") {
    return "Password is required.";
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Password must be no more than ${MAX_PASSWORD_LENGTH} characters.`;
  }
  if (!PASSWORD_COMPLEXITY_REGEX.test(password)) {
    return "Password must include at least one lowercase letter, one uppercase letter, one number, and one special character (!@#$%^&*...).";
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return "Password is too common. Please choose a stronger password.";
  }
  if (username && password.toLowerCase().includes(username.toLowerCase())) {
    return "Password cannot contain your username.";
  }
  // Sequential characters (e.g., 123, abc)
  const sequential =
    /(?:012|123|234|345|456|567|678|789|abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)/i;
  if (sequential.test(password)) {
    return "Password cannot contain sequential characters (e.g., 123, abc).";
  }
  // Three or more repeated characters
  if (/(.)\1{2,}/.test(password)) {
    return "Password cannot contain three or more repeated characters.";
  }
  return null;
}

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
