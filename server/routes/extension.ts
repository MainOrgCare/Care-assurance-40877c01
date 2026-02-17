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
import type { RiskAssessmentLog, AnalyzedServiceUser } from "@shared/schema";

const execFileAsync = promisify(execFile);

// ── Extension Package Management ──────────────────────────────────────

const EXTENSION_PACKAGE_CANDIDATES = [
  path.resolve(process.cwd(), "dist", "edge-acp-autofill.zip"),
  path.resolve(process.cwd(), "edge-acp-autofill.zip"),
] as const;
const EXTENSION_SOURCE_DIR = path.resolve(process.cwd(), "extension", "edge-acp-autofill");
const EXTENSION_MANIFEST_PATH = path.resolve(EXTENSION_SOURCE_DIR, "manifest.json");
const EXTENSION_PACKAGE_SCRIPT = path.resolve(process.cwd(), "script", "package-extension.py");

/** Attempt to build the zip via the Python script (preferred). */
async function packageExtensionZipViaPython(): Promise<boolean> {
  try {
    await fs.access(EXTENSION_PACKAGE_SCRIPT);
  } catch {
    return false;
  }
  const pythonCandidates = ["python3", "python"] as const;
  for (const pythonCmd of pythonCandidates) {
    try {
      await execFileAsync(pythonCmd, [EXTENSION_PACKAGE_SCRIPT], {
        cwd: process.cwd(),
        timeout: 120000,
      });
      return true;
    } catch { /* try next */ }
  }
  return false;
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

async function packageExtensionZip(): Promise<void> {
  if (await packageExtensionZipViaPython()) return;
  if (await packageExtensionZipViaShell()) return;
  throw new Error(
    "Failed to package Edge extension zip. Neither Python nor the system zip command succeeded."
  );
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

async function readExtensionManifestVersion(): Promise<string | null> {
  try {
    const manifestRaw = await fs.readFile(EXTENSION_MANIFEST_PATH, "utf8");
    const manifest = JSON.parse(manifestRaw) as Record<string, unknown>;
    return typeof manifest.version === "string" ? manifest.version : null;
  } catch (error) {
    console.warn("Failed to read extension manifest version:", error);
    return null;
  }
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
  } catch (error) {
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
  } catch (error) {
    console.warn("Failed to compare extension package freshness:", error);
    return false;
  }
}

async function ensureLatestExtensionPackage(forceBuild: boolean): Promise<{ packagePath: string | null; rebuilt: boolean }> {
  let rebuilt = false;
  if (forceBuild) {
    await packageExtensionZip();
    rebuilt = true;
  }

  let packagePath = await resolveExtensionPackagePath();
  if (!packagePath) {
    await packageExtensionZip();
    rebuilt = true;
    packagePath = await resolveExtensionPackagePath();
  }

  if (packagePath && !forceBuild) {
    const stale = await isExtensionPackageStale(packagePath);
    if (stale) {
      await packageExtensionZip();
      rebuilt = true;
      packagePath = await resolveExtensionPackagePath();
    }
  }

  return { packagePath, rebuilt };
}

async function getExtensionPackageMetadata(forceBuild: boolean): Promise<{
  packagePath: string;
  filename: string;
  sizeBytes: number;
  sha256: string;
  packagedAt: string;
  manifestVersion: string | null;
  rebuilt: boolean;
} | null> {
  const manifestVersion = await readExtensionManifestVersion();
  const { packagePath, rebuilt } = await ensureLatestExtensionPackage(forceBuild);
  if (!packagePath) return null;

  const [packageStat, packageBuffer] = await Promise.all([fs.stat(packagePath), fs.readFile(packagePath)]);
  const sha256 = createHash("sha256").update(packageBuffer).digest("hex");

  return {
    packagePath,
    filename: path.basename(packagePath),
    sizeBytes: packageStat.size,
    sha256,
    packagedAt: packageStat.mtime.toISOString(),
    manifestVersion,
    rebuilt,
  };
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
      return res.json({
        connected: true,
        version: "0.2.6",
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
    } catch (error: any) {
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to get extension status") });
    }
  });

  // Admin-only metadata endpoint to verify extension package freshness
  app.get("/api/admin/extension/info", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const forceBuild = String(req.query?.fresh || req.query?.rebuild || "").toLowerCase() === "1";
      const metadata = await getExtensionPackageMetadata(forceBuild);
      if (!metadata) {
        return res.status(404).json({
          message:
            "Extension package is unavailable. Run `npm run package:extension` to generate dist/edge-acp-autofill.zip.",
        });
      }

      res.setHeader("Cache-Control", "no-store");
      return res.json({
        manifestVersion: metadata.manifestVersion,
        downloadUrl: "/api/admin/extension/package?fresh=1",
        package: {
          available: true,
          filename: metadata.filename,
          sizeBytes: metadata.sizeBytes,
          sha256: metadata.sha256,
          packagedAt: metadata.packagedAt,
          rebuilt: metadata.rebuilt,
        },
      });
    } catch (error: any) {
      console.error("Extension package metadata error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to load extension package metadata") });
    }
  });

  // Admin-only direct package download for browser extension rollout
  app.get("/api/admin/extension/package", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const forceBuild = String(req.query?.fresh || req.query?.rebuild || "").toLowerCase() === "1";
      const metadata = await getExtensionPackageMetadata(forceBuild);
      if (!metadata) {
        return res.status(404).json({
          message:
            "Extension package is unavailable. Run `npm run package:extension` to generate dist/edge-acp-autofill.zip.",
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
    } catch (error: any) {
      console.error("Extension package lookup error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to prepare extension package") });
    }
  });

  // Get service users list for extension dropdown
  app.get("/api/extension/service-users", requireAuth, async (req: any, res) => {
    try {
      const serviceUsers = await storage.getAllAnalyzedServiceUsers();

      const users = serviceUsers.map((su: AnalyzedServiceUser) => {
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
          riskAssessmentId: metadata.riskAssessmentId
        };
      });

      return res.json({ users });
    } catch (error: any) {
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
    } catch (error: any) {
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
    } catch (error: any) {
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
    } catch (error: any) {
      console.error("Extension care plan error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to get care plan") });
    }
  });

  // Get recent assessments for extension quick access
  app.get("/api/extension/recent", requireAuth, async (req: any, res) => {
    try {
      const [recentRiskLogs, recentServiceUsers] = await Promise.all([
        storage.getAllRiskAssessmentLogs(),
        storage.getAllAnalyzedServiceUsers()
      ]);

      const recentPlans = recentServiceUsers
        .filter((su: AnalyzedServiceUser) => {
          const metadata = (su.metadata || {}) as Record<string, any>;
          return !!metadata.enhancedPlan;
        })
        .sort((a: AnalyzedServiceUser, b: AnalyzedServiceUser) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
        .slice(0, 5)
        .map((su: AnalyzedServiceUser) => ({
          id: su.id,
          name: su.serviceUserName,
          type: "carePlan" as const,
          updatedAt: su.updatedAt
        }));

      const recentRisks = recentRiskLogs.slice(0, 5).map((log: RiskAssessmentLog) => ({
        id: log.id,
        name: log.serviceUserInitials,
        type: "riskAssessment" as const,
        updatedAt: log.createdAt
      }));

      return res.json({
        carePlans: recentPlans,
        riskAssessments: recentRisks
      });
    } catch (error: any) {
      console.error("Extension recent error:", error);
      return res.status(500).json({ message: safeErrorMessage(error, "Failed to get recent items") });
    }
  });
}
