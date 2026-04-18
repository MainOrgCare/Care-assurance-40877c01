import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const DEFAULT_DIGITS = 6;
const DEFAULT_PERIOD_SECONDS = 30;
const DEFAULT_VERIFY_WINDOW = 1;
const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const ENCRYPTION_IV_BYTES = 12;
const DEVELOPMENT_FALLBACK_ENCRYPTION_SECRET = "care-assurance-dev-2fa-secret";

const normalizeBase32Secret = (secret: string): string =>
  secret
    .replace(/[\s-]/g, "")
    .toUpperCase();

const assertValidBase32Secret = (secret: string): void => {
  if (!secret || !/^[A-Z2-7]+$/.test(secret)) {
    throw new Error("Invalid TOTP secret format");
  }
};

const base32Encode = (input: Buffer): string => {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
};

const base32Decode = (input: string): Buffer => {
  const normalized = normalizeBase32Secret(input).replace(/=+$/g, "");
  assertValidBase32Secret(normalized);

  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) {
      throw new Error("Invalid TOTP secret character");
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(output);
};

const counterToBuffer = (counter: number): Buffer => {
  let value = BigInt(counter);
  const buffer = Buffer.alloc(8);

  for (let i = 7; i >= 0; i -= 1) {
    buffer[i] = Number(value & 0xffn);
    value >>= 8n;
  }

  return buffer;
};

const hotp = (secretBytes: Buffer, counter: number, digits: number): string => {
  const digest = createHmac("sha1", secretBytes)
    .update(counterToBuffer(counter))
    .digest();

  const offset = digest[digest.length - 1] & 0x0f;
  const binaryCode =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  const otp = binaryCode % 10 ** digits;
  return String(otp).padStart(digits, "0");
};

const resolveEncryptionKey = (): Buffer => {
  const source =
    process.env.SESSION_SECRET?.trim() || DEVELOPMENT_FALLBACK_ENCRYPTION_SECRET;
  return createHash("sha256").update(source, "utf8").digest();
};

export const normalizeTotpCode = (code: string): string | null => {
  const normalized = code.replace(/\D/g, "");
  if (normalized.length !== DEFAULT_DIGITS) {
    return null;
  }
  return normalized;
};

export const generateTotpSecret = (bytes = 20): string => {
  if (!Number.isInteger(bytes) || bytes < 10 || bytes > 128) {
    throw new Error("Invalid TOTP secret length");
  }
  return base32Encode(randomBytes(bytes));
};

export const generateTotpCode = (
  secret: string,
  options?: {
    timestampMs?: number;
    periodSeconds?: number;
    digits?: number;
  },
): string => {
  const digits = options?.digits ?? DEFAULT_DIGITS;
  const periodSeconds = options?.periodSeconds ?? DEFAULT_PERIOD_SECONDS;
  const timestampMs = options?.timestampMs ?? Date.now();

  if (!Number.isInteger(digits) || digits < 6 || digits > 8) {
    throw new Error("Invalid TOTP digit length");
  }
  if (!Number.isInteger(periodSeconds) || periodSeconds < 15 || periodSeconds > 120) {
    throw new Error("Invalid TOTP period");
  }

  const normalizedSecret = normalizeBase32Secret(secret);
  assertValidBase32Secret(normalizedSecret);
  const counter = Math.floor(timestampMs / 1000 / periodSeconds);
  return hotp(base32Decode(normalizedSecret), counter, digits);
};

export const verifyTotpCode = (
  secret: string,
  code: string,
  options?: {
    timestampMs?: number;
    periodSeconds?: number;
    digits?: number;
    window?: number;
  },
): boolean => {
  const normalizedCode = normalizeTotpCode(code);
  if (!normalizedCode) {
    return false;
  }

  const timestampMs = options?.timestampMs ?? Date.now();
  const periodSeconds = options?.periodSeconds ?? DEFAULT_PERIOD_SECONDS;
  const digits = options?.digits ?? DEFAULT_DIGITS;
  const window = Math.max(0, Math.min(options?.window ?? DEFAULT_VERIFY_WINDOW, 5));

  for (let step = -window; step <= window; step += 1) {
    const candidate = generateTotpCode(secret, {
      timestampMs: timestampMs + step * periodSeconds * 1000,
      periodSeconds,
      digits,
    });
    if (candidate === normalizedCode) {
      return true;
    }
  }

  return false;
};

export const buildTotpOtpauthUri = (params: {
  issuer: string;
  accountName: string;
  secret: string;
  digits?: number;
  periodSeconds?: number;
}): string => {
  const issuer = params.issuer.trim();
  const accountName = params.accountName.trim();
  const digits = params.digits ?? DEFAULT_DIGITS;
  const periodSeconds = params.periodSeconds ?? DEFAULT_PERIOD_SECONDS;
  const normalizedSecret = normalizeBase32Secret(params.secret);
  assertValidBase32Secret(normalizedSecret);

  if (!issuer || !accountName) {
    throw new Error("Issuer and account name are required");
  }

  const encodedIssuer = encodeURIComponent(issuer);
  const encodedAccount = encodeURIComponent(accountName);

  return `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${normalizedSecret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=${digits}&period=${periodSeconds}`;
};

export const encryptTotpSecret = (secret: string): string => {
  const normalizedSecret = normalizeBase32Secret(secret);
  assertValidBase32Secret(normalizedSecret);

  const iv = randomBytes(ENCRYPTION_IV_BYTES);
  const key = resolveEncryptionKey();
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(normalizedSecret, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64url")}.${encrypted.toString("base64url")}.${authTag.toString("base64url")}`;
};

export const decryptTotpSecret = (payload: string): string | null => {
  try {
    const [ivPart, encryptedPart, authTagPart] = payload.split(".");
    if (!ivPart || !encryptedPart || !authTagPart) {
      return null;
    }

    const iv = Buffer.from(ivPart, "base64url");
    const encrypted = Buffer.from(encryptedPart, "base64url");
    const authTag = Buffer.from(authTagPart, "base64url");

    const key = resolveEncryptionKey();
    const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");

    const normalized = normalizeBase32Secret(decrypted);
    assertValidBase32Secret(normalized);
    return normalized;
  } catch {
    return null;
  }
};
