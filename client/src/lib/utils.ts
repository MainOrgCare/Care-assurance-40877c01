import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", bytes);
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
