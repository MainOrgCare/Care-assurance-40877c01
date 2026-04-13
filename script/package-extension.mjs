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
  const stats = await fs.stat(outputPath);

  console.log(JSON.stringify({
    outputPath,
    sizeBytes: stats.size,
    packagedAt: stats.mtime.toISOString(),
  }));
}

buildArchive().catch(async (error) => {
  await fs.unlink(tempOutputPath).catch(() => {});
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});