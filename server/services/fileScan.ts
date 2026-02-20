import crypto from "crypto";
import CloudmersiveVirusApiClient from "cloudmersive-virus-api-client";

const defaultClient = CloudmersiveVirusApiClient.ApiClient.instance;
const Apikey = defaultClient.authentications["Apikey"];
Apikey.apiKey = process.env.CLOUDMERSIVE_API_KEY;

const apiInstance = new CloudmersiveVirusApiClient.ScanApi();

export interface ScanResult {
  isClean: boolean;
  scanResult: "clean" | "threat";
  threatsFound: string | null;
  fileHash: string;
  cached: boolean;
}

export interface FileMetadata {
  filename: string;
  size: number;
  buffer: Buffer;
}

const scanCache = new Map<string, { result: ScanResult; timestamp: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function computeFileHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function cleanCache(): void {
  const now = Date.now();
  for (const [hash, entry] of Array.from(scanCache.entries())) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      scanCache.delete(hash);
    }
  }
}

export async function scanFile(metadata: FileMetadata): Promise<ScanResult> {
  const fileHash = computeFileHash(metadata.buffer);

  cleanCache();
  const cached = scanCache.get(fileHash);
  if (cached) {
    return { ...cached.result, cached: true };
  }

  if (!process.env.CLOUDMERSIVE_API_KEY) {
    // In production, fail closed - reject uploads without virus scanning
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Virus scanning required but CLOUDMERSIVE_API_KEY not configured');
    }
    // In development, warn but allow (fail open)
    console.warn("CLOUDMERSIVE_API_KEY not set - skipping virus scan (development only)");
    return {
      isClean: true,
      scanResult: "clean",
      threatsFound: null,
      fileHash,
      cached: false,
    };
  }

  const SCAN_TIMEOUT_MS = 30_000; // 30 second timeout to prevent hanging promises

  return Promise.race([
    new Promise<ScanResult>((resolve, reject) => {
      apiInstance.scanFile(metadata.buffer, (error: any, data: any) => {
        if (error) {
          console.error("Cloudmersive scan error:", error);
          reject(new Error(`Virus scan failed: ${error.message || "Unknown error"}`));
          return;
        }

        const isClean = data.CleanResult === true;
        const result: ScanResult = {
          isClean,
          scanResult: isClean ? "clean" : "threat",
          threatsFound: isClean ? null : JSON.stringify(data.FoundViruses || []),
          fileHash,
          cached: false,
        };

        // Cap cache at 1000 entries to prevent memory exhaustion
        if (scanCache.size >= 1000) cleanCache();
        scanCache.set(fileHash, { result, timestamp: Date.now() });

        resolve(result);
      });
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Virus scan timed out after 30s")), SCAN_TIMEOUT_MS)
    ),
  ]);
}

export function getCachedScan(fileHash: string): ScanResult | null {
  cleanCache();
  const cached = scanCache.get(fileHash);
  return cached ? { ...cached.result, cached: true } : null;
}
