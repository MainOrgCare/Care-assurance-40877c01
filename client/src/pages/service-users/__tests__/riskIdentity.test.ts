import { describe, expect, it } from "vitest";
import { normalizeServiceUserInitials } from "../riskIdentity";

describe("normalizeServiceUserInitials", () => {
  it("normalizes malformed brace-prefixed initials to fallback initials", () => {
    expect(normalizeServiceUserInitials("{. N.")).toBe("N.N.");
  });

  it("keeps canonical dotted initials format", () => {
    expect(normalizeServiceUserInitials("f.o")).toBe("F.O.");
  });

  it("converts compact initials into dotted format", () => {
    expect(normalizeServiceUserInitials("fo")).toBe("F.O.");
  });

  it("derives initials from full names", () => {
    expect(normalizeServiceUserInitials("Freda O'Neill")).toBe("F.O.");
  });

  it("falls back to X.N. for single-letter values", () => {
    expect(normalizeServiceUserInitials("N")).toBe("N.N.");
  });

  it("returns fallback initials for unresolved PII tokens", () => {
    expect(normalizeServiceUserInitials("{{PII_test_NAME_1}}")).toBe("N.N.");
  });
});
