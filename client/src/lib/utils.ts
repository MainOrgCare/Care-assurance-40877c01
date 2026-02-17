import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Returns the API base URL configured via VITE_API_BASE_URL.
 * When the frontend and API are deployed on separate origins (e.g. Render
 * static site + Node service), native `<a href>` links must be prefixed with
 * this value so the browser navigates to the API origin instead of the static
 * site origin.
 */
export function getApiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");
}

/**
 * Resolves an API path (e.g. "/api/admin/extension/package") to a full URL
 * that works for both `<a href>` links and `fetch()` calls, regardless of
 * whether the API lives on a separate origin.
 */
export function apiHref(path: string): string {
  const base = getApiBaseUrl();
  return base ? `${base}${path}` : path;
}

/**
 * Create a simple hash from a string for deduplication purposes.
 * Uses Web Crypto API (SubtleCrypto) when available, falls back to simple hash.
 */
export async function createHash(data: string | ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = typeof data === "string"
    ? new TextEncoder().encode(data)
    : data instanceof Uint8Array
    ? data
    : new Uint8Array(data);

  if (typeof window !== "undefined" && window.crypto?.subtle) {
    const digestInput = new Uint8Array(bytes).buffer;
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", digestInput);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Fallback: simple hash function over bytes
  let hash = 0;
  for (let i = 0; i < bytes.length; i++) {
    const value = bytes[i];
    hash = ((hash << 5) - hash) + value;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(16, "0");
}
