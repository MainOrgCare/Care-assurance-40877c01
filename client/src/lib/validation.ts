/**
 * Shared validation utilities used across client-side forms.
 */

/**
 * Validates that a password meets minimum security requirements:
 * - At least 8 characters
 * - Contains at least one letter (a-z or A-Z)
 * - Contains at least one digit (0-9)
 */
export function isValidPassword(value: string): boolean {
  if (!value || value.length < 8) return false;
  return /[A-Za-z]/.test(value) && /\d/.test(value);
}
