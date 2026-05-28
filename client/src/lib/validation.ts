/**
 * Shared validation utilities used across client-side forms.
 *
 * Password rules come from `@shared/passwordPolicy`, the single source of truth
 * shared with the server (`server/utils/passwordPolicy.ts`). This guarantees the
 * client and server enforce identical password policy — including the common /
 * weak-password blocklist — so they cannot drift apart.
 */

export {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  validatePassword,
} from "@shared/passwordPolicy";

import { validatePassword } from "@shared/passwordPolicy";

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

