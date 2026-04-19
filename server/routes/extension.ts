/**
 * Extension API Routes — Browser Extension Integration
 *
 * Endpoints for the CareAssurance Edge browser extension to:
 *  - Check connection status and available features
 *  - Retrieve service user data for autofill
 *  - Download/manage extension packages
 *  - Access risk assessments and care plans
 *
 * All endpoints require authentication. Admin endpoints for package
 * management additionally require admin role.
 */

import type { Express, Request, Response } from "express";
import path from "node:path";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { storage } from "../storage";
import { safeErrorMessage } from "../utils/safeError";
import type { RiskAssessmentLog, AnalyzedServiceUser, AccessCarePlanningServiceUser } from "@shared/schema";

const execFileAsync = promisify(execFile);

// ── Extension Package Management ──────────────────────────────────────

const EXTENSION_PACKAGE_CANDIDATES = [
  path.resolve(process.cwd(), "dist", "edge-acp-autofill.zip"),
  path.resolve(process.cwd(), "edge-acp-autofill.zip"),
] as const;
const EXTENSION_CRX_CANDIDATES = [
  path.resolve(process.cwd(), "dist", "edge-acp-autofill.crx"),
  path.resolve(process.cwd(), "edge-acp-autofill.crx"),
] as const;
const EXTENSION_SOURCE_DIR = path.resolve(process.cwd(), "extension", "edge-acp-autofill");
const EXTENSION_MANIFEST_PATH = path.resolve(EXTENSION_SOURCE_DIR, "manifest.json");
const EXTENSION_PACKAGE_SCRIPT = path.resolve(process.cwd(), "script", "package-extension.mjs");
const ACP_DASHBOARD_BASE_URL = "https://clece.mobizio.com/eoutcomeservice/branch/case_dashboard?id=";
const EXTENSION_RUNTIME_CONFIG_KEY = "extension_runtime_config";
const EXTENSION_RUNTIME_CONFIG_CACHE_TTL_MS = 10_000;

interface ExtensionRuntimeConfig {
  version: number;
  careAssurance: {
    defaultOriginHost: string;
    knownHosts: string[];
    workspaceToApiHosts: Record<string, string>;
  };
  popup: {
    defaultServiceDataGroupId: string;
    autoCollect: {
      documentServiceId: string;
      documentListPath: string;
      initialAssessmentServiceDataGroupId: string;
      initialAssessmentPath: string;
      carePlanDashboardPath: string;
      recencyFirstSections: string[];
      latestSelectionSections: string[];
    };
  };
  background: {
    keepAliveIntervalMs: number;
    formCompletionFallbackDelayMs: number;
    advanceDedupeWindowMs: number;
  };
  meta: {
    updatedAt: string | null;
    updatedBy: string | null;
  };
}

const EXTENSION_RUNTIME_CONFIG_FALLBACK: ExtensionRuntimeConfig = {
  version: 1,
  careAssurance: {
    defaultOriginHost: "careassurance.uk",
    knownHosts: [
      "careassurance.uk",
      "www.careassurance.uk",
      "care-assurance.onrender.com",
      "care-assurance-api.onrender.com",
      "care-assurance-web.onrender.com",
      "localhost:5000",
      "localhost:3000",
    ],
    workspaceToApiHosts: {
      "careassurance.uk": "care-assurance-api.onrender.com",
      "www.careassurance.uk": "care-assurance-api.onrender.com",
      "care-assurance-web.onrender.com": "care-assurance-api.onrender.com",
    },
  },
  popup: {
    defaultServiceDataGroupId: "1017650",
    autoCollect: {
      documentServiceId: "1000801",
      documentListPath: "/case_document_list",
      initialAssessmentServiceDataGroupId: "1014998",
      initialAssessmentPath: "/case_data_group",
      carePlanDashboardPath: "/eoutcomeservice/branch/case_care_plans_dashboard",
      recencyFirstSections: ["initialAssessment", "carePlan", "additionalDocuments"],
      latestSelectionSections: ["initialAssessment", "carePlan", "additionalDocuments"],
    },
  },
  background: {
    keepAliveIntervalMs: 25000,
    formCompletionFallbackDelayMs: 6000,
    advanceDedupeWindowMs: 120000,
  },
  meta: {
    updatedAt: null,
    updatedBy: null,
  },
};

let extensionRuntimeConfigCache: ExtensionRuntimeConfig | null = null;
let extensionRuntimeConfigCachedAt = 0;

function normalizeRuntimeConfigString(value: unknown, fallback: string): string {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function normalizeRuntimeConfigPath(value: unknown, fallback: string): string {
  const normalized = normalizeRuntimeConfigString(value, fallback);
  if (!normalized) return fallback;
  return normalized.startsWith("/") ? normalized : `/${normalized.replace(/^\/+/, "")}`;
}

function normalizeRuntimeConfigInteger(
  value: unknown,
  fallback: number,
  { min = 1, max = Number.MAX_SAFE_INTEGER }: { min?: number; max?: number } = {},
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.round(parsed);
  if (rounded < min) return fallback;
  return Math.min(max, rounded);
}

function normalizeRuntimeConfigStringArray(
  value: unknown,
  fallback: string[],
  { lowerCase = false }: { lowerCase?: boolean } = {},
): string[] {
  const source = Array.isArray(value) ? value : fallback;
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const entry of source) {
    const nextValue = String(entry ?? "").trim();
    if (!nextValue) continue;
    const finalValue = lowerCase ? nextValue.toLowerCase() : nextValue;
    const dedupeKey = finalValue.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    normalized.push(finalValue);
  }

  return normalized.length > 0 ? normalized : [...fallback];
}

function normalizeRuntimeConfigHostMap(
  value: unknown,
  fallback: Record<string, string>,
): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...fallback };
  }

  const normalized: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = String(rawKey ?? "").trim().toLowerCase();
    const nextValue = String(rawValue ?? "").trim().toLowerCase();
    if (!key || !nextValue) continue;
    normalized[key] = nextValue;
  }

  return Object.keys(normalized).length > 0 ? normalized : { ...fallback };
}

function normalizeExtensionRuntimeConfig(rawValue: unknown): ExtensionRuntimeConfig {
  const raw = rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)
    ? (rawValue as Record<string, unknown>)
    : {};
  const rawCareAssurance = raw.careAssurance && typeof raw.careAssurance === "object" && !Array.isArray(raw.careAssurance)
    ? (raw.careAssurance as Record<string, unknown>)
    : {};
  const rawPopup = raw.popup && typeof raw.popup === "object" && !Array.isArray(raw.popup)
    ? (raw.popup as Record<string, unknown>)
    : {};
  const rawAutoCollect = rawPopup.autoCollect && typeof rawPopup.autoCollect === "object" && !Array.isArray(rawPopup.autoCollect)
    ? (rawPopup.autoCollect as Record<string, unknown>)
    : {};
  const rawBackground = raw.background && typeof raw.background === "object" && !Array.isArray(raw.background)
    ? (raw.background as Record<string, unknown>)
    : {};
  const rawMeta = raw.meta && typeof raw.meta === "object" && !Array.isArray(raw.meta)
    ? (raw.meta as Record<string, unknown>)
    : {};

  const defaultOriginHost = normalizeRuntimeConfigString(
    rawCareAssurance.defaultOriginHost,
    EXTENSION_RUNTIME_CONFIG_FALLBACK.careAssurance.defaultOriginHost,
  ).toLowerCase();

  const knownHosts = normalizeRuntimeConfigStringArray(
    rawCareAssurance.knownHosts,
    EXTENSION_RUNTIME_CONFIG_FALLBACK.careAssurance.knownHosts,
    { lowerCase: true },
  );

  if (!knownHosts.includes(defaultOriginHost)) {
    knownHosts.unshift(defaultOriginHost);
  }

  return {
    version: normalizeRuntimeConfigInteger(raw.version, EXTENSION_RUNTIME_CONFIG_FALLBACK.version, { min: 1, max: 99 }),
    careAssurance: {
      defaultOriginHost,
      knownHosts,
      workspaceToApiHosts: normalizeRuntimeConfigHostMap(
        rawCareAssurance.workspaceToApiHosts,
        EXTENSION_RUNTIME_CONFIG_FALLBACK.careAssurance.workspaceToApiHosts,
      ),
    },
    popup: {
      defaultServiceDataGroupId: normalizeRuntimeConfigString(
        rawPopup.defaultServiceDataGroupId,
        EXTENSION_RUNTIME_CONFIG_FALLBACK.popup.defaultServiceDataGroupId,
      ),
      autoCollect: {
        documentServiceId: normalizeRuntimeConfigString(
          rawAutoCollect.documentServiceId,
          EXTENSION_RUNTIME_CONFIG_FALLBACK.popup.autoCollect.documentServiceId,
        ),
        documentListPath: normalizeRuntimeConfigPath(
          rawAutoCollect.documentListPath,
          EXTENSION_RUNTIME_CONFIG_FALLBACK.popup.autoCollect.documentListPath,
        ),
        initialAssessmentServiceDataGroupId: normalizeRuntimeConfigString(
          rawAutoCollect.initialAssessmentServiceDataGroupId,
          EXTENSION_RUNTIME_CONFIG_FALLBACK.popup.autoCollect.initialAssessmentServiceDataGroupId,
        ),
        initialAssessmentPath: normalizeRuntimeConfigPath(
          rawAutoCollect.initialAssessmentPath,
          EXTENSION_RUNTIME_CONFIG_FALLBACK.popup.autoCollect.initialAssessmentPath,
        ),
        carePlanDashboardPath: normalizeRuntimeConfigPath(
          rawAutoCollect.carePlanDashboardPath,
          EXTENSION_RUNTIME_CONFIG_FALLBACK.popup.autoCollect.carePlanDashboardPath,
        ),
        recencyFirstSections: normalizeRuntimeConfigStringArray(
          rawAutoCollect.recencyFirstSections,
          EXTENSION_RUNTIME_CONFIG_FALLBACK.popup.autoCollect.recencyFirstSections,
        ),
        latestSelectionSections: normalizeRuntimeConfigStringArray(
          rawAutoCollect.latestSelectionSections,
          EXTENSION_RUNTIME_CONFIG_FALLBACK.popup.autoCollect.latestSelectionSections,
        ),
      },
    },
    background: {
      keepAliveIntervalMs: normalizeRuntimeConfigInteger(
        rawBackground.keepAliveIntervalMs,
        EXTENSION_RUNTIME_CONFIG_FALLBACK.background.keepAliveIntervalMs,
        { min: 5000, max: 300000 },
      ),
      formCompletionFallbackDelayMs: normalizeRuntimeConfigInteger(
        rawBackground.formCompletionFallbackDelayMs,
        EXTENSION_RUNTIME_CONFIG_FALLBACK.background.formCompletionFallbackDelayMs,
        { min: 1000, max: 60000 },
      ),
      advanceDedupeWindowMs: normalizeRuntimeConfigInteger(
        rawBackground.advanceDedupeWindowMs,
        EXTENSION_RUNTIME_CONFIG_FALLBACK.background.advanceDedupeWindowMs,
        { min: 10000, max: 600000 },
      ),
    },
    meta: {
      updatedAt: typeof rawMeta.updatedAt === "string" ? rawMeta.updatedAt : null,
      updatedBy: typeof rawMeta.updatedBy === "string" ? rawMeta.updatedBy : null,
    },
  };
}

async function getExtensionRuntimeConfigRecord(forceRefresh = false): Promise<{
  config: ExtensionRuntimeConfig;
  defaults: ExtensionRuntimeConfig;
  source: "default" | "stored";
}> {
  const isFresh = Date.now() - extensionRuntimeConfigCachedAt < EXTENSION_RUNTIME_CONFIG_CACHE_TTL_MS;
  if (!forceRefresh && extensionRuntimeConfigCache && isFresh) {
    return {
      config: extensionRuntimeConfigCache,
      defaults: EXTENSION_RUNTIME_CONFIG_FALLBACK,
      source: "stored",
    };
  }

  const rawValue = await storage.getAppSetting(EXTENSION_RUNTIME_CONFIG_KEY);
  if (!rawValue) {
    extensionRuntimeConfigCache = normalizeExtensionRuntimeConfig(EXTENSION_RUNTIME_CONFIG_FALLBACK);
    extensionRuntimeConfigCachedAt = Date.now();
    return {
      config: extensionRuntimeConfigCache,
      defaults: EXTENSION_RUNTIME_CONFIG_FALLBACK,
      source: "default",
    };
  }

  try {
    extensionRuntimeConfigCache = normalizeExtensionRuntimeConfig(JSON.parse(rawValue));
  } catch {
    extensionRuntimeConfigCache = normalizeExtensionRuntimeConfig(EXTENSION_RUNTIME_CONFIG_FALLBACK);
  }
  extensionRuntimeConfigCachedAt = Date.now();
  return {
    config: extensionRuntimeConfigCache,
    defaults: EXTENSION_RUNTIME_CONFIG_FALLBACK,
    source: "stored",
  };
}

async function updateExtensionRuntimeConfigRecord(
  nextRawConfig: unknown,
  updatedBy?: string | null,
): Promise<{
  config: ExtensionRuntimeConfig;
  defaults: ExtensionRuntimeConfig;
  source: "stored";
}> {
  const currentRecord = await getExtensionRuntimeConfigRecord(true);
  const current = currentRecord.config;
  const nextRaw = nextRawConfig && typeof nextRawConfig === "object" && !Array.isArray(nextRawConfig)
    ? (nextRawConfig as Record<string, unknown>)
    : {};
  const nextCareAssurance = nextRaw.careAssurance && typeof nextRaw.careAssurance === "object" && !Array.isArray(nextRaw.careAssurance)
    ? (nextRaw.careAssurance as Record<string, unknown>)
    : {};
  const nextPopup = nextRaw.popup && typeof nextRaw.popup === "object" && !Array.isArray(nextRaw.popup)
    ? (nextRaw.popup as Record<string, unknown>)
    : {};
  const nextAutoCollect = nextPopup.autoCollect && typeof nextPopup.autoCollect === "object" && !Array.isArray(nextPopup.autoCollect)
    ? (nextPopup.autoCollect as Record<string, unknown>)
    : {};
  const nextBackground = nextRaw.background && typeof nextRaw.background === "object" && !Array.isArray(nextRaw.background)
    ? (nextRaw.background as Record<string, unknown>)
    : {};

  const merged = normalizeExtensionRuntimeConfig({
    ...current,
    ...nextRaw,
    careAssurance: {
      ...current.careAssurance,
      ...nextCareAssurance,
    },
    popup: {
      ...current.popup,
      ...nextPopup,
      autoCollect: {
        ...current.popup.autoCollect,
        ...nextAutoCollect,
      },
    },
    background: {
      ...current.background,
      ...nextBackground,
    },
    meta: {
      updatedAt: new Date().toISOString(),
      updatedBy: updatedBy ?? null,
    },
  });

  await storage.setAppSetting(EXTENSION_RUNTIME_CONFIG_KEY, JSON.stringify(merged), updatedBy ?? undefined);
  extensionRuntimeConfigCache = merged;
  extensionRuntimeConfigCachedAt = Date.now();

  return {
    config: merged,
    defaults: EXTENSION_RUNTIME_CONFIG_FALLBACK,
    source: "stored",
  };
}

function buildAcpDashboardUrl(accessCarePlanningId: string): string {
  return `${ACP_DASHBOARD_BASE_URL}${encodeURIComponent(accessCarePlanningId)}`;
}

/** Attempt to build the zip via the canonical packaging script (preferred). */
async function packageExtensionZipViaScript(): Promise<boolean> {
  try {
    await fs.access(EXTENSION_PACKAGE_SCRIPT);
  } catch {
    return false;
  }
  try {
    await execFileAsync(process.execPath, [EXTENSION_PACKAGE_SCRIPT], {
      cwd: process.cwd(),
      timeout: 120000,
    });
    return true;
  } catch (error: unknown) {
    console.warn("Extension packaging script failed:", error);
    return false;
  }
}

/** Fallback: build the zip using the system `zip` command. */
async function packageExtensionZipViaShell(): Promise<boolean> {
  try {
    await fs.access(EXTENSION_SOURCE_DIR);
  } catch {
    return false;
  }
  const outPath = path.resolve(process.cwd(), "dist", "edge-acp-autofill.zip");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  try {
    await fs.unlink(outPath).catch(() => {});
    await execFileAsync("zip", ["-r", outPath, "."], {
      cwd: EXTENSION_SOURCE_DIR,
      timeout: 120000,
    });
    return true;
  } catch {
    return false;
  }
}

async function packageExtensionZip(): Promise<boolean> {
  if (await packageExtensionZipViaScript()) return true;
  if (await packageExtensionZipViaShell()) return true;
  return false;
}

async function resolveExtensionPackagePath(): Promise<string | null> {
  for (const candidate of EXTENSION_PACKAGE_CANDIDATES) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Keep checking fallback locations.
    }
  }
  return null;
}

async function resolveExtensionCrxPath(): Promise<string | null> {
  for (const candidate of EXTENSION_CRX_CANDIDATES) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Keep checking fallback locations.
    }
  }
  return null;
}

async function readExtensionManifestVersion(): Promise<string | null> {
  try {
    const manifestRaw = await fs.readFile(EXTENSION_MANIFEST_PATH, "utf8");
    const manifest = JSON.parse(manifestRaw) as Record<string, unknown>;
    return typeof manifest.version === "string" ? manifest.version : null;
  } catch (error: unknown) {
    console.warn("Failed to read extension manifest version:", error);
    return null;
  }
}

function incrementExtensionPatchVersion(version: string): string {
  const match = String(version || "").trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Unsupported extension version format: ${version || "unknown"}`);
  }

  const [, major, minor, patch] = match;
  return `${major}.${minor}.${Number.parseInt(patch, 10) + 1}`;
}

async function bumpExtensionManifestVersion(): Promise<{
  previousVersion: string;
  nextVersion: string;
  restore: () => Promise<void>;
}> {
  const manifestRaw = await fs.readFile(EXTENSION_MANIFEST_PATH, "utf8");
  const manifest = JSON.parse(manifestRaw) as Record<string, unknown>;
  const previousVersion = typeof manifest.version === "string" ? manifest.version : null;

  if (!previousVersion) {
    throw new Error("Extension manifest version is missing.");
  }

  const nextVersion = incrementExtensionPatchVersion(previousVersion);
  manifest.version = nextVersion;
  await fs.writeFile(EXTENSION_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return {
    previousVersion,
    nextVersion,
    restore: async () => {
      await fs.writeFile(EXTENSION_MANIFEST_PATH, manifestRaw, "utf8");
    },
  };
}

async function getLatestSourceMtimeMs(rootDir: string): Promise<number> {
  let latest = 0;
  const ignoredDirs = new Set([".git", "node_modules", "dist", "__pycache__"]);

  const walk = async (currentDir: string): Promise<void> => {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          if (!ignoredDirs.has(entry.name)) {
            await walk(fullPath);
          }
          return;
        }
        if (!entry.isFile()) return;
        const stat = await fs.stat(fullPath);
        if (stat.mtimeMs > latest) latest = stat.mtimeMs;
      })
    );
  };

  try {
    await walk(rootDir);
  } catch (error: unknown) {
    console.warn("Failed to inspect extension source timestamps:", error);
    return 0;
  }
  return latest;
}

async function isExtensionPackageStale(packagePath: string): Promise<boolean> {
  try {
    const [packageStat, latestSourceMtimeMs] = await Promise.all([
      fs.stat(packagePath),
      getLatestSourceMtimeMs(EXTENSION_SOURCE_DIR),
    ]);
    if (!latestSourceMtimeMs) return false;
    return packageStat.mtimeMs < latestSourceMtimeMs;
  } catch (error: unknown) {
    console.warn("Failed to compare extension package freshness:", error);
    return false;
  }
}

async function ensureLatestExtensionPackage(forceBuild: boolean): Promise<{ packagePath: string | null; rebuilt: boolean }> {
  let rebuilt = false;
  if (forceBuild) {
    const success = await packageExtensionZip();
    if (success) {
      rebuilt = true;
    }
  }

  let packagePath = await resolveExtensionPackagePath();
  if (!packagePath) {
    const success = await packageExtensionZip();
    if (success) {
      rebuilt = true;
      packagePath = await resolveExtensionPackagePath();
    }
  }

  if (packagePath && !forceBuild) {
    const stale = await isExtensionPackageStale(packagePath);
    if (stale) {
      const success = await packageExtensionZip();
      if (success) {
        rebuilt = true;
        packagePath = await resolveExtensionPackagePath();
      }
    }
  }

  return { packagePath, rebuilt };
}

async function getExtensionPackageMetadata(options: { forceBuild: boolean; updateVersion?: boolean }): Promise<{
  packagePath: string;
  filename: string;
  sizeBytes: number;
  sha256: string;
  packagedAt: string;
  manifestVersion: string | null;
  previousManifestVersion: string | null;
  versionUpdated: boolean;
  rebuilt: boolean;
} | null> {
  const { forceBuild, updateVersion = false } = options;
  let manifestVersion = await readExtensionManifestVersion();
  let previousManifestVersion: string | null = null;
  let versionUpdated = false;
  let restoreManifestVersion: (() => Promise<void>) | null = null;

  try {
    if (updateVersion) {
      const bumpedManifest = await bumpExtensionManifestVersion();
      previousManifestVersion = bumpedManifest.previousVersion;
      manifestVersion = bumpedManifest.nextVersion;
      versionUpdated = bumpedManifest.nextVersion !== bumpedManifest.previousVersion;
      restoreManifestVersion = bumpedManifest.restore;
    }

    const { packagePath, rebuilt } = await ensureLatestExtensionPackage(forceBuild || updateVersion);
    if (!packagePath) {
      if (restoreManifestVersion) {
        await restoreManifestVersion().catch((restoreError) => {
          console.warn("Failed to restore extension manifest version after package miss:", restoreError);
        });
      }
      return null;
    }

    const [packageStat, packageBuffer] = await Promise.all([fs.stat(packagePath), fs.readFile(packagePath)]);
    const sha256 = createHash("sha256").update(packageBuffer).digest("hex");

    return {
      packagePath,
      filename: path.basename(packagePath),
      sizeBytes: packageStat.size,
      sha256,
      packagedAt: packageStat.mtime.toISOString(),
      manifestVersion,
      previousManifestVersion,
      versionUpdated,
      rebuilt,
    };
  } catch (error) {
    if (restoreManifestVersion) {
      await restoreManifestVersion().catch((restoreError) => {
        console.warn("Failed to restore extension manifest version after packaging error:", restoreError);
      });
    }
    throw error;
  }
}

// ── Route Registration ────────────────────────────────────────────────

interface ExtensionRouteDeps {
  requireAuth: any;
  requireAdmin: any;
}

export function registerExtensionRoutes(
  app: Express,
  deps: ExtensionRouteDeps
): void {
  const { requireAuth, requireAdmin } = deps;

  // Get extension status and connection info
  app.get("/api/extension/status", requireAuth, async (req: any, res) => {
    try {
      const manifestVersion = await readExtensionManifestVersion();
      return res.json({
        connected: true,
        version: manifestVersion || "0.3.4",
        user: {
          id: req.user?.id,
          username: req.user?.username,
          role: req.user?.role
        },
        features: {
          riskAssessment: true,
          carePlan: true,
          initialAssessment: true,
          emarAudit: true
        }
      });
    } catch (error: unknown) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to get extension status") });
    }
  });

  app.get("/api/extension/runtime-config", requireAuth, async (_req: any, res) => {
    try {
      const record = await getExtensionRuntimeConfigRecord();
      res.setHeader("Cache-Control", "no-store");
      return res.json({
        config: record.config,
        updatedAt: record.config.meta.updatedAt,
        updatedBy: record.config.meta.updatedBy,
        source: record.source,
      });
    } catch (error: unknown) {
      console.error("Extension runtime config error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load extension runtime config") });
    }
  });

  // Admin-only metadata endpoint to verify extension package freshness
  app.get("/api/admin/extension/info", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const forceBuild = String(req.query?.fresh || req.query?.rebuild || "").toLowerCase() === "1";
      const updateVersion = String(req.query?.update || "").toLowerCase() === "1";
      const metadata = await getExtensionPackageMetadata({ forceBuild, updateVersion });
      if (!metadata) {
        return res.status(404).json({
          message:
            "Extension package is unavailable. The extension source files are not present in this installation.",
        });
      }

      res.setHeader("Cache-Control", "no-store");
      const crxPath = await resolveExtensionCrxPath();
      return res.json({
        manifestVersion: metadata.manifestVersion,
        previousManifestVersion: metadata.previousManifestVersion,
        versionUpdated: metadata.versionUpdated,
        downloadUrl: "/api/admin/extension/package?fresh=1",
        crxDownloadUrl: crxPath ? "/api/admin/extension/package.crx?fresh=1" : null,
        package: {
          available: true,
          filename: metadata.filename,
          sizeBytes: metadata.sizeBytes,
          sha256: metadata.sha256,
          packagedAt: metadata.packagedAt,
          rebuilt: metadata.rebuilt,
        },
        crx: {
          available: crxPath !== null,
        },
      });
    } catch (error: unknown) {
      console.error("Extension package metadata error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load extension package metadata") });
    }
  });

  app.get("/api/admin/extension/runtime-config", requireAuth, requireAdmin, async (_req: any, res) => {
    try {
      const record = await getExtensionRuntimeConfigRecord();
      res.setHeader("Cache-Control", "no-store");
      return res.json({
        config: record.config,
        defaults: record.defaults,
        updatedAt: record.config.meta.updatedAt,
        updatedBy: record.config.meta.updatedBy,
        source: record.source,
      });
    } catch (error: unknown) {
      console.error("Admin extension runtime config error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load extension runtime config") });
    }
  });

  app.put("/api/admin/extension/runtime-config", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const rawConfig = req.body?.config ?? req.body;
      if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
        return res.status(400).json({ message: "Runtime config must be a JSON object." });
      }

      const record = await updateExtensionRuntimeConfigRecord(rawConfig, req.user?.username || req.user?.id || null);

      storage
        .createSystemLog({
          eventType: "extension_runtime_config_updated",
          userId: req.user?.id,
          username: req.user?.username,
          serviceUserInitials: null,
          details: {
            action: "Updated extension runtime config",
            target: EXTENSION_RUNTIME_CONFIG_KEY,
            status: "Success",
            updatedAt: record.config.meta.updatedAt,
          },
        })
        .catch(() => {});

      res.setHeader("Cache-Control", "no-store");
      return res.json({
        message: "Extension runtime config updated",
        config: record.config,
        defaults: record.defaults,
        updatedAt: record.config.meta.updatedAt,
        updatedBy: record.config.meta.updatedBy,
        source: record.source,
      });
    } catch (error: unknown) {
      console.error("Admin extension runtime config update error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to update extension runtime config") });
    }
  });

  // Admin-only direct package download for browser extension rollout
  app.get("/api/admin/extension/package", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const forceBuild = String(req.query?.fresh || req.query?.rebuild || "").toLowerCase() === "1";
      const metadata = await getExtensionPackageMetadata({ forceBuild });
      if (!metadata) {
        return res.status(404).json({
          message:
            "Extension package is unavailable. The extension source files are not present in this installation.",
        });
      }

      const versionSuffix = metadata.manifestVersion ? `-v${metadata.manifestVersion}` : "";
      const downloadName = `careassurance-edge-acp-autofill${versionSuffix}.zip`;
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Extension-Version", metadata.manifestVersion || "unknown");
      res.setHeader("X-Extension-Sha256", metadata.sha256);
      res.download(metadata.packagePath, downloadName, (downloadError) => {
        if (!downloadError || res.headersSent) return;
        console.error("Extension package download error:", downloadError);
        res.status(500).json({ message: "Failed to download extension package" });
      });
    } catch (error: unknown) {
      console.error("Extension package lookup error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to prepare extension package") });
    }
  });

  // Admin-only CRX package download for browser extension rollout
  app.get("/api/admin/extension/package.crx", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const forceBuild = String(req.query?.fresh || req.query?.rebuild || "").toLowerCase() === "1";
      if (forceBuild) {
        // packageExtensionZip invokes the canonical packaging script which always
        // rebuilds the ZIP and attempts a CRX when Chromium is available.
        await packageExtensionZip();
      }

      const [crxPath, manifestVersion] = await Promise.all([
        resolveExtensionCrxPath(),
        readExtensionManifestVersion(),
      ]);

      if (!crxPath) {
        return res.status(404).json({
          message:
            "CRX package is unavailable. Run `npm run package:extension` on the server to generate it (requires Chromium).",
        });
      }

      const [crxStat, crxBuffer] = await Promise.all([fs.stat(crxPath), fs.readFile(crxPath)]);
      const sha256 = createHash("sha256").update(crxBuffer).digest("hex");
      const versionSuffix = manifestVersion ? `-v${manifestVersion}` : "";
      const downloadName = `careassurance-edge-acp-autofill${versionSuffix}.crx`;

      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "application/x-chrome-extension");
      res.setHeader("X-Extension-Version", manifestVersion || "unknown");
      res.setHeader("X-Extension-Sha256", sha256);
      res.setHeader("X-Content-Length", String(crxStat.size));
      res.download(crxPath, downloadName, (downloadError) => {
        if (!downloadError || res.headersSent) return;
        console.error("CRX package download error:", downloadError);
        res.status(500).json({ message: "Failed to download CRX package" });
      });
    } catch (error: unknown) {
      console.error("CRX package lookup error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to prepare CRX package") });
    }
  });

  app.get("/api/admin/extension/acp-service-users", requireAuth, requireAdmin, async (_req: any, res) => {
    try {
      const serviceUsers = await storage.getAllAccessCarePlanningServiceUsers();

      const users = serviceUsers.map((serviceUser: AccessCarePlanningServiceUser) => {
        const name = serviceUser.serviceUserName || "Unknown";
        const initials = name
          .split(" ")
          .filter(Boolean)
          .map((word) => word[0])
          .join(".") || "??";

        return {
          accessCarePlanningId: serviceUser.accessCarePlanningId,
          serviceUserName: name,
          initials,
          dashboardUrl: buildAcpDashboardUrl(serviceUser.accessCarePlanningId),
          updatedAt: serviceUser.updatedAt,
        };
      });

      return res.json({ users });
    } catch (error: unknown) {
      console.error("Admin ACP service users error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to get ACP service users") });
    }
  });

  // ACP service users for extension autofill (non-admin)
  app.get("/api/extension/acp-service-users", requireAuth, async (_req: any, res) => {
    try {
      const serviceUsers = await storage.getAllAccessCarePlanningServiceUsers();

      const users = serviceUsers.map((serviceUser: AccessCarePlanningServiceUser) => {
        const name = serviceUser.serviceUserName || "Unknown";
        const initials = name
          .split(" ")
          .filter(Boolean)
          .map((word) => word[0])
          .join(".") || "??";

        return {
          acpId: serviceUser.accessCarePlanningId,
          name,
          initials,
          updatedAt: serviceUser.updatedAt,
        };
      });

      return res.json({ users });
    } catch (error: unknown) {
      console.error("Extension ACP service users error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to get ACP service users") });
    }
  });

  // Get service users list for extension dropdown
  app.get("/api/extension/service-users", requireAuth, async (req: any, res) => {
    try {
      const serviceUsers = await storage.getAllAnalyzedServiceUsers();

      const users: Array<{
        id: string; name: string; initials: string; lastUpdated: Date | null;
        hasCarePlan: boolean; hasRiskAssessment: boolean; riskAssessmentId?: any;
        source: "analyzed" | "derived";
      }> = serviceUsers.map((su: AnalyzedServiceUser) => {
        const metadata = (su.metadata || {}) as Record<string, any>;
        const name = su.serviceUserName || "Unknown";
        const initials = name.split(" ").map((w: string) => w[0]).join(".") || "??";

        return {
          id: su.id,
          name,
          initials,
          lastUpdated: su.updatedAt,
          hasCarePlan: !!metadata.enhancedPlan,
          hasRiskAssessment: !!metadata.riskAssessmentId,
          riskAssessmentId: metadata.riskAssessmentId,
          source: "analyzed" as const
        };
      });

      // If no analyzed users, aggregate unique names from audits and service orders
      if (users.length === 0) {
        const knownNames = new Set<string>();
        try {
          const [audits, orders] = await Promise.all([
            storage.getAllAudits().catch(() => []),
            storage.getAllServiceOrders().catch(() => [])
          ]);
          for (const a of audits) {
            const n = (a as any).serviceUserName;
            if (n && typeof n === "string" && n.trim()) knownNames.add(n.trim());
          }
          for (const o of orders) {
            const n = (o as any).serviceUserName;
            if (n && typeof n === "string" && n.trim()) knownNames.add(n.trim());
          }
        } catch { /* non-critical */ }

        for (const name of knownNames) {
          const initials = name.split(" ").map((w: string) => w[0]).join(".") || "??";
          users.push({
            id: name.toLowerCase().replace(/\s+/g, "-"),
            name,
            initials,
            lastUpdated: null as any,
            hasCarePlan: false,
            hasRiskAssessment: false,
            riskAssessmentId: undefined as any,
            source: "derived" as const
          });
        }
      }

      return res.json({ users });
    } catch (error: unknown) {
      console.error("Extension service users error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to get service users") });
    }
  });

  // Get specific service user data for extension
  app.get("/api/extension/service-user/:id", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const serviceUser = await storage.getAnalyzedServiceUser(id);

      if (!serviceUser) {
        return res.status(404).json({ message: "Service user not found" });
      }

      const metadata = (serviceUser.metadata || {}) as Record<string, any>;
      const name = serviceUser.serviceUserName || "Unknown";
      const initials = name.split(" ").map((w: string) => w[0]).join(".") || "??";

      return res.json({
        id: serviceUser.id,
        name,
        initials,
        enhancedPlan: metadata.enhancedPlan,
        riskAssessmentId: metadata.riskAssessmentId,
        sourceDocuments: metadata.sourceDocuments,
        lastUpdated: serviceUser.updatedAt
      });
    } catch (error: unknown) {
      console.error("Extension service user error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to get service user") });
    }
  });

  // Get risk assessment data formatted for extension autofill
  app.get("/api/extension/risk-assessment/:id", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const allLogs = await storage.getAllRiskAssessmentLogs();
      const riskAssessment = allLogs.find((log: RiskAssessmentLog) => log.id === id);

      if (!riskAssessment) {
        return res.status(404).json({ message: "Risk assessment not found" });
      }

      const selectedAssessments = (riskAssessment.selectedAssessments || []) as string[];

      const payload = {
        formType: "acp",
        serviceUser: {
          name: riskAssessment.serviceUserInitials,
          initials: riskAssessment.serviceUserInitials
        },
        assessments: selectedAssessments.map((name: string) => ({ name, riskLevel: "Medium", findings: "" })),
        metadata: {
          generatedAt: riskAssessment.createdAt,
          generatedBy: riskAssessment.performedBy
        }
      };

      return res.json(payload);
    } catch (error: unknown) {
      console.error("Extension risk assessment error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to get risk assessment") });
    }
  });

  // Get care plan data formatted for Initial Assessment autofill
  app.get("/api/extension/care-plan/:serviceUserId", requireAuth, async (req: any, res) => {
    try {
      const { serviceUserId } = req.params;
      const serviceUser = await storage.getAnalyzedServiceUser(serviceUserId);

      if (!serviceUser) {
        return res.status(404).json({ message: "Service user not found" });
      }

      const metadata = (serviceUser.metadata || {}) as Record<string, any>;

      if (!metadata.enhancedPlan) {
        return res.status(404).json({ message: "No care plan found for this service user" });
      }

      const plan = typeof metadata.enhancedPlan === "string"
        ? JSON.parse(metadata.enhancedPlan)
        : metadata.enhancedPlan;

      const name = serviceUser.serviceUserName || "Unknown";
      const initials = name.split(" ").map((w: string) => w[0]).join(".") || "??";

      const payload = {
        formType: "initialAssessment",
        formId: 1040788,
        serviceUser: { name, initials },
        thisIsMe: plan.thisIsMe || {},
        myCarePlan: plan.myCarePlan || {},
        goalSetting: plan.goalSetting || {},
        advanceDecisions: plan.advanceDecisions || {},
        riskSection1Health: plan.riskSection1Health || {},
        riskSection2Medication: plan.riskSection2Medication || {},
        riskSection3Nutrition: plan.riskSection3Nutrition || {},
        riskSection4Equipment: plan.riskSection4Equipment || {},
        riskSection5Mobility: plan.riskSection5Mobility || {},
        riskSection6Appliances: plan.riskSection6Appliances || {},
        riskSection7Fire: plan.riskSection7Fire || {},
        riskSection8COSHH: plan.riskSection8COSHH || {},
        riskSection9External: plan.riskSection9External || {},
        riskSection10Security: plan.riskSection10Security || {},
        section11Bands: plan.section11Bands || {},
        metadata: {
          generatedAt: serviceUser.updatedAt,
          sourceDocuments: metadata.sourceDocuments
        }
      };

      return res.json(payload);
    } catch (error: unknown) {
      console.error("Extension care plan error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to get care plan") });
    }
  });

}
