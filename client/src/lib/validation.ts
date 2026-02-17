/**
 * Shared validation utilities used across client-side forms.
 *
 * Password policy aligns with the server-side NIST SP 800-63B requirements
 * defined in `server/utils/passwordPolicy.ts`.
 */

/** Minimum password length (NIST recommends 12+). */
export const MIN_PASSWORD_LENGTH = 12;
/** Maximum password length (DoS prevention). */
export const MAX_PASSWORD_LENGTH = 128;

const PASSWORD_COMPLEXITY_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).+$/;

const SEQUENTIAL_REGEX =
  /(?:012|123|234|345|456|567|678|789|abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)/i;

const REPEATED_CHARS_REGEX = /(.)\1{2,}/;

/**
 * Validate a password against the platform's security policy.
 *
 * Rules:
 * - At least 12 characters, at most 128
 * - At least one lowercase, uppercase, digit, and special character
 * - No three or more sequential characters (e.g. 123, abc)
 * - No three or more repeated characters (e.g. aaa)
 * - Must not contain the username
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
    return "Password must include at least one lowercase letter, one uppercase letter, one number, and one special character.";
  }
  if (username && password.toLowerCase().includes(username.toLowerCase())) {
    return "Password cannot contain your username.";
  }
  if (SEQUENTIAL_REGEX.test(password)) {
    return "Password cannot contain sequential characters (e.g. 123, abc).";
  }
  if (REPEATED_CHARS_REGEX.test(password)) {
    return "Password cannot contain three or more repeated characters.";
  }
  return null;
}

/**
 * Quick boolean check for backwards compatibility.
 * Prefer `validatePassword()` for detailed error messages.
 */
export function isValidPassword(value: string): boolean {
  return validatePassword(value) === null;
}

/**
 * Validate an email address format.
 */
export function isValidEmail(value: string): boolean {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * Validate a UK phone number (basic check).
 */
export function isValidUKPhone(value: string): boolean {
  if (!value) return false;
  const cleaned = value.replace(/[\s\-()]/g, "");
  return /^(\+44|0)[\d]{9,10}$/.test(cleaned);
}
