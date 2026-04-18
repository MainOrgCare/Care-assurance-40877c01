import assert from "node:assert/strict";
import test, { describe } from "node:test";
import {
  buildTotpOtpauthUri,
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpCode,
  generateTotpSecret,
  normalizeTotpCode,
  verifyTotpCode,
} from "../utils/totp";

describe("totp utils", () => {
  test("generates and verifies a valid TOTP code", () => {
    const secret = generateTotpSecret();
    const timestampMs = 1_700_000_000_000;
    const code = generateTotpCode(secret, { timestampMs });

    assert.equal(code.length, 6);
    assert.equal(verifyTotpCode(secret, code, { timestampMs }), true);
    assert.equal(verifyTotpCode(secret, "000000", { timestampMs }), false);
  });

  test("accepts adjacent time-window codes", () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    const nextStepCode = generateTotpCode(secret, { timestampMs: now + 30_000 });

    assert.equal(
      verifyTotpCode(secret, nextStepCode, { timestampMs: now, window: 1 }),
      true,
    );
    assert.equal(
      verifyTotpCode(secret, nextStepCode, { timestampMs: now, window: 0 }),
      false,
    );
  });

  test("normalizes OTP input to six digits", () => {
    assert.equal(normalizeTotpCode("123456"), "123456");
    assert.equal(normalizeTotpCode("123-456"), "123456");
    assert.equal(normalizeTotpCode("abc123456"), "123456");
    assert.equal(normalizeTotpCode("12345"), null);
    assert.equal(normalizeTotpCode("1234567"), null);
  });

  test("builds an otpauth URI", () => {
    const uri = buildTotpOtpauthUri({
      issuer: "CareAssurance",
      accountName: "alice@example.com",
      secret: generateTotpSecret(),
    });

    assert.equal(uri.startsWith("otpauth://totp/"), true);
    assert.equal(uri.includes("issuer=CareAssurance"), true);
    assert.equal(uri.includes("digits=6"), true);
  });

  test("encrypts and decrypts TOTP secrets", () => {
    const secret = generateTotpSecret();
    const encrypted = encryptTotpSecret(secret);
    const decrypted = decryptTotpSecret(encrypted);

    assert.equal(decrypted, secret);
    assert.equal(decryptTotpSecret("invalid"), null);
  });
});
