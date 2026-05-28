import { describe, expect, it } from "vitest";
import {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  validatePassword,
  isValidPassword,
  isValidEmail,
  isValidUKPhone,
} from "../validation";

describe("validatePassword", () => {
  it("accepts a strong compliant password", () => {
    expect(validatePassword("Str0ng&Secure!")).toBeNull();
    expect(isValidPassword("Str0ng&Secure!")).toBe(true);
  });

  it("requires a non-empty string", () => {
    expect(validatePassword("")).toBe("Password is required.");
    // @ts-expect-error testing runtime guard against non-string input
    expect(validatePassword(null)).toBe("Password is required.");
  });

  it("enforces the minimum length", () => {
    expect(validatePassword("Aa1!aa")).toBe(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  });

  it("enforces the maximum length", () => {
    const tooLong = `Aa1!${"x".repeat(MAX_PASSWORD_LENGTH)}`;
    expect(validatePassword(tooLong)).toBe(
      `Password must be no more than ${MAX_PASSWORD_LENGTH} characters.`,
    );
  });

  it("requires lowercase, uppercase, digit, and special character", () => {
    const complexityError =
      "Password must include at least one lowercase letter, one uppercase letter, one number, and one special character (!@#$%^&*...).";
    expect(validatePassword("alllowercase1!")).toBe(complexityError); // no uppercase
    expect(validatePassword("ALLUPPERCASE1!")).toBe(complexityError); // no lowercase
    expect(validatePassword("NoDigitsHere!!")).toBe(complexityError); // no digit
    expect(validatePassword("NoSpecial1234")).toBe(complexityError); // no special
  });

  it("rejects passwords containing the username (case-insensitive)", () => {
    expect(validatePassword("MyName&Wins99", "myname")).toBe(
      "Password cannot contain your username.",
    );
  });

  it("ignores an empty username", () => {
    expect(validatePassword("Str0ng&Secure!", "")).toBeNull();
  });

  it("rejects sequential character runs", () => {
    expect(validatePassword("Qwe123&Secure!")).toBe(
      "Password cannot contain sequential characters (e.g., 123, abc).",
    );
    expect(validatePassword("Abcz&Secure99!")).toBe(
      "Password cannot contain sequential characters (e.g., 123, abc).",
    );
  });

  it("rejects three or more repeated characters", () => {
    expect(validatePassword("Saaay&Secure9!")).toBe(
      "Password cannot contain three or more repeated characters.",
    );
  });
});

describe("isValidEmail", () => {
  it("accepts well-formed addresses", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("first.last@sub.domain.co.uk")).toBe(true);
    expect(isValidEmail("  trimmed@example.com  ")).toBe(true);
  });

  it("rejects malformed addresses", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("no-at-sign")).toBe(false);
    expect(isValidEmail("missing@domain")).toBe(false);
    expect(isValidEmail("two@@example.com")).toBe(false);
    expect(isValidEmail("spaces in@example.com")).toBe(false);
  });
});

describe("isValidUKPhone", () => {
  it("accepts UK formats with 0 or +44 prefix and common separators", () => {
    expect(isValidUKPhone("07911123456")).toBe(true);
    expect(isValidUKPhone("+447911123456")).toBe(true);
    expect(isValidUKPhone("+44 7911 123 456")).toBe(true);
    expect(isValidUKPhone("(01234) 567890")).toBe(true);
  });

  it("rejects invalid numbers", () => {
    expect(isValidUKPhone("")).toBe(false);
    expect(isValidUKPhone("12345")).toBe(false);
    expect(isValidUKPhone("notaphone")).toBe(false);
    expect(isValidUKPhone("+1 555 123 4567")).toBe(false);
  });
});
