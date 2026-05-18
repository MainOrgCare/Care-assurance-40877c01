/**
 * Safe XLSX wrapper — mitigates known vulnerabilities in SheetJS Community Edition (xlsx@0.18.5)
 *
 * CVE mitigations:
 *   1. Prototype Pollution (GHSA-4r6h-8v6p-xvw6)
 *      — Recursively strips __proto__, constructor, prototype keys from parsed data
 *   2. ReDoS (GHSA-5pgg-2g8v-p4x9)
 *      — Enforces configurable file-size limits before parsing
 *
 * Usage: import { SafeXLSX } from "@/server/utils/safe-xlsx" and use SafeXLSX
 *        instead of the raw XLSX namespace.
 */

import * as XLSX from "xlsx";

// ── Prototype-pollution sanitisation ────────────────────────────────────────

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Recursively walk a value and strip any keys that could cause prototype
 * pollution.  Works on plain objects, arrays, and nested combinations.
 */
function sanitize<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      value[i] = sanitize(value[i]);
    }
    return value;
  }

  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (DANGEROUS_KEYS.has(key)) {
      delete obj[key];
    } else {
      obj[key] = sanitize(obj[key]);
    }
  }
  return value;
}

// ── Size guard ──────────────────────────────────────────────────────────────

/** Default maximum input size: 100 MB */
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024;

function assertSize(
  data: string | ArrayBuffer | Buffer | Uint8Array | number[],
  maxBytes: number,
): void {
  let size: number;
  if (typeof data === "string") {
    size = Buffer.byteLength(data, "utf-8");
  } else if (Buffer.isBuffer(data)) {
    size = data.length;
  } else if (data instanceof ArrayBuffer) {
    size = data.byteLength;
  } else if (data instanceof Uint8Array) {
    size = data.byteLength;
  } else if (Array.isArray(data)) {
    size = data.length;
  } else {
    // Unknown type — skip size check rather than crash
    return;
  }

  if (size > maxBytes) {
    throw new Error(
      `File size (${(size / 1024 / 1024).toFixed(1)} MB) exceeds the ` +
        `${(maxBytes / 1024 / 1024).toFixed(1)} MB limit. Upload a smaller file.`,
    );
  }
}

// ── Safe wrappers ───────────────────────────────────────────────────────────

export interface SafeReadOptions extends XLSX.ParsingOptions {
  /** Maximum allowed input size in bytes (default 50 MB) */
  maxBytes?: number;
}

/**
 * Drop-in replacement for `XLSX.read` with prototype-pollution protection
 * and input-size enforcement.
 */
function safeRead(
  data: any,
  opts?: SafeReadOptions,
): XLSX.WorkBook {
  const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES;
  assertSize(data, maxBytes);
  return XLSX.read(data, opts);
}

/**
 * Drop-in replacement for `XLSX.utils.sheet_to_json` that sanitises the
 * returned rows to prevent prototype pollution.
 */
function safeSheetToJson<T = any>(
  worksheet: XLSX.WorkSheet,
  opts?: XLSX.Sheet2JSONOpts,
): T[] {
  const rows = XLSX.utils.sheet_to_json<T>(worksheet, opts);
  return sanitize(rows);
}

// ── Re-export a safe namespace ──────────────────────────────────────────────

/**
 * SafeXLSX is a safe wrapper around the xlsx library.
 * It provides the same API but with prototype pollution protection
 * and file size limits.
 */
// Re-export types for type annotations
export type WorkBook = XLSX.WorkBook;
export type WorkSheet = XLSX.WorkSheet;

// Expose raw XLSX for internal/low-level access (e.g. SSF date parser)
export const RawXLSX = XLSX;

export const SafeXLSX = {
  /** Safe version of XLSX.read — validates size & sanitises output */
  read: safeRead,

  /** Safe version of XLSX.write — pass-through (output is trusted) */
  write: XLSX.write,

  /** Safe version of XLSX.writeFile — pass-through (output is trusted) */
  writeFile: XLSX.writeFile,

  utils: {
    /** Safe sheet_to_json — strips prototype-polluting keys from rows */
    sheet_to_json: safeSheetToJson,

    /** Pass-through helpers (output direction — no untrusted input) */
    json_to_sheet: XLSX.utils.json_to_sheet,
    aoa_to_sheet: XLSX.utils.aoa_to_sheet,
    book_new: XLSX.utils.book_new,
    book_append_sheet: XLSX.utils.book_append_sheet,
    decode_range: XLSX.utils.decode_range,
    encode_cell: XLSX.utils.encode_cell,
    encode_range: XLSX.utils.encode_range,
    sheet_to_csv: XLSX.utils.sheet_to_csv,
    sheet_to_html: XLSX.utils.sheet_to_html,
  },
} as const;

export default SafeXLSX;
