#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const sourceDir = path.resolve(rootDir, "extension", "edge-acp-autofill");
const distDir = path.resolve(rootDir, "dist");
const outputPath = path.resolve(distDir, "edge-acp-autofill.zip");
const tempOutputPath = `${outputPath}.tmp`;
const crxOutputPath = path.resolve(distDir, "edge-acp-autofill.crx");
const keyPath = path.resolve(distDir, "extension-key.pem");
const cliArgs = new Set(process.argv.slice(2));
const requireCrx = cliArgs.has("--require-crx") || process.env.CA_EXTENSION_REQUIRE_CRX === "1";

// Chromium places the .crx and .pem next to the source directory by default
const chromiumCrxPath = path.resolve(path.dirname(sourceDir), "edge-acp-autofill.crx");
const chromiumPemPath = path.resolve(path.dirname(sourceDir), "edge-acp-autofill.pem");

const excludedPatterns = [
  "CHANGELOG.md",
  "TESTING-PLAN-ENHANCER.md",
  "popup-old.js",
  "test-*.js",
  "__pycache__/*",
  ".DS_Store",
];

function normalizePath(value) {
  return String(value || "").replace(/^\.\//, "");
}

function buildCrxUnavailableResult(reason, message) {
  return {
    available: false,
    reason,
    message,
  };
}

async function ensurePathExists(baseDir, relativePath) {
  const resolved = path.resolve(baseDir, relativePath);
  await fs.access(resolved);
}

function collectManifestPaths(manifest) {
  const paths = new Set();

  if (manifest?.background?.service_worker) {
    paths.add(normalizePath(manifest.background.service_worker));
  }

  if (manifest?.action?.default_popup) {
    paths.add(normalizePath(manifest.action.default_popup));
  }

  for (const iconPath of Object.values(manifest?.icons || {})) {
    paths.add(normalizePath(iconPath));
  }

  for (const iconPath of Object.values(manifest?.action?.default_icon || {})) {
    paths.add(normalizePath(iconPath));
  }

  for (const contentScript of manifest?.content_scripts || []) {
    for (const jsPath of contentScript?.js || []) {
      paths.add(normalizePath(jsPath));
    }
    for (const cssPath of contentScript?.css || []) {
      paths.add(normalizePath(cssPath));
    }
  }

  for (const resourceBlock of manifest?.web_accessible_resources || []) {
    for (const resource of resourceBlock?.resources || []) {
      if (!resource.includes("*")) {
        paths.add(normalizePath(resource));
      }
    }
  }

  return Array.from(paths).filter(Boolean);
}

async function validateManifest() {
  const manifestPath = path.resolve(sourceDir, "manifest.json");
  const manifestRaw = await fs.readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestRaw);

  if (!manifest?.manifest_version || !manifest?.name || !manifest?.version) {
    throw new Error("Extension manifest is missing required metadata.");
  }

  const requiredPaths = ["manifest.json", ...collectManifestPaths(manifest)];
  await Promise.all(requiredPaths.map((relativePath) => ensurePathExists(sourceDir, relativePath)));

  return manifest;
}

async function findChromiumBin() {
  const isWindows = process.platform === "win32";
  const locateCmd = isWindows ? "where" : "which";
  const candidates = isWindows
    ? ["chrome", "chromium", "google-chrome"]
    : ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"];
  for (const bin of candidates) {
    try {
      await execFileAsync(locateCmd, [bin], { timeout: 5000 });
      return bin;
    } catch {
      // Try next candidate.
    }
  }
  return null;
}

async function buildCrx() {
  const chromiumBin = await findChromiumBin();
  if (!chromiumBin) {
    if (requireCrx) {
      throw new Error("Chromium was not found, so the required .crx package could not be built.");
    }
    return buildCrxUnavailableResult(
      "chromium-not-found",
      "CRX build skipped because Chromium is not installed in this environment."
    );
  }

  await fs.unlink(chromiumCrxPath).catch(() => {});
  await fs.unlink(crxOutputPath).catch(() => {});

  const args = [`--pack-extension=${sourceDir}`, "--no-sandbox"];

  let keyExists = false;
  try {
    await fs.access(keyPath);
    keyExists = true;
  } catch {
    // Key does not exist yet; Chromium will generate one.
  }

  if (keyExists) {
    args.push(`--pack-extension-key=${keyPath}`);
  }

  try {
    await execFileAsync(chromiumBin, args, { timeout: 60000 });

    // Move Chromium's output from the extension parent directory into dist/.
    await fs.rename(chromiumCrxPath, crxOutputPath);

    if (!keyExists) {
      // Persist the generated key so future runs produce the same extension ID.
      await fs.rename(chromiumPemPath, keyPath).catch(() => {});
    }

    // Clean up any stray .pem left next to the source directory.
    await fs.unlink(chromiumPemPath).catch(() => {});

    const stats = await fs.stat(crxOutputPath);
    return {
      available: true,
      outputPath: crxOutputPath,
      sizeBytes: stats.size,
      packagedAt: stats.mtime.toISOString(),
    };
  } catch (error) {
    await fs.unlink(chromiumCrxPath).catch(() => {});
    await fs.unlink(crxOutputPath).catch(() => {});
    await fs.unlink(chromiumPemPath).catch(() => {});

    const message = error instanceof Error ? error.message : String(error);
    if (requireCrx) {
      throw new Error(`Chromium failed to build the required .crx package: ${message}`);
    }

    return buildCrxUnavailableResult(
      "crx-build-failed",
      `CRX build skipped after a Chromium packaging failure: ${message}`
    );
  }
}

async function buildArchive() {
  await validateManifest();
  await fs.mkdir(distDir, { recursive: true });
  await fs.unlink(tempOutputPath).catch(() => {});
  await fs.unlink(outputPath).catch(() => {});

  const zipArgs = ["-rq", tempOutputPath, ".", "-x", ...excludedPatterns];
  await execFileAsync("zip", zipArgs, {
    cwd: sourceDir,
    timeout: 120000,
  });

  await fs.rename(tempOutputPath, outputPath);
  const zipStats = await fs.stat(outputPath);

  const crxResult = await buildCrx();

  console.log(JSON.stringify({
    zip: {
      outputPath,
      sizeBytes: zipStats.size,
      packagedAt: zipStats.mtime.toISOString(),
    },
    crx: crxResult,
  }));
}

buildArchive().catch(async (error) => {
  await fs.unlink(tempOutputPath).catch(() => {});
  await fs.unlink(chromiumCrxPath).catch(() => {});
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});