/**
 * Shared password policy — the single source of truth for password validation
 * across both the Express server and the React client.
 *
 * Implements NIST SP 800-63B aligned rules. The server additionally layers
 * brute-force / login-attempt tracking on top of this (see
 * `server/utils/passwordPolicy.ts`); the client re-exports `validatePassword`
 * via `client/src/lib/validation.ts`. Keeping the logic here guarantees the two
 * sides cannot drift apart.
 *
 * @module shared/passwordPolicy
 */

/** Minimum password length (NIST recommends 12+). */
export const MIN_PASSWORD_LENGTH = 12;
/** Maximum password length — prevents DoS via very long passwords. */
export const MAX_PASSWORD_LENGTH = 128;

/** At least one lowercase, uppercase, digit, and special character. */
const PASSWORD_COMPLEXITY_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).+$/;

/** Three or more sequential characters (e.g. 123, abc). */
const SEQUENTIAL_REGEX =
  /(?:012|123|234|345|456|567|678|789|abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)/i;

/** Three or more repeated characters (e.g. aaa). */
const REPEATED_CHARS_REGEX = /(.)\1{2,}/;

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
 * Rules (checked in order):
 * - Required, at least {@link MIN_PASSWORD_LENGTH}, at most {@link MAX_PASSWORD_LENGTH} characters
 * - At least one lowercase, uppercase, digit, and special character
 * - Not a known common/weak password
 * - Must not contain the username
 * - No three or more sequential characters (e.g. 123, abc)
 * - No three or more repeated characters (e.g. aaa)
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
  if (SEQUENTIAL_REGEX.test(password)) {
    return "Password cannot contain sequential characters (e.g., 123, abc).";
  }
  if (REPEATED_CHARS_REGEX.test(password)) {
    return "Password cannot contain three or more repeated characters.";
  }
  return null;
}
