/**
 * backup.js — Settings export / import (v0.9.1)
 *
 * Lets an operator snapshot their extension preferences to a JSON file and
 * restore them later or on another machine. Pure helpers (buildSettingsExport,
 * parseSettingsImport) are unit-tested with no DOM/chrome dependency.
 *
 * Only non-sensitive preference data is included — never payloads, signatures,
 * service-user data, queue state or credentials.
 */

import { STORAGE_KEYS, loadStorage, setStorage } from "./state.js";

export const BACKUP_APP_ID = "care-assurance-extension";
export const BACKUP_KIND = "settings-backup";
export const BACKUP_VERSION = 1;

/**
 * Whitelist of preference keys that may be exported/imported, with validators.
 * Anything not listed here is ignored on import.
 */
export const BACKUP_FIELDS = {
  dryRun: { key: () => STORAGE_KEYS.dryRun, validate: (v) => typeof v === "boolean" },
  autoSubmit: { key: () => STORAGE_KEYS.autoSubmit, validate: (v) => typeof v === "boolean" },
  interactionMode: {
    key: () => STORAGE_KEYS.interactionMode,
    validate: (v) => ["auto", "fast", "realistic", "manual"].includes(v),
  },
  appTheme: {
    key: () => STORAGE_KEYS.appTheme,
    validate: (v) => ["light", "sunrise", "dark", "midnight", "ocean", "aurora"].includes(v),
  },
  serverUrl: { key: () => STORAGE_KEYS.serverUrl, validate: (v) => typeof v === "string" && v.length <= 200 },
  displayNameOverride: {
    key: () => STORAGE_KEYS.displayNameOverride,
    validate: (v) => typeof v === "string" && v.length <= 120,
  },
  paletteRecent: {
    key: () => STORAGE_KEYS.paletteRecent,
    validate: (v) => Array.isArray(v) && v.every((s) => typeof s === "string") && v.length <= 16,
  },
};

/**
 * Build an export envelope from a flat settings object (pure). Only whitelisted,
 * valid, non-undefined fields are included.
 * @param {object} settings { dryRun, autoSubmit, ... }
 * @param {{ now?: string, version?: string }} [meta]
 */
export function buildSettingsExport(settings, meta = {}) {
  const out = {};
  for (const [name, spec] of Object.entries(BACKUP_FIELDS)) {
    const value = settings?.[name];
    if (value !== undefined && value !== null && spec.validate(value)) {
      out[name] = value;
    }
  }
  return {
    app: BACKUP_APP_ID,
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    exportedAt: meta.now || new Date().toISOString(),
    extensionVersion: meta.version || null,
    settings: out,
  };
}

/**
 * Parse + validate an imported backup string (pure).
 * @param {string} text raw file contents
 * @returns {{ ok: boolean, settings?: object, count?: number, error?: string }}
 */
export function parseSettingsImport(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "File is not valid JSON." };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "Backup file is empty or malformed." };
  }
  if (parsed.app !== BACKUP_APP_ID || parsed.kind !== BACKUP_KIND) {
    return { ok: false, error: "Not a Care Assurance settings backup." };
  }
  const raw = parsed.settings && typeof parsed.settings === "object" ? parsed.settings : {};
  const settings = {};
  for (const [name, spec] of Object.entries(BACKUP_FIELDS)) {
    if (raw[name] !== undefined && spec.validate(raw[name])) {
      settings[name] = raw[name];
    }
  }
  const count = Object.keys(settings).length;
  if (count === 0) {
    return { ok: false, error: "No recognised settings found in the backup." };
  }
  return { ok: true, settings, count };
}

/** Map a validated settings object to a storage patch (pure). */
export function settingsToStoragePatch(settings) {
  const patch = {};
  for (const [name, spec] of Object.entries(BACKUP_FIELDS)) {
    if (settings?.[name] !== undefined) patch[spec.key()] = settings[name];
  }
  return patch;
}

// ───────────────────────────────────────────────────────────────────────────
// DOM / storage integration
// ───────────────────────────────────────────────────────────────────────────

/** Read the current backup-eligible settings out of storage. */
export async function loadCurrentSettings() {
  const keys = Object.values(BACKUP_FIELDS).map((s) => s.key());
  const data = await loadStorage(keys);
  const settings = {};
  for (const [name, spec] of Object.entries(BACKUP_FIELDS)) {
    const value = data?.[spec.key()];
    if (value !== undefined && value !== null) settings[name] = value;
  }
  return settings;
}

/** Trigger a JSON file download of the current settings. Returns the envelope. */
export async function exportSettingsToFile(meta = {}) {
  const settings = await loadCurrentSettings();
  const envelope = buildSettingsExport(settings, meta);
  const json = JSON.stringify(envelope, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const a = document.createElement("a");
  a.href = url;
  a.download = `care-assurance-settings-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return envelope;
}

/**
 * Read + validate + apply a settings backup file to storage.
 * @returns {Promise<{ ok: boolean, count?: number, error?: string }>}
 */
export async function importSettingsFromFile(file) {
  if (!file) return { ok: false, error: "No file selected." };
  let text;
  try {
    text = await file.text();
  } catch {
    return { ok: false, error: "Could not read the selected file." };
  }
  const result = parseSettingsImport(text);
  if (!result.ok) return result;
  try {
    await setStorage(settingsToStoragePatch(result.settings));
  } catch {
    return { ok: false, error: "Could not save the imported settings." };
  }
  return { ok: true, count: result.count, settings: result.settings };
}
